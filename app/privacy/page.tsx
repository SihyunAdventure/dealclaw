import type { Metadata } from "next";
import Link from "next/link";
import { displayBusinessInfo, EFFECTIVE_DATE } from "@/lib/biz-info";

const businessInfo = displayBusinessInfo();

export const metadata: Metadata = {
  title: "개인정보처리방침 - hotinbeauty",
  description: "hotinbeauty 개인정보처리방침",
};

export default function PrivacyPage() {
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
          개인정보처리방침
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          시행일: {EFFECTIVE_DATE}
        </p>
      </header>

      <article className="px-4 py-6 text-[13px] leading-relaxed text-foreground space-y-6">
        <p>
          {businessInfo.name}(이하 &quot;회사&quot;)는 이용자의 개인정보를 중요시하며,
          「정보통신망 이용촉진 및 정보보호 등에 관한 법률」, 「개인정보 보호법」 등
          관련 법령을 준수하고 있습니다.
        </p>

        <Section title="1. 수집하는 개인정보 항목">
          <p>회사는 가격 알림 서비스 제공을 위해 아래 항목을 수집합니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>필수: 이메일 주소, 관심 카테고리</li>
            <li>자동 수집: IP 주소, 접속 로그, 수신동의 일시</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 수집 및 이용 목적">
          <ul className="list-disc pl-5 space-y-1">
            <li>구독한 카테고리의 최저가 갱신 알림 이메일 발송</li>
            <li>본인 확인(더블 옵트인) 및 수신 동의 여부 확인</li>
            <li>이용약관 위반·악용 대응, 서비스 운영·통계</li>
          </ul>
        </Section>

        <Section title="3. 개인정보의 보유 및 이용 기간">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              구독 유지 기간 동안 보유하며, 이용자가 수신 거부(구독 해지)한 경우
              즉시 파기합니다.
            </li>
            <li>
              관계 법령에 따라 보존이 필요한 경우 해당 법령이 정한 기간 동안 별도
              보관 후 파기합니다.
            </li>
          </ul>
        </Section>

        <Section title="4. 개인정보의 제3자 제공">
          <p>
            회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에
            근거한 요청이 있는 경우 예외로 합니다.
          </p>
        </Section>

        <Section title="5. 개인정보 처리 위탁">
          <p>회사는 원활한 서비스 제공을 위해 아래와 같이 업무를 위탁하고 있습니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              Amazon Web Services, Inc. — 이메일 발송(AWS SES) 및 데이터 저장
            </li>
            <li>Neon, Inc. — 데이터베이스(Postgres) 호스팅</li>
            <li>Vercel Inc. — 웹 인프라 호스팅</li>
          </ul>
        </Section>

        <Section title="6. 정보주체의 권리·의무 및 행사 방법">
          <p>
            이용자는 언제든지 구독 해지 링크를 통해 수신을 철회하거나, 아래
            연락처로 본인 정보의 열람·정정·삭제를 요청할 수 있습니다.
          </p>
        </Section>

        <Section title="7. 개인정보의 파기">
          <p>
            보유 기간 경과 또는 처리 목적 달성 시 지체 없이 해당 정보를 파기합니다.
            전자적 파일 형태의 정보는 복구·재생할 수 없는 기술적 방법으로 삭제합니다.
          </p>
        </Section>

        <Section title="8. 개인정보 안전성 확보 조치">
          <ul className="list-disc pl-5 space-y-1">
            <li>접속 기록의 보관 및 위·변조 방지</li>
            <li>개인정보에 대한 접근 제한</li>
            <li>통신 구간 암호화(HTTPS)</li>
          </ul>
        </Section>

        <Section title="9. 쿠키(Cookie)의 운용">
          <p>
            회사는 서비스 이용 편의를 위해 필수 쿠키를 사용할 수 있으며, 이용자는
            브라우저 설정에서 쿠키 저장을 거부할 수 있습니다.
          </p>
        </Section>

        <Section title="10. 개인정보 보호책임자">
          <ul className="list-none space-y-1">
            <li>책임자: {businessInfo.privacyOfficer}</li>
            <li>
              연락처:{" "}
              <a
                href={`mailto:${businessInfo.privacyOfficerEmail}`}
                className="underline"
              >
                {businessInfo.privacyOfficerEmail}
              </a>
            </li>
          </ul>
        </Section>

        <Section title="11. 개인정보처리방침 변경">
          <p>
            본 방침은 법령 또는 서비스 정책의 변경에 따라 수정될 수 있으며,
            변경 시 웹사이트를 통해 고지합니다.
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
