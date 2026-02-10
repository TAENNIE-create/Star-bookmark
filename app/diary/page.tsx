"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, PanInfo, AnimatePresence } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import type { MoodScores } from "../../lib/arisum-types";
import { MIDNIGHT_BLUE, MUTED, CARD_BG, LU_ICON } from "../../lib/theme";
import { getAnalyzeApiUrl } from "../../lib/api-client";
import { getLuBalance, subtractLu, addLu, LU_DAILY_REPORT_UNLOCK, LU_REANALYZE } from "../../lib/lu-balance";
import { getMembershipTier, MEMBERSHIP_ACCESS_DAYS, isDateAccessible, getRequiredShards, COST_PERMANENT_MEMORY_KEY } from "../../lib/economy";
import { getUnlockedMonths, setUnlockedMonths } from "../../lib/archive-unlock";
import { getUserName } from "../../lib/home-greeting";
import { getQuestsForDate, setQuestsForDate } from "../../lib/quest-storage";
import { getCurrentConstellation, mergeAtlasWithNewStar, setCurrentConstellation, setActiveConstellations, type ActiveConstellation, type CurrentConstellation } from "../../lib/atlas-storage";
import { getAppStorage } from "../../lib/app-storage";
import { LoadingOverlay } from "../../components/arisum/loading-overlay";
import { openStoreModal } from "../../components/arisum/store-modal-provider";
import { getTraitLevel, TRAIT_LEVEL_MESSAGES, TRAIT_LEVEL_NAMES, type TraitLevel } from "../../lib/trait-level";

const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const DAILY_QUESTS_DONE_KEY = "arisum-daily-quests-done";
const MAX_DAILY_QUESTS = 3;
const CHAMPAGNE_GOLD = "#FDE68A";
const SILVER_WHITE = "#E2E8F0";
const POPUP_BG = "#0A0E1A";

/** AI 생성 문구 내 [닉네임]/[사용자 이름]을 실제 이름으로 치환 */
function replaceUserNameInText(text: string, userName: string): string {
  const name = userName?.trim() || "당신";
  return text
    .replace(/\[닉네임\]/gi, name)
    .replace(/\[사용자 이름\]/gi, name);
}

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
  /** 이 날짜 분석 시 traitCounts에 반영된 trait id 목록 (삭제 시 회수용) */
  traitIdsContributed?: string[];
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

/** 밤하늘(7일 별자리)용: 최근 7일 일기 맥락. filterByAccess: true면 열람 권한 있는 날만 포함 */
function getRecentJournalContents(
  journalsData: JournalByDate,
  filterByAccess?: { accessDays: number | null; unlockedMonths: Set<string> }
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dateKey of getLast7DayKeys()) {
    if (filterByAccess && !isDateAccessible(dateKey, filterByAccess.accessDays, filterByAccess.unlockedMonths))
      continue;
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
  const [sealedDateKey, setSealedDateKey] = useState<string | null>(null);
  const [lu, setLu] = useState(0);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [traitConfirmPopup, setTraitConfirmPopup] = useState<{
    label: string;
    opening: string;
    body: string;
    closing: string;
  } | null>(null);
  const [levelUpPopup, setLevelUpPopup] = useState<{
    label: string;
    newLevel: TraitLevel;
    message: string;
  } | null>(null);
  /** 분석 실패 시 사용자에게 보여줄 메시지 (무한 로딩 방지) */
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(null);
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

  /** 해당 날짜에 대해 analyze API 호출 성공 시에만 별조각 차감 (원자적 동작) */
  const runUnlockAnalyze = async (dateKey: string) => {
    const cost = getRequiredShards(tier, "daily_analysis");
    const lu = getLuBalance();
    if (lu < cost) {
      if (typeof window !== "undefined") {
        openStoreModal();
      }
      return;
    }

    const data = journals;
    const entries = data[dateKey] ?? [];
    if (entries.length === 0) return;

    setAnalysisErrorMessage(null);
    setIsLoadingReport(true);
    const journalTexts = entries.map((e) => e.content);
    const existing_report = getReportByDate()[dateKey];
    let luSubtracted = false;

    try {
      const user_identity_summary =
        typeof window !== "undefined" ? getAppStorage().getItem("user_identity_summary") : null;
      let previousArchive: { traitCounts?: Record<string, number>; confirmedTraits?: Array<{ traitId: string; label: string }> } = {};
      try {
        if (user_identity_summary) {
          const p = JSON.parse(user_identity_summary) as { traitCounts?: Record<string, number>; confirmedTraits?: Array<{ traitId: string; label: string }> };
          previousArchive = { traitCounts: p.traitCounts ?? {}, confirmedTraits: p.confirmedTraits ?? [] };
        }
      } catch {
        /* ignore */
      }
      const existingByDateForAtlas = getReportByDate();
      const allStarDates = Object.keys(existingByDateForAtlas).filter(
        (d) =>
          existingByDateForAtlas[d]?.todayFlow ||
          existingByDateForAtlas[d]?.gardenerWord ||
          (existingByDateForAtlas[d]?.growthSeeds?.length ?? 0) > 0
      );
      const existingStarDates = allStarDates.filter((d) =>
        isDateAccessible(d, accessDays, unlockedMonths)
      );

      const analyzeUrl = getAnalyzeApiUrl();
      let analyzeRes: Response;
      try {
        analyzeRes = await fetch(analyzeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            journals: journalTexts,
            date: dateKey,
            user_identity_summary: user_identity_summary || undefined,
            existing_report: existing_report || undefined,
            recentJournalContents: getRecentJournalContents(data, { accessDays, unlockedMonths }),
            existingStarDates,
            previousConstellationName: getCurrentConstellation()?.name ?? undefined,
          }),
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error("[일기 해금 분석] fetch 실패:", { code: "NETWORK_ERROR", message: msg, url: analyzeUrl }, fetchErr);
        setIsLoadingReport(false);
        setAnalysisErrorMessage(
          "연결할 수 없어요. API 서버가 배포되어 있는지, 네트워크를 확인해 주세요."
        );
        return;
      }

      if (!analyzeRes.ok) {
        const status = analyzeRes.status;
        let bodyText = "";
        try {
          bodyText = await analyzeRes.text();
        } catch {
          bodyText = "(응답 본문 읽기 실패)";
        }
        let serverMessage = "";
        try {
          const parsed = JSON.parse(bodyText) as { error?: string };
          if (typeof parsed?.error === "string") serverMessage = parsed.error;
        } catch {
          serverMessage = bodyText?.slice(0, 150) || analyzeRes.statusText;
        }
        console.error("[일기 해금 분석] API 오류:", {
          status,
          statusText: analyzeRes.statusText,
          message: bodyText?.slice(0, 200) ?? "",
          url: analyzeUrl,
        });
        setIsLoadingReport(false);
        setAnalysisErrorMessage(
          serverMessage
            ? `서버: ${serverMessage}`
            : status === 404
              ? "분석 API를 찾을 수 없어요. API 서버 배포 여부를 확인해 주세요."
              : "잠시 별지기가 멀리 있어요. 네트워크를 확인해 주시거나 잠시 후 다시 불러 주세요."
        );
        return;
      }

      let analyzeData: unknown;
      try {
        analyzeData = await analyzeRes.json();
      } catch (parseErr) {
        console.error("[일기 해금 분석] 응답 JSON 파싱 실패:", parseErr);
        throw parseErr;
      }
      if (!analyzeData || typeof analyzeData !== "object") {
        console.error("[일기 해금 분석] AI 응답 비정상 (객체 아님):", typeof analyzeData, analyzeData);
        throw new Error("분석 응답 형식 오류");
      }

      if (!subtractLu(cost)) {
        setIsLoadingReport(false);
        return;
      }
      luSubtracted = true;
      window.dispatchEvent(new Event("lu-balance-updated"));
      const ad = analyzeData as { todayFlow?: string; gardenerWord?: string; growthSeeds?: string[]; keywords?: string[]; identityArchive?: unknown; updatedSummary?: string; metrics?: MoodScores; scores?: MoodScores; starPosition?: { x: number; y: number }; starConnections?: { from: string; to: string }[]; currentConstellations?: unknown[]; currentConstellation?: { name: string; meaning: string; connectionStyle?: string; starIds?: string[] }; newlyConfirmedTrait?: { label: string; opening: string; body: string; closing: string }; traitIdsIncrementedForThisDate?: string[]; counselorLetter?: string };
      const todayFlow = ad.todayFlow ?? null;
      const gardenerWord = ad.gardenerWord ?? null;
      const growthSeeds = Array.isArray(ad.growthSeeds) ? ad.growthSeeds : [];
      const keywords: [string, string, string] | undefined =
        Array.isArray(ad.keywords) && ad.keywords.length >= 3
          ? [String(ad.keywords[0]), String(ad.keywords[1]), String(ad.keywords[2])]
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
          const toSave = ad.identityArchive ?? { summary: ad.updatedSummary ?? "", traitCounts: {}, confirmedTraits: {} };
          getAppStorage().setItem("user_identity_summary", typeof toSave === "string" ? toSave : JSON.stringify(toSave));
          const metrics = (ad.metrics ?? ad.scores ?? {}) as MoodScores;
          if (metrics && Object.keys(metrics).length > 0) {
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
            ...(Array.isArray(ad.traitIdsIncrementedForThisDate) && ad.traitIdsIncrementedForThisDate.length > 0 && {
              traitIdsContributed: ad.traitIdsIncrementedForThisDate,
            }),
          });
          if (dateKey === getTodayKey() && growthSeeds.length > 0) {
            const tomorrowKey = getTomorrowKey();
            setQuestsForDate(tomorrowKey, []);
            setSelectedQuests([]);
            window.dispatchEvent(new Event("dailyQuests-updated"));
          }
          if (ad.keywords) {
            getAppStorage().setItem(
              "arisum-latest-analysis",
              JSON.stringify({ keywords: ad.keywords, counselorLetter: ad.counselorLetter })
            );
          }
          if (ad.starPosition && keywords) {
            const combinedText = getCombinedJournalText(dateKey, data);
            mergeAtlasWithNewStar(
              dateKey,
              ad.starPosition,
              keywords,
              ad.starConnections ?? [],
              combinedText.length
            );
          }
          if (Array.isArray(ad.currentConstellations) && ad.currentConstellations.length > 0) {
            setActiveConstellations(ad.currentConstellations as ActiveConstellation[]);
          } else if (ad.currentConstellation) {
            setCurrentConstellation(ad.currentConstellation as CurrentConstellation);
          }
          if (ad.newlyConfirmedTrait) {
            setTraitConfirmPopup({
              label: ad.newlyConfirmedTrait.label,
              opening: ad.newlyConfirmedTrait.opening,
              body: ad.newlyConfirmedTrait.body,
              closing: ad.newlyConfirmedTrait.closing,
            });
          }
          const newArchive = ad.identityArchive as { traitCounts?: Record<string, number>; confirmedTraits?: Array<{ traitId: string; label: string }> } | undefined;
          if (newArchive && typeof newArchive === "object" && Array.isArray(newArchive.confirmedTraits)) {
            const newCounts = newArchive.traitCounts ?? {};
            const oldCounts = previousArchive.traitCounts ?? {};
            for (const t of newArchive.confirmedTraits) {
              const oldC = oldCounts[t.traitId] ?? 0;
              const newC = newCounts[t.traitId] ?? 0;
              const oldL = getTraitLevel(oldC);
              const newL = getTraitLevel(newC);
              if (newL > oldL && newL >= 2) {
                setLevelUpPopup({
                  label: t.label,
                  newLevel: newL as TraitLevel,
                  message: TRAIT_LEVEL_MESSAGES[newL as TraitLevel],
                });
                break;
              }
            }
          }
        } catch {
          // ignore
        }
      }
      window.dispatchEvent(new Event("report-updated"));
    } catch (error) {
      const err = error as { status?: number; message?: string };
      console.error("[일기 해금 분석] 실패:", {
        code: err?.status ?? "ERROR",
        message: err?.message ?? String(error),
      }, error);
      setAnalysisErrorMessage("잠시 별지기가 멀리 있어요. 네트워크를 확인해 주시거나 잠시 후 다시 불러 주세요.");
      setReportData({
        date: dateKey,
        todayFlow: null,
        gardenerWord: null,
        growthSeeds: [],
        hasEntry: true,
      });
      if (luSubtracted) {
        addLu(cost);
        window.dispatchEvent(new Event("lu-balance-updated"));
      }
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleReanalyze = async () => {
    if (!selectedDate || isReanalyzing) return;
    const reCost = getRequiredShards(tier, "re_analysis");
    const lu = getLuBalance();
    if (lu < reCost) return;
    setShowReanalyzeModal(false);
    setIsReanalyzing(true);
    try {
      const entries = (journals[selectedDate] ?? [])
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const journalTexts = entries.map((e) => e.content.trim()).filter(Boolean);
      if (journalTexts.length === 0) {
        setIsReanalyzing(false);
        return;
      }
      const user_identity_summary =
        typeof window !== "undefined" ? getAppStorage().getItem("user_identity_summary") : null;
      let previousArchiveRe: { traitCounts?: Record<string, number>; confirmedTraits?: Array<{ traitId: string; label: string }> } = {};
      try {
        if (user_identity_summary) {
          const p = JSON.parse(user_identity_summary) as { traitCounts?: Record<string, number>; confirmedTraits?: Array<{ traitId: string; label: string }> };
          previousArchiveRe = { traitCounts: p.traitCounts ?? {}, confirmedTraits: p.confirmedTraits ?? [] };
        }
      } catch {
        /* ignore */
      }
      const existing = getReportByDate()[selectedDate];
      const existingByDateRe = getReportByDate();
      const allStarDatesRe = Object.keys(existingByDateRe).filter(
        (d) =>
          existingByDateRe[d]?.todayFlow ||
          existingByDateRe[d]?.gardenerWord ||
          (existingByDateRe[d]?.growthSeeds?.length ?? 0) > 0
      );
      const existingStarDatesRe = allStarDatesRe.filter((d) =>
        isDateAccessible(d, accessDays, unlockedMonths)
      );
      const analyzeUrlRe = getAnalyzeApiUrl();
      let res: Response;
      try {
        res = await fetch(analyzeUrlRe, {
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
            recentJournalContents: getRecentJournalContents(journals, { accessDays, unlockedMonths }),
            existingStarDates: existingStarDatesRe,
            previousConstellationName: getCurrentConstellation()?.name ?? undefined,
          }),
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error("[다시 분석] fetch 실패:", { code: "NETWORK_ERROR", message: msg, url: analyzeUrlRe }, fetchErr);
        setAnalysisErrorMessage("잠시 별지기가 멀리 있어요. 네트워크를 확인해 주시거나 잠시 후 다시 불러 주세요.");
        setIsReanalyzing(false);
        return;
      }
      if (!res.ok) {
        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch {
          bodyText = "(응답 본문 읽기 실패)";
        }
        let serverMessage = "";
        try {
          const parsed = JSON.parse(bodyText) as { error?: string };
          if (typeof parsed?.error === "string") serverMessage = parsed.error;
        } catch {
          serverMessage = bodyText?.slice(0, 150) || res.statusText;
        }
        console.error("[다시 분석] API 오류:", { status: res.status, statusText: res.statusText, message: bodyText?.slice(0, 200) ?? "", url: analyzeUrlRe });
        setAnalysisErrorMessage(
          serverMessage
            ? `서버: ${serverMessage}`
            : res.status === 404
              ? "분석 API를 찾을 수 없어요. API 서버 배포 여부를 확인해 주세요."
              : "잠시 별지기가 멀리 있어요. 네트워크를 확인해 주시거나 잠시 후 다시 불러 주세요."
        );
        setIsReanalyzing(false);
        return;
      }
      let analyzeData: unknown;
      try {
        analyzeData = await res.json();
      } catch (parseErr) {
        console.error("[다시 분석] 응답 JSON 파싱 실패:", parseErr);
        setAnalysisErrorMessage("잠시 별지기가 멀리 있어요. 네트워크를 확인해 주시거나 잠시 후 다시 불러 주세요.");
        setIsReanalyzing(false);
        return;
      }
      if (!analyzeData || typeof analyzeData !== "object") {
        console.error("[다시 분석] AI 응답 비정상 (객체 아님):", typeof analyzeData, analyzeData);
        setAnalysisErrorMessage("잠시 별지기가 멀리 있어요. 네트워크를 확인해 주시거나 잠시 후 다시 불러 주세요.");
        setIsReanalyzing(false);
        return;
      }
      if (!subtractLu(reCost)) {
        setIsReanalyzing(false);
        return;
      }
      window.dispatchEvent(new Event("lu-balance-updated"));
      const adRe = analyzeData as { todayFlow?: string; gardenerWord?: string; growthSeeds?: string[]; keywords?: string[]; identityArchive?: unknown; updatedSummary?: string; metrics?: MoodScores; scores?: MoodScores; traitIdsIncrementedForThisDate?: string[]; starPosition?: { x: number; y: number }; starConnections?: { from: string; to: string }[]; currentConstellations?: unknown[]; currentConstellation?: { name: string; meaning: string; connectionStyle?: string; starIds?: string[] }; newlyConfirmedTrait?: { label: string; opening: string; body: string; closing: string }; counselorLetter?: string };
      const todayFlow = adRe.todayFlow ?? null;
      const gardenerWord = adRe.gardenerWord ?? null;
      const growthSeeds = Array.isArray(adRe.growthSeeds) ? adRe.growthSeeds : [];
      const keywords: [string, string, string] | undefined =
        Array.isArray(adRe.keywords) && adRe.keywords.length >= 3
          ? [String(adRe.keywords[0]), String(adRe.keywords[1]), String(adRe.keywords[2])]
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
        ...(Array.isArray(adRe.traitIdsIncrementedForThisDate) && adRe.traitIdsIncrementedForThisDate.length > 0 && {
          traitIdsContributed: adRe.traitIdsIncrementedForThisDate,
        }),
      });
      if (typeof window !== "undefined") {
        try {
          const toSave = adRe.identityArchive ?? { summary: adRe.updatedSummary ?? "", traitCounts: {}, confirmedTraits: {} };
          getAppStorage().setItem("user_identity_summary", typeof toSave === "string" ? toSave : JSON.stringify(toSave));
          const metrics = (adRe.metrics ?? adRe.scores ?? {}) as MoodScores;
          if (metrics && Object.keys(metrics).length > 0) {
            getAppStorage().setItem(
              "arisum-latest-scores",
              JSON.stringify({ date: selectedDate, scores: metrics })
            );
            const historyRaw = getAppStorage().getItem("arisum-scores-history");
            const history: Record<string, MoodScores> = historyRaw ? JSON.parse(historyRaw) : {};
            history[selectedDate] = metrics;
            getAppStorage().setItem("arisum-scores-history", JSON.stringify(history));
          }
          if (adRe.keywords) {
            getAppStorage().setItem(
              "arisum-latest-analysis",
              JSON.stringify({
                keywords: adRe.keywords,
                counselorLetter: adRe.counselorLetter,
              })
            );
          }
          if (adRe.starPosition && keywords) {
            const combinedTextRe = getCombinedJournalText(selectedDate, journals);
            mergeAtlasWithNewStar(
              selectedDate,
              adRe.starPosition,
              keywords,
              adRe.starConnections ?? [],
              combinedTextRe.length
            );
          }
          if (Array.isArray(adRe.currentConstellations) && adRe.currentConstellations.length > 0) {
            setActiveConstellations(adRe.currentConstellations as ActiveConstellation[]);
          } else if (adRe.currentConstellation) {
            setCurrentConstellation(adRe.currentConstellation as CurrentConstellation);
          }
          if (adRe.newlyConfirmedTrait) {
            setTraitConfirmPopup({
              label: adRe.newlyConfirmedTrait.label,
              opening: adRe.newlyConfirmedTrait.opening,
              body: adRe.newlyConfirmedTrait.body,
              closing: adRe.newlyConfirmedTrait.closing,
            });
          }
          const newArchiveRe = adRe.identityArchive as { traitCounts?: Record<string, number>; confirmedTraits?: Array<{ traitId: string; label: string }> } | undefined;
          if (newArchiveRe && typeof newArchiveRe === "object" && Array.isArray(newArchiveRe.confirmedTraits)) {
            const newCountsRe = newArchiveRe.traitCounts ?? {};
            const oldCountsRe = previousArchiveRe.traitCounts ?? {};
            for (const t of newArchiveRe.confirmedTraits) {
              const oldC = oldCountsRe[t.traitId] ?? 0;
              const newC = newCountsRe[t.traitId] ?? 0;
              const oldL = getTraitLevel(oldC);
              const newL = getTraitLevel(newC);
              if (newL > oldL && newL >= 2) {
                setLevelUpPopup({
                  label: t.label,
                  newLevel: newL as TraitLevel,
                  message: TRAIT_LEVEL_MESSAGES[newL as TraitLevel],
                });
                break;
              }
            }
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
      // 별조각은 성공 시에만 차감했으므로 실패 시 환불 불필요
    } finally {
      setIsReanalyzing(false);
    }
  };

  const tier = getMembershipTier();
  const accessDays = MEMBERSHIP_ACCESS_DAYS[tier];
  const costDaily = getRequiredShards(tier, "daily_analysis");
  const costRe = getRequiredShards(tier, "re_analysis");
  const unlockedMonths = getUnlockedMonths();

  /** 첫 클릭: 날짜 선택 + 하단 리포트 표시. 봉인된 날짜 클릭 시 해금 유도 팝업 */
  const handleDateClick = (date: Date) => {
    const dateKey = formatDateKey(date);
    if (!isDateAccessible(dateKey, accessDays, unlockedMonths)) {
      setSealedDateKey(dateKey);
      return;
    }
    if (selectedDate === dateKey) {
      router.push(`/diary/${dateKey}`);
      return;
    }
    setSelectedDate(dateKey);
    loadReportData(dateKey);
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
      {(isLoadingReport || isReanalyzing) && (
        <LoadingOverlay message="diary-analysis" />
      )}
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
            className="rounded-3xl bg-white border border-[#E2E8F0] shadow-sm px-4 py-6 cursor-grab active:cursor-grabbing"
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
            <div className="grid grid-cols-7 gap-x-1 gap-y-4 mb-1 min-h-[2.2rem]">
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

            {/* Calendar days: 행 간격 확대, 셀 세로 비율·터치 영역·점 간격 조정 */}
            <div className="grid grid-cols-7 gap-x-1 gap-y-4">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="aspect-[1/1.2]" />;
                }

                const hasEntry = hasJournal(date);
                const todayFlag = isToday(date);
                const dateKey = formatDateKey(date);
                const isSelected = selectedDate === dateKey;
                const isSealed = !isDateAccessible(dateKey, accessDays, unlockedMonths);

                return (
                  <motion.button
                    key={date.toISOString()}
                    onClick={() => handleDateClick(date)}
                    className={`aspect-[1/1.2] rounded-2xl flex flex-col items-center justify-center relative transition-all hover:scale-105 ${
                      isSealed
                        ? "bg-[#E2E8F0]/30 text-[#94A3B8] cursor-pointer"
                        : isSelected && todayFlag
                        ? "bg-[#0F172A] text-white font-semibold ring-2 ring-[#FDE68A] ring-offset-2"
                        : isSelected
                        ? "bg-[#0F172A]/15 text-[#0F172A] font-semibold ring-2 ring-[#0F172A] ring-offset-2"
                        : todayFlag
                        ? "bg-[#0F172A] text-white font-semibold"
                        : "bg-[#E2E8F0]/50 text-[#0F172A] hover:bg-[#E2E8F0]"
                    }`}
                    style={isSealed ? { filter: "blur(1.5px)", opacity: 0.75 } : undefined}
                    whileTap={{ scale: 0.95 }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <span className="text-sm font-a2z-regular mb-1">{date.getDate()}</span>
                    {hasEntry && !isSealed && (
                      <div className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-[#0F172A]" />
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
                          <p className="text-sm leading-relaxed text-center w-full" style={{ color: MIDNIGHT_BLUE }}>
                            별지기가 {nickname}님의 일기를 분석했어요.
                          </p>
                          <div className="flex flex-col items-center gap-3">
                            <button
                              type="button"
                              onClick={() => selectedDate && (lu >= costDaily ? setShowUnlockConfirm(selectedDate) : null)}
                              disabled={lu < costDaily || isLoadingReport}
                              className="rounded-2xl px-6 py-4 text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              style={
                                lu >= costDaily
                                  ? {
                                      backgroundColor: CHAMPAGNE_GOLD,
                                      color: MIDNIGHT_BLUE,
                                      boxShadow: "0 0 12px rgba(253,230,138,0.6), 0 0 24px rgba(253,230,138,0.3)",
                                    }
                                  : { backgroundColor: "#94A3B8", color: "#FFFFFF" }
                              }
                            >
                              {LU_ICON} {costDaily} 해금하기
                            </button>
                            <p className="text-xs" style={{ color: MUTED }}>
                              보유 별조각 · <span className="font-semibold tabular-nums" style={{ color: MIDNIGHT_BLUE }}>{LU_ICON} {lu}</span>
                            </p>
                          </div>
                          {analysisErrorMessage && (
                            <p className="text-sm text-amber-600 text-center" role="alert">
                              {analysisErrorMessage}
                            </p>
                          )}
                          {lu < costDaily && (
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
                          다시 분석하기 ✨ {costRe} 별조각
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
                  <div className="flex flex-col items-center justify-center py-6 w-full">
                    <p className="text-sm leading-relaxed text-center" style={{ color: MUTED }}>
                      이날은 아직 기록이 없어요.
                      <br />
                      <span className="text-xs">
                        일기를 쓰고 별지기의 분석을 받아보세요.
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
                  별조각 {costDaily}개가 사용돼요.
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
                  별조각 {costRe}개를 사용해 이 날의 기록을 밤하늘에 올리시겠어요?
                </p>
                {getLuBalance() < costRe && (
                  <p className="text-xs text-amber-600 text-center mb-2">별조각이 부족해요</p>
                )}
                {getLuBalance() < costRe && (
                  <button
                    type="button"
                    onClick={() => { openStoreModal(); setShowReanalyzeModal(false); }}
                    className="text-xs font-medium text-amber-700 underline mb-4"
                  >
                    별조각 구매하기
                  </button>
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
                    disabled={getLuBalance() < costRe}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: getLuBalance() >= costRe ? "#0F172A" : "#94A3B8" }}
                  >
                    동기화하기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 시간의 봉인: 기억 범위 밖 날짜 클릭 시 — 기억 깨우기(200별조각) 또는 멤버십 유도 */}
        <AnimatePresence>
          {sealedDateKey && (() => {
            const yearMonth = sealedDateKey.slice(0, 7);
            const canUnlock = getLuBalance() >= COST_PERMANENT_MEMORY_KEY;
            const handleUnlockMonth = () => {
              if (!canUnlock) return;
              if (!subtractLu(COST_PERMANENT_MEMORY_KEY)) return;
              const months = getUnlockedMonths();
              if (!months.has(yearMonth)) setUnlockedMonths(new Set([...months, yearMonth]));
              window.dispatchEvent(new Event("lu-balance-updated"));
              setSealedDateKey(null);
            };
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
                onClick={() => setSealedDateKey(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
                >
                  <p className="text-sm leading-relaxed text-center mb-2" style={{ color: MIDNIGHT_BLUE }}>
                    별지기의 기억 너머에 있는 기록입니다. 별조각으로 기억을 깨우거나 멤버십으로 우주 전체를 연결해 보세요.
                  </p>
                  <div className="flex flex-col gap-3 mt-4">
                    <button
                      type="button"
                      onClick={handleUnlockMonth}
                      disabled={!canUnlock}
                      className="w-full rounded-xl py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: canUnlock ? MIDNIGHT_BLUE : "#94A3B8" }}
                    >
                      기억 깨우기 ({COST_PERMANENT_MEMORY_KEY}별조각 · 이 달 영구 해금)
                    </button>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSealedDateKey(null)}
                        className="flex-1 rounded-xl py-2.5 text-sm font-medium border border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]"
                        style={{ color: MIDNIGHT_BLUE }}
                      >
                        닫기
                      </button>
                      <button
                        type="button"
                        onClick={() => { openStoreModal(); setSealedDateKey(null); }}
                        className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: MIDNIGHT_BLUE }}
                      >
                        멤버십·상점
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* 7회 확정 성격 축하 팝업 — 고대비 프리미엄 */}
        <AnimatePresence>
          {traitConfirmPopup && (() => {
            const userName = getUserName() || "당신";
            const opening = replaceUserNameInText(traitConfirmPopup.opening, userName);
            const body = replaceUserNameInText(traitConfirmPopup.body, userName);
            const closing = replaceUserNameInText(traitConfirmPopup.closing, userName);
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-lg"
                style={{ backgroundColor: "rgba(5,8,16,0.92)" }}
                onClick={() => setTraitConfirmPopup(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative w-full max-w-sm rounded-2xl p-6 overflow-hidden"
                  style={{
                    backgroundColor: POPUP_BG,
                    border: "1px solid #FDE68A",
                    boxShadow: "0 0 0 1px rgba(253,230,138,0.2), 0 25px 50px -12px rgba(0,0,0,0.6)",
                  }}
                >
                  {/* 배경 별가루/반짝임 */}
                  <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden>
                    <svg className="absolute w-full h-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
                      {Array.from({ length: 24 }, (_, i) => (
                        <circle
                          key={i}
                          cx={20 + (i * 17) % 160}
                          cy={15 + (i * 13) % 170}
                          r={0.8 + (i % 3) * 0.4}
                          fill="#FDE68A"
                          opacity={0.4 + (i % 4) * 0.15}
                        />
                      ))}
                    </svg>
                  </div>

                  <p
                    className="relative text-[11px] font-medium uppercase tracking-wider mb-3"
                    style={{ fontFamily: "var(--font-a2z-r), sans-serif", color: "rgba(226,232,240,0.7)" }}
                  >
                    별자리 완성
                  </p>
                  <div className="relative">
                    <h3
                      className="text-xl font-medium mb-4"
                      style={{
                        fontFamily: "var(--font-a2z-m), sans-serif",
                        color: CHAMPAGNE_GOLD,
                        textShadow: "0 0 12px rgba(253,230,138,0.5), 0 0 24px rgba(253,230,138,0.25)",
                      }}
                    >
                      {traitConfirmPopup.label}
                    </h3>
                    <p
                      className="text-sm leading-relaxed mb-2"
                      style={{ fontFamily: "var(--font-a2z-regular), sans-serif", color: SILVER_WHITE }}
                    >
                      {opening}
                    </p>
                    <p
                      className="text-sm leading-relaxed mb-2"
                      style={{ fontFamily: "var(--font-a2z-regular), sans-serif", color: SILVER_WHITE }}
                    >
                      {body}
                    </p>
                    <p
                      className="text-sm font-medium mt-3"
                      style={{
                        fontFamily: "var(--font-a2z-m), sans-serif",
                        color: CHAMPAGNE_GOLD,
                      }}
                    >
                      {closing}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTraitConfirmPopup(null)}
                    className="relative mt-5 w-full rounded-xl py-2.5 text-sm font-medium"
                    style={{
                      fontFamily: "var(--font-a2z-m), sans-serif",
                      backgroundColor: CHAMPAGNE_GOLD,
                      color: MIDNIGHT_BLUE,
                    }}
                  >
                    확인
                  </button>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* 레벨업(2~5단계) 축하 팝업 */}
        <AnimatePresence>
          {levelUpPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-lg"
              style={{ backgroundColor: "rgba(5,8,16,0.92)" }}
              onClick={() => setLevelUpPopup(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm rounded-2xl p-6 overflow-hidden"
                style={{
                  backgroundColor: POPUP_BG,
                  border: "1px solid #FDE68A",
                  boxShadow: "0 0 0 1px rgba(253,230,138,0.2), 0 25px 50px -12px rgba(0,0,0,0.6)",
                }}
              >
                <p
                  className="relative text-[11px] font-medium uppercase tracking-wider mb-1"
                  style={{ fontFamily: "var(--font-a2z-r), sans-serif", color: "rgba(226,232,240,0.7)" }}
                >
                  {TRAIT_LEVEL_NAMES[levelUpPopup.newLevel]} 단계
                </p>
                <h3
                  className="relative text-xl font-medium mb-3"
                  style={{
                    fontFamily: "var(--font-a2z-m), sans-serif",
                    color: CHAMPAGNE_GOLD,
                    textShadow: "0 0 12px rgba(253,230,138,0.5)",
                  }}
                >
                  {levelUpPopup.label}
                </h3>
                <p
                  className="relative text-sm leading-relaxed"
                  style={{ fontFamily: "var(--font-a2z-regular), sans-serif", color: SILVER_WHITE }}
                >
                  {levelUpPopup.message}
                </p>
                <button
                  type="button"
                  onClick={() => setLevelUpPopup(null)}
                  className="relative mt-5 w-full rounded-xl py-2.5 text-sm font-medium"
                  style={{
                    fontFamily: "var(--font-a2z-m), sans-serif",
                    backgroundColor: CHAMPAGNE_GOLD,
                    color: MIDNIGHT_BLUE,
                  }}
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
