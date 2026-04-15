import Link from "next/link";
import type { HomeSummaryViewModel } from "@/lib/signals/price-changes";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

function formatUpdatedAt(updatedAt: Date | null) {
  if (!updatedAt) return "업데이트 시각 없음";
  return updatedAt.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: "coupang" | "oliveyoung") {
  return source === "coupang" ? "쿠팡" : "올리브영";
}

export function DecisionStrip({ summary }: { summary: HomeSummaryViewModel }) {
  const signal = summary.strongestSignal;

  return (
    <section className="border-b border-border bg-card/70 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            strongest opportunity
          </p>
          <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight text-foreground">
            {signal ? "지금 볼 이유가 가장 강한 상품" : "오늘은 새로운 buy-now 신호가 없어요"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            마지막 업데이트 {formatUpdatedAt(summary.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 text-[10px] font-medium">
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
            쿠팡 {summary.counts.coupang ?? "—"}건
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
            올영 {summary.counts.oliveyoung ?? "—"}건
          </span>
        </div>
      </div>

      {signal ? (
        <Link
          href={signal.detailHref}
          data-track="home_strip_click"
          data-track-source={signal.source}
          className="mt-4 block rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>{sourceLabel(signal.source)}</span>
            {signal.dropRate > 0 && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                -{signal.dropRate}%
              </span>
            )}
            {(signal.rankDelta ?? 0) > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
                랭킹 ↑{signal.rankDelta}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {signal.name}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground">
              {formatPrice(signal.currentPrice)}원
            </span>
            {signal.referencePrice && signal.referencePrice > signal.currentPrice ? (
              <span className="text-xs text-muted-foreground line-through">
                {formatPrice(signal.referencePrice)}원
              </span>
            ) : null}
          </div>
        </Link>
      ) : null}
    </section>
  );
}
