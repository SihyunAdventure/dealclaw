// EC2 호환성 검증: Playwright 없이 node 표준 fetch + regex 로 __NEXT_DATA__ 추출 가능한가.
// 올영은 Chromium headful 이 필수지만, 화해는 SSR 이라 이걸로 충분할 가능성.
// 통과 시 EC2 runtime 을 훨씬 가볍게 (Chromium 불필요).

import { resolve } from "path";
import type { HwahaeRankedProduct } from "../crawl/hwahae-types";

const UA =
  "Mozilla/5.0 (Linux; x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

const TARGETS = [
  { theme: "trending", themeId: 5102 },
  { theme: "category", themeId: 2 },
  { theme: "skin", themeId: 174 },
  { theme: "age", themeId: 1372 },
  { theme: "brand", themeId: 2058 },
];

interface NextData {
  props: { pageProps: Record<string, unknown> };
}

async function probe(theme: string, themeId: number) {
  const url = `https://www.hwahae.co.kr/rankings?english_name=${theme}&theme_id=${themeId}`;
  const t0 = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const html = await r.text();
  const t1 = Date.now();

  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return { theme, ok: false, reason: "no __NEXT_DATA__" };

  const nd = JSON.parse(m[1]) as NextData;
  const pp = nd.props.pageProps as Record<string, unknown>;

  const details = (
    pp.rankingProducts as
      | { data?: { details?: unknown[] }; meta?: { pagination?: unknown } }
      | undefined
  )?.data?.details;
  const brandRankings = pp.brandRankings as unknown[] | undefined;

  return {
    theme,
    ok: true,
    httpStatus: r.status,
    elapsedMs: t1 - t0,
    bodyBytes: html.length,
    nextDataBytes: m[1].length,
    detailsLen: Array.isArray(details) ? details.length : 0,
    brandRankingsLen: Array.isArray(brandRankings) ? brandRankings.length : 0,
    contentEncoding: r.headers.get("content-encoding"),
    cacheHeader: r.headers.get("x-cache"),
    cfChallenge: /cf-browser-verification|challenge-platform|just a moment/i.test(
      html,
    ),
  };
}

async function main() {
  console.log(`[EC2 호환성 스파이크] ${TARGETS.length} theme\n`);

  const results = [];
  for (const t of TARGETS) {
    const res = await probe(t.theme, t.themeId);
    console.log(
      `${t.theme.padEnd(10)} ${"ok" in res && res.ok ? "OK" : "FAIL"} ` +
        ("detailsLen" in res
          ? `status=${res.httpStatus} ${res.elapsedMs}ms ${(res.bodyBytes / 1024).toFixed(1)}KB details=${res.detailsLen} brandRankings=${res.brandRankingsLen} cache=${res.cacheHeader} cf=${res.cfChallenge}`
          : `reason=${(res as { reason: string }).reason}`),
    );
    results.push(res);
  }

  const okCount = results.filter((r) => r.ok).length;
  const totalBytes = results
    .filter((r): r is typeof results[0] & { bodyBytes: number } => "bodyBytes" in r)
    .reduce((s, r) => s + r.bodyBytes, 0);
  const avgElapsed =
    results
      .filter((r): r is typeof results[0] & { elapsedMs: number } => "elapsedMs" in r)
      .reduce((s, r) => s + r.elapsedMs, 0) / Math.max(okCount, 1);

  console.log(`\n통과: ${okCount}/${results.length}`);
  console.log(`총 다운로드: ${(totalBytes / 1024).toFixed(1)}KB`);
  console.log(`평균 응답: ${avgElapsed.toFixed(0)}ms`);
  console.log(
    `\n결론: Playwright/Chromium ${okCount === results.length ? "불필요 — bare fetch 로 충분" : "여전히 필요"}`,
  );

  // 타입 호환성 확인용 import (미사용 경고 회피)
  void (null as unknown as HwahaeRankedProduct | null);

  if (okCount !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

void resolve; // tsconfig noUnusedLocals
