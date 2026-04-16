interface ParsedPrice {
  salePrice: number;
  originalPrice: number;
  discountRate: number;
  unitPriceText: string;
  unitPriceValue: number;
}

export function parsePriceArea(text: string): ParsedPrice {
  // Extract all prices: "16,990원", "12,990원", etc.
  const allPrices = [...text.matchAll(/(\d{1,3}(?:,\d{3})+)원/g)].map((m) => ({
    text: m[1],
    num: parseInt(m[1].replace(/,/g, "")),
  }));

  // Unit price — try parenthesized first, then non-parenthesized.
  // 단위는 한글(매/구/개/포/정) 또는 영문(ml/mL/g/kg/L/cc/oz) 모두 지원.
  // Pattern 1: "(100g당 2,598원)", "(10ml당 89원)", "(1구당 380원)"
  let unitMatch = text.match(
    /\(([^)]*(?:\d+\s*[a-zA-Z가-힣]+\s*당)\s*[\d,]+원[^)]*)\)/,
  );

  // Pattern 2: 괄호 없음
  if (!unitMatch) {
    unitMatch = text.match(/((?:\d+\s*[a-zA-Z가-힣]+\s*당)\s*[\d,]+원)/);
  }

  const unitPriceText = unitMatch ? unitMatch[1].trim() : "";
  const unitPriceValue = unitMatch
    ? parseInt(
        (unitMatch[1].match(/당\s*(\d{1,3}(?:,\d{3})*)원/)?.[1] || "0").replace(/,/g, ""),
      )
    : 0;

  // Discount rate
  const discountMatch = text.match(/(\d+)%/);
  const discountRate = discountMatch ? parseInt(discountMatch[1]) : 0;

  // Filter out unit price from real prices
  const realPrices = unitPriceValue > 0
    ? allPrices.filter((p) => p.num !== unitPriceValue)
    : allPrices;

  let salePrice = 0;
  let originalPrice = 0;

  if (discountRate > 0 && realPrices.length >= 2) {
    originalPrice = realPrices[0].num;
    salePrice = realPrices[1].num;
  } else if (realPrices.length >= 1) {
    salePrice = realPrices[0].num;
    originalPrice = salePrice;
  }

  return { salePrice, originalPrice, discountRate, unitPriceText, unitPriceValue };
}
