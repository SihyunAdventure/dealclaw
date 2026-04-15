// 화해(Hwahae) Phase 4 스토리지.
// crawlHwahaeRankings 결과를 Postgres 로 저장. drizzle 을 주입받아 테스트 가능.
//
// 구성:
// - build*Row 함수: 런타임 타입 → drizzle insert row. 순수 함수, 단위 테스트 대상.
// - upsert*/insert*: 실제 DB 호출. db 객체 주입 패턴(올영 run-crawl.ts 와 동일 neon-http drizzle).
// - persistCrawlOutcome: CrawlOutcome 전체를 받아 트랜잭션 없이(neon-http 미지원) 순차 저장.
//
// 주의:
// - lib/db/schema.ts 배럴엔 hwahae 가 아직 없음(SIH-572 연결 커밋 대상).
//   여기선 ./schema/hwahae 에서 직접 import — 배럴 통합 후에도 그대로 동작.
// - hwahae_crawl_runs 는 theme 별로 1 row. "all themes" 수집도 요약 row 1개.

import { sql } from "drizzle-orm";
import {
  hwahaeBrandRankingSnapshots,
  hwahaeBrands,
  hwahaeCrawlRuns,
  hwahaeProducts,
  hwahaeProductTopics,
  hwahaeRankingCategories,
  hwahaeRankingSnapshots,
  hwahaeThemes,
  hwahaeAwards,
} from "../../lib/db/schema/hwahae";
import type {
  HwahaeAwardRecord,
  HwahaeBrandRanked,
  HwahaeRankedProduct,
  HwahaeRankingCategoryNode,
  HwahaeThemeMeta,
} from "./hwahae-types";

/**
 * drizzle neon-http 인스턴스(또는 호환). 구체 schema 타입을 강제하지 않아
 * 호출자가 `drizzle(sql)` 또는 `drizzle(sql, { schema })` 양쪽으로 넘길 수 있다.
 */
export type HwahaeDb = {
  insert: (table: unknown) => {
    values: (values: unknown) => {
      onConflictDoUpdate?: (opts: unknown) => Promise<unknown> | unknown;
      onConflictDoNothing?: (opts?: unknown) => Promise<unknown> | unknown;
      returning?: (
        fields?: unknown,
      ) => Promise<Array<Record<string, unknown>>>;
      // 기본 체인으로도 await 가능해야 함 → thenable.
      then?: (resolve: (v: unknown) => void) => void;
    };
  };
};

// ─────────── 순수 row 빌더 ───────────

export function buildThemeRow(theme: HwahaeThemeMeta, now: Date) {
  return {
    id: theme.id,
    englishName: theme.englishName,
    shortcutName: theme.shortcutName,
    rankingType: theme.rankingType,
    themeIconUrl: theme.themeIconUrl,
    defaultRankingDetailId: theme.defaultRankingDetailId,
    lastCrawledAt: now,
    updatedAt: now,
  };
}

export function buildCategoryNodeRow(
  n: HwahaeRankingCategoryNode,
  now: Date,
) {
  return {
    id: n.id,
    parentId: n.parentId,
    themeEnglishName: n.themeEnglishName,
    name: n.name,
    englishName: n.englishName,
    depth: n.depth,
    rankingType: n.rankingType,
    maxRank: n.maxRank,
    isAdvertised: n.isAdvertised,
    lastUpdatedAt: n.lastUpdatedAt,
    lastUpdatedDescription: n.lastUpdatedDescription,
    lastCrawledAt: now,
    updatedAt: now,
  };
}

export function buildBrandRow(p: HwahaeRankedProduct, now: Date) {
  const b = p.brand;
  return {
    brandId: b.brandId,
    name: b.name,
    alias: b.alias,
    fullName: b.fullName,
    imageUrl: b.imageUrl,
    lastCrawledAt: now,
    updatedAt: now,
  };
}

export function buildBrandRankRow(b: HwahaeBrandRanked, now: Date) {
  return {
    brandId: b.brand.brandId,
    name: b.brand.name,
    alias: b.brand.alias,
    fullName: b.brand.fullName,
    imageUrl: b.brand.imageUrl,
    currentRank: b.rank,
    currentRankDelta: b.rankDelta,
    currentIsRankNew: b.isRankNew,
    lastCrawledAt: now,
    updatedAt: now,
  };
}

export function buildProductRow(p: HwahaeRankedProduct, now: Date) {
  return {
    productId: p.productId,
    uid: p.uid,
    goodsId: p.goodsId,
    brandId: p.brand.brandId,
    name: p.name,
    goodsName: p.goodsName,
    imageUrl: p.imageUrl,
    goodsImageUrl: p.goodsImageUrl,
    packageInfo: p.packageInfo,
    capacity: p.capacity,
    currentSalePrice: p.salePrice,
    currentOriginalPrice: p.originalPrice,
    currentDiscountRate: p.discountRate,
    currentDiscountPrice: p.discountPrice,
    // DB 는 numeric → drizzle 은 string 으로 처리. null 그대로 보존.
    currentRating: p.rating === null ? null : String(p.rating),
    currentReviewCount: p.reviewCount,
    currentIsCommerce: p.isCommerce,
    currentRank: p.rank,
    currentRankTheme: p.theme,
    currentRankThemeId: p.themeId,
    currentRankDelta: p.rankDelta,
    currentIsRankNew: p.isRankNew,
    lastCrawledAt: now,
    updatedAt: now,
  };
}

export function buildRankingSnapshotRow(
  p: HwahaeRankedProduct,
  crawledAt: Date,
) {
  return {
    productId: p.productId,
    theme: p.theme,
    themeId: p.themeId,
    themeLabel: p.themeLabel,
    rank: p.rank,
    rankDelta: p.rankDelta,
    isRankNew: p.isRankNew,
    salePrice: p.salePrice,
    originalPrice: p.originalPrice,
    discountRate: p.discountRate,
    rating: p.rating === null ? null : String(p.rating),
    reviewCount: p.reviewCount,
    crawledAt,
  };
}

export function buildBrandRankingSnapshotRow(
  b: HwahaeBrandRanked,
  crawledAt: Date,
) {
  return {
    brandId: b.brand.brandId,
    rank: b.rank,
    rankDelta: b.rankDelta,
    isRankNew: b.isRankNew,
    crawledAt,
  };
}

export function buildProductTopicRows(
  p: HwahaeRankedProduct,
  crawledAt: Date,
) {
  return p.topics.map((t) => ({
    productId: p.productId,
    topicId: t.topicId,
    topicName: t.topicName,
    topicSentence: t.topicSentence,
    isPositive: t.isPositive,
    score: t.score,
    reviewCount: t.reviewCount,
    topicRank: t.topicRank,
    crawledAt,
  }));
}

export function buildAwardRow(a: HwahaeAwardRecord, crawledAt: Date) {
  return {
    productId: a.productId,
    year: a.year,
    awardId: a.awardId,
    theme: a.theme,
    category: a.category,
    rank: a.rank,
    isHallOfFame: a.isHallOfFame,
    crawledAt,
  };
}

// ─────────── DB 쓰기 ───────────

export async function upsertHwahaeThemes(
  db: HwahaeDb,
  themes: HwahaeThemeMeta[],
  now: Date,
): Promise<number> {
  if (themes.length === 0) return 0;
  // 공식 API 는 in-order 로 insert 후 conflict 시 update.
  // 5 row 고정이라 벌크가 안 싸고, 오히려 명시적 순회가 읽기 쉬움.
  for (const t of themes) {
    await (db.insert(hwahaeThemes) as unknown as {
      values: (v: unknown) => {
        onConflictDoUpdate: (opts: unknown) => Promise<unknown>;
      };
    })
      .values(buildThemeRow(t, now))
      .onConflictDoUpdate({
        target: hwahaeThemes.id,
        set: {
          shortcutName: sql`excluded.shortcut_name`,
          rankingType: sql`excluded.ranking_type`,
          themeIconUrl: sql`excluded.theme_icon_url`,
          defaultRankingDetailId: sql`excluded.default_ranking_detail_id`,
          lastCrawledAt: now,
          updatedAt: now,
        },
      });
  }
  return themes.length;
}

export async function upsertHwahaeCategoryNodes(
  db: HwahaeDb,
  nodes: HwahaeRankingCategoryNode[],
  now: Date,
): Promise<number> {
  if (nodes.length === 0) return 0;
  // self-FK 때문에 부모→자식 순으로 insert. parseCategoryTree 는 DFS 후위가 아닌 전위 walk 라
  // 부모가 항상 먼저 나오게 보장됨. depth asc 로도 안전.
  const ordered = [...nodes].sort((a, b) => a.depth - b.depth);
  const rows = ordered.map((n) => buildCategoryNodeRow(n, now));
  for (const row of rows) {
    await (db.insert(hwahaeRankingCategories) as unknown as {
      values: (v: unknown) => {
        onConflictDoUpdate: (opts: unknown) => Promise<unknown>;
      };
    })
      .values(row)
      .onConflictDoUpdate({
        target: hwahaeRankingCategories.id,
        set: {
          parentId: sql`excluded.parent_id`,
          name: sql`excluded.name`,
          englishName: sql`excluded.english_name`,
          depth: sql`excluded.depth`,
          maxRank: sql`excluded.max_rank`,
          isAdvertised: sql`excluded.is_advertised`,
          lastUpdatedAt: sql`excluded.last_updated_at`,
          lastUpdatedDescription: sql`excluded.last_updated_description`,
          lastCrawledAt: now,
          updatedAt: now,
        },
      });
  }
  return rows.length;
}

/**
 * 상품 순회 전에 brand 를 먼저 upsert 해서 products.brand_id FK 를 맞춘다.
 * brand 테마 스냅샷에서 온 브랜드도 포함해 중복 제거 후 1회만 insert.
 */
export async function upsertHwahaeBrands(
  db: HwahaeDb,
  products: HwahaeRankedProduct[],
  brandRanks: HwahaeBrandRanked[],
  now: Date,
): Promise<number> {
  const byId = new Map<number, { row: ReturnType<typeof buildBrandRow> }>();
  for (const p of products) {
    const row = buildBrandRow(p, now);
    byId.set(row.brandId, { row });
  }
  // brand 테마 rank 가 있으면 current_rank 까지 같이 반영.
  const brandRankRows = new Map(
    brandRanks.map((b) => [b.brand.brandId, buildBrandRankRow(b, now)]),
  );

  if (byId.size === 0 && brandRankRows.size === 0) return 0;

  // brandRankRows 의 rank 정보를 일반 brand row 에 덮어씌움.
  const mergedIds = new Set([
    ...byId.keys(),
    ...brandRankRows.keys(),
  ]);
  let upserted = 0;
  for (const id of mergedIds) {
    const rank = brandRankRows.get(id);
    const base = byId.get(id)?.row;
    const values = rank
      ? { ...(base ?? rank), ...rank } // rank 행이 더 풍부 + 순위 포함
      : base!;
    await (db.insert(hwahaeBrands) as unknown as {
      values: (v: unknown) => {
        onConflictDoUpdate: (opts: unknown) => Promise<unknown>;
      };
    })
      .values(values)
      .onConflictDoUpdate({
        target: hwahaeBrands.brandId,
        set: {
          name: sql`excluded.name`,
          alias: sql`excluded.alias`,
          fullName: sql`excluded.full_name`,
          imageUrl: sql`excluded.image_url`,
          // rank 는 brand 테마 수집 시에만 업데이트. 그 외엔 기존값 보존.
          ...(rank
            ? {
                currentRank: sql`excluded.current_rank`,
                currentRankDelta: sql`excluded.current_rank_delta`,
                currentIsRankNew: sql`excluded.current_is_rank_new`,
              }
            : {}),
          lastCrawledAt: now,
          updatedAt: now,
        },
      });
    upserted += 1;
  }
  return upserted;
}

export async function upsertHwahaeProducts(
  db: HwahaeDb,
  products: HwahaeRankedProduct[],
  now: Date,
): Promise<number> {
  if (products.length === 0) return 0;
  // 동일 상품이 여러 테마에 중복 등장 → product_id 기준 dedupe.
  // 최근 것이 덮어쓰도록 마지막 row 우선.
  const byId = new Map<number, ReturnType<typeof buildProductRow>>();
  for (const p of products) byId.set(p.productId, buildProductRow(p, now));

  for (const row of byId.values()) {
    await (db.insert(hwahaeProducts) as unknown as {
      values: (v: unknown) => {
        onConflictDoUpdate: (opts: unknown) => Promise<unknown>;
      };
    })
      .values(row)
      .onConflictDoUpdate({
        target: hwahaeProducts.productId,
        set: {
          uid: sql`excluded.uid`,
          goodsId: sql`excluded.goods_id`,
          brandId: sql`excluded.brand_id`,
          name: sql`excluded.name`,
          goodsName: sql`excluded.goods_name`,
          imageUrl: sql`excluded.image_url`,
          goodsImageUrl: sql`excluded.goods_image_url`,
          packageInfo: sql`excluded.package_info`,
          capacity: sql`excluded.capacity`,
          currentSalePrice: sql`excluded.current_sale_price`,
          currentOriginalPrice: sql`excluded.current_original_price`,
          currentDiscountRate: sql`excluded.current_discount_rate`,
          currentDiscountPrice: sql`excluded.current_discount_price`,
          currentRating: sql`excluded.current_rating`,
          currentReviewCount: sql`excluded.current_review_count`,
          currentIsCommerce: sql`excluded.current_is_commerce`,
          currentRank: sql`excluded.current_rank`,
          currentRankTheme: sql`excluded.current_rank_theme`,
          currentRankThemeId: sql`excluded.current_rank_theme_id`,
          currentRankDelta: sql`excluded.current_rank_delta`,
          currentIsRankNew: sql`excluded.current_is_rank_new`,
          lastCrawledAt: now,
          updatedAt: now,
        },
      });
  }
  return byId.size;
}

export async function insertHwahaeRankingSnapshots(
  db: HwahaeDb,
  products: HwahaeRankedProduct[],
  crawledAt: Date,
): Promise<number> {
  if (products.length === 0) return 0;
  const rows = products.map((p) => buildRankingSnapshotRow(p, crawledAt));
  await (db.insert(hwahaeRankingSnapshots) as unknown as {
    values: (v: unknown) => Promise<unknown>;
  }).values(rows);
  return rows.length;
}

export async function insertHwahaeBrandRankingSnapshots(
  db: HwahaeDb,
  brands: HwahaeBrandRanked[],
  crawledAt: Date,
): Promise<number> {
  if (brands.length === 0) return 0;
  const rows = brands.map((b) => buildBrandRankingSnapshotRow(b, crawledAt));
  await (db.insert(hwahaeBrandRankingSnapshots) as unknown as {
    values: (v: unknown) => Promise<unknown>;
  }).values(rows);
  return rows.length;
}

export async function insertHwahaeProductTopics(
  db: HwahaeDb,
  products: HwahaeRankedProduct[],
  crawledAt: Date,
): Promise<number> {
  const rows = products.flatMap((p) => buildProductTopicRows(p, crawledAt));
  if (rows.length === 0) return 0;
  await (db.insert(hwahaeProductTopics) as unknown as {
    values: (v: unknown) => Promise<unknown>;
  }).values(rows);
  return rows.length;
}

export async function insertHwahaeAwards(
  db: HwahaeDb,
  awards: HwahaeAwardRecord[],
  crawledAt: Date,
): Promise<number> {
  if (awards.length === 0) return 0;
  const rows = awards.map((a) => buildAwardRow(a, crawledAt));
  // uniq_hw_awards_identity(nullsNotDistinct) 로 중복 방지. 기록은 append-only 의도라 update 불필요.
  await (db.insert(hwahaeAwards) as unknown as {
    values: (v: unknown) => {
      onConflictDoNothing: () => Promise<unknown>;
    };
  })
    .values(rows)
    .onConflictDoNothing();
  return rows.length;
}

export async function recordHwahaeCrawlRun(
  db: HwahaeDb,
  params: {
    theme: string;
    themeId: number | null;
    productCount: number;
    newEntryCount: number;
    avgRating: number | null;
    status: "completed" | "failed" | "partial";
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date;
  },
): Promise<void> {
  await (db.insert(hwahaeCrawlRuns) as unknown as {
    values: (v: unknown) => Promise<unknown>;
  }).values({
    theme: params.theme,
    themeId: params.themeId,
    productCount: params.productCount,
    newEntryCount: params.newEntryCount,
    avgRating:
      params.avgRating === null ? null : String(params.avgRating.toFixed(2)),
    status: params.status,
    errorMessage: params.errorMessage,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
  });
}

// ─────────── 오케스트레이터 ───────────

export interface PersistSummary {
  themesUpserted: number;
  categoryNodesUpserted: number;
  brandsUpserted: number;
  productsUpserted: number;
  rankingSnapshotsInserted: number;
  brandSnapshotsInserted: number;
  productTopicsInserted: number;
  awardsInserted: number;
  errors: number;
  durationMs: number;
}

/**
 * CrawlOutcome 에 담긴 모든 것을 DB 로 반영.
 * 저장 순서: themes → category tree → brands → products → snapshots → topics → awards → crawl_runs.
 * neon-http 드라이버는 트랜잭션 미지원 → 중간 실패 시 일부 적용 가능성. status 는 partial/failed.
 */
export async function persistCrawlOutcome(
  db: HwahaeDb,
  outcome: {
    themes: HwahaeThemeMeta[];
    categoryNodes: HwahaeRankingCategoryNode[];
    products: HwahaeRankedProduct[];
    brandRanks: HwahaeBrandRanked[];
    errors: Array<{ message: string }>;
  },
  opts: {
    startedAt: Date;
    awards?: HwahaeAwardRecord[];
    now?: Date;
  },
): Promise<PersistSummary> {
  const begin = Date.now();
  const now = opts.now ?? new Date();

  const themesUpserted = await upsertHwahaeThemes(db, outcome.themes, now);
  const categoryNodesUpserted = await upsertHwahaeCategoryNodes(
    db,
    outcome.categoryNodes,
    now,
  );
  const brandsUpserted = await upsertHwahaeBrands(
    db,
    outcome.products,
    outcome.brandRanks,
    now,
  );
  const productsUpserted = await upsertHwahaeProducts(
    db,
    outcome.products,
    now,
  );
  const rankingSnapshotsInserted = await insertHwahaeRankingSnapshots(
    db,
    outcome.products,
    now,
  );
  const brandSnapshotsInserted = await insertHwahaeBrandRankingSnapshots(
    db,
    outcome.brandRanks,
    now,
  );
  const productTopicsInserted = await insertHwahaeProductTopics(
    db,
    outcome.products,
    now,
  );
  const awardsInserted = await insertHwahaeAwards(
    db,
    opts.awards ?? [],
    now,
  );

  // 요약 row 1개 기록. theme=null 은 check 제약 위반이라 'all' placeholder 쓸 수 없어
  // theme 별 run 은 향후 분할 실행 시 호출자가 recordHwahaeCrawlRun 을 직접 부르도록.
  // 여기서는 aggregate run 을 남기되 check 위반 방지 위해 "trending" 등으로 넣지 않음 — 대신 호출자가 결정.

  return {
    themesUpserted,
    categoryNodesUpserted,
    brandsUpserted,
    productsUpserted,
    rankingSnapshotsInserted,
    brandSnapshotsInserted,
    productTopicsInserted,
    awardsInserted,
    errors: outcome.errors.length,
    durationMs: Date.now() - begin,
  };
}
