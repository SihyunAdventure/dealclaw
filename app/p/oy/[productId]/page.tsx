import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailIntelligencePanel } from "@/components/detail-intelligence-panel";
import { PriceChart, type PricePoint } from "@/components/price-chart";
import * as schema from "@/lib/db/schema";
import { buildDetailIntelligence } from "@/lib/signals/detail-intelligence";

export const revalidate = 300;

async function fetchOliveYoung(productId: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const productRows = await db
    .select()
    .from(schema.oliveyoungProducts)
    .where(eq(schema.oliveyoungProducts.productId, productId))
    .limit(1);

  if (productRows.length === 0) return null;

  const snapshots = await db
    .select({
      crawledAt: schema.oliveyoungRankingSnapshots.crawledAt,
      salePrice: schema.oliveyoungRankingSnapshots.salePrice,
      rank: schema.oliveyoungRankingSnapshots.rank,
    })
    .from(schema.oliveyoungRankingSnapshots)
    .where(eq(schema.oliveyoungRankingSnapshots.productId, productId))
    .orderBy(asc(schema.oliveyoungRankingSnapshots.crawledAt));

  return { product: productRows[0], snapshots };
}

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

interface PageProps {
  params: Promise<{ productId: string }>;
}

export default async function OliveYoungProductPage({ params }: PageProps) {
  const { productId } = await params;
  const data = await fetchOliveYoung(productId);
  if (!data) notFound();

  const { product, snapshots } = data;

  const points: PricePoint[] = snapshots.map((snapshot) => ({
    t: new Date(snapshot.crawledAt).getTime(),
    salePrice: snapshot.salePrice,
    rank: snapshot.rank,
  }));

  const hasDiscount =
    product.currentDiscountRate > 0 &&
    product.currentOriginalPrice > product.currentSalePrice;

  const prices = snapshots.map((snapshot) => snapshot.salePrice);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const intelligence = buildDetailIntelligence({
    source: "oliveyoung",
    currentPrice: product.currentSalePrice,
    minPrice,
    snapshotCount: snapshots.length,
    currentRank: product.currentRank ?? null,
    historicalRanks: snapshots.slice(0, -1).map((snapshot) => snapshot.rank),
  });

  return (
    <main className="flex-1 bg-background pb-10" data-track="detail_view">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 홈
        </Link>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Olive Young
        </span>
      </header>

      <section className="border-b border-border px-4 py-5 md:px-6">
        <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)] md:items-start">
          <div className="relative h-32 w-32 overflow-hidden rounded-xl bg-muted md:h-40 md:w-40">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-contain p-2"
                sizes="160px"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No img
              </div>
            )}
          </div>
          <div className="min-w-0">
            {product.brand && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {product.brand}
              </p>
            )}
            <h1 className="mt-2 text-lg font-medium leading-snug text-foreground md:text-2xl">
              {product.name}
            </h1>
            <div className="mt-3 flex items-baseline gap-2 flex-wrap">
              {hasDiscount && (
                <span className="text-sm font-bold text-destructive">
                  {product.currentDiscountRate}%
                </span>
              )}
              <span className="text-[28px] font-semibold text-foreground md:text-[34px]">
                {formatPrice(product.currentSalePrice)}
                <span className="ml-1 text-sm font-normal">원</span>
              </span>
              {hasDiscount && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(product.currentOriginalPrice)}원
                </span>
              )}
            </div>
            {product.currentRank != null && (
              <p className="mt-2 text-sm text-muted-foreground">
                현재 랭킹 <span className="font-semibold text-foreground">{product.currentRank}위</span>
              </p>
            )}

            <a
              href={product.link}
              target="_blank"
              rel="noopener noreferrer"
              data-track="affiliate_click"
              className="mt-5 block w-full rounded-xl bg-primary py-3 text-center text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 md:max-w-sm"
            >
              올리브영에서 보기 →
            </a>
          </div>
        </div>
      </section>

      <DetailIntelligencePanel
        intelligence={intelligence}
        primaryLabel="올리브영 가격·랭킹 기준 판단"
        secondaryLabel="상품 추적 알림 준비 중"
      />

      <section className="border-b border-border px-4 py-5 md:px-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            가격·랭킹 추이
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {snapshots.length}회 기록
          </p>
        </div>
        <PriceChart data={points} showRank />
        {minPrice !== null && maxPrice !== null && minPrice !== maxPrice && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-center md:max-w-lg">
            <div className="rounded-2xl bg-muted px-3 py-3">
              <p className="text-[10px] text-muted-foreground">기간 최저</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatPrice(minPrice)}원
              </p>
            </div>
            <div className="rounded-2xl bg-muted px-3 py-3">
              <p className="text-[10px] text-muted-foreground">기간 최고</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatPrice(maxPrice)}원
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="px-4 py-4 text-[11px] text-muted-foreground md:px-6">
        <p>카테고리: {product.categoryPath || "—"}</p>
        <p className="mt-1">
          최근 수집:{" "}
          {new Date(product.lastCrawledAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </p>
      </section>
    </main>
  );
}
