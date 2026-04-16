// 화해 크롤 데이터 런타임 타입.
// 올영 타입이 있는 types.ts 와는 별도 파일 — 파일 단위 병렬 작업 충돌 방지.
// Phase 0 (SIH-566) __NEXT_DATA__ 실측 기반.

export type HwahaeThemeSlug =
  | "trending"
  | "category"
  | "skin"
  | "age"
  | "brand";

export type HwahaeRankingType =
  | "TRENDING"
  | "CATEGORY"
  | "SKIN"
  | "AGE"
  | "BRAND";

export interface HwahaeThemeMeta {
  id: number;
  englishName: HwahaeThemeSlug;
  shortcutName: string;
  rankingType: HwahaeRankingType;
  themeIconUrl: string;
  defaultRankingDetailId: number | null;
}

export interface HwahaeRankingCategoryNode {
  id: number;
  parentId: number | null;
  themeEnglishName: HwahaeThemeSlug;
  name: string;
  englishName: string | null;
  depth: number;
  rankingType: HwahaeRankingType;
  maxRank: number | null;
  isAdvertised: boolean;
  lastUpdatedAt: Date | null;
  lastUpdatedDescription: string | null;
}

export interface HwahaeBrand {
  brandId: number;
  name: string;
  alias: string | null;
  fullName: string | null;
  imageUrl: string | null;
}

export interface HwahaeReviewTopic {
  topicId: number;
  topicName: string;
  topicSentence: string | null;
  isPositive: boolean;
  score: number;
  reviewCount: number;
  topicRank: number; // product.product_topics 내 순서 (0~2)
}

// 랭킹 페이지 1 상품 = details[i]. product/goods/brand 를 평탄화한 표현.
export interface HwahaeRankedProduct {
  // 식별
  productId: number;
  uid: string;
  goodsId: number | null;

  // 브랜드
  brand: HwahaeBrand;

  // 표시
  name: string;
  goodsName: string | null;
  imageUrl: string;
  goodsImageUrl: string | null;
  packageInfo: string;
  capacity: string | null;

  // 가격 — is_commerce=false 상품은 goods 자체가 null 이라 3종 모두 nullable.
  salePrice: number | null;
  originalPrice: number | null;
  discountRate: number | null;
  discountPrice: number | null;

  // 리뷰·상태
  rating: number | null;
  reviewCount: number;
  isCommerce: boolean;

  // 랭킹 (수집 컨텍스트 포함)
  theme: HwahaeThemeSlug;
  themeId: number;
  themeLabel: string | null;
  rank: number;
  rankDelta: number | null;
  isRankNew: boolean;

  // 토픽
  topics: HwahaeReviewTopic[];
}

// brand 테마 전용 brandRankings[i].
export interface HwahaeBrandRanked {
  brand: HwahaeBrand;
  rank: number;
  rankDelta: number | null;
  isRankNew: boolean;
}

// 어워드 1건.
export interface HwahaeAwardRecord {
  productId: number;
  year: number;
  awardId: number | null;
  theme: string; // "베스트 신제품", "효능/효과", "비건", "넥스트 뷰티", "라이징 트렌드"
  category: string | null;
  rank: number | null;
  isHallOfFame: boolean;
}
