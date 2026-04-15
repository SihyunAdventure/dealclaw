import { PriceChangeCard } from "@/components/price-change-card";
import type { SourceSignalResult } from "@/lib/signals/price-changes";

function formatUpdatedAt(updatedAt: Date | null) {
  if (!updatedAt) return null;
  return updatedAt.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PlatformSignalSectionProps {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  result: SourceSignalResult | null;
}

export function PlatformSignalSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  result,
}: PlatformSignalSectionProps) {
  const updatedAtText = formatUpdatedAt(result?.updatedAt ?? null);

  return (
    <section className="border-b border-border">
      <div className="flex items-start justify-between gap-3 px-4 pt-6 pb-2">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground">
          {result?.isStale ? (
            <span className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">
              stale
            </span>
          ) : null}
          {updatedAtText ? <span>{updatedAtText}</span> : null}
        </div>
      </div>

      {result == null ? (
        <div className="mx-4 my-3 rounded-lg border border-dashed border-border bg-card/50 px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-foreground">
            지금 이 섹션을 불러오지 못했어요
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            다른 플랫폼 신호는 계속 확인할 수 있어요.
          </p>
        </div>
      ) : result.items.length === 0 ? (
        <div className="mx-4 my-3 rounded-lg border border-dashed border-border bg-card/50 px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{emptyDescription}</p>
        </div>
      ) : (
        <div>
          {result.items.map((signal) => (
            <PriceChangeCard key={`${signal.source}:${signal.productId}`} signal={signal} />
          ))}
        </div>
      )}
    </section>
  );
}
