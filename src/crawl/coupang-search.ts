import type { Page } from "playwright";
import type { CrawledProduct } from "./types";
import { parsePriceArea } from "./parser";

interface RawProduct {
  name: string;
  priceAreaText: string;
  href: string;
  imageUrl: string;
  badges: string[];
}

async function extractRawProducts(page: Page): Promise<RawProduct[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll("ul#product-list > li");
    const results: any[] = [];

    for (const item of items) {
      const linkEl = item.querySelector("a[href*='/vp/products/']");
      if (!linkEl) continue;

      const nameEl = item.querySelector(
        "[class*='productNameV2'], [class*='productName']",
      );
      const imgEl = item.querySelector("figure img");
      const priceArea = item.querySelector("[class*='priceArea']");
      if (!priceArea) continue;

      const badges: string[] = [];
      item.querySelectorAll("img").forEach((b) => {
        const src = (b as HTMLImageElement).src || "";
        if (src.includes("logo_rocket") || src.includes("logo_fresh") || src.includes("rocket_logo")) {
          if (!badges.includes("로켓")) badges.push("로켓");
        } else if (src.includes("coupick")) {
          if (!badges.includes("쿠픽")) badges.push("쿠픽");
        }
      });

      results.push({
        name: nameEl?.textContent?.trim() || "",
        priceAreaText: priceArea.textContent || "",
        href: linkEl.getAttribute("href") || "",
        imageUrl: (imgEl as HTMLImageElement)?.src || "",
        badges,
      });
    }

    return results;
  });
}

export async function crawlCoupangSearch(
  page: Page,
  query: string,
): Promise<CrawledProduct[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.coupang.com/np/search?q=${encodedQuery}&channel=user&sorter=priceAsc&listSize=72`;

  console.log(`  → ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));

  // Scroll for lazy loading
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise((r) => setTimeout(r, 400));
  }

  const title = await page.title();
  if (title.includes("Access Denied")) {
    throw new Error("Coupang access denied — bot detection triggered");
  }

  const rawProducts = await extractRawProducts(page);
  console.log(`  → ${rawProducts.length}개 raw 상품 추출`);

  const products: CrawledProduct[] = [];

  for (const raw of rawProducts) {
    const parsed = parsePriceArea(raw.priceAreaText);
    if (parsed.salePrice <= 0) continue;

    const coupangIdMatch = raw.href.match(/products\/(\d+)/);
    if (!coupangIdMatch) continue;

    products.push({
      name: raw.name,
      ...parsed,
      coupangId: coupangIdMatch[1],
      link: `https://www.coupang.com${raw.href}`,
      imageUrl: raw.imageUrl,
      isRocket: raw.badges.includes("로켓"),
      badges: raw.badges,
    });
  }

  return products;
}
