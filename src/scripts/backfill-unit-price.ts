import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, or, isNull } from "drizzle-orm";
import * as schema from "../../lib/db/schema";
import { computeUnitPriceFromName } from "../crawl/compute-unit-price";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL 미설정");
    process.exit(1);
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  console.log(`\n=== 단가 backfill (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);

  // unit_price_text가 비어 있거나 null인 제품만 대상
  const rows = await db
    .select()
    .from(schema.products)
    .where(
      or(
        eq(schema.products.unitPriceText, ""),
        isNull(schema.products.unitPriceText),
      ),
    );

  console.log(`대상: ${rows.length}개 제품\n`);

  let filled = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (const product of rows) {
    const computed = computeUnitPriceFromName(product.name, product.salePrice);
    if (computed.unitPriceValue <= 0) {
      skipped++;
      continue;
    }
    if (samples.length < 10) {
      samples.push(
        `  [${product.collection}] ${product.name.slice(0, 40)} (${product.salePrice.toLocaleString()}원) → ${computed.unitPriceText}`,
      );
    }
    if (!dryRun) {
      await db
        .update(schema.products)
        .set({
          unitPriceText: computed.unitPriceText,
          unitPriceValue: computed.unitPriceValue,
        })
        .where(eq(schema.products.id, product.id));
    }
    filled++;
  }

  console.log("샘플:");
  samples.forEach((s) => console.log(s));
  console.log();
  console.log(`✅ 채움: ${filled}개`);
  console.log(`⚠️  건너뜀 (용량/개수 파싱 실패): ${skipped}개`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
