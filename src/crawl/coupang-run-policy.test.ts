import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCooldownUntil,
  evaluateProductCountHealth,
  getKstHour,
  isLikelyBlockMessage,
  median,
  resolveScheduledCollections,
} from "./coupang-run-policy";
import type { Collection } from "./types";

const COLLECTIONS: Collection[] = [
  {
    slug: "cleansing-oil",
    query: "클렌징오일",
    displayName: "클렌징오일",
    description: "",
    scheduleHourKst: 9,
  },
  {
    slug: "sunscreen",
    query: "선크림",
    displayName: "선크림",
    description: "",
    scheduleHourKst: 20,
  },
];

test("resolveScheduledCollections: KST hour 슬롯에 맞는 카테고리만 선택", () => {
  const now = new Date("2026-04-16T00:15:00Z"); // 09:15 KST
  const targets = resolveScheduledCollections(COLLECTIONS, now);
  assert.deepEqual(targets.map((target) => target.slug), ["cleansing-oil"]);
  assert.equal(getKstHour(now), 9);
});

test("median: 홀수/짝수 길이 모두 처리", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 9]), 5);
  assert.equal(median([10, 2, 8, 4]), 6);
});

test("evaluateProductCountHealth: 절대 개수 미달이면 비정상", () => {
  const result = evaluateProductCountHealth({
    productCount: 12,
    recentCompletedCounts: [60, 58, 62],
  });
  assert.equal(result.healthy, false);
  assert.match(result.reason ?? "", /absolute_threshold/);
});

test("evaluateProductCountHealth: 최근 중앙값 대비 너무 낮으면 비정상", () => {
  const result = evaluateProductCountHealth({
    productCount: 21,
    recentCompletedCounts: [80, 82, 78, 84, 81],
  });
  assert.equal(result.healthy, false);
  assert.match(result.reason ?? "", /recent_median/);
  assert.equal(result.baselineMedian, 81);
});

test("evaluateProductCountHealth: 최근 기준 안에 들면 정상", () => {
  const result = evaluateProductCountHealth({
    productCount: 34,
    recentCompletedCounts: [60, 58, 62],
  });
  assert.equal(result.healthy, true);
});

test("isLikelyBlockMessage: 차단 관련 문구 감지", () => {
  assert.equal(isLikelyBlockMessage("Coupang access denied — bot detection triggered"), true);
  assert.equal(isLikelyBlockMessage("temporary network error"), false);
});

test("computeCooldownUntil: 최근 차단 1회면 24시간, 2회면 7일", () => {
  const now = new Date("2026-04-16T00:00:00Z");
  const single = computeCooldownUntil({
    now,
    blockedRuns: [new Date("2026-04-15T12:00:00Z")],
  });
  assert.equal(single?.toISOString(), "2026-04-16T12:00:00.000Z");

  const escalated = computeCooldownUntil({
    now,
    blockedRuns: [
      new Date("2026-04-15T12:00:00Z"),
      new Date("2026-04-14T12:00:00Z"),
    ],
  });
  assert.equal(escalated?.toISOString(), "2026-04-22T12:00:00.000Z");
});
