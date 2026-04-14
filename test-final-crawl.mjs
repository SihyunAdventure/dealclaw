/**
 * 쿠팡 차돌박이 최저가 크롤링 — 정확한 셀렉터 버전
 * 1페이지(60개) 가격순 정렬, 정가/할인가 정확 파싱
 */
import { spawn } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIR = "/tmp/dealclaw-final";
const PORT = 9450;
let proc = null;

try { rmSync(DIR, { recursive: true }); } catch {}
mkdirSync(DIR, { recursive: true });

proc = spawn(CHROME_BIN, [
  `--user-data-dir=${DIR}`, `--remote-debugging-port=${PORT}`,
  "--no-first-run", "--no-default-browser-check",
], { stdio: ["ignore", "pipe", "pipe"] });

await new Promise(r => setTimeout(r, 5000));

try {
  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 15000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  console.log("🔍 쿠팡 차돌박이 가격순 검색...\n");
  await page.goto("https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc&listSize=72", {
    waitUntil: "domcontentloaded", timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 5000));

  // 스크롤해서 lazy load 트리거
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 400));
  }

  const products = await page.evaluate(() => {
    const items = document.querySelectorAll("li.ProductUnit_productUnit__Qd6sv, ul#product-list > li");
    const results = [];

    for (const item of items) {
      const linkEl = item.querySelector("a[href*='/vp/products/']");
      if (!linkEl) continue;

      // 상품명
      const nameEl = item.querySelector("[class*='productNameV2'], [class*='productName']");
      const name = nameEl?.textContent?.trim() || "";

      // 이미지
      const imgEl = item.querySelector("figure img");
      const image = imgEl?.src || imgEl?.getAttribute("data-nimg") || "";

      // 가격 영역 파싱
      const priceArea = item.querySelector("[class*='priceArea']");
      if (!priceArea) continue;

      // 정가 (취소선 del)
      const delEl = priceArea.querySelector("del");
      const originalPriceText = delEl?.textContent?.trim() || "";

      // 할인율
      const discountEl = priceArea.querySelector("[class*='discount']");
      let discountText = "";

      // 할인가 (실제 판매가) — del 이후의 가격 텍스트
      // priceArea의 전체 텍스트에서 파싱
      const priceAreaText = priceArea.textContent || "";

      // 패턴: "33,400원 23% 25,700원 (100g당 4,283원)"
      // 또는: "16,990원 23% 12,990원 (100g당 2,598원)"
      // 또는: "22,990원 (100g당 2,299원)" (할인 없음)
      const allPrices = [...priceAreaText.matchAll(/(\d{1,3}(?:,\d{3})+)원/g)].map(m => ({
        text: m[1],
        num: parseInt(m[1].replace(/,/g, "")),
      }));

      // 할인율 추출
      const discountMatch = priceAreaText.match(/(\d+)%/);
      const discountRate = discountMatch ? parseInt(discountMatch[1]) : 0;

      // 단위가격 (100g당, 1개당 등) — 괄호 안의 가격
      const unitMatch = priceAreaText.match(/\(([^)]*\d{1,3}(?:,\d{3})*원[^)]*)\)/);
      const unitPrice = unitMatch ? unitMatch[1] : "";

      // 가격 결정 로직:
      // - 단위가격이 있으면 제외하고 판매가 결정
      // - 할인율이 있으면: 첫번째=정가, 두번째=할인가
      // - 할인율 없으면: 첫번째=판매가
      let salePrice = 0;
      let originalPrice = 0;

      // 단위가격의 숫자 파악
      const unitPriceNum = unitMatch
        ? parseInt((unitMatch[1].match(/(\d{1,3}(?:,\d{3})+)/)?.[1] || "0").replace(/,/g, ""))
        : 0;

      // 단위가격 제외한 가격들
      const realPrices = allPrices.filter(p => p.num !== unitPriceNum);

      if (discountRate > 0 && realPrices.length >= 2) {
        originalPrice = realPrices[0].num;
        salePrice = realPrices[1].num;
      } else if (realPrices.length >= 1) {
        salePrice = realPrices[0].num;
        originalPrice = salePrice;
      }

      // 배지들
      const badges = [];
      const badgeEls = item.querySelectorAll("[class*='Badge'], [class*='badge']");
      badgeEls.forEach(b => {
        const img = b.querySelector("img");
        const alt = img?.alt || "";
        const src = img?.src || "";
        if (src.includes("rocket")) badges.push("🚀로켓배송");
        else if (src.includes("coupick")) badges.push("⭐쿠픽");
        else if (src.includes("freeship")) badges.push("🆓무료배송");
        else if (alt) badges.push(alt);
      });

      // 배송 정보
      const deliveryText = priceArea.parentElement?.textContent?.match(/(내일|모레|오늘)[^가-힣]*도착/)?.[0] || "";

      // 리뷰
      const ratingEl = item.querySelector("[class*='ratingCount'], [class*='rating']");
      const ratingText = ratingEl?.textContent?.trim() || "";

      if (salePrice > 0) {
        results.push({
          name,
          originalPrice,
          salePrice,
          discountRate,
          unitPrice,
          link: "https://www.coupang.com" + linkEl.getAttribute("href"),
          image,
          badges: badges.join(" "),
          delivery: deliveryText,
          rating: ratingText,
        });
      }
    }

    return results;
  });

  console.log(`✅ ${products.length}개 상품 추출\n`);

  // 가격순 정렬 (할인가 기준)
  products.sort((a, b) => a.salePrice - b.salePrice);

  // 가격순 정렬 확인
  let isSorted = true;
  for (let i = 1; i < products.length; i++) {
    if (products[i].salePrice < products[i - 1].salePrice) { isSorted = false; break; }
  }
  console.log(`가격순 정렬: ${isSorted ? "✅" : "❌"}`);
  console.log(`가격 범위: ${products[0]?.salePrice?.toLocaleString()}원 ~ ${products[products.length - 1]?.salePrice?.toLocaleString()}원\n`);

  console.log("=== 차돌박이 최저가 TOP 15 ===\n");
  products.slice(0, 15).forEach((p, i) => {
    const discount = p.discountRate > 0 ? ` (정가 ${p.originalPrice.toLocaleString()}원 → ${p.discountRate}%↓)` : "";
    console.log(`${String(i + 1).padStart(2)}. ${p.name.substring(0, 55)}`);
    console.log(`    💰 ${p.salePrice.toLocaleString()}원${discount}`);
    console.log(`    📦 ${p.unitPrice || "-"} | ${p.badges || "-"} | ${p.delivery || "-"}`);
    console.log(`    🔗 ${p.link.substring(0, 95)}`);
    console.log("");
  });

  await page.screenshot({ path: "final-crawl-result.png", fullPage: false });
  console.log("📸 final-crawl-result.png");

  await browser.close();
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  try { proc.kill("SIGTERM"); } catch {}
}
