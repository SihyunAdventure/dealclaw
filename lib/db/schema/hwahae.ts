// 화해(Hwahae) 랭킹·어워드 크롤 데이터 스키마.
// Phase 0(SIH-566) 에서 __NEXT_DATA__ SSR JSON 실측으로 확정된 필드 인벤토리를 반영.
// 올영 스키마(oliveyoung.ts) 와 동일한 3계층(products / *_snapshots / crawl_runs) + 부가 테이블.
// 네이밍 규칙: snake_case DB · camelCase drizzle prop · idx_hw_* 인덱스 · current_* 최신값 미러링.

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  doublePrecision,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";

// 5 theme slug 은 화해 API 가 내려주는 고정 enum. DB 레벨에서도 체크 제약으로 검증.
// 변경될 일 매우 드물지만 늘면 이 상수 + 마이그레이션 한 번에 업데이트.
const VALID_THEME_SLUGS = ["trending", "category", "skin", "age", "brand"];
const themeSlugCheck = (colName: string) =>
  sql.raw(
    `${colName} IN (${VALID_THEME_SLUGS.map((s) => `'${s}'`).join(", ")})`,
  );

// 1. 랭킹 테마 메타 (trending/category/skin/age/brand 5종)
//    SSR JSON 의 props.pageProps.rankings[] 을 캐시. UI 탭 렌더용.
export const hwahaeThemes = pgTable("hwahae_themes", {
  id: integer("id").primaryKey(), // rankings[].id
  englishName: text("english_name").notNull().unique(), // "trending" 등
  shortcutName: text("shortcut_name").notNull(), // "급상승" 등
  rankingType: text("ranking_type").notNull(), // "TRENDING" | "CATEGORY" | ...
  themeIconUrl: text("theme_icon_url").notNull().default(""),
  defaultRankingDetailId: integer("default_ranking_detail_id"),
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 2. 랭킹 카테고리 트리 (depth 1~3)
//    SSR JSON 의 rankingsCategories / rankingsCategories.children[] / .categories[] 캐시.
//    self-ref(parent_id) 로 트리 저장.
export const hwahaeRankingCategories = pgTable(
  "hwahae_ranking_categories",
  {
    id: integer("id").primaryKey(),
    parentId: integer("parent_id"),
    themeEnglishName: text("theme_english_name").notNull(), // "category" 등 — 어느 theme 소속
    name: text("name").notNull(),
    englishName: text("english_name"),
    depth: integer("depth").notNull().default(1),
    rankingType: text("ranking_type").notNull(),
    maxRank: integer("max_rank"), // trending=50, category=100 등
    isAdvertised: boolean("is_advertised").notNull().default(false),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }), // 화해가 내려주는 값
    lastUpdatedDescription: text("last_updated_description"),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_hw_rank_cat_theme").on(table.themeEnglishName),
    index("idx_hw_rank_cat_parent").on(table.parentId),
    // self-ref FK: 부모 카테고리 삭제 시 자식의 parent_id 를 NULL 로 — 트리 고아 방지.
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "fk_hw_rank_cat_parent",
    }).onDelete("set null"),
    check("ck_hw_rank_cat_theme", themeSlugCheck("theme_english_name")),
  ],
);

// 3. 브랜드 마스터.
//    brand 테마 랭킹 + 상품의 brand_id FK 대상.
export const hwahaeBrands = pgTable(
  "hwahae_brands",
  {
    brandId: integer("brand_id").primaryKey(),
    name: text("name").notNull(),
    alias: text("alias"), // 영문명 "Torriden"
    fullName: text("full_name"), // "토리든 (Torriden)"
    imageUrl: text("image_url"),

    currentRank: integer("current_rank"), // brand 테마 최신 순위
    currentRankDelta: integer("current_rank_delta"),
    currentIsRankNew: boolean("current_is_rank_new").notNull().default(false),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_hw_brands_current_rank").on(table.currentRank)],
);

// 4. 상품 마스터.
//    PK = product.id (원 상품 본체 int). goods.id 는 판매 패키지 id 로 함께 저장.
//    가격·평점·리뷰수·랭킹 최신값을 current_* 로 미러링 (올영 동일 패턴).
export const hwahaeProducts = pgTable(
  "hwahae_products",
  {
    productId: integer("product_id").primaryKey(), // product.id
    uid: text("uid").notNull(), // product.uid (UUID, 글로벌 식별자)
    goodsId: integer("goods_id"), // goods.id (판매 패키지 id — 변경 가능)
    brandId: integer("brand_id").references(() => hwahaeBrands.brandId, {
      onDelete: "set null",
    }),

    name: text("name").notNull(), // product.name
    goodsName: text("goods_name"), // goods.name (판매 패키지명 — 기획전 포함)
    imageUrl: text("image_url").notNull().default(""),
    goodsImageUrl: text("goods_image_url"),
    packageInfo: text("package_info").notNull().default(""),
    capacity: text("capacity"),

    // is_commerce=false(화해 비판매) 상품은 goods 가 통째로 null 이라 가격 3종 모두 nullable.
    // product.price 는 항상 존재하므로 currentOriginalPrice 에 넣되, 방어적으로 nullable 유지.
    currentSalePrice: integer("current_sale_price"),
    currentOriginalPrice: integer("current_original_price"),
    currentDiscountRate: integer("current_discount_rate"),
    currentDiscountPrice: integer("current_discount_price"),

    currentRating: numeric("current_rating", { precision: 3, scale: 2 }),
    currentReviewCount: integer("current_review_count").notNull().default(0),
    currentIsCommerce: boolean("current_is_commerce").notNull().default(false),

    currentRank: integer("current_rank"),
    currentRankTheme: text("current_rank_theme"), // 기준 theme
    currentRankThemeId: integer("current_rank_theme_id"),
    currentRankDelta: integer("current_rank_delta"),
    currentIsRankNew: boolean("current_is_rank_new").notNull().default(false),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_hw_products_uid").on(table.uid),
    index("idx_hw_products_current_rank").on(table.currentRank),
    index("idx_hw_products_brand").on(table.brandId),
    index("idx_hw_products_last_crawled").on(table.lastCrawledAt),
    // currentRankTheme 은 nullable — NULL 은 check 통과, 값 있으면 5 slug 중 하나.
    check(
      "ck_hw_products_current_rank_theme",
      sql.raw(
        `current_rank_theme IS NULL OR current_rank_theme IN (${VALID_THEME_SLUGS.map((s) => `'${s}'`).join(", ")})`,
      ),
    ),
  ],
);

// 5. 상품 랭킹 시계열.
//    다차원: (product_id, theme, theme_id, crawled_at). 동일 상품이 trending/category/skin 각각 다른 rank 가짐.
export const hwahaeRankingSnapshots = pgTable(
  "hwahae_ranking_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => hwahaeProducts.productId, { onDelete: "cascade" }),
    theme: text("theme").notNull(), // "trending" | "category" | ...
    themeId: integer("theme_id").notNull(), // 서브 카테고리 id
    themeLabel: text("theme_label"), // "스킨케어", "20대" 등 사람이 읽는 라벨

    rank: integer("rank").notNull(),
    rankDelta: integer("rank_delta"),
    isRankNew: boolean("is_rank_new").notNull().default(false),

    // 스냅샷도 비판매 상품 수용을 위해 가격 3종 nullable.
    salePrice: integer("sale_price"),
    originalPrice: integer("original_price"),
    discountRate: integer("discount_rate"),

    rating: numeric("rating", { precision: 3, scale: 2 }),
    reviewCount: integer("review_count").notNull().default(0),

    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_hw_snap_product_time").on(table.productId, table.crawledAt),
    index("idx_hw_snap_theme_time").on(
      table.theme,
      table.themeId,
      table.crawledAt,
    ),
    index("idx_hw_snap_rank_time").on(
      table.theme,
      table.themeId,
      table.rank,
      table.crawledAt,
    ),
    check("ck_hw_snap_theme", themeSlugCheck("theme")),
  ],
);

// 6. 브랜드 랭킹 시계열 (brand 테마 전용).
export const hwahaeBrandRankingSnapshots = pgTable(
  "hwahae_brand_ranking_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => hwahaeBrands.brandId, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    rankDelta: integer("rank_delta"),
    isRankNew: boolean("is_rank_new").notNull().default(false),
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_hw_brand_snap_brand_time").on(table.brandId, table.crawledAt),
    index("idx_hw_brand_snap_rank_time").on(table.rank, table.crawledAt),
  ],
);

// 7. 리뷰 토픽 스냅샷.
//    product.product_topics[] 의 최대 3개 (긍정/부정 · 점수 · 언급수). 시간에 따라 변함.
export const hwahaeProductTopics = pgTable(
  "hwahae_product_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => hwahaeProducts.productId, { onDelete: "cascade" }),
    topicId: integer("topic_id").notNull(), // review_topic.id
    topicName: text("topic_name").notNull(), // "유분없는" 등
    topicSentence: text("topic_sentence"), // "유분이 없어요"
    isPositive: boolean("is_positive").notNull().default(true),
    score: doublePrecision("score").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    topicRank: integer("topic_rank").notNull().default(0), // product 내 토픽 순서(0~2)
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_hw_topic_product_time").on(table.productId, table.crawledAt),
    index("idx_hw_topic_topic_time").on(table.topicId, table.crawledAt),
  ],
);

// 8. 어워드 (시간 불변 이력). awardsYears[] + dehydratedState 에서 수집.
//    2023~2025 는 award_id 존재, 2015~2022 는 is_legacy=true 라 기록만 남기고 NULL 가능.
export const hwahaeAwards = pgTable(
  "hwahae_awards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => hwahaeProducts.productId, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    awardId: integer("award_id"), // 115 (2025), 34 (2024), null (legacy)
    theme: text("theme").notNull(), // "베스트 신제품", "효능/효과", "비건", ...
    category: text("category"), // "스킨/토너", "로션/에멀젼" 등
    rank: integer("rank"),
    isHallOfFame: boolean("is_hall_of_fame").notNull().default(false),
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Postgres 기본: NULL ≠ NULL 로 취급 → category 가 null 인 같은 (product, year, theme) 중복 insert 가능.
    // unique().nullsNotDistinct() 로 NULL 을 '같은 값' 으로 비교하게 강제 (PG 15+).
    // uniqueIndex 는 nullsNotDistinct 미지원이라 constraint 방식으로 전환.
    unique("uniq_hw_awards_identity")
      .on(table.productId, table.year, table.theme, table.category)
      .nullsNotDistinct(),
    index("idx_hw_awards_product").on(table.productId),
    index("idx_hw_awards_year").on(table.year),
  ],
);

// 9. 실행 메타.
//    theme 별 분할 실행 가능: 한 번의 run 은 하나의 (theme, theme_id) 만 크롤할 수도 있고
//    theme 전체를 한 run 으로 처리할 수도 있음.
export const hwahaeCrawlRuns = pgTable(
  "hwahae_crawl_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    theme: text("theme").notNull(),
    themeId: integer("theme_id"), // null = theme 전체
    productCount: integer("product_count").notNull().default(0),
    newEntryCount: integer("new_entry_count").notNull().default(0),
    avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
    status: text("status").notNull().default("completed"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // run 이력 조회의 기본 쿼리: "이 theme 의 최근 N 개 run" → (theme, themeId, startedAt desc).
    index("idx_hw_crawl_runs_theme_time").on(
      table.theme,
      table.themeId,
      table.startedAt,
    ),
    check("ck_hw_crawl_runs_theme", themeSlugCheck("theme")),
  ],
);
