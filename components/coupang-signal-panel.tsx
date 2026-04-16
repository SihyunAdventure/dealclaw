"use client";

import { useCallback, useMemo, useState } from "react";
import { PriceChangeCard } from "@/components/price-change-card";
import { coupangCategories } from "@/src/data/coupang-categories";
import type { HomeSignalViewModel, SourceSignalResult } from "@/lib/signals/price-changes";
import { cn } from "@/lib/utils";

const ALL = "__all__";
const PREVIEW_COUNT = 3;

type SortMode = "unit" | "price" | "discount";

const SORT_LABELS: Record<SortMode, string> = {
  unit: "가성비 순",
  price: "낮은 가격순",
  discount: "할인율 순",
};

const SORT_CYCLE: Record<SortMode, SortMode> = {
  unit: "price",
  price: "discount",
  discount: "unit",
};

function sortItems(items: HomeSignalViewModel[], mode: SortMode): HomeSignalViewModel[] {
  const sorted = [...items];
  if (mode === "unit") {
    sorted.sort((a, b) => {
      const uvA = a.unitPriceValue ?? Number.MAX_SAFE_INTEGER;
      const uvB = b.unitPriceValue ?? Number.MAX_SAFE_INTEGER;
      if (uvA !== uvB) return uvA - uvB;
      return a.currentPrice - b.currentPrice;
    });
  } else if (mode === "price") {
    sorted.sort((a, b) => a.currentPrice - b.currentPrice);
  } else {
    sorted.sort((a, b) => {
      if (a.discountRate !== b.discountRate) return b.discountRate - a.discountRate;
      return a.currentPrice - b.currentPrice;
    });
  }
  return sorted;
}

interface CoupangSignalPanelProps {
  result: SourceSignalResult | null;
}

export function CoupangSignalPanel({ result }: CoupangSignalPanelProps) {
  const [activeSlug, setActiveSlug] = useState<string>(ALL);
  const [sortMode, setSortMode] = useState<SortMode>("unit");

  const selectCategory = useCallback((slug: string) => {
    const scrollY = window.scrollY;
    setActiveSlug(slug);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  }, []);

  const items = useMemo(() => result?.items ?? [], [result]);

  const countsBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (!item.collection) continue;
      map.set(item.collection, (map.get(item.collection) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    if (activeSlug === ALL) return items;
    return sortItems(
      items.filter((item) => item.collection === activeSlug),
      sortMode,
    );
  }, [items, activeSlug, sortMode]);

  const grouped = useMemo(() => {
    if (activeSlug !== ALL) return null;
    const bySlug = new Map<string, typeof items>();
    for (const item of items) {
      if (!item.collection) continue;
      const list = bySlug.get(item.collection);
      if (list) list.push(item);
      else bySlug.set(item.collection, [item]);
    }
    return coupangCategories
      .filter((c) => bySlug.has(c.slug))
      .map((c) => ({
        category: c,
        items: sortItems(bySlug.get(c.slug)!, sortMode),
      }));
  }, [items, activeSlug, sortMode]);

  const activeCategory = coupangCategories.find((c) => c.slug === activeSlug);
  const cycleSort = useCallback(() => {
    const scrollY = window.scrollY;
    setSortMode((prev) => SORT_CYCLE[prev]);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  }, []);

  return (
    <section>
      <div className="px-5 pt-6 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          지금 싸진 것
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          최근 7일 새 최저가
        </p>
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto px-5 pb-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
        role="tablist"
        aria-label="쿠팡 카테고리 필터"
      >
        <CategoryChip
          label="전체"
          count={items.length}
          isActive={activeSlug === ALL}
          onClick={() => selectCategory(ALL)}
        />
        {coupangCategories.map((category) => (
          <CategoryChip
            key={category.slug}
            label={category.displayName}
            count={countsBySlug.get(category.slug) ?? 0}
            isActive={activeSlug === category.slug}
            onClick={() => selectCategory(category.slug)}
          />
        ))}
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
      ) : filtered.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {activeCategory
              ? `${activeCategory.displayName}에는 지금 새 신호가 없어요`
              : "지금은 눈에 띄는 인하가 없어요"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            다음 수집 사이클에 다시 확인합니다.
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-end px-5 pb-2">
            <SortButton mode={sortMode} onCycle={cycleSort} />
          </div>
          {grouped ? (
            <div>
              {grouped.map(({ category, items: groupItems }) => (
                <CategoryGroup
                  key={category.slug}
                  categorySlug={category.slug}
                  categoryName={category.displayName}
                  items={groupItems}
                  onShowAll={selectCategory}
                />
              ))}
            </div>
          ) : (
            <div>
              {filtered.map((signal) => (
                <PriceChangeCard
                  key={`${signal.source}:${signal.productId}`}
                  signal={signal}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface SortButtonProps {
  mode: SortMode;
  onCycle: () => void;
}

function SortButton({ mode, onCycle }: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onCycle}
      data-track="coupang_sort_cycle"
      data-track-sort={mode}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={`정렬 기준: ${SORT_LABELS[mode]} (클릭하여 변경)`}
    >
      <span className="text-[11px]">⇅</span>
      <span>{SORT_LABELS[mode]}</span>
    </button>
  );
}

interface CategoryGroupProps {
  categorySlug: string;
  categoryName: string;
  items: HomeSignalViewModel[];
  onShowAll: (slug: string) => void;
}

function CategoryGroup({
  categorySlug,
  categoryName,
  items: groupItems,
  onShowAll,
}: CategoryGroupProps) {
  const hasMore = groupItems.length > PREVIEW_COUNT;
  const preview = hasMore ? groupItems.slice(0, PREVIEW_COUNT) : groupItems;

  return (
    <div>
      <h3 className="border-t border-border/60 bg-muted/30 px-5 py-2.5 text-[13px] font-semibold text-muted-foreground">
        {categoryName}
      </h3>
      {preview.map((signal) => (
        <PriceChangeCard
          key={`${signal.source}:${signal.productId}`}
          signal={signal}
        />
      ))}
      {hasMore ? (
        <button
          type="button"
          onClick={() => onShowAll(categorySlug)}
          className="w-full border-t border-border/60 px-5 py-3 text-center text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          {categoryName} 전체 {groupItems.length}개 보기
        </button>
      ) : null}
    </div>
  );
}

interface CategoryChipProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function CategoryChip({ label, count, isActive, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      data-track="coupang_category_chip_click"
      data-track-category={label}
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
