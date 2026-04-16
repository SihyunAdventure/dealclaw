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
import { collections } from "@/src/data/collections";

export const revalidate = 300;

async function fetchCoupang(coupangId: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const productRows = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.coupangId, coupangId))
    .limit(1);

  if (productRows.length === 0) return null;

  const snapshots = await db
    .select({
      crawledAt: schema.coupangPriceSnapshots.crawledAt,
      salePrice: schema.coupangPriceSnapshots.salePrice,
      rank: schema.coupangPriceSnapshots.rank,
    })
    .from(schema.coupangPriceSnapshots)
    .where(eq(schema.coupangPriceSnapshots.coupangId, coupangId))
    .orderBy(asc(schema.coupangPriceSnapshots.crawledAt));

  return { product: productRows[0], snapshots };
}

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

interface PageProps {
  params: Promise<{ coupangId: string }>;
}

export default async function CoupangProductPage({ params }: PageProps) {
  const { coupangId } = await params;
  const data = await fetchCoupang(coupangId);
  if (!data) notFound();

  const { product, snapshots } = data;

  const points: PricePoint[] = snapshots.map((s) => ({
    t: new Date(s.crawledAt).getTime(),
    salePrice: s.salePrice,
    rank: s.rank,
  }));

  const hasDiscount =
    (product.discountRate ?? 0) > 0 &&
    (product.originalPrice ?? 0) > product.salePrice;

  const collectionDisplay =
    collections.find((c) => c.slug === product.collection)?.displayName ??
    product.collection;

  const prices = snapshots.map((s) => s.salePrice);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const intelligence = buildDetailIntelligence({
    source: "coupang",
    currentPrice: product.salePrice,
    minPrice,
    snapshotCount: snapshots.length,
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
          Coupang · {collectionDisplay}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {collectionDisplay}
            </p>
            <h1 className="mt-2 text-lg font-medium leading-snug text-foreground md:text-2xl">
              {product.name}
            </h1>
            <div className="mt-3 flex items-baseline gap-2 flex-wrap">
              {hasDiscount && (
                <span className="text-sm font-bold text-destructive">
                  {product.discountRate}%
                </span>
              )}
              <span className="text-[28px] font-semibold text-foreground md:text-[34px]">
                {formatPrice(product.salePrice)}
                <span className="ml-1 text-sm font-normal">원</span>
              </span>
              {hasDiscount && product.originalPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(product.originalPrice)}원
                </span>
              )}
            </div>
            {product.unitPriceText && (
              <p className="mt-2 text-sm text-muted-foreground">
                {product.unitPriceText}
              </p>
            )}
            {(product.isRocket || (product.badges && product.badges.length > 0)) && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                {product.isRocket && (
                  <span className="inline-flex items-center rounded-full bg-sky-500 px-2 py-1 text-[10px] font-semibold text-white">
                    로켓배송
                  </span>
                )}
                {product.badges
                  ?.filter((badge) => badge !== "로켓")
                  .map((badge) => (
                    <span
                      key={badge}
                      className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"
                    >
                      {badge}
                    </span>
                  ))}
              </div>
            )}

            <a
              href={product.link}
              target="_blank"
              rel="noopener noreferrer"
              data-track="affiliate_click"
              className="mt-5 block w-full rounded-xl bg-primary py-3 text-center text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 md:max-w-sm"
            >
              쿠팡에서 보기 →
            </a>
          </div>
        </div>
      </section>

      <DetailIntelligencePanel
        intelligence={intelligence}
        primaryLabel="쿠팡 현재가 기준 판단"
        secondaryLabel="상품 추적 알림 준비 중"
      />

      <section className="border-b border-border px-4 py-5 md:px-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            가격 추이
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
        <p>컬렉션: {collectionDisplay}</p>
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
