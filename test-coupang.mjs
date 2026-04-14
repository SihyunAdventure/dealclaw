import { chromium } from 'playwright';

async function testCoupangCrawl() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    console.log('🔍 쿠팡에서 "차돌박이" 검색 중...');

    await page.goto('https://www.coupang.com/np/search?component=&q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=scoreDesc', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for search results
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('📄 Page title:', title);

    // Check if we got blocked
    const bodyText = await page.textContent('body');
    if (bodyText.includes('Access Denied') || bodyText.includes('차단')) {
      console.log('❌ 차단됨 - 쿠팡이 자동화를 감지했습니다');
      // Try screenshot anyway
      await page.screenshot({ path: 'coupang-blocked.png' });
      await browser.close();
      return;
    }

    // Extract product data
    const products = await page.evaluate(() => {
      const items = document.querySelectorAll('.search-product');
      const results = [];

      for (const item of items) {
        if (results.length >= 15) break;

        const nameEl = item.querySelector('.name');
        const priceEl = item.querySelector('.price-value');
        const linkEl = item.querySelector('a.search-product-link');
        const ratingEl = item.querySelector('.rating-star');
        const reviewEl = item.querySelector('.rating-total-count');
        const badgeEl = item.querySelector('.badge.rocket');

        if (nameEl && priceEl) {
          results.push({
            name: nameEl.textContent?.trim(),
            price: priceEl.textContent?.trim(),
            link: linkEl ? 'https://www.coupang.com' + linkEl.getAttribute('href') : null,
            rating: ratingEl ? ratingEl.getAttribute('style') : null,
            reviews: reviewEl ? reviewEl.textContent?.trim() : null,
            isRocket: !!badgeEl,
          });
        }
      }
      return results;
    });

    console.log(`\n✅ ${products.length}개 상품 발견!\n`);

    // Sort by price (lowest first)
    const sorted = products
      .map(p => ({
        ...p,
        priceNum: parseInt(p.price?.replace(/[^0-9]/g, '') || '0')
      }))
      .filter(p => p.priceNum > 0)
      .sort((a, b) => a.priceNum - b.priceNum);

    console.log('=== 차돌박이 최저가 TOP 10 ===\n');
    sorted.slice(0, 10).forEach((p, i) => {
      console.log(`${i + 1}. ${p.name}`);
      console.log(`   💰 ${p.price}원 | 🚀 로켓배송: ${p.isRocket ? 'Y' : 'N'} | ⭐ ${p.reviews || '-'}`);
      console.log(`   🔗 ${p.link?.substring(0, 80)}...`);
      console.log('');
    });

    await page.screenshot({ path: 'coupang-result.png', fullPage: false });
    console.log('📸 스크린샷 저장: coupang-result.png');

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'coupang-error.png' });
  } finally {
    await browser.close();
  }
}

testCoupangCrawl();
