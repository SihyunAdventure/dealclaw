// SIH-566 Phase 0 탐색 스파이크.
// 화해 /rankings 각 theme, /awards/home 을 Playwright 로 열어
// DOM 필드 · 네비게이션 구조 · 페이지네이션 · 네트워크 요청을 JSON 으로 덤프한다.
// 결과: .omc/research/hwahae-phase0.json + hwahae-phase0.md

import { launchChrome } from "../crawl/chrome";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Page, Request, Response } from "playwright";

const BASE = "https://www.hwahae.co.kr";
const THEMES = ["trending", "category", "skin", "age", "brand"] as const;

interface NetworkEvent {
  url: string;
  method: string;
  status: number | null;
  resourceType: string;
  ok: boolean;
}

interface PageProbe {
  label: string;
  url: string;
  urlAfterNav: string;
  httpStatus: number | null;
  title: string;
  error: string | null;
  navTabs: Array<{
    text: string;
    href: string | null;
    classList: string[];
    isActive: boolean;
  }>;
  subFilters: Array<{
    type: string;
    text: string;
    value: string | null;
    dataAttrs: Record<string, string>;
  }>;
  rankingCardCount: number;
  rankingCardsSample: Array<Record<string, unknown>>;
  pagination: {
    loadMoreButtonText: string | null;
    hasInfiniteScroll: boolean;
    countBeforeScroll: number;
    countAfterScroll: number;
  };
  apiRequests: NetworkEvent[]; // api.hwahae.* / graphql / json 응답만
}

async function probe(page: Page, label: string, url: string): Promise<PageProbe> {
  const apiRequests: NetworkEvent[] = [];
  const onRequest = (req: Request) => {
    const u = req.url();
    if (
      u.includes("api.hwahae") ||
      u.includes("graphql") ||
      u.includes("/api/") ||
      u.includes(".json")
    ) {
      apiRequests.push({
        url: u,
        method: req.method(),
        status: null,
        resourceType: req.resourceType(),
        ok: false,
      });
    }
  };
  const onResponse = (res: Response) => {
    const u = res.url();
    const match = apiRequests.find((r) => r.url === u && r.status === null);
    if (match) {
      match.status = res.status();
      match.ok = res.ok();
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  let httpStatus: number | null = null;
  let error: string | null = null;
  try {
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    httpStatus = resp?.status() ?? null;
    await new Promise((r) => setTimeout(r, 2500)); // SPA hydrate
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const title = await page.title().catch(() => "");
  const urlAfterNav = page.url();

  // 네비 탭: 상단 theme 네비 + 서브 카테고리 필터
  const [navTabs, subFilters, rankingCards, loadMoreText] = await Promise.all([
    extractNavTabs(page),
    extractSubFilters(page),
    extractRankingCards(page),
    extractLoadMore(page),
  ]);

  // 페이지네이션 실측: 스크롤 전/후 카드 수 비교
  const countBefore = rankingCards.length;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 1500));
  const countAfter = await countRankingCards(page);

  page.off("request", onRequest);
  page.off("response", onResponse);

  return {
    label,
    url,
    urlAfterNav,
    httpStatus,
    title,
    error,
    navTabs,
    subFilters,
    rankingCardCount: countBefore,
    rankingCardsSample: rankingCards.slice(0, 3),
    pagination: {
      loadMoreButtonText: loadMoreText,
      hasInfiniteScroll: countAfter > countBefore,
      countBeforeScroll: countBefore,
      countAfterScroll: countAfter,
    },
    apiRequests: apiRequests.slice(0, 40),
  };
}

async function extractNavTabs(page: Page) {
  return page
    .evaluate(() => {
      const out: Array<{
        text: string;
        href: string | null;
        classList: string[];
        isActive: boolean;
      }> = [];
      const anchors = document.querySelectorAll("a[href*='english_name']");
      anchors.forEach((el) => {
        const a = el as HTMLAnchorElement;
        const cls = Array.from(a.classList);
        out.push({
          text: (a.textContent || "").trim().slice(0, 60),
          href: a.getAttribute("href"),
          classList: cls,
          isActive:
            cls.some((c) => /active|selected|on/.test(c)) ||
            a.getAttribute("aria-selected") === "true",
        });
      });
      return out.slice(0, 30);
    })
    .catch(() => []);
}

async function extractSubFilters(page: Page) {
  return page
    .evaluate(() => {
      const out: Array<{
        type: string;
        text: string;
        value: string | null;
        dataAttrs: Record<string, string>;
      }> = [];

      // 공통 버튼/칩/옵션 후보
      const sels = [
        "button[data-theme-id]",
        "button[data-category]",
        "button[data-value]",
        "li[data-theme-id]",
        "li[data-category]",
        "option",
        "[role='tab']",
        "[role='option']",
      ];
      for (const sel of sels) {
        const els = document.querySelectorAll(sel);
        els.forEach((el) => {
          const attrs: Record<string, string> = {};
          for (const a of Array.from(el.attributes)) {
            if (a.name.startsWith("data-") || a.name === "value")
              attrs[a.name] = a.value;
          }
          out.push({
            type: sel,
            text: (el.textContent || "").trim().slice(0, 40),
            value: (el as HTMLElement).getAttribute("value"),
            dataAttrs: attrs,
          });
        });
      }
      // 중복 제거 (text+type 기준)
      const seen = new Set<string>();
      return out.filter((x) => {
        const key = `${x.type}|${x.text}|${JSON.stringify(x.dataAttrs)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .catch(() => []);
}

async function extractRankingCards(page: Page) {
  return page
    .evaluate(() => {
      // 화해 랭킹 카드 후보: /goods/ 링크를 품은 section/li/a 단위
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href*='/goods/']"),
      );
      const uniq = new Map<string, HTMLAnchorElement>();
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!uniq.has(href)) uniq.set(href, a);
      }
      return Array.from(uniq.values())
        .slice(0, 20)
        .map((a) => {
          const card = (a.closest("li") ||
            a.closest("article") ||
            a.closest("section") ||
            a.closest("div")) as HTMLElement | null;
          const scope = card || a;
          const img = scope.querySelector<HTMLImageElement>("img");

          // 숫자·별점 후보 텍스트 전수 수집
          const textBlocks = Array.from(scope.querySelectorAll("*"))
            .map((el) => ({
              tag: el.tagName.toLowerCase(),
              cls: (el as HTMLElement).className?.toString()?.slice(0, 80) || "",
              text: (el.textContent || "").trim().slice(0, 60),
            }))
            .filter((x) => x.text.length > 0 && x.text.length < 60)
            .slice(0, 40);

          // href 에서 product_id
          const href = a.getAttribute("href") || "";
          const idMatch = href.match(/\/goods\/[^/]+\/(\d+)/);

          // 모든 attr 덤프
          const anchorAttrs: Record<string, string> = {};
          for (const at of Array.from(a.attributes))
            anchorAttrs[at.name] = at.value;

          return {
            href,
            productId: idMatch ? idMatch[1] : null,
            anchorAttrs,
            imgSrc: img?.src || null,
            imgAlt: img?.alt || null,
            textBlocks,
            rawHtmlSample: scope.outerHTML.slice(0, 1500),
          };
        });
    })
    .catch(() => []);
}

async function countRankingCards(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const anchors = document.querySelectorAll<HTMLAnchorElement>(
        "a[href*='/goods/']",
      );
      const set = new Set<string>();
      anchors.forEach((a) => set.add(a.getAttribute("href") || ""));
      return set.size;
    })
    .catch(() => 0);
}

async function extractLoadMore(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"));
      const candidate = btns.find((el) => {
        const t = (el.textContent || "").trim();
        return /더보기|more|다음|load/i.test(t) && t.length < 20;
      });
      return candidate ? (candidate.textContent || "").trim() : null;
    })
    .catch(() => null);
}

async function probeAwards(page: Page): Promise<Record<string, unknown>> {
  const url = `${BASE}/awards/home`;
  let httpStatus: number | null = null;
  let error: string | null = null;
  try {
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    httpStatus = resp?.status() ?? null;
    await new Promise((r) => setTimeout(r, 2500));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const data = await page
    .evaluate(() => {
      const yearLinks = Array.from(
        document.querySelectorAll("a, button"),
      ).filter((el) => /20\d{2}/.test((el.textContent || "").trim()));
      const sections = Array.from(document.querySelectorAll("section, div"))
        .map((el) => ({
          heading:
            el.querySelector("h1,h2,h3")?.textContent?.trim()?.slice(0, 60) ||
            "",
          text: (el.textContent || "").trim().slice(0, 200),
        }))
        .filter((s) => s.heading)
        .slice(0, 20);
      const productLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href*='/goods/']"),
      )
        .slice(0, 10)
        .map((a) => a.getAttribute("href"));
      const bodyText = document.body.innerText.slice(0, 3000);
      return {
        yearCandidates: yearLinks.slice(0, 10).map((el) => ({
          text: (el.textContent || "").trim().slice(0, 40),
          href: (el as HTMLAnchorElement).getAttribute("href"),
        })),
        sections,
        productLinkSample: productLinks,
        bodyTextSample: bodyText,
      };
    })
    .catch(() => ({}));

  return { url, httpStatus, error, title: await page.title(), ...data };
}

async function main() {
  const session = await launchChrome();
  const { page, cleanup } = session;

  try {
    // 기본 UA 는 headful Chrome UA 그대로. Cloudflare/Akamai 우회는 기존 패턴.
    const probes: PageProbe[] = [];
    for (const theme of THEMES) {
      const url = `${BASE}/rankings?english_name=${theme}`;
      console.log(`[probe] ${theme}`);
      const p = await probe(page, theme, url);
      probes.push(p);
      console.log(
        `   status=${p.httpStatus} title="${p.title.slice(0, 40)}" cards=${p.rankingCardCount} → afterScroll=${p.pagination.countAfterScroll}`,
      );
    }

    console.log(`[probe] awards/home`);
    const awards = await probeAwards(page);

    const outDir = resolve(process.cwd(), ".omc/research");
    mkdirSync(outDir, { recursive: true });

    const jsonPath = resolve(outDir, "hwahae-phase0.json");
    writeFileSync(
      jsonPath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), probes, awards },
        null,
        2,
      ),
      "utf-8",
    );

    const md = renderMarkdown(probes, awards);
    writeFileSync(resolve(outDir, "hwahae-phase0.md"), md, "utf-8");

    console.log(`\n✅ saved → ${jsonPath}`);
  } finally {
    cleanup();
  }
}

function renderMarkdown(
  probes: PageProbe[],
  awards: Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push("# 화해 Phase 0 탐색 결과");
  lines.push(`생성: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## /rankings 테마별 요약");
  lines.push("");
  lines.push(
    "| theme | HTTP | title | 카드수 | 스크롤후 | 무한스크롤 | 더보기 |",
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of probes) {
    lines.push(
      `| ${p.label} | ${p.httpStatus ?? "-"} | ${p.title.slice(0, 30)} | ${p.rankingCardCount} | ${p.pagination.countAfterScroll} | ${p.pagination.hasInfiniteScroll ? "Y" : "N"} | ${p.pagination.loadMoreButtonText ?? "-"} |`,
    );
  }

  lines.push("");
  lines.push("## 네비 탭 (최초 발견)");
  const firstTabs = probes[0]?.navTabs.slice(0, 10) ?? [];
  for (const t of firstTabs) {
    lines.push(`- ${t.text} → \`${t.href}\` active=${t.isActive}`);
  }

  lines.push("");
  lines.push("## 카테고리 서브필터 힌트 (theme=category)");
  const catProbe = probes.find((p) => p.label === "category");
  if (catProbe) {
    for (const f of catProbe.subFilters.slice(0, 30)) {
      lines.push(
        `- [${f.type}] "${f.text}" data=${JSON.stringify(f.dataAttrs)}`,
      );
    }
  }

  lines.push("");
  lines.push("## 랭킹 카드 필드 (trending 상위 3)");
  const trend = probes.find((p) => p.label === "trending");
  if (trend) {
    for (const c of trend.rankingCardsSample) {
      lines.push("---");
      lines.push(`href: ${(c as { href: string }).href}`);
      lines.push(`productId: ${(c as { productId: string }).productId}`);
      const blocks = (
        c as { textBlocks: Array<{ text: string }> }
      ).textBlocks?.slice(0, 15) as Array<{
        tag: string;
        cls: string;
        text: string;
      }>;
      for (const b of blocks || []) {
        lines.push(`  - <${b.tag}.${b.cls}> "${b.text}"`);
      }
    }
  }

  lines.push("");
  lines.push("## API 요청 힌트 (trending)");
  if (trend) {
    for (const r of trend.apiRequests.slice(0, 20)) {
      lines.push(`- ${r.method} ${r.status ?? "?"} ${r.url}`);
    }
  }

  lines.push("");
  lines.push("## /awards/home");
  lines.push(
    `HTTP=${(awards as { httpStatus: number }).httpStatus} title="${(awards as { title: string }).title}"`,
  );
  const years = (awards as { yearCandidates: Array<{ text: string; href: string }> })
    .yearCandidates;
  if (years) {
    for (const y of years) lines.push(`- 연도 후보: "${y.text}" → ${y.href}`);
  }

  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
