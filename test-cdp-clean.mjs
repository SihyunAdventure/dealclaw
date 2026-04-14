/**
 * 쿠키 없는 클린 Chrome 세션으로 쿠팡 가격 비교
 */
import { spawn } from "child_process";
import { existsSync, rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CLEAN_DIR = "/tmp/dealclaw-clean-chrome";
const CDP_PORT = 9445;

let chromeProc = null;

function killChrome() {
  if (chromeProc && !chromeProc.killed) {
    try { chromeProc.kill("SIGTERM"); } catch {}
  }
}

async function main() {
  // Clean temp dir every run
  try { rmSync(CLEAN_DIR, { recursive: true }); } catch {}
  mkdirSync(CLEAN_DIR, { recursive: true });

  const args = [
    `--user-data-dir=${CLEAN_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    // headful — Akamai 우회
  ];

  console.log("=== 클린 세션 (쿠키 없음) 쿠팡 가격 ===\n");
  chromeProc = spawn(CHROME_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
  chromeProc.on("exit", (code) => console.log(`[chrome] exited code=${code}`));
  await new Promise((r) => setTimeout(r, 5000));

  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, { timeout: 15000 });
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = ctx.pages()[0] || (await ctx.newPage());

  await page.goto("https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc&listSize=36", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 5000));

  const title = await page.title();
  console.log(`title: ${title}\n`);

  if (title.includes("Access Denied")) {
    console.log("❌ 클린 세션도 차단됨 — 쿠키 없으면 접근 불가");
    await browser.close();
    killChrome();
    return;
  }

  const products = await page.evaluate(() => {
    const results = [];
    const links = document.querySelectorAll('a[href*="/products/"], a[href*="/vp/"]');
    for (const link of links) {
      if (results.length >= 20) break;
      const container = link.closest("li") || link.parentElement;
      if (!container) continue;
      const text = container.textContent || "";
      const priceMatch = text.match(/(\d{1,3}(?:,\d{3})+)/);
      if (priceMatch) {
        const nameEl = container.querySelector("[class*='name'], [class*='title']");
        results.push({
          name: nameEl?.textContent?.trim() || text.substring(0, 80).trim(),
          price: priceMatch[1],
          link: link.href,
        });
      }
    }
    return results;
  });

  if (products.length > 0) {
    console.log(`✅ ${products.length}개 상품 (클린 세션)\n`);
    products.slice(0, 10).forEach((p, i) => {
      console.log(`${i + 1}. ${p.name?.substring(0, 55)}`);
      console.log(`   💰 ${p.price}원`);
      console.log(`   🔗 ${p.link?.substring(0, 90)}`);
      console.log("");
    });
  } else {
    console.log("⚠️ 상품 추출 실패");
  }

  await page.screenshot({ path: "cdp-clean-result.png", fullPage: false });
  await browser.close();
  killChrome();
}

main().catch((e) => { console.error(e); killChrome(); });
