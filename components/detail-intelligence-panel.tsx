import type { DetailIntelligence } from "@/lib/signals/detail-intelligence";

interface DetailIntelligencePanelProps {
  intelligence: DetailIntelligence;
  primaryLabel: string;
  secondaryLabel?: string;
}

export function DetailIntelligencePanel({
  intelligence,
  primaryLabel,
  secondaryLabel,
}: DetailIntelligencePanelProps) {
  return (
    <section className="border-b border-border px-4 py-5">
      <div className="rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-accent-foreground">
            {intelligence.confidenceLabel}
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            buy-now reasons
          </span>
        </div>

        <h2 className="mt-3 font-heading text-xl font-semibold tracking-tight text-foreground">
          지금 볼 이유
        </h2>

        <ul className="mt-3 space-y-2">
          {intelligence.reasons.map((reason) => (
            <li
              key={reason}
              className="rounded-xl bg-muted/60 px-3 py-2 text-[13px] leading-relaxed text-foreground"
            >
              {reason}
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-background px-3 py-3">
            <p className="text-[11px] font-medium text-foreground">{primaryLabel}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              지금은 현재 플랫폼 가격과 추세를 먼저 판단하는 데 집중합니다.
            </p>
          </div>
          <div className="rounded-xl bg-background px-3 py-3">
            <p className="text-[11px] font-medium text-foreground">
              {secondaryLabel ?? "상품 추적 알림 준비 중"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              product-watch backend가 준비되면 상세 페이지에서 바로 켤 수 있게 연결합니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
