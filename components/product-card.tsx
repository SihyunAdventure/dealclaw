import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { PriceDisplay } from "./price-display";

interface ProductCardProps {
  name: string;
  imageUrl: string | null;
  link: string;
  salePrice: number;
  originalPrice: number | null;
  discountRate: number | null;
  unitPriceText: string | null;
  isRocket: boolean | null;
  badges: string[] | null;
}

export function ProductCard({
  name,
  imageUrl,
  link,
  salePrice,
  originalPrice,
  discountRate,
  unitPriceText,
  badges,
}: ProductCardProps) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
    >
      <div className="relative aspect-square bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-contain p-2"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            이미지 없음
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm leading-tight text-foreground line-clamp-2 min-h-[2.5em]">
          {name}
        </p>
        <PriceDisplay
          salePrice={salePrice}
          originalPrice={originalPrice}
          discountRate={discountRate}
          unitPriceText={unitPriceText}
        />
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {badges.map((badge) => (
              <Badge
                key={badge}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {badge}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
