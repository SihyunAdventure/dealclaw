import type { Page } from "playwright";
import type {
  OliveYoungRankedProduct,
  OliveYoungFlag,
} from "./types";
import {
  parseOliveYoungPrice,
  parseImpressionRank,
  extractGoodsNo,
} from "./oliveyoung-parser";

interface RawOliveYoungItem {
  impressionText: string;
  brand: string;
  name: string;
  orgText: string;
  curText: string;
  orgRawText: string;
  curRawText: string;
  href: string;
  imageUrl: string;
  goodsNoAttr: string;
  dispCatNoAttr: string;
  categoryPath: string;
  isTodayDeal: boolean;
  flagClassNames: string[];
}

const BEST_URL = "https://www.oliveyoung.co.kr/store/main/getBestList.do";
const KNOWN_FLAGS: OliveYoungFlag[] = ["sale", "coupon", "gift", "delivery"];

async function extractRawItems(page: Page): Promise<RawOliveYoungItem[]> {
  return page.evaluate(() => {
    const lis = Array.from(
      document.querySelectorAll<HTMLLIElement>("ul.cate_prd_list > li"),
    );
    return lis.map((li) => {
      const thumbAnchor = li.querySelector<HTMLAnchorElement>(
        ".prd_info a.prd_thumb",
      );
      const img = li.querySelector<HTMLImageElement>(".prd_info a.prd_thumb img");
      const brandEl = li.querySelector(".tx_brand");
      const nameEl = li.querySelector(".tx_name");
      const orgNumEl = li.querySelector(".prd_price .tx_org .tx_num");
      const curNumEl = li.querySelector(".prd_price .tx_cur .tx_num");
      const orgWrapEl = li.querySelector(".prd_price .tx_org");
      const curWrapEl = li.querySelector(".prd_price .tx_cur");
      const zzimBtn = li.querySelector<HTMLButtonElement>(".btn_zzim");
      const flagEls = li.querySelectorAll(".prd_flag .icon_flag");
      const todayFlag = li.querySelector(".newOyflag.today");

      return {
        impressionText: thumbAnchor?.getAttribute("data-impression") || "",
        brand: brandEl?.textContent?.trim() || "",
        name: nameEl?.textContent?.trim() || "",
        orgText: orgNumEl?.textContent?.trim() || "",
        curText: curNumEl?.textContent?.trim() || "",
        orgRawText: orgWrapEl?.textContent?.trim() || "",
        curRawText: curWrapEl?.textContent?.trim() || "",
        href: thumbAnchor?.href || "",
        imageUrl: img?.src || "",
        goodsNoAttr: thumbAnchor?.getAttribute("data-ref-goodsno") || "",
        dispCatNoAttr: thumbAnchor?.getAttribute("data-ref-dispcatno") || "",
        categoryPath: zzimBtn?.getAttribute("data-ref-goodscategory") || "",
        isTodayDeal: !!todayFlag,
        flagClassNames: Array.from(flagEls).map((el) => el.className),
      };
    });
  });
}

function parseFlags(classNames: string[]): OliveYoungFlag[] {
  const flags: OliveYoungFlag[] = [];
  for (const cls of classNames) {
    for (const known of KNOWN_FLAGS) {
      if (cls.split(/\s+/).includes(known) && !flags.includes(known)) {
        flags.push(known);
      }
    }
  }
  return flags;
}

export async function crawlOliveYoungRanking(
  page: Page,
  limit = 100,
): Promise<OliveYoungRankedProduct[]> {
  console.log(`  → ${BEST_URL}`);
  await page.goto(BEST_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Cloudflare JS challenge("Just a moment...") 통과 대기.
  // 최대 20초, 0.5초 간격으로 title 확인.
  const deadline = Date.now() + 20_000;
  let title = await page.title();
  while (Date.now() < deadline && !title.includes("랭킹")) {
    if (title.includes("Access Denied") || title.includes("General Error")) {
      throw new Error(`Olive Young 접근 차단 — title="${title}"`);
    }
    await new Promise((r) => setTimeout(r, 500));
    title = await page.title();
  }
  if (!title.includes("랭킹")) {
    throw new Error(`Olive Young 접근 차단/오류 — title="${title}"`);
  }

  // 랭킹 로드 완료 후 lazy content 를 위해 잠시 대기 + scroll.
  // 올영 베스트 페이지는 100개를 lazy-load하므로 충분히 스크롤해야 함.
  await new Promise((r) => setTimeout(r, 2000));
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise((r) => setTimeout(r, 400));
  }

  const raw = await extractRawItems(page);
  console.log(`  → ${raw.length}개 raw li 추출`);

  // 실제 판매 랭크는 `<a.prd_thumb data-impression="상품ID^랭킹_판매랭킹리스트_전체^N">`
  // 의 끝 숫자 N이 authoritative. 오특 상품도 rank는 연속 부여됨 (실측 1~100).
  const products: OliveYoungRankedProduct[] = [];
  const seen = new Set<number>();

  for (const item of raw) {
    const rank = parseImpressionRank(item.impressionText);
    if (rank === 0) continue;
    if (seen.has(rank)) continue;

    const productId = item.goodsNoAttr || extractGoodsNo(item.href);
    if (!productId) continue;
    if (!item.name || !item.curText) continue;

    const price = parseOliveYoungPrice(item.orgText, item.curText);
    if (price.salePrice <= 0) continue;

    seen.add(rank);
    products.push({
      rank,
      productId,
      dispCatNo: item.dispCatNoAttr,
      brand: item.brand,
      name: item.name,
      categoryPath: item.categoryPath,
      salePrice: price.salePrice,
      originalPrice: price.originalPrice,
      discountRate: price.discountRate,
      hasPriceRange:
        item.orgRawText.includes("~") || item.curRawText.includes("~"),
      link: item.href,
      imageUrl: item.imageUrl,
      isTodayDeal: item.isTodayDeal,
      flags: parseFlags(item.flagClassNames),
    });
  }

  products.sort((a, b) => a.rank - b.rank);
  return products.slice(0, limit);
}
