// SIH-569 Phase 3 크롤러 단위 테스트.
// 네트워크 없이 mock fetch 를 주입해 병렬·재시도·집계·에러 수집을 검증한다.
// Phase 0 __NEXT_DATA__ 픽스처를 그대로 응답 body 로 재생.
//
// 실행: npx tsx src/scripts/test-hwahae-ranking.ts

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  crawlHwahaeRankings,
  type CrawlOptions,
  type FetchLike,
} from "../crawl/hwahae-ranking";

const FIXTURES_DIR =
  process.env.FIXTURES_DIR ??
  resolve(
    process.cwd(),
    "../sih-566-hwahae-phase0/.omc/research/nextdata",
  );

let failed = 0;
function check(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

function readFixture(name: string): string {
  const p = resolve(FIXTURES_DIR, name);
  if (!existsSync(p)) throw new Error(`fixture missing: ${p}`);
  return readFileSync(p, "utf-8");
}

// SSR HTML 에 __NEXT_DATA__ 만 끼워넣는 최소 wrapper.
function makeSsrHtml(nextDataJson: string): string {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${nextDataJson}</script></body></html>`;
}

// 그럴듯한 gateway 응답을 SSR rankingProducts 로부터 만든다(shape 동일).
function makeGatewayBody(ssrNextDataJson: string): string {
  const nd = JSON.parse(ssrNextDataJson) as {
    props: { pageProps: { rankingProducts: unknown } };
  };
  return JSON.stringify(nd.props.pageProps.rankingProducts);
}

// ──────────── test 1: 정상 경로 ────────────
async function testHappyPath() {
  console.log("\n== 정상 경로: 5 theme 전체 크롤 ==");

  const categoryNd = readFixture("category.json");
  const skinNd = readFixture("skin.json");
  const ageNd = readFixture("age.json");
  const trendingNd = readFixture("trending.json");
  const brandNd = readFixture("brand.json");

  const calls: Array<{ url: string; kind: string }> = [];
  let concurrent = 0;
  let peakConcurrent = 0;

  const mockFetch: FetchLike = async (url) => {
    concurrent += 1;
    if (concurrent > peakConcurrent) peakConcurrent = concurrent;
    try {
      // 살짝 yield 해서 병렬 슬롯을 실제로 경쟁시킴.
      await new Promise((r) => setTimeout(r, 2));

      if (url.includes("gateway.hwahae.co.kr")) {
        calls.push({ url, kind: "gateway" });
        return {
          ok: true,
          status: 200,
          text: async () => makeGatewayBody(categoryNd),
        };
      }
      if (url.includes("english_name=category")) {
        calls.push({ url, kind: "ssr-category" });
        return {
          ok: true,
          status: 200,
          text: async () => makeSsrHtml(categoryNd),
        };
      }
      if (url.includes("english_name=skin")) {
        calls.push({ url, kind: "ssr-skin" });
        return { ok: true, status: 200, text: async () => makeSsrHtml(skinNd) };
      }
      if (url.includes("english_name=age")) {
        calls.push({ url, kind: "ssr-age" });
        return { ok: true, status: 200, text: async () => makeSsrHtml(ageNd) };
      }
      if (url.includes("english_name=trending")) {
        calls.push({ url, kind: "ssr-trending" });
        return {
          ok: true,
          status: 200,
          text: async () => makeSsrHtml(trendingNd),
        };
      }
      if (url.includes("english_name=brand")) {
        calls.push({ url, kind: "ssr-brand" });
        return {
          ok: true,
          status: 200,
          text: async () => makeSsrHtml(brandNd),
        };
      }
      return { ok: false, status: 404, text: async () => "" };
    } finally {
      concurrent -= 1;
    }
  };

  const logs: Array<{ level: string; msg: string }> = [];
  const out = await crawlHwahaeRankings({
    concurrency: 5,
    retries: 0,
    backoff: () => 0,
    fetch: mockFetch,
    log: (level, msg) => logs.push({ level, msg }),
    maxLeavesPerTheme: 2, // 리프 샘플링 — fixture 1개만 있어 다양성은 moot 이지만 동작 확인
  });

  check(out.errors.length === 0, `errors=${out.errors.length}`);
  check(out.themes.length === 5, `themes=${out.themes.length}`);
  check(out.categoryNodes.length > 100, `categoryNodes=${out.categoryNodes.length}`);
  check(
    out.categoryNodes.some((n) => n.themeEnglishName === "skin") &&
      out.categoryNodes.some((n) => n.themeEnglishName === "age") &&
      out.categoryNodes.some((n) => n.themeEnglishName === "category"),
    "category/skin/age 트리 모두 수집",
  );
  check(out.brandRanks.length === 10, `brandRanks=${out.brandRanks.length}`);
  check(out.products.length > 0, `products=${out.products.length}`);
  check(
    out.products.some((p) => p.theme === "brand"),
    "brand 상품 포함",
  );
  check(peakConcurrent <= 5, `peakConcurrent=${peakConcurrent} (<=5)`);
  check(peakConcurrent >= 2, `peakConcurrent=${peakConcurrent} (>=2, 실제 병렬 수행)`);
  check(
    calls.filter((c) => c.kind === "ssr-category").length === 1,
    "category SSR 1회만 호출",
  );
  check(
    calls.filter((c) => c.kind === "gateway").length === out.leafCount,
    `gateway 호출 수=${calls.filter((c) => c.kind === "gateway").length} = leafCount ${out.leafCount}`,
  );
}

// ──────────── test 2: 재시도 + 백오프 ────────────
async function testRetryWithBackoff() {
  console.log("\n== 재시도 경로: 처음 2회 500 → 3회째 성공 ==");
  const categoryNd = readFixture("category.json");
  const gatewayBody = makeGatewayBody(categoryNd);

  let gatewayAttempts = 0;
  const backoffCalls: number[] = [];

  const mockFetch: FetchLike = async (url) => {
    if (url.includes("gateway.hwahae.co.kr")) {
      gatewayAttempts += 1;
      if (gatewayAttempts <= 2) {
        return { ok: false, status: 500, text: async () => "" };
      }
      return { ok: true, status: 200, text: async () => gatewayBody };
    }
    // 모든 SSR 은 category 로 재생 (skin/age/brand 트리 요청은 오지만 결과 같음)
    return {
      ok: true,
      status: 200,
      text: async () => makeSsrHtml(categoryNd),
    };
  };

  const opts: CrawlOptions = {
    concurrency: 1,
    retries: 3,
    backoff: (attempt) => {
      backoffCalls.push(attempt);
      return 0; // 테스트 속도 확보
    },
    themes: ["category"], // gateway 호출 범위 축소
    maxLeavesPerTheme: 1,
    fetch: mockFetch,
    log: () => {},
  };
  const out = await crawlHwahaeRankings(opts);

  check(out.errors.length === 0, `최종 성공 (errors=${out.errors.length})`);
  check(gatewayAttempts === 3, `gateway 3회 시도 (got ${gatewayAttempts})`);
  check(backoffCalls.length >= 2, `backoff ≥2회 호출 (got ${backoffCalls.length})`);
  check(
    backoffCalls.slice(0, 2).join(",") === "0,1",
    `backoff attempt 인자 0,1 순 (got ${backoffCalls.slice(0, 2).join(",")})`,
  );
  check(out.products.length > 0, `재시도 후 상품 수집 ${out.products.length}`);
}

// ──────────── test 3: 재시도 소진 → 에러 수집 ────────────
async function testRetryExhausted() {
  console.log("\n== 재시도 소진: gateway 계속 500 → 에러로 수집 ==");
  const categoryNd = readFixture("category.json");

  let gatewayAttempts = 0;
  const mockFetch: FetchLike = async (url) => {
    if (url.includes("gateway.hwahae.co.kr")) {
      gatewayAttempts += 1;
      return { ok: false, status: 500, text: async () => "" };
    }
    return {
      ok: true,
      status: 200,
      text: async () => makeSsrHtml(categoryNd),
    };
  };

  const out = await crawlHwahaeRankings({
    concurrency: 1,
    retries: 2,
    backoff: () => 0,
    themes: ["category"],
    maxLeavesPerTheme: 1,
    fetch: mockFetch,
    log: () => {},
  });

  check(gatewayAttempts === 3, `3회 시도 후 포기 (got ${gatewayAttempts})`);
  check(out.errors.length === 1, `errors=${out.errors.length}`);
  check(
    out.errors[0]?.message.includes("500"),
    `error message=HTTP 500 (got ${out.errors[0]?.message})`,
  );
  check(out.errors[0]?.attempts === 3, `errors[0].attempts=${out.errors[0]?.attempts}`);
  check(out.products.length === 0, `gateway 실패 시 products=0`);
}

// ──────────── test 4: 초기 SSR 실패 → 조기 리턴 ────────────
async function testInitialSsrFailure() {
  console.log("\n== 초기 category SSR 실패 → 빈 결과 + 에러 ==");
  const mockFetch: FetchLike = async () => {
    return { ok: false, status: 503, text: async () => "" };
  };
  const out = await crawlHwahaeRankings({
    retries: 1,
    backoff: () => 0,
    fetch: mockFetch,
    log: () => {},
  });
  check(out.products.length === 0, "products=0");
  check(out.themes.length === 0, "themes=0");
  check(out.categoryNodes.length === 0, "categoryNodes=0");
  check(out.errors.length === 1, `errors=${out.errors.length}`);
  check(out.errors[0]?.theme === "category", "error.theme=category");
}

// ──────────── test 5: 병렬도 상한 엄격히 지켜지는지 ────────────
async function testStrictConcurrency() {
  console.log("\n== concurrency=3 엄격 준수 + 많은 leaves ==");
  const categoryNd = readFixture("category.json");

  let concurrent = 0;
  let peak = 0;
  const mockFetch: FetchLike = async (url) => {
    if (url.includes("gateway.hwahae.co.kr")) {
      concurrent += 1;
      if (concurrent > peak) peak = concurrent;
      try {
        await new Promise((r) => setTimeout(r, 5));
        return {
          ok: true,
          status: 200,
          text: async () => makeGatewayBody(categoryNd),
        };
      } finally {
        concurrent -= 1;
      }
    }
    return {
      ok: true,
      status: 200,
      text: async () => makeSsrHtml(categoryNd),
    };
  };

  const out = await crawlHwahaeRankings({
    concurrency: 3,
    retries: 0,
    backoff: () => 0,
    themes: ["category"],
    maxLeavesPerTheme: 10, // 10개 리프 → 3 동시로 경쟁 발생
    fetch: mockFetch,
    log: () => {},
  });

  check(out.leafCount === 10, `leafCount=${out.leafCount}`);
  check(peak === 3, `peak concurrent=${peak} (==3)`);
  check(out.errors.length === 0, `errors=${out.errors.length}`);
}

async function main() {
  console.log(`[fixtures] ${FIXTURES_DIR}`);
  if (!existsSync(FIXTURES_DIR)) {
    console.error(`FIXTURES_DIR not found: ${FIXTURES_DIR}`);
    process.exit(2);
  }

  await testHappyPath();
  await testRetryWithBackoff();
  await testRetryExhausted();
  await testInitialSsrFailure();
  await testStrictConcurrency();

  console.log("");
  if (failed > 0) {
    console.error(`❌ ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("✅ crawler smoke test 통과");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
