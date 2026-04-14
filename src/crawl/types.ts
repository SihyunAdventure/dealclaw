export interface CrawledProduct {
  name: string;
  salePrice: number;
  originalPrice: number;
  discountRate: number;
  unitPriceText: string;
  unitPriceValue: number;
  coupangId: string;
  link: string;
  imageUrl: string;
  isRocket: boolean;
  badges: string[];
}

export interface CrawlResult {
  collection: string;
  products: CrawledProduct[];
  startedAt: Date;
  finishedAt: Date;
}

export interface Collection {
  slug: string;
  query: string;
  displayName: string;
  description: string;
}
