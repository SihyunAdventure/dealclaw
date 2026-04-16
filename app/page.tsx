import { CoupangSignalPanel } from "@/components/coupang-signal-panel";
import { DecisionStrip } from "@/components/decision-strip";
import { OliveYoungRankingPanel } from "@/components/oliveyoung-ranking-panel";
import { PlatformTabs } from "@/components/platform-tabs";
import {
  getCoupangSignals,
  getHomeSummary,
  getOliveYoungRanking,
  getOliveYoungSignals,
} from "@/lib/signals/price-changes";

export const revalidate = 300;

export default async function Home() {
  const [coupangResult, oliveyoungResult, oyRankingResult] =
    await Promise.allSettled([
      getCoupangSignals(),
      getOliveYoungSignals(8),
      getOliveYoungRanking(),
    ]);

  const coupang = coupangResult.status === "fulfilled" ? coupangResult.value : null;
  const oliveyoung =
    oliveyoungResult.status === "fulfilled" ? oliveyoungResult.value : null;
  const oyRanking =
    oyRankingResult.status === "fulfilled" ? oyRankingResult.value : null;

  const summary = getHomeSummary({ coupang, oliveyoung });
  const allFailed = coupang == null && oliveyoung == null;

  return (
    <main className="flex-1">
      <header className="flex items-center justify-between px-5 py-4">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          hotinbeauty
        </h1>
      </header>

      <DecisionStrip summary={summary} />

      {allFailed ? (
        <section className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            지금 홈 신호를 불러오지 못했어요
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            데이터 수집이 다시 안정화되면 쿠팡/올영 신호가 여기에 나타납니다.
          </p>
        </section>
      ) : null}

      <PlatformTabs
        coupang={<CoupangSignalPanel result={coupang} />}
        oliveyoung={<OliveYoungRankingPanel result={oyRanking} />}
      />

      <footer className="px-5 py-8 text-center text-[11px] text-muted-foreground">
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
