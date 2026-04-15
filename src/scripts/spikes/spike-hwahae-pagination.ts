// 교정 스파이크: 페이지네이션 실제 메커니즘 확정.
// 1. depth=3 리프 노드 (max_rank=100) 하나 선택
// 2. HTML 의 __NEXT_DATA__.buildId 추출
// 3. Next.js 라우트 data API `/_next/data/{buildId}/rankings.json?...&page=N` 3회 호출
// 4. meta.pagination.page 값 + details uid overlap 측정

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const BASE = "https://www.hwahae.co.kr";
const UA =
  "Mozilla/5.0 (Linux; x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJSON = any;

async function fetchSSR(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return { status: r.status, html, nextData: m ? JSON.parse(m[1]) : null };
}

async function fetchJson(url: string, referer: string) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, accept: "application/json", referer },
  });
  const body = await r.text();
  let json: AnyJSON = null;
  try {
    json = JSON.parse(body);
  } catch {
    // not JSON
  }
  return { status: r.status, json, bodyBytes: body.length };
}

async function main() {
  // 1. category root 에서 depth=3 리프 후보 찾기
  const root = await fetchSSR(`${BASE}/rankings?english_name=category&theme_id=2`);
  const rc = root.nextData?.props.pageProps.rankingsCategories;
  const buildId = root.nextData?.buildId;
  if (!rc || !buildId) {
    console.error("rankingsCategories or buildId missing");
    process.exit(1);
  }
  console.log(`buildId = ${buildId}`);

  // walk → depth=3 리프 중 max_rank 있는 것
  const leaves: AnyJSON[] = [];
  const walk = (n: AnyJSON, depth: number, parent: string) => {
    if (!n) return;
    if (depth === 3) {
      leaves.push({ ...n, _depth: depth, _parent: parent });
    }
    for (const c of n.children ?? []) walk(c, depth + 1, n.name);
    for (const c of n.categories ?? []) walk(c, depth + 1, n.name);
  };
  walk(rc, 1, "(root)");
  const target = leaves.find((l) => l.max_rank >= 100) ?? leaves[0];
  if (!target) {
    console.error("no depth=3 leaf found");
    process.exit(1);
  }
  console.log(
    `target leaf: id=${target.id} name="${target.name}" parent="${target._parent}" max_rank=${target.max_rank}`,
  );

  // 2. SSR 한 번 호출해 data.details 확인 (확실히 랭킹 페이지인지)
  const ssr = await fetchSSR(
    `${BASE}/rankings?english_name=category&theme_id=${target.id}`,
  );
  const ssrDetails =
    ssr.nextData?.props.pageProps.rankingProducts?.data?.details ?? [];
  const ssrMeta =
    ssr.nextData?.props.pageProps.rankingProducts?.meta?.pagination;
  console.log(
    `SSR page1: details=${ssrDetails.length} meta=${JSON.stringify(ssrMeta)}`,
  );

  // 3. Next.js data route 로 page 1/2/3 실측
  const pageResults: AnyJSON[] = [];
  for (const page of [1, 2, 3, 4, 5]) {
    const dataUrl = `${BASE}/_next/data/${buildId}/rankings.json?english_name=category&theme_id=${target.id}&page=${page}`;
    const r = await fetchJson(
      dataUrl,
      `${BASE}/rankings?english_name=category&theme_id=${target.id}`,
    );
    const pp = r.json?.pageProps;
    const details: AnyJSON[] = pp?.rankingProducts?.data?.details ?? [];
    const meta = pp?.rankingProducts?.meta?.pagination;
    const uids = details.map((d: AnyJSON) => d.product?.uid).filter(Boolean);
    pageResults.push({
      page,
      status: r.status,
      detailsLen: details.length,
      meta,
      uidsSample: uids.slice(0, 3),
      uids,
    });
    console.log(
      `data page=${page}: status=${r.status} detailsLen=${details.length} meta=${JSON.stringify(meta)} firstUid=${uids[0] ?? "-"}`,
    );
  }

  // 4. uid overlap 분석
  const uidSets = pageResults.map((p) => new Set(p.uids as string[]));
  const overlap12 = [...uidSets[1]].filter((u) => uidSets[0].has(u)).length;
  const overlap23 = [...uidSets[2]].filter((u) => uidSets[1].has(u)).length;
  const overlap34 = [...uidSets[3]].filter((u) => uidSets[2].has(u)).length;
  const totalUnique = new Set(pageResults.flatMap((p) => p.uids)).size;
  const totalEntries = pageResults.reduce((s, p) => s + p.detailsLen, 0);
  console.log(
    `\noverlap: p1∩p2=${overlap12}, p2∩p3=${overlap23}, p3∩p4=${overlap34}`,
  );
  console.log(
    `unique=${totalUnique} / entries=${totalEntries} (예상: 5 × 20 = 100)`,
  );

  // 5. 대안 파라미터 실험 (ssrDetails 0 이면 alternative)
  const altResults: AnyJSON[] = [];
  if (pageResults[0].detailsLen === 0 && ssrDetails.length === 0) {
    console.log(
      `\n기본 route 에 details 없음. 대안 파라미터 시도`,
    );
    const altUrls = [
      `${BASE}/_next/data/${buildId}/rankings.json?english_name=category&theme_id=${target.id}`,
      `${BASE}/_next/data/${buildId}/rankings.json?english_name=category&theme_id=${target.id}&page_size=100`,
    ];
    for (const u of altUrls) {
      const r = await fetchJson(u, `${BASE}/rankings`);
      altResults.push({
        url: u,
        status: r.status,
        keys: r.json
          ? Object.keys(r.json.pageProps ?? {})
          : null,
      });
    }
  }

  // 결과 저장
  const outDir = resolve(process.cwd(), ".omc/research");
  mkdirSync(outDir, { recursive: true });
  const json = {
    generatedAt: new Date().toISOString(),
    target,
    buildId,
    ssr: {
      detailsLen: ssrDetails.length,
      meta: ssrMeta,
      firstUid: (ssrDetails[0] as AnyJSON | undefined)?.product?.uid ?? null,
    },
    pageResults: pageResults.map((p) => ({
      page: p.page,
      status: p.status,
      detailsLen: p.detailsLen,
      meta: p.meta,
      uidsSample: p.uidsSample,
    })),
    overlap: { p1p2: overlap12, p2p3: overlap23, p3p4: overlap34 },
    totalUnique,
    totalEntries,
    altResults,
  };
  writeFileSync(
    resolve(outDir, "hwahae-pagination.json"),
    JSON.stringify(json, null, 2),
    "utf-8",
  );
  console.log(`\n✅ saved → ${outDir}/hwahae-pagination.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
