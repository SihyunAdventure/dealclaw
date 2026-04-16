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
  reviewCount: number;
  ratingAverage: number | null;
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
  scheduleHourKst?: number;
}

export type OliveYoungFlag = "sale" | "coupon" | "gift" | "delivery";

export interface OliveYoungRankedProduct {
  // 식별
  rank: number;              // data-impression 끝 숫자 (1..100)
  productId: string;         // goodsNo, ex "A000000158752"
  dispCatNo: string;         // ex "90000010009"

  // 표시
  brand: string;
  name: string;
  categoryPath: string;      // ex "01 > 마스크팩 > 시트팩"

  // 가격
  salePrice: number;
  originalPrice: number;
  discountRate: number;
  hasPriceRange: boolean;    // "30,000원 ~" 같이 variant 가격대가 존재

  // 리소스
  link: string;
  imageUrl: string;

  // 배지
  isTodayDeal: boolean;      // "오특(오늘의 특가)" 대상 여부
  flags: OliveYoungFlag[];   // ["sale","coupon","gift","delivery"] 중 부착된 것
}
