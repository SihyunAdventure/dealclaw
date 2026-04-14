/**
 * 쿠팡 sorter 값별 최저가 비교
 * priceAsc / saleCountDesc / scoreDesc / latestAsc
 */
import { spawn } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIR = "/tmp/dealclaw-sorters";
const PORT = 9451;
let proc = null;

try { rmSync(DIR, { recursive: true }); } catch {}
mkdirSync(DIR, { recursive: true });

proc = spawn(CHROME_BIN, [
  `--user-data-dir=${DIR}`, `--remote-debugging-port=${PORT}`,
  "--no-first-run", "--no-default-browser-check",
], { stdio: ["ignore", "pipe", "pipe"] });

await new Promise(r => setTimeout(r, 5000));

function extractProducts(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("ul#product-list > li");
    const results = [];
    for (const item of items) {
      const linkEl = item.querySelector("a[href*='/vp/products/']");
      if (!linkEl) continue;
      const nameEl = item.querySelector("[class*='productName']");
      const name = nameEl?.textContent?.trim() || "";
      const priceArea = item.querySelector("[class*='priceArea']");
      if (!priceArea) continue;
      const text = priceArea.textContent || "";
      const allPrices = [...text.matchAll(/(\d{1,3}(?:,\d{3})+)원/g)].map(m => ({
        text: m[1], num: parseInt(m[1].replace(/,/g, "")),
      }));
      const unitMatch = text.match(/\(([^)]*\d{1,3}(?:,\d{3})*원[^)]*)\)/);
      const unitPriceNum = unitMatch
        ? parseInt((unitMatch[1].match(/(\d{1,3}(?:,\d{3})+)/)?.[1] || "0").replace(/,/g, ""))
        : 0;
      const realPrices = allPrices.filter(p => p.num !== unitPriceNum);
      const discountMatch = text.match(/(\d+)%/);
      const discountRate = discountMatch ? parseInt(discountMatch[1]) : 0;
      let salePrice = 0, originalPrice = 0;
      if (discountRate > 0 && realPrices.length >= 2) {
        originalPrice = realPrices[0].num;
        salePrice = realPrices[1].num;
      } else if (realPrices.length >= 1) {
        salePrice = realPrices[0].num;
        originalPrice = salePrice;
      }
      const href = linkEl.getAttribute("href") || "";
      const productId = href.match(/products\/(\d+)/)?.[1] || "";
      if (salePrice > 0) {
        results.push({ name, salePrice, originalPrice, discountRate, productId,
          link: "https://www.coupang.com" + href });
      }
    }
    return results;
  });
}

try {
  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 15000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  const sorters = [
    { key: "priceAsc", label: "가격순" },
    { key: "saleCountDesc", label: "판매량순" },
    { key: "scoreDesc", label: "추천순" },
  ];

  const allResults = {};

  for (const s of sorters) {
    const url = `https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=${s.key}&listSize=72`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(r => setTimeout(r, 300));
    }
    const products = await extractProducts(page);
    allResults[s.key] = products;

    const sorted = [...products].sort((a, b) => a.salePrice - b.salePrice);
    const top5 = sorted.slice(0, 5);
    console.log(`\n=== ${s.label} (${s.key}) — ${products.length}개 ===`);
    console.log(`  최저가: ${sorted[0]?.salePrice?.toLocaleString()}원`);
    console.log(`  TOP 5:`);
    top5.forEach((p, i) => {
      const disc = p.discountRate > 0 ? ` (-${p.discountRate}%)` : "";
      console.log(`    ${i+1}. ${p.salePrice.toLocaleString()}원${disc} | ${p.name.substring(0, 45)}`);
    });
  }

  // 비교: sorter별 최저가
  console.log("\n\n=== 📊 sorter별 최저가 비교 ===\n");
  console.log("| sorter | 상품수 | 최저가 | 최저가 상품 |");
  console.log("|--------|--------|--------|------------|");
  for (const s of sorters) {
    const prods = allResults[s.key];
    const min = [...prods].sort((a, b) => a.salePrice - b.salePrice)[0];
    console.log(`| ${s.label.padEnd(6)} | ${String(prods.length).padStart(4)}개 | ${min?.salePrice?.toLocaleString().padStart(7)}원 | ${min?.name?.substring(0, 35)} |`);
  }

  // 교차 분석: 가격순에만 있는 상품 vs 판매량순에만 있는 상품
  const priceIds = new Set(allResults.priceAsc.map(p => p.productId));
  const saleIds = new Set(allResults.saleCountDesc.map(p => p.productId));
  const onlyInSale = allResults.saleCountDesc.filter(p => !priceIds.has(p.productId));
  const onlyInPrice = allResults.priceAsc.filter(p => !saleIds.has(p.productId));

  console.log(`\n판매량순에만 있는 상품: ${onlyInSale.length}개`);
  console.log(`가격순에만 있는 상품: ${onlyInPrice.length}개`);
  console.log(`겹치는 상품: ${priceIds.size + saleIds.size - onlyInSale.length - onlyInPrice.length - priceIds.size}개`);

  // 판매량순에만 있으면서 저렴한 상품
  const cheapInSaleOnly = onlyInSale
    .sort((a, b) => a.salePrice - b.salePrice)
    .slice(0, 5);
  if (cheapInSaleOnly.length > 0) {
    console.log("\n판매량순에만 있는 저렴한 상품:");
    cheapInSaleOnly.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.salePrice.toLocaleString()}원 | ${p.name.substring(0, 45)}`);
    });
  }

  // 결론
  const priceMin = Math.min(...allResults.priceAsc.map(p => p.salePrice));
  const saleMin = Math.min(...allResults.saleCountDesc.map(p => p.salePrice));
  const scoreMin = Math.min(...allResults.scoreDesc.map(p => p.salePrice));
  const globalMin = Math.min(priceMin, saleMin, scoreMin);

  console.log(`\n=== 결론 ===`);
  console.log(`전체 최저가: ${globalMin.toLocaleString()}원`);
  console.log(`priceAsc 최저가: ${priceMin.toLocaleString()}원 ${priceMin === globalMin ? "✅ (최적)" : ""}`);
  console.log(`saleCountDesc 최저가: ${saleMin.toLocaleString()}원 ${saleMin === globalMin ? "✅ (최적)" : ""}`);
  console.log(`scoreDesc 최저가: ${scoreMin.toLocaleString()}원 ${scoreMin === globalMin ? "✅ (최적)" : ""}`);

  await browser.close();
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  try { proc.kill("SIGTERM"); } catch {}
}
