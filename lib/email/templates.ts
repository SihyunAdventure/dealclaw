const SITE_URL = process.env.SITE_URL || "https://hotinbeauty.com";
const BRAND = "hotinbeauty";
const AD_PREFIX = "(광고)";

// TODO: 실사업자 정보로 교체 (SIH-548 법규 이슈에서 최종 확정)
const BUSINESS_INFO = {
  name: process.env.HIB_BUSINESS_NAME || "hotinbeauty",
  owner: process.env.HIB_BUSINESS_OWNER || "",
  address: process.env.HIB_BUSINESS_ADDRESS || "",
  email: process.env.HIB_BUSINESS_EMAIL || "contact@hotinbeauty.com",
};

function footerBlock(unsubscribeUrl: string) {
  return `
  <hr style="border:none;border-top:1px solid #e7e0d8;margin:32px 0 16px" />
  <div style="font-size:11px;color:#8a7f74;line-height:1.6">
    <p style="margin:0 0 6px"><strong>${BUSINESS_INFO.name}</strong>
      ${BUSINESS_INFO.owner ? ` · 대표 ${BUSINESS_INFO.owner}` : ""}
      ${BUSINESS_INFO.address ? ` · ${BUSINESS_INFO.address}` : ""}
    </p>
    <p style="margin:0 0 6px">문의: <a href="mailto:${BUSINESS_INFO.email}" style="color:#8a7f74">${BUSINESS_INFO.email}</a></p>
    <p style="margin:0 0 12px">본 메일은 귀하의 수신 동의(정보통신망법 제50조)에 따라 발송되었습니다.</p>
    <p style="margin:0">
      수신을 원하지 않으시면
      <a href="${unsubscribeUrl}" style="color:#b05a4d;text-decoration:underline">여기를 클릭</a>
      해 주세요.
    </p>
  </div>
  `.trim();
}

function baseLayout(inner: string) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#faf6f1;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,sans-serif;color:#3a2f26;">
  <div style="max-width:520px;margin:0 auto;background:#fffdf9;border:1px solid #efe5d9;border-radius:12px;padding:32px 28px">
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;letter-spacing:-0.2px;font-family:Georgia,'Times New Roman',serif;color:#3a2f26">
      ${BRAND}
    </h1>
    ${inner}
  </div>
</body>
</html>`;
}

export interface VerificationEmailInput {
  collection: string;
  collectionDisplay: string;
  verifyUrl: string;
  unsubscribeUrl: string;
}

export function verificationEmail({
  collectionDisplay,
  verifyUrl,
  unsubscribeUrl,
}: VerificationEmailInput) {
  const subject = `${AD_PREFIX} ${BRAND} ${collectionDisplay} 최저가 알림 구독 확인`;
  const inner = `
    <p style="font-size:15px;margin:0 0 12px">안녕하세요,</p>
    <p style="font-size:15px;margin:0 0 20px;line-height:1.6">
      <strong>${collectionDisplay}</strong> 카테고리 최저가 알림 구독을 요청해 주셔서 감사합니다.
      아래 버튼을 눌러 구독을 확인해 주세요.
    </p>
    <p style="margin:28px 0">
      <a href="${verifyUrl}"
         style="display:inline-block;padding:12px 22px;background:#b05a4d;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">
        구독 확인하기
      </a>
    </p>
    <p style="font-size:12px;color:#8a7f74;margin:0 0 16px;line-height:1.6">
      버튼이 동작하지 않으면 아래 링크를 브라우저에 붙여넣어 주세요:<br />
      <span style="word-break:break-all">${verifyUrl}</span>
    </p>
    ${footerBlock(unsubscribeUrl)}
  `;
  return { subject, html: baseLayout(inner) };
}

export interface PriceAlertEmailInput {
  collection: string;
  collectionDisplay: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  salePrice: number;
  prevMinPrice: number;
  unitPriceText: string | null;
  unsubscribeUrl: string;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

export function priceAlertEmail({
  collectionDisplay,
  productName,
  productUrl,
  imageUrl,
  salePrice,
  prevMinPrice,
  unitPriceText,
  unsubscribeUrl,
}: PriceAlertEmailInput) {
  const drop = prevMinPrice - salePrice;
  const dropPct = prevMinPrice > 0 ? Math.round((drop / prevMinPrice) * 100) : 0;

  const subject = `${AD_PREFIX} ${BRAND} ${collectionDisplay} 최저가 갱신 - ${formatPrice(salePrice)}원 (${dropPct}% ↓)`;

  const inner = `
    <p style="font-size:14px;color:#8a7f74;margin:0 0 4px">${collectionDisplay}</p>
    <h2 style="font-size:18px;font-weight:600;margin:0 0 20px;line-height:1.4">
      14일 내 최저가가 갱신되었습니다
    </h2>
    <a href="${productUrl}" style="display:block;padding:16px;border:1px solid #efe5d9;border-radius:10px;text-decoration:none;color:#3a2f26;margin:0 0 20px">
      ${imageUrl ? `<img src="${imageUrl}" alt="" style="width:100%;max-width:200px;height:auto;border-radius:6px;margin:0 0 10px" />` : ""}
      <p style="margin:0 0 10px;font-size:14px;line-height:1.5">${productName}</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#b05a4d">
        ${formatPrice(salePrice)}원
        <span style="font-size:12px;font-weight:500;color:#8a7f74;margin-left:6px;text-decoration:line-through">
          ${formatPrice(prevMinPrice)}원
        </span>
      </p>
      ${unitPriceText ? `<p style="margin:4px 0 0;font-size:12px;color:#8a7f74">${unitPriceText}</p>` : ""}
    </a>
    <p style="margin:28px 0">
      <a href="${productUrl}"
         style="display:inline-block;padding:12px 22px;background:#b05a4d;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">
        쿠팡에서 보기
      </a>
    </p>
    <p style="font-size:11px;color:#a89d91;margin:0 0 12px">
      쿠팡 파트너스 활동의 일환으로 수수료를 지급받을 수 있습니다.
    </p>
    ${footerBlock(unsubscribeUrl)}
  `;
  return { subject, html: baseLayout(inner) };
}
