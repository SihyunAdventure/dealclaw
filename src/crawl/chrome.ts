import { spawn, type ChildProcess } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium, type Browser, type Page } from "playwright";

const CHROME_BIN =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome";

const IS_LINUX = process.platform === "linux";

interface ChromeSession {
  browser: Browser;
  page: Page;
  cleanup: () => void;
}

interface LaunchOptions {
  headless?: boolean;
  /**
   * headful 유지하되 창을 화면 밖으로 보내 UX 방해를 없앰.
   * headless는 Cloudflare Turnstile 통과 불가라 올영에서 쓸 수 없음 — offScreen 이 대안.
   */
  offScreen?: boolean;
}

async function waitForCdp(port: number, maxMs = 30_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `CDP not ready on port ${port} within ${maxMs}ms (last err: ${String(lastErr)})`,
  );
}

export async function launchChrome(
  options: LaunchOptions = {},
): Promise<ChromeSession> {
  const port = 9450 + Math.floor(Math.random() * 50);
  const tmpDir = `/tmp/hotinbeauty-crawl-${Date.now()}`;

  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Linux (특히 root + EC2) 에서 sandbox 없이 Chrome은 silent fail.
  // /dev/shm 작은 환경에서 crash 방지: --disable-dev-shm-usage
  const linuxFlags = IS_LINUX
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];

  // `--headless=new` 는 Chrome 112+ 의 full-browser headless 모드.
  // Cloudflare/봇 방어 탐지 회피 flag 를 함께 적용:
  //   --disable-blink-features=AutomationControlled — navigator.webdriver=true 숨김
  //   --disable-features=AutomationControlled
  //   user-agent override — HeadlessChrome 문자열 제거
  // 주의: Akamai BM(쿠팡)은 headless 탐지 가능성 높음 — 쿠팡 호출은 headful(기본) 유지.
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const headlessFlags = options.headless
    ? [
        "--headless=new",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=AutomationControlled",
        `--user-agent=${UA}`,
        "--lang=ko-KR",
        `--window-size=1440,900`,
      ]
    : [];

  // Off-screen: 창은 뜨지만 화면 밖(far negative X)으로 밀어 사용자 방해 최소화.
  // macOS 전용. Linux/EC2 에서는 Xvfb 가상 디스플레이(1440x900) 안쪽이라
  // --window-position=-2400 주면 렌더 영역 밖이 되므로 offScreen 무시.
  const offScreenFlags =
    options.offScreen && !options.headless && !IS_LINUX
      ? ["--window-position=-2400,-100", "--window-size=1200,900"]
      : [];

  const proc: ChildProcess = spawn(
    CHROME_BIN,
    [
      `--user-data-dir=${tmpDir}`,
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      ...linuxFlags,
      ...headlessFlags,
      ...offScreenFlags,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let stderrBuf = "";
  proc.stderr?.on("data", (d) => {
    const s = String(d);
    stderrBuf += s;
    if (s.includes("FATAL") || s.includes("CRITICAL")) {
      process.stderr.write(`[chrome] ${s}`);
    }
  });
  proc.on("exit", (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(
        `[chrome] exited early code=${code}\n${stderrBuf.slice(-500)}\n`,
      );
    }
  });

  // Chrome + CDP ready 까지 폴링 (고정 sleep 대신)
  await waitForCdp(port);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
    timeout: 15000,
  });
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = ctx.pages()[0] || (await ctx.newPage());

  if (options.headless) {
    // navigator.webdriver 제거, chrome runtime fake — Cloudflare JS challenge 가
    // automation signature 탐지 시 무한 루프 걸리는 것을 방지.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // chrome object 가 비어있으면 봇 신호 — 최소 stub.
      // @ts-expect-error
      window.chrome = window.chrome || { runtime: {} };
      Object.defineProperty(navigator, "languages", {
        get: () => ["ko-KR", "ko", "en-US", "en"],
      });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
    });
  }

  const cleanup = () => {
    try {
      proc.kill("SIGTERM");
    } catch {}
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  };

  return { browser, page, cleanup };
}
