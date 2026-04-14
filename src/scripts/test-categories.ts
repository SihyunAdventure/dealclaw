/**
 * 여러 인기 품목의 단위가격 패턴 조사
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { launchChrome } from "../crawl/chrome";
import { parsePriceArea } from "../crawl/parser";
import type { Page } from "playwright";

const categories = [
  { name: "계란", query: "계란" },
  { name: "쌀", query: "쌀 10kg" },
  { name: "생수", query: "생수 2L" },
  { name: "라면", query: "신라면" },
  { name: "커피", query: "맥심 커피믹스" },
  { name: "휴지", query: "화장지" },
  { name: "닭가슴살", query: "닭가슴살" },
  { name: "우유", query: "서울우유 1L" },
  { name: "바나나", query: "바나나" },
  { name: "기저귀", query: "기저귀" },
  { name: "세제", query: "세탁세제" },
  { name: "삼겹살", query: "삼겹살" },
];

async function extractUnitPrices(page: Page, query: string) {
  const url = `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}&channel=user&sorter=priceAsc&listSize=36`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4000));

  // scroll
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise((r) => setTimeout(r, 300));
  }

  const title = await page.title();
  if (title.includes("Access Denied")) return { error: "blocked", samples: [] };

  const rawData = await page.evaluate(() => {
    const items = document.querySelectorAll("ul#product-list > li");
    const results: { name: string; priceText: string }[] = [];
    for (const item of items) {
      const nameEl = item.querySelector("[class*='productName']");
      const priceArea = item.querySelector("[class*='priceArea']");
      if (!nameEl || !priceArea) continue;
      results.push({
        name: nameEl.textContent?.trim() || "",
        priceText: priceArea.textContent || "",
      });
      if (results.length >= 10) break;
    }
    return results;
  });

  return {
    count: rawData.length,
    samples: rawData.map((r) => {
      const parsed = parsePriceArea(r.priceText);
      return {
        name: r.name.substring(0, 40),
        salePrice: parsed.salePrice,
        unitPriceText: parsed.unitPriceText,
        unitPriceValue: parsed.unitPriceValue,
      };
    }),
  };
}

async function main() {
  const { browser, page, cleanup } = await launchChrome();

  try {
    for (const cat of categories) {
      console.log(`\n=== ${cat.name} (${cat.query}) ===`);
      const result = await extractUnitPrices(page, cat.query);

      if ("error" in result) {
        console.log("  ❌ 차단됨");
        continue;
      }

      console.log(`  상품 수: ${result.count}`);

      // 단위가격 패턴 분석
      const unitPatterns = result.samples
        .filter((s) => s.unitPriceText)
        .map((s) => s.unitPriceText);
      const uniqueUnits = [...new Set(unitPatterns.map((u) => u.match(/([\d,]+g당|[\d,]+ml당|[\d,]+L당|[\d,]+kg당|[\d,]+개당|[\d,]+매당|[\d,]+장당|[\d,]+봉당|[\d,]+ea당|1개당|10g당|100g당|1kg당|1L당)/)?.[0] || u))];

      console.log(`  단위가격 패턴: ${uniqueUnits.length > 0 ? uniqueUnits.join(", ") : "없음"}`);

      result.samples.slice(0, 3).forEach((s, i) => {
        console.log(`    ${i + 1}. ${s.name}`);
        console.log(`       ${s.salePrice.toLocaleString()}원 | ${s.unitPriceText || "(단위가격 없음)"}`);
      });

      // delay between categories
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch(console.error);
