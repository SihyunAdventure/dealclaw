import type { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

/**
 * SES → SNS 알림 수신. SNS가 엔드포인트로 바로 POST한다.
 * URL path에 공유 비밀을 포함해 인증 (HIB_SES_WEBHOOK_TOKEN).
 * 첫 구독 시 SNS는 SubscriptionConfirmation 메시지를 보내며,
 * 본 핸들러는 SubscribeURL을 GET 하여 자동 확인한다.
 *
 * 운영 주의: 완전한 SNS 서명 검증은 추후 추가(TODO).
 * 현재는 path-token + timing-safe compare 만.
 */

interface SnsEnvelope {
  Type: "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation";
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
}

interface BounceEvent {
  notificationType: "Bounce";
  bounce: {
    bounceType: "Permanent" | "Transient" | "Undetermined";
    bounceSubType?: string;
    bouncedRecipients: Array<{ emailAddress: string; diagnosticCode?: string }>;
    timestamp: string;
  };
  mail: { source: string; destination: string[] };
}

interface ComplaintEvent {
  notificationType: "Complaint";
  complaint: {
    complainedRecipients: Array<{ emailAddress: string }>;
    complaintFeedbackType?: string;
    timestamp: string;
  };
  mail: { source: string; destination: string[] };
}

type SesEvent = BounceEvent | ComplaintEvent | { notificationType: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function markUnsubscribed(
  db: ReturnType<typeof drizzle>,
  emails: string[],
  reason: string,
) {
  if (emails.length === 0) return;
  const now = new Date();
  await db
    .update(schema.subscriptions)
    .set({
      status: "unsubscribed",
      unsubscribedAt: now,
      unsubscribedReason: reason,
    })
    .where(inArray(schema.subscriptions.email, emails));
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const expected = process.env.HIB_SES_WEBHOOK_TOKEN;

  if (!expected) {
    console.error("[ses-webhook] HIB_SES_WEBHOOK_TOKEN 미설정");
    return new Response("misconfigured", { status: 500 });
  }

  if (!timingSafeEqual(token, expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const bodyText = await request.text();
  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(bodyText);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (envelope.Type === "SubscriptionConfirmation") {
    if (!envelope.SubscribeURL) {
      return new Response("missing SubscribeURL", { status: 400 });
    }
    try {
      const res = await fetch(envelope.SubscribeURL);
      console.log(
        `[ses-webhook] SubscriptionConfirmation: ${res.status} ${envelope.TopicArn}`,
      );
      return new Response("confirmed", { status: 200 });
    } catch (err) {
      console.error("[ses-webhook] confirm fetch 실패:", err);
      return new Response("confirm failed", { status: 502 });
    }
  }

  if (envelope.Type !== "Notification") {
    return new Response("ignored", { status: 200 });
  }

  let event: SesEvent;
  try {
    event = JSON.parse(envelope.Message);
  } catch {
    return new Response("bad message", { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  if (event.notificationType === "Bounce") {
    const bounce = (event as BounceEvent).bounce;
    const isPermanent = bounce.bounceType === "Permanent";
    if (!isPermanent) {
      // Transient/Undetermined는 즉시 해지하지 않음 (재시도 케이스)
      return new Response("transient bounce ignored", { status: 200 });
    }
    const emails = bounce.bouncedRecipients.map((r) => r.emailAddress.toLowerCase());
    await markUnsubscribed(
      db,
      emails,
      `bounce:${bounce.bounceSubType || "permanent"}`,
    );
    return new Response(`bounce: ${emails.length} unsubscribed`, { status: 200 });
  }

  if (event.notificationType === "Complaint") {
    const complaint = (event as ComplaintEvent).complaint;
    const emails = complaint.complainedRecipients.map((r) =>
      r.emailAddress.toLowerCase(),
    );
    await markUnsubscribed(
      db,
      emails,
      `complaint:${complaint.complaintFeedbackType || "abuse"}`,
    );
    return new Response(`complaint: ${emails.length} unsubscribed`, {
      status: 200,
    });
  }

  return new Response("unknown notification type", { status: 200 });
}

// SNS가 HEAD로 엔드포인트 확인 시 200 응답
export async function HEAD() {
  return new Response(null, { status: 200 });
}
