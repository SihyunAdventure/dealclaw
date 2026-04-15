// SIH-570 Phase 4 엔트리.
// 매일 KST 06:00 launchd 에서 실행됨(SIH-571). 기본 동작:
//   1. 화해 5 테마 크롤 (crawlHwahaeRankings)
//   2. 결과를 Neon Postgres 로 저장 (persistCrawlOutcome)
//   3. theme 별 crawl_runs row 기록
//
// 옵션:
//   --dry-run        : DB 저장 생략. 크롤 결과 요약만 출력.
//   --themes=a,b     : 지정 테마만 크롤 (기본: 전체 5종).
//   --max-leaves=N   : 테마당 리프 상한 (디버그용).
//
// 환경변수:
//   DATABASE_URL         Neon Postgres 연결 문자열 (dry-run 이 아니면 필수).
//   HWAHAE_USER_AGENT    (선택) UA 오버라이드. 기본: 하드코딩 Chrome 124.

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  crawlHwahaeRankings,
  type CrawlOutcome,
} from "../crawl/hwahae-ranking";
import {
  persistCrawlOutcome,
  recordHwahaeCrawlRun,
  type HwahaeDb,
} from "../crawl/hwahae-storage";
import type { HwahaeThemeSlug } from "../crawl/hwahae-types";

const VALID_THEMES: HwahaeThemeSlug[] = [
  "trending",
  "category",
  "skin",
  "age",
  "brand",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const themes = args
    .find((a) => a.startsWith("--themes="))
    ?.split("=")[1]
    ?.split(",")
    .map((s) => s.trim())
    .filter((s): s is HwahaeThemeSlug =>
      VALID_THEMES.includes(s as HwahaeThemeSlug),
    );
  const maxLeaves = Number(
    args.find((a) => a.startsWith("--max-leaves="))?.split("=")[1] ?? NaN,
  );
  return {
    dryRun,
    themes: themes && themes.length > 0 ? themes : undefined,
    maxLeavesPerTheme: Number.isFinite(maxLeaves) ? maxLeaves : undefined,
  };
}

function groupProductsByTheme(outcome: CrawlOutcome) {
  const byTheme = new Map<HwahaeThemeSlug, typeof outcome.products>();
  for (const p of outcome.products) {
    const list = byTheme.get(p.theme) ?? [];
    list.push(p);
    byTheme.set(p.theme, list);
  }
  return byTheme;
}

async function main() {
  const opts = parseArgs();
  const startedAt = new Date();

  console.log(
    `\n=== 화해 크롤러 ${opts.dryRun ? "(DRY RUN)" : ""} ===`,
  );
  console.log(
    `테마: ${opts.themes?.join(",") ?? "전체 5종"} · 리프 상한: ${opts.maxLeavesPerTheme ?? "제한 없음"}`,
  );

  const outcome = await crawlHwahaeRankings({
    themes: opts.themes,
    maxLeavesPerTheme: opts.maxLeavesPerTheme,
    userAgent: process.env.HWAHAE_USER_AGENT,
    log: (level, msg) => {
      if (level === "error" || level === "warn") {
        console.log(`  [${level}] ${msg}`);
      }
    },
  });

  console.log(`\n📦 크롤 결과`);
  console.log(`  - themes        : ${outcome.themes.length}`);
  console.log(`  - categoryNodes : ${outcome.categoryNodes.length}`);
  console.log(`  - products      : ${outcome.products.length}`);
  console.log(`  - brandRanks    : ${outcome.brandRanks.length}`);
  console.log(`  - leafCount     : ${outcome.leafCount}`);
  console.log(`  - errors        : ${outcome.errors.length}`);
  console.log(`  - duration      : ${outcome.durationMs}ms`);

  if (outcome.errors.length > 0) {
    console.log(`\n⚠️ 에러 ${outcome.errors.length}건 (첫 5건):`);
    for (const e of outcome.errors.slice(0, 5)) {
      console.log(`  - [${e.theme}/${e.themeId}] ${e.message}`);
    }
  }

  if (opts.dryRun) {
    console.log(`\n[DRY RUN] DB 저장 생략`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("\n❌ DATABASE_URL 미설정. --dry-run 으로 실행하거나 .env.local 설정.");
    process.exit(1);
  }
  if (outcome.products.length === 0) {
    console.log(`\n⚠️ 상품 0건 — DB 저장 skip`);
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql) as unknown as HwahaeDb;

  console.log(`\n💾 DB 저장 시작...`);
  const persistStart = Date.now();
  const summary = await persistCrawlOutcome(db, outcome, { startedAt });
  console.log(`  - themes           : ${summary.themesUpserted}`);
  console.log(`  - categoryNodes    : ${summary.categoryNodesUpserted}`);
  console.log(`  - brands           : ${summary.brandsUpserted}`);
  console.log(`  - products         : ${summary.productsUpserted}`);
  console.log(`  - rankingSnapshots : ${summary.rankingSnapshotsInserted}`);
  console.log(`  - brandSnapshots   : ${summary.brandSnapshotsInserted}`);
  console.log(`  - productTopics    : ${summary.productTopicsInserted}`);
  console.log(`  - awards           : ${summary.awardsInserted}`);
  console.log(`  - duration         : ${Date.now() - persistStart}ms`);

  // theme 별 crawl_runs row — run 이력 조회의 단위. 5 slug 중 실제 상품이 있는 것만.
  const finishedAt = new Date();
  const byTheme = groupProductsByTheme(outcome);
  for (const [theme, prods] of byTheme) {
    const ratings = prods
      .map((p) => p.rating)
      .filter((r): r is number => r !== null);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((s, x) => s + x, 0) / ratings.length
        : null;
    const newEntries = prods.filter((p) => p.isRankNew).length;
    const themeErrors = outcome.errors.filter((e) => e.theme === theme).length;
    await recordHwahaeCrawlRun(db, {
      theme,
      themeId: null, // 전체 리프 합산이라 null
      productCount: prods.length,
      newEntryCount: newEntries,
      avgRating,
      status: themeErrors > 0 ? "partial" : "completed",
      errorMessage:
        themeErrors > 0
          ? `${themeErrors} leaves failed out of ${prods.length}`
          : null,
      startedAt,
      finishedAt,
    });
  }
  console.log(`  - crawl_runs       : ${byTheme.size} (theme별)`);

  console.log(`\n✅ 완료\n`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
