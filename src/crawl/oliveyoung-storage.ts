import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../../lib/db/schema";
import type { OliveYoungRankedProduct } from "./types";

type DB = NeonHttpDatabase<typeof schema>;

export async function upsertOliveYoungProducts(
  db: DB,
  products: OliveYoungRankedProduct[],
  crawledAt: Date,
): Promise<void> {
  if (products.length === 0) return;

  for (const p of products) {
    await db
      .insert(schema.oliveyoungProducts)
      .values({
        productId: p.productId,
        brand: p.brand,
        name: p.name,
        categoryPath: p.categoryPath,
        dispCatNo: p.dispCatNo,
        link: p.link,
        imageUrl: p.imageUrl,
        currentRank: p.rank,
        currentSalePrice: p.salePrice,
        currentOriginalPrice: p.originalPrice,
        currentDiscountRate: p.discountRate,
        currentHasPriceRange: p.hasPriceRange,
        currentIsTodayDeal: p.isTodayDeal,
        currentFlags: p.flags,
        firstSeenAt: crawledAt,
        lastCrawledAt: crawledAt,
        updatedAt: crawledAt,
      })
      .onConflictDoUpdate({
        target: schema.oliveyoungProducts.productId,
        set: {
          brand: p.brand,
          name: p.name,
          categoryPath: p.categoryPath,
          dispCatNo: p.dispCatNo,
          link: p.link,
          imageUrl: p.imageUrl,
          currentRank: p.rank,
          currentSalePrice: p.salePrice,
          currentOriginalPrice: p.originalPrice,
          currentDiscountRate: p.discountRate,
          currentHasPriceRange: p.hasPriceRange,
          currentIsTodayDeal: p.isTodayDeal,
          currentFlags: p.flags,
          lastCrawledAt: crawledAt,
          updatedAt: crawledAt,
        },
      });
  }
}

export async function insertRankingSnapshots(
  db: DB,
  products: OliveYoungRankedProduct[],
  crawledAt: Date,
): Promise<void> {
  if (products.length === 0) return;
  await db.insert(schema.oliveyoungRankingSnapshots).values(
    products.map((p) => ({
      productId: p.productId,
      rank: p.rank,
      salePrice: p.salePrice,
      originalPrice: p.originalPrice,
      discountRate: p.discountRate,
      hasPriceRange: p.hasPriceRange,
      isTodayDeal: p.isTodayDeal,
      flags: p.flags,
      crawledAt,
    })),
  );
}

interface CrawlRunMeta {
  productCount: number;
  todayDealCount: number;
  minSalePrice: number | null;
  maxDiscountRate: number | null;
  startedAt: Date;
  finishedAt: Date;
  status: "completed" | "failed";
  errorMessage?: string | null;
}

export async function recordCrawlRun(
  db: DB,
  meta: CrawlRunMeta,
): Promise<string> {
  const rows = await db
    .insert(schema.oliveyoungCrawlRuns)
    .values({
      productCount: meta.productCount,
      todayDealCount: meta.todayDealCount,
      minSalePrice: meta.minSalePrice,
      maxDiscountRate: meta.maxDiscountRate,
      status: meta.status,
      errorMessage: meta.errorMessage ?? null,
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
    })
    .returning({ id: schema.oliveyoungCrawlRuns.id });
  return rows[0].id;
}

export async function countRowsForDebug(db: DB): Promise<{
  products: number;
  snapshots: number;
  runs: number;
}> {
  const [products] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.oliveyoungProducts);
  const [snapshots] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.oliveyoungRankingSnapshots);
  const [runs] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.oliveyoungCrawlRuns);
  return {
    products: Number(products.c),
    snapshots: Number(snapshots.c),
    runs: Number(runs.c),
  };
}
