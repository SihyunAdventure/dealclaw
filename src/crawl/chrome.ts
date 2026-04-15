import { spawn, type ChildProcess } from "child_process";
import { rmSync, mkdirSync } from "fs";
import { chromium, type Browser, type Page } from "playwright";

const CHROME_BIN =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome";

interface ChromeSession {
  browser: Browser;
  page: Page;
  cleanup: () => void;
}

export async function launchChrome(): Promise<ChromeSession> {
  const port = 9450 + Math.floor(Math.random() * 50);
  const tmpDir = `/tmp/hotinbeauty-crawl-${Date.now()}`;

  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const proc: ChildProcess = spawn(
    CHROME_BIN,
    [
      `--user-data-dir=${tmpDir}`,
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      // headful — Akamai BM bypass
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  proc.stderr?.on("data", (d) => {
    const s = String(d);
    if (s.includes("FATAL") || s.includes("CRITICAL")) {
      process.stderr.write(`[chrome] ${s}`);
    }
  });

  // Wait for Chrome + CDP ready
  await new Promise((r) => setTimeout(r, 5000));

  const browser = await chromium.connectOverCDP(`http://localhost:${port}`, {
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
