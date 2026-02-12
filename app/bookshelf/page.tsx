"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import { SKY_WHITE, MIDNIGHT_BLUE, LU_ICON, LU_LABEL } from "../../lib/theme";
import { getAppStorage } from "../../lib/app-storage";

const LU_KEY = "arisum-aria";
const REPORT_BY_DATE_KEY = "arisum-report-by-date";

function getStoredLu(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(LU_KEY);
    return raw ? Math.max(0, parseInt(raw, 10)) : 0;
  } catch {
    return 0;
  }
}

function getReportDates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    const data: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    return Object.keys(data).sort().reverse();
  } catch {
    return [];
  }
}

/** 월별로 묶기 */
function groupByMonth(dates: string[]): { yearMonth: string; dates: string[] }[] {
  const map = new Map<string, string[]>();
  for (const d of dates) {
    const ym = d.slice(0, 7);
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym)!.push(d);
  }
  return Array.from(map.entries())
    .map(([yearMonth, dates]) => ({ yearMonth, dates: dates.sort().reverse() }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}

const LU_PER_BOOK = 10;

export default function BookshelfPage() {
  const router = useRouter();
  const [lu, setLu] = useState(0);
  const [reportDates, setReportDates] = useState<string[]>([]);

  useEffect(() => {
    setLu(getStoredLu());
    setReportDates(getReportDates());
  }, []);

  const byMonth = groupByMonth(reportDates);

  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: SKY_WHITE }}>
      <div className="w-full max-w-md min-h-screen flex flex-col">
        <div className="h-12" />
        <header className="flex items-center justify-between mb-4 px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: MIDNIGHT_BLUE }}>
              기록함
            </h1>
            <p className="text-xs text-[#64748B]">월간 리포트가 책으로 꽂혀요</p>
          </div>
        </header>

        <main className="flex-1 px-6 overflow-y-auto arisum-pb-tab-safe">
          <p className="text-xs text-[#64748B] mb-4">
            별조각을 모으면 과거 월간 기록집을 책으로 열람할 수 있어요.
          </p>
          {byMonth.length === 0 ? (
            <div className="rounded-3xl bg-white border border-[#E2E8F0] shadow-sm p-8 text-center">
              <p className="text-sm text-[#64748B]">아직 꽂힌 책이 없어요.</p>
              <p className="text-xs text-[#64748B] mt-2">일기를 쓰고 퀘스트를 완료하면 별조각이 쌓여요.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {byMonth.map(({ yearMonth, dates }, idx) => {
                const [y, m] = yearMonth.split("-");
                const monthLabel = `${y}년 ${parseInt(m, 10)}월`;
                const neededLu = (idx + 1) * LU_PER_BOOK;
                const unlocked = lu >= neededLu;
                return (
                  <motion.section
                    key={yearMonth}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="rounded-3xl bg-white border border-[#E2E8F0] p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold" style={{ color: MIDNIGHT_BLUE }}>
                        {monthLabel}
                      </h2>
                      {!unlocked && (
                        <span className="text-[10px] text-[#64748B]">
                          {LU_ICON} {neededLu} {LU_LABEL} 필요
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dates.slice(0, 10).map((date) => (
                        <button
                          key={date}
                          type="button"
                          disabled={!unlocked}
                          onClick={() => unlocked && router.push(`/diary/${date}`)}
                          className={`w-10 h-12 rounded-lg border flex items-center justify-center text-[10px] font-medium transition-colors ${
                            unlocked
                              ? "border-[#0F172A]/20 hover:border-[#0F172A]/40 text-[#0F172A]"
                              : "border-[#E2E8F0] text-[#94A3B8] cursor-not-allowed"
                          }`}
                          style={unlocked ? { backgroundColor: "#F8FAFC" } : {}}
                        >
                          {parseInt(date.slice(8), 10)}
                        </button>
                      ))}
                    </div>
                    {dates.length > 10 && (
                      <p className="text-[10px] text-[#64748B] mt-2">+{dates.length - 10}일 더</p>
                    )}
                  </motion.section>
                );
              })}
            </div>
          )}
        </main>

        <TabBar
          activeKey="bookshelf"
          onChange={(key: TabKey) => {
            if (key === "home") router.push("/");
            if (key === "journal") router.push("/diary");
            if (key === "constellation") router.push("/constellation");
          }}
        />
      </div>
    </div>
  );
}
