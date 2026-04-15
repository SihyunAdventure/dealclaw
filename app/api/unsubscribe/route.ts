import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

/**
 * POST /api/unsubscribe  body: { token }
 * RFC 8058 one-click unsubscribe 대응: 메일 헤더 List-Unsubscribe-Post
 * 가 POST로 이 엔드포인트를 호출. 토큰 유효 시 즉시 해지.
 *
 * GET /api/unsubscribe?token=X 도 허용 — 하지만 실제 해지는 POST로만.
 * GET은 확인 페이지(/unsubscribe)로 리다이렉트.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let token = "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      token = typeof body.token === "string" ? body.token : "";
    } catch {
      return Response.json({ error: "bad_json" }, { status: 400 });
    }
  } else {
    // RFC 8058: List-Unsubscribe=One-Click
    // 본문은 "List-Unsubscribe=One-Click" 고정, 토큰은 URL query
    token = request.nextUrl.searchParams.get("token") || "";
  }

  if (!token || token.length < 32) {
    return Response.json({ error: "invalid_token" }, { status: 400 });
  }

  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

  const rows = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.verifyToken, token))
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ state: "not_found" }, { status: 404 });
  }

  const row = rows[0];

  if (row.status === "unsubscribed") {
    return Response.json({ state: "already_unsubscribed" });
  }

  await db
    .update(schema.subscriptions)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      unsubscribedReason: "user_request",
    })
    .where(eq(schema.subscriptions.id, row.id));

  return Response.json({ state: "unsubscribed" });
}
