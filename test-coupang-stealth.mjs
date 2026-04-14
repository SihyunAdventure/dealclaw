import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function testCoupangCrawl() {
  const browser = await chromium.launch({
    headless: false, // headed mode to bypass detection
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 720 },
  });

  // Remove webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    delete navigator.__proto__.webdriver;
  });

  const page = await context.newPage();

  try {
    console.log('🔍 쿠팡 메인 페이지 먼저 방문...');
    await page.goto('https://www.coupang.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const mainTitle = await page.title();
    console.log('📄 메인 페이지 title:', mainTitle);

    if (mainTitle.includes('Access Denied')) {
      console.log('❌ 메인 페이지도 차단됨');
      await page.screenshot({ path: 'coupang-main-blocked.png' });
      await browser.close();
      return;
    }

    console.log('🔍 차돌박이 검색 중...');
    // Use the search bar instead of direct URL
    const searchInput = await page.$('#headerSearchKeyword, input[name="q"], .search-input input');
    if (searchInput) {
      await searchInput.click();
      await page.keyboard.type('차돌박이', { delay: 100 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    } else {
      // Fallback to direct navigation
      await page.goto('https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }

    const searchTitle = await page.title();
    console.log('📄 검색 결과 title:', searchTitle);

    // Extract product data
    const products = await page.evaluate(() => {
      // Try multiple selectors
      const selectors = [
        '.search-product',
        '[class*="SearchProduct"]',
        'li.search-product',
        '#productList > li',
      ];

      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) break;
      }

      if (items.length === 0) {
        // Debug: return page structure
        return { debug: document.querySelector('#productList')?.innerHTML?.substring(0, 500) || document.body.innerHTML.substring(0, 1000) };
      }

      const results = [];
      for (const item of items) {
        if (results.length >= 15) break;

        const nameEl = item.querySelector('.name, .descriptions .name');
        const priceEl = item.querySelector('.price-value, .price .value');
        const linkEl = item.querySelector('a.search-product-link, a[href*="/products/"]');
        const imgEl = item.querySelector('img.search-product-wrap-img, img[src*="thumbnail"]');
        const rocketEl = item.querySelector('.badge.rocket, .rocket-logo');
        const ratingEl = item.querySelector('.rating-total-count');
        const unitPriceEl = item.querySelector('.unit-price');

        if (nameEl && priceEl) {
          results.push({
            name: nameEl.textContent?.trim(),
            price: priceEl.textContent?.trim(),
            link: linkEl ? linkEl.getAttribute('href') : null,
            image: imgEl ? imgEl.getAttribute('src') : null,
            isRocket: !!rocketEl,
            reviews: ratingEl ? ratingEl.textContent?.trim() : null,
            unitPrice: unitPriceEl ? unitPriceEl.textContent?.trim() : null,
          });
        }
      }
      return results;
    });

    if (products.debug) {
      console.log('⚠️ 상품 셀렉터를 못 찾음. 디버그:', products.debug.substring(0, 300));
      await page.screenshot({ path: 'coupang-debug.png', fullPage: false });
    } else if (Array.isArray(products) && products.length > 0) {
      console.log(`\n✅ ${products.length}개 상품 발견!\n`);

      const sorted = products
        .map(p => ({
          ...p,
          priceNum: parseInt(p.price?.replace(/[^0-9]/g, '') || '0'),
          link: p.link?.startsWith('http') ? p.link : 'https://www.coupang.com' + p.link,
        }))
        .filter(p => p.priceNum > 0)
        .sort((a, b) => a.priceNum - b.priceNum);

      console.log('=== 차돌박이 최저가 TOP 10 ===\n');
      sorted.slice(0, 10).forEach((p, i) => {
        console.log(`${i + 1}. ${p.name}`);
        console.log(`   💰 ${p.price}원 | 🚀 로켓: ${p.isRocket ? 'Y' : 'N'} | ⭐ ${p.reviews || '-'} | ${p.unitPrice || ''}`);
        console.log(`   🔗 ${p.link?.substring(0, 100)}`);
        console.log('');
      });

      await page.screenshot({ path: 'coupang-result.png', fullPage: false });
      console.log('📸 스크린샷 저장: coupang-result.png');
    } else {
      console.log('⚠️ 상품을 찾지 못했습니다');
      await page.screenshot({ path: 'coupang-empty.png', fullPage: false });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'coupang-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

testCoupangCrawl();
