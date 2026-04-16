import { randomUUID } from "node:crypto";

export type CrawlPlatform = "coupang" | "oliveyoung" | "hwahae";
export type CrawlLogLevel = "info" | "warn" | "error";

export interface CrawlLogger {
  runId: string;
  platform: CrawlPlatform;
  event: (
    level: CrawlLogLevel,
    event: string,
    details?: Record<string, unknown>,
  ) => void;
}

export function createCrawlLogger(platform: CrawlPlatform): CrawlLogger {
  const runId = randomUUID();

  return {
    runId,
    platform,
    event(level, event, details = {}) {
      const payload = JSON.stringify({
        ts: new Date().toISOString(),
        runId,
        platform,
        event,
        ...details,
      });

      if (level === "error") {
        console.error(`[crawl:${level}] ${payload}`);
        return;
      }
      if (level === "warn") {
        console.warn(`[crawl:${level}] ${payload}`);
        return;
      }
      console.log(`[crawl:${level}] ${payload}`);
    },
  };
}
