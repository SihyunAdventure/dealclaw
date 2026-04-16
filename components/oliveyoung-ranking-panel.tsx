"use client";

import { useMemo, useState } from "react";
import { OliveYoungRankItem } from "@/components/oliveyoung-rank-item";
import type { OliveYoungRankingResult } from "@/lib/signals/price-changes";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "rising" | "new";

const RISING_THRESHOLD = 10;

interface OliveYoungRankingPanelProps {
  result: OliveYoungRankingResult | null;
}

export function OliveYoungRankingPanel({
  result,
}: OliveYoungRankingPanelProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const allItems = useMemo(() => result?.items ?? [], [result]);

  const counts = useMemo(() => {
    let rising = 0;
    let newEntries = 0;
    for (const item of allItems) {
      if (item.rankDelta == null) newEntries++;
      else if (item.rankDelta >= RISING_THRESHOLD) rising++;
    }
    return { all: allItems.length, rising, new: newEntries };
  }, [allItems]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return allItems;
    if (filter === "rising") {
      return allItems.filter(
        (i) => i.rankDelta != null && i.rankDelta >= RISING_THRESHOLD,
      );
    }
    return allItems.filter((i) => i.rankDelta == null);
  }, [allItems, filter]);

  const selectFilter = (mode: FilterMode) => {
    const scrollY = window.scrollY;
    setFilter(mode);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

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

      <div
        className="flex gap-1.5 overflow-x-auto px-5 pb-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
        role="tablist"
        aria-label="올영 랭킹 필터"
      >
        <FilterChip
          label="전체"
          count={counts.all}
          isActive={filter === "all"}
          onClick={() => selectFilter("all")}
        />
        <FilterChip
          label={`급상승 ↑${RISING_THRESHOLD}+`}
          count={counts.rising}
          isActive={filter === "rising"}
          onClick={() => selectFilter("rising")}
        />
        <FilterChip
          label="NEW"
          count={counts.new}
          isActive={filter === "new"}
          onClick={() => selectFilter("new")}
        />
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
      ) : allItems.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            아직 랭킹 데이터가 없어요
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            다음 수집 사이클에 올리브영 순위를 가져옵니다.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {filter === "rising"
              ? "지금 급상승한 상품이 없어요"
              : "지금 새로 진입한 상품이 없어요"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            순위 변동이 생기면 여기에 나타납니다.
          </p>
        </div>
      ) : (
        <div>
          {filteredItems.map((item) => (
            <OliveYoungRankItem key={item.productId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function FilterChip({ label, count, isActive, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      data-track="oy_filter_chip_click"
      data-track-filter={label}
      className={cn(
        "inline-flex min-h-[36px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
        isActive
          ? "border-primary bg-primary text-primary-foreground font-medium"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-semibold",
          isActive
            ? "bg-primary-foreground/20 text-primary-foreground"
            : count > 0
              ? "bg-muted text-muted-foreground"
              : "bg-transparent text-muted-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}
