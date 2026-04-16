import Image from "next/image";
import Link from "next/link";
import type { OliveYoungRankingItem } from "@/lib/signals/price-changes";
import { cn } from "@/lib/utils";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

function RankDeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span className="text-[10px] text-muted-foreground/60">NEW</span>
    );
  }
  if (delta === 0) {
    return (
      <span className="text-[10px] text-muted-foreground/60">—</span>
    );
  }
  if (delta > 0) {
    return (
      <span className="text-[10px] font-semibold text-red-500">
        ↑{delta}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold text-blue-500">
      ↓{Math.abs(delta)}
    </span>
  );
}

export function OliveYoungRankItem({ item }: { item: OliveYoungRankingItem }) {
  const hasDiscount = item.discountRate > 0 && item.originalPrice > item.currentPrice;

  return (
    <Link
      href={item.detailHref}
      data-track="oy_rank_click"
      data-track-rank={item.rank}
      className="flex gap-3 border-t border-border/60 px-5 py-3.5 transition-colors hover:bg-muted/30"
    >
      <div className="flex w-9 flex-shrink-0 flex-col items-center gap-0.5 pt-1">
        <span
          className={cn(
            "text-lg font-bold leading-none",
            item.rank <= 3 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {item.rank}
        </span>
        <RankDeltaBadge delta={item.rankDelta} />
      </div>

      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
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
        {item.isTodayDeal ? (
          <span className="absolute top-0.5 left-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-bold text-white">
            오특
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {item.brand ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.brand}
          </p>
        ) : null}
        <p className="line-clamp-2 text-sm leading-snug text-foreground">
          {item.name}
        </p>
        <div className="flex items-baseline gap-2 flex-wrap">
          {hasDiscount ? (
            <span className="text-[13px] font-bold text-destructive">
              {item.discountRate}%
            </span>
          ) : null}
          <span className="text-[15px] font-bold text-foreground">
            {formatPrice(item.currentPrice)}
            <span className="text-xs font-normal">원</span>
          </span>
          {hasDiscount ? (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(item.originalPrice)}원
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
