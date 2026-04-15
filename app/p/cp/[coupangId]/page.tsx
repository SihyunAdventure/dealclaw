import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as schema from "@/lib/db/schema";
import { PriceChart, type PricePoint } from "@/components/price-chart";
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

  return (
    <main className="flex-1 bg-background pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
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
            <h1 className="text-[14px] font-medium leading-snug text-foreground">
              {product.name}
            </h1>
            <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
              {hasDiscount && (
                <span className="text-xs font-bold text-destructive">
                  {product.discountRate}%
                </span>
              )}
              <span className="text-[18px] font-bold text-foreground">
                {formatPrice(product.salePrice)}
                <span className="text-xs font-normal">원</span>
              </span>
              {hasDiscount && product.originalPrice && (
                <span className="text-[11px] text-muted-foreground line-through">
                  {formatPrice(product.originalPrice)}원
                </span>
              )}
            </div>
            {product.unitPriceText && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {product.unitPriceText}
              </p>
            )}
            {(product.isRocket || (product.badges && product.badges.length > 0)) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {product.isRocket && (
                  <span className="inline-flex items-center rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    로켓배송
                  </span>
                )}
                {product.badges
                  ?.filter((b) => b !== "로켓")
                  .map((badge) => (
                    <span
                      key={badge}
                      className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {badge}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>

        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block w-full rounded-lg bg-primary py-3 text-center text-[14px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          쿠팡에서 보기 →
        </a>
      </section>

      <section className="px-4 py-5 border-b border-border">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            가격 추이
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

      <section className="px-4 py-4 text-[11px] text-muted-foreground">
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
