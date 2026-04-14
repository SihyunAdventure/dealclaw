/**
 * Coupang 검색 크롤링 테스트 (Chrome CDP attach, orbit 패턴 차용)
 *
 * Chrome을 실제 프로필로 spawn → CDP attach → 검색 페이지 접근
 */
import { spawn } from "child_process";
import { existsSync, unlinkSync, cpSync, mkdirSync } from "fs";
import { homedir } from "os";
import { chromium } from "playwright";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGINAL_PROFILE_DIR = `${homedir()}/Library/Application Support/Google/Chrome`;
const CLONE_DIR = `${homedir()}/.local/share/dealclaw/chrome-profile`;
const PROFILE_NAME = "Default"; // 34 coupang cookies
const CDP_PORT = 9444; // orbit uses 9333, use different port

let chromeProc = null;

function cleanupLocks(dir) {
  for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try { unlinkSync(`${dir}/${f}`); } catch {}
  }
}

function killChrome() {
  if (chromeProc && !chromeProc.killed) {
    try { chromeProc.kill("SIGTERM"); } catch {}
  }
  cleanupLocks(CLONE_DIR);
}

async function cloneProfile() {
  // Clone only the necessary profile files (not the entire Chrome dir)
  const profileSrc = `${ORIGINAL_PROFILE_DIR}/${PROFILE_NAME}`;
  const profileDst = `${CLONE_DIR}/${PROFILE_NAME}`;
  const localStateSrc = `${ORIGINAL_PROFILE_DIR}/Local State`;
  const localStateDst = `${CLONE_DIR}/Local State`;

  if (!existsSync(profileSrc)) {
    throw new Error(`Profile not found: ${profileSrc}`);
  }

  // Only re-clone if missing or stale (>1 hour)
  const needsClone = !existsSync(profileDst);
  if (needsClone) {
    console.log(`  📋 프로필 클론: ${PROFILE_NAME}`);
    mkdirSync(CLONE_DIR, { recursive: true });
    cpSync(profileSrc, profileDst, { recursive: true });
    if (existsSync(localStateSrc)) {
      cpSync(localStateSrc, localStateDst);
    }
  } else {
    console.log(`  ✅ 클론 캐시 사용`);
  }
}

async function spawnChrome() {
  cleanupLocks(CLONE_DIR);

  const args = [
    `--user-data-dir=${CLONE_DIR}`,
    `--profile-directory=${PROFILE_NAME}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    // headful mode — Akamai BM 통과율 ↑ (orbit 검증)
  ];

  console.log(`[1/4] Chrome spawn (port=${CDP_PORT}, headless)`);
  chromeProc = spawn(CHROME_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  chromeProc.stderr?.on("data", (d) => {
    const s = String(d);
    if (s.includes("FATAL") || s.includes("CRITICAL")) process.stderr.write(`[chrome] ${s}`);
  });
  chromeProc.on("exit", (code) => console.log(`[chrome] exited code=${code}`));
  console.log(`  → PID=${chromeProc.pid}`);

  // Wait for Chrome + CDP ready
  await new Promise((r) => setTimeout(r, 5000));
}

async function main() {
  try {
    console.log("\n=== Coupang 차돌박이 최저가 크롤링 (CDP) ===\n");

    await cloneProfile();
    await spawnChrome();

    console.log(`[2/4] Playwright CDP attach`);
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, {
      timeout: 15000,
    });
    const ctx = browser.contexts()[0] || (await browser.newContext());
    const page = ctx.pages()[0] || (await ctx.newPage());

    console.log(`[3/4] 쿠팡 검색 페이지 이동`);
    await page.goto("https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc&listSize=36", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 5000));

    const title = await page.title();
    const url = page.url();
    console.log(`  📄 title: ${title}`);
    console.log(`  🔗 url: ${url}`);

    if (title.includes("Access Denied") || url.includes("error")) {
      console.log("  ❌ 차단됨");
      await page.screenshot({ path: "cdp-blocked.png" });
      await browser.close();
      killChrome();
      return;
    }

    // Extract products
    console.log(`[4/4] 상품 데이터 추출`);
    const products = await page.evaluate(() => {
      const results = [];

      // Try multiple selector strategies
      const selectors = [
        "li.search-product",
        "#productList > li",
        "[class*='search-product']",
      ];

      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) break;
      }

      if (items.length === 0) {
        // Fallback: find all product links
        const links = document.querySelectorAll('a[href*="/products/"], a[href*="/vp/"]');
        for (const link of links) {
          if (results.length >= 20) break;
          const container = link.closest("li") || link.parentElement;
          if (!container) continue;
          const text = container.textContent || "";
          const priceMatch = text.match(/(\d{1,3}(?:,\d{3})+)/);
          if (priceMatch) {
            const nameEl = container.querySelector("[class*='name'], [class*='title']");
            const imgEl = container.querySelector("img");
            results.push({
              name: nameEl?.textContent?.trim() || text.substring(0, 80).trim(),
              price: priceMatch[1],
              link: link.href,
              image: imgEl?.src || imgEl?.getAttribute("data-img-src") || "",
              isRocket: !!container.querySelector("[class*='rocket']"),
              reviews: container.querySelector("[class*='rating-total']")?.textContent?.trim() || "",
            });
          }
        }
        return results;
      }

      for (const item of items) {
        if (results.length >= 20) break;
        const nameEl = item.querySelector(".name, .descriptions .name");
        const priceEl = item.querySelector(".price-value, .price .value");
        const linkEl = item.querySelector("a.search-product-link, a[href*='/products/']");
        const imgEl = item.querySelector("img");
        const rocketEl = item.querySelector(".badge.rocket, [class*='rocket']");
        const ratingEl = item.querySelector(".rating-total-count");

        if (nameEl && priceEl) {
          results.push({
            name: nameEl.textContent?.trim(),
            price: priceEl.textContent?.trim(),
            link: linkEl ? (linkEl.href.startsWith("http") ? linkEl.href : "https://www.coupang.com" + linkEl.getAttribute("href")) : "",
            image: imgEl?.src || imgEl?.getAttribute("data-img-src") || "",
            isRocket: !!rocketEl,
            reviews: ratingEl?.textContent?.trim() || "",
          });
        }
      }
      return results;
    });

    if (products.length > 0) {
      console.log(`\n✅ ${products.length}개 상품 발견!\n`);

      const sorted = products
        .map((p) => ({
          ...p,
          priceNum: parseInt(p.price.replace(/[^0-9]/g, "")),
        }))
        .filter((p) => p.priceNum > 0)
        .sort((a, b) => a.priceNum - b.priceNum);

      console.log("=== 차돌박이 최저가 TOP 10 ===\n");
      sorted.slice(0, 10).forEach((p, i) => {
        console.log(`${i + 1}. ${p.name?.substring(0, 60)}`);
        console.log(`   💰 ${p.price}원 | 🚀 ${p.isRocket ? "로켓" : "-"} | ⭐ ${p.reviews || "-"}`);
        console.log(`   🔗 ${p.link?.substring(0, 100)}`);
        console.log("");
      });
    } else {
      console.log("\n⚠️ 상품 추출 실패");
      // Debug: page structure
      const debug = await page.evaluate(() => {
        const body = document.body.innerHTML;
        return {
          bodyLen: body.length,
          sample: body.substring(0, 2000),
          productListExists: !!document.querySelector("#productList"),
          searchProductCount: document.querySelectorAll(".search-product").length,
          allLiCount: document.querySelectorAll("li").length,
          linkCount: document.querySelectorAll('a[href*="/products/"]').length,
        };
      });
      console.log("디버그:", JSON.stringify(debug, null, 2).substring(0, 1500));
    }

    await page.screenshot({ path: "cdp-result.png", fullPage: false });
    console.log("📸 스크린샷: cdp-result.png");

    await browser.close();
    killChrome();
  } catch (err) {
    console.error("❌ Error:", err.message);
    killChrome();
  }
}

main();
