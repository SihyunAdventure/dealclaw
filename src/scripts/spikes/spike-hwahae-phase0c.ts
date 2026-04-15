// SIH-566 Phase 0 스파이크 3차 — 최종 확정용.
// __NEXT_DATA__ 를 있는 그대로 꺼내서 저장 + 배열 길이/rank 필드 존재 여부 확인.

import { launchChrome } from "../crawl/chrome";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Page } from "playwright";

const BASE = "https://www.hwahae.co.kr";
const TARGETS = [
  { label: "trending", url: `${BASE}/rankings?english_name=trending&theme_id=5102` },
  { label: "category", url: `${BASE}/rankings?english_name=category&theme_id=2` },
  { label: "skin", url: `${BASE}/rankings?english_name=skin&theme_id=174` },
  { label: "age", url: `${BASE}/rankings?english_name=age&theme_id=1372` },
  { label: "brand", url: `${BASE}/rankings?english_name=brand&theme_id=2058` },
  { label: "awards", url: `${BASE}/awards/home` },
];

async function fetchNextData(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1500));

  const raw = await page.evaluate(() => {
    const s = document.querySelector("script#__NEXT_DATA__");
    return s?.textContent || "";
  });
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarize(pageProps: Record<string, unknown>) {
  const out: Record<string, { type: string; length?: number; keys?: string[]; firstItemKeys?: string[] }> = {};
  for (const [k, v] of Object.entries(pageProps)) {
    if (Array.isArray(v)) {
      const firstKeys =
        v.length > 0 && typeof v[0] === "object" && v[0] !== null
          ? Object.keys(v[0] as Record<string, unknown>)
          : undefined;
      out[k] = { type: "array", length: v.length, firstItemKeys: firstKeys };
    } else if (v && typeof v === "object") {
      out[k] = {
        type: "object",
        keys: Object.keys(v as Record<string, unknown>).slice(0, 20),
      };
    } else {
      out[k] = { type: typeof v };
    }
  }
  return out;
}

async function main() {
  const session = await launchChrome();
  const { page, cleanup } = session;

  await page.addInitScript(() => {
    // @ts-expect-error runtime shim
    if (typeof globalThis.__name === "undefined") globalThis.__name = (fn) => fn;
  });

  try {
    const outDir = resolve(process.cwd(), ".omc/research");
    mkdirSync(outDir, { recursive: true });
    mkdirSync(resolve(outDir, "nextdata"), { recursive: true });

    const summaries: Record<string, unknown> = {};

    for (const t of TARGETS) {
      console.log(`[fetch] ${t.label}`);
      const nd = await fetchNextData(page, t.url);
      if (!nd) {
        console.log(`   → 파싱 실패`);
        continue;
      }
      // 원본 저장
      writeFileSync(
        resolve(outDir, "nextdata", `${t.label}.json`),
        JSON.stringify(nd, null, 2),
        "utf-8",
      );
      const pp = (nd?.props?.pageProps ?? {}) as Record<string, unknown>;
      summaries[t.label] = summarize(pp);

      // rank 필드 존재 여부 빠르게 확인
      const details =
        (pp.rankingProducts as { data?: { details?: unknown[] } } | undefined)
          ?.data?.details;
      if (Array.isArray(details) && details.length > 0) {
        const first = details[0] as Record<string, unknown>;
        const allKeys = new Set<string>();
        for (const d of details)
          for (const k of Object.keys(d as Record<string, unknown>))
            allKeys.add(k);
        console.log(
          `   details len=${details.length} keys=[${Array.from(allKeys).join(",")}]`,
        );
      } else {
        console.log(`   (no rankingProducts.data.details)`);
      }

      // rankings 메타 전체 — theme 목록 확보
      const rankings = pp.rankings as unknown;
      if (Array.isArray(rankings)) {
        console.log(`   rankings meta len=${rankings.length}`);
      }
    }

    writeFileSync(
      resolve(outDir, "hwahae-phase0c-summary.json"),
      JSON.stringify(summaries, null, 2),
      "utf-8",
    );
    console.log(`\n✅ saved → ${outDir}/nextdata/*.json + summary`);
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
