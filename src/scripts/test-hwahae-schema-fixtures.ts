// SIH-567 Phase 1 스키마 smoke test.
// Phase 0 (SIH-566) 에서 Playwright 로 떴던 __NEXT_DATA__ JSON 을 읽어
// hwahae-types 에 정의한 HwahaeRankedProduct / HwahaeBrandRanked / HwahaeAwardRecord 로
// 매핑해본다. 스키마가 실데이터를 빠짐없이 수용하는지(필드 존재·타입·null 허용) 검증.
//
// 실행:
//   FIXTURES_DIR=/path npx tsx src/scripts/test-hwahae-schema-fixtures.ts
//   기본값: ../sih-566-hwahae-phase0/.omc/research/nextdata

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type {
  HwahaeAwardRecord,
  HwahaeBrand,
  HwahaeBrandRanked,
  HwahaeRankedProduct,
  HwahaeReviewTopic,
  HwahaeThemeSlug,
} from "../crawl/hwahae-types";

interface RawBrand {
  id: number;
  name: string;
  alias?: string;
  full_name?: string;
  image_url?: string | null;
}
interface RawGoods {
  id: number;
  product_id: number;
  capacity?: string | null;
  price: number;
  discount_rate: number;
  discount_price: number | null;
  image_url?: string | null;
  name: string;
}
interface RawProductTopic {
  review_topic: { id: number; name: string; sentence?: string | null };
  is_positive: boolean;
  score: number;
  review_count: number;
}
interface RawProduct {
  id: number;
  uid: string;
  name: string;
  image_url?: string | null;
  review_count?: number;
  review_rating?: number | null;
  is_commerce?: boolean;
  package_info?: string | null;
  price?: number;
  product_topics?: RawProductTopic[];
}
interface RawDetail {
  brand: RawBrand;
  goods: RawGoods | null; // 실측: is_commerce=false 상품은 goods=null
  product: RawProduct;
  is_rank_new: boolean;
  rank_delta: number | null;
}
interface RawBrandRanking {
  brand: RawBrand;
  rank_delta: number | null;
  is_rank_new: boolean;
}

const FIXTURES_DIR =
  process.env.FIXTURES_DIR ??
  resolve(
    process.cwd(),
    "../sih-566-hwahae-phase0/.omc/research/nextdata",
  );

interface Issue {
  file: string;
  index: number | null;
  field: string;
  got: string;
  detail?: string;
}
const issues: Issue[] = [];

function require_(cond: boolean, i: Omit<Issue, "got"> & { got?: string }) {
  if (!cond) issues.push({ ...i, got: i.got ?? "missing/invalid" });
}

function mapBrand(b: RawBrand): HwahaeBrand {
  return {
    brandId: b.id,
    name: b.name,
    alias: b.alias ?? null,
    fullName: b.full_name ?? null,
    imageUrl: b.image_url ?? null,
  };
}

function mapTopics(list: RawProductTopic[] | undefined): HwahaeReviewTopic[] {
  return (list ?? []).map((t, i) => ({
    topicId: t.review_topic.id,
    topicName: t.review_topic.name,
    topicSentence: t.review_topic.sentence ?? null,
    isPositive: t.is_positive,
    score: t.score,
    reviewCount: t.review_count,
    topicRank: i,
  }));
}

function mapDetail(
  raw: RawDetail,
  theme: HwahaeThemeSlug,
  themeId: number,
  rank: number,
  file: string,
  index: number,
): HwahaeRankedProduct {
  const p = raw.product;
  const g = raw.goods; // null 가능 (is_commerce=false)
  require_(typeof p?.id === "number", {
    file, index, field: "product.id", got: String(typeof p?.id),
  });
  require_(typeof p?.uid === "string" && p.uid.length > 0, {
    file, index, field: "product.uid", got: String(p?.uid),
  });
  require_(typeof raw.brand?.id === "number", {
    file, index, field: "brand.id", got: String(typeof raw.brand?.id),
  });
  // goods 존재 시에만 가격·할인 검증. goods=null 은 정상 케이스(비판매 상품).
  if (g) {
    require_(typeof g.price === "number", {
      file, index, field: "goods.price", got: String(typeof g.price),
    });
    require_(typeof g.discount_rate === "number", {
      file, index, field: "goods.discount_rate", got: String(typeof g.discount_rate),
    });
  }

  return {
    productId: p.id,
    uid: p.uid,
    goodsId: g?.id ?? null,
    brand: mapBrand(raw.brand),
    name: p.name,
    goodsName: g?.name ?? null,
    imageUrl: p.image_url ?? "",
    goodsImageUrl: g?.image_url ?? null,
    packageInfo: p.package_info ?? "",
    capacity: g?.capacity ?? null,
    salePrice: g?.price ?? null,
    originalPrice: p.price ?? null,
    discountRate: g?.discount_rate ?? null,
    discountPrice: g?.discount_price ?? null,
    rating: p.review_rating ?? null,
    reviewCount: p.review_count ?? 0,
    isCommerce: p.is_commerce ?? false,
    theme,
    themeId,
    themeLabel: null, // Phase 1 smoke test 에서는 카테고리 트리 join 생략
    rank,
    rankDelta: raw.rank_delta,
    isRankNew: raw.is_rank_new,
    topics: mapTopics(p.product_topics),
  };
}

function mapBrandRanked(
  raw: RawBrandRanking,
  rank: number,
): HwahaeBrandRanked {
  return {
    brand: mapBrand(raw.brand),
    rank,
    rankDelta: raw.rank_delta,
    isRankNew: raw.is_rank_new,
  };
}

function readJson(name: string): unknown {
  const path = resolve(FIXTURES_DIR, name);
  if (!existsSync(path)) throw new Error(`fixture missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function processRankingPage(
  name: string,
  theme: HwahaeThemeSlug,
  themeId: number,
): HwahaeRankedProduct[] {
  const nd = readJson(name) as {
    props: {
      pageProps: {
        rankingProducts: {
          meta: {
            pagination: { page: number; page_size: number; total_count: number };
          };
          data: { details: RawDetail[] };
        };
      };
    };
  };
  const pp = nd.props.pageProps;
  const { page, page_size } = pp.rankingProducts.meta.pagination;
  return pp.rankingProducts.data.details.map((d, i) =>
    mapDetail(d, theme, themeId, (page - 1) * page_size + i + 1, name, i),
  );
}

function processBrandPage(name: string): {
  brands: HwahaeBrandRanked[];
  products: HwahaeRankedProduct[];
} {
  const nd = readJson(name) as {
    props: {
      pageProps: {
        brandRankings: RawBrandRanking[];
        brandProductsLists: Record<string, RawDetail>[];
      };
    };
  };
  const pp = nd.props.pageProps;
  const brands = pp.brandRankings.map((b, i) => mapBrandRanked(b, i + 1));
  const products: HwahaeRankedProduct[] = [];
  pp.brandProductsLists.forEach((perBrand, bi) => {
    // perBrand 는 {"0": detail, "1": detail, ...} 형태 object 로 옴
    Object.entries(perBrand).forEach(([k, raw]) => {
      const idx = Number(k);
      if (Number.isNaN(idx)) return;
      products.push(mapDetail(raw, "brand", 2058, bi + 1, name, idx));
    });
  });
  return { brands, products };
}

function processAwards(name: string): HwahaeAwardRecord[] {
  const nd = readJson(name) as {
    props: {
      pageProps: {
        year: number;
        awardId: number | null;
        awardsYears: Array<{ id: number | null; year: number; is_legacy: boolean }>;
        dehydratedState?: {
          queries?: Array<{ queryKey: unknown[]; state: { data: unknown } }>;
        };
      };
    };
  };
  const pp = nd.props.pageProps;
  // Phase 0 실측: 2015~2022 는 is_legacy=true (id=null, 본문 없음).
  const valid = pp.awardsYears.filter((y) => !y.is_legacy && y.id !== null);
  require_(valid.length >= 3, {
    file: name, index: null,
    field: "awardsYears(non-legacy)", got: String(valid.length),
    detail: "expected ≥3 (2023/2024/2025)",
  });

  // dehydratedState 안에 상품 리스트가 들어있을 수 있음 — 구조 확인만 하고 매핑은 Phase 2 범위.
  const q = pp.dehydratedState?.queries?.[0];
  if (q) {
    require_(Array.isArray(q.queryKey) && q.queryKey.length >= 2, {
      file: name, index: null,
      field: "dehydratedState.queries[0].queryKey",
      got: JSON.stringify(q.queryKey),
    });
  }
  return []; // Phase 1 smoke test 에서는 award 레코드 실제 매핑까진 하지 않음
}

function check(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ ${msg}`);
    issues.push({ file: "-", index: null, field: "final", got: msg });
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

function main() {
  console.log(`[fixtures] ${FIXTURES_DIR}`);
  if (!existsSync(FIXTURES_DIR)) {
    console.error(`FIXTURES_DIR not found: ${FIXTURES_DIR}`);
    process.exit(2);
  }

  const trending = processRankingPage("trending.json", "trending", 5102);
  const category = processRankingPage("category.json", "category", 2);
  const skin = processRankingPage("skin.json", "skin", 174);
  const age = processRankingPage("age.json", "age", 1372);
  const { brands, products: brandProducts } = processBrandPage("brand.json");
  processAwards("awards.json");

  const allRanked = [...trending, ...category, ...skin, ...age, ...brandProducts];

  console.log("\n== 매핑 결과 ==");
  console.log(`  trending: ${trending.length}`);
  console.log(`  category: ${category.length}`);
  console.log(`  skin: ${skin.length}`);
  console.log(`  age: ${age.length}`);
  console.log(`  brand 상품: ${brandProducts.length} (브랜드 ${brands.length}개)`);
  console.log(`  총 ranked product: ${allRanked.length}`);

  console.log("\n== 필드 커버리지 점검 ==");
  const topicCount = allRanked.reduce((s, p) => s + p.topics.length, 0);
  const nullRating = allRanked.filter((p) => p.rating === null).length;
  const hasCommerce = allRanked.filter((p) => p.isCommerce).length;
  const rankNew = allRanked.filter((p) => p.isRankNew).length;
  const uids = new Set(allRanked.map((p) => p.uid));

  check(trending.length === 20, `trending=20 (got ${trending.length})`);
  check(category.length === 20, `category=20 (got ${category.length})`);
  check(skin.length === 20, `skin=20 (got ${skin.length})`);
  check(age.length === 20, `age=20 (got ${age.length})`);
  check(brands.length === 10, `brandRankings=10 (got ${brands.length})`);
  check(brandProducts.length >= 20, `brand 상품 ≥20 (got ${brandProducts.length})`);
  check(topicCount > 0, `product_topics 매핑 → ${topicCount}건`);
  check(uids.size > 0, `uid unique (고유 상품 수 ${uids.size})`);
  check(issues.length === 0, `필드 검증 issue 0 (${issues.length})`);

  console.log("\n== 참고 통계 ==");
  console.log(`  rating=null 상품: ${nullRating}`);
  console.log(`  isCommerce=true: ${hasCommerce}`);
  console.log(`  isRankNew=true: ${rankNew}`);

  if (issues.length > 0) {
    console.log("\n== 이슈 ==");
    issues.slice(0, 20).forEach((i) =>
      console.log(
        `  ${i.file}[${i.index}] ${i.field}=${i.got}${i.detail ? ` — ${i.detail}` : ""}`,
      ),
    );
    process.exit(1);
  }
  console.log("\n✅ 스키마 smoke test 통과");
}

main();
