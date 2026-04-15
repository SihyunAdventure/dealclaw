// top 21~100 존재 여부 & 로드 메커니즘 실측.
// Playwright 로 페이지 열고 스크롤 → 상품 카드 DOM 증가 여부 + XHR endpoint 캡처.

import { launchChrome } from "../crawl/chrome";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Request, Response } from "playwright";

const URL =
  "https://www.hwahae.co.kr/rankings?english_name=category&theme_id=4";

async function main() {
  const { page, cleanup } = await launchChrome();
  await page.addInitScript(() => {
    // @ts-expect-error runtime shim
    if (typeof globalThis.__name === "undefined") globalThis.__name = (f) => f;
  });

  // XHR 캡처 (모든 hwahae 요청, static·analytics 제외)
  const xhr: Array<{
    method: string;
    url: string;
    status: number | null;
    contentType: string | null;
    bodySample: string | null;
  }> = [];
  const pendingByUrl = new Map<
    string,
    { method: string; started: number }
  >();
  page.on("request", (req: Request) => {
    const u = req.url();
    if (!u.includes("hwahae")) return;
    if (u.includes("static.hwahae") || u.includes("analytics")) return;
    if (u.match(/\.(png|jpe?g|webp|gif|woff2?|css|svg|ico)($|\?)/)) return;
    pendingByUrl.set(u, { method: req.method(), started: Date.now() });
  });
  page.on("response", async (res: Response) => {
    const u = res.url();
    if (!pendingByUrl.has(u)) return;
    const meta = pendingByUrl.get(u)!;
    const ct = res.headers()["content-type"] ?? null;
    let bodySample: string | null = null;
    if (ct?.includes("json")) {
      try {
        const body = await res.text();
        bodySample = body.slice(0, 300);
      } catch {
        // ignore
      }
    }
    xhr.push({
      method: meta.method,
      url: u,
      status: res.status(),
      contentType: ct,
      bodySample,
    });
  });

  console.log(`[goto] ${URL}`);
  await page.goto(URL, { waitUntil: "networkidle", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2000));

  async function countCards(): Promise<{ total: number; uniqHrefs: number }> {
    return page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll("a"),
      ) as HTMLAnchorElement[];
      const hrefs = anchors
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => h.includes("goods/"));
      return { total: hrefs.length, uniqHrefs: new Set(hrefs).size };
    });
  }

  // 1차 counts (scroll 전)
  const c0 = await countCards();
  console.log(`scroll 0: cards=${c0.total} unique=${c0.uniqHrefs}`);
  const steps: Array<{ step: number; total: number; uniq: number }> = [
    { step: 0, total: c0.total, uniq: c0.uniqHrefs },
  ];

  for (let i = 1; i <= 8; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 1200));
    const c = await countCards();
    steps.push({ step: i, total: c.total, uniq: c.uniqHrefs });
    console.log(`scroll ${i}: cards=${c.total} unique=${c.uniqHrefs}`);
  }

  // 결과 요약
  const growthDetected = steps[steps.length - 1].uniq > steps[0].uniq;
  const finalUniq = steps[steps.length - 1].uniq;

  // API 후보 추출
  const apiCandidates = xhr.filter(
    (r) =>
      r.contentType?.includes("json") &&
      (r.url.includes("ranking") ||
        r.url.includes("api") ||
        r.url.includes("goods")) &&
      !r.url.includes("_next/static"),
  );
  console.log(`\nXHR json with product-ish URL: ${apiCandidates.length}`);
  apiCandidates.slice(0, 20).forEach((r) =>
    console.log(`  ${r.status} ${r.method} ${r.url.slice(0, 160)}`),
  );

  const outDir = resolve(process.cwd(), ".omc/research");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "hwahae-exists.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        targetUrl: URL,
        cardSteps: steps,
        growthDetected,
        finalUniqueCards: finalUniq,
        topClaimedRank: 100,
        apiCandidates,
        xhrCount: xhr.length,
      },
      null,
      2,
    ),
    "utf-8",
  );

  console.log(
    `\n결론: top 21~100 ${growthDetected ? "**존재 확인**" : "**확인 불가** (스크롤해도 카드 증가 없음)"} (최종 unique=${finalUniq})`,
  );

  cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
