/**
 * 쿠팡 검색결과 DOM 구조 분석 — 정확한 셀렉터 확보용
 */
import { spawn } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CLEAN_DIR = "/tmp/dealclaw-dom-test";
const CDP_PORT = 9447;
let chromeProc = null;

function killChrome() {
  if (chromeProc && !chromeProc.killed) try { chromeProc.kill("SIGTERM"); } catch {}
}

async function main() {
  try { rmSync(CLEAN_DIR, { recursive: true }); } catch {}
  mkdirSync(CLEAN_DIR, { recursive: true });

  chromeProc = spawn(CHROME_BIN, [
    `--user-data-dir=${CLEAN_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run", "--no-default-browser-check",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((r) => setTimeout(r, 5000));

  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, { timeout: 15000 });
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = ctx.pages()[0] || (await ctx.newPage());

  await page.goto("https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc&listSize=36", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 5000));

  // 첫 3개 상품의 상세 DOM 구조 추출
  const domAnalysis = await page.evaluate(() => {
    const items = document.querySelectorAll("li.search-product, #productList > li");
    const results = [];

    for (let i = 0; i < Math.min(3, items.length); i++) {
      const item = items[i];

      // 전체 클래스 구조
      const getTree = (el, depth = 0) => {
        if (depth > 5 || !el) return "";
        const tag = el.tagName?.toLowerCase();
        const cls = el.className ? `.${String(el.className).split(/\s+/).join(".")}` : "";
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
          ? ` = "${el.textContent.trim().substring(0, 50)}"` : "";
        let result = `${"  ".repeat(depth)}${tag}${cls}${text}\n`;
        for (const child of el.children) {
          result += getTree(child, depth + 1);
        }
        return result;
      };

      // 가격 관련 요소만 상세 분석
      const priceSection = item.querySelector(".price-wrap, .search-product__price-wrap, [class*='price']");
      const allPriceEls = item.querySelectorAll("[class*='price']");
      const priceDetails = [];
      allPriceEls.forEach((el) => {
        priceDetails.push({
          class: el.className,
          text: el.textContent?.trim().substring(0, 80),
          tag: el.tagName,
        });
      });

      results.push({
        index: i,
        outerClasses: item.className,
        name: item.querySelector(".name")?.textContent?.trim().substring(0, 60),
        fullTree: getTree(item),
        priceDetails,
        innerHTML: item.innerHTML.substring(0, 3000),
      });
    }

    return results;
  });

  for (const item of domAnalysis) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`상품 ${item.index + 1}: ${item.name}`);
    console.log(`${"=".repeat(60)}`);
    console.log("\n📋 가격 관련 요소:");
    for (const p of item.priceDetails) {
      console.log(`  [${p.tag}] .${p.class} → "${p.text}"`);
    }
    console.log("\n🌳 DOM 트리:");
    console.log(item.fullTree.substring(0, 2000));
  }

  await browser.close();
  killChrome();
}

main().catch((e) => { console.error(e); killChrome(); });
