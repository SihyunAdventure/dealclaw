import type { Collection } from "../crawl/types";

export const collections: Collection[] = [
  {
    slug: "sunscreen",
    query: "선크림",
    displayName: "선크림",
    description: "SPF·PA 선크림 최저가를 10ml당 가격순으로 비교하세요.",
  },
  {
    slug: "cleansing-foam",
    query: "클렌징폼",
    displayName: "클렌징폼",
    description: "데일리 클렌징폼 최저가를 100ml당 가격으로 비교하세요.",
  },
  {
    slug: "sheet-mask",
    query: "마스크팩",
    displayName: "마스크팩",
    description: "시트 마스크팩 최저가를 1매당 가격으로 비교하세요.",
  },
];
