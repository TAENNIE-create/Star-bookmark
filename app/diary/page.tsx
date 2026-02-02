"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, PanInfo, AnimatePresence } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import type { MoodScores } from "../../lib/arisum-types";
import { MIDNIGHT_BLUE, MUTED, CARD_BG, LU_ICON } from "../../lib/theme";
import { getLuBalance, subtractLu, addLu, LU_DAILY_REPORT_UNLOCK, LU_REANALYZE } from "../../lib/lu-balance";
import { getUserName } from "../../lib/home-greeting";
import { getQuestsForDate, setQuestsForDate } from "../../lib/quest-storage";
import { getCurrentConstellation, mergeAtlasWithNewStar, setCurrentConstellation, setActiveConstellations } from "../../lib/atlas-storage";
import { getAppStorage } from "../../lib/app-storage";

const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const DAILY_QUESTS_DONE_KEY = "arisum-daily-quests-done";
const MAX_DAILY_QUESTS = 3;
const CHAMPAGNE_GOLD = "#FDE68A";

type JournalByDate = Record<string, { content: string; createdAt: string; aiQuestion?: string }[]>;

type ReportData = {
  date: string;
  todayFlow: string | null;
  gardenerWord: string | null;
  growthSeeds: string[];
  hasEntry: boolean;
};

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 내일 날짜 키 (오늘+1일). 일기에서 담은 퀘스트는 이 키로 저장됨 */
function getTomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 일기에서 담은 퀘스트 = quests_for_내일날짜. 내일의 퀘스트 탭에서 읽음 */

type ReportEntry = {
  todayFlow: string;
  gardenerWord: string;
  growthSeeds: string[];
  keywords?: [string, string, string];
  lastAnalyzedText?: string;
};

function getReportByDate(): Record<string, ReportEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setReportByDate(dateKey: string, report: ReportEntry) {
  if (typeof window === "undefined") return;
  try {
    const prev = getReportByDate();
    getAppStorage().setItem(REPORT_BY_DATE_KEY, JSON.stringify({ ...prev, [dateKey]: report }));
    window.dispatchEvent(new Event("report-updated"));
  } catch {
    // ignore
  }
}

/** 해당 날짜의 모든 일기 조각 내용을 합친 텍스트 */
function getCombinedJournalText(dateKey: string, journalsData: JournalByDate): string {
  const entries = (journalsData[dateKey] ?? [])
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return entries.map((e) => e.content.trim()).filter(Boolean).join("\n\n");
}

/** 최근 7일 날짜 키 (오래된 순) */
function getLast7DayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return keys;
}

/** 밤하늘(7일 별자리)용: 최근 7일 일기 맥락 */
function getRecentJournalContents(journalsData: JournalByDate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dateKey of getLast7DayKeys()) {
    const text = getCombinedJournalText(dateKey, journalsData);
    if (text.trim()) out[dateKey] = text;
  }
  return out;
}

/** 현재 일기 텍스트와 마지막 분석 텍스트가 다를 때 true (재분석 버튼 노출) */
function isReportDirty(
  dateKey: string,
  journalsData: JournalByDate,
  existingReport: ReportEntry | undefined
): boolean {
  const combined = getCombinedJournalText(dateKey, journalsData);
  if (!combined) return false; // 일기가 없으면 버튼 숨김
  if (!existingReport?.todayFlow && !existingReport?.gardenerWord && (!existingReport?.growthSeeds?.length)) {
    return false; // 리포트가 없으면 버튼 숨김
  }
  const last = existingReport?.lastAnalyzedText ?? "";
  return combined !== last;
}

function getTomorrowQuests(): { id: string; label: string }[] {
  return getQuestsForDate(getTomorrowKey());
}

function addQuestToDaily(label: string): boolean {
  if (typeof window === "undefined") return false;
  const tomorrowKey = getTomorrowKey();
  const items = getQuestsForDate(tomorrowKey);
  if (items.length >= MAX_DAILY_QUESTS) return false;
  const id = `seed-${Date.now()}-${items.length}`;
  setQuestsForDate(tomorrowKey, [...items, { id, label }]);
  return true;
}

function removeQuestFromDaily(label: string): boolean {
  if (typeof window === "undefined") return false;
  const tomorrowKey = getTomorrowKey();
  const items = getQuestsForDate(tomorrowKey).filter((q) => q.label !== label);
  if (items.length === getQuestsForDate(tomorrowKey).length) return false;
  setQuestsForDate(tomorrowKey, items);
  return true;
}

/** 오늘의 퀘스트(quests_for_오늘날짜)를 모두 완료했는지 */
function isTodayQuestsAllDone(): boolean {
  if (typeof window === "undefined") return false;
  const todayKey = getTodayKey();
  const items = getQuestsForDate(todayKey);
  if (items.length === 0) return true;
  try {
    const raw = getAppStorage().getItem(DAILY_QUESTS_DONE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (data.date !== todayKey) return false;
    const quests = data.quests ?? {};
    return items.every((q) => quests[q.id] === true);
  } catch {
    return false;
  }
}

function DiaryCalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [journals, setJournals] = useState<JournalByDate>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  /** 선택된 퀘스트 라벨 배열. 초기 상태는 빈 배열, 화면 문구는 이 길이(selectedQuests.length)로 표시 */
  const [selectedQuests, setSelectedQuests] = useState<string[]>([]);
  const [todayQuestsDone, setTodayQuestsDone] = useState(false);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState<string | null>(null);
  const [lu, setLu] = useState(0);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [traitConfirmPopup, setTraitConfirmPopup] = useState<{
    label: string;
    opening: string;
    body: string;
    closing: string;
  } | null>(null);
  const hasAutoSelectedToday = useRef(false);

  const refreshSelectedQuests = () => {
    const items = getTomorrowQuests();
    setSelectedQuests(items.map((q) => q.label));
    setTodayQuestsDone(isTodayQuestsAllDone());
  };

  const loadJournals = () => {
    if (typeof window === "undefined") return;

    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      setJournals(parsed);
    } catch {
      setJournals({});
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = getAppStorage().getItem("arisum-journals");
    const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
    setJournals(parsed);
    if (!hasAutoSelectedToday.current) {
      hasAutoSelectedToday.current = true;
      const dateParam = searchParams.get("date");
      const targetKey =
        dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
          ? dateParam
          : formatDateKey(new Date());
      setSelectedDate(targetKey);
      loadReportData(targetKey, parsed);
    }
  }, [searchParams]);

  useEffect(() => {
    refreshSelectedQuests();
    setLu(getLuBalance());
  }, []);

  useEffect(() => {
    const onLu = () => setLu(getLuBalance());
    window.addEventListener("lu-balance-updated", onLu);
    return () => window.removeEventListener("lu-balance-updated", onLu);
  }, []);

  useEffect(() => {
    const onQuestsUpdated = () => refreshSelectedQuests();
    window.addEventListener("dailyQuests-updated", onQuestsUpdated);
    return () => window.removeEventListener("dailyQuests-updated", onQuestsUpdated);
  }, []);

  useEffect(() => {
    if (selectedDate === getTodayKey() && reportData?.growthSeeds?.length) {
      refreshSelectedQuests();
    }
  }, [selectedDate, reportData?.date, reportData?.growthSeeds?.length]);

  useEffect(() => {
    const handleStorageChange = () => {
      loadJournals();
      if (selectedDate) {
        loadReportData(selectedDate);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("journal-updated", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("journal-updated", handleStorageChange);
    };
  }, [selectedDate]);

  const hasJournal = (date: Date): boolean => {
    const dateKey = formatDateKey(date);
    const entries = journals[dateKey] ?? [];
    return entries.length > 0;
  };

  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const loadReportData = async (dateKey: string, journalsOverride?: JournalByDate | null) => {
    const data: JournalByDate = (journalsOverride != null) ? journalsOverride : journals;
    const entries = data[dateKey] ?? [];
    const hasEntry = entries.length > 0;

    if (!hasEntry) {
      setReportData({
        date: dateKey,
        todayFlow: null,
        gardenerWord: null,
        growthSeeds: [],
        hasEntry: false,
      });
      return;
    }

    const existingByDate = getReportByDate();
    const existing_report = existingByDate[dateKey];
    if (existing_report?.todayFlow != null || existing_report?.gardenerWord != null || (Array.isArray(existing_report?.growthSeeds) && existing_report.growthSeeds.length > 0)) {
      setReportData({
        date: dateKey,
        todayFlow: existing_report.todayFlow ?? null,
        gardenerWord: existing_report.gardenerWord ?? null,
        growthSeeds: Array.isArray(existing_report.growthSeeds) ? existing_report.growthSeeds : [],
        hasEntry: true,
      });
      return;
    }

    // 일기는 있지만 분석 데이터 없음 → 자동 호출 없음, 해금 UI만 표시
    setReportData({
      date: dateKey,
      todayFlow: null,
      gardenerWord: null,
      growthSeeds: [],
      hasEntry: true,
    });
  };

  /** 30루 차감 후 해당 날짜에 대해 analyze API 호출 및 결과 저장 */
  const runUnlockAnalyze = async (dateKey: string) => {
    const lu = getLuBalance();
    if (lu < LU_DAILY_REPORT_UNLOCK) {
      if (typeof window !== "undefined") {
        window.alert("별조각이 부족하여 기록을 읽을 수 없습니다");
      }
      return;
    }
    if (!subtractLu(LU_DAILY_REPORT_UNLOCK)) return;
    window.dispatchEvent(new Event("lu-balance-updated"));

    const data = journals;
    const entries = data[dateKey] ?? [];
    if (entries.length === 0) {
      addLu(LU_DAILY_REPORT_UNLOCK);
      return;
    }

    setIsLoadingReport(true);
    const journalTexts = entries.map((e) => e.content);
    const existing_report = getReportByDate()[dateKey];

    try {
      const user_identity_summary =
        typeof window !== "undefined" ? getAppStorage().getItem("user_identity_summary") : null;
      const existingByDateForAtlas = getReportByDate();
      const existingStarDates = Object.keys(existingByDateForAtlas).filter(
        (d) =>
          existingByDateForAtlas[d]?.todayFlow ||
          existingByDateForAtlas[d]?.gardenerWord ||
          (existingByDateForAtlas[d]?.growthSeeds?.length ?? 0) > 0
      );

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journals: journalTexts,
          date: dateKey,
          user_identity_summary: user_identity_summary || undefined,
          existing_report: existing_report || undefined,
          recentJournalContents: getRecentJournalContents(data),
          existingStarDates,
          previousConstellationName: getCurrentConstellation()?.name ?? undefined,
        }),
      });

      if (!analyzeRes.ok) {
        addLu(LU_DAILY_REPORT_UNLOCK);
        throw new Error("분석 실패");
      }

      const analyzeData = await analyzeRes.json();
      const todayFlow = analyzeData.todayFlow ?? null;
      const gardenerWord = analyzeData.gardenerWord ?? null;
      const growthSeeds = Array.isArray(analyzeData.growthSeeds) ? analyzeData.growthSeeds : [];
      const keywords: [string, string, string] | undefined =
        Array.isArray(analyzeData.keywords) && analyzeData.keywords.length >= 3
          ? [String(analyzeData.keywords[0]), String(analyzeData.keywords[1]), String(analyzeData.keywords[2])]
          : undefined;

      setReportData({
        date: dateKey,
        todayFlow,
        gardenerWord,
        growthSeeds,
        hasEntry: true,
      });

      if (typeof window !== "undefined") {
        try {
          const toSave = analyzeData.identityArchive ?? { summary: analyzeData.updatedSummary ?? "", traitCounts: {}, confirmedTraits: {} };
          getAppStorage().setItem("user_identity_summary", typeof toSave === "string" ? toSave : JSON.stringify(toSave));
          const metrics: MoodScores = analyzeData.metrics ?? analyzeData.scores;
          if (metrics) {
            getAppStorage().setItem("arisum-latest-scores", JSON.stringify({ date: dateKey, scores: metrics }));
            const historyRaw = getAppStorage().getItem("arisum-scores-history");
            const history: Record<string, MoodScores> = historyRaw ? JSON.parse(historyRaw) : {};
            history[dateKey] = metrics;
            getAppStorage().setItem("arisum-scores-history", JSON.stringify(history));
          }
          const combinedText = getCombinedJournalText(dateKey, data);
          setReportByDate(dateKey, {
            todayFlow: todayFlow ?? "",
            gardenerWord: gardenerWord ?? "",
            growthSeeds,
            lastAnalyzedText: combinedText,
            ...(keywords && { keywords }),
          });
          if (dateKey === getTodayKey() && growthSeeds.length > 0) {
            const tomorrowKey = getTomorrowKey();
            setQuestsForDate(tomorrowKey, []);
            setSelectedQuests([]);
            window.dispatchEvent(new Event("dailyQuests-updated"));
          }
          if (analyzeData.keywords) {
            getAppStorage().setItem(
              "arisum-latest-analysis",
              JSON.stringify({ keywords: analyzeData.keywords, counselorLetter: analyzeData.counselorLetter })
            );
          }
          if (analyzeData.starPosition && analyzeData.keywords) {
            const combinedText = getCombinedJournalText(dateKey, data);
            mergeAtlasWithNewStar(
              dateKey,
              analyzeData.starPosition,
              analyzeData.keywords,
              analyzeData.starConnections ?? [],
              combinedText.length
            );
          }
          if (Array.isArray(analyzeData.currentConstellations) && analyzeData.currentConstellations.length > 0) {
            setActiveConstellations(analyzeData.currentConstellations);
          } else if (analyzeData.currentConstellation) {
            setCurrentConstellation(analyzeData.currentConstellation);
          }
          if (analyzeData.newlyConfirmedTrait) {
            setTraitConfirmPopup({
              label: analyzeData.newlyConfirmedTrait.label,
              opening: analyzeData.newlyConfirmedTrait.opening,
              body: analyzeData.newlyConfirmedTrait.body,
              closing: analyzeData.newlyConfirmedTrait.closing,
            });
          }
        } catch {
          // ignore
        }
      }
      window.dispatchEvent(new Event("report-updated"));
    } catch (error) {
      console.error("리포트 해금 분석 실패:", error);
      setReportData({
        date: dateKey,
        todayFlow: null,
        gardenerWord: null,
        growthSeeds: [],
        hasEntry: true,
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleReanalyze = async () => {
    if (!selectedDate || isReanalyzing) return;
    const lu = getLuBalance();
    if (lu < LU_REANALYZE) {
      return; // "별조각이 부족해요" - modal에서 처리
    }
    if (!subtractLu(LU_REANALYZE)) return;
    setShowReanalyzeModal(false);
    setIsReanalyzing(true);
    try {
      const entries = (journals[selectedDate] ?? [])
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const journalTexts = entries.map((e) => e.content.trim()).filter(Boolean);
      if (journalTexts.length === 0) {
        addLu(LU_REANALYZE); // 환불
        return;
      }
      const user_identity_summary =
        typeof window !== "undefined" ? getAppStorage().getItem("user_identity_summary") : null;
      const existing = getReportByDate()[selectedDate];
      const existingByDateRe = getReportByDate();
      const existingStarDatesRe = Object.keys(existingByDateRe).filter(
        (d) =>
          existingByDateRe[d]?.todayFlow ||
          existingByDateRe[d]?.gardenerWord ||
          (existingByDateRe[d]?.growthSeeds?.length ?? 0) > 0
      );
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journals: journalTexts,
          date: selectedDate,
          user_identity_summary: user_identity_summary || undefined,
          existing_report: existing
            ? {
                todayFlow: existing.todayFlow,
                gardenerWord: existing.gardenerWord,
                growthSeeds: existing.growthSeeds,
              }
            : undefined,
          recentJournalContents: getRecentJournalContents(journals),
          existingStarDates: existingStarDatesRe,
          previousConstellationName: getCurrentConstellation()?.name ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("분석 실패");
      const analyzeData = await res.json();
      const todayFlow = analyzeData.todayFlow ?? null;
      const gardenerWord = analyzeData.gardenerWord ?? null;
      const growthSeeds = Array.isArray(analyzeData.growthSeeds) ? analyzeData.growthSeeds : [];
      const keywords: [string, string, string] | undefined =
        Array.isArray(analyzeData.keywords) && analyzeData.keywords.length >= 3
          ? [String(analyzeData.keywords[0]), String(analyzeData.keywords[1]), String(analyzeData.keywords[2])]
          : undefined;
      const combinedText = getCombinedJournalText(selectedDate, journals);
      setReportData({
        date: selectedDate,
        todayFlow,
        gardenerWord,
        growthSeeds,
        hasEntry: true,
      });
      setReportByDate(selectedDate, {
        todayFlow: todayFlow ?? "",
        gardenerWord: gardenerWord ?? "",
        growthSeeds,
        lastAnalyzedText: combinedText,
        ...(keywords && { keywords }),
      });
      if (typeof window !== "undefined") {
        try {
          const toSave = analyzeData.identityArchive ?? { summary: analyzeData.updatedSummary ?? "", traitCounts: {}, confirmedTraits: {} };
          getAppStorage().setItem("user_identity_summary", typeof toSave === "string" ? toSave : JSON.stringify(toSave));
          const metrics: MoodScores = analyzeData.metrics ?? analyzeData.scores;
          if (metrics) {
            getAppStorage().setItem(
              "arisum-latest-scores",
              JSON.stringify({ date: selectedDate, scores: metrics })
            );
            const historyRaw = getAppStorage().getItem("arisum-scores-history");
            const history: Record<string, MoodScores> = historyRaw ? JSON.parse(historyRaw) : {};
            history[selectedDate] = metrics;
            getAppStorage().setItem("arisum-scores-history", JSON.stringify(history));
          }
          if (analyzeData.keywords) {
            getAppStorage().setItem(
              "arisum-latest-analysis",
              JSON.stringify({
                keywords: analyzeData.keywords,
                counselorLetter: analyzeData.counselorLetter,
              })
            );
          }
          if (analyzeData.starPosition && analyzeData.keywords) {
            const combinedTextRe = getCombinedJournalText(selectedDate, journals);
            mergeAtlasWithNewStar(
              selectedDate,
              analyzeData.starPosition,
              analyzeData.keywords,
              analyzeData.starConnections ?? [],
              combinedTextRe.length
            );
          }
          if (Array.isArray(analyzeData.currentConstellations) && analyzeData.currentConstellations.length > 0) {
            setActiveConstellations(analyzeData.currentConstellations);
          } else if (analyzeData.currentConstellation) {
            setCurrentConstellation(analyzeData.currentConstellation);
          }
          if (analyzeData.newlyConfirmedTrait) {
            setTraitConfirmPopup({
              label: analyzeData.newlyConfirmedTrait.label,
              opening: analyzeData.newlyConfirmedTrait.opening,
              body: analyzeData.newlyConfirmedTrait.body,
              closing: analyzeData.newlyConfirmedTrait.closing,
            });
          }
        } catch {
          /* ignore */
        }
      }
      if (selectedDate === getTodayKey() && growthSeeds.length > 0) {
        const tomorrowKey = getTomorrowKey();
        setQuestsForDate(tomorrowKey, []);
        setSelectedQuests([]);
        window.dispatchEvent(new Event("dailyQuests-updated"));
      }
      window.dispatchEvent(new Event("report-updated"));
      window.dispatchEvent(new Event("journal-updated"));
    } catch {
      addLu(LU_REANALYZE); // 실패 시 환불
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleDateClick = (date: Date) => {
    const dateKey = formatDateKey(date);
    setSelectedDate(dateKey);
    loadReportData(dateKey);
  };

  const handleDateDoubleClick = (date: Date) => {
    const dateKey = formatDateKey(date);
    router.push(`/diary/${dateKey}`);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const days: (Date | null)[] = [];

  // 빈 칸 추가
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // 날짜 추가
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(new Date(currentYear, currentMonth, day));
  }

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const monthNames = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ];

  const today = new Date();
  const isToday = (date: Date | null) => {
    if (!date) return false;
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="min-h-screen flex justify-center bg-transparent">
      <div className="w-full max-w-md min-h-screen relative flex flex-col bg-transparent">
        <div className="h-6" />

        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6"
        >
          <div className="flex items-center justify-between mt-0 mb-3">
            <button
              onClick={goToPreviousMonth}
              className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center hover:bg-white transition-colors shadow-sm"
              style={{ color: MIDNIGHT_BLUE }}
            >
              ‹
            </button>
            <button
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goToToday();
              }}
              className="text-lg font-semibold cursor-pointer transition-colors select-none bg-transparent p-0 text-[#64748B] hover:opacity-80"
              style={{ color: MIDNIGHT_BLUE }}
            >
              {currentYear}년 {monthNames[currentMonth]}
            </button>
            <button
              onClick={goToNextMonth}
              className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center hover:bg-white transition-colors shadow-sm"
              style={{ color: MIDNIGHT_BLUE }}
            >
              ›
            </button>
          </div>
        </motion.header>

        <main className="flex-1 px-6 pt-0 pb-24 overflow-hidden">
          <motion.div
            className="rounded-3xl bg-white border border-[#E2E8F0] shadow-sm px-4 py-3 cursor-grab active:cursor-grabbing"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info: PanInfo) => {
              const threshold = 80;
              if (info.offset.x > threshold) {
                goToPreviousMonth();
              } else if (info.offset.x < -threshold) {
                goToNextMonth();
              }
            }}
            whileDrag={{
              cursor: "grabbing",
              scale: 0.98,
              opacity: 0.9,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
          >
            {/* Week day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2 min-h-[2.2rem]">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium py-2.5"
                  style={{ color: MUTED }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days (셀 세로 10% 확대) */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="aspect-[1/1.1]" />;
                }

                const hasEntry = hasJournal(date);
                const todayFlag = isToday(date);

                const dateKey = formatDateKey(date);
                const isSelected = selectedDate === dateKey;

                return (
                  <motion.button
                    key={date.toISOString()}
                    onClick={() => handleDateClick(date)}
                    onDoubleClick={() => handleDateDoubleClick(date)}
                    className={`aspect-[1/1.1] rounded-xl flex flex-col items-center justify-center relative transition-all hover:scale-105 ${
                      isSelected
                        ? "bg-[#64748B] text-white font-semibold ring-2 ring-[#0F172A]"
                        : todayFlag
                        ? "bg-[#0F172A] text-white font-semibold"
                        : "bg-[#E2E8F0]/50 text-[#0F172A] hover:bg-[#E2E8F0]"
                    }`}
                    whileTap={{ scale: 0.95 }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <span className="text-sm font-a2z-regular">{date.getDate()}</span>
                    {hasEntry && (
                      <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#0F172A]" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* 하단 미니 리포트 영역 */}
          <AnimatePresence mode="wait">
            {selectedDate && (
              <motion.div
                key={selectedDate}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="relative mt-4 rounded-3xl border border-[#E2E8F0] shadow-sm p-5"
                style={{ backgroundColor: CARD_BG }}
              >
                {isLoadingReport || isReanalyzing ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: MUTED }} />
                  </div>
                ) : reportData?.hasEntry ? (
                  (() => {
                    const hasAnalysisData =
                      (reportData.todayFlow != null && reportData.todayFlow !== "") ||
                      (reportData.gardenerWord != null && reportData.gardenerWord !== "") ||
                      (reportData.growthSeeds?.length ?? 0) > 0;
                    if (!hasAnalysisData) {
                      const nickname = getUserName() || "당신";
                      return (
                        <div className="py-6 px-4 text-center space-y-5">
                          <p className="text-sm leading-relaxed" style={{ color: MIDNIGHT_BLUE }}>
                            별지기가 {nickname}님의 일기를 분석했어요.
                          </p>
                          <div className="flex flex-col items-center gap-3">
                            <button
                              type="button"
                              onClick={() => selectedDate && (lu >= LU_DAILY_REPORT_UNLOCK ? setShowUnlockConfirm(selectedDate) : null)}
                              disabled={lu < LU_DAILY_REPORT_UNLOCK || isLoadingReport}
                              className="rounded-2xl px-6 py-4 text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              style={
                                lu >= LU_DAILY_REPORT_UNLOCK
                                  ? {
                                      backgroundColor: CHAMPAGNE_GOLD,
                                      color: MIDNIGHT_BLUE,
                                      boxShadow: "0 0 12px rgba(253,230,138,0.6), 0 0 24px rgba(253,230,138,0.3)",
                                    }
                                  : { backgroundColor: "#94A3B8", color: "#FFFFFF" }
                              }
                            >
                              {LU_ICON} 30 해금하기
                            </button>
                            <p className="text-xs" style={{ color: MUTED }}>
                              보유 별조각 · <span className="font-semibold tabular-nums" style={{ color: MIDNIGHT_BLUE }}>{LU_ICON} {lu}</span>
                            </p>
                          </div>
                          {lu < LU_DAILY_REPORT_UNLOCK && (
                            <p className="text-xs" style={{ color: "#94A3B8" }}>
                              별조각이 부족하면 기록을 읽을 수 없어요.
                            </p>
                          )}
                        </div>
                      );
                    }
                    return (
                  <div className="space-y-4">
                    {/* 다시 분석하기 버튼 - 해금된 리포트에서만 */}
                    {isReportDirty(selectedDate!, journals, getReportByDate()[selectedDate!]) && (
                      <div className="absolute top-4 right-4 z-10">
                        <button
                          type="button"
                          onClick={() => setShowReanalyzeModal(true)}
                          disabled={isReanalyzing}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-60"
                          style={{
                            background: "rgba(253, 230, 138, 0.5)",
                            color: "#0F172A",
                            borderColor: "rgba(253, 230, 138, 0.8)",
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                            <path d="M16 21h5v-5" />
                          </svg>
                          다시 분석하기 ✨ 별조각 15
                        </button>
                      </div>
                    )}
                    <p className="text-xs font-medium mb-2" style={{ color: MUTED }}>
                      {(() => {
                        const [year, month, day] = selectedDate.split("-");
                        return new Date(
                          parseInt(year),
                          parseInt(month) - 1,
                          parseInt(day)
                        ).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        });
                      })()}
                    </p>

                    {reportData.todayFlow && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                          오늘의 기류
                        </p>
                        <p className="text-sm leading-relaxed arisum-diary-content" style={{ color: MIDNIGHT_BLUE }}>
                          {reportData.todayFlow}
                        </p>
                      </motion.div>
                    )}

                    {reportData.gardenerWord && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.05 }}
                        className="pt-3 border-t border-[#E2E8F0]"
                      >
                        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                          별지기의 생각
                        </p>
                        <p className="text-sm leading-relaxed arisum-diary-content" style={{ color: MIDNIGHT_BLUE }}>
                          {reportData.gardenerWord}
                        </p>
                      </motion.div>
                    )}

                    {reportData.growthSeeds.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="pt-3 border-t border-[#E2E8F0]"
                      >
                        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                          내일 이런 걸 해보는 건 어떨까요?
                        </p>
                        <p className="text-[10px] mb-2" style={{ color: MUTED }}>
                          5개 중 3개 골라 담으면 홈의 내일의 퀘스트에 반영돼요
                        </p>
                        <p className="text-[10px] mb-2 font-medium" style={{ color: MIDNIGHT_BLUE }}>
                          {MAX_DAILY_QUESTS}개 중 {selectedQuests.length}개 담김
                        </p>
                        <ul className="space-y-2">
                          {reportData.growthSeeds.map((label, i) => {
                            const added = selectedQuests.includes(label);
                            const canAdd = !added && selectedQuests.length < MAX_DAILY_QUESTS;
                            return (
                              <li
                                key={i}
                                className="flex items-start justify-between gap-4"
                                style={{ color: MIDNIGHT_BLUE }}
                              >
                                <span className="shrink-0 text-amber-600 pt-0.5" aria-hidden>{LU_ICON}</span>
                                <span className="arisum-quest-label flex-1 min-w-0 pr-2">{label}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (added) {
                                      removeQuestFromDaily(label);
                                    } else if (selectedQuests.length < MAX_DAILY_QUESTS) {
                                      addQuestToDaily(label);
                                    }
                                    setSelectedQuests(getTomorrowQuests().map((q) => q.label));
                                  }}
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    added
                                      ? "bg-[#94A3B8]/80 text-white/90 hover:bg-[#64748B]/80"
                                      : canAdd
                                        ? "bg-[#0F172A] text-white hover:bg-[#1E293B]"
                                        : "bg-[#E2E8F0] text-[#64748B] cursor-not-allowed"
                                  }`}
                                >
                                  {added ? "담김" : "담기"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        {selectedQuests.length >= MAX_DAILY_QUESTS && (
                          <p className="text-[10px] mt-2" style={{ color: MUTED }}>
                            오늘 담기는 하루 최대 3개까지예요.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                      이날은 아직 기록이 없어요.
                      <br />
                      <span className="text-xs">
                        더블 클릭하여 마음을 심어보세요.
                      </span>
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* 해금 확인 모달 */}
        <AnimatePresence>
          {showUnlockConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
              onClick={() => setShowUnlockConfirm(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              >
                <p className="text-sm leading-relaxed text-center mb-2" style={{ color: MIDNIGHT_BLUE }}>
                  정말로 해금하시겠습니까?
                </p>
                <p className="text-xs text-center mb-4" style={{ color: MUTED }}>
                  별조각 30개가 사용돼요.
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowUnlockConfirm(null)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium border border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                    style={{ color: MIDNIGHT_BLUE }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (showUnlockConfirm) {
                        runUnlockAnalyze(showUnlockConfirm);
                        setShowUnlockConfirm(null);
                      }
                    }}
                    disabled={isLoadingReport}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: CHAMPAGNE_GOLD, color: MIDNIGHT_BLUE, boxShadow: "0 0 12px rgba(253,230,138,0.5)" }}
                  >
                    해금하기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 재분석 확인 모달 */}
        <AnimatePresence>
          {showReanalyzeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
              onClick={() => setShowReanalyzeModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              >
                <p className="text-sm leading-relaxed text-center mb-2" style={{ color: MIDNIGHT_BLUE }}>
                  별조각 15개를 사용해 이 날의 기록을 밤하늘에 올리시겠어요?
                </p>
                {getLuBalance() < LU_REANALYZE && (
                  <p className="text-xs text-amber-600 text-center mb-4">별조각이 부족해요</p>
                )}
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowReanalyzeModal(false)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium border border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                    style={{ color: MIDNIGHT_BLUE }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleReanalyze}
                    disabled={getLuBalance() < LU_REANALYZE}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: getLuBalance() >= LU_REANALYZE ? "#0F172A" : "#94A3B8" }}
                  >
                    동기화하기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 7회 확정 성격 축하 팝업 */}
        <AnimatePresence>
          {traitConfirmPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 backdrop-blur-sm px-4"
              onClick={() => setTraitConfirmPopup(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
              >
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "#64748B" }}>
                  별자리 완성
                </p>
                <p className="text-lg font-semibold mb-3" style={{ color: MIDNIGHT_BLUE }}>
                  {traitConfirmPopup.label}
                </p>
                <p className="text-sm leading-relaxed mb-2" style={{ color: MIDNIGHT_BLUE }}>
                  {traitConfirmPopup.opening}
                </p>
                <p className="text-sm leading-relaxed mb-2" style={{ color: "#475569" }}>
                  {traitConfirmPopup.body}
                </p>
                <p className="text-sm font-medium mt-3" style={{ color: "#0F172A" }}>
                  {traitConfirmPopup.closing}
                </p>
                <button
                  type="button"
                  onClick={() => setTraitConfirmPopup(null)}
                  className="mt-4 w-full rounded-xl py-2.5 text-sm font-medium text-white"
                  style={{ backgroundColor: MIDNIGHT_BLUE }}
                >
                  확인
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <TabBar
          activeKey="journal"
          onChange={(key: TabKey) => {
            if (key === "home") router.push("/");
            if (key === "journal") return;
            if (key === "bookshelf") router.push("/archive");
            if (key === "constellation") router.push("/constellation");
          }}
        />
      </div>
    </div>
  );
}

export default function DiaryCalendarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7FB]">
        <div className="h-6 w-6 rounded-full border-2 border-[#0F172A]/30 border-t-transparent animate-spin" />
      </div>
    }>
      <DiaryCalendarContent />
    </Suspense>
  );
}
