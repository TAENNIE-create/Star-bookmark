"use client";

import { useEffect } from "react";
import { CosmicBackground } from "./cosmic-background";
import { CosmicFrame } from "./cosmic-frame";
import { ARCHIVE_UNLOCKED_KEY } from "../../lib/archive-unlock";
import { getAppStorage } from "../../lib/app-storage";

const REPORT_BY_DATE_KEY = "arisum-report-by-date";

type CosmicLayoutWrapperProps = {
  children: React.ReactNode;
};

/** 배경(별가루·그라데이션·별똥별) + 레이아웃 래퍼 전역 적용. 일회성 별조각 보너스 제거 → 초기 30부터. */
export function CosmicLayoutWrapper({ children }: CosmicLayoutWrapperProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = getAppStorage();

    if (!storage.getItem("arisum-one-time-cancel-20260202-202601")) {
      const rawReport = storage.getItem(REPORT_BY_DATE_KEY);
      if (rawReport) {
        const report = JSON.parse(rawReport) as Record<string, unknown>;
        delete report["2026-02-02"];
        storage.setItem(REPORT_BY_DATE_KEY, JSON.stringify(report));
        window.dispatchEvent(new Event("report-updated"));
      }
      const rawArchive = storage.getItem(ARCHIVE_UNLOCKED_KEY);
      if (rawArchive) {
        const data = JSON.parse(rawArchive) as { months?: string[] };
        const months = Array.isArray(data.months) ? data.months.filter((m) => m !== "2026-01") : [];
        storage.setItem(ARCHIVE_UNLOCKED_KEY, JSON.stringify({ months }));
      }
      storage.setItem("arisum-one-time-cancel-20260202-202601", "1");
    }
  }, []);

  return (
    <div className="relative min-h-screen">
      <CosmicBackground />
      <div className="relative z-10 flex justify-center min-h-screen">
        <CosmicFrame className="w-full max-w-md min-h-screen flex flex-col bg-transparent">
          {children}
        </CosmicFrame>
      </div>
    </div>
  );
}
