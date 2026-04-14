import { spawn } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIR = "/tmp/dealclaw-dom2";
const PORT = 9448;
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

  await page.goto("https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc", {
    waitUntil: "domcontentloaded", timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 5000));

  console.log("title:", await page.title());

  // 첫 3개 상품의 innerHTML 덤프
  const htmls = await page.evaluate(() => {
    const items = document.querySelectorAll("li.search-product");
    if (items.length === 0) return ["NO li.search-product found. body classes: " + document.body.className];
    return Array.from(items).slice(0, 3).map((el, i) => `--- ITEM ${i+1} ---\n` + el.innerHTML);
  });

  for (const h of htmls) {
    console.log(h.substring(0, 2500));
    console.log("\n");
  }

  await browser.close();
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  try { proc.kill("SIGTERM"); } catch {}
}
