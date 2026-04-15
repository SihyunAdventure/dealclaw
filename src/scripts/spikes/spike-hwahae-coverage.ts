// 화해 크롤 Phase 2/3 설계 확정용 커버리지 스파이크.
// 4 block: 카테고리 트리 / 페이지네이션 / cross-theme uid / rate-limit.
// 결과: .omc/research/hwahae-coverage.json + hwahae-coverage.md

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const BASE = "https://www.hwahae.co.kr";
const UA =
  "Mozilla/5.0 (Linux; x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJSON = any;

interface FetchResult {
  url: string;
  status: number;
  elapsed: number;
  nextData: AnyJSON | null;
  bodySize: number;
}

async function fetchNextData(url: string): Promise<FetchResult> {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const html = await r.text();
  const elapsed = Date.now() - t0;
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const nextData = m ? JSON.parse(m[1]) : null;
  return { url, status: r.status, elapsed, nextData, bodySize: html.length };
}

interface FlatCat {
  themeSlug: string;
  id: number;
  parentId: number | null;
  name: string;
  depth: number;
  maxRank: number | null;
  rankingType: string;
  isAdvertised: boolean;
}

async function collectCategoryTree(): Promise<{
  flat: FlatCat[];
  rawByTheme: Record<string, AnyJSON>;
}> {
  const themes = [
    { slug: "trending", themeId: 5102 },
    { slug: "category", themeId: 2 },
    { slug: "skin", themeId: 174 },
    { slug: "age", themeId: 1372 },
    { slug: "brand", themeId: 2058 },
  ];
  const flat: FlatCat[] = [];
  const rawByTheme: Record<string, AnyJSON> = {};
  for (const t of themes) {
    const r = await fetchNextData(
      `${BASE}/rankings?english_name=${t.slug}&theme_id=${t.themeId}`,
    );
    if (!r.nextData) continue;
    const rc = r.nextData.props.pageProps.rankingsCategories;
    rawByTheme[t.slug] = rc;
    const seen = new Set<number>();
    const walk = (node: AnyJSON, depth: number, parentId: number | null) => {
      if (!node || seen.has(node.id)) return;
      seen.add(node.id);
      flat.push({
        themeSlug: t.slug,
        id: node.id,
        parentId,
        name: node.name,
        depth,
        maxRank: node.max_rank ?? null,
        rankingType: node.ranking_type ?? "",
        isAdvertised: !!node.is_advertised,
      });
      for (const c of node.children ?? []) walk(c, depth + 1, node.id);
      for (const c of node.categories ?? []) walk(c, depth + 1, node.id);
    };
    walk(rc, 1, null);
  }
  return { flat, rawByTheme };
}

async function probePagination(slug: string, themeId: number) {
  const p1 = await fetchNextData(
    `${BASE}/rankings?english_name=${slug}&theme_id=${themeId}&page=1`,
  );
  const p2 = await fetchNextData(
    `${BASE}/rankings?english_name=${slug}&theme_id=${themeId}&page=2`,
  );
  const pp1 = p1.nextData?.props.pageProps.rankingProducts;
  const pp2 = p2.nextData?.props.pageProps.rankingProducts;
  const d1: AnyJSON[] = pp1?.data?.details ?? [];
  const d2: AnyJSON[] = pp2?.data?.details ?? [];
  const uids1 = new Set(d1.map((x: AnyJSON) => x.product.uid));
  const uids2 = new Set(d2.map((x: AnyJSON) => x.product.uid));
  const overlap = [...uids2].filter((u) => uids1.has(u as string)).length;
  return {
    slug,
    themeId,
    p1Status: p1.status,
    p2Status: p2.status,
    p1Count: d1.length,
    p2Count: d2.length,
    p1Meta: pp1?.meta?.pagination,
    p2Meta: pp2?.meta?.pagination,
    overlap,
  };
}

async function probeCrossTheme(flat: FlatCat[]) {
  // category 트리 depth=2 대분류 중 "전체" 제외 8개 샘플
  const subs = flat
    .filter(
      (c) => c.themeSlug === "category" && c.depth === 2 && c.name !== "카테고리 전체",
    )
    .slice(0, 8);
  const uidToCats = new Map<string, Set<string>>();
  for (const s of subs) {
    const r = await fetchNextData(
      `${BASE}/rankings?english_name=category&theme_id=${s.id}`,
    );
    const details: AnyJSON[] =
      r.nextData?.props.pageProps.rankingProducts?.data?.details ?? [];
    for (const d of details) {
      const uid = d.product.uid;
      if (!uidToCats.has(uid)) uidToCats.set(uid, new Set());
      uidToCats.get(uid)!.add(s.name);
    }
  }
  const duplicated = [...uidToCats.entries()].filter(
    ([, s]) => s.size >= 2,
  ).length;
  const maxOverlap = Math.max(
    0,
    ...[...uidToCats.values()].map((s) => s.size),
  );
  return {
    sampledCategories: subs.map((s) => s.name),
    totalProducts: uidToCats.size,
    duplicatedUidCount: duplicated,
    maxCategoryOverlap: maxOverlap,
  };
}

async function probeRateLimit(flat: FlatCat[]) {
  const urls = flat
    .filter((c) => c.themeSlug === "category" && c.depth >= 2)
    .slice(0, 30)
    .map((c) => `${BASE}/rankings?english_name=category&theme_id=${c.id}`);
  if (urls.length === 0) return { skipped: true };
  const t0 = Date.now();
  const results = await Promise.all(
    urls.map(async (u) => {
      const r = await fetch(u, { headers: { "User-Agent": UA } });
      await r.text();
      return { url: u, status: r.status };
    }),
  );
  const elapsed = Date.now() - t0;
  const statusCounts: Record<number, number> = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  return {
    concurrent: urls.length,
    elapsedMs: elapsed,
    avgPerReq: Math.round(elapsed / urls.length),
    statusCounts,
  };
}

async function main() {
  console.log("[Block 1] 카테고리 트리 수집");
  const { flat, rawByTheme } = await collectCategoryTree();
  const byTheme: Record<string, number> = {};
  for (const f of flat) byTheme[f.themeSlug] = (byTheme[f.themeSlug] ?? 0) + 1;
  const byDepth: Record<number, number> = {};
  for (const f of flat) byDepth[f.depth] = (byDepth[f.depth] ?? 0) + 1;
  console.log(
    `  총 ${flat.length}개 · theme별 ${JSON.stringify(byTheme)} · depth별 ${JSON.stringify(byDepth)}`,
  );

  console.log("\n[Block 2] page=2 페이지네이션 실측");
  const pag = await probePagination("trending", 5102);
  console.log(
    `  trending p1=${pag.p1Count} p2=${pag.p2Count} overlap=${pag.overlap} p2meta=${JSON.stringify(pag.p2Meta)}`,
  );
  const pagCategory = await probePagination("category", 3); // 스킨케어
  console.log(
    `  category(스킨케어) p1=${pagCategory.p1Count} p2=${pagCategory.p2Count} overlap=${pagCategory.overlap} p2meta=${JSON.stringify(pagCategory.p2Meta)}`,
  );

  console.log("\n[Block 3] cross-theme uid 중복");
  const cross = await probeCrossTheme(flat);
  console.log(
    `  sample=${cross.sampledCategories.length} 카테고리 · 총 상품 ${cross.totalProducts} · ≥2카테고리 중복 ${cross.duplicatedUidCount} (max ${cross.maxCategoryOverlap}개 카테고리 교차)`,
  );

  console.log("\n[Block 4] rate-limit 30 req 동시");
  const rl = await probeRateLimit(flat);
  console.log(`  ${JSON.stringify(rl)}`);

  // 예상 크롤 규모 계산
  const crawlableCount = flat.filter(
    (c) =>
      (c.themeSlug === "category" && c.depth >= 2) ||
      (c.themeSlug === "trending" && c.depth === 1) ||
      (c.themeSlug === "skin" && c.depth === 2) ||
      (c.themeSlug === "age" && c.depth === 2) ||
      c.themeSlug === "brand",
  ).length;

  // max_rank 평균 기반 페이지 수 추정
  const catMaxRanks = flat
    .filter((c) => c.themeSlug === "category" && c.maxRank)
    .map((c) => c.maxRank!);
  const avgMax =
    catMaxRanks.length > 0
      ? catMaxRanks.reduce((s, v) => s + v, 0) / catMaxRanks.length
      : 20;
  const pagesPerNode = Math.ceil(avgMax / 20);

  const outDir = resolve(process.cwd(), ".omc/research");
  mkdirSync(outDir, { recursive: true });

  const json = {
    generatedAt: new Date().toISOString(),
    categoryTree: flat,
    perThemeCount: byTheme,
    perDepthCount: byDepth,
    rawByTheme,
    pagination: { trending: pag, categorySkinCare: pagCategory },
    crossThemeOverlap: cross,
    rateLimit: rl,
    estimates: {
      crawlableNodes: crawlableCount,
      avgMaxRank: avgMax,
      pagesPerNode,
      estimatedTotalRequestsPerRun: crawlableCount * pagesPerNode,
    },
  };
  writeFileSync(
    resolve(outDir, "hwahae-coverage.json"),
    JSON.stringify(json, null, 2),
    "utf-8",
  );

  // 마크다운 요약
  const md = `# 화해 크롤 커버리지 스파이크 결과

생성: ${new Date().toISOString()}

## Block 1 — 카테고리 트리
- 총 ${flat.length}개 노드
- theme별: ${Object.entries(byTheme).map(([k, v]) => `${k}=${v}`).join(" · ")}
- depth별: ${Object.entries(byDepth).map(([k, v]) => `d${k}=${v}`).join(" · ")}

## Block 2 — &page=2 페이지네이션
| theme | p1 | p2 | overlap | p2 meta |
|---|---|---|---|---|
| trending/5102 | ${pag.p1Count} | ${pag.p2Count} | ${pag.overlap} | \`${JSON.stringify(pag.p2Meta)}\` |
| category/3 (스킨케어) | ${pagCategory.p1Count} | ${pagCategory.p2Count} | ${pagCategory.overlap} | \`${JSON.stringify(pagCategory.p2Meta)}\` |

\`overlap=0\` 이고 \`p2.page===2\` 이면 페이지네이션 정상.

## Block 3 — cross-theme uid 중복
- 샘플 카테고리: ${cross.sampledCategories.join(", ")}
- 총 고유 상품: ${cross.totalProducts}
- 2개 이상 카테고리에 등장: ${cross.duplicatedUidCount}
- 최대 교차 수: ${cross.maxCategoryOverlap}

## Block 4 — rate-limit 30 동시 요청
\`${JSON.stringify(rl)}\`

## 예상 크롤 규모
- 수집 대상 노드: ${crawlableCount}
- 노드당 평균 max_rank: ${avgMax}
- 페이지 수: ${pagesPerNode}
- **1 run 총 요청 수: ${crawlableCount * pagesPerNode}**

## 판단
- Block 2에서 \`overlap=0\` + \`p2meta.page=2\` 확인 시 페이지네이션 패턴 확정
- Block 3의 duplicated 비율이 높을수록 \`hwahae_products\` upsert 의존도 큼 → 스키마 이미 수용
- Block 4의 429/500 = 0 이면 병렬도 20~30 안전
`;
  writeFileSync(resolve(outDir, "hwahae-coverage.md"), md, "utf-8");
  console.log(
    `\n✅ 저장: ${outDir}/hwahae-coverage.json + hwahae-coverage.md`,
  );
  console.log(
    `\n예상 1 run 요청 수: ${crawlableCount * pagesPerNode} (노드 ${crawlableCount} × 페이지 ${pagesPerNode})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
