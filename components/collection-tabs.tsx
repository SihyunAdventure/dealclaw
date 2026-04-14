"use client";

import { cn } from "@/lib/utils";

interface CollectionTab {
  slug: string;
  displayName: string;
}

interface CollectionTabsProps {
  collections: CollectionTab[];
  activeSlug: string;
}

export function CollectionTabs({ collections, activeSlug }: CollectionTabsProps) {
  return (
    <div className="border-b border-border bg-background sticky top-0 z-10">
      <div className="mx-auto max-w-5xl overflow-x-auto scrollbar-none">
        <nav className="flex gap-1 px-4 py-2">
          {collections.map((col) => (
            <a
              key={col.slug}
              href={`/?collection=${col.slug}`}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
                col.slug === activeSlug
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {col.displayName}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
