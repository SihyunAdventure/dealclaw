import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

/**
 * GET /api/verify?token=XXX
 * 토큰 검증 후 status=active, verifiedAt 기록.
 * 성공 후 verifyToken을 rotate — 해지용으로 새 토큰 발급 (단회성).
 * /verify 페이지에서 내부 호출 또는 이메일 링크 직접 클릭 시 리다이렉트 처리.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
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
    return Response.json({ state: "unsubscribed" }, { status: 410 });
  }

  if (row.status === "active") {
    // 이미 활성 — 기존 토큰 그대로 반환 (해지용으로 재사용)
    return Response.json({
      state: "already_active",
      collection: row.collection,
      manageToken: row.verifyToken,
    });
  }

  const newToken = generateToken();
  await db
    .update(schema.subscriptions)
    .set({
      status: "active",
      verifiedAt: new Date(),
      verifyToken: newToken,
    })
    .where(eq(schema.subscriptions.id, row.id));

  return Response.json({
    state: "verified",
    collection: row.collection,
    manageToken: newToken,
  });
}
