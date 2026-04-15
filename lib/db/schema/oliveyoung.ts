import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const oliveyoungProducts = pgTable(
  "oliveyoung_products",
  {
    productId: text("product_id").primaryKey(),
    brand: text("brand").notNull().default(""),
    name: text("name").notNull(),
    categoryPath: text("category_path").notNull().default(""),
    dispCatNo: text("disp_cat_no").notNull().default(""),
    link: text("link").notNull(),
    imageUrl: text("image_url").notNull().default(""),

    currentRank: integer("current_rank"),
    currentSalePrice: integer("current_sale_price").notNull(),
    currentOriginalPrice: integer("current_original_price").notNull(),
    currentDiscountRate: integer("current_discount_rate").notNull().default(0),
    currentHasPriceRange: boolean("current_has_price_range")
      .notNull()
      .default(false),
    currentIsTodayDeal: boolean("current_is_today_deal")
      .notNull()
      .default(false),
    currentFlags: text("current_flags").array().notNull().default([]),

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
    index("idx_oy_products_current_rank").on(table.currentRank),
    index("idx_oy_products_last_crawled").on(table.lastCrawledAt),
  ],
);

export const oliveyoungRankingSnapshots = pgTable(
  "oliveyoung_ranking_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => oliveyoungProducts.productId, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    salePrice: integer("sale_price").notNull(),
    originalPrice: integer("original_price").notNull(),
    discountRate: integer("discount_rate").notNull().default(0),
    hasPriceRange: boolean("has_price_range").notNull().default(false),
    isTodayDeal: boolean("is_today_deal").notNull().default(false),
    flags: text("flags").array().notNull().default([]),
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_oy_snap_product_time").on(table.productId, table.crawledAt),
    index("idx_oy_snap_time").on(table.crawledAt),
    index("idx_oy_snap_rank_time").on(table.rank, table.crawledAt),
  ],
);

export const oliveyoungCrawlRuns = pgTable("oliveyoung_crawl_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  productCount: integer("product_count").notNull(),
  todayDealCount: integer("today_deal_count").notNull().default(0),
  minSalePrice: integer("min_sale_price"),
  maxDiscountRate: integer("max_discount_rate"),
  status: text("status").notNull().default("completed"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
