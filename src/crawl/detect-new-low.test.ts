import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectNewLow,
  shouldNotifySubscriber,
  DETECTION_CONFIG,
  type PriceHistoryPoint,
  type CurrentCrawl,
} from "./detect-new-low";

const NOW = new Date("2026-04-15T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function ph(
  minSalePrice: number,
  minUnitPrice: number | null,
  topCoupangId: string | null,
  crawledAt: Date,
): PriceHistoryPoint {
  return { minSalePrice, minUnitPrice, topCoupangId, crawledAt };
}

test("first_run: 히스토리 비어있으면 알림 없음", () => {
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9000,
    minUnitPrice: 900,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, [], NOW);
  assert.equal(result.shouldAlert, false);
  assert.equal(result.reason, "first_run");
});

test("threshold_not_met: 1원 변동은 스팸 — 알림 안 감", () => {
  const history = [ph(10000, 1000, "A", daysAgo(1))];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9999,
    minUnitPrice: 999,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.shouldAlert, false);
  assert.equal(result.reason, "threshold_not_met");
});

test("threshold_not_met: 2% 하락 - 임계 미달", () => {
  const history = [ph(10000, 1000, "A", daysAgo(2))];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9800,
    minUnitPrice: 980,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.shouldAlert, false);
});

test("same_product_new_low: 동일 상품 3% 이상 하락 → 알림", () => {
  const history = [ph(10000, 1000, "A", daysAgo(3))];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9500,
    minUnitPrice: 950,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.shouldAlert, true);
  assert.equal(result.reason, "same_product_new_low");
  assert.ok(result.dropRate >= DETECTION_CONFIG.dropThreshold);
});

test("new_product_new_low: 다른 상품이 최저 갱신 → 알림 (reason 구분)", () => {
  const history = [ph(10000, 1000, "A", daysAgo(5))];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9000,
    minUnitPrice: 900,
    topCoupangId: "B",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.shouldAlert, true);
  assert.equal(result.reason, "new_product_new_low");
});

test("window: 14일 경계 밖 데이터는 무시 (더 낮은 가격이 있어도 first_run 처리)", () => {
  const history = [
    ph(5000, 500, "A", daysAgo(30)),
    ph(5000, 500, "A", daysAgo(15)),
  ];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 10000,
    minUnitPrice: 1000,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.reason, "first_run");
});

test("unit price 우선: 히스토리/현재 모두 unit 있으면 unit 기준 비교", () => {
  // unitPrice 기준으로는 3% 이상, salePrice 기준으로는 2% — unit 기준이 맞아야 알림
  const history = [ph(10000, 1000, "A", daysAgo(2))];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9800,
    minUnitPrice: 960,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.shouldAlert, true);
});

test("no_price_data: 히스토리에 unit 있고 현재만 unit 없으면 salePrice fallback", () => {
  const history = [ph(10000, 1000, "A", daysAgo(2))];
  const current: CurrentCrawl = {
    collection: "sunscreen",
    minSalePrice: 9500,
    minUnitPrice: null,
    topCoupangId: "A",
  };
  const result = detectNewLow(current, history, NOW);
  assert.equal(result.shouldAlert, true);
  assert.equal(result.reason, "same_product_new_low");
});

test("cooldown: 24h 내 발송된 구독자는 skip", () => {
  const detection = detectNewLow(
    {
      collection: "sunscreen",
      minSalePrice: 9500,
      minUnitPrice: 950,
      topCoupangId: "A",
    },
    [ph(10000, 1000, "A", daysAgo(2))],
    NOW,
  );
  const result = shouldNotifySubscriber(
    detection,
    new Date(NOW.getTime() - 60 * 60 * 1000),
    NOW,
  );
  assert.equal(result.notify, false);
  assert.equal(result.reason, "cooldown");
});

test("cooldown 경과: 24h 지난 구독자는 발송", () => {
  const detection = detectNewLow(
    {
      collection: "sunscreen",
      minSalePrice: 9500,
      minUnitPrice: 950,
      topCoupangId: "A",
    },
    [ph(10000, 1000, "A", daysAgo(2))],
    NOW,
  );
  const result = shouldNotifySubscriber(
    detection,
    new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
    NOW,
  );
  assert.equal(result.notify, true);
});

test("lastNotifiedAt이 null이면 쿨다운 없음 → 발송", () => {
  const detection = detectNewLow(
    {
      collection: "sunscreen",
      minSalePrice: 9500,
      minUnitPrice: 950,
      topCoupangId: "A",
    },
    [ph(10000, 1000, "A", daysAgo(2))],
    NOW,
  );
  const result = shouldNotifySubscriber(detection, null, NOW);
  assert.equal(result.notify, true);
});
