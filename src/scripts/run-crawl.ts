import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, asc, eq, gte } from "drizzle-orm";
import * as schema from "../../lib/db/schema";
import { collections } from "../data/collections";
import { launchChrome } from "../crawl/chrome";
import { crawlCoupangSearch } from "../crawl/coupang-search";
import {
  DETECTION_CONFIG,
  detectNewLow,
  shouldNotifySubscriber,
  type CurrentCrawl,
  type PriceHistoryPoint,
} from "../crawl/detect-new-low";
import { sendEmail } from "../../lib/email/ses";
import { priceAlertEmail } from "../../lib/email/templates";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const SITE_URL = process.env.SITE_URL || "https://hotinbeauty.com";

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
  console.log(
    `  🔔 감지: ${result.reason} (dropRate=${(result.dropRate * 100).toFixed(1)}%, windowMin=${result.windowMin})`,
  );

  // 현재 상태를 price_history에 기록 (다음 크롤의 베이스라인)
  await db.insert(schema.priceHistory).values({
    collection: collectionSlug,
    minSalePrice: current.minSalePrice,
    minUnitPrice: current.minUnitPrice,
    topProductId: topProductDbId,
    topCoupangId: current.topCoupangId,
    crawledAt: now,
  });

  if (!result.shouldAlert || !topProductDbId) return;

  // 활성 구독자 조회
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
    console.log(`  📭 활성 구독자 없음 — 알림 생략`);
    return;
  }

  // 최저가 제품 상세 조회 (알림 메일에 포함)
  const topProduct = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, topProductDbId))
    .limit(1);

  if (topProduct.length === 0) {
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
      console.error(`  ⚠️ SES 발송 실패 ${sub.email}:`, err);
    }
  }
  console.log(
    `  📬 알림 발송: ${sent}건 (쿨다운 skip ${skipped}건, 총 ${subscribers.length}명)`,
  );
}

async function main() {
  const targetSlug = process.argv
    .find((a) => a.startsWith("--collection="))
    ?.split("=")[1];
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

  const { browser, page, cleanup } = await launchChrome({
    profileKey: "coupang",
    offScreen: true,
  });

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

        const sorted = [...products].sort(
          (a, b) =>
            a.unitPriceValue - b.unitPriceValue || a.salePrice - b.salePrice,
        );
        console.log("\n  TOP 5 (단위가격 순):");
        sorted.slice(0, 5).forEach((p, i) => {
          console.log(`    ${i + 1}. ${p.name.substring(0, 45)}`);
          console.log(
            `       💰 ${p.salePrice.toLocaleString()}원 | ${p.unitPriceText || "-"}`,
          );
        });

        if (dryRun) {
          console.log(`\n  [DRY RUN] DB 저장 · 알림 발송 생략`);
          continue;
        }

        // 단위가격 오름차순 rank (스냅샷용)
        const rankMap = new Map<string, number>();
        sorted.forEach((p, i) => rankMap.set(p.coupangId, i + 1));

        const crawledAt = new Date();
        const snapshotRows: (typeof schema.coupangPriceSnapshots.$inferInsert)[] = [];

        // Upsert products + collect snapshots
        let upserted = 0;
        for (const p of products) {
          const [row] = await db
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
              lastCrawledAt: crawledAt,
              updatedAt: crawledAt,
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
                lastCrawledAt: crawledAt,
                updatedAt: crawledAt,
              },
            })
            .returning({ id: schema.products.id });

          snapshotRows.push({
            productId: row.id,
            coupangId: p.coupangId,
            collection: col.slug,
            salePrice: p.salePrice,
            originalPrice: p.originalPrice,
            discountRate: p.discountRate,
            unitPriceValue: p.unitPriceValue || null,
            isRocket: p.isRocket,
            badges: p.badges,
            rank: rankMap.get(p.coupangId) ?? null,
            crawledAt,
          });
          upserted++;
        }

        if (snapshotRows.length > 0) {
          await db.insert(schema.coupangPriceSnapshots).values(snapshotRows);
        }

        const finishedAt = new Date();

        const salePrices = products.map((p) => p.salePrice);
        const unitPrices = products
          .filter((p) => p.unitPriceValue > 0)
          .map((p) => p.unitPriceValue);
        const minSalePrice =
          salePrices.length > 0 ? Math.min(...salePrices) : null;
        const minUnitPrice =
          unitPrices.length > 0 ? Math.min(...unitPrices) : null;

        await db.insert(schema.crawlRuns).values({
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

        // 신규 최저가 감지 + 구독자 알림
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
      } catch (colErr) {
        const msg = colErr instanceof Error ? colErr.message : String(colErr);
        console.error(`\n  ❌ [${col.displayName}] 실패: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 크롤링 실패: ${msg}`);
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
