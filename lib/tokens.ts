import { randomBytes, timingSafeEqual as nodeTimingSafe } from "node:crypto";

/**
 * URL-safe 랜덤 토큰. 기본 32바이트 = hex 64자.
 * 인증/해지 링크에 사용. 충돌 확률 2^-256.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** 토큰 비교는 반드시 timing-safe. */
export function safeCompareToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return nodeTimingSafe(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
