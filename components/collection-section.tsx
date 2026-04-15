"use client";

import { useState } from "react";
import { DealListItem } from "./deal-list-item";

interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  link: string;
  salePrice: number;
  originalPrice: number | null;
  discountRate: number | null;
  unitPriceText: string | null;
  unitPriceValue: number | null;
  isRocket: boolean | null;
  badges: string[] | null;
  collection: string;
}

interface CollectionSectionProps {
  slug: string;
  title: string;
  description: string;
  products: Product[];
  initialCount?: number;
  expandedCount?: number;
}

export function CollectionSection({
  slug,
  title,
  description,
  products,
  initialCount = 3,
  expandedCount = 15,
}: CollectionSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...products].sort((a, b) => {
    const aVal = a.unitPriceValue && a.unitPriceValue > 0 ? a.unitPriceValue : Infinity;
    const bVal = b.unitPriceValue && b.unitPriceValue > 0 ? b.unitPriceValue : Infinity;
    return aVal - bVal || a.salePrice - b.salePrice;
  });

  if (sorted.length === 0) return null;

  const visible = sorted.slice(0, expanded ? expandedCount : initialCount);
  const canExpand = !expanded && sorted.length > initialCount;
  const hasMoreAfterExpand =
    expanded && sorted.length > expandedCount ? sorted.length - expandedCount : 0;

  return (
    <section
      id={`collection-${slug}`}
      className="mb-2 scroll-mt-16"
    >
      <div className="px-4 pt-6 pb-2">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div>
        {visible.map((product) => (
          <DealListItem
            key={product.id}
            name={product.name}
            imageUrl={product.imageUrl}
            link={product.link}
            salePrice={product.salePrice}
            originalPrice={product.originalPrice}
            discountRate={product.discountRate}
            unitPriceText={product.unitPriceText}
            isRocket={product.isRocket}
            badges={product.badges}
            collection={product.collection}
            collectionDisplay={title}
          />
        ))}
      </div>
      {canExpand && (
        <div className="px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full rounded-lg border border-border bg-card py-2.5 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            {title} 더보기 ({Math.min(expandedCount, sorted.length) - initialCount}개)
          </button>
        </div>
      )}
      {hasMoreAfterExpand > 0 && (
        <p className="px-4 pt-2 text-center text-[11px] text-muted-foreground">
          + {hasMoreAfterExpand}개 더 있음
        </p>
      )}
    </section>
  );
}
