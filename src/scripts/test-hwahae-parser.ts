// SIH-568 Phase 2 파서 smoke test.
// Phase 0 __NEXT_DATA__ 픽스처로 src/crawl/hwahae-parser.ts 의 공개 함수 5종 검증.
//
// 실행:
//   npx tsx src/scripts/test-hwahae-parser.ts
//   FIXTURES_DIR=/path npx tsx src/scripts/test-hwahae-parser.ts
//
// SSR pageProps.rankingProducts 는 gateway 응답과 shape 가 동일하므로
// parseGatewayRanking 을 그 payload 로 곧바로 테스트할 수 있다(실 gateway 요청 없이).

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  parseBrandRankings,
  parseCategoryTree,
  parseGatewayRanking,
  parseThemes,
  selectLeafCategories,
  extractNextData,
  parseAwards,
  type RawGatewayResponse,
} from "../crawl/hwahae-parser";

const FIXTURES_DIR =
  process.env.FIXTURES_DIR ??
  resolve(
    process.cwd(),
    "../sih-566-hwahae-phase0/.omc/research/nextdata",
  );

let failed = 0;
function check(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

function readJson(name: string): Record<string, unknown> {
  const path = resolve(FIXTURES_DIR, name);
  if (!existsSync(path)) throw new Error(`fixture missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function pp(nd: Record<string, unknown>): Record<string, unknown> {
  return (
    ((nd.props as Record<string, unknown> | undefined)?.pageProps as
      | Record<string, unknown>
      | undefined) ?? {}
  );
}

function main() {
  console.log(`[fixtures] ${FIXTURES_DIR}`);
  if (!existsSync(FIXTURES_DIR)) {
    console.error(`FIXTURES_DIR not found: ${FIXTURES_DIR}`);
    process.exit(2);
  }

  // 1. parseGatewayRanking — SSR rankingProducts 가 gateway 와 동일 shape.
  console.log("\n== parseGatewayRanking ==");
  const themes: Array<{
    file: string;
    slug: "trending" | "category" | "skin" | "age";
    themeId: number;
    expect: number;
  }> = [
    { file: "trending.json", slug: "trending", themeId: 5102, expect: 20 },
    { file: "category.json", slug: "category", themeId: 2, expect: 20 },
    { file: "skin.json", slug: "skin", themeId: 174, expect: 20 },
    { file: "age.json", slug: "age", themeId: 1372, expect: 20 },
  ];
  for (const t of themes) {
    const props = pp(readJson(t.file));
    const rp = props.rankingProducts as RawGatewayResponse;
    const parsed = parseGatewayRanking(rp, t.slug, t.themeId, null);
    check(parsed.length === t.expect, `${t.slug} length=${parsed.length}`);
    check(
      parsed.every((p) => p.rank >= 1 && p.rank <= 100),
      `${t.slug} rank 1..100`,
    );
    check(
      parsed.every((p) => typeof p.productId === "number" && p.uid.length > 0),
      `${t.slug} product identity`,
    );
    // 첫 원소 rank = page 1, page_size 20 기준 1이어야 함
    check(parsed[0]?.rank === 1, `${t.slug} rank[0] === 1`);
  }

  // 2. parseGatewayRanking — goods null 수용 여부 (page=2 계산 검증 포함)
  console.log("\n== parseGatewayRanking — goods null + page offset ==");
  const synthetic: RawGatewayResponse = {
    meta: {
      pagination: { total_count: 100, count: 2, page: 2, page_size: 20 },
    },
    data: {
      details: [
        {
          brand: { id: 1, name: "T" },
          goods: null, // is_commerce=false 케이스
          product: {
            id: 999,
            uid: "x-uid",
            name: "비판매 상품",
            is_commerce: false,
          },
          is_rank_new: false,
          rank_delta: null,
        },
        {
          brand: { id: 2, name: "U" },
          goods: {
            id: 10,
            product_id: 1000,
            price: 12000,
            discount_rate: 10,
            discount_price: null,
            name: "판매 상품",
          },
          product: {
            id: 1000,
            uid: "y-uid",
            name: "판매 상품 본체",
            is_commerce: true,
            price: 13000,
          },
          is_rank_new: true,
          rank_delta: 3,
        },
      ],
    },
  };
  const syn = parseGatewayRanking(synthetic, "category", 2, "스킨케어");
  check(syn.length === 2, "synthetic length=2");
  check(syn[0].rank === 21 && syn[1].rank === 22, "page=2 rank offset 21/22");
  check(
    syn[0].salePrice === null &&
      syn[0].originalPrice === null &&
      syn[0].discountRate === null,
    "goods=null → 가격 3종 모두 null",
  );
  check(syn[0].isCommerce === false, "is_commerce=false 전파");
  check(
    syn[1].salePrice === 12000 &&
      syn[1].originalPrice === 13000 &&
      syn[1].discountRate === 10,
    "판매 상품 가격 정상 매핑",
  );
  check(syn[1].themeLabel === "스킨케어", "themeLabel 주입");

  // 3. parseThemes — 어떤 페이지에서도 5개 theme 메타가 내려옴.
  console.log("\n== parseThemes ==");
  const cat = pp(readJson("category.json"));
  const themesList = parseThemes(cat.rankings);
  check(themesList.length === 5, `themes length=${themesList.length}`);
  check(
    themesList.some((t) => t.englishName === "trending") &&
      themesList.some((t) => t.englishName === "brand"),
    "trending + brand theme 존재",
  );

  // 4. parseCategoryTree — category 테마는 depth 4 까지, 노드 수 > 100
  console.log("\n== parseCategoryTree (category) ==");
  const catTree = parseCategoryTree(cat.rankingsCategories, "category");
  check(catTree.length >= 100, `category tree size=${catTree.length} (>=100)`);
  check(catTree[0].parentId === null, "root parentId=null");
  check(
    catTree.filter((n) => n.depth === 1).length === 1,
    "depth=1 root 단일",
  );
  check(
    catTree.every((n) => n.themeEnglishName === "category"),
    "themeEnglishName 전파",
  );
  check(
    catTree.some((n) => (n.maxRank ?? 0) >= 20),
    "max_rank ≥ 20 노드 존재",
  );

  // 4b. skin 트리 — root 에 children 과 categories 동시 존재 케이스
  const skin = pp(readJson("skin.json"));
  const skinTree = parseCategoryTree(skin.rankingsCategories, "skin");
  check(skinTree.length > 1, `skin tree size=${skinTree.length}`);
  check(
    skinTree.every((n) => n.themeEnglishName === "skin"),
    "skin tree themeEnglishName",
  );
  const skinIds = new Set(skinTree.map((n) => n.id));
  check(skinIds.size === skinTree.length, "skin 노드 id 중복 없음");

  // 5. selectLeafCategories — 집합 노드 제외 + max_rank 필터
  console.log("\n== selectLeafCategories ==");
  const leaves = selectLeafCategories(catTree);
  check(leaves.length > 0, `leaves=${leaves.length}`);
  check(
    leaves.every((l) => (l.maxRank ?? 0) >= 20),
    "모든 leaf max_rank ≥ 20",
  );
  // 루트(집합) 노드 자신은 제외됐어야 함
  check(
    !leaves.some((l) => l.parentId === null),
    "루트 노드 leaf 아님",
  );
  // 리프가 부모 id 로 나오면 안 됨
  const parentIds = new Set(
    catTree.map((n) => n.parentId).filter((v): v is number => v !== null),
  );
  check(
    leaves.every((l) => !parentIds.has(l.id)),
    "leaf 는 다른 노드의 부모가 아님",
  );

  // 6. parseBrandRankings — brand 테마
  console.log("\n== parseBrandRankings ==");
  const brand = pp(readJson("brand.json"));
  const { brands, products: brandProducts } = parseBrandRankings(
    brand.brandRankings,
    brand.brandProductsLists,
    2058,
  );
  check(brands.length === 10, `brands=${brands.length} (expect 10)`);
  check(
    brands.every((b, i) => b.rank === i + 1),
    "brand rank 순차",
  );
  check(brandProducts.length >= 20, `brand products=${brandProducts.length}`);
  check(
    brandProducts.every((p) => p.theme === "brand" && p.themeId === 2058),
    "brand product theme 일관",
  );

  // 7. parseAwards — legacy 제외 + best-effort 수집
  console.log("\n== parseAwards ==");
  const awards = pp(readJson("awards.json"));
  const awardRecords = parseAwards(
    awards.awardsYears,
    awards.dehydratedState,
  );
  // dehydratedState 구조가 연도마다 달라 records 0 도 허용 — 런타임 에러 없이 동작만 보장.
  check(Array.isArray(awardRecords), "awards records is array");
  if (awardRecords.length > 0) {
    check(
      awardRecords.every((r) => r.year >= 2023),
      "legacy(2022 이하) 제외",
    );
  }

  // 8. extractNextData — HTML 추출기
  console.log("\n== extractNextData ==");
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"hello":"world"}}}</script></body></html>`;
  const ex = extractNextData(html) as {
    props: { pageProps: { hello: string } };
  } | null;
  check(ex?.props.pageProps.hello === "world", "extractNextData 파싱");
  check(extractNextData("<html></html>") === null, "no script → null");
  check(
    extractNextData(
      `<script id="__NEXT_DATA__">not-json</script>`,
    ) === null,
    "invalid JSON → null",
  );

  console.log("");
  if (failed > 0) {
    console.error(`❌ ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("✅ parser smoke test 통과");
}

main();
