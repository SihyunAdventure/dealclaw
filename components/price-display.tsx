interface PriceDisplayProps {
  salePrice: number;
  originalPrice: number | null;
  discountRate: number | null;
  unitPriceText: string | null;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

export function PriceDisplay({
  salePrice,
  originalPrice,
  discountRate,
  unitPriceText,
}: PriceDisplayProps) {
  const hasDiscount = (discountRate ?? 0) > 0 && (originalPrice ?? 0) > salePrice;

  return (
    <div className="flex flex-col gap-1">
      {unitPriceText && (
        <p className="text-[15px] font-bold text-foreground">
          {unitPriceText}
        </p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {hasDiscount && (
          <>
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(originalPrice)}원
            </span>
            <span className="text-xs font-semibold text-red-500">
              {discountRate}%
            </span>
          </>
        )}
        <span className="text-sm font-semibold text-foreground">
          {formatPrice(salePrice)}원
        </span>
      </div>
    </div>
  );
}
