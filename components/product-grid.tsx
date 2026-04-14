"use client";

import { useState } from "react";
import { ProductCard } from "./product-card";

type SortKey = "unitPrice" | "salePrice";

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
}

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  const [sortKey, setSortKey] = useState<SortKey>("unitPrice");

  const sorted = [...products].sort((a, b) => {
    if (sortKey === "unitPrice") {
      const aVal = a.unitPriceValue ?? Infinity;
      const bVal = b.unitPriceValue ?? Infinity;
      return aVal - bVal || a.salePrice - b.salePrice;
    }
    return a.salePrice - b.salePrice;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 px-1">
        <p className="text-sm text-muted-foreground">
          {products.length}개 상품
        </p>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setSortKey("unitPrice")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              sortKey === "unitPrice"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            100g당 가격순
          </button>
          <button
            onClick={() => setSortKey("salePrice")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              sortKey === "salePrice"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            구매가순
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((product) => (
          <ProductCard
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
          />
        ))}
      </div>
    </div>
  );
}
