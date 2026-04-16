import Image from "next/image";
import Link from "next/link";
import type { HomeSignalViewModel } from "@/lib/signals/price-changes";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

export function PriceChangeCard({ signal }: { signal: HomeSignalViewModel }) {
  const {
    name,
    imageUrl,
    currentPrice,
    referencePrice,
    dropRate,
    rankDelta,
    currentRank,
    detailHref,
    source,
    brand,
    discountRate,
    unitPriceText,
    isRocket,
    reviewCount,
    ratingAverage,
  } = signal;

  const hasDiscount = discountRate > 0;
  const hasDrop = dropRate >= 3;
  const hasRankJump = (rankDelta ?? 0) >= 5;

  return (
    <Link
      href={detailHref}
      data-track="section_click"
      data-track-source={source}
      className="flex gap-3 border-t border-border/60 px-5 py-4 transition-colors hover:bg-muted/30"
    >
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-contain p-1.5"
            sizes="96px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No img
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {brand && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {brand}
          </p>
        )}
        <p className="line-clamp-2 text-sm leading-snug text-foreground">
          {name}
        </p>
        <div className="flex items-baseline gap-2 flex-wrap">
          {hasDiscount && (
            <span className="text-[15px] font-bold text-destructive">
              {discountRate}%
            </span>
          )}
          <span className="text-[18px] font-bold text-foreground">
            {formatPrice(currentPrice)}
            <span className="text-xs font-normal">원</span>
          </span>
          {referencePrice && referencePrice > currentPrice ? (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(referencePrice)}원
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
          {unitPriceText ? <span>{unitPriceText}</span> : null}
          {ratingAverage != null ? (
            <span className="inline-flex items-center gap-0.5">
              <span className="text-yellow-500">★</span>
              {(ratingAverage / 10).toFixed(1)}
              {reviewCount > 0 ? (
                <span className="text-muted-foreground/70">
                  ({reviewCount.toLocaleString("ko-KR")})
                </span>
              ) : null}
            </span>
          ) : reviewCount > 0 ? (
            <span>리뷰 {reviewCount.toLocaleString("ko-KR")}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isRocket && (
            <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              🚀 로켓배송
            </span>
          )}
          {hasDrop && (
            <span className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
              최저가 갱신
            </span>
          )}
          {hasRankJump && currentRank != null && (
            <span className="inline-flex items-center rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
              랭킹 ↑{rankDelta} · {currentRank}위
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
