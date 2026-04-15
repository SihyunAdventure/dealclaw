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

export async function launchChrome(): Promise<ChromeSession> {
  const port = 9450 + Math.floor(Math.random() * 50);
  const tmpDir = `/tmp/hotinbeauty-crawl-${Date.now()}`;

  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Linux (특히 root + EC2) 에서 sandbox 없이 Chrome은 silent fail.
  // /dev/shm 작은 환경에서 crash 방지: --disable-dev-shm-usage
  const linuxFlags = IS_LINUX
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
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
      // headful — Akamai BM bypass
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
