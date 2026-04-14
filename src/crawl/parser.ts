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

  // Unit price inside parentheses: "(100g당 2,598원)"
  const unitMatch = text.match(/\(([^)]*\d{1,3}(?:,\d{3})*원[^)]*)\)/);
  const unitPriceText = unitMatch ? unitMatch[1] : "";
  const unitPriceValue = unitMatch
    ? parseInt(
        (unitMatch[1].match(/(\d{1,3}(?:,\d{3})+)/)?.[1] || "0").replace(
          /,/g,
          "",
        ),
      )
    : 0;

  // Discount rate
  const discountMatch = text.match(/(\d+)%/);
  const discountRate = discountMatch ? parseInt(discountMatch[1]) : 0;

  // Filter out unit price from real prices
  const realPrices = allPrices.filter((p) => p.num !== unitPriceValue);

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
