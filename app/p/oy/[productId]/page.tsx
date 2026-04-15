import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as schema from "@/lib/db/schema";
import { PriceChart, type PricePoint } from "@/components/price-chart";

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

  const points: PricePoint[] = snapshots.map((s) => ({
    t: new Date(s.crawledAt).getTime(),
    salePrice: s.salePrice,
    rank: s.rank,
  }));

  const hasDiscount =
    product.currentDiscountRate > 0 &&
    product.currentOriginalPrice > product.currentSalePrice;

  // 최저가·최고가 summary
  const prices = snapshots.map((s) => s.salePrice);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  return (
    <main className="flex-1 bg-background pb-10">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
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

      {/* 제품 카드 */}
      <section className="px-4 py-5 border-b border-border">
        <div className="flex gap-4">
          <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-contain p-1.5"
                sizes="112px"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No img
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            {product.brand && (
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {product.brand}
              </p>
            )}
            <h1 className="text-[14px] font-medium leading-snug text-foreground">
              {product.name}
            </h1>
            <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
              {hasDiscount && (
                <span className="text-xs font-bold text-destructive">
                  {product.currentDiscountRate}%
                </span>
              )}
              <span className="text-[18px] font-bold text-foreground">
                {formatPrice(product.currentSalePrice)}
                <span className="text-xs font-normal">원</span>
              </span>
              {hasDiscount && (
                <span className="text-[11px] text-muted-foreground line-through">
                  {formatPrice(product.currentOriginalPrice)}원
                </span>
              )}
            </div>
            {product.currentRank != null && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                현재 랭킹{" "}
                <span className="font-semibold text-foreground">
                  {product.currentRank}위
                </span>
              </p>
            )}
          </div>
        </div>

        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block w-full rounded-lg bg-primary py-3 text-center text-[14px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          올리브영에서 보기 →
        </a>
      </section>

      {/* 시세 섹션 */}
      <section className="px-4 py-5 border-b border-border">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            가격·랭킹 추이
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {snapshots.length}회 기록
          </p>
        </div>
        <PriceChart data={points} showRank />
        {minPrice !== null && maxPrice !== null && minPrice !== maxPrice && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-[10px] text-muted-foreground">기간 최저</p>
              <p className="text-sm font-semibold text-foreground">
                {formatPrice(minPrice)}원
              </p>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-[10px] text-muted-foreground">기간 최고</p>
              <p className="text-sm font-semibold text-foreground">
                {formatPrice(maxPrice)}원
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 메타 */}
      <section className="px-4 py-4 text-[11px] text-muted-foreground">
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
