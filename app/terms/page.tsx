import type { Metadata } from "next";
import Link from "next/link";
import { displayBusinessInfo, EFFECTIVE_DATE } from "@/lib/biz-info";

const businessInfo = displayBusinessInfo();

export const metadata: Metadata = {
  title: "이용약관 - hotinbeauty",
  description: "hotinbeauty 서비스 이용약관",
};

export default function TermsPage() {
  return (
    <main className="flex-1 bg-background">
      <header className="border-b border-border px-4 py-5">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 홈으로
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight mt-2">
          이용약관
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          시행일: {EFFECTIVE_DATE}
        </p>
      </header>

      <article className="px-4 py-6 text-[13px] leading-relaxed text-foreground space-y-6">
        <Section title="제1조 (목적)">
          <p>
            본 약관은 {businessInfo.name}(이하 &quot;회사&quot;)이 제공하는
            hotinbeauty 웹사이트 및 관련 서비스(이하 &quot;서비스&quot;)의 이용조건 및
            절차, 이용자와 회사의 권리·의무, 책임사항을 규정함을 목적으로 합니다.
          </p>
        </Section>

        <Section title="제2조 (서비스 내용)">
          <ul className="list-disc pl-5 space-y-1">
            <li>쿠팡(partners.coupang.com 포함) 상품 가격 비교 정보 제공</li>
            <li>이용자가 구독한 카테고리의 최저가 갱신 이메일 알림</li>
            <li>
              회사는 쿠팡 파트너스 활동의 일환으로 수수료를 지급받을 수 있으며,
              본 서비스에 노출되는 상품 링크는 파트너스 링크를 포함할 수 있습니다.
            </li>
          </ul>
        </Section>

        <Section title="제3조 (정보의 정확성)">
          <p>
            회사는 최저가 정보를 자동 수집하여 제공하며, 쿠팡 원 사이트의 가격·
            재고와 실시간 동기화되지 않을 수 있습니다. 실제 주문·결제 시 표시되는
            가격은 쿠팡에서 확인하시기 바랍니다.
          </p>
        </Section>

        <Section title="제4조 (구독 및 해지)">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              이메일 구독은 본인 이메일로 수신된 인증 링크 클릭 후 활성화됩니다.
            </li>
            <li>
              이용자는 언제든지 발송된 이메일 하단의 수신거부 링크를 통해 즉시
              구독을 해지할 수 있습니다.
            </li>
            <li>
              회사는 이용자가 수신 거부한 경우 해당 이메일 주소에 대한 발송을
              중단합니다.
            </li>
          </ul>
        </Section>

        <Section title="제5조 (광고성 정보의 발송)">
          <p>
            회사가 발송하는 가격 알림 이메일은 정보통신망법 제50조에 따라
            &quot;(광고)&quot; 표기, 발신자 정보, 수신거부 방법을 명시하여
            발송합니다. 이용자는 수신 동의 시점에 해당 내용을 충분히 인지한 것으로
            간주합니다.
          </p>
        </Section>

        <Section title="제6조 (이용자의 의무)">
          <ul className="list-disc pl-5 space-y-1">
            <li>타인의 이메일 주소를 무단으로 입력하는 행위 금지</li>
            <li>
              자동화된 수단으로 본 서비스를 비정상적으로 호출하거나 수집하는 행위 금지
            </li>
            <li>서비스 운영을 방해하는 행위 금지</li>
          </ul>
        </Section>

        <Section title="제7조 (서비스의 중단)">
          <p>
            회사는 시스템 점검, 교체, 장애, 외부 데이터 소스(쿠팡) 정책 변경 등
            불가피한 사유가 있는 경우 사전 또는 사후 고지 후 서비스 제공을
            일시적으로 중단할 수 있습니다.
          </p>
        </Section>

        <Section title="제8조 (면책)">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              회사는 제공된 정보의 최신성·정확성에 대해 합리적인 노력을
              기울이나, 쿠팡 측 정보 오류·지연으로 인한 손해에 대해 책임지지
              않습니다.
            </li>
            <li>
              이용자가 본 서비스를 통해 쿠팡에서 구매한 상품의 품질·배송·환불
              등은 쿠팡 및 해당 판매자의 책임입니다.
            </li>
          </ul>
        </Section>

        <Section title="제9조 (약관의 변경)">
          <p>
            회사는 필요한 경우 본 약관을 변경할 수 있으며, 변경 시 시행일 7일 전
            웹사이트에 공지합니다. 중대한 변경의 경우 시행일 30일 전 공지하며,
            이용자가 공지 후에도 구독을 유지하는 경우 변경 약관에 동의한 것으로
            봅니다.
          </p>
        </Section>

        <Section title="제10조 (준거법 및 관할)">
          <p>
            본 약관은 대한민국 법률에 따라 해석되며, 분쟁이 발생할 경우 민사소송법
            상의 관할 법원을 제1심 관할로 합니다.
          </p>
        </Section>

        <div className="mt-10 border-t border-border pt-6 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground mb-1">{businessInfo.name}</p>
          <p>대표자: {businessInfo.owner}</p>
          <p>주소: {businessInfo.address}</p>
          {businessInfo.registrationNumber && (
            <p>사업자등록번호: {businessInfo.registrationNumber}</p>
          )}
          <p>
            문의:{" "}
            <a href={`mailto:${businessInfo.email}`} className="underline">
              {businessInfo.email}
            </a>
          </p>
        </div>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-heading text-base font-semibold mb-2">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}
