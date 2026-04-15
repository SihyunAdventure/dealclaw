import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const collection = typeof body.collection === "string" ? body.collection : "";
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

  const col = collections.find((c) => c.slug === collection)!;

  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

  const existing = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.email, email),
        eq(schema.subscriptions.collection, collection),
      ),
    )
    .limit(1);

  const token = generateToken();
  const now = new Date();

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === "active") {
      return Response.json({ ok: true, state: "already_active" });
    }
    // pending 또는 unsubscribed → 재활성화 플로우로 토큰 교체 + consent 갱신
    await db
      .update(schema.subscriptions)
      .set({
        status: "pending",
        verifyToken: token,
        consentAt: now,
        consentIp: ip,
        unsubscribedAt: null,
        unsubscribedReason: null,
      })
      .where(eq(schema.subscriptions.id, row.id));
  } else {
    await db.insert(schema.subscriptions).values({
      email,
      collection,
      status: "pending",
      verifyToken: token,
      consentAt: now,
      consentIp: ip,
    });
  }

  const verifyUrl = `${siteUrl()}/verify?token=${token}`;
  const unsubscribeUrl = `${siteUrl()}/unsubscribe?token=${token}`;

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
}
