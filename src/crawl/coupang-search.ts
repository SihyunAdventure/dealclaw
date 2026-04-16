import type { Page } from "playwright";
import type { CrawledProduct } from "./types";
import { parsePriceArea } from "./parser";
import { computeUnitPriceFromName } from "./compute-unit-price";

interface RawProduct {
  name: string;
  priceAreaText: string;
  href: string;
  imageUrl: string;
  badges: string[];
  reviewCountText: string;
  ratingText: string;
}

async function extractRawProducts(page: Page): Promise<RawProduct[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll("ul#product-list > li");
    const results: RawProduct[] = [];

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

      // Review count — 쿠팡 검색 결과 카드에서 "(1,234)" 형식
      // 셀렉터: [class*='ratingCount'], [class*='reviewCount'], fallback to text search
      const reviewEl = item.querySelector(
        "[class*='ratingCount'], [class*='reviewCount'], [class*='rating-total-count']",
      );
      const reviewCountText = reviewEl?.textContent?.trim() || "";

      // Rating (stars) — e.g., "4.5" out of 5
      const ratingEl = item.querySelector(
        "[class*='ratingStar'], [class*='rating-star'], [class*='star-rating']",
      );
      const ratingText = ratingEl?.textContent?.trim() || "";

      results.push({
        name: nameEl?.textContent?.trim() || "",
        priceAreaText: priceArea.textContent || "",
        href: linkEl.getAttribute("href") || "",
        imageUrl: (imgEl as HTMLImageElement)?.src || "",
        badges,
        reviewCountText,
        ratingText,
      });
    }

    return results;
  });
}

export async function crawlCoupangSearch(
  page: Page,
  query: string,
  options: { listSize?: number } = {},
): Promise<CrawledProduct[]> {
  const encodedQuery = encodeURIComponent(query);
  const listSize = options.listSize ?? 48;
  const url = `https://www.coupang.com/np/search?q=${encodedQuery}&channel=user&sorter=priceAsc&listSize=${listSize}`;

  console.log(`  → ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // 초기 대기 3~7초 랜덤 — 고정 5초 패턴 탐지 회피
  const initialWait = 3000 + Math.floor(Math.random() * 4000);
  await new Promise((r) => setTimeout(r, initialWait));

  // Lazy loading 스크롤: 스크롤량/딜레이 모두 랜덤화
  for (let i = 0; i < 5; i++) {
    const scrollAmount = 600 + Math.floor(Math.random() * 400);
    await page.evaluate((amt) => window.scrollBy(0, amt), scrollAmount);
    const scrollDelay = 300 + Math.floor(Math.random() * 500);
    await new Promise((r) => setTimeout(r, scrollDelay));
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

    // "(1,234)" 또는 "1234" 형식에서 숫자만 추출
    const reviewCountMatch = raw.reviewCountText.match(/([\d,]+)/);
    const reviewCount = reviewCountMatch
      ? parseInt(reviewCountMatch[1].replace(/,/g, ""), 10) || 0
      : 0;

    // "4.5" 형식 별점 → 45 (0~50 스케일로 저장)
    const ratingMatch = raw.ratingText.match(/([\d.]+)/);
    const ratingAverage = ratingMatch
      ? Math.round(parseFloat(ratingMatch[1]) * 10) || null
      : null;

    // 쿠팡이 제공하는 단가 텍스트를 우선 사용(같은 크롤에서 가격과 함께 수집되어 불일치 없음).
    // 쿠팡이 단가를 표시하지 않은 경우에만 제품명+판매가로 계산.
    let { unitPriceText, unitPriceValue } = parsed;
    if (!unitPriceValue) {
      const computed = computeUnitPriceFromName(raw.name, parsed.salePrice);
      unitPriceText = computed.unitPriceText;
      unitPriceValue = computed.unitPriceValue;
    }

    products.push({
      name: raw.name,
      ...parsed,
      unitPriceText,
      unitPriceValue,
      coupangId: coupangIdMatch[1],
      link: `https://www.coupang.com${raw.href}`,
      imageUrl: raw.imageUrl,
      isRocket: raw.badges.includes("로켓"),
      badges: raw.badges,
      reviewCount,
      ratingAverage,
    });
  }

  return products;
}
