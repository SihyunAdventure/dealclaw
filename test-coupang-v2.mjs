import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function testCoupangCrawl() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  try {
    console.log('1️⃣ 쿠팡 메인 페이지 방문...');
    await page.goto('https://www.coupang.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const mainTitle = await page.title();
    console.log('📄 메인:', mainTitle);

    if (mainTitle.includes('Access Denied')) {
      console.log('❌ 메인 페이지 차단됨');
      await browser.close();
      return;
    }

    console.log('2️⃣ 검색바에 차돌박이 입력...');

    // Try to find and use the search input
    const searchSelectors = [
      '#headerSearchKeyword',
      'input.search-input',
      'input[name="q"]',
      'input[placeholder*="검색"]',
      '.header-search input',
      'input[type="search"]',
    ];

    let searchInput = null;
    for (const sel of searchSelectors) {
      searchInput = await page.$(sel);
      if (searchInput) {
        console.log(`   검색바 발견: ${sel}`);
        break;
      }
    }

    if (searchInput) {
      await searchInput.click();
      await page.waitForTimeout(500);
      await page.keyboard.type('차돌박이', { delay: 80 });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
    } else {
      console.log('   검색바 못 찾음, URL로 이동');
      await page.goto('https://www.coupang.com/np/search?q=%EC%B0%A8%EB%8F%8C%EB%B0%95%EC%9D%B4&channel=user&sorter=priceAsc', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }

    console.log('3️⃣ 검색 결과 로딩 대기...');
    await page.waitForTimeout(5000);

    const searchTitle = await page.title();
    console.log('📄 검색:', searchTitle);

    // Take screenshot to see what we got
    await page.screenshot({ path: 'coupang-search.png', fullPage: false });
    console.log('📸 검색결과 스크린샷: coupang-search.png');

    // Try to get the full HTML to understand the structure
    const pageHTML = await page.evaluate(() => {
      // Look for product containers with various possible selectors
      const possibleContainers = [
        '#productList',
        '.search-product-list',
        '[class*="ProductList"]',
        '[class*="product"]',
        'ul[class*="search"]',
        'main',
        '#contents',
      ];

      for (const sel of possibleContainers) {
        const el = document.querySelector(sel);
        if (el && el.children.length > 0) {
          return {
            selector: sel,
            childCount: el.children.length,
            firstChildTag: el.children[0]?.tagName,
            firstChildClasses: el.children[0]?.className,
            sample: el.innerHTML.substring(0, 2000),
          };
        }
      }

      // Fallback: look for any element with price-like content
      const allElements = document.querySelectorAll('*');
      const priceElements = [];
      for (const el of allElements) {
        if (el.textContent?.match(/\d{1,3}(,\d{3})+원/) && el.children.length < 3) {
          priceElements.push({
            tag: el.tagName,
            class: el.className,
            text: el.textContent.trim().substring(0, 100),
            parent: el.parentElement?.className,
          });
          if (priceElements.length >= 5) break;
        }
      }

      return {
        selector: 'NONE_FOUND',
        priceElements,
        bodyClasses: document.body.className,
        url: window.location.href,
        html: document.body.innerHTML.substring(0, 3000),
      };
    });

    console.log('\n📋 페이지 구조 분석:');
    console.log(JSON.stringify(pageHTML, null, 2).substring(0, 2000));

    // Now try to extract products with broader selectors
    const products = await page.evaluate(() => {
      const results = [];

      // Strategy 1: Look for links with product URLs
      const productLinks = document.querySelectorAll('a[href*="/products/"], a[href*="/vp/"]');

      for (const link of productLinks) {
        if (results.length >= 20) break;

        const container = link.closest('li') || link.closest('[class*="product"]') || link.parentElement;
        if (!container) continue;

        const text = container.textContent || '';
        const priceMatch = text.match(/(\d{1,3}(?:,\d{3})+)/);
        const nameEl = container.querySelector('[class*="name"], [class*="title"], [class*="Name"]');

        if (priceMatch) {
          results.push({
            name: nameEl?.textContent?.trim() || text.substring(0, 100).trim(),
            price: priceMatch[1],
            link: link.href || ('https://www.coupang.com' + link.getAttribute('href')),
          });
        }
      }

      // Strategy 2: If nothing found, look for any list items with prices
      if (results.length === 0) {
        const items = document.querySelectorAll('li');
        for (const item of items) {
          if (results.length >= 20) break;
          const text = item.textContent || '';
          const priceMatch = text.match(/(\d{1,3}(?:,\d{3})+)원/);
          const linkEl = item.querySelector('a[href*="coupang"]') || item.querySelector('a');

          if (priceMatch && text.length > 20 && text.length < 500) {
            results.push({
              name: text.replace(/\s+/g, ' ').trim().substring(0, 100),
              price: priceMatch[1],
              link: linkEl?.href || '',
            });
          }
        }
      }

      return results;
    });

    if (products.length > 0) {
      console.log(`\n✅ ${products.length}개 상품 발견!\n`);

      const sorted = products
        .map(p => ({
          ...p,
          priceNum: parseInt(p.price.replace(/,/g, '')),
        }))
        .sort((a, b) => a.priceNum - b.priceNum);

      console.log('=== 차돌박이 최저가 TOP 10 ===\n');
      sorted.slice(0, 10).forEach((p, i) => {
        console.log(`${i + 1}. ${p.name.substring(0, 60)}`);
        console.log(`   💰 ${p.price}원`);
        console.log(`   🔗 ${p.link.substring(0, 100)}`);
        console.log('');
      });
    } else {
      console.log('\n⚠️ 상품 추출 실패 - 스크린샷 확인 필요');
    }

    // Scroll and take another screenshot
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'coupang-search-scrolled.png', fullPage: false });
    console.log('📸 스크롤 후 스크린샷: coupang-search-scrolled.png');

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'coupang-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

testCoupangCrawl();
