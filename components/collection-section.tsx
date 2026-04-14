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
  title: string;
  description: string;
  products: Product[];
}

export function CollectionSection({
  title,
  description,
  products,
}: CollectionSectionProps) {
  // 단위가격 기준 정렬, 최저가 상위 3개만
  const topDeals = [...products]
    .sort((a, b) => {
      const aVal = a.unitPriceValue ?? Infinity;
      const bVal = b.unitPriceValue ?? Infinity;
      return aVal - bVal || a.salePrice - b.salePrice;
    })
    .slice(0, 3);

  if (topDeals.length === 0) return null;

  return (
    <section className="mb-2">
      <div className="px-4 pt-6 pb-2">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div>
        {topDeals.map((product) => (
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
          />
        ))}
      </div>
    </section>
  );
}
