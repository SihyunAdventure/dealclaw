// SIH-566 Phase 0 스파이크 2차:
// 1. 페이지에서 <a href="..."> 의 host별 prefix 분포 확인 — 실제 상품 링크 패턴 찾기
// 2. __NEXT_DATA__ / initialProps JSON 에서 상품 데이터 경로 탐색
// 3. skin/age 는 theme_id 붙여 재시도
// 결과: .omc/research/hwahae-phase0b.json

import { launchChrome } from "../crawl/chrome";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Page, Response } from "playwright";

const BASE = "https://www.hwahae.co.kr";
const TARGETS = [
  { label: "trending", url: `${BASE}/rankings?english_name=trending&theme_id=5102` },
  { label: "category", url: `${BASE}/rankings?english_name=category&theme_id=2` },
  { label: "skin", url: `${BASE}/rankings?english_name=skin&theme_id=174` },
  { label: "age", url: `${BASE}/rankings?english_name=age&theme_id=1372` },
  { label: "brand", url: `${BASE}/rankings?english_name=brand&theme_id=2058` },
];

async function probe(page: Page, label: string, url: string) {
  // 화해 자체 도메인 GET 요청만 수집
  const hwahaeRequests: Array<{ method: string; status: number | null; url: string }> = [];
  const onReq = (req: import("playwright").Request) => {
    const u = req.url();
    if (u.includes("hwahae") && !u.includes("analytics")) {
      hwahaeRequests.push({ method: req.method(), status: null, url: u });
    }
  };
  const onRes = (res: Response) => {
    const u = res.url();
    const m = hwahaeRequests.find((r) => r.url === u && r.status === null);
    if (m) m.status = res.status();
  };
  page.on("request", onReq);
  page.on("response", onRes);

  let httpStatus: number | null = null;
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    httpStatus = resp?.status() ?? null;
  } catch (e) {
    console.error(`  nav error: ${(e as Error).message}`);
  }

  // 추가 대기 — 혹시 lazy hydration
  await new Promise((r) => setTimeout(r, 3000));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 2000));

  const dom = await page.evaluate(() => {
    // 1. 모든 <a> href prefix 집계 (host + path 1단계)
    const allAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const prefixCount = new Map<string, number>();
    const examples = new Map<string, string>();
    for (const a of allAnchors) {
      const href = a.getAttribute("href") || "";
      const firstSeg = href.startsWith("http")
        ? new URL(href).pathname.split("/").slice(0, 3).join("/")
        : href.split("?")[0].split("/").slice(0, 3).join("/");
      prefixCount.set(firstSeg, (prefixCount.get(firstSeg) || 0) + 1);
      if (!examples.has(firstSeg)) examples.set(firstSeg, href);
    }
    const prefixTop = Array.from(prefixCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([p, c]) => ({ prefix: p, count: c, example: examples.get(p) }));

    // 2. __NEXT_DATA__ 존재 여부 + 크기
    const nextScript = document.querySelector("script#__NEXT_DATA__");
    const nextJson = nextScript?.textContent || "";
    let nextParsed: unknown = null;
    try {
      nextParsed = nextJson ? JSON.parse(nextJson) : null;
    } catch {}

    // 3. __NEXT_DATA__ 에서 상품처럼 보이는 키 path 수집
    const foundPaths: Array<{ path: string; keys: string[]; sample: unknown }> = [];
    const seenObjects = new WeakSet<object>();
    const walk = (node: unknown, path: string, depth: number) => {
      if (depth > 8 || !node || typeof node !== "object") return;
      if (seenObjects.has(node as object)) return;
      seenObjects.add(node as object);
      if (Array.isArray(node)) {
        if (node.length > 0 && typeof node[0] === "object" && node[0] !== null) {
          const first = node[0] as Record<string, unknown>;
          const ks = Object.keys(first);
          // 상품 같은 객체: rating/review/brand/product/goods 키 포함
          const score = ks.filter((k) =>
            /rating|review|brand|product|goods|name|rank/i.test(k),
          ).length;
          if (score >= 3 && node.length >= 3) {
            foundPaths.push({ path: `${path}[]`, keys: ks, sample: first });
          }
        }
        node.slice(0, 30).forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
      } else {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          walk(v, path ? `${path}.${k}` : k, depth + 1);
        }
      }
    };
    if (nextParsed) walk(nextParsed, "", 0);

    // 4. 페이지 텍스트 샘플 (어떤 컨텐츠가 실제로 렌더됐는지)
    const bodyTextSample = (document.body.innerText || "").slice(0, 2000);

    // 5. H1/H2 헤딩 모음
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 15)
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 80),
      }));

    return {
      anchorCount: allAnchors.length,
      prefixTop,
      nextDataSize: nextJson.length,
      nextDataProductPaths: foundPaths.slice(0, 8),
      bodyTextSample,
      headings,
    };
  });

  page.off("request", onReq);
  page.off("response", onRes);

  return {
    label,
    url,
    httpStatus,
    title: await page.title(),
    hwahaeRequests: hwahaeRequests.slice(0, 30),
    ...dom,
  };
}

async function main() {
  const session = await launchChrome();
  const { page, cleanup } = session;

  // tsx/esbuild 가 evaluate 콜백에 __name(fn, label) 래퍼를 주입하는데
  // 브라우저 컨텍스트엔 그 함수가 없어서 ReferenceError 가 난다. 동일명 shim 주입.
  await page.addInitScript(() => {
    // @ts-expect-error - runtime shim
    if (typeof globalThis.__name === "undefined") globalThis.__name = (fn) => fn;
  });

  try {
    const results = [];
    for (const t of TARGETS) {
      console.log(`[probe] ${t.label} ${t.url}`);
      const r = await probe(page, t.label, t.url);
      console.log(
        `   status=${r.httpStatus} anchors=${r.anchorCount} nextDataSize=${r.nextDataSize} productPaths=${r.nextDataProductPaths.length}`,
      );
      results.push(r);
    }

    const outDir = resolve(process.cwd(), ".omc/research");
    mkdirSync(outDir, { recursive: true });
    const out = resolve(outDir, "hwahae-phase0b.json");
    writeFileSync(
      out,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), results },
        null,
        2,
      ),
      "utf-8",
    );
    console.log(`\n✅ saved → ${out}`);
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
