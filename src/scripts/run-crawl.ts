import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../lib/db/schema";
import { sendEmail } from "../../lib/email/ses";
import { priceAlertEmail } from "../../lib/email/templates";
import { launchChrome } from "../crawl/chrome";
import { crawlCoupangSearch } from "../crawl/coupang-search";
import { createCrawlLogger } from "../crawl/run-logger";
import {
  COUPANG_LIST_SIZE,
  COUPANG_RECENT_SUCCESS_WINDOW,
  COUPANG_SCHEDULE_END_HOUR_KST,
  COUPANG_SCHEDULE_START_HOUR_KST,
  computeCooldownUntil,
  evaluateProductCountHealth,
  getKstHour,
  isLikelyBlockMessage,
  resolveScheduledCollections,
} from "../crawl/coupang-run-policy";
import {
  DETECTION_CONFIG,
  detectNewLow,
  shouldNotifySubscriber,
  type CurrentCrawl,
  type PriceHistoryPoint,
} from "../crawl/detect-new-low";
import { collections } from "../data/collections";
import type { Collection } from "../crawl/types";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const SITE_URL = process.env.SITE_URL || "https://hotinbeauty.com";
const BLOCKING_STATUSES = ["blocked", "suspicious_count"] as const;
const logger = createCrawlLogger("coupang");

type CrawlRunStatus =
  | "completed"
  | "blocked"
  | "suspicious_count"
  | "error"
  | "cooldown_skip";

interface DetectAndNotifyArgs {
  collectionSlug: string;
  collectionDisplay: string;
  current: CurrentCrawl;
  topProductDbId: string | null;
}

async function detectAndNotify({
  collectionSlug,
  collectionDisplay,
  current,
  topProductDbId,
}: DetectAndNotifyArgs) {
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - DETECTION_CONFIG.windowDays * 86_400_000,
  );

  const historyRows = await db
    .select()
    .from(schema.priceHistory)
    .where(
      and(
        eq(schema.priceHistory.collection, collectionSlug),
        gte(schema.priceHistory.crawledAt, windowCutoff),
      ),
    );

  const history: PriceHistoryPoint[] = historyRows.map((h) => ({
    minSalePrice: h.minSalePrice,
    minUnitPrice: h.minUnitPrice,
    topCoupangId: h.topCoupangId,
    crawledAt: h.crawledAt,
  }));

  const result = detectNewLow(current, history, now);
  logger.event("info", "detect_new_low", {
    collection: collectionSlug,
    reason: result.reason,
    shouldAlert: result.shouldAlert,
    dropRate: result.dropRate,
    windowMin: result.windowMin,
    historyCount: history.length,
  });
  console.log(
    `  🔔 감지: ${result.reason} (dropRate=${(result.dropRate * 100).toFixed(1)}%, windowMin=${result.windowMin})`,
  );

  await db.insert(schema.priceHistory).values({
    collection: collectionSlug,
    minSalePrice: current.minSalePrice,
    minUnitPrice: current.minUnitPrice,
    topProductId: topProductDbId,
    topCoupangId: current.topCoupangId,
    crawledAt: now,
  });

  if (!result.shouldAlert || !topProductDbId) return;

  const subscribers = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.status, "active"),
        eq(schema.subscriptions.collection, collectionSlug),
      ),
    );

  if (subscribers.length === 0) {
    logger.event("info", "notify_skip_no_subscribers", {
      collection: collectionSlug,
    });
    console.log("  📭 활성 구독자 없음 — 알림 생략");
    return;
  }

  const topProduct = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, topProductDbId))
    .limit(1);

  if (topProduct.length === 0) {
    logger.event("error", "notify_top_product_missing", {
      collection: collectionSlug,
      topProductDbId,
    });
    console.error(`  ⚠️ top product not found: ${topProductDbId}`);
    return;
  }
  const p = topProduct[0];
  const prevMin = result.windowMin ?? p.salePrice;

  let sent = 0;
  let skipped = 0;
  for (const sub of subscribers) {
    const check = shouldNotifySubscriber(result, sub.lastNotifiedAt, now);
    if (!check.notify) {
      skipped++;
      continue;
    }

    const { subject, html } = priceAlertEmail({
      collection: collectionSlug,
      collectionDisplay,
      productName: p.name,
      productUrl: p.link,
      imageUrl: p.imageUrl,
      salePrice: p.salePrice,
      prevMinPrice: prevMin,
      unitPriceText: p.unitPriceText,
      unsubscribeUrl: `${SITE_URL}/unsubscribe?token=${sub.verifyToken}`,
    });

    try {
      await sendEmail({ to: sub.email, subject, html });
      await db
        .update(schema.subscriptions)
        .set({ lastNotifiedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));
      sent++;
    } catch (err) {
      logger.event("error", "notify_send_failed", {
        collection: collectionSlug,
        email: sub.email,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`  ⚠️ SES 발송 실패 ${sub.email}:`, err);
    }
  }
  logger.event("info", "notify_complete", {
    collection: collectionSlug,
    sent,
    skipped,
    subscriberCount: subscribers.length,
  });
  console.log(
    `  📬 알림 발송: ${sent}건 (쿨다운 skip ${skipped}건, 총 ${subscribers.length}명)`,
  );
}

async function insertCrawlRun(args: {
  collection: string;
  productCount: number;
  status: CrawlRunStatus;
  startedAt: Date;
  finishedAt: Date;
  minSalePrice?: number | null;
  minUnitPrice?: number | null;
  errorMessage?: string | null;
}) {
  logger.event("info", "crawl_run_record", {
    collection: args.collection,
    status: args.status,
    productCount: args.productCount,
    startedAt: args.startedAt.toISOString(),
    finishedAt: args.finishedAt.toISOString(),
    errorMessage: args.errorMessage ?? null,
  });
  await db.insert(schema.crawlRuns).values({
    collection: args.collection,
    productCount: args.productCount,
    minSalePrice: args.minSalePrice ?? null,
    minUnitPrice: args.minUnitPrice ?? null,
    status: args.status,
    errorMessage: args.errorMessage ?? null,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
  });
}

async function getRecentCompletedCounts(collectionSlug: string): Promise<number[]> {
  const rows = await db
    .select({ productCount: schema.crawlRuns.productCount })
    .from(schema.crawlRuns)
    .where(
      and(
        eq(schema.crawlRuns.collection, collectionSlug),
        eq(schema.crawlRuns.status, "completed"),
      ),
    )
    .orderBy(desc(schema.crawlRuns.finishedAt))
    .limit(COUPANG_RECENT_SUCCESS_WINDOW);

  return rows
    .map((row) => row.productCount)
    .filter((count): count is number => typeof count === "number" && count > 0);
}

async function getActiveCooldown(now: Date): Promise<{
  until: Date;
  reason: string;
} | null> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      status: schema.crawlRuns.status,
      collection: schema.crawlRuns.collection,
      errorMessage: schema.crawlRuns.errorMessage,
      finishedAt: schema.crawlRuns.finishedAt,
    })
    .from(schema.crawlRuns)
    .where(
      and(
        gte(schema.crawlRuns.finishedAt, weekAgo),
        inArray(schema.crawlRuns.status, [...BLOCKING_STATUSES]),
      ),
    )
    .orderBy(desc(schema.crawlRuns.finishedAt));

  const cooldownUntil = computeCooldownUntil({
    now,
    blockedRuns: rows.map((row) => row.finishedAt),
  });

  if (!cooldownUntil || cooldownUntil <= now) return null;

  const latest = rows[0];
  const reason = latest
    ? `${latest.collection} / ${latest.status}${latest.errorMessage ? ` / ${latest.errorMessage}` : ""}`
    : "recent blocking run";

  return { until: cooldownUntil, reason };
}

function resolveTargets(args: string[], now: Date): Collection[] {
  const targetSlug = args
    .find((arg) => arg.startsWith("--collection="))
    ?.split("=")[1];
  const crawlAll = args.includes("--all");

  if (targetSlug) {
    return collections.filter((collection) => collection.slug === targetSlug);
  }

  if (crawlAll) {
    return collections;
  }

  return resolveScheduledCollections(collections, now);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const targetSlug = process.argv
    .find((arg) => arg.startsWith("--collection="))
    ?.split("=")[1];
  const crawlAll = process.argv.includes("--all");
  const targets = resolveTargets(process.argv, now);
  logger.event("info", "main_start", {
    argv: process.argv.slice(2),
    dryRun,
    kstHour: getKstHour(now),
    targetSlug: targetSlug ?? null,
    crawlAll,
    resolvedTargets: targets.map((target) => target.slug),
  });

  if (targetSlug && targets.length === 0) {
    console.error(`Collection not found: ${targetSlug}`);
    process.exit(1);
  }

  if (!targetSlug && !crawlAll && targets.length === 0) {
    console.log(
      `\n=== hotinbeauty 크롤러 ===\n현재 KST ${getKstHour(now)}시는 쿠팡 수집 슬롯이 아닙니다. (${String(COUPANG_SCHEDULE_START_HOUR_KST).padStart(2, "0")}:00~${String(COUPANG_SCHEDULE_END_HOUR_KST).padStart(2, "0")}:00 매시 정각에 1개 카테고리만 수집)\n`,
    );
    return;
  }

  console.log("\n=== hotinbeauty 크롤러 ===");
  console.log(`대상: ${targets.map((collection) => collection.displayName).join(", ")}`);
  console.log(`모드: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`정책: 시간 분산(기본 1시간 1카테고리) · listSize=${COUPANG_LIST_SIZE} · 차단 시 쿨다운\n`);

  if (!dryRun) {
    const cooldown = await getActiveCooldown(now);
    if (cooldown) {
      logger.event("warn", "cooldown_active", {
        cooldownUntil: cooldown.until.toISOString(),
        reason: cooldown.reason,
        targets: targets.map((target) => target.slug),
      });
      console.warn(
        `⏸ 최근 차단/이상 징후가 있어 쿠팡 크롤을 쉬는 중입니다. cooldownUntil=${cooldown.until.toISOString()} reason=${cooldown.reason}`,
      );
      for (const target of targets) {
        await insertCrawlRun({
          collection: target.slug,
          productCount: 0,
          status: "cooldown_skip",
          startedAt: now,
          finishedAt: now,
          errorMessage: `cooldown_until=${cooldown.until.toISOString()} | ${cooldown.reason}`,
        });
      }
      return;
    }
  }

  let session: Awaited<ReturnType<typeof launchChrome>> | null = null;
  let consecutiveFailures = 0;

  try {
    session = await launchChrome({
      profileKey: "coupang",
      offScreen: true,
    });
    logger.event("info", "browser_session_started", {
      targetCount: targets.length,
    });

    for (const col of targets) {
      const startedAt = new Date();

      try {
        logger.event("info", "collection_start", {
          collection: col.slug,
          displayName: col.displayName,
          query: col.query,
          scheduleHourKst: col.scheduleHourKst ?? null,
        });
        console.log(`\n📦 [${col.displayName}] 크롤링 시작...`);

        const recentCompletedCounts = dryRun
          ? []
          : await getRecentCompletedCounts(col.slug);
        logger.event("info", "collection_recent_baseline", {
          collection: col.slug,
          recentCompletedCounts,
        });
        const products = await crawlCoupangSearch(session.page, col.query, {
          listSize: COUPANG_LIST_SIZE,
        });
        logger.event("info", "collection_parsed", {
          collection: col.slug,
          productCount: products.length,
          listSize: COUPANG_LIST_SIZE,
        });
        console.log(`  ✅ ${products.length}개 상품 파싱 완료`);

        const countHealth = evaluateProductCountHealth({
          productCount: products.length,
          recentCompletedCounts,
        });
        logger.event("info", "collection_health_check", {
          collection: col.slug,
          healthy: countHealth.healthy,
          baselineMedian: countHealth.baselineMedian,
          minExpectedCount: countHealth.minExpectedCount,
          reason: countHealth.reason,
        });
        if (!countHealth.healthy) {
          const finishedAt = new Date();
          const reason = `상품 수 비정상 — count=${products.length}, recentMedian=${countHealth.baselineMedian ?? "n/a"}, minExpected=${countHealth.minExpectedCount}`;
          logger.event("warn", "collection_stop_suspicious_count", {
            collection: col.slug,
            reason,
          });
          console.error(`  ⛔ ${reason}`);
          if (!dryRun) {
            await insertCrawlRun({
              collection: col.slug,
              productCount: products.length,
              status: "suspicious_count",
              startedAt,
              finishedAt,
              errorMessage: reason,
            });
          }
          console.error("  🛑 안전 규칙에 따라 이번 실행의 남은 쿠팡 카테고리를 중단합니다.");
          break;
        }

        const sorted = [...products].sort(
          (a, b) =>
            a.unitPriceValue - b.unitPriceValue || a.salePrice - b.salePrice,
        );
        console.log("\n  TOP 5 (단위가격 순):");
        sorted.slice(0, 5).forEach((product, index) => {
          console.log(`    ${index + 1}. ${product.name.substring(0, 45)}`);
          console.log(
            `       💰 ${product.salePrice.toLocaleString()}원 | ${product.unitPriceText || "-"}`,
          );
        });

        if (dryRun) {
          logger.event("info", "collection_dry_run_complete", {
            collection: col.slug,
            productCount: products.length,
          });
          console.log("\n  [DRY RUN] DB 저장 · 알림 발송 생략");
          consecutiveFailures = 0;
          continue;
        }

        const rankMap = new Map<string, number>();
        sorted.forEach((product, index) => rankMap.set(product.coupangId, index + 1));

        const crawledAt = new Date();
        const snapshotRows: (typeof schema.coupangPriceSnapshots.$inferInsert)[] = [];

        let upserted = 0;
        for (const product of products) {
          const [row] = await db
            .insert(schema.products)
            .values({
              collection: col.slug,
              coupangId: product.coupangId,
              name: product.name,
              imageUrl: product.imageUrl,
              link: product.link,
              salePrice: product.salePrice,
              originalPrice: product.originalPrice,
              discountRate: product.discountRate,
              unitPriceText: product.unitPriceText,
              unitPriceValue: product.unitPriceValue || null,
              isRocket: product.isRocket,
              badges: product.badges,
              reviewCount: product.reviewCount,
              ratingAverage: product.ratingAverage,
              lastCrawledAt: crawledAt,
              updatedAt: crawledAt,
            })
            .onConflictDoUpdate({
              target: schema.products.coupangId,
              set: {
                name: product.name,
                imageUrl: product.imageUrl,
                link: product.link,
                salePrice: product.salePrice,
                originalPrice: product.originalPrice,
                discountRate: product.discountRate,
                unitPriceText: product.unitPriceText,
                unitPriceValue: product.unitPriceValue || null,
                isRocket: product.isRocket,
                badges: product.badges,
                reviewCount: product.reviewCount,
                ratingAverage: product.ratingAverage,
                lastCrawledAt: crawledAt,
                updatedAt: crawledAt,
              },
            })
            .returning({ id: schema.products.id });

          snapshotRows.push({
            productId: row.id,
            coupangId: product.coupangId,
            collection: col.slug,
            salePrice: product.salePrice,
            originalPrice: product.originalPrice,
            discountRate: product.discountRate,
            unitPriceValue: product.unitPriceValue || null,
            isRocket: product.isRocket,
            badges: product.badges,
            rank: rankMap.get(product.coupangId) ?? null,
            crawledAt,
          });
          upserted++;
        }

        if (snapshotRows.length > 0) {
          await db.insert(schema.coupangPriceSnapshots).values(snapshotRows);
        }
        logger.event("info", "collection_persist_complete", {
          collection: col.slug,
          upserted,
          snapshotCount: snapshotRows.length,
        });

        const finishedAt = new Date();

        const salePrices = products.map((product) => product.salePrice);
        const unitPrices = products
          .filter((product) => product.unitPriceValue > 0)
          .map((product) => product.unitPriceValue);
        const minSalePrice =
          salePrices.length > 0 ? Math.min(...salePrices) : null;
        const minUnitPrice =
          unitPrices.length > 0 ? Math.min(...unitPrices) : null;

        await insertCrawlRun({
          collection: col.slug,
          productCount: products.length,
          minSalePrice,
          minUnitPrice,
          status: "completed",
          startedAt,
          finishedAt,
        });

        console.log(`\n  💾 DB 저장 완료: ${upserted}개 upsert`);
        console.log(
          `  ⏱ ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}초`,
        );

        if (minSalePrice !== null) {
          const top = sorted[0];
          const topRow = await db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(eq(schema.products.coupangId, top.coupangId))
            .limit(1);
          const topProductDbId = topRow[0]?.id ?? null;

          await detectAndNotify({
            collectionSlug: col.slug,
            collectionDisplay: col.displayName,
            current: {
              collection: col.slug,
              minSalePrice,
              minUnitPrice,
              topCoupangId: top.coupangId,
            },
            topProductDbId,
          });
        }

        logger.event("info", "collection_complete", {
          collection: col.slug,
          productCount: products.length,
          minSalePrice,
          minUnitPrice,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        });
        consecutiveFailures = 0;
      } catch (colErr) {
        const msg = colErr instanceof Error ? colErr.message : String(colErr);
        const finishedAt = new Date();
        const status: CrawlRunStatus = isLikelyBlockMessage(msg)
          ? "blocked"
          : "error";
        logger.event("error", "collection_error", {
          collection: col.slug,
          status,
          error: msg,
          consecutiveFailures: consecutiveFailures + 1,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        });

        console.error(`\n  ❌ [${col.displayName}] 실패: ${msg}`);

        if (!dryRun) {
          await insertCrawlRun({
            collection: col.slug,
            productCount: 0,
            status,
            startedAt,
            finishedAt,
            errorMessage: msg,
          });
        }

        consecutiveFailures += 1;
        if (status === "blocked" || consecutiveFailures >= 2) {
          logger.event("warn", "session_stop_after_failure", {
            collection: col.slug,
            status,
            consecutiveFailures,
          });
          console.error(
            "  🛑 안전 규칙에 따라 이번 실행의 남은 쿠팡 카테고리를 중단합니다.",
          );
          break;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.event("error", "main_error", { error: msg });
    console.error(`\n❌ 크롤링 실패: ${msg}`);
  } finally {
    if (session) {
      await session.browser.close();
      session.cleanup();
      logger.event("info", "browser_session_closed");
    }
  }

  logger.event("info", "main_complete");
  console.log("\n=== 완료 ===\n");
}

main().catch((error) => {
  logger.event("error", "fatal_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  console.error("Fatal:", error);
  process.exit(1);
});
