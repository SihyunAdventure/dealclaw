import { config } from "dotenv";
config({ path: ".env.local" });
import { launchChrome } from "../crawl/chrome";

async function main() {
  const { browser, page, cleanup } = await launchChrome();
  try {
    await page.goto("https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 5000));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 300));
    }

    // Find all badge/rocket related elements
    const rocketInfo = await page.evaluate(() => {
      const items = document.querySelectorAll("ul#product-list > li");
      const results: any[] = [];

      for (let i = 0; i < Math.min(5, items.length); i++) {
        const item = items[i];
        const name = item.querySelector("[class*='productName']")?.textContent?.trim().substring(0, 40) || "";

        // Check ALL images in the item
        const imgs: { src: string; alt: string; cls: string; parentCls: string }[] = [];
        item.querySelectorAll("img").forEach((img) => {
          imgs.push({
            src: img.src?.substring(0, 100) || "",
            alt: img.alt || "",
            cls: img.className?.substring(0, 80) || "",
            parentCls: img.parentElement?.className?.substring(0, 80) || "",
          });
        });

        // Check for rocket-related text
        const allText = item.textContent || "";
        const hasRocketText = allText.includes("로켓") || allText.includes("rocket");

        // Check for any badge-like elements
        const badgeEls: { cls: string; text: string; html: string }[] = [];
        item.querySelectorAll("[class*='adge'], [class*='ocket'], [class*='delivery'], [class*='ship']").forEach((el) => {
          badgeEls.push({
            cls: el.className?.toString().substring(0, 80) || "",
            text: el.textContent?.trim().substring(0, 50) || "",
            html: el.innerHTML?.substring(0, 200) || "",
          });
        });

        results.push({ name, imgs, hasRocketText, badgeEls });
      }
      return results;
    });

    for (const r of rocketInfo) {
      console.log(`\n=== ${r.name} ===`);
      console.log(`  로켓 텍스트: ${r.hasRocketText}`);
      console.log(`  이미지 (${r.imgs.length}개):`);
      r.imgs.forEach((img: any) => {
        console.log(`    src: ${img.src}`);
        console.log(`    alt: ${img.alt} | parent: ${img.parentCls}`);
      });
      if (r.badgeEls.length > 0) {
        console.log(`  배지 요소:`);
        r.badgeEls.forEach((b: any) => console.log(`    .${b.cls} → "${b.text}"`));
      }
    }
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch(console.error);
