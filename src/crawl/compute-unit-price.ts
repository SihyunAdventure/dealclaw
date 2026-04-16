/**
 * 제품명과 판매가로 단가를 계산합니다.
 * 쿠팡이 priceArea 텍스트에 "10ml당 108원" 형식으로 표시하지 않는 경우의 fallback.
 *
 * 지원 단위:
 * - ml / mL / ㎖ → 10ml당
 * - L / ℓ       → ml 변환 후 10ml당
 * - g / G       → 100g당
 * - kg / KG     → g 변환 후 100g당
 * - 매 / 장     → 1매당
 * - 정          → 1정당
 */

interface UnitPriceResult {
  unitPriceText: string;
  unitPriceValue: number;
}

const EMPTY: UnitPriceResult = { unitPriceText: "", unitPriceValue: 0 };

export function computeUnitPriceFromName(
  name: string,
  salePrice: number,
): UnitPriceResult {
  if (salePrice <= 0) return EMPTY;

  // 개수: "1개", "2개", "30개입", "3입", "10매" 등. 없으면 1.
  // "개입"("30개입 = 30개 들이")도 개로 매칭 되도록 \b 제거.
  const countMatch = name.match(/(\d+)\s*(?:개입|개|매|장|정|입)(?![가-힣])/);
  const count = countMatch ? parseInt(countMatch[1], 10) || 1 : 1;

  // 용량: 첫 번째 매칭된 숫자+단위 (ML 대문자 포함)
  const volMatch = name.match(
    /(\d+(?:\.\d+)?)\s*(ML|ml|mL|㎖|L|ℓ|kg|KG|g|G)(?![a-zA-Z가-힣])/,
  );
  if (volMatch) {
    const num = parseFloat(volMatch[1]);
    const unit = volMatch[2];
    let totalMl = 0;
    let totalG = 0;

    const u = unit.toLowerCase();
    if (u === "ml" || unit === "㎖") totalMl = num * count;
    else if (u === "l" || unit === "ℓ") totalMl = num * 1000 * count;
    else if (u === "g") totalG = num * count;
    else if (u === "kg") totalG = num * 1000 * count;

    if (totalMl > 0) {
      const unitPrice = Math.round((salePrice / totalMl) * 10);
      if (unitPrice > 0) {
        return {
          unitPriceText: `10ml당 ${unitPrice.toLocaleString("ko-KR")}원`,
          unitPriceValue: unitPrice,
        };
      }
    }
    if (totalG > 0) {
      const unitPrice = Math.round((salePrice / totalG) * 100);
      if (unitPrice > 0) {
        return {
          unitPriceText: `100g당 ${unitPrice.toLocaleString("ko-KR")}원`,
          unitPriceValue: unitPrice,
        };
      }
    }
  }

  // 용량 단위 없이 "N매"/"N개"만 있는 경우: 1매당 단가
  const sheetMatch = name.match(/(\d+)\s*(?:매|장)\b/);
  if (sheetMatch) {
    const sheets = parseInt(sheetMatch[1], 10);
    if (sheets > 0) {
      const unitPrice = Math.round(salePrice / sheets);
      return {
        unitPriceText: `1매당 ${unitPrice.toLocaleString("ko-KR")}원`,
        unitPriceValue: unitPrice,
      };
    }
  }

  return EMPTY;
}
