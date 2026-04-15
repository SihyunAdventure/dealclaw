/**
 * 신규 최저가 감지 정책.
 *
 * 목표: 노이즈(1원 변동, 다른 용량 상품이 1위 올라옴)를 걸러내고
 * 사용자에게 의미 있는 가격 하락만 알림으로 보낸다.
 *
 * 정책 (AND):
 *   1. 14일 내 최저가 대비 3% 이상 하락
 *   2. 14일 최저 상품(topCoupangId)과 동일 상품이거나, 없으면 신상품 최저
 *   3. 구독자별 24h 쿨다운 (스팸 방지)
 *
 * 퍼스트런(히스토리 없음)에는 알림하지 않는다 — 베이스라인 수립 후 다음 크롤부터.
 */

export interface PriceHistoryPoint {
  minSalePrice: number;
  minUnitPrice: number | null;
  topCoupangId: string | null;
  crawledAt: Date;
}

export interface CurrentCrawl {
  collection: string;
  minSalePrice: number;
  minUnitPrice: number | null;
  topCoupangId: string | null;
}

export type DetectionReason =
  | "first_run"
  | "no_price_data"
  | "threshold_not_met"
  | "same_product_new_low"
  | "new_product_new_low"
  | "cooldown";

export interface DetectionResult {
  shouldAlert: boolean;
  reason: DetectionReason;
  windowMin: number | null;
  windowMinCoupangId: string | null;
  dropRate: number;
}

export const DETECTION_CONFIG = {
  windowDays: 14,
  dropThreshold: 0.03,
  cooldownMs: 24 * 60 * 60 * 1000,
} as const;

/**
 * 가격 벡터 선택: unitPrice 우선, 없으면 salePrice.
 * 크롤 히스토리와 현재값 모두 같은 metric으로 비교해야 하므로 둘 다 체크.
 */
function pickMetric(
  history: PriceHistoryPoint[],
  current: CurrentCrawl,
): {
  useUnit: boolean;
  currentValue: number | null;
  historyValues: Array<{ value: number; coupangId: string | null }>;
} {
  const historyHasUnit = history.some((h) => h.minUnitPrice !== null);
  const currentHasUnit = current.minUnitPrice !== null;

  if (historyHasUnit && currentHasUnit) {
    return {
      useUnit: true,
      currentValue: current.minUnitPrice,
      historyValues: history
        .filter((h) => h.minUnitPrice !== null)
        .map((h) => ({ value: h.minUnitPrice!, coupangId: h.topCoupangId })),
    };
  }
  return {
    useUnit: false,
    currentValue: current.minSalePrice,
    historyValues: history.map((h) => ({
      value: h.minSalePrice,
      coupangId: h.topCoupangId,
    })),
  };
}

/**
 * 신규 최저가 판정. 구독자별 쿨다운은 detectForSubscriber 에서 체크.
 */
export function detectNewLow(
  current: CurrentCrawl,
  history: PriceHistoryPoint[],
  now: Date = new Date(),
): DetectionResult {
  const cutoff = now.getTime() - DETECTION_CONFIG.windowDays * 86_400_000;
  const recentHistory = history.filter((h) => h.crawledAt.getTime() >= cutoff);

  if (recentHistory.length === 0) {
    return {
      shouldAlert: false,
      reason: "first_run",
      windowMin: null,
      windowMinCoupangId: null,
      dropRate: 0,
    };
  }

  const metric = pickMetric(recentHistory, current);

  if (metric.currentValue === null || metric.historyValues.length === 0) {
    return {
      shouldAlert: false,
      reason: "no_price_data",
      windowMin: null,
      windowMinCoupangId: null,
      dropRate: 0,
    };
  }

  const windowMinEntry = metric.historyValues.reduce((min, cur) =>
    cur.value < min.value ? cur : min,
  );
  const windowMin = windowMinEntry.value;
  const windowMinCoupangId = windowMinEntry.coupangId;

  const dropRate = windowMin > 0 ? (windowMin - metric.currentValue) / windowMin : 0;

  if (dropRate < DETECTION_CONFIG.dropThreshold) {
    return {
      shouldAlert: false,
      reason: "threshold_not_met",
      windowMin,
      windowMinCoupangId,
      dropRate,
    };
  }

  const sameProduct =
    current.topCoupangId !== null &&
    windowMinCoupangId !== null &&
    current.topCoupangId === windowMinCoupangId;

  return {
    shouldAlert: true,
    reason: sameProduct ? "same_product_new_low" : "new_product_new_low",
    windowMin,
    windowMinCoupangId,
    dropRate,
  };
}

/**
 * 특정 구독자에게 발송할지 결정 (24h 쿨다운 포함).
 */
export function shouldNotifySubscriber(
  detection: DetectionResult,
  lastNotifiedAt: Date | null,
  now: Date = new Date(),
): { notify: boolean; reason: DetectionReason } {
  if (!detection.shouldAlert) {
    return { notify: false, reason: detection.reason };
  }

  if (
    lastNotifiedAt &&
    now.getTime() - lastNotifiedAt.getTime() < DETECTION_CONFIG.cooldownMs
  ) {
    return { notify: false, reason: "cooldown" };
  }

  return { notify: true, reason: detection.reason };
}
