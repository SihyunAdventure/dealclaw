import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
