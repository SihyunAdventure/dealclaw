import { config } from "dotenv";
config({ path: ".env.local" });
import { launchChrome } from "../crawl/chrome";

interface DebugImageInfo {
  src: string;
  alt: string;
  cls: string;
  parentCls: string;
}

interface DebugBadgeInfo {
  cls: string;
  text: string;
  html: string;
}

interface DebugRocketInfo {
  name: string;
  imgs: DebugImageInfo[];
  hasRocketText: boolean;
  badgeEls: DebugBadgeInfo[];
}

async function main() {
  const { browser, page, cleanup } = await launchChrome();
  try {
    await page.goto(
      "https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc",
      {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      },
    );
    await new Promise((r) => setTimeout(r, 5000));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise((r) => setTimeout(r, 300));
    }

    const rocketInfo = (await page.evaluate(() => {
      const items = document.querySelectorAll("ul#product-list > li");
      const results: DebugRocketInfo[] = [];

      for (let i = 0; i < Math.min(5, items.length); i++) {
        const item = items[i];
        const name =
          item
            .querySelector("[class*='productName']")
            ?.textContent?.trim()
            .substring(0, 40) || "";

        const imgs: DebugImageInfo[] = [];
        item.querySelectorAll("img").forEach((img) => {
          imgs.push({
            src: img.src?.substring(0, 100) || "",
            alt: img.alt || "",
            cls: String(img.className || "").substring(0, 80),
            parentCls: String(img.parentElement?.className || "").substring(0, 80),
          });
        });

        const allText = item.textContent || "";
        const hasRocketText = allText.includes("로켓") || allText.includes("rocket");

        const badgeEls: DebugBadgeInfo[] = [];
        item
          .querySelectorAll(
            "[class*='adge'], [class*='ocket'], [class*='delivery'], [class*='ship']",
          )
          .forEach((el) => {
            badgeEls.push({
              cls: String(el.className || "").substring(0, 80),
              text: el.textContent?.trim().substring(0, 50) || "",
              html: el.innerHTML?.substring(0, 200) || "",
            });
          });

        results.push({ name, imgs, hasRocketText, badgeEls });
      }
      return results;
    })) as DebugRocketInfo[];

    for (const result of rocketInfo) {
      console.log(`\n=== ${result.name} ===`);
      console.log(`  로켓 텍스트: ${result.hasRocketText}`);
      console.log(`  이미지 (${result.imgs.length}개):`);
      result.imgs.forEach((img) => {
        console.log(`    src: ${img.src}`);
        console.log(`    alt: ${img.alt} | parent: ${img.parentCls}`);
      });
      if (result.badgeEls.length > 0) {
        console.log("  배지 요소:");
        result.badgeEls.forEach((badge) =>
          console.log(`    .${badge.cls} → "${badge.text}"`),
        );
      }
    }
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch(console.error);
