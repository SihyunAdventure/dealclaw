import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../lib/db/schema";
import { launchChrome } from "../crawl/chrome";
import { createCrawlLogger } from "../crawl/run-logger";
import { crawlOliveYoungRanking } from "../crawl/oliveyoung-ranking";
import {
  upsertOliveYoungProducts,
  insertRankingSnapshots,
  recordCrawlRun,
  countRowsForDebug,
} from "../crawl/oliveyoung-storage";

const DATABASE_URL = process.env.DATABASE_URL;
const logger = createCrawlLogger("oliveyoung");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv
    .find((a) => a.startsWith("--limit="))
    ?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : 100;
  logger.event("info", "main_start", {
    argv: process.argv.slice(2),
    dryRun,
    limit,
  });

  console.log(`\n=== 올영 베스트 랭킹 크롤 ===`);
  console.log(`모드: ${dryRun ? "DRY RUN (DB 쓰기 skip)" : "LIVE"}`);
  console.log(`limit: ${limit}\n`);

  if (!dryRun && !DATABASE_URL) {
    logger.event("error", "config_missing_database_url");
    console.error("DATABASE_URL 미설정. .env.local 확인.");
    process.exit(1);
  }

  // 기본: off-screen headful (Cloudflare 통과 + UX 방해 없음).
  // CRAWL_VISIBLE=1 로 디버깅 시 창 on-screen 전환 가능.
  // CRAWL_HEADLESS=1 은 실험용 — 현재 Cloudflare 로 막힘.
  const visible = process.env.CRAWL_VISIBLE === "1";
  const headless = process.env.CRAWL_HEADLESS === "1";
  const mode = headless
    ? "headless (실험)"
    : visible
      ? "headful (visible)"
      : "headful (off-screen, 창 안 보임)";
  console.log(`브라우저: ${mode}`);

  const startedAt = new Date();
  const db = !dryRun && DATABASE_URL
    ? drizzle(neon(DATABASE_URL), { schema })
    : null;

  let browserSession: Awaited<ReturnType<typeof launchChrome>> | null = null;

  try {
    browserSession = await launchChrome({
      headless,
      offScreen: !visible && !headless,
    });
    logger.event("info", "browser_session_started", {
      mode,
      limit,
    });

    const products = await crawlOliveYoungRanking(browserSession.page, limit);
    logger.event("info", "crawl_parsed", {
      productCount: products.length,
      limit,
    });
    console.log(`✅ ${products.length}개 상품 수집 완료`);

    if (products.length === 0) {
      logger.event("warn", "crawl_empty_result", { limit });
      if (db) {
        await recordCrawlRun(db, {
          productCount: 0,
          todayDealCount: 0,
          minSalePrice: null,
          maxDiscountRate: null,
          startedAt,
          finishedAt: new Date(),
          status: "failed",
          errorMessage: "empty_result",
        }).catch(() => {});
      }
      console.log("⚠️ 상품 없음 — exit");
      return;
    }

    const todayDealCount = products.filter((p) => p.isTodayDeal).length;
    const salePrices = products.map((p) => p.salePrice);
    const discountRates = products.map((p) => p.discountRate);
    const minSalePrice = Math.min(...salePrices);
    const maxDiscountRate = Math.max(...discountRates);

    console.log(
      `📊 오특 ${todayDealCount}개 · 최저가 ${minSalePrice.toLocaleString()}원 · 최고할인 ${maxDiscountRate}%`,
    );
    logger.event("info", "crawl_summary", {
      productCount: products.length,
      todayDealCount,
      minSalePrice,
      maxDiscountRate,
    });

    if (dryRun) {
      logger.event("info", "dry_run_complete", {
        productCount: products.length,
      });
      console.log("\n[DRY RUN] DB 쓰기 생략. 상위 5개 미리보기:");
      products.slice(0, 5).forEach((p) => {
        console.log(
          `  ${String(p.rank).padStart(2, "0")}. [${p.brand}] ${p.name.slice(0, 50)}`,
        );
        console.log(
          `      💰 ${p.salePrice.toLocaleString()}원 (-${p.discountRate}%) ${p.isTodayDeal ? "🔥오특" : ""}`,
        );
      });
      return;
    }

    const crawledAt = new Date();
    try {
      await upsertOliveYoungProducts(db!, products, crawledAt);
      logger.event("info", "products_upserted", {
        productCount: products.length,
      });
      console.log(`💾 products upsert: ${products.length}개`);

      await insertRankingSnapshots(db!, products, crawledAt);
      logger.event("info", "snapshots_inserted", {
        snapshotCount: products.length,
      });
      console.log(`💾 snapshots insert: ${products.length}개`);

      const finishedAt = new Date();
      const runId = await recordCrawlRun(db!, {
        productCount: products.length,
        todayDealCount,
        minSalePrice,
        maxDiscountRate,
        startedAt,
        finishedAt,
        status: "completed",
      });
      logger.event("info", "crawl_run_record", {
        status: "completed",
        runRecordId: runId,
        productCount: products.length,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      });
      console.log(`💾 crawl_runs: ${runId}`);

      const counts = await countRowsForDebug(db!);
      logger.event("info", "db_counts", counts);
      console.log(
        `\n📊 DB 현황: products=${counts.products} · snapshots=${counts.snapshots} · runs=${counts.runs}`,
      );
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      logger.event("error", "db_write_failed", {
        error: msg,
        productCount: products.length,
      });
      console.error(`\n❌ DB 저장 실패: ${msg}`);
      await recordCrawlRun(db!, {
        productCount: products.length,
        todayDealCount,
        minSalePrice,
        maxDiscountRate,
        startedAt,
        finishedAt: new Date(),
        status: "failed",
        errorMessage: msg.slice(0, 500),
      }).catch(() => {});
      process.exit(1);
    }

    const elapsed = (Date.now() - startedAt.getTime()) / 1000;
    logger.event("info", "main_complete", {
      productCount: products.length,
      elapsedSeconds: elapsed,
    });
    console.log(`\n⏱ ${elapsed.toFixed(1)}초\n✅ 완료`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.event("error", "crawl_failed", { error: msg });
    if (db) {
      await recordCrawlRun(db, {
        productCount: 0,
        todayDealCount: 0,
        minSalePrice: null,
        maxDiscountRate: null,
        startedAt,
        finishedAt: new Date(),
        status: "failed",
        errorMessage: msg.slice(0, 500),
      }).catch(() => {});
    }
    console.error(`\n❌ 크롤 실패: ${msg}`);
    process.exit(1);
  } finally {
    if (browserSession) {
      await browserSession.browser.close();
      browserSession.cleanup();
      logger.event("info", "browser_session_closed");
    }
  }
}

main().catch((e) => {
  logger.event("error", "fatal_error", {
    error: e instanceof Error ? e.message : String(e),
  });
  console.error("fatal:", e);
  process.exit(1);
});
