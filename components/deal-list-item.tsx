"use client";

import Image from "next/image";
import { useSubscribeModal } from "./subscribe-modal";

interface DealListItemProps {
  name: string;
  imageUrl: string | null;
  link: string;
  salePrice: number;
  originalPrice: number | null;
  discountRate: number | null;
  unitPriceText: string | null;
  isRocket: boolean | null;
  badges: string[] | null;
  collection: string;
  collectionDisplay: string;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

export function DealListItem({
  name,
  imageUrl,
  link,
  salePrice,
  originalPrice,
  discountRate,
  unitPriceText,
  isRocket,
  badges,
  collection,
  collectionDisplay,
}: DealListItemProps) {
  const hasDiscount =
    (discountRate ?? 0) > 0 && (originalPrice ?? 0) > salePrice;
  const { open } = useSubscribeModal();

  function handleClick(e: React.MouseEvent) {
    // 명령-클릭(맥) / Ctrl-클릭(윈) / 휠 클릭은 기본 동작(새 탭 열기) 유지
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    open({
      collection,
      collectionDisplay,
      productUrl: link,
    });
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 border-b border-border"
    >
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-contain p-1"
            sizes="80px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No img
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <p className="text-[13px] leading-snug text-foreground line-clamp-2">
          {name}
        </p>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {hasDiscount && (
            <span className="text-xs font-bold text-destructive">
              {discountRate}%
            </span>
          )}
          <span className="text-[15px] font-bold text-foreground">
            {formatPrice(salePrice)}
            <span className="text-xs font-normal">원</span>
          </span>
          {hasDiscount && originalPrice && (
            <span className="text-[11px] text-muted-foreground line-through">
              {formatPrice(originalPrice)}원
            </span>
          )}
        </div>
        {unitPriceText && (
          <p className="text-[11px] text-muted-foreground">{unitPriceText}</p>
        )}
        {(isRocket || (badges && badges.length > 0)) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {isRocket && (
              <span className="inline-flex items-center rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                로켓배송
              </span>
            )}
            {badges?.filter((b) => b !== "로켓").map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
