import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

/**
 * rate_limits 테이블 기반 hourly fixed-window.
 * 원자성: INSERT ... ON CONFLICT ... DO UPDATE 단일 statement로
 * 동시 요청 race condition 방지 (eng review #2).
 */

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

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
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const windowCutoff = new Date(now.getTime() - windowMs);

  const rows = await db.execute<{
    count: number | string;
    window_start: string;
  }>(sql`
    INSERT INTO rate_limits (key, scope, count, window_start)
    VALUES (${options.key}, ${options.scope}, 1, ${now})
    ON CONFLICT (key, scope) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < ${windowCutoff} THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < ${windowCutoff} THEN ${now}
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `);

  const row = Array.isArray(rows)
    ? rows[0]
    : (rows as { rows?: Array<{ count: number | string; window_start: string }> }).rows?.[0];
  if (!row) {
    return { allowed: false, remaining: 0, retryAfterMs: windowMs };
  }

  const count = typeof row.count === "string" ? parseInt(row.count, 10) : row.count;
  const windowStartMs = new Date(row.window_start).getTime();

  if (count > options.limit) {
    const retryAfterMs = Math.max(0, windowStartMs + windowMs - now.getTime());
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return {
    allowed: true,
    remaining: options.limit - count,
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
