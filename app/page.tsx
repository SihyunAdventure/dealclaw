import { DecisionStrip } from "@/components/decision-strip";
import { PlatformSignalSection } from "@/components/platform-signal-section";
import {
  getCoupangSignals,
  getHomeSummary,
  getOliveYoungSignals,
} from "@/lib/signals/price-changes";

export const revalidate = 300;

export default async function Home() {
  const [coupangResult, oliveyoungResult] = await Promise.allSettled([
    getCoupangSignals(8),
    getOliveYoungSignals(8),
  ]);

  const coupang = coupangResult.status === "fulfilled" ? coupangResult.value : null;
  const oliveyoung =
    oliveyoungResult.status === "fulfilled" ? oliveyoungResult.value : null;

  const summary = getHomeSummary({ coupang, oliveyoung });
  const allFailed = coupang == null && oliveyoung == null;

  return (
    <main className="flex-1 bg-background">
      <header className="border-b border-border px-4 py-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          hotinbeauty
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          지금 살 이유가 생긴 뷰티 가격 변화만 먼저 보여드립니다.
        </p>
      </header>

      <DecisionStrip summary={summary} />

      {allFailed ? (
        <section className="border-b border-border px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            지금 홈 신호를 불러오지 못했어요
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            데이터 수집이 다시 안정화되면 쿠팡/올영 신호가 여기에 나타납니다.
          </p>
        </section>
      ) : null}

      <PlatformSignalSection
        title="쿠팡에서 지금 싸진 것"
        description="최근 7일 기준 새 최저가 신호가 생긴 상품만 추렸어요."
        emptyTitle="지금은 눈에 띄는 인하가 없어요"
        emptyDescription="다음 수집 사이클에 새 쿠팡 신호를 다시 확인합니다."
        result={coupang}
      />

      <PlatformSignalSection
        title="올리브영에서 지금 변한 것"
        description="가격 하락과 랭킹 상승이 함께 보이는 상품을 먼저 보여드려요."
        emptyTitle="지금은 순위 변동이 크지 않아요"
        emptyDescription="다음 수집 사이클에 새 올리브영 신호를 다시 확인합니다."
        result={oliveyoung}
      />

      <footer className="mt-4 border-t border-border px-4 py-6 text-center text-[11px] text-muted-foreground">
        <p>쿠팡 파트너스 및 올리브영 큐레이터 활동의 일환으로 수수료를 지급받을 수 있습니다.</p>
        <nav className="mt-2 flex justify-center gap-3">
          <a href="/privacy" className="underline hover:text-foreground">
            개인정보처리방침
          </a>
          <span aria-hidden>·</span>
          <a href="/terms" className="underline hover:text-foreground">
            이용약관
          </a>
        </nav>
        <p className="mt-2">© 2026 hotinbeauty</p>
      </footer>
    </main>
  );
}
