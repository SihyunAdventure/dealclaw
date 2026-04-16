// 화해(Hwahae) Phase 3 크롤러 오케스트레이션.
//
// 역할: (1) SSR __NEXT_DATA__ 수집 → themes 메타 + 카테고리 트리
//        (2) 트리 리프 + trending 단일 + brand SSR 을 모아 병렬 gateway 호출
//        (3) 지수 백오프 재시도 + 에러 로깅
//        (4) 결과 in-memory 로 반환 (DB 기록은 Phase 4 storage 담당)
//
// 설계:
// - DB/파일 I/O 없음. 순수 오케스트레이션. Phase 4 에서 wrapping.
// - fetch 를 옵션으로 주입 가능 → 단위 테스트에서 네트워크 없이 검증.
// - 병렬도 15, 재시도 3회, 백오프 500ms/2s/5s (gateway-api.md 실측 기반).

import {
  extractNextData,
  parseBrandRankings,
  parseCategoryTree,
  parseGatewayRanking,
  parseThemes,
  selectLeafCategories,
  type RawGatewayResponse,
} from "./hwahae-parser";
import type {
  HwahaeBrandRanked,
  HwahaeRankedProduct,
  HwahaeRankingCategoryNode,
  HwahaeThemeMeta,
  HwahaeThemeSlug,
} from "./hwahae-types";

const SSR_BASE = "https://www.hwahae.co.kr";
const GATEWAY_BASE = "https://gateway.hwahae.co.kr";
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Phase 0 에서 실측 확정된 기본 theme_id (트리 초기화·brand·trending 용).
const THEME_SEEDS: Record<HwahaeThemeSlug, number> = {
  trending: 5102,
  category: 2,
  skin: 174,
  age: 1372,
  brand: 2058,
};

// fetch polyfill 충돌 회피용 경량 시그니처.
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type LogLevel = "info" | "warn" | "error";
export type LogFn = (level: LogLevel, msg: string) => void;

export interface CrawlOptions {
  /** 동시 gateway 요청 수. gateway-api.md 실측: 30 → 13% 500, 15 → 0%. 기본 15. */
  concurrency?: number;
  /** 요청 당 재시도 횟수(첫 시도 제외). 기본 3. */
  retries?: number;
  /** 재시도 사이 대기. attempt(0-indexed) → ms. 기본 [500, 2000, 5000]. */
  backoff?: (attempt: number) => number;
  /** User-Agent 헤더. */
  userAgent?: string;
  /** 수집할 테마. 기본 5종 전부. */
  themes?: HwahaeThemeSlug[];
  /** 리프 per theme 상한 — dry-run 용. undefined 면 제한 없음. */
  maxLeavesPerTheme?: number;
  /** 테스트·목 주입용. 기본 globalThis.fetch. */
  fetch?: FetchLike;
  /** 로그 수신자. 기본 no-op. */
  log?: LogFn;
}

export interface CrawlError {
  url: string;
  theme: HwahaeThemeSlug | null;
  themeId: number | null;
  attempts: number;
  message: string;
}

export interface CrawlOutcome {
  themes: HwahaeThemeMeta[];
  categoryNodes: HwahaeRankingCategoryNode[];
  products: HwahaeRankedProduct[];
  brandRanks: HwahaeBrandRanked[];
  errors: CrawlError[];
  leafCount: number;
  durationMs: number;
}

function defaultBackoff(attempt: number): number {
  return [500, 2000, 5000][attempt] ?? 5000;
}

const DEFAULT_THEMES: HwahaeThemeSlug[] = [
  "category",
  "skin",
  "age",
  "trending",
  "brand",
];

interface FetchDeps {
  fetchFn: FetchLike;
  userAgent: string;
  retries: number;
  backoff: (attempt: number) => number;
  log: LogFn;
}

interface RetryResult {
  ok: boolean;
  /** 마지막 성공 응답 본문. ok=false 면 빈 문자열. */
  text: string;
  /** ok=false 일 때의 마지막 실패 사유 (HTTP N 또는 exception 메시지). 성공 시 null. */
  message: string | null;
  /** 실제 시도 횟수(최초 시도 포함). */
  attempts: number;
}

/** 단일 GET + 지수 백오프 재시도. body 는 text() 로만 받아 JSON/HTML 양쪽 대응. */
async function retryingFetch(
  url: string,
  deps: FetchDeps,
): Promise<RetryResult> {
  let lastMsg = "unknown";
  const total = deps.retries + 1;
  for (let attempt = 0; attempt < total; attempt++) {
    try {
      const res = await deps.fetchFn(url, {
        headers: {
          "User-Agent": deps.userAgent,
          Accept: "application/json, text/html;q=0.9, */*;q=0.5",
        },
      });
      if (res.ok) {
        return {
          ok: true,
          text: await res.text(),
          message: null,
          attempts: attempt + 1,
        };
      }
      lastMsg = `HTTP ${res.status}`;
    } catch (e) {
      lastMsg = (e as Error).message;
    }
    deps.log("warn", `${url} ${lastMsg} (attempt ${attempt + 1}/${total})`);
    if (attempt < total - 1) {
      await new Promise((r) => setTimeout(r, deps.backoff(attempt)));
    }
  }
  return { ok: false, text: "", message: lastMsg, attempts: total };
}

/** 세마포어 기반 bounded concurrency. p-limit 등 의존성 추가 회피. */
async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const runnerCount = Math.min(concurrency, items.length);
  for (let k = 0; k < runnerCount; k++) {
    runners.push(
      (async () => {
        while (true) {
          const i = cursor;
          cursor += 1;
          if (i >= items.length) return;
          results[i] = await worker(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

async function fetchSsrPageProps(
  theme: HwahaeThemeSlug,
  themeId: number,
  deps: FetchDeps,
): Promise<{
  props: Record<string, unknown> | null;
  error: CrawlError | null;
}> {
  const url = `${SSR_BASE}/rankings?english_name=${theme}&theme_id=${themeId}`;
  const r = await retryingFetch(url, deps);
  if (!r.ok) {
    const msg = r.message ?? "unknown";
    deps.log("error", `SSR ${theme}(${themeId}) 실패: ${msg}`);
    return {
      props: null,
      error: { url, theme, themeId, attempts: r.attempts, message: msg },
    };
  }
  const nd = extractNextData(r.text) as
    | { props?: { pageProps?: Record<string, unknown> } }
    | null;
  const pp = nd?.props?.pageProps ?? null;
  if (!pp) {
    return {
      props: null,
      error: {
        url,
        theme,
        themeId,
        attempts: r.attempts,
        message: "__NEXT_DATA__ 파싱 실패",
      },
    };
  }
  return { props: pp, error: null };
}

async function fetchLeafRanking(
  theme: HwahaeThemeSlug,
  themeId: number,
  themeLabel: string | null,
  deps: FetchDeps,
): Promise<{
  products: HwahaeRankedProduct[];
  error: CrawlError | null;
}> {
  const url = `${GATEWAY_BASE}/v14/rankings/${themeId}/details?page=1&page_size=100`;
  const r = await retryingFetch(url, deps);
  if (!r.ok) {
    return {
      products: [],
      error: {
        url,
        theme,
        themeId,
        attempts: r.attempts,
        message: r.message ?? "unknown",
      },
    };
  }
  try {
    const json = JSON.parse(r.text) as RawGatewayResponse;
    return {
      products: parseGatewayRanking(json, theme, themeId, themeLabel),
      error: null,
    };
  } catch (e) {
    return {
      products: [],
      error: {
        url,
        theme,
        themeId,
        attempts: r.attempts,
        message: `JSON 파싱 실패: ${(e as Error).message}`,
      },
    };
  }
}

/**
 * 화해 랭킹 전체 크롤.
 *
 * 순서:
 *   1) category SSR 1회 → themes 메타 + category 트리
 *   2) skin/age SSR 각 1회 → 각 트리
 *   3) trending 단일 + (category/skin/age 리프) → gateway 병렬 호출
 *   4) brand SSR 1회 → brandRanks + 브랜드별 상품 top 3
 *
 * 에러는 `errors[]` 로 수집만 하고 전체 크롤은 계속 진행.
 * 초기 category SSR 이 실패하면 빈 결과 + errors 로 조기 리턴.
 */
export async function crawlHwahaeRankings(
  opts: CrawlOptions = {},
): Promise<CrawlOutcome> {
  const started = Date.now();
  const deps: FetchDeps = {
    fetchFn:
      opts.fetch ??
      ((url, init) =>
        fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>),
    userAgent: opts.userAgent ?? DEFAULT_UA,
    retries: opts.retries ?? 3,
    backoff: opts.backoff ?? defaultBackoff,
    log: opts.log ?? (() => {}),
  };
  const concurrency = opts.concurrency ?? 15;
  const themeList = opts.themes ?? DEFAULT_THEMES;

  const errors: CrawlError[] = [];
  const categoryNodes: HwahaeRankingCategoryNode[] = [];

  // 1. category SSR — themes 메타는 어떤 페이지에서도 동일하므로 여기서 확보.
  const categoryInit = await fetchSsrPageProps("category", 2, deps);
  if (!categoryInit.props) {
    if (categoryInit.error) errors.push(categoryInit.error);
    return {
      themes: [],
      categoryNodes: [],
      products: [],
      brandRanks: [],
      errors,
      leafCount: 0,
      durationMs: Date.now() - started,
    };
  }
  const themesMeta = parseThemes(categoryInit.props.rankings);
  if (themeList.includes("category")) {
    categoryNodes.push(
      ...parseCategoryTree(categoryInit.props.rankingsCategories, "category"),
    );
  }

  // 2. skin / age 트리 SSR.
  for (const theme of ["skin", "age"] as const) {
    if (!themeList.includes(theme)) continue;
    const init = await fetchSsrPageProps(theme, THEME_SEEDS[theme], deps);
    if (init.props) {
      categoryNodes.push(
        ...parseCategoryTree(init.props.rankingsCategories, theme),
      );
    } else if (init.error) {
      errors.push(init.error);
    }
  }

  // 3. 리프 조립 — category/skin/age 는 트리에서, trending 은 단일.
  type LeafTarget = {
    theme: HwahaeThemeSlug;
    themeId: number;
    themeLabel: string | null;
  };
  const leaves: LeafTarget[] = [];
  for (const t of ["category", "skin", "age"] as const) {
    if (!themeList.includes(t)) continue;
    const nodes = categoryNodes.filter((n) => n.themeEnglishName === t);
    for (const l of selectLeafCategories(nodes)) {
      leaves.push({ theme: t, themeId: l.id, themeLabel: l.name });
    }
  }
  if (themeList.includes("trending")) {
    leaves.push({
      theme: "trending",
      themeId: THEME_SEEDS.trending,
      themeLabel: null,
    });
  }

  // Dry-run 제한 (per theme cap).
  const runnable = capPerTheme(leaves, opts.maxLeavesPerTheme);
  deps.log(
    "info",
    `leaves=${runnable.length} (of ${leaves.length}) themes=[${themeList.join(",")}] concurrency=${concurrency}`,
  );

  // 4. 병렬 gateway fetch.
  const products: HwahaeRankedProduct[] = [];
  await mapWithConcurrency(runnable, concurrency, async (target) => {
    const res = await fetchLeafRanking(
      target.theme,
      target.themeId,
      target.themeLabel,
      deps,
    );
    if (res.error) errors.push(res.error);
    for (const p of res.products) products.push(p);
  });

  // 5. brand SSR — 랭킹·브랜드별 상품까지 한 요청으로.
  const brandRanks: HwahaeBrandRanked[] = [];
  if (themeList.includes("brand")) {
    const init = await fetchSsrPageProps("brand", THEME_SEEDS.brand, deps);
    if (init.props) {
      const { brands, products: bp } = parseBrandRankings(
        init.props.brandRankings,
        init.props.brandProductsLists,
        THEME_SEEDS.brand,
      );
      brandRanks.push(...brands);
      for (const p of bp) products.push(p);
    } else if (init.error) {
      errors.push(init.error);
    }
  }

  deps.log(
    "info",
    `완료 products=${products.length} brands=${brandRanks.length} errors=${errors.length} ${Date.now() - started}ms`,
  );

  return {
    themes: themesMeta,
    categoryNodes,
    products,
    brandRanks,
    errors,
    leafCount: runnable.length,
    durationMs: Date.now() - started,
  };
}

function capPerTheme<T extends { theme: HwahaeThemeSlug }>(
  items: T[],
  cap: number | undefined,
): T[] {
  if (cap === undefined) return items;
  const counter = new Map<HwahaeThemeSlug, number>();
  const out: T[] = [];
  for (const it of items) {
    const c = counter.get(it.theme) ?? 0;
    if (c < cap) {
      out.push(it);
      counter.set(it.theme, c + 1);
    }
  }
  return out;
}
