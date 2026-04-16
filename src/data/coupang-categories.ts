/**
 * 쿠팡 홈 페이지 카테고리 칩에 노출되는 카테고리 목록.
 *
 * `slug`은 `products.collection` 값과 매칭됨.
 * 일부 카테고리는 아직 크롤링이 셋업되지 않아 데이터가 비어 있을 수 있다 —
 * 그 경우 빈 상태로 노출되며, 크롤러가 추가되면 자동으로 채워진다.
 */

export interface CoupangCategory {
  slug: string;
  displayName: string;
}

export const coupangCategories: CoupangCategory[] = [
  { slug: "cleansing-oil", displayName: "클렌징오일" },
  { slug: "cleansing-foam", displayName: "클렌징폼" },
  { slug: "cleansing-water", displayName: "클렌징워터" },
  { slug: "toner-skin", displayName: "토너·스킨" },
  { slug: "mist", displayName: "미스트" },
  { slug: "essence", displayName: "에센스" },
  { slug: "serum-ampoule", displayName: "세럼·앰플" },
  { slug: "eye-cream", displayName: "아이크림" },
  { slug: "lotion", displayName: "로션" },
  { slug: "moisture-cream", displayName: "수분크림" },
  { slug: "cream", displayName: "크림" },
  { slug: "sunscreen", displayName: "선크림" },
  { slug: "sheet-mask", displayName: "마스크팩" },
];
