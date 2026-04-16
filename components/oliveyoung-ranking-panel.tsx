"use client";

import { OliveYoungRankItem } from "@/components/oliveyoung-rank-item";
import type { OliveYoungRankingResult } from "@/lib/signals/price-changes";

interface OliveYoungRankingPanelProps {
  result: OliveYoungRankingResult | null;
}

export function OliveYoungRankingPanel({
  result,
}: OliveYoungRankingPanelProps) {
  const items = result?.items ?? [];

  return (
    <section>
      <div className="px-5 pt-6 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          TOP 100
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          어제 대비 순위 변동
        </p>
      </div>

      {result == null ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            지금 이 섹션을 불러오지 못했어요
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            잠시 후 다시 시도해 주세요.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            아직 랭킹 데이터가 없어요
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            다음 수집 사이클에 올리브영 순위를 가져옵니다.
          </p>
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <OliveYoungRankItem key={item.productId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
