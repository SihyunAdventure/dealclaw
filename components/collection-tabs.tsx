"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CollectionTab {
  slug: string;
  displayName: string;
}

interface CollectionTabsProps {
  collections: CollectionTab[];
}

/**
 * 상단 sticky 탭. 앵커 스크롤 방식 — 페이지 이동 없음.
 * IntersectionObserver로 현재 보이는 섹션의 탭을 활성화.
 */
export function CollectionTabs({ collections }: CollectionTabsProps) {
  const [activeSlug, setActiveSlug] = useState(collections[0]?.slug ?? "");

  useEffect(() => {
    const sections = collections
      .map((c) => document.getElementById(`collection-${c.slug}`))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const id = visible[0].target.id;
          const slug = id.replace(/^collection-/, "");
          setActiveSlug(slug);
        }
      },
      {
        rootMargin: "-40% 0px -40% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [collections]);

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20">
      <nav
        className="flex gap-1.5 overflow-x-auto px-4 py-2 min-h-[52px] items-center [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {collections.map((col) => (
          <a
            key={col.slug}
            href={`#collection-${col.slug}`}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2.5 text-sm min-h-[40px] inline-flex items-center transition-colors",
              col.slug === activeSlug
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {col.displayName}
          </a>
        ))}
      </nav>
    </div>
  );
}
