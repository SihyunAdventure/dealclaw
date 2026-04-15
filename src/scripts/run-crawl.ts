import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../../lib/db/schema";
import { collections } from "../data/collections";
import { launchChrome } from "../crawl/chrome";
import { crawlCoupangSearch } from "../crawl/coupang-search";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function main() {
  const targetSlug = process.argv.find((a) => a.startsWith("--collection="))?.split("=")[1];
  const dryRun = process.argv.includes("--dry-run");

  const targets = targetSlug
    ? collections.filter((c) => c.slug === targetSlug)
    : collections;

  if (targets.length === 0) {
    console.error(`Collection not found: ${targetSlug}`);
    process.exit(1);
  }

  console.log(`\n=== hotinbeauty 크롤러 ===`);
  console.log(`대상: ${targets.map((c) => c.displayName).join(", ")}`);
  console.log(`모드: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const { browser, page, cleanup } = await launchChrome();

  try {
    for (const col of targets) {
     try {
      const startedAt = new Date();
      console.log(`\n📦 [${col.displayName}] 크롤링 시작...`);

      const products = await crawlCoupangSearch(page, col.query);
      console.log(`  ✅ ${products.length}개 상품 파싱 완료`);

      if (products.length === 0) {
        console.log("  ⚠️ 상품 없음 — skip");
        continue;
      }

      // Sort and show top 5
      const sorted = [...products].sort((a, b) => a.unitPriceValue - b.unitPriceValue || a.salePrice - b.salePrice);
      console.log("\n  TOP 5 (100g당 가격순):");
      sorted.slice(0, 5).forEach((p, i) => {
        console.log(`    ${i + 1}. ${p.name.substring(0, 45)}`);
        console.log(`       💰 ${p.salePrice.toLocaleString()}원 | ${p.unitPriceText || "-"}`);
      });

      if (dryRun) {
        console.log(`\n  [DRY RUN] DB 저장 생략`);
        continue;
      }

      // Upsert products
      let upserted = 0;
      for (const p of products) {
        await db
          .insert(schema.products)
          .values({
            collection: col.slug,
            coupangId: p.coupangId,
            name: p.name,
            imageUrl: p.imageUrl,
            link: p.link,
            salePrice: p.salePrice,
            originalPrice: p.originalPrice,
            discountRate: p.discountRate,
            unitPriceText: p.unitPriceText,
            unitPriceValue: p.unitPriceValue || null,
            isRocket: p.isRocket,
            badges: p.badges,
            lastCrawledAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.products.coupangId,
            set: {
              name: p.name,
              imageUrl: p.imageUrl,
              link: p.link,
              salePrice: p.salePrice,
              originalPrice: p.originalPrice,
              discountRate: p.discountRate,
              unitPriceText: p.unitPriceText,
              unitPriceValue: p.unitPriceValue || null,
              isRocket: p.isRocket,
              badges: p.badges,
              lastCrawledAt: new Date(),
              updatedAt: new Date(),
            },
          });
        upserted++;
      }

      const finishedAt = new Date();

      // Log crawl run
      const salePrices = products.map((p) => p.salePrice);
      const unitPrices = products.filter((p) => p.unitPriceValue > 0).map((p) => p.unitPriceValue);
      await db.insert(schema.crawlRuns).values({
        collection: col.slug,
        productCount: products.length,
        minSalePrice: salePrices.length > 0 ? Math.min(...salePrices) : null,
        minUnitPrice: unitPrices.length > 0 ? Math.min(...unitPrices) : null,
        status: "completed",
        startedAt,
        finishedAt,
      });

      console.log(`\n  💾 DB 저장 완료: ${upserted}개 upsert`);
      console.log(`  ⏱ ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}초`);
     } catch (colErr: any) {
      console.error(`\n  ❌ [${col.displayName}] 실패: ${colErr.message}`);
     }
    }
  } catch (err: any) {
    console.error(`\n❌ 크롤링 실패: ${err.message}`);
  } finally {
    await browser.close();
    cleanup();
  }

  console.log("\n=== 완료 ===\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
