import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collection: text("collection").notNull(),
    coupangId: text("coupang_id").notNull().unique(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    link: text("link").notNull(),
    salePrice: integer("sale_price").notNull(),
    originalPrice: integer("original_price"),
    discountRate: integer("discount_rate").default(0),
    unitPriceText: text("unit_price_text"),
    unitPriceValue: integer("unit_price_value"),
    isRocket: boolean("is_rocket").default(false),
    badges: text("badges").array(),
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
    index("idx_products_collection_unit").on(
      table.collection,
      table.unitPriceValue,
    ),
    index("idx_products_collection_sale").on(
      table.collection,
      table.salePrice,
    ),
  ],
);

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  collection: text("collection").notNull(),
  productCount: integer("product_count").notNull(),
  minSalePrice: integer("min_sale_price"),
  minUnitPrice: integer("min_unit_price"),
  status: text("status").notNull().default("completed"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    collection: text("collection").notNull(),
    status: text("status").notNull().default("pending"),
    verifyToken: text("verify_token").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    unsubscribedReason: text("unsubscribed_reason"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    consentIp: text("consent_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_sub_email_collection").on(
      table.email,
      table.collection,
    ),
    index("idx_sub_status_collection").on(table.status, table.collection),
    uniqueIndex("uniq_sub_verify_token").on(table.verifyToken),
  ],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collection: text("collection").notNull(),
    minSalePrice: integer("min_sale_price").notNull(),
    minUnitPrice: integer("min_unit_price"),
    topProductId: uuid("top_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    topCoupangId: text("top_coupang_id"),
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ph_collection_time").on(table.collection, table.crawledAt),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_rl_key_scope").on(table.key, table.scope),
    index("idx_rl_window").on(table.windowStart),
  ],
);
