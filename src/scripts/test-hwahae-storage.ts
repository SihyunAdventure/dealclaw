// SIH-570 Phase 4 스토리지 단위 테스트.
// 네트워크·실 DB 없이 두 가지 레벨로 검증:
//   1. 순수 row 빌더 — 스키마 필드와 런타임 타입 매핑이 맞는지
//   2. 오케스트레이터 — mock db 를 주입해 insert 호출 횟수·대상 테이블·row 수 확인
//
// 실행: npx tsx src/scripts/test-hwahae-storage.ts

import { readFileSync } from "fs";
import { resolve } from "path";
import {
  parseBrandRankings,
  parseCategoryTree,
  parseGatewayRanking,
  parseThemes,
  selectLeafCategories,
} from "../crawl/hwahae-parser";
import {
  buildAwardRow,
  buildBrandRankingSnapshotRow,
  buildBrandRankRow,
  buildBrandRow,
  buildCategoryNodeRow,
  buildProductRow,
  buildProductTopicRows,
  buildRankingSnapshotRow,
  buildThemeRow,
  persistCrawlOutcome,
  type HwahaeDb,
} from "../crawl/hwahae-storage";
import type {
  HwahaeAwardRecord,
  HwahaeBrandRanked,
  HwahaeRankedProduct,
  HwahaeRankingCategoryNode,
  HwahaeThemeMeta,
} from "../crawl/hwahae-types";

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

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(FIXTURES_DIR, name), "utf-8"),
  ) as Record<string, unknown>;
}
function pp(nd: Record<string, unknown>): Record<string, unknown> {
  return ((nd.props as Record<string, unknown>).pageProps as Record<
    string,
    unknown
  >) ?? {};
}

// ──────────── mock db ────────────
// drizzle insert().values().onConflictDoUpdate() 체인을 thenable 로 시뮬레이션.
// 실제 타입 호환은 HwahaeDb 의 헐렁한 interface 로 충분.

interface InsertCall {
  table: unknown;
  values: unknown;
  onConflict: "update" | "nothing" | null;
}

function makeMockDb(): { db: HwahaeDb; calls: InsertCall[] } {
  const calls: InsertCall[] = [];
  const db = {
    insert: (table: unknown) => {
      const call: InsertCall = { table, values: null, onConflict: null };
      calls.push(call);
      return {
        values: (values: unknown) => {
          call.values = values;
          const chain = {
            onConflictDoUpdate: async () => {
              call.onConflict = "update";
            },
            onConflictDoNothing: async () => {
              call.onConflict = "nothing";
            },
            then: (res: (v: unknown) => void) => res(undefined),
          };
          return chain;
        },
      };
    },
  } as unknown as HwahaeDb;
  return { db, calls };
}

// ──────────── test 1: pure row builders ────────────
function testBuilders() {
  console.log("\n== row builders ==");
  const now = new Date("2026-04-15T21:00:00Z");
  const crawledAt = new Date("2026-04-15T06:00:00Z");

  // 픽스처에서 샘플 product 하나 뽑기
  const cat = pp(readFixture("category.json"));
  const catProducts = parseGatewayRanking(
    cat.rankingProducts as Parameters<typeof parseGatewayRanking>[0],
    "category",
    2,
    "스킨케어",
  );
  check(catProducts.length > 0, `sample products=${catProducts.length}`);
  const p = catProducts[0];

  // ThemeMeta
  const themeMeta: HwahaeThemeMeta = {
    id: 1,
    englishName: "category",
    shortcutName: "카테고리별",
    rankingType: "CATEGORY",
    themeIconUrl: "url",
    defaultRankingDetailId: null,
  };
  const themeRow = buildThemeRow(themeMeta, now);
  check(themeRow.id === 1 && themeRow.englishName === "category", "themeRow 기본 필드");
  check(themeRow.lastCrawledAt === now, "themeRow.lastCrawledAt");

  // CategoryNode
  const node: HwahaeRankingCategoryNode = {
    id: 10,
    parentId: 1,
    themeEnglishName: "category",
    name: "스킨",
    englishName: null,
    depth: 2,
    rankingType: "CATEGORY",
    maxRank: 100,
    isAdvertised: false,
    lastUpdatedAt: null,
    lastUpdatedDescription: null,
  };
  const nodeRow = buildCategoryNodeRow(node, now);
  check(nodeRow.parentId === 1 && nodeRow.depth === 2, "nodeRow 트리 필드");

  // Brand
  const brandRow = buildBrandRow(p, now);
  check(brandRow.brandId === p.brand.brandId, "brandRow.brandId");
  check(brandRow.name === p.brand.name, "brandRow.name");

  // Product
  const prodRow = buildProductRow(p, now);
  check(prodRow.productId === p.productId, "prodRow.productId");
  check(prodRow.brandId === p.brand.brandId, "prodRow.brandId FK");
  check(prodRow.currentRankTheme === "category", "prodRow.currentRankTheme");
  check(
    prodRow.currentRating === null || typeof prodRow.currentRating === "string",
    "prodRow.currentRating numeric → string | null",
  );

  // Ranking snapshot
  const snapRow = buildRankingSnapshotRow(p, crawledAt);
  check(snapRow.productId === p.productId, "snapRow.productId");
  check(snapRow.crawledAt === crawledAt, "snapRow.crawledAt");
  check(snapRow.theme === "category", "snapRow.theme");

  // Brand snapshot
  const brandRanked: HwahaeBrandRanked = {
    brand: p.brand,
    rank: 1,
    rankDelta: 0,
    isRankNew: false,
  };
  const brSnap = buildBrandRankingSnapshotRow(brandRanked, crawledAt);
  check(brSnap.brandId === p.brand.brandId && brSnap.rank === 1, "brand snap");

  // buildBrandRankRow — current_* 포함 확인
  const brBase = buildBrandRankRow(brandRanked, now);
  check(
    brBase.currentRank === 1 && brBase.currentIsRankNew === false,
    "brandRank current_*",
  );

  // Product topics
  const topicRows = buildProductTopicRows(p, crawledAt);
  check(topicRows.length === p.topics.length, `topicRows=${topicRows.length}`);
  if (topicRows.length > 0) {
    check(topicRows[0].topicRank === 0, "topicRank[0]=0");
    check(typeof topicRows[0].score === "number", "topic.score number");
  }

  // Award
  const award: HwahaeAwardRecord = {
    productId: 1,
    year: 2025,
    awardId: 115,
    theme: "베스트 신제품",
    category: null,
    rank: 1,
    isHallOfFame: false,
  };
  const awardRow = buildAwardRow(award, crawledAt);
  check(awardRow.productId === 1 && awardRow.year === 2025, "awardRow");
}

// ──────────── test 2: persistCrawlOutcome 호출 분포 ────────────
async function testPersistOrchestration() {
  console.log("\n== persistCrawlOutcome (mock db) ==");

  // 전체 픽스처 조립
  const categoryNd = pp(readFixture("category.json"));
  const skinNd = pp(readFixture("skin.json"));
  const brandNd = pp(readFixture("brand.json"));

  const themes = parseThemes(categoryNd.rankings);
  const categoryTree = parseCategoryTree(categoryNd.rankingsCategories, "category");
  const skinTree = parseCategoryTree(skinNd.rankingsCategories, "skin");
  const categoryNodes = [...categoryTree, ...skinTree];

  const catProducts = parseGatewayRanking(
    categoryNd.rankingProducts as Parameters<typeof parseGatewayRanking>[0],
    "category",
    2,
    "스킨케어",
  );
  const { brands, products: brandProducts } = parseBrandRankings(
    brandNd.brandRankings,
    brandNd.brandProductsLists,
    2058,
  );
  const products = [...catProducts, ...brandProducts];

  const outcome = {
    themes,
    categoryNodes,
    products,
    brandRanks: brands,
    errors: [],
  };

  const { db, calls } = makeMockDb();
  const startedAt = new Date("2026-04-15T06:00:00Z");
  const summary = await persistCrawlOutcome(db, outcome, { startedAt });

  // 요약 검증
  check(summary.themesUpserted === 5, `themesUpserted=${summary.themesUpserted}`);
  check(
    summary.categoryNodesUpserted === categoryNodes.length,
    `categoryNodesUpserted=${summary.categoryNodesUpserted}`,
  );
  check(
    summary.productsUpserted ===
      new Set(products.map((p) => p.productId)).size,
    `productsUpserted=${summary.productsUpserted} (dedupe)`,
  );
  check(
    summary.rankingSnapshotsInserted === products.length,
    `rankingSnapshots=${summary.rankingSnapshotsInserted}`,
  );
  check(
    summary.brandSnapshotsInserted === brands.length,
    `brandSnapshots=${summary.brandSnapshotsInserted}`,
  );
  check(
    summary.productTopicsInserted > 0,
    `productTopics=${summary.productTopicsInserted}`,
  );
  check(summary.awardsInserted === 0, "awards=0 (not passed)");

  // insert 호출 횟수 검증 (대략)
  // - themes: 5
  // - categoryNodes: N (개별 호출)
  // - brands: dedupe M
  // - products: dedupe K
  // - rankingSnapshots: 1 (bulk)
  // - brandSnapshots: 1 (bulk)
  // - productTopics: 1 (bulk, flat)
  // - awards: 0 (skip)
  const bulkInserts = calls.filter((c) => c.onConflict === null);
  const conflictUpdates = calls.filter((c) => c.onConflict === "update");
  check(bulkInserts.length >= 3, `bulk insert ≥3 (got ${bulkInserts.length})`);
  check(
    conflictUpdates.length >=
      5 /* themes */ +
        categoryNodes.length +
        summary.brandsUpserted +
        summary.productsUpserted,
    `upsert(onConflictDoUpdate) ≥ ${
      5 + categoryNodes.length + summary.brandsUpserted + summary.productsUpserted
    } (got ${conflictUpdates.length})`,
  );
}

// ──────────── test 3: category tree 저장 시 부모→자식 순서 ────────────
async function testCategoryOrder() {
  console.log("\n== category tree 저장 순서 (depth asc) ==");
  const nodes: HwahaeRankingCategoryNode[] = [
    {
      id: 5,
      parentId: 2,
      themeEnglishName: "category",
      name: "leaf",
      englishName: null,
      depth: 3,
      rankingType: "CATEGORY",
      maxRank: 100,
      isAdvertised: false,
      lastUpdatedAt: null,
      lastUpdatedDescription: null,
    },
    {
      id: 1,
      parentId: null,
      themeEnglishName: "category",
      name: "root",
      englishName: null,
      depth: 1,
      rankingType: "CATEGORY",
      maxRank: 100,
      isAdvertised: false,
      lastUpdatedAt: null,
      lastUpdatedDescription: null,
    },
    {
      id: 2,
      parentId: 1,
      themeEnglishName: "category",
      name: "mid",
      englishName: null,
      depth: 2,
      rankingType: "CATEGORY",
      maxRank: 100,
      isAdvertised: false,
      lastUpdatedAt: null,
      lastUpdatedDescription: null,
    },
  ];
  const { db, calls } = makeMockDb();
  await persistCrawlOutcome(
    db,
    {
      themes: [],
      categoryNodes: nodes,
      products: [],
      brandRanks: [],
      errors: [],
    },
    { startedAt: new Date() },
  );
  const catCalls = calls.filter((c) => c.onConflict === "update").slice(0, 3);
  const insertedIds = catCalls.map(
    (c) => (c.values as { id: number }).id,
  );
  check(
    insertedIds[0] === 1 && insertedIds[1] === 2 && insertedIds[2] === 5,
    `insert 순서 root→mid→leaf (got ${insertedIds.join(",")})`,
  );
}

// ──────────── test 4: brand merge — rank 정보가 덮어씌움 ────────────
async function testBrandMerge() {
  console.log("\n== brand row merge (rank 덮어쓰기) ==");
  const now = new Date();
  const cat = pp(readFixture("category.json"));
  const catProducts = parseGatewayRanking(
    cat.rankingProducts as Parameters<typeof parseGatewayRanking>[0],
    "category",
    2,
    null,
  );
  const p = catProducts[0];
  const brandRanked: HwahaeBrandRanked = {
    brand: p.brand,
    rank: 7,
    rankDelta: 2,
    isRankNew: false,
  };
  const { db, calls } = makeMockDb();
  await persistCrawlOutcome(
    db,
    {
      themes: [],
      categoryNodes: [],
      products: [p],
      brandRanks: [brandRanked],
      errors: [],
    },
    { startedAt: now },
  );
  // brand upsert 의 values 에 currentRank=7 이 포함됐는지
  const brandCall = calls.find((c) => {
    const v = c.values as { brandId?: number; currentRank?: number };
    return v?.brandId === p.brand.brandId && v?.currentRank === 7;
  });
  check(brandCall !== undefined, "brand row 에 currentRank=7 병합");
}

async function main() {
  console.log(`[fixtures] ${FIXTURES_DIR}`);
  testBuilders();
  await testPersistOrchestration();
  await testCategoryOrder();
  await testBrandMerge();

  console.log("");
  if (failed > 0) {
    console.error(`❌ ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("✅ storage smoke test 통과");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
