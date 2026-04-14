import { spawn } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DIR = "/tmp/dealclaw-dom3";
const PORT = 9449;
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

  // 스크롤해서 lazy load
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise(r => setTimeout(r, 500));
  }

  // 1. 상품 링크가 있는 요소의 부모 구조 분석
  const analysis = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/vp/products/"]');
    if (links.length === 0) return { error: "No product links found", bodyLen: document.body.innerHTML.length };

    // 첫 3개 링크의 부모 체인
    const results = [];
    for (let i = 0; i < Math.min(3, links.length); i++) {
      const link = links[i];
      // 부모 체인
      const parents = [];
      let el = link;
      for (let d = 0; d < 8 && el; d++) {
        parents.push({
          tag: el.tagName,
          cls: el.className?.toString().substring(0, 120),
          id: el.id || "",
          childCount: el.children?.length || 0,
        });
        el = el.parentElement;
      }

      // 이 링크를 감싸는 가장 가까운 상품 컨테이너의 innerHTML (truncated)
      const container = link.closest("li") || link.closest("[class*='product']") || link.closest("article") || link.parentElement?.parentElement;

      results.push({
        linkHref: link.getAttribute("href")?.substring(0, 60),
        parents,
        containerHTML: container?.innerHTML?.substring(0, 1500) || "NO CONTAINER",
        containerTag: container?.tagName,
        containerClass: container?.className?.toString().substring(0, 100),
      });
    }

    return { linkCount: links.length, results };
  });

  console.log(`상품 링크 수: ${analysis.linkCount}`);

  if (analysis.results) {
    for (const r of analysis.results) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`링크: ${r.linkHref}`);
      console.log(`컨테이너: <${r.containerTag}> .${r.containerClass}`);
      console.log(`부모 체인:`);
      r.parents.forEach((p, i) => console.log(`  ${"  ".repeat(i)}<${p.tag}> id="${p.id}" class="${p.cls}" children=${p.childCount}`));
      console.log(`\nHTML (1500자):`);
      console.log(r.containerHTML);
    }
  } else {
    console.log("분석 결과:", JSON.stringify(analysis, null, 2));
  }

  await browser.close();
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  try { proc.kill("SIGTERM"); } catch {}
}
