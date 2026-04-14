/**
 * 쿠팡 가격순 정렬 + 최저가 정확도 테스트
 * - sorter=priceAsc 동작 확인
 * - 정가/할인가 정확 파싱
 * - 1~3페이지 가격 범위 확인
 */
import { spawn } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CLEAN_DIR = "/tmp/dealclaw-price-test";
const CDP_PORT = 9446;
let chromeProc = null;

function killChrome() {
  if (chromeProc && !chromeProc.killed) try { chromeProc.kill("SIGTERM"); } catch {}
}

async function extractProducts(page) {
  return page.evaluate(() => {
    const results = [];
    // search-product 리스트 아이템 기준
    const items = document.querySelectorAll("li.search-product, #productList > li");

    for (const item of items) {
      const nameEl = item.querySelector(".name");
      const linkEl = item.querySelector("a.search-product-link, a[href*='/vp/'], a[href*='/products/']");
      const imgEl = item.querySelector("img");

      // 가격 파싱: 원가(취소선) vs 할인가(실제가)
      const originalPriceEl = item.querySelector(".base-price");
      const salePriceEl = item.querySelector(".price-value");
      const unitPriceEl = item.querySelector(".unit-price");
      const rocketEl = item.querySelector(".badge.rocket");
      const ratingCountEl = item.querySelector(".rating-total-count");
      const ratingEl = item.querySelector(".star-rating .fill");

      if (!linkEl) continue;

      const originalPrice = originalPriceEl?.textContent?.trim() || "";
      const salePrice = salePriceEl?.textContent?.trim() || "";
      const unitPrice = unitPriceEl?.textContent?.trim() || "";

      // 숫자만 추출
      const parsePriceNum = (s) => parseInt((s || "").replace(/[^0-9]/g, "") || "0");

      results.push({
        name: nameEl?.textContent?.trim() || "",
        originalPrice,
        salePrice,
        originalPriceNum: parsePriceNum(originalPrice),
        salePriceNum: parsePriceNum(salePrice),
        unitPrice,
        link: linkEl.href || "",
        image: imgEl?.src || imgEl?.getAttribute("data-img-src") || "",
        isRocket: !!rocketEl,
        ratingCount: ratingCountEl?.textContent?.trim() || "",
        rating: ratingEl?.style?.width || "",
      });
    }

    // Fallback: a 태그 기반
    if (results.length === 0) {
      const links = document.querySelectorAll('a[href*="/vp/"], a[href*="/products/"]');
      for (const link of links) {
        if (results.length >= 36) break;
        const container = link.closest("li") || link.parentElement;
        if (!container) continue;
        const text = container.textContent || "";
        const prices = [...text.matchAll(/(\d{1,3}(?:,\d{3})+)/g)].map((m) => m[1]);
        if (prices.length > 0) {
          const nameEl = container.querySelector("[class*='name']");
          const nums = prices.map((p) => parseInt(p.replace(/,/g, "")));
          results.push({
            name: nameEl?.textContent?.trim() || text.substring(0, 60),
            originalPrice: prices[0],
            salePrice: prices.length > 1 ? prices[1] : prices[0],
            originalPriceNum: nums[0],
            salePriceNum: nums.length > 1 ? nums[1] : nums[0],
            unitPrice: "",
            link: link.href,
            image: "",
            isRocket: false,
            ratingCount: "",
            rating: "",
          });
        }
      }
    }

    return results;
  });
}

async function main() {
  try { rmSync(CLEAN_DIR, { recursive: true }); } catch {}
  mkdirSync(CLEAN_DIR, { recursive: true });

  chromeProc = spawn(CHROME_BIN, [
    `--user-data-dir=${CLEAN_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run", "--no-default-browser-check",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chromeProc.on("exit", (code) => console.log(`[chrome] exited code=${code}`));
  await new Promise((r) => setTimeout(r, 5000));

  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, { timeout: 15000 });
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = ctx.pages()[0] || (await ctx.newPage());

  const allProducts = [];

  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    const url = `https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc&listSize=36&page=${pageNum}`;
    console.log(`\n=== 페이지 ${pageNum} ===`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4000));

    // 스크롤해서 lazy load 트리거
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise((r) => setTimeout(r, 500));
    }

    const title = await page.title();
    if (title.includes("Access Denied")) {
      console.log(`  ❌ 페이지 ${pageNum} 차단됨`);
      break;
    }

    const products = await extractProducts(page);
    console.log(`  상품 수: ${products.length}`);

    if (products.length === 0) {
      console.log("  ⚠️ 상품 없음 — 마지막 페이지");
      break;
    }

    // 가격 요약
    const salePrices = products.map((p) => p.salePriceNum).filter((p) => p > 0);
    const minPrice = Math.min(...salePrices);
    const maxPrice = Math.max(...salePrices);
    console.log(`  가격 범위: ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원`);

    // 정렬 확인: 가격이 오름차순인지
    let sorted = true;
    for (let i = 1; i < salePrices.length; i++) {
      if (salePrices[i] < salePrices[i - 1]) {
        sorted = false;
        break;
      }
    }
    console.log(`  가격순 정렬: ${sorted ? "✅" : "❌ (정렬 깨짐)"}`);

    // 상위 5개 출력
    products.slice(0, 5).forEach((p, i) => {
      const idx = allProducts.length + i + 1;
      const discount = p.originalPriceNum > p.salePriceNum && p.originalPriceNum > 0
        ? ` (정가 ${p.originalPrice} → ${Math.round((1 - p.salePriceNum / p.originalPriceNum) * 100)}% 할인)`
        : "";
      console.log(`  ${idx}. ${p.name?.substring(0, 50)}`);
      console.log(`     💰 ${p.salePrice}원${discount} | 🚀 ${p.isRocket ? "Y" : "N"} | ${p.unitPrice}`);
    });

    allProducts.push(...products);

    // 페이지 간 가격 연속성 확인
    if (pageNum > 1) {
      const prevMax = Math.max(...allProducts.slice(0, -products.length).map((p) => p.salePriceNum).filter((p) => p > 0));
      console.log(`  페이지 연속성: 이전 최고가 ${prevMax.toLocaleString()}원 → 이번 최저가 ${minPrice.toLocaleString()}원 ${minPrice >= prevMax ? "✅" : "⚠️ 겹침"}`);
    }
  }

  // 전체 요약
  console.log("\n\n=== 전체 요약 ===");
  console.log(`총 상품: ${allProducts.length}개`);

  const allSalePrices = allProducts.map((p) => p.salePriceNum).filter((p) => p > 0);
  console.log(`전체 가격 범위: ${Math.min(...allSalePrices).toLocaleString()}원 ~ ${Math.max(...allSalePrices).toLocaleString()}원`);

  // 최저가 TOP 5 (할인가 기준)
  const top5 = [...allProducts]
    .filter((p) => p.salePriceNum > 0)
    .sort((a, b) => a.salePriceNum - b.salePriceNum)
    .slice(0, 5);

  console.log("\n🏆 최저가 TOP 5:");
  top5.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name?.substring(0, 55)}`);
    console.log(`     💰 ${p.salePrice}원 | ${p.unitPrice} | 🚀 ${p.isRocket ? "Y" : "N"}`);
    console.log(`     🔗 ${p.link?.substring(0, 90)}`);
  });

  // 1페이지만으로 충분한지 분석
  const page1Min = Math.min(...allProducts.slice(0, 36).map((p) => p.salePriceNum).filter((p) => p > 0));
  const globalMin = Math.min(...allSalePrices);
  console.log(`\n📊 분석: 1페이지 최저가=${page1Min.toLocaleString()}원, 전체 최저가=${globalMin.toLocaleString()}원`);
  console.log(`   → 1페이지만으로 최저가 확보: ${page1Min === globalMin ? "✅ 충분" : "❌ 부족 (더 봐야 함)"}`);

  await page.screenshot({ path: "price-sort-result.png" });
  await browser.close();
  killChrome();
}

main().catch((e) => { console.error(e); killChrome(); });
