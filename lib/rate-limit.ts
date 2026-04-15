import { eq, and, gte, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

/**
 * rate_limits 테이블 기반 hourly fixed-window.
 * key/scope 조합 단위로 count를 증가시키고, windowStart가 1시간 지나면 리셋.
 * 분산 환경에서 완벽한 원자성은 아니지만 SES 스팸 방지용으로는 충분.
 */

const WINDOW_MS = 60 * 60 * 1000;

export interface RateLimitOptions {
  key: string;
  scope: string;
  limit: number;
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL 미설정");
  return drizzle(neon(dbUrl), { schema });
}

export async function checkAndBump(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const db = getDb();
  const now = new Date();
  const windowMs = options.windowMs ?? WINDOW_MS;
  const windowCutoff = new Date(now.getTime() - windowMs);

  const existing = await db
    .select()
    .from(schema.rateLimits)
    .where(
      and(
        eq(schema.rateLimits.key, options.key),
        eq(schema.rateLimits.scope, options.scope),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.rateLimits).values({
      key: options.key,
      scope: options.scope,
      count: 1,
      windowStart: now,
    });
    return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
  }

  const row = existing[0];

  // 윈도우 만료 → 리셋
  if (row.windowStart < windowCutoff) {
    await db
      .update(schema.rateLimits)
      .set({ count: 1, windowStart: now })
      .where(eq(schema.rateLimits.id, row.id));
    return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
  }

  // 윈도우 내 — 한도 체크
  if (row.count >= options.limit) {
    const retryAfterMs = Math.max(
      0,
      row.windowStart.getTime() + windowMs - now.getTime(),
    );
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  await db
    .update(schema.rateLimits)
    .set({ count: sql`${schema.rateLimits.count} + 1` })
    .where(eq(schema.rateLimits.id, row.id));

  return {
    allowed: true,
    remaining: options.limit - row.count - 1,
    retryAfterMs: 0,
  };
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
