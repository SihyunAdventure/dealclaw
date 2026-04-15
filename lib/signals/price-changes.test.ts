import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCoupangScore,
  calculateDropSignal,
  calculateOliveYoungScore,
  getHomeSummary,
  type SourceSignalResult,
} from "@/lib/signals/price-changes";

test("calculateDropSignal returns drop when current price breaks previous minimum", () => {
  const signal = calculateDropSignal(900, [1000, 1100, 1200]);

  assert.equal(signal.referencePrice, 1000);
  assert.equal(signal.dropRate, 10);
});

test("calculateDropSignal returns zero when current price is not below previous minimum", () => {
  const signal = calculateDropSignal(1000, [900, 1100]);

  assert.equal(signal.referencePrice, null);
  assert.equal(signal.dropRate, 0);
});

test("source scores follow the documented formulas", () => {
  assert.equal(calculateCoupangScore(7), 7);
  assert.equal(calculateOliveYoungScore(8, 3), 19);
  assert.equal(calculateOliveYoungScore(null, 4), 4);
});

test("getHomeSummary uses source totals and strongest signal with freshness bias", () => {
  const now = new Date();
  const stale = new Date(Date.now() - 48 * 3_600_000);

  const coupang: SourceSignalResult = {
    source: "coupang",
    totalCount: 5,
    updatedAt: now,
    isStale: false,
    items: [
      {
        source: "coupang",
        productId: "cp-1",
        name: "Fresh Coupang Signal",
        imageUrl: null,
        brand: null,
        collection: "sunscreen",
        currentPrice: 12000,
        referencePrice: 14000,
        dropRate: 14,
        rankDelta: null,
        currentRank: null,
        detailHref: "/p/cp/cp-1",
        updatedAt: now,
        score: 6,
      },
    ],
  };

  const oliveyoung: SourceSignalResult = {
    source: "oliveyoung",
    totalCount: 2,
    updatedAt: stale,
    isStale: true,
    items: [
      {
        source: "oliveyoung",
        productId: "oy-1",
        name: "Older Olive Young Signal",
        imageUrl: null,
        brand: "Brand",
        collection: "essence",
        currentPrice: 22000,
        referencePrice: 25000,
        dropRate: 12,
        rankDelta: 3,
        currentRank: 4,
        detailHref: "/p/oy/oy-1",
        updatedAt: stale,
        score: 7,
      },
    ],
  };

  const summary = getHomeSummary({ coupang, oliveyoung });

  assert.equal(summary.counts.coupang, 5);
  assert.equal(summary.counts.oliveyoung, 2);
  assert.equal(summary.strongestSignal?.productId, "cp-1");
  assert.equal(summary.updatedAt?.getTime(), now.getTime());
});
