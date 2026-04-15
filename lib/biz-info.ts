/**
 * 사업자 정보. env 로 주입해 사업자 실값 확정 시 코드 변경 없이 반영.
 * SIH-548 법규 페이지 + SIH-555 이메일 템플릿 공용 소스.
 */
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

const NOT_REGISTERED = "(미등록)";

/** UI 렌더용 — 빈 값이면 "(미등록)" 표시. 템플릿 내부 조건부 렌더는 빈값으로 체크. */
export function displayBusinessInfo() {
  return {
    name: businessInfo.name,
    owner: businessInfo.owner || NOT_REGISTERED,
    address: businessInfo.address || NOT_REGISTERED,
    email: businessInfo.email,
    registrationNumber: businessInfo.registrationNumber,
    privacyOfficer: businessInfo.privacyOfficer || businessInfo.owner || NOT_REGISTERED,
    privacyOfficerEmail: businessInfo.privacyOfficerEmail,
  };
}

export const EFFECTIVE_DATE = "2026-04-15";
