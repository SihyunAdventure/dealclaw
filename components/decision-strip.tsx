"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { HomeSummaryViewModel, HomeSignalViewModel } from "@/lib/signals/price-changes";
import { cn } from "@/lib/utils";

function formatPrice(price: number) {
  return price.toLocaleString("ko-KR");
}

function sourceLabel(source: "coupang" | "oliveyoung") {
  return source === "coupang" ? "쿠팡" : "올리브영";
}

function HeroCard({ signal }: { signal: HomeSignalViewModel }) {
  return (
    <Link
      href={signal.detailHref}
      data-track="home_hero_click"
      data-track-source={signal.source}
      className="group relative block w-full flex-shrink-0 snap-center overflow-hidden"
    >
      {signal.imageUrl ? (
        <div className="relative aspect-square w-full bg-muted">
          <Image
            src={signal.imageUrl}
            alt={signal.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, 640px"
            unoptimized
          />
        </div>
      ) : (
        <div className="aspect-square w-full bg-muted" />
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-5 pt-20 pb-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/80">
          <span>{sourceLabel(signal.source)}</span>
          {signal.dropRate > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur-sm">
              -{signal.dropRate}%
            </span>
          )}
          {(signal.rankDelta ?? 0) > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur-sm">
              랭킹 ↑{signal.rankDelta}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-white">
          {signal.name}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">
            {formatPrice(signal.currentPrice)}
            <span className="text-sm font-normal">원</span>
          </span>
          {signal.referencePrice && signal.referencePrice > signal.currentPrice ? (
            <span className="text-sm text-white/50 line-through">
              {formatPrice(signal.referencePrice)}원
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function DecisionStrip({ summary }: { summary: HomeSummaryViewModel }) {
  const { topSignals } = summary;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

  if (topSignals.length === 0) {
    return (
      <section className="px-5 py-10 text-center">
        <p className="font-heading text-lg font-semibold text-foreground">
          오늘은 눈에 띄는 변화가 없어요
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          가격이 떨어지거나 순위가 크게 오르면 여기에 나타납니다.
        </p>
      </section>
    );
  }

  if (topSignals.length === 1) {
    return <HeroCard signal={topSignals[0]} />;
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {topSignals.map((signal) => (
          <HeroCard
            key={`${signal.source}:${signal.productId}`}
            signal={signal}
          />
        ))}
      </div>

      {topSignals.length > 1 ? (
        <div className="flex justify-center gap-1.5 py-3">
          {topSignals.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`슬라이드 ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === activeIndex
                  ? "w-4 bg-foreground"
                  : "w-1.5 bg-foreground/25",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
