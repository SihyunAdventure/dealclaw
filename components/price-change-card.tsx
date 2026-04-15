import Image from "next/image";
import Link from "next/link";
import type { HomeSignalViewModel, PriceChangeSource } from "@/lib/signals/price-changes";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

function sourceLabel(source: PriceChangeSource) {
  return source === "oliveyoung" ? "올리브영" : "쿠팡";
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
    collection,
    brand,
  } = signal;

  const hasDrop = dropRate >= 3;
  const hasRankJump = (rankDelta ?? 0) >= 5;

  return (
    <Link
      href={detailHref}
      data-track="section_click"
      data-track-source={source}
      className="flex gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-contain p-1"
            sizes="80px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No img
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasDrop && (
            <span className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
              새 최저가 -{dropRate}%
            </span>
          )}
          {hasRankJump && currentRank != null && (
            <span className="inline-flex items-center rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
              랭킹 ↑{rankDelta} · {currentRank}위
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {sourceLabel(source)}
          </span>
        </div>
        {brand && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {brand}
          </p>
        )}
        <p className="line-clamp-2 text-[13px] leading-snug text-foreground">
          {name}
        </p>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[15px] font-bold text-foreground">
            {formatPrice(currentPrice)}
            <span className="text-xs font-normal">원</span>
          </span>
          {referencePrice && referencePrice > currentPrice ? (
            <span className="text-[11px] text-muted-foreground line-through">
              {formatPrice(referencePrice)}원
            </span>
          ) : null}
        </div>
        {collection && (
          <p className="line-clamp-1 text-[11px] text-muted-foreground">{collection}</p>
        )}
      </div>
    </Link>
  );
}
