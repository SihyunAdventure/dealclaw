import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { collections } from "@/src/data/collections";
import { generateToken } from "@/lib/tokens";
import { checkAndBump, getClientIp } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/ses";
import { verificationEmail } from "@/lib/email/templates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubscribeBody {
  email?: unknown;
  collection?: unknown;
  consent?: unknown;
}

function siteUrl(): string {
  return process.env.SITE_URL || "https://hotinbeauty.com";
}

export async function POST(request: NextRequest) {
  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const collection =
    typeof body.collection === "string" ? body.collection : "";
  const consent = body.consent === true;

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!collections.some((c) => c.slug === collection)) {
    return Response.json({ error: "invalid_collection" }, { status: 400 });
  }
  if (!consent) {
    return Response.json({ error: "consent_required" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const col = collections.find((c) => c.slug === collection)!;
  const token = generateToken();
  const now = new Date();

  try {
    const ipLimit = await checkAndBump({
      key: `ip:${ip}`,
      scope: "subscribe",
      limit: 5,
    });
    if (!ipLimit.allowed) {
      return Response.json(
        { error: "rate_limited", retryAfterMs: ipLimit.retryAfterMs },
        { status: 429 },
      );
    }

    const emailLimit = await checkAndBump({
      key: `email:${email}`,
      scope: "subscribe",
      limit: 1,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      return Response.json(
        { error: "email_rate_limited", retryAfterMs: emailLimit.retryAfterMs },
        { status: 429 },
      );
    }

    const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

    // 원자적 upsert — 기존 active 행은 손대지 않고 응답
    const upsert = await db.execute<{
      status: string;
      verify_token: string;
    }>(sql`
      INSERT INTO subscriptions
        (email, collection, status, verify_token, consent_at, consent_ip)
      VALUES
        (${email}, ${collection}, 'pending', ${token}, ${now}, ${ip})
      ON CONFLICT (email, collection) DO UPDATE SET
        status = CASE
          WHEN subscriptions.status = 'active' THEN 'active'
          ELSE 'pending'
        END,
        verify_token = CASE
          WHEN subscriptions.status = 'active' THEN subscriptions.verify_token
          ELSE EXCLUDED.verify_token
        END,
        consent_at = CASE
          WHEN subscriptions.status = 'active' THEN subscriptions.consent_at
          ELSE EXCLUDED.consent_at
        END,
        consent_ip = CASE
          WHEN subscriptions.status = 'active' THEN subscriptions.consent_ip
          ELSE EXCLUDED.consent_ip
        END,
        unsubscribed_at = CASE
          WHEN subscriptions.status = 'active' THEN subscriptions.unsubscribed_at
          ELSE NULL
        END,
        unsubscribed_reason = CASE
          WHEN subscriptions.status = 'active' THEN subscriptions.unsubscribed_reason
          ELSE NULL
        END
      RETURNING status, verify_token
    `);

    const row = Array.isArray(upsert)
      ? upsert[0]
      : (upsert as { rows?: Array<{ status: string; verify_token: string }> })
          .rows?.[0];

    if (!row) {
      return Response.json({ error: "internal" }, { status: 500 });
    }

    // 이미 활성 구독이면 메일 발송 생략
    if (row.status === "active") {
      return Response.json({ ok: true, state: "already_active" });
    }

    const effectiveToken = row.verify_token;
    const verifyUrl = `${siteUrl()}/verify?token=${effectiveToken}`;
    const unsubscribeUrl = `${siteUrl()}/unsubscribe?token=${effectiveToken}`;

    const { subject, html } = verificationEmail({
      collection,
      collectionDisplay: col.displayName,
      verifyUrl,
      unsubscribeUrl,
    });

    try {
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      console.error("[subscribe] SES 발송 실패", err);
      return Response.json({ error: "email_send_failed" }, { status: 502 });
    }

    return Response.json({ ok: true, state: "verification_sent" });
  } catch (err) {
    console.error("[subscribe] 내부 오류", err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
