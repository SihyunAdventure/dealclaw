"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PlatformKey = "coupang" | "oliveyoung";

interface PlatformTabsProps {
  coupang: ReactNode;
  oliveyoung: ReactNode;
  defaultPlatform?: PlatformKey;
}

const TABS: { key: PlatformKey; label: string }[] = [
  { key: "coupang", label: "쿠팡" },
  { key: "oliveyoung", label: "올리브영" },
];

export function PlatformTabs({
  coupang,
  oliveyoung,
  defaultPlatform = "coupang",
}: PlatformTabsProps) {
  const [active, setActive] = useState<PlatformKey>(defaultPlatform);

  return (
    <>
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <nav
          role="tablist"
          aria-label="플랫폼 필터"
          className="grid grid-cols-2"
        >
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`platform-panel-${tab.key}`}
                onClick={() => setActive(tab.key)}
                data-track="platform_tab_click"
                data-track-platform={tab.key}
                className={cn(
                  "relative min-h-[48px] text-sm transition-colors",
                  isActive
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground"
                  />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        id="platform-panel-coupang"
        role="tabpanel"
        aria-labelledby="platform-tab-coupang"
        hidden={active !== "coupang"}
      >
        {coupang}
      </div>
      <div
        id="platform-panel-oliveyoung"
        role="tabpanel"
        aria-labelledby="platform-tab-oliveyoung"
        hidden={active !== "oliveyoung"}
      >
        {oliveyoung}
      </div>
    </>
  );
}
