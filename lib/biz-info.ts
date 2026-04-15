/**
 * 사업자 정보. env 로 주입해 사업자 실값 확정 시 코드 변경 없이 반영.
 * SIH-548 법규 페이지 + SIH-555 이메일 템플릿 공용 소스.
 *
 * 프로덕션 배포 체크:
 *   `HIB_ENFORCE_BUSINESS_INFO=1` 로 설정하면 필수 필드 누락 시 assertion 실패.
 *   Vercel production env 에 반드시 세팅 — 법규 페이지가 `(미등록)` 플레이스홀더로
 *   노출되는 것은 개인정보보호법 제30조 위반 소지가 있음.
 */

const REQUIRED_KEYS = [
  "HIB_BUSINESS_NAME",
  "HIB_BUSINESS_OWNER",
  "HIB_BUSINESS_ADDRESS",
  "HIB_BUSINESS_REG_NO",
  "HIB_BUSINESS_EMAIL",
  "HIB_PRIVACY_OFFICER_EMAIL",
] as const;

export const businessInfo = {
  name: process.env.HIB_BUSINESS_NAME || "hotinbeauty",
  owner: process.env.HIB_BUSINESS_OWNER || "",
  address: process.env.HIB_BUSINESS_ADDRESS || "",
  email: process.env.HIB_BUSINESS_EMAIL || "contact@hotinbeauty.com",
  registrationNumber: process.env.HIB_BUSINESS_REG_NO || "",
  privacyOfficer: process.env.HIB_PRIVACY_OFFICER || "",
  privacyOfficerEmail:
    process.env.HIB_PRIVACY_OFFICER_EMAIL ||
    process.env.HIB_BUSINESS_EMAIL ||
    "contact@hotinbeauty.com",
} as const;

export function missingRequiredBusinessInfo(): string[] {
  return REQUIRED_KEYS.filter((key) => !process.env[key]);
}

if (process.env.HIB_ENFORCE_BUSINESS_INFO === "1") {
  const missing = missingRequiredBusinessInfo();
  if (missing.length > 0) {
    throw new Error(
      `[biz-info] HIB_ENFORCE_BUSINESS_INFO=1 인데 필수 env 누락: ${missing.join(", ")}`,
    );
  }
}

const NOT_REGISTERED = "(미등록)";

/** UI 렌더용 — 빈 값이면 "(미등록)" 표시. */
export function displayBusinessInfo() {
  return {
    name: businessInfo.name,
    owner: businessInfo.owner || NOT_REGISTERED,
    address: businessInfo.address || NOT_REGISTERED,
    email: businessInfo.email,
    registrationNumber: businessInfo.registrationNumber,
    privacyOfficer:
      businessInfo.privacyOfficer || businessInfo.owner || NOT_REGISTERED,
    privacyOfficerEmail: businessInfo.privacyOfficerEmail,
  };
}

export const EFFECTIVE_DATE = "2026-04-15";
