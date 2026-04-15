import { launchChrome } from "../crawl/chrome";
import { crawlOliveYoungRanking } from "../crawl/oliveyoung-ranking";

async function main() {
  const limitArg = process.argv
    .find((a) => a.startsWith("--limit="))
    ?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : 100;

  console.log(`\n=== Olive Young 베스트 랭킹 TOP ${limit} 테스트 ===\n`);

  const { browser, page, cleanup } = await launchChrome();

  try {
    const products = await crawlOliveYoungRanking(page, limit);
    console.log(`\n✅ ${products.length}개 상품 수집 완료\n`);

    products.forEach((p) => {
      const pctLabel = p.discountRate > 0 ? ` (-${p.discountRate}%)` : "";
      const orgLabel =
        p.originalPrice !== p.salePrice
          ? ` / 원가 ${p.originalPrice.toLocaleString()}원`
          : "";
      const rangeLabel = p.hasPriceRange ? " 💲가격대" : "";
      const todayLabel = p.isTodayDeal ? " 🔥오특" : "";
      const flagStr = p.flags.length > 0 ? ` [${p.flags.join(",")}]` : "";

      console.log(
        `  ${String(p.rank).padStart(2, "0")}. [${p.brand}] ${p.name.slice(0, 50)}${todayLabel}`,
      );
      console.log(
        `      💰 ${p.salePrice.toLocaleString()}원${orgLabel}${pctLabel}${rangeLabel}${flagStr}`,
      );
      console.log(`      🗂  ${p.categoryPath || "-"}`);
      console.log(`      🆔 ${p.productId} (dispCatNo=${p.dispCatNo || "-"})`);
      console.log(`      🔗 ${p.link.slice(0, 90)}`);
      console.log();
    });

    // Validation
    const issues: string[] = [];
    if (products.length !== limit)
      issues.push(`개수 ${products.length} ≠ ${limit}`);
    products.forEach((p) => {
      if (!p.name) issues.push(`rank ${p.rank}: name 비어있음`);
      if (!p.productId) issues.push(`rank ${p.rank}: productId 비어있음`);
      if (p.salePrice <= 0) issues.push(`rank ${p.rank}: salePrice ≤ 0`);
      if (!p.link.startsWith("https://")) issues.push(`rank ${p.rank}: link invalid`);
    });

    // rank 1..limit 연속성 체크
    const ranks = products.map((p) => p.rank).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] !== i + 1) {
        issues.push(`rank 불연속: index ${i} → rank ${ranks[i]} (기대 ${i + 1})`);
        break;
      }
    }

    if (issues.length > 0) {
      console.error("\n❌ 검증 실패:");
      issues.forEach((i) => console.error("   -", i));
      process.exit(1);
    }

    // 집계 요약
    const todayCount = products.filter((p) => p.isTodayDeal).length;
    const flagStats: Record<string, number> = {};
    products.forEach((p) =>
      p.flags.forEach((f) => {
        flagStats[f] = (flagStats[f] || 0) + 1;
      }),
    );
    console.log("📊 집계:");
    console.log(`   오특 상품: ${todayCount}개`);
    console.log(
      `   배지 분포: ${Object.entries(flagStats)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "-"}`,
    );
    console.log("\n✅ 모든 검증 통과");
  } catch (err) {
    console.error("\n❌ 실패:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
