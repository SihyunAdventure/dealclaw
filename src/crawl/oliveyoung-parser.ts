interface ParsedOliveYoungPrice {
  salePrice: number;
  originalPrice: number;
  discountRate: number;
}

function toInt(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function parseOliveYoungPrice(
  orgText: string,
  curText: string,
): ParsedOliveYoungPrice {
  const cur = toInt(curText);
  const org = toInt(orgText);

  if (cur > 0 && org > 0 && org > cur) {
    return {
      salePrice: cur,
      originalPrice: org,
      discountRate: Math.round(((org - cur) / org) * 100),
    };
  }

  const single = cur > 0 ? cur : org;
  return { salePrice: single, originalPrice: single, discountRate: 0 };
}

// `data-impression` 형식: "A000000158752^랭킹_판매랭킹리스트_전체^1"
// 마지막 ^N 숫자가 실제 판매 랭크.
export function parseImpressionRank(raw: string): number {
  const m = raw.match(/\^(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

export function extractGoodsNo(href: string): string {
  const m = href.match(/goodsNo=([A-Z0-9]+)/i);
  return m ? m[1] : "";
}
