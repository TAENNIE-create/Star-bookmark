"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LU_ICON, MIDNIGHT_BLUE } from "../../lib/theme";
import {
  getLuBalance,
  setLuBalance,
  getTodayQuestLuEarned,
  addTodayQuestLuEarned,
  subtractTodayQuestLuEarned,
  LU_PER_QUEST_COMPLETE,
  MAX_DAILY_QUEST_LU,
} from "../../lib/lu-balance";
import { getQuestsForDate } from "../../lib/quest-storage";
import { getAppStorage } from "../../lib/app-storage";

const DAILY_QUESTS_DONE_KEY = "arisum-daily-quests-done";
const DEEP_GOLD = "#B8860B";

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** quests_for_YYYY-MM-DD 키로 저장된 퀘스트 읽기 */

function getDailyQuestsDone(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(DAILY_QUESTS_DONE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (data.date !== getTodayKey()) return {};
    return data.quests ?? {};
  } catch {
    return {};
  }
}

function setDailyQuestDone(questId: string, done: boolean) {
  if (typeof window === "undefined") return;
  const raw = getAppStorage().getItem(DAILY_QUESTS_DONE_KEY);
  const data = raw ? JSON.parse(raw) : { date: getTodayKey(), quests: {} };
  if (data.date !== getTodayKey()) data.quests = {};
  data.date = getTodayKey();
  data.quests[questId] = done;
  getAppStorage().setItem(DAILY_QUESTS_DONE_KEY, JSON.stringify(data));
}

type QuestTab = "today" | "tomorrow";

export function QuestCard() {
  /** 오늘의 퀘스트 = getTodayKey()로 저장된 3개, 내일의 퀘스트 = getTomorrowKey()로 저장된 3개 */
  const [todayQuests, setTodayQuests] = useState<{ id: string; label: string }[]>([]);
  const [tomorrowQuests, setTomorrowQuests] = useState<{ id: string; label: string }[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [luAnimKey, setLuAnimKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QuestTab>("today");

  const refresh = () => {
    setTodayQuests(getQuestsForDate(getTodayKey()));
    setTomorrowQuests(getQuestsForDate(getTomorrowKey()));
    setDone(getDailyQuestsDone());
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener("dailyQuests-updated", onUpdate);
    return () => window.removeEventListener("dailyQuests-updated", onUpdate);
  }, []);

  const handleToggle = (questId: string, checked: boolean) => {
    const earned = getTodayQuestLuEarned();
    if (checked) {
      if (earned >= MAX_DAILY_QUEST_LU) return; // 하루 최대 별조각 60개
      addTodayQuestLuEarned(LU_PER_QUEST_COMPLETE);
      setLuBalance(getLuBalance() + LU_PER_QUEST_COMPLETE);
    } else {
      subtractTodayQuestLuEarned(LU_PER_QUEST_COMPLETE);
      setLuBalance(Math.max(0, getLuBalance() - LU_PER_QUEST_COMPLETE));
    }
    setDone((prev) => ({ ...prev, [questId]: checked }));
    setDailyQuestDone(questId, checked);
    if (checked) {
      setLuAnimKey(`${questId}-${Date.now()}`);
      setTimeout(() => setLuAnimKey(null), 1200);
    }
  };

  return (
    <section className="relative w-full flex flex-col">
      <AnimatePresence>
        {luAnimKey && (
          <motion.div
            key={luAnimKey}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -32, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="absolute left-1/2 top-0 -translate-x-1/2 pointer-events-none z-10 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 shadow-md"
            style={{ color: MIDNIGHT_BLUE }}
          >
            <span className="text-sm font-bold">+{LU_PER_QUEST_COMPLETE}</span>
            <span className="text-amber-600">{LU_ICON}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
        className="w-full flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%)",
          boxShadow: "0 4px 20px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        {/* 탭: 오늘의 퀘스트 / 내일의 퀘스트 – 구분선 */}
        <div className="flex flex-shrink-0 border-b border-[#E2E8F0] rounded-t-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 transition-colors text-sm font-bold rounded-tl-2xl ${
              activeTab === "today"
                ? "text-[#0F172A] bg-[#F8FAFC] border-b-2 border-[#0F172A] -mb-px"
                : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]/50"
            }`}
          >
            오늘의 퀘스트
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tomorrow")}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 transition-colors text-sm font-bold rounded-tr-2xl ${
              activeTab === "tomorrow"
                ? "text-[#0F172A] bg-[#F8FAFC] border-b-2 border-[#0F172A] -mb-px"
                : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]/50"
            }`}
          >
            내일의 퀘스트
          </button>
        </div>

        <div className="px-4 py-5">
          {activeTab === "today" ? (
            <>
              {              todayQuests.length === 0 ? (
                <p className="text-sm leading-relaxed py-6 text-center font-a2z-regular opacity-80" style={{ color: MIDNIGHT_BLUE }}>
                  일기를 쓰면 내일 퀘스트를 제안해 드릴게요.
                </p>
              ) : (
                <ul className="space-y-4">
                  {todayQuests.map((q) => {
                    const isDone = done[q.id];
                    const earned = getTodayQuestLuEarned();
                    const canComplete = !isDone && earned < MAX_DAILY_QUEST_LU;
                    return (
                      <li
                        key={q.id}
                        className="flex flex-col rounded-xl px-4 py-3 border border-[#E2E8F0]/70 transition-all"
                        style={{
                          background: "rgba(248, 250, 252, 0.8)",
                          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className={`arisum-quest-label flex-1 min-w-0 font-a2z-regular break-words ${isDone ? "line-through opacity-50" : ""}`}
                            style={{ color: MIDNIGHT_BLUE }}
                          >
                            {q.label}
                          </span>
                          <div className="shrink-0 flex flex-col items-center">
                            <button
                              type="button"
                              onClick={() => handleToggle(q.id, !isDone)}
                              disabled={!isDone && !canComplete}
                              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed bg-[#0F172A] text-white hover:opacity-90 disabled:opacity-50 ${
                                isDone ? "opacity-50" : ""
                              }`}
                            >
                              완료
                            </button>
                            <span
                              className={`text-[10px] font-semibold mt-1 ${isDone ? "" : "opacity-50"}`}
                              style={{ color: DEEP_GOLD }}
                            >
                              +{LU_PER_QUEST_COMPLETE} ✦
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <>
              {              tomorrowQuests.length === 0 ? (
                <p className="text-sm leading-relaxed py-6 text-center font-a2z-regular opacity-70" style={{ color: MIDNIGHT_BLUE }}>
                  일기 탭에서 퀘스트를 담으면 여기에 표시돼요.
                </p>
              ) : (
                <ul className="space-y-4">
                  {tomorrowQuests.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-start gap-4 rounded-xl px-4 py-3 border border-[#E2E8F0]/70"
                      style={{
                        background: "rgba(248, 250, 252, 0.8)",
                        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <span className="shrink-0 text-amber-600 pt-0.5" aria-hidden>{LU_ICON}</span>
                      <span className="arisum-quest-label flex-1 min-w-0 font-a2z-regular pr-2" style={{ color: MIDNIGHT_BLUE }}>
                        {q.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </motion.div>
    </section>
  );
}
