import type { Collection } from "./types";

// listSize는 한 페이지에 노출할 상품 수. 48은 쿠팡 기본값이지만 광고 dedupe 후
// unique productId가 ~34개에 그쳤음 (2026-04-17 측정). 96으로 올리면 호출 수는
// 동일(=봇 탐지 risk 동일)하면서 unique pool이 ~68개로 약 2배.
export const COUPANG_LIST_SIZE = 96;
export const COUPANG_SCHEDULE_START_HOUR_KST = 9;
export const COUPANG_SCHEDULE_END_HOUR_KST = 20;
export const COUPANG_BLOCK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const COUPANG_ESCALATED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const COUPANG_BLOCK_ESCALATION_THRESHOLD = 2;
export const COUPANG_MIN_HEALTHY_PRODUCT_COUNT = 20;
export const COUPANG_MIN_HEALTHY_MEDIAN_RATIO = 0.4;
export const COUPANG_RECENT_SUCCESS_WINDOW = 5;

export interface ProductCountHealth {
  healthy: boolean;
  reason: string | null;
  baselineMedian: number | null;
  minExpectedCount: number;
}

function getKstParts(date: Date): Record<string, string> {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
}

export function getKstHour(date: Date): number {
  return parseInt(getKstParts(date).hour, 10);
}

export function resolveScheduledCollections(
  allCollections: Collection[],
  now: Date = new Date(),
): Collection[] {
  const hour = getKstHour(now);
  return allCollections.filter((collection) => collection.scheduleHourKst === hour);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function evaluateProductCountHealth({
  productCount,
  recentCompletedCounts,
  minAbsoluteCount = COUPANG_MIN_HEALTHY_PRODUCT_COUNT,
  minMedianRatio = COUPANG_MIN_HEALTHY_MEDIAN_RATIO,
}: {
  productCount: number;
  recentCompletedCounts: number[];
  minAbsoluteCount?: number;
  minMedianRatio?: number;
}): ProductCountHealth {
  if (productCount < minAbsoluteCount) {
    return {
      healthy: false,
      reason: `count_below_absolute_threshold:${productCount}<${minAbsoluteCount}`,
      baselineMedian: null,
      minExpectedCount: minAbsoluteCount,
    };
  }

  const baselineMedian = median(recentCompletedCounts);
  if (baselineMedian === null || baselineMedian <= 0) {
    return {
      healthy: true,
      reason: null,
      baselineMedian: null,
      minExpectedCount: minAbsoluteCount,
    };
  }

  const ratioThreshold = Math.max(
    minAbsoluteCount,
    Math.floor(baselineMedian * minMedianRatio),
  );
  if (productCount < ratioThreshold) {
    return {
      healthy: false,
      reason: `count_below_recent_median:${productCount}<${ratioThreshold}`,
      baselineMedian,
      minExpectedCount: ratioThreshold,
    };
  }

  return {
    healthy: true,
    reason: null,
    baselineMedian,
    minExpectedCount: ratioThreshold,
  };
}

export function isLikelyBlockMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "access denied",
    "bot detection",
    "captcha",
    "security verification",
  ].some((needle) => normalized.includes(needle));
}

export function computeCooldownUntil({
  now,
  blockedRuns,
  baseCooldownMs = COUPANG_BLOCK_COOLDOWN_MS,
  escalatedCooldownMs = COUPANG_ESCALATED_COOLDOWN_MS,
  escalationThreshold = COUPANG_BLOCK_ESCALATION_THRESHOLD,
}: {
  now: Date;
  blockedRuns: Date[];
  baseCooldownMs?: number;
  escalatedCooldownMs?: number;
  escalationThreshold?: number;
}): Date | null {
  if (blockedRuns.length === 0) return null;

  const sorted = [...blockedRuns].sort((a, b) => b.getTime() - a.getTime());
  const latestBlockedAt = sorted[0];
  const latestCooldownUntil = new Date(latestBlockedAt.getTime() + baseCooldownMs);

  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentBlockCount = sorted.filter(
    (blockedAt) => blockedAt.getTime() >= sevenDaysAgo,
  ).length;

  if (recentBlockCount >= escalationThreshold) {
    return new Date(latestBlockedAt.getTime() + escalatedCooldownMs);
  }

  return latestCooldownUntil;
}
