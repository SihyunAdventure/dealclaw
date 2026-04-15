import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../lib/db/schema";
import { launchChrome } from "../crawl/chrome";
import { crawlOliveYoungRanking } from "../crawl/oliveyoung-ranking";
import {
  upsertOliveYoungProducts,
  insertRankingSnapshots,
  recordCrawlRun,
  countRowsForDebug,
} from "../crawl/oliveyoung-storage";

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv
    .find((a) => a.startsWith("--limit="))
    ?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : 100;

  console.log(`\n=== 올영 베스트 랭킹 크롤 ===`);
  console.log(`모드: ${dryRun ? "DRY RUN (DB 쓰기 skip)" : "LIVE"}`);
  console.log(`limit: ${limit}\n`);

  if (!dryRun && !DATABASE_URL) {
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
  const { browser, page, cleanup } = await launchChrome({
    headless,
    offScreen: !visible && !headless,
  });

  try {
    const products = await crawlOliveYoungRanking(page, limit);
    console.log(`✅ ${products.length}개 상품 수집 완료`);

    if (products.length === 0) {
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

    if (dryRun) {
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

    const sqlClient = neon(DATABASE_URL!);
    const db = drizzle(sqlClient, { schema });

    const crawledAt = new Date();
    try {
      await upsertOliveYoungProducts(db, products, crawledAt);
      console.log(`💾 products upsert: ${products.length}개`);

      await insertRankingSnapshots(db, products, crawledAt);
      console.log(`💾 snapshots insert: ${products.length}개`);

      const finishedAt = new Date();
      const runId = await recordCrawlRun(db, {
        productCount: products.length,
        todayDealCount,
        minSalePrice,
        maxDiscountRate,
        startedAt,
        finishedAt,
        status: "completed",
      });
      console.log(`💾 crawl_runs: ${runId}`);

      const counts = await countRowsForDebug(db);
      console.log(
        `\n📊 DB 현황: products=${counts.products} · snapshots=${counts.snapshots} · runs=${counts.runs}`,
      );
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error(`\n❌ DB 저장 실패: ${msg}`);
      await recordCrawlRun(db, {
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
    console.log(`\n⏱ ${elapsed.toFixed(1)}초\n✅ 완료`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 크롤 실패: ${msg}`);
    process.exit(1);
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
