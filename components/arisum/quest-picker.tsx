"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MIDNIGHT_BLUE } from "../../lib/theme";
import { getAppStorage } from "../../lib/app-storage";

const DAILY_QUESTS_KEY = "dailyQuests";
const TODAY_QUESTS_KEY = "arisum-today-quests";
const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const MAX_DAILY_QUESTS = 3;

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodaySuggestedQuests(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const todayKey = getTodayKey();
    const raw = getAppStorage().getItem(TODAY_QUESTS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { date?: string; quests?: string[] };
      if (data.date === todayKey && Array.isArray(data.quests)) {
        return data.quests.slice(0, 5).filter(Boolean);
      }
    }
    const reportRaw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    if (reportRaw) {
      const reports: Record<string, { growthSeeds?: string[] }> = JSON.parse(reportRaw);
      const report = reports[todayKey];
      if (report?.growthSeeds?.length) {
        return report.growthSeeds.slice(0, 5).filter(Boolean);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function getDailyQuests(): { date: string; items: { id: string; label: string }[] } {
  if (typeof window === "undefined") return { date: getTodayKey(), items: [] };
  try {
    const raw = getAppStorage().getItem(DAILY_QUESTS_KEY);
    const data = raw ? JSON.parse(raw) : { date: getTodayKey(), items: [] };
    if (data.date !== getTodayKey()) return { date: getTodayKey(), items: [] };
    return { date: data.date, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { date: getTodayKey(), items: [] };
  }
}

function addQuestToDaily(label: string): boolean {
  if (typeof window === "undefined") return false;
  const current = getDailyQuests();
  if (current.items.length >= MAX_DAILY_QUESTS) return false;
  const id = `seed-${Date.now()}-${current.items.length}`;
  const next = { date: current.date, items: [...current.items, { id, label }] };
  getAppStorage().setItem(DAILY_QUESTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("dailyQuests-updated"));
  return true;
}

export function QuestPicker() {
  const [suggested, setSuggested] = useState<string[]>([]);
  const [pickedLabels, setPickedLabels] = useState<Set<string>>(new Set());

  const refresh = () => {
    setSuggested(getTodaySuggestedQuests());
    const { items } = getDailyQuests();
    setPickedLabels(new Set(items.map((q) => q.label)));
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener("dailyQuests-updated", onUpdate);
    return () => window.removeEventListener("dailyQuests-updated", onUpdate);
  }, []);

  const handlePick = (label: string) => {
    if (addQuestToDaily(label)) {
      setPickedLabels((prev) => new Set([...prev, label]));
    }
  };

  if (suggested.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-white shadow-sm px-4 py-3"
      >
        <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.16em] mb-2">
          오늘의 퀘스트 제안
        </p>
        <p className="text-xs text-[#64748B] leading-relaxed">
          오늘 일기를 쓰면 AI가 제안한 5개 퀘스트가 여기에 나타나요. 그중 3개를 골라 담을 수 있어요.
        </p>
      </motion.section>
    );
  }

  const currentCount = getDailyQuests().items.length;
  const canAdd = currentCount < MAX_DAILY_QUESTS;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
      className="rounded-3xl bg-white shadow-sm px-4 py-3"
    >
      <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.16em] mb-2">
        내일 이런 걸 해보는 건 어떨까요? (5개 중 3개 골라 담기)
      </p>
      <ul className="space-y-2">
        {suggested.map((label, i) => {
          const added = pickedLabels.has(label);
          const canAddThis = !added && canAdd;
          return (
            <motion.li
              key={`${i}-${label.slice(0, 20)}`}
              className="flex items-start justify-between gap-4"
              style={{ color: MIDNIGHT_BLUE }}
            >
              <span className="shrink-0 pt-0.5" aria-hidden>🌱</span>
              <span className="arisum-quest-label flex-1 min-w-0 pr-2">{label}</span>
              <button
                type="button"
                disabled={!canAddThis}
                onClick={() => handlePick(label)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  canAddThis
                    ? "bg-[#0F172A] text-white hover:opacity-90"
                    : added
                      ? "bg-[#E2E8F0] text-[#64748B] cursor-default"
                      : "bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed"
                }`}
              >
                {added ? "담음" : "담기"}
              </button>
            </motion.li>
          );
        })}
      </ul>
      {currentCount >= MAX_DAILY_QUESTS && (
        <p className="text-[10px] text-[#64748B] mt-2">오늘 담기는 3개까지예요.</p>
      )}
    </motion.section>
  );
}
