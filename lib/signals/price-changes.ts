import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { desc, gte, inArray } from "drizzle-orm";
import { coupangCategories } from "@/src/data/coupang-categories";

export type PriceChangeSource = "oliveyoung" | "coupang";

export interface HomeSignalViewModel {
  source: PriceChangeSource;
  productId: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  collection: string | null;
  currentPrice: number;
  referencePrice: number | null;
  dropRate: number;
  rankDelta: number | null;
  currentRank: number | null;
  detailHref: string;
  updatedAt: Date;
  score: number;
  discountRate: number;
  unitPriceValue: number | null;
  unitPriceText: string | null;
  isRocket: boolean;
  reviewCount: number;
  ratingAverage: number | null;
}

export interface SourceSignalResult {
  source: PriceChangeSource;
  items: HomeSignalViewModel[];
  totalCount: number;
  updatedAt: Date | null;
  isStale: boolean;
}

export interface HomeSummaryViewModel {
  strongestSignal: HomeSignalViewModel | null;
  topSignals: HomeSignalViewModel[];
  counts: Record<PriceChangeSource, number | null>;
  updatedAt: Date | null;
}

const WINDOW_DAYS = 7;
const STALE_AFTER_HOURS = 24;

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  const client = neon(dbUrl);
  return drizzle(client, { schema });
}

function cutoffDate() {
  return new Date(Date.now() - WINDOW_DAYS * 86_400_000);
}

function isStale(updatedAt: Date | null) {
  if (!updatedAt) return false;
  return Date.now() - updatedAt.getTime() > STALE_AFTER_HOURS * 3_600_000;
}

function groupByProductId<T extends { productId: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.productId);
    if (list) {
      list.push(row);
    } else {
      map.set(row.productId, [row]);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => {
      const aTime = (a as { crawledAt?: Date }).crawledAt?.getTime() ?? 0;
      const bTime = (b as { crawledAt?: Date }).crawledAt?.getTime() ?? 0;
      return aTime - bTime;
    });
  }

  return map;
}

export function calculateDropSignal(
  currentPrice: number,
  previousPrices: number[],
): { referencePrice: number | null; dropRate: number } {
  if (previousPrices.length === 0) {
    return { referencePrice: null, dropRate: 0 };
  }

  const referencePrice = Math.min(...previousPrices);
  if (currentPrice >= referencePrice) {
    return { referencePrice: null, dropRate: 0 };
  }

  return {
    referencePrice,
    dropRate: Math.round(((referencePrice - currentPrice) / referencePrice) * 100),
  };
}

export function calculateRankDelta(
  currentRank: number | null,
  previousRanks: Array<number | null>,
): number | null {
  if (currentRank == null) return null;

  const baselineRank = previousRanks.find(
    (rank): rank is number => typeof rank === "number",
  );

  if (baselineRank == null) return null;

  return Math.max(0, baselineRank - currentRank);
}

export function calculateCoupangScore(dropRate: number) {
  return dropRate;
}

export function calculateOliveYoungScore(
  rankDelta: number | null,
  dropRate: number,
) {
  return (rankDelta ?? 0) * 2 + dropRate;
}

export function getFreshnessBonus(updatedAt: Date) {
  return Date.now() - updatedAt.getTime() <= 6 * 3_600_000 ? 2 : 0;
}

function newestDate(dates: Array<Date | null>) {
  const valid = dates.filter((date): date is Date => date instanceof Date);
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((date) => date.getTime())));
}

export function getHomeSummary(input: {
  coupang?: SourceSignalResult | null;
  oliveyoung?: SourceSignalResult | null;
}): HomeSummaryViewModel {
  const counts: Record<PriceChangeSource, number | null> = {
    coupang: input.coupang?.totalCount ?? null,
    oliveyoung: input.oliveyoung?.totalCount ?? null,
  };

  const allItems = [
    ...(input.coupang?.items ?? []),
    ...(input.oliveyoung?.items ?? []),
  ];

  allItems.sort((a, b) => {
    const scoreA = a.score + getFreshnessBonus(a.updatedAt);
    const scoreB = b.score + getFreshnessBonus(b.updatedAt);

    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const topSignals = allItems.slice(0, 3);

  return {
    strongestSignal: topSignals[0] ?? null,
    topSignals,
    counts,
    updatedAt: newestDate([input.coupang?.updatedAt ?? null, input.oliveyoung?.updatedAt ?? null]),
  };
}

export async function getCoupangSignals(limit?: number): Promise<SourceSignalResult> {
  const db = getDb();
  if (!db) {
    return {
      source: "coupang",
      items: [],
      totalCount: 0,
      updatedAt: null,
      isStale: false,
    };
  }

  const [snapshots, products] = await Promise.all([
    db
      .select({
        productId: schema.coupangPriceSnapshots.productId,
        salePrice: schema.coupangPriceSnapshots.salePrice,
        rank: schema.coupangPriceSnapshots.rank,
        crawledAt: schema.coupangPriceSnapshots.crawledAt,
      })
      .from(schema.coupangPriceSnapshots)
      .where(gte(schema.coupangPriceSnapshots.crawledAt, cutoffDate())),
    db.select().from(schema.products)
      .where(inArray(schema.products.collection, coupangCategories.map((c) => c.slug)))
      .orderBy(desc(schema.products.lastCrawledAt)),
  ]);

  const snapshotMap = groupByProductId(snapshots);
  const items: HomeSignalViewModel[] = [];

  for (const product of products) {
    const history = snapshotMap.get(product.id) ?? [];
    const previousSnapshots = history.slice(0, -1);
    const priceSignal = calculateDropSignal(
      product.salePrice,
      previousSnapshots.map((snapshot) => snapshot.salePrice),
    );

    items.push({
      source: "coupang",
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl || null,
      brand: null,
      collection: product.collection,
      currentPrice: product.salePrice,
      referencePrice: priceSignal.referencePrice,
      dropRate: priceSignal.dropRate,
      rankDelta: null,
      currentRank: null,
      detailHref: `/p/cp/${product.coupangId}`,
      updatedAt: product.lastCrawledAt,
      score: calculateCoupangScore(priceSignal.dropRate),
      discountRate: product.discountRate ?? 0,
      unitPriceValue: product.unitPriceValue ?? null,
      unitPriceText: product.unitPriceText ?? null,
      isRocket: product.isRocket ?? false,
      reviewCount: product.reviewCount ?? 0,
      ratingAverage: product.ratingAverage ?? null,
    });
  }

  // Global sort: score (verified drop) first, then vendor discountRate as
  // transitional tiebreaker while price history is sparse.
  items.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.discountRate !== b.discountRate) return b.discountRate - a.discountRate;
    if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    return a.currentPrice - b.currentPrice;
  });

  const updatedAt = products[0]?.lastCrawledAt ?? null;

  return {
    source: "coupang",
    items: limit != null ? items.slice(0, limit) : items,
    totalCount: items.length,
    updatedAt,
    isStale: isStale(updatedAt),
  };
}

export async function getOliveYoungSignals(
  limit = 8,
): Promise<SourceSignalResult> {
  const db = getDb();
  if (!db) {
    return {
      source: "oliveyoung",
      items: [],
      totalCount: 0,
      updatedAt: null,
      isStale: false,
    };
  }

  const [snapshots, products] = await Promise.all([
    db
      .select({
        productId: schema.oliveyoungRankingSnapshots.productId,
        salePrice: schema.oliveyoungRankingSnapshots.salePrice,
        rank: schema.oliveyoungRankingSnapshots.rank,
        crawledAt: schema.oliveyoungRankingSnapshots.crawledAt,
      })
      .from(schema.oliveyoungRankingSnapshots)
      .where(gte(schema.oliveyoungRankingSnapshots.crawledAt, cutoffDate())),
    db
      .select()
      .from(schema.oliveyoungProducts)
      .orderBy(desc(schema.oliveyoungProducts.lastCrawledAt)),
  ]);

  const snapshotMap = groupByProductId(snapshots);
  const items: HomeSignalViewModel[] = [];

  for (const product of products) {
    const history = snapshotMap.get(product.productId) ?? [];
    const previousSnapshots = history.slice(0, -1);
    const priceSignal = calculateDropSignal(
      product.currentSalePrice,
      previousSnapshots.map((snapshot) => snapshot.salePrice),
    );
    const rankDelta = calculateRankDelta(
      product.currentRank ?? null,
      previousSnapshots.map((snapshot) => snapshot.rank),
    );

    if (priceSignal.dropRate < 3 && (rankDelta ?? 0) < 5) continue;

    items.push({
      source: "oliveyoung",
      productId: product.productId,
      name: product.name,
      imageUrl: product.imageUrl || null,
      brand: product.brand || null,
      collection: product.categoryPath || null,
      currentPrice: product.currentSalePrice,
      referencePrice: priceSignal.referencePrice,
      dropRate: priceSignal.dropRate,
      rankDelta,
      currentRank: product.currentRank ?? null,
      detailHref: `/p/oy/${product.productId}`,
      updatedAt: product.lastCrawledAt,
      score: calculateOliveYoungScore(rankDelta, priceSignal.dropRate),
      discountRate: product.currentDiscountRate ?? 0,
      unitPriceValue: null,
      unitPriceText: null,
      isRocket: false,
      reviewCount: 0,
      ratingAverage: null,
    });
  }

  items.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    const rankA = a.currentRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.currentRank ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

  const updatedAt = products[0]?.lastCrawledAt ?? null;

  return {
    source: "oliveyoung",
    items: items.slice(0, limit),
    totalCount: items.length,
    updatedAt,
    isStale: isStale(updatedAt),
  };
}

export interface OliveYoungRankingItem {
  productId: string;
  rank: number;
  rankDelta: number | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  currentPrice: number;
  originalPrice: number;
  discountRate: number;
  detailHref: string;
  isTodayDeal: boolean;
  flags: string[];
}

export interface OliveYoungRankingResult {
  items: OliveYoungRankingItem[];
  updatedAt: Date | null;
  isStale: boolean;
}

export async function getOliveYoungRanking(): Promise<OliveYoungRankingResult> {
  const db = getDb();
  if (!db) {
    return { items: [], updatedAt: null, isStale: false };
  }

  const [snapshots, products] = await Promise.all([
    db
      .select({
        productId: schema.oliveyoungRankingSnapshots.productId,
        rank: schema.oliveyoungRankingSnapshots.rank,
        crawledAt: schema.oliveyoungRankingSnapshots.crawledAt,
      })
      .from(schema.oliveyoungRankingSnapshots)
      .where(gte(schema.oliveyoungRankingSnapshots.crawledAt, cutoffDate())),
    db
      .select()
      .from(schema.oliveyoungProducts)
      .orderBy(desc(schema.oliveyoungProducts.lastCrawledAt)),
  ]);

  const snapshotMap = groupByProductId(snapshots);
  const items: OliveYoungRankingItem[] = [];

  for (const product of products) {
    if (product.currentRank == null) continue;

    const history = snapshotMap.get(product.productId) ?? [];
    const previousSnapshots = history.slice(0, -1);
    const rankDelta = calculateRankDelta(
      product.currentRank,
      previousSnapshots.map((s) => s.rank),
    );

    items.push({
      productId: product.productId,
      rank: product.currentRank,
      rankDelta,
      name: product.name,
      brand: product.brand || null,
      imageUrl: product.imageUrl || null,
      currentPrice: product.currentSalePrice,
      originalPrice: product.currentOriginalPrice,
      discountRate: product.currentDiscountRate,
      detailHref: `/p/oy/${product.productId}`,
      isTodayDeal: product.currentIsTodayDeal,
      flags: product.currentFlags,
    });
  }

  items.sort((a, b) => a.rank - b.rank);

  const updatedAt = products[0]?.lastCrawledAt ?? null;

  return {
    items: items.slice(0, 100),
    updatedAt,
    isStale: isStale(updatedAt),
  };
}

export async function getPriceChangeSignals(limit = 20) {
  const [coupang, oliveyoung] = await Promise.all([
    getCoupangSignals(limit),
    getOliveYoungSignals(limit),
  ]);

  return [...coupang.items, ...oliveyoung.items]
    .sort((a, b) => {
      const scoreA = a.score + getFreshnessBonus(a.updatedAt);
      const scoreB = b.score + getFreshnessBonus(b.updatedAt);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, limit);
}
