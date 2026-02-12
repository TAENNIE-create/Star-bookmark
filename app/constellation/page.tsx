"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import { getUserName } from "../../lib/home-greeting";
import { getGlobalAtlasData, getActiveConstellations, CURRENT_ACTIVE_CONSTELLATIONS_KEY, type ConnectionStyle, type ActiveConstellation } from "../../lib/atlas-storage";
import type { MoodScores } from "../../lib/arisum-types";
import { MOOD_SCORE_KEYS } from "../../lib/arisum-types";
import { getApiUrl } from "../../lib/api-client";
import { getAppStorage } from "../../lib/app-storage";
import { TRAIT_CATEGORY_ORDER, TRAIT_CATEGORY_LABELS } from "../../constants/traits";
import type { TraitCategory } from "../../constants/traits";

/** 카테고리별 아이콘: 정서 ✦ / 관계 ✧ / 일 ✷ / 사고방식 ✹ / 자아 ✶ / 가치관 ✸ */
const TRAIT_CATEGORY_ICONS: Record<TraitCategory, string> = {
  emotional: "✦",
  interpersonal: "✧",
  workStyle: "✷",
  cognitive: "✹",
  selfConcept: "✶",
  values: "✸",
};
import { getIdentityArchive, removeExtinctTraits, setTestTraitPositive15 } from "../../lib/identity-archive";
import { getTraitLevel, getTraitLevelRecent, TRAIT_LEVEL_NAMES, type TraitLevel } from "../../lib/trait-level";
import { LoadingOverlay } from "../../components/arisum/loading-overlay";
import { getMembershipTier, MEMBERSHIP_ACCESS_DAYS, isDateAccessible } from "../../lib/economy";
import { getUnlockedMonths } from "../../lib/archive-unlock";

const SCORES_HISTORY_KEY = "arisum-scores-history";
const JOURNALS_KEY = "arisum-journals";
const IDENTITY_ARCHIVE_KEY = "user_identity_summary";
/** 밤하늘 탭 재진입 시 로딩 없이 바로 보여줄 캐시 (세션 유지, 5분) */
const PERSONALITY_PROFILE_CACHE_KEY = "arisum-personality-profile-cache";
const PERSONALITY_CACHE_TTL_MS = 5 * 60 * 1000;
const NIGHT_BG = "#050810";
const NAVY_CARD = "rgba(15,23,42,0.75)";
const CHAMPAGNE_GOLD = "#FDE68A";
const SILVER_WHITE = "#E2E8F0";

/** 지도 표현: 별자리당 메인 별 최대 개수(연결선만), 나머지는 점만 */
const MAX_MAIN_STARS_PER_CONSTELLATION = 6;
/** 지도 뷰포트 여백(%) */
const MAP_PADDING = 8;
/** 별 간 최소 거리(viewBox 0~100 기준). 이보다 가까우면 repulsion로 퍼짐 */
const MIN_DIST_VIEW = 5;
const REPULSION_ITERATIONS = 4;
/** 비강조 별자리 연결선 투명도 */
const FADED_LINE_OPACITY = 0.08;
const NORMAL_LINE_OPACITY = 0.5;
const HIGHLIGHT_LINE_OPACITY = 0.95;
const NORMAL_LINE_WIDTH = 0.4;
const HIGHLIGHT_LINE_WIDTH = 1;

type ConstellationStar = { id: string; date: string; x: number; y: number; size: number; keywords?: string[] };
type ConstellationGroup = { id: string; name: string; summary: string; starIds: string[]; confirmed?: boolean };
type ConstellationConnection = { from: string; to: string };
type TraitCardPlaceholder = {
  category: string;
  label: string;
  unlocked: boolean;
  traitLabel: string;
  opening: string;
  body: string;
  closing: string;
  evidence: string;
  traitId?: string;
  /** 장기 레벨(1~5). confirmed 카드용 */
  level?: TraitLevel;
  /** 장기: 마지막 기록일. 30일 미기록 시 fading */
  lastObservedDate?: string;
  /** 장기: 'active' | 'fading' (회색/채도 낮춤) */
  status?: "active" | "fading";
  /** 요즘의 나 카드용: 최근 기간 내 출현 횟수 */
  recentCount?: number;
  /** 요즘의 나 카드용: 7d vs 30d 변화 */
  trend?: "up" | "down" | "stable";
};

/** 기존 별자리 매핑용 (중간 섹션) */
const LEGACY_CATEGORIES = [
  { id: "echo", keys: ["selfAwareness", "openness"] as (keyof MoodScores)[] },
  { id: "flame", keys: ["resilience"] as (keyof MoodScores)[] },
  { id: "galaxy", keys: ["empathy"] as (keyof MoodScores)[] },
  { id: "voyage", keys: ["selfDirection"] as (keyof MoodScores)[] },
  { id: "value", keys: ["meaningOrientation"] as (keyof MoodScores)[] },
  { id: "reconcile", keys: ["selfAcceptance"] as (keyof MoodScores)[] },
] as const;

/** 카테고리별 은하수 필터 색상 (파스텔, 미드나잇 블루와 조화) */
const CATEGORY_COLORS: Record<
  (typeof LEGACY_CATEGORIES)[number]["id"],
  { label: string; color: string; colorRgb: string }
> = {
  echo: { label: "사고방식", color: "#CCFBF1", colorRgb: "204,251,241" },
  flame: { label: "정서", color: "#FBCFE8", colorRgb: "251,207,232" },
  galaxy: { label: "관계", color: "#BAE6FD", colorRgb: "186,230,253" },
  voyage: { label: "일", color: "#E2E8F0", colorRgb: "226,232,240" },
  value: { label: "가치관", color: "#DDD6FE", colorRgb: "221,214,254" },
  reconcile: { label: "자아", color: "#FDE68A", colorRgb: "253,230,138" },
};

/** 한글 명사 뒤 주어 조사: 받침 있으면 '이', 없으면 '가' */
function getSubjectParticle(noun: string): string {
  if (!noun || typeof noun !== "string") return "가";
  const last = noun.charCodeAt(noun.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "가";
  return (last - 0xac00) % 28 !== 0 ? "이" : "가";
}

const GRADUATION_SHOWN_KEY = "arisum-constellation-graduation-shown";
const ARCHIVE_CANDIDATES_KEY = "arisum-constellation-archive-candidates";
const MIN_STARS_TO_GRADUATE = 3;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getAllScoresHistory(): Record<string, MoodScores> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(SCORES_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getJournalContentsForConstellations(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const journals: Record<string, { content: string }[]> = raw ? JSON.parse(raw) : {};
    const out: Record<string, string> = {};
    for (const [date, entries] of Object.entries(journals)) {
      if (entries?.length > 0) out[date] = entries[entries.length - 1].content ?? "";
    }
    return out;
  } catch {
    return {};
  }
}

function getJournalEntryCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const journals: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
    return Object.values(journals).reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

const REPORT_BY_DATE_KEY = "arisum-report-by-date";

function getReportByDate(): Record<string, { keywords?: [string, string, string] }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getIdentityArchiveRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return getAppStorage().getItem(IDENTITY_ARCHIVE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getDateFromStarId(starId: string): string | null {
  const m = starId.match(/^star-(.+)$/);
  return m ? m[1] : null;
}

/** 오늘 포함 최근 7일의 일기 날짜 키 세트 (YYYY-MM-DD). 분석 시점이 아닌 일기 날짜 기준 '지금' 필터용 */
function getLast7DayDateSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const set = new Set<string>();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    set.add(`${y}-${m}-${day}`);
  }
  return set;
}

function getGraduationShownIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = getAppStorage().getItem(GRADUATION_SHOWN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function setGraduationShownId(id: string) {
  if (typeof window === "undefined") return;
  const set = getGraduationShownIds();
  set.add(id);
  getAppStorage().setItem(GRADUATION_SHOWN_KEY, JSON.stringify([...set]));
}

function getArchiveCandidates(): { id: string; name: string; summary: string; completedAt: string; starIds: string[] }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getAppStorage().getItem(ARCHIVE_CANDIDATES_KEY);
    return raw ? (JSON.parse(raw) as { id: string; name: string; summary: string; completedAt: string; starIds: string[] }[]) : [];
  } catch {
    return [];
  }
}

function addArchiveCandidate(c: ConstellationGroup) {
  if (typeof window === "undefined") return;
  const dates = c.starIds.map(getDateFromStarId).filter(Boolean) as string[];
  const completedAt = dates.length > 0 ? dates.sort().reverse()[0]! : new Date().toISOString().slice(0, 10);
  const prev = getArchiveCandidates();
  if (prev.some((x) => x.id === c.id)) return;
  getAppStorage().setItem(
    ARCHIVE_CANDIDATES_KEY,
    JSON.stringify([...prev, { id: c.id, name: c.name, summary: c.summary, completedAt, starIds: c.starIds }])
  );
}

/** 7일이 지나 지도/리스트에서 사라진 별자리를 별 서재(아카이브 후보)로 자동 이전 */
function addArchiveCandidateFromActive(ac: ActiveConstellation) {
  if (typeof window === "undefined") return;
  const starIds = ac.starIds ?? [];
  if (starIds.length < 2) return;
  const dates = starIds.map(getDateFromStarId).filter(Boolean) as string[];
  const completedAt = dates.length > 0 ? dates.sort().reverse()[0]! : new Date().toISOString().slice(0, 10);
  const prev = getArchiveCandidates();
  if (prev.some((x) => x.id === ac.id)) return;
  getAppStorage().setItem(
    ARCHIVE_CANDIDATES_KEY,
    JSON.stringify([...prev, { id: ac.id, name: ac.name, summary: ac.meaning ?? "", completedAt, starIds }])
  );
}

function getCategoryScore(scores: MoodScores, categoryKeys: (keyof MoodScores)[]): number {
  let sum = 0;
  let n = 0;
  for (const k of categoryKeys) {
    if (typeof scores[k] === "number") {
      sum += scores[k];
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

function assignCategory(
  constellation: ConstellationGroup,
  scoresHistory: Record<string, MoodScores>
): { categoryId: string; score: number } {
  const dates = constellation.starIds.map(getDateFromStarId).filter(Boolean) as string[];
  if (dates.length === 0) return { categoryId: LEGACY_CATEGORIES[0].id, score: 0 };
  let sum: Partial<MoodScores> = {};
  for (const d of dates) {
    const s = scoresHistory[d];
    if (!s) continue;
    for (const k of Object.keys(s) as (keyof MoodScores)[]) {
      sum[k] = (sum[k] ?? 0) + s[k];
    }
  }
  const n = dates.length;
  const avg: MoodScores = {
    selfAwareness: (sum.selfAwareness ?? 0) / n,
    resilience: (sum.resilience ?? 0) / n,
    empathy: (sum.empathy ?? 0) / n,
    selfDirection: (sum.selfDirection ?? 0) / n,
    meaningOrientation: (sum.meaningOrientation ?? 0) / n,
    openness: (sum.openness ?? 0) / n,
    selfAcceptance: (sum.selfAcceptance ?? 0) / n,
  };
  let best: { categoryId: (typeof LEGACY_CATEGORIES)[number]["id"]; score: number } = {
    categoryId: LEGACY_CATEGORIES[0].id,
    score: 0,
  };
  for (const cat of LEGACY_CATEGORIES) {
    const sc = getCategoryScore(avg, cat.keys);
    if (sc > best.score) best = { categoryId: cat.id, score: sc };
  }
  return best;
}

function getConstellationTotalScore(
  constellation: ConstellationGroup,
  scoresHistory: Record<string, MoodScores>
): number {
  const dates = constellation.starIds.map(getDateFromStarId).filter(Boolean) as string[];
  let total = 0;
  for (const d of dates) {
    const s = scoresHistory[d];
    if (!s) continue;
    total += (s.selfAwareness + s.resilience + s.empathy + s.selfDirection + s.meaningOrientation + s.openness + s.selfAcceptance) / 7;
  }
  return total + constellation.starIds.length * 5;
}

export default function ConstellationPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [data, setData] = useState<{
    stars: ConstellationStar[];
    constellations: ConstellationGroup[];
    connections: ConstellationConnection[];
  } | null>(null);
  const [activeConstellations, setActiveConstellationsState] = useState<ActiveConstellation[]>([]);
  const [selected, setSelected] = useState<ConstellationGroup | null>(null);
  const [graduationCandidate, setGraduationCandidate] = useState<ConstellationGroup | null>(null);
  const [traitPopupCard, setTraitPopupCard] = useState<TraitCardPlaceholder | null>(null);
  const [tooltipStarId, setTooltipStarId] = useState<string | null>(null);
  const [constellationDetailPopup, setConstellationDetailPopup] = useState<{
    name: string;
    meaning: string;
    keywords: string[];
    categoryLabel: string;
  } | null>(null);
  const [highlightedStarIds, setHighlightedStarIds] = useState<Set<string>>(new Set());
  const [traitCards, setTraitCards] = useState<TraitCardPlaceholder[]>([]);
  const [activeCards7d, setActiveCards7d] = useState<TraitCardPlaceholder[]>([]);
  const [activeCards30d, setActiveCards30d] = useState<TraitCardPlaceholder[]>([]);
  const [activeRange, setActiveRange] = useState<"7d" | "30d">("7d");
  /** 요즘의 나 필터: 전체 | 정서 | 관계 | 일 | 사고방식 | 자아 | 가치관 */
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<TraitCategory | "all">("all");
  const [isLoadingTraits, setIsLoadingTraits] = useState(false);
  /** 100일 경과로 목록에서 내려간 성격 안내 팝업 (한 번 표시 후 제거) */
  const [extinctTraitsToNotify, setExtinctTraitsToNotify] = useState<{ traitId: string; label: string }[]>([]);
  /** 진정한 나 아코디언: 카테고리별 펼침/접힘 (기본 접힘) */
  const [longTermExpanded, setLongTermExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TRAIT_CATEGORY_ORDER.map((c) => [c, false]))
  );

  useEffect(() => {
    setNickname(getUserName());
  }, []);

  const applyProfileData = useCallback(
    (data: {
      confirmedCards?: TraitCardPlaceholder[];
      cards?: TraitCardPlaceholder[];
      activeCards7d?: TraitCardPlaceholder[];
      activeCards30d?: TraitCardPlaceholder[];
      extinctTraits?: { traitId: string; label: string }[];
    }) => {
      setTraitCards(Array.isArray(data.confirmedCards) ? data.confirmedCards : Array.isArray(data.cards) ? data.cards : []);
      setActiveCards7d(Array.isArray(data.activeCards7d) ? data.activeCards7d : []);
      setActiveCards30d(Array.isArray(data.activeCards30d) ? data.activeCards30d : []);
      const extinct = Array.isArray(data.extinctTraits) ? data.extinctTraits : [];
      if (extinct.length > 0) {
        setExtinctTraitsToNotify(extinct);
        removeExtinctTraits(extinct.map((t) => t.traitId));
      }
    },
    []
  );

  const fetchPersonalityProfile = useCallback(
    (background = false) => {
      const raw = getIdentityArchiveRaw();
      const userName = nickname || getUserName();
      const journalContents = getJournalContentsForConstellations();
      const identitySummary =
        typeof window !== "undefined"
          ? (() => {
              try {
                const ar = raw ? JSON.parse(raw) : {};
                return typeof ar.summary === "string" ? ar.summary : "";
              } catch {
                return "";
              }
            })()
          : "";
      if (!background) setIsLoadingTraits(true);
      fetch(getApiUrl("/api/personality-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityArchiveRaw: raw || undefined,
          user_identity_summary: raw || undefined,
          userName,
          recentJournalContents: journalContents,
          identitySummary: identitySummary || undefined,
        }),
      })
        .then((r) => r.json())
        .then((data: {
          confirmedCards?: TraitCardPlaceholder[];
          cards?: TraitCardPlaceholder[];
          activeCards7d?: TraitCardPlaceholder[];
          activeCards30d?: TraitCardPlaceholder[];
          extinctTraits?: { traitId: string; label: string }[];
        }) => {
          applyProfileData(data);
          if (typeof window !== "undefined") {
            try {
              getAppStorage().setItem(
                PERSONALITY_PROFILE_CACHE_KEY,
                JSON.stringify({ at: Date.now(), data })
              );
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {
          if (!background) {
            setTraitCards([]);
            setActiveCards7d([]);
            setActiveCards30d([]);
          }
        })
        .finally(() => {
          if (!background) setIsLoadingTraits(false);
        });
    },
    [nickname, applyProfileData]
  );

  useEffect(() => {
    type CacheEntry = {
      at: number;
      data: {
        confirmedCards?: TraitCardPlaceholder[];
        cards?: TraitCardPlaceholder[];
        activeCards7d?: TraitCardPlaceholder[];
        activeCards30d?: TraitCardPlaceholder[];
        extinctTraits?: { traitId: string; label: string }[];
      };
    };
    let cached: CacheEntry | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = getAppStorage().getItem(PERSONALITY_PROFILE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (
            parsed &&
            typeof parsed === "object" &&
            "data" in parsed &&
            "at" in parsed &&
            typeof (parsed as CacheEntry).at === "number" &&
            Date.now() - (parsed as CacheEntry).at < PERSONALITY_CACHE_TTL_MS
          ) {
            cached = parsed as CacheEntry;
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (cached?.data) {
      applyProfileData(cached.data);
      fetchPersonalityProfile(true);
    } else {
      fetchPersonalityProfile();
    }
  }, [fetchPersonalityProfile, applyProfileData]);

  useEffect(() => {
    const onUpdate = () => fetchPersonalityProfile(true);
    window.addEventListener("report-updated", onUpdate);
    return () => window.removeEventListener("report-updated", onUpdate);
  }, [fetchPersonalityProfile]);

  useEffect(() => {
    if (typeof window !== "undefined") (window as unknown as { __setTestTraitPositive?: () => void }).__setTestTraitPositive = setTestTraitPositive15;
    return () => {
      if (typeof window !== "undefined") delete (window as unknown as { __setTestTraitPositive?: () => void }).__setTestTraitPositive;
    };
  }, []);

  useEffect(() => {
    if (!tooltipStarId) return;
    const t = setTimeout(() => setTooltipStarId(null), 4000);
    return () => clearTimeout(t);
  }, [tooltipStarId]);

  const handleBackdropClick = () => setTooltipStarId(null);

  const loadFromAtlasStorage = () => {
    const atlas = getGlobalAtlasData();
    setData({
      stars: atlas.stars as ConstellationStar[],
      constellations: atlas.constellations as ConstellationGroup[],
      connections: atlas.connections,
    });
    setActiveConstellationsState(getActiveConstellations());
  };

  useEffect(() => {
    loadFromAtlasStorage();
  }, []);

  useEffect(() => {
    const onUpdate = () => loadFromAtlasStorage();
    window.addEventListener("report-updated", onUpdate);
    window.addEventListener("journal-updated", onUpdate);
    window.addEventListener("constellation-updated", onUpdate);
    return () => {
      window.removeEventListener("report-updated", onUpdate);
      window.removeEventListener("journal-updated", onUpdate);
      window.removeEventListener("constellation-updated", onUpdate);
    };
  }, []);

  const scoresHistory = useMemo(() => getAllScoresHistory(), [data]);

  /** 카드별 레벨(1~5): traitCounts 기준 (장기) */
  const traitCardsWithLevel = useMemo(() => {
    if (typeof window === "undefined") return traitCards.map((c) => ({ ...c, level: 1 as TraitLevel }));
    const ar = getIdentityArchive();
    return traitCards.map((c) => ({
      ...c,
      level: getTraitLevel(ar.traitCounts[c.traitId ?? ""] ?? 7) as TraitLevel,
    }));
  }, [traitCards]);

  /** 요즘의 나: 7d/30d 선택에 따른 카드 목록 + 최근 기준 레벨 */
  const activeCardsWithLevel = useMemo(() => {
    const list = activeRange === "7d" ? activeCards7d : activeCards30d;
    return list.map((c) => ({
      ...c,
      level: getTraitLevelRecent(c.recentCount ?? 0) as TraitLevel,
    }));
  }, [activeRange, activeCards7d, activeCards30d]);

  const sevenDaysAgoForGraduate = useMemo(() => {
    const t = new Date().getTime() - SEVEN_DAYS_MS;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (!data || graduationCandidate) return;
    const shown = getGraduationShownIds();
    for (const c of data.constellations) {
      const recentCount = c.starIds.filter((id) => {
        const date = getDateFromStarId(id);
        return date && date >= sevenDaysAgoForGraduate;
      }).length;
      if (recentCount >= MIN_STARS_TO_GRADUATE && !shown.has(c.id)) {
        setGraduationCandidate(c);
        return;
      }
    }
  }, [data, sevenDaysAgoForGraduate, graduationCandidate]);

  const sevenDaysAgo = useMemo(() => {
    const t = new Date().getTime() - SEVEN_DAYS_MS;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const graduatedStarIds = useMemo(() => {
    if (!data) return new Set<string>();
    const shown = getGraduationShownIds();
    const ids = new Set<string>();
    for (const c of data.constellations) {
      if (!shown.has(c.id)) continue;
      const recentCount = c.starIds.filter((id) => {
        const date = getDateFromStarId(id);
        return date && date >= sevenDaysAgo;
      }).length;
      if (recentCount >= MIN_STARS_TO_GRADUATE) c.starIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [data, sevenDaysAgo]);

  /** '지금' 전용: 일기 날짜(diaryDate)가 오늘 포함 최근 7일 이내인 별만 표시. 분석 시점이 아닌 일기 날짜 기준. */
  const visibleStars = useMemo(() => {
    if (!data?.stars?.length) return [];
    const last7DayDateSet = getLast7DayDateSet();
    return data.stars.filter((s) => last7DayDateSet.has(s.date) && !graduatedStarIds.has(s.id));
  }, [data, graduatedStarIds]);
  const visibleStarIds = useMemo(() => new Set(visibleStars.map((s) => s.id)), [visibleStars]);

  /** 기억 범위 내 별만 연결: 등급(accessDays) + 기억의 열쇠 해금 월. 잠금된 시기는 별자리 선으로 이어지지 않음. */
  const accessibleStarIds = useMemo(() => {
    const tier = getMembershipTier();
    const accessDays = MEMBERSHIP_ACCESS_DAYS[tier];
    const unlockedMonths = new Set(getUnlockedMonths());
    const ids = new Set<string>();
    for (const s of data?.stars ?? []) {
      const dateKey = getDateFromStarId(s.id);
      if (dateKey && isDateAccessible(dateKey, accessDays, unlockedMonths)) ids.add(s.id);
    }
    return ids;
  }, [data?.stars]);

  const { skyStars, skyConnections } = useMemo(() => {
    const skyIdSet = new Set(visibleStars.map((s) => s.id));
    const skyConnectionsFiltered = (data?.connections ?? []).filter(
      (c) => skyIdSet.has(c.from) && skyIdSet.has(c.to) && accessibleStarIds.has(c.from) && accessibleStarIds.has(c.to)
    );
    return { skyStars: visibleStars, skyConnections: skyConnectionsFiltered };
  }, [visibleStars, data?.connections, accessibleStarIds]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log(`Stars Rendered: ${skyStars.length}개`);
    }
  }, [skyStars]);

  const constellationsWithCategory = useMemo(() => {
    if (!data) return [];
    return data.constellations.map((c) => ({
      ...c,
      ...assignCategory(c, scoresHistory),
      totalScore: getConstellationTotalScore(c, scoresHistory),
    }));
  }, [data, scoresHistory]);

  /** 별 id → 카테고리(색상·라벨). 해당 별을 포함한 첫 별자리의 카테고리 사용 */
  const starToCategoryMap = useMemo(() => {
    const map = new Map<string, { categoryId: string; label: string; color: string; colorRgb: string }>();
    for (const c of constellationsWithCategory) {
      const info = CATEGORY_COLORS[c.categoryId as keyof typeof CATEGORY_COLORS];
      if (!info) continue;
      for (const sid of c.starIds) {
        if (!map.has(sid)) map.set(sid, { categoryId: c.categoryId, ...info });
      }
    }
    for (const ac of activeConstellations) {
      if (!ac.starIds?.length) continue;
      const virtual = { id: ac.id, name: "", summary: "", starIds: ac.starIds };
      const { categoryId } = assignCategory(virtual, scoresHistory);
      const info = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.reconcile;
      for (const sid of ac.starIds) {
        if (!map.has(sid)) map.set(sid, { categoryId, ...info });
      }
    }
    return map;
  }, [constellationsWithCategory, activeConstellations, scoresHistory]);

  /** 7대 지표 공간에서 centroid로부터의 거리 (정규화 0~100) */
  function metricDistance(scores: MoodScores, centroid: MoodScores): number {
    let sum = 0;
    for (const k of MOOD_SCORE_KEYS) {
      const a = scores[k] ?? 0;
      const b = centroid[k] ?? 0;
      sum += (a - b) ** 2;
    }
    return Math.sqrt(sum);
  }

  /** 별자리 내 별을 지표 유사도(기록의 닮음) 순으로 정렬한 id 배열 */
  function orderStarIdsBySimilarity(starIds: string[]): string[] {
    if (starIds.length <= 1) return starIds;
    const dates = starIds.map(getDateFromStarId).filter(Boolean) as string[];
    const metricsList = dates.map((d) => scoresHistory[d]).filter(Boolean) as MoodScores[];
    if (metricsList.length === 0) return starIds;
    const centroid: MoodScores = {
      selfAwareness: 0,
      resilience: 0,
      empathy: 0,
      selfDirection: 0,
      meaningOrientation: 0,
      openness: 0,
      selfAcceptance: 0,
    };
    for (const m of metricsList) {
      for (const k of MOOD_SCORE_KEYS) centroid[k] += m[k] ?? 0;
    }
    const n = metricsList.length;
    for (const k of MOOD_SCORE_KEYS) centroid[k] = centroid[k] / n;
    const withDist = starIds.map((id) => {
      const date = getDateFromStarId(id);
      const m = date ? scoresHistory[date] : null;
      const dist = m ? metricDistance(m, centroid) : 999;
      return { id, dist };
    });
    withDist.sort((a, b) => a.dist - b.dist);
    return withDist.map((x) => x.id);
  }

  /** 지표 유사도 기반 연결 경로 (별자리별, 카테고리 색상 + 직선/곡선). 기억 범위 내 별끼리만 선 연결. */
  const constellationPathsWithColor = useMemo(() => {
    const segments: { from: string; to: string; colorRgb: string; curved: boolean }[] = [];
    const addSegment = (from: string, to: string, colorRgb: string, curved: boolean) => {
      if (accessibleStarIds.has(from) && accessibleStarIds.has(to)) segments.push({ from, to, colorRgb, curved });
    };
    for (const c of constellationsWithCategory) {
      const ordered = orderStarIdsBySimilarity(c.starIds);
      const info = CATEGORY_COLORS[c.categoryId as keyof typeof CATEGORY_COLORS];
      const colorRgb = info?.colorRgb ?? "253,230,138";
      const curved = c.categoryId === "flame" || c.categoryId === "galaxy";
      for (let i = 0; i < ordered.length - 1; i++) {
        addSegment(ordered[i]!, ordered[i + 1]!, colorRgb, curved);
      }
    }
    for (const ac of activeConstellations) {
      const visibleIds = (ac.starIds ?? []).filter((id) => visibleStarIds.has(id));
      if (visibleIds.length < 2) continue;
      const ordered = orderStarIdsBySimilarity(visibleIds);
      const virtual = { id: ac.id, name: "", summary: "", starIds: visibleIds };
      const { categoryId } = assignCategory(virtual, scoresHistory);
      const info = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.reconcile;
      const curved = ac.connectionStyle === "B" || categoryId === "flame" || categoryId === "galaxy";
      for (let i = 0; i < ordered.length - 1; i++) {
        addSegment(ordered[i]!, ordered[i + 1]!, info.colorRgb, curved);
      }
    }
    return segments;
  }, [constellationsWithCategory, activeConstellations, visibleStarIds, accessibleStarIds, scoresHistory]);

  const topConstellations = useMemo(() => {
    const sorted = [...constellationsWithCategory].sort((a, b) => b.totalScore - a.totalScore);
    return sorted.slice(0, 7);
  }, [constellationsWithCategory]);

  const starMap = data ? new Map(data.stars.map((s) => [s.id, s])) : new Map<string, ConstellationStar>();
  const skyStarMap = new Map(skyStars.map((s) => [s.id, s]));
  const vb = { x: -8, y: -8, w: 116, h: 116 };
  const selectedStarIds = selected ? new Set(selected.starIds) : new Set<string>();

  /** 밤하늘에 표시할 별: 최근 7일 이내만 (스냅샷 즉시 표시, 분석 호출 없음). 원본 좌표 유지. */
  const atlasStars = useMemo(() => {
    return visibleStars.map((s) => ({
      id: s.id,
      date: s.date,
      left: s.x,
      top: s.y,
      keywords: (s.keywords ?? []) as string[],
    }));
  }, [visibleStars]);

  /** 표현용 좌표: bbox 스케일/이동 후 repulsion 적용. 스토리지/원본 변경 없음. */
  const displayStars = useMemo(() => {
    if (atlasStars.length === 0) return [];
    const pts = atlasStars.map((s) => ({ ...s, left: s.left, top: s.top }));
    const minX = Math.min(...pts.map((p) => p.left));
    const maxX = Math.max(...pts.map((p) => p.left));
    const minY = Math.min(...pts.map((p) => p.top));
    const maxY = Math.max(...pts.map((p) => p.top));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min((100 - 2 * MAP_PADDING) / rangeX, (100 - 2 * MAP_PADDING) / rangeY, 1.8);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const p of pts) {
      p.left = 50 + (p.left - cx) * scale;
      p.top = 50 + (p.top - cy) * scale;
    }
    for (let iter = 0; iter < REPULSION_ITERATIONS; iter++) {
      const dx: Record<string, number> = {};
      const dy: Record<string, number> = {};
      for (const s of pts) {
        dx[s.id] = 0;
        dy[s.id] = 0;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]!;
          const b = pts[j]!;
          const dist = Math.hypot(a.left - b.left, a.top - b.top);
          if (dist < MIN_DIST_VIEW && dist > 0.01) {
            const push = (MIN_DIST_VIEW - dist) / 2;
            const nx = (a.left - b.left) / dist;
            const ny = (a.top - b.top) / dist;
            dx[a.id]! += nx * push;
            dy[a.id]! += ny * push;
            dx[b.id]! -= nx * push;
            dy[b.id]! -= ny * push;
          }
        }
      }
      for (const p of pts) {
        p.left += dx[p.id] ?? 0;
        p.top += dy[p.id] ?? 0;
        p.left = Math.max(2, Math.min(98, p.left));
        p.top = Math.max(2, Math.min(98, p.top));
      }
    }
    return pts;
  }, [atlasStars]);

  /** Atlas 연결선: 참고용. 실제 렌더는 mapSegmentsToDraw만 사용. 기억 범위 내 날짜끼리만 연결. */
  const atlasConnections = useMemo(() => {
    if (!data?.connections?.length || atlasStars.length === 0) return [];
    return data.connections.filter(
      (c) => visibleStarIds.has(c.from) && visibleStarIds.has(c.to) && accessibleStarIds.has(c.from) && accessibleStarIds.has(c.to)
    );
  }, [data?.connections, visibleStarIds, accessibleStarIds, atlasStars.length]);

  /** 활성 별자리별 메타: centroid, connectionStyle, categoryRgb, radialSegments(C일 때), 이름 위치(겹치지 않도록 오프셋) */
  const activeConstellationsMeta = useMemo(() => {
    const list: Array<{
      constellation: ActiveConstellation;
      visibleStarIds: Set<string>;
      centroid: { x: number; y: number };
      connectionStyle: ConnectionStyle;
      categoryRgb: string;
      radialSegments: Array<{ cx: number; cy: number; x: number; y: number }>;
      namePosition: { x: number; y: number };
    }> = [];
    for (let idx = 0; idx < activeConstellations.length; idx++) {
      const ac = activeConstellations[idx]!;
      const visibleIds = (ac.starIds ?? []).filter((id) => visibleStarIds.has(id));
      if (visibleIds.length < 2) continue;
      const pts = atlasStars.filter((s) => visibleIds.includes(s.id));
      if (pts.length === 0) continue;
      const sumX = pts.reduce((a, p) => a + p.left, 0);
      const sumY = pts.reduce((a, p) => a + p.top, 0);
      const centroid = { x: sumX / pts.length, y: sumY / pts.length };
      const style = ac.connectionStyle ?? "B";
      const virtual = { id: ac.id, name: "", summary: "", starIds: visibleIds };
      const { categoryId } = assignCategory(virtual, scoresHistory);
      const info = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.reconcile;
      const radialSegments = style === "C" ? pts.map((s) => ({ cx: centroid.x, cy: centroid.y, x: s.left, y: s.top })) : [];
      const sortedByDate = [...pts].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      const latestStar = sortedByDate[0];
      const namePosition = latestStar
        ? { x: latestStar.left, y: Math.max(8, latestStar.top - 5) }
        : { x: Math.max(5, Math.min(95, centroid.x)), y: Math.max(8, Math.min(92, centroid.y - 5)) };
      list.push({ constellation: ac, visibleStarIds: new Set(visibleIds), centroid, connectionStyle: style, categoryRgb: info.colorRgb, radialSegments, namePosition });
    }
    return list;
  }, [activeConstellations, visibleStarIds, atlasStars, scoresHistory]);

  /** 별자리별 메인 별 최대 N개: degree + keywordsCount + size 기반 점수 상위. 연결선은 이 별들끼리만. */
  const mainStarIdsByConstellation = useMemo(() => {
    const connCount = new Map<string, number>();
    if (data?.connections) {
      for (const c of data.connections) {
        if (visibleStarIds.has(c.from)) connCount.set(c.from, (connCount.get(c.from) ?? 0) + 1);
        if (visibleStarIds.has(c.to)) connCount.set(c.to, (connCount.get(c.to) ?? 0) + 1);
      }
    }
    const result = new Map<string, Set<string>>();
    for (const meta of activeConstellationsMeta) {
      const ids = [...meta.visibleStarIds];
      const withScore = ids.map((id) => {
        const degree = connCount.get(id) ?? 0;
        const star = atlasStars.find((s) => s.id === id);
        const keywordsCount = star?.keywords?.length ?? 0;
        const rawStar = data?.stars?.find((s) => s.id === id);
        const contentProxy = (rawStar as { size?: number } | undefined)?.size ?? 0;
        const score = degree + keywordsCount * 2 + contentProxy * 0.2;
        return { id, score };
      });
      withScore.sort((a, b) => b.score - a.score);
      const mainIds = new Set(withScore.slice(0, MAX_MAIN_STARS_PER_CONSTELLATION).map((x) => x.id));
      result.set(meta.constellation.id, mainIds);
    }
    return result;
  }, [activeConstellationsMeta, atlasStars, data?.connections, data?.stars, visibleStarIds]);

  /** 지도에 그릴 연결선: 활성 별자리 메인 별끼리만, 직선. 대표 1개만 강조·나머지 매우 연하게. */
  const mapSegmentsToDraw = useMemo(() => {
    const primaryId =
      highlightedStarIds.size >= 2
        ? activeConstellationsMeta.find((m) => [...m.visibleStarIds].every((id) => highlightedStarIds.has(id)))?.constellation.id ??
          activeConstellationsMeta[0]?.constellation.id
        : activeConstellationsMeta[0]?.constellation.id;
    const displayById = new Map(displayStars.map((s) => [s.id, s]));
    type Seg = { x1: number; y1: number; x2: number; y2: number; colorRgb: string; isPrimary: boolean; isHighlighted: boolean };
    const segments: Seg[] = [];
    for (const meta of activeConstellationsMeta) {
      const mainIds = mainStarIdsByConstellation.get(meta.constellation.id);
      if (!mainIds || mainIds.size < 2) continue;
      const isPrimary = meta.constellation.id === primaryId;
      const isHighlighted =
        highlightedStarIds.size >= 2 && [...meta.visibleStarIds].every((id) => highlightedStarIds.has(id));
      if (meta.connectionStyle === "C") {
        const centroidPts = [...mainIds].map((id) => displayById.get(id)).filter(Boolean) as { left: number; top: number }[];
        if (centroidPts.length >= 1) {
          const cx = centroidPts.reduce((a, p) => a + p.left, 0) / centroidPts.length;
          const cy = centroidPts.reduce((a, p) => a + p.top, 0) / centroidPts.length;
          for (const id of mainIds) {
            const p = displayById.get(id);
            if (!p) continue;
            segments.push({
              x1: cx,
              y1: cy,
              x2: p.left,
              y2: p.top,
              colorRgb: meta.categoryRgb,
              isPrimary,
              isHighlighted,
            });
          }
        }
      } else {
        const ordered = orderStarIdsBySimilarity([...mainIds]);
        for (let i = 0; i < ordered.length - 1; i++) {
          const fromId = ordered[i]!;
          const toId = ordered[i + 1]!;
          const fromP = displayById.get(fromId);
          const toP = displayById.get(toId);
          if (!fromP || !toP) continue;
          segments.push({
            x1: fromP.left,
            y1: fromP.top,
            x2: toP.left,
            y2: toP.top,
            colorRgb: meta.categoryRgb,
            isPrimary,
            isHighlighted,
          });
        }
      }
    }
    return segments;
  }, [activeConstellationsMeta, mainStarIdsByConstellation, displayStars, highlightedStarIds, scoresHistory]);

  /** 표현 좌표 기준 이름 위치(대표 별자리만 라벨 표시용). */
  const primaryMetaForLabel = useMemo(() => {
    const primaryId =
      highlightedStarIds.size >= 2
        ? activeConstellationsMeta.find((m) => [...m.visibleStarIds].every((id) => highlightedStarIds.has(id)))?.constellation.id ??
          activeConstellationsMeta[0]?.constellation.id
        : activeConstellationsMeta[0]?.constellation.id;
    const meta = activeConstellationsMeta.find((m) => m.constellation.id === primaryId);
    if (!meta) return null;
    const pts = displayStars.filter((s) => meta.visibleStarIds.has(s.id));
    if (pts.length === 0) return { ...meta, namePosition: { x: 50, y: 50 } };
    const sorted = [...pts].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const latest = sorted[0]!;
    const x = Math.max(18, Math.min(82, latest.left));
    const y = Math.max(8, Math.min(92, latest.top - 4));
    return {
      ...meta,
      namePosition: { x, y },
    };
  }, [activeConstellationsMeta, displayStars, highlightedStarIds]);

  /** 리스트-지도 동기화: 최근 7일 별이 2개 이상인 별자리만 표시 (지도와 동일 기준) */
  const visibleActiveConstellations = useMemo(() => {
    return activeConstellations.filter((ac) => {
      const visibleCount = (ac.starIds ?? []).filter((id) => visibleStarIds.has(id)).length;
      return visibleCount >= 2;
    });
  }, [activeConstellations, visibleStarIds]);

  const defaultConnectionStyle: ConnectionStyle = "B";

  /** 데이터 무결성: localStorage current_active_constellations vs 지도에 실제로 그려진 별자리 수 확인 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromStorage = getActiveConstellations();
    console.log("[Constellation Map] localStorage current_active_constellations:", fromStorage.length, fromStorage.map((c) => ({ name: c.name, starIds: c.starIds?.length ?? 0 })));
    console.log("[Constellation Map] Rendered on map (activeConstellationsMeta):", activeConstellationsMeta.length, activeConstellationsMeta.map((m) => m.constellation.name));
    if (fromStorage.length !== activeConstellationsMeta.length) {
      const renderedIds = new Set(activeConstellationsMeta.map((m) => m.constellation.id));
      const omitted = fromStorage.filter((c) => !renderedIds.has(c.id));
      console.log("[Constellation Map] Omitted (visible stars < 2 or not in view):", omitted.map((c) => c.name));
    }
  }, [activeConstellationsMeta]);

  /** 7일이 지나 지도/리스트에서 사라진 별자리는 별 서재(아카이브 후보)로 자동 이전 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    for (const ac of activeConstellations) {
      const starIds = ac.starIds ?? [];
      if (starIds.length < 2) continue;
      const visibleCount = starIds.filter((id) => visibleStarIds.has(id)).length;
      if (visibleCount < 2) addArchiveCandidateFromActive(ac);
    }
  }, [activeConstellations, visibleStarIds]);

  function getConnectionPath(c: { from: string; to: string }, style: ConnectionStyle = "B") {
    const fromStar = atlasStars.find((s) => s.id === c.from);
    const toStar = atlasStars.find((s) => s.id === c.to);
    if (!fromStar || !toStar) return "";
    const x1 = fromStar.left;
    const y1 = fromStar.top;
    const x2 = toStar.left;
    const y2 = toStar.top;
    if (style === "A") {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    if (style === "B") {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = (y2 - y1) * 0.2;
      const dy = (x1 - x2) * 0.2;
      const cx = mx + dx;
      const cy = my + dy;
      return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: NIGHT_BG }}>
      {isLoadingTraits && <LoadingOverlay message="constellation" />}
      <div className="h-12" />
      <header className="flex items-center justify-between px-6 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">밤하늘</h1>
          <p className="text-xs text-slate-400">생각 조각이 모여 별자리를 이룹니다.</p>
        </div>
      </header>

      <main className="flex-1 px-6 overflow-y-auto space-y-6 arisum-pb-tab-safe">
        {/* ─── 상단 지도: 순수 시각 분위기 (텍스트 설명 없음, 별자리 이름만 아우라와 함께) ─── */}
        <section
          className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-sm"
          style={{ backgroundColor: NAVY_CARD, marginBottom: 24 }}
        >
          <div
            className="relative h-[300px] overflow-hidden rounded-3xl p-4"
            style={{ backgroundColor: "#0a0a0f" }}
            onClick={handleBackdropClick}
          >
            {/* 배경 미세 입자 (먼지/별가루) */}
            {Array.from({ length: 40 }, (_, i) => {
              const x = 5 + (i * 17 + (i % 7) * 11) % 90;
              const y = 5 + (i * 23 + (i % 5) * 13) % 90;
              const size = 1 + (i % 3) * 0.5;
              const delay = (i % 5) * 0.4;
              return (
                <motion.div
                  key={`dust-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: size,
                    height: size,
                    backgroundColor: "rgba(255,255,255,0.4)",
                    zIndex: 5,
                  }}
                  animate={{ opacity: [0.2, 0.6, 0.2] }}
                  transition={{
                    duration: 3 + (i % 4) * 0.5,
                    repeat: Infinity,
                    delay,
                  }}
                />
              );
            })}
            {displayStars.length > 0 ? (
              <>
                {/* 연결선 (SVG, % 좌표) */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ zIndex: 40 }}
                >
                  <defs>
                    <filter id="atlasLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="0.8" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="constellationLightLine" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="1.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="centroidGlow" x="-80%" y="-80%" width="260%" height="260%">
                      <feGaussianBlur stdDeviation="3" result="glow" />
                      <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <linearGradient id="atlasLineFade" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(253,230,138,0)" />
                      <stop offset="30%" stopColor="rgba(253,230,138,0.35)" />
                      <stop offset="70%" stopColor="rgba(253,230,138,0.35)" />
                      <stop offset="100%" stopColor="rgba(253,230,138,0)" />
                    </linearGradient>
                  </defs>
                  {/* 연결선: 활성 별자리 메인 별끼리만, 직선. 대표만 강조·나머지 0.08. */}
                  <g>
                    {mapSegmentsToDraw.map((seg, i) => {
                      const opacity = seg.isPrimary
                        ? seg.isHighlighted
                          ? HIGHLIGHT_LINE_OPACITY
                          : NORMAL_LINE_OPACITY
                        : FADED_LINE_OPACITY;
                      const strokeW = seg.isPrimary && seg.isHighlighted ? HIGHLIGHT_LINE_WIDTH : NORMAL_LINE_WIDTH;
                      return (
                        <line
                          key={`seg-${i}-${seg.x1}-${seg.y1}-${seg.x2}-${seg.y2}`}
                          x1={seg.x1}
                          y1={seg.y1}
                          x2={seg.x2}
                          y2={seg.y2}
                          stroke={`rgba(${seg.colorRgb},${opacity})`}
                          strokeWidth={strokeW}
                          strokeLinecap="round"
                          filter={seg.isPrimary && seg.isHighlighted ? "url(#constellationLightLine)" : undefined}
                        />
                      );
                    })}
                  </g>
                </svg>
                {/* 별자리 이름: 대표 1개만, 잘리지 않도록 안쪽 여백·최대폭·2줄 줄바꿈 */}
                {primaryMetaForLabel && (
                  <div
                    className="absolute pointer-events-none max-w-[72%] px-2 py-1 box-border"
                    style={{
                      left: `${primaryMetaForLabel.namePosition.x}%`,
                      top: `${primaryMetaForLabel.namePosition.y}%`,
                      transform: "translate(-50%, -50%)",
                      zIndex: 45,
                      fontFamily: "var(--font-a2z-r), sans-serif",
                      fontSize: 12,
                      letterSpacing: "0.08em",
                      color: "rgba(253,230,138,0.92)",
                      textShadow: "0 0 20px rgba(253,230,138,0.5), 0 0 40px rgba(253,230,138,0.25), 0 1px 3px rgba(0,0,0,0.8)",
                      whiteSpace: "normal",
                      wordBreak: "keep-all",
                      lineHeight: 1.35,
                      filter: "drop-shadow(0 0 8px rgba(253,230,138,0.4))",
                    }}
                  >
                    <span className="block text-center line-clamp-2">
                      {primaryMetaForLabel.constellation.name}
                    </span>
                  </div>
                )}
                {displayStars.map((star) => {
                  const showTooltip = tooltipStarId === star.id;
                  const isHighlighted = highlightedStarIds.has(star.id);
                  const categoryInfo = starToCategoryMap.get(star.id) ?? CATEGORY_COLORS.reconcile;
                  const glowRgb = categoryInfo.colorRgb ?? "253,230,138";
                  const handleStarClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    setTooltipStarId(tooltipStarId === star.id ? null : star.id);
                  };
                  return (
                    <motion.div
                      key={star.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      style={{
                        left: `${star.left}%`,
                        top: `${star.top}%`,
                        zIndex: 50,
                        pointerEvents: "auto",
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: isHighlighted ? 1 : [0.85, 1, 0.85],
                        scale: isHighlighted ? 1.15 : 1,
                      }}
                      transition={{
                        opacity: { duration: 2, repeat: isHighlighted ? 0 : Infinity },
                        scale: { duration: 0.3 },
                      }}
                      onClick={handleStarClick}
                    >
                      {/* 클릭 영역 30px 이상 (투명) */}
                      <div
                        className="absolute rounded-full min-w-[30px] min-h-[30px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2"
                        style={{ pointerEvents: "auto" }}
                        aria-hidden
                      />
                      {/* Layer 3: Twinkle (카테고리 색, 투명도 무작위 명멸) */}
                      <motion.div
                        className="absolute rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none blur-sm"
                        style={{
                          width: 14,
                          height: 14,
                          background: `radial-gradient(circle, rgba(${glowRgb},0.3) 0%, transparent 70%)`,
                        }}
                        animate={{ opacity: [0.35, 0.85, 0.35] }}
                        transition={{ duration: 2.2 + (star.id.length % 3) * 0.3, repeat: Infinity, repeatType: "reverse" }}
                      />
                      {/* Layer 2: Glow (카테고리별 은은한 빛무리) */}
                      <div
                        className="absolute rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 blur-sm pointer-events-none"
                        style={{
                          width: 12,
                          height: 12,
                          backgroundColor: `rgba(${glowRgb},0.45)`,
                          boxShadow: `0 0 10px rgba(${glowRgb},0.5)`,
                        }}
                      />
                      {/* Layer 1: Core (밝은 흰색 핵) */}
                      <div
                        className="relative rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{
                          width: 4,
                          height: 4,
                          backgroundColor: "#FFF",
                          boxShadow: `0 0 8px #FFF, 0 0 4px rgba(${glowRgb},0.6)`,
                        }}
                      />
                      <AnimatePresence>
                        {showTooltip && (
                          <motion.div
                            className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] text-white whitespace-nowrap"
                            style={{
                              backgroundColor: "rgba(0,0,0,0.85)",
                              boxShadow: `0 0 0 1px rgba(${glowRgb},0.6), 0 2px 8px rgba(0,0,0,0.3)`,
                              pointerEvents: "none",
                            }}
                            initial={{ opacity: 0, y: 4, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.9 }}
                            transition={{ duration: 0.15 }}
                          >
                            <div
                              className="absolute left-1/2 -translate-x-1/2 top-full border-[5px] border-transparent"
                              style={{ borderTopColor: "rgba(0,0,0,0.85)" }}
                            />
                            {(star.keywords?.length ?? 0) > 0
                              ? star.keywords!.slice(0, 3).join(" · ")
                              : "키워드 없음"}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </>
            ) : null}
            {displayStars.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 px-4 text-center">
                최근 일주일간 떠오른 별이 없어요. 오늘의 별을 띄워볼까요?
              </p>
            )}
          </div>
        </section>

        {/* ─── 요즘의 나: 분석 센터 (7일/30일, trend 강조) ─── */}
        <section
          className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-sm"
          style={{ backgroundColor: NAVY_CARD, marginBottom: 28 }}
        >
          <div className="px-4 py-4 border-b border-white/10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: CHAMPAGNE_GOLD }}>
                  요즘의 나
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">최근 기록에서 보인 면모 · 선택한 기간에 따른 변화</p>
              </div>
              <div
                className="flex rounded-full overflow-hidden border border-amber-200/30 shadow-inner"
                style={{ backgroundColor: "rgba(15,23,42,0.9)" }}
              >
                <button
                  type="button"
                  className={`relative px-4 py-2 text-xs font-medium transition-all duration-200 ${activeRange === "7d" ? "text-amber-100" : "text-slate-400 hover:text-slate-300"}`}
                  style={
                    activeRange === "7d"
                      ? {
                          backgroundColor: "rgba(253,230,138,0.2)",
                          boxShadow: "inset 0 0 0 1px rgba(253,230,138,0.35)",
                        }
                      : undefined
                  }
                  onClick={() => setActiveRange("7d")}
                >
                  7일
                </button>
                <button
                  type="button"
                  className={`relative px-4 py-2 text-xs font-medium transition-all duration-200 ${activeRange === "30d" ? "text-amber-100" : "text-slate-400 hover:text-slate-300"}`}
                  style={
                    activeRange === "30d"
                      ? {
                          backgroundColor: "rgba(253,230,138,0.2)",
                          boxShadow: "inset 0 0 0 1px rgba(253,230,138,0.35)",
                        }
                      : undefined
                  }
                  onClick={() => setActiveRange("30d")}
                >
                  30일
                </button>
              </div>
            </div>
            {/* 필터 칩: 전체 | 정서 | 관계 | 일 | 사고방식 | 자아 | 가치관 (한글만) */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(["all", ...TRAIT_CATEGORY_ORDER] as const).map((key) => {
                const label = key === "all" ? "전체" : TRAIT_CATEGORY_LABELS[key];
                const isActive = activeCategoryFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveCategoryFilter(key)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: isActive ? "rgba(253,230,138,0.2)" : "rgba(255,255,255,0.06)",
                      color: isActive ? CHAMPAGNE_GOLD : "rgba(226,232,240,0.8)",
                      border: isActive ? "1px solid rgba(253,230,138,0.4)" : "1px solid transparent",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[56vh] overflow-y-auto overflow-x-hidden pr-1"
            style={{ scrollBehavior: "smooth" }}
          >
            {(activeCategoryFilter === "all" ? activeCardsWithLevel : activeCardsWithLevel.filter((c) => c.category === activeCategoryFilter)).map((card, idx) => {
              const catLabel = TRAIT_CATEGORY_LABELS[card.category as TraitCategory];
              const catIcon = TRAIT_CATEGORY_ICONS[card.category as TraitCategory];
              const level = "level" in card ? (card as { level?: TraitLevel }).level ?? 1 : 1;
              const recentCount = card.recentCount ?? 0;
              const trend = card.trend ?? "stable";
              const trendUp = trend === "up";
              const trendDown = trend === "down";
              const glow = level >= 3 ? "0 0 8px rgba(253,230,138,0.2), 0 0 1px rgba(253,230,138,0.4)" : "0 0 1px rgba(253,230,138,0.25)";
              return (
                <motion.button
                  key={card.traitId ?? `${card.category}-active-${idx}`}
                  type="button"
                  onClick={() => setTraitPopupCard(card)}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.26, delay: idx * 0.02 }}
                  className="rounded-xl overflow-hidden text-left flex flex-col relative border transition-colors aspect-[2] min-h-[92px] max-h-[108px]"
                  style={{
                    backgroundColor: "rgba(15,23,42,0.7)",
                    borderColor: trendUp ? "rgba(134,239,172,0.3)" : trendDown ? "rgba(248,113,113,0.28)" : "rgba(253,230,138,0.22)",
                    boxShadow: glow,
                  }}
                >
                  {trendUp && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: "rgba(134,239,172,0.5)" }} aria-hidden />
                  )}
                  {trendDown && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: "rgba(248,113,113,0.45)" }} aria-hidden />
                  )}
                  <div
                    className="absolute top-0 left-0 pt-2 pl-2 flex items-center gap-1 text-[9px] font-medium tracking-wide z-10"
                    style={{ color: "rgba(253,230,138,0.85)", fontFamily: "var(--font-a2z-m), sans-serif" }}
                  >
                    <span aria-hidden>{catIcon}</span>
                    <span>{catLabel}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center px-3 pt-8 pb-8 text-center min-h-0">
                    <span
                      className="text-sm font-semibold leading-tight break-keep"
                      style={{ color: CHAMPAGNE_GOLD, wordBreak: "keep-all", lineHeight: 1.45 }}
                    >
                      {card.traitLabel}
                    </span>
                  </div>
                  <div className="absolute bottom-0 right-0 pr-2.5 pb-2 flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">최근 {recentCount}회</span>
                    {trendUp && (
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold" style={{ backgroundColor: "rgba(134,239,172,0.2)", color: "rgb(134,239,172)" }}>↑</span>
                    )}
                    {trendDown && (
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold" style={{ backgroundColor: "rgba(248,113,113,0.2)", color: "rgb(248,113,113)" }}>↓</span>
                    )}
                  </div>
                </motion.button>
              );
            })}
            {(activeCategoryFilter === "all" ? activeCardsWithLevel : activeCardsWithLevel.filter((c) => c.category === activeCategoryFilter)).length === 0 && (
              <p className="col-span-2 md:col-span-3 text-xs text-slate-500 py-6 text-center">
                {activeCategoryFilter === "all" ? "이 기간에 기록된 성격 면모가 없어요. 일기를 쓰면 채워져요." : "이 기간·카테고리에 기록된 성격 면모가 없어요."}
              </p>
            )}
          </div>
        </section>

        {/* ─── 진정한 나: 카테고리 그룹 + 아코디언 ─── */}
        <section className="space-y-4" style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: CHAMPAGNE_GOLD }}>
              진정한 나
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">별지기가 발견한 {nickname || "당신"}님의 자아 · 시간이 쌓인 본질적인 면모</p>
          </div>

          <div
            className="space-y-2 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1"
            style={{ scrollBehavior: "smooth" }}
          >
            {TRAIT_CATEGORY_ORDER.map((cat) => {
              const catLabel = TRAIT_CATEGORY_LABELS[cat as TraitCategory];
              const cardsInCat = traitCardsWithLevel.filter((c) => c.category === cat);
              const count = cardsInCat.length;
              const maxLevel = count > 0
                ? (Math.max(...cardsInCat.map((c) => ("level" in c ? (c as { level?: TraitLevel }).level ?? 1 : 1))) as TraitLevel)
                : null;
              const maxLevelName = maxLevel != null ? TRAIT_LEVEL_NAMES[maxLevel] : null;
              const isExpanded = longTermExpanded[cat] ?? false;

              return (
                <div
                  key={cat}
                  className="rounded-xl overflow-hidden border border-white/10"
                  style={{ backgroundColor: "rgba(15,23,42,0.5)" }}
                >
                  <button
                    type="button"
                    onClick={() => setLongTermExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left"
                    style={{
                      fontFamily: "var(--font-a2z-m), sans-serif",
                      color: CHAMPAGNE_GOLD,
                      borderBottom: isExpanded ? "1px solid rgba(255,255,255,0.08)" : "none",
                    }}
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <span aria-hidden style={{ fontSize: "10px" }}>{TRAIT_CATEGORY_ICONS[cat]}</span>
                      {catLabel}
                    </span>
                    <span className="text-[11px] text-slate-400 font-normal inline-block text-right tabular-nums" style={{ minWidth: "2.5rem" }}>
                      {count > 0 ? `${count}개` : "0개"}
                      {maxLevelName != null ? ` · ${maxLevelName}` : ""}
                    </span>
                    <span className="text-slate-500 text-[10px]" aria-hidden>
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-2 py-2 space-y-2">
                          {count > 0
                            ? cardsInCat.map((card, idx) => {
                                const level = "level" in card ? (card as { level?: TraitLevel }).level ?? 1 : 1;
                                const isFading = card.unlocked && (card as TraitCardPlaceholder).status === "fading";
                                const borderOpacity = card.unlocked ? 0.35 + level * 0.12 : 0.15;
                                const glowShadow =
                                  level >= 4
                                    ? "0 0 20px rgba(253,230,138,0.35), 0 0 40px rgba(253,230,138,0.15)"
                                    : level >= 3
                                      ? "0 0 12px rgba(253,230,138,0.25)"
                                      : level >= 2
                                        ? "0 0 8px rgba(253,230,138,0.2)"
                                        : "none";
                                const pulseShadowKeyframes =
                                  level >= 5
                                    ? [
                                        "0 0 24px rgba(253,230,138,0.4), 0 0 48px rgba(253,230,138,0.18)",
                                        "0 0 36px rgba(253,230,138,0.7), 0 0 72px rgba(253,230,138,0.35)",
                                        "0 0 24px rgba(253,230,138,0.4), 0 0 48px rgba(253,230,138,0.18)",
                                      ]
                                    : level >= 4
                                      ? [
                                          "0 0 20px rgba(253,230,138,0.3), 0 0 40px rgba(253,230,138,0.12)",
                                          "0 0 32px rgba(253,230,138,0.5), 0 0 64px rgba(253,230,138,0.22)",
                                          "0 0 20px rgba(253,230,138,0.3), 0 0 40px rgba(253,230,138,0.12)",
                                        ]
                                      : null;
                                return (
                                  <motion.button
                                    key={card.unlocked && card.traitId ? card.traitId : `${card.category}-${idx}`}
                                    type="button"
                                    onClick={() => card.unlocked && setTraitPopupCard(card)}
                                    initial={{
                                      opacity: 0,
                                      scale: 0.98,
                                      y: 8,
                                      ...(pulseShadowKeyframes ? { boxShadow: pulseShadowKeyframes[0] } : {}),
                                    }}
                                    animate={{
                                      opacity: 1,
                                      scale: 1,
                                      y: 0,
                                      ...(pulseShadowKeyframes ? { boxShadow: pulseShadowKeyframes } : {}),
                                    }}
                                    transition={{
                                      opacity: { duration: 0.28, delay: idx * 0.04 },
                                      scale: { duration: 0.28, delay: idx * 0.04 },
                                      y: { duration: 0.28, delay: idx * 0.04 },
                                      ...(pulseShadowKeyframes
                                        ? { boxShadow: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } }
                                        : {}),
                                    }}
                                    className="w-full rounded-xl overflow-hidden text-left min-h-[80px] flex flex-col relative"
                                    style={{
                                      backgroundColor: NAVY_CARD,
                                      borderWidth: level >= 3 ? 1.5 : 1,
                                      borderStyle: "solid",
                                      borderColor: card.unlocked ? `rgba(253,230,138,${Math.min(0.9, borderOpacity)})` : "rgba(226,232,240,0.15)",
                                      boxShadow: !pulseShadowKeyframes && level >= 2 ? glowShadow : undefined,
                                      ...(isFading && { filter: "saturate(0.5)", opacity: 0.82 }),
                                    }}
                                  >
                                    <div
                                      className="absolute top-0 left-0 pt-3 pl-4 flex items-center gap-1 text-xs font-semibold z-20"
                                      style={{
                                        fontFamily: "var(--font-a2z-m), sans-serif",
                                        color: card.unlocked ? CHAMPAGNE_GOLD : SILVER_WHITE,
                                        textShadow: card.unlocked ? "0 0 8px rgba(253,230,138,0.5)" : "none",
                                      }}
                                    >
                                      <span className="opacity-100" style={{ fontSize: "10px" }} aria-hidden>{TRAIT_CATEGORY_ICONS[card.category as TraitCategory]}</span>
                                      <span>{catLabel}</span>
                                    </div>
                                    <div
                                      className="flex-1 flex items-center justify-center pt-8 pb-4 px-4"
                                      style={{ opacity: card.unlocked ? 1 : 0.35 }}
                                    >
                                      {card.unlocked ? (
                                        <>
                                          <span className="relative z-10 flex flex-col items-center gap-1">
                                            <span
                                              className="text-sm font-medium"
                                              style={{
                                                color: CHAMPAGNE_GOLD,
                                                textShadow: level >= 5 ? "0 0 16px rgba(253,230,138,0.8), 0 0 32px rgba(253,230,138,0.4)" : "0 0 12px rgba(253,230,138,0.6)",
                                              }}
                                            >
                                              {card.traitLabel}
                                            </span>
                                            <span className="text-[10px] font-medium" style={{ color: "rgba(253,230,138,0.8)" }}>
                                              {TRAIT_LEVEL_NAMES[level]}
                                            </span>
                                          </span>
                                          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                            {Array.from({ length: level >= 3 ? 18 : 12 }).map((_, i) => (
                                              <motion.div
                                                key={i}
                                                className="absolute rounded-full bg-amber-200/40"
                                                style={{
                                                  width: level >= 3 ? 2.5 + (i % 3) * 0.5 : 3,
                                                  height: level >= 3 ? 2.5 + (i % 3) * 0.5 : 3,
                                                  left: `${10 + (i * 11) % 80}%`,
                                                  top: `${25 + (i * 13) % 60}%`,
                                                }}
                                                animate={{ opacity: [0.2, 0.7, 0.2] }}
                                                transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                                              />
                                            ))}
                                          </div>
                                        </>
                                      ) : (
                                        <span className="text-sm text-slate-400">아직 별이 흐릿합니다...</span>
                                      )}
                                    </div>
                                  </motion.button>
                                );
                              })
                            : (
                              <div
                                className="w-full rounded-xl min-h-[80px] flex items-center justify-center border border-white/10"
                                style={{ backgroundColor: "rgba(15,23,42,0.4)" }}
                              >
                                <span className="text-sm text-slate-400">아직 별이 흐릿합니다...</span>
                              </div>
                            )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

      </main>

      {/* 별자리 완성 축하 팝업 */}
      <AnimatePresence>
        {graduationCandidate && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-amber-200/40"
                  style={{
                    width: 4,
                    height: 4,
                    left: `${(i * 13) % 100}%`,
                    top: `${(i * 17) % 100}%`,
                  }}
                  animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>
            <motion.div
              className="relative z-10 rounded-3xl border border-amber-200/20 shadow-2xl p-6 max-w-sm w-full overflow-hidden bg-slate-900/95 backdrop-blur-md"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <motion.p
                className="text-[11px] text-amber-200/90 uppercase tracking-widest mb-3"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                새로운 별자리가 완성되었어요
              </motion.p>
              <motion.h2
                className="text-xl font-bold text-amber-100 mb-2 flex items-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                ✦ {graduationCandidate.name}
                {graduationCandidate.confirmed && (
                  <motion.span
                    className="inline-block"
                    style={{ color: CHAMPAGNE_GOLD, fontSize: 14 }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    ✦
                  </motion.span>
                )}
              </motion.h2>
              <motion.p
                className="text-sm text-slate-400 leading-relaxed mb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {graduationCandidate.summary}
              </motion.p>
              <motion.p
                className="text-[11px] text-slate-500 mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {(() => {
                  const dates = graduationCandidate.starIds.map(getDateFromStarId).filter(Boolean) as string[];
                  const latest = dates.length > 0 ? dates.sort().reverse()[0]! : "";
                  const [y, m, d] = latest.split("-");
                  return latest ? `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일 완성 · ${graduationCandidate.starIds.length}개의 별` : `${graduationCandidate.starIds.length}개의 별`;
                })()}
              </motion.p>
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={() => {
                    addArchiveCandidate(graduationCandidate);
                    setGraduationShownId(graduationCandidate.id);
                    setGraduationCandidate(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500/20 text-amber-100 text-sm font-medium hover:bg-amber-500/30 transition-colors border border-amber-200/30"
                  whileTap={{ scale: 0.98 }}
                >
                  기록하기
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => {
                    setGraduationShownId(graduationCandidate.id);
                    setGraduationCandidate(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-slate-300 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
                  whileTap={{ scale: 0.98 }}
                >
                  닫기
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 자아 기록 팝업 — 성격 키워드 상세 (The Sanctuary Look) */}
      <AnimatePresence>
        {traitPopupCard && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setTraitPopupCard(null)}
          >
            <motion.div
              className="relative rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl"
              style={{
                backgroundColor: "#0A0E1A",
                border: "1px solid rgba(253, 230, 138, 0.35)",
                boxShadow: "0 0 0 1px rgba(253,230,138,0.15), 0 25px 50px -12px rgba(0,0,0,0.6)",
              }}
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 닫기(X) 우측 상단 · 바깥 영역 클릭 시에도 닫힘 */}
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setTraitPopupCard(null)}
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors z-10"
              >
                <span className="text-lg leading-none">×</span>
              </button>

              <div className="p-6 pt-12 pb-8">
                {/* 제목: [성격 키워드] + 단계명 — 에이투지체 5Medium */}
                <motion.header
                  className="mb-5"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.35 }}
                  style={{ fontFamily: "var(--font-a2z-m), sans-serif" }}
                >
                  <h2 className="text-xl font-medium mb-1" style={{ color: CHAMPAGNE_GOLD }}>
                    {traitPopupCard.traitLabel}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {traitPopupCard.recentCount != null
                      ? "요즘의 면모"
                      : `별지기가 발견한 ${nickname || "당신"}님의 성격`}
                    {traitPopupCard.recentCount != null ? (
                      <span className="ml-1.5 text-amber-200/90">· 최근 {traitPopupCard.recentCount}회</span>
                    ) : (
                      traitPopupCard.traitId &&
                      typeof window !== "undefined" && (
                        <span className="ml-1.5 text-amber-200/90">
                          · {TRAIT_LEVEL_NAMES[getTraitLevel(getIdentityArchive().traitCounts[traitPopupCard.traitId] ?? 7) as TraitLevel]} 단계
                        </span>
                      )
                    )}
                  </p>
                  {/* 장기 카드: 상태별 별지기 한마디 */}
                  {traitPopupCard.recentCount == null && (
                    <p className="text-xs mt-1.5" style={{ color: (traitPopupCard as TraitCardPlaceholder).status === "fading" ? "rgba(148,163,184,0.95)" : "rgba(253,230,138,0.9)" }}>
                      {(traitPopupCard as TraitCardPlaceholder).status === "fading"
                        ? "요즘 이런 면모가 잘 보이지 않아요. 최근 이 경향이 희미해지고 있어요."
                        : "여전히 당신의 중심을 지키고 있는 빛이군요."}
                    </p>
                  )}
                </motion.header>

                {/* 요즘의 면모: 4단 구조 — 제목 / 별지기의 발견(Evidence) / 이 마음이 전하는 이야기(Deep Insight) / 별지기의 응원(Closing) */}
                {traitPopupCard.recentCount != null ? (
                  <>
                    <motion.section
                      className="mb-5 pt-1"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12, duration: 0.35 }}
                    >
                      <p
                        className="text-[11px] font-semibold mb-1.5 text-white tracking-wide"
                        style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
                      >
                        별지기의 발견
                      </p>
                      <p
                        className="text-sm leading-relaxed text-slate-200 whitespace-pre-line"
                        style={{
                          fontFamily: "var(--font-a2z-regular), sans-serif",
                          lineHeight: 1.8,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {(() => {
                          const displayName = nickname || getUserName() || "당신";
                          const text = (traitPopupCard.opening ?? "").replace(/\[닉네임\]/g, displayName);
                          return text || "요즘 기록을 보며 이 면모가 자주 느껴졌어요.";
                        })()}
                      </p>
                    </motion.section>
                    {traitPopupCard.body && (
                      <motion.section
                        className="mb-5 pt-3 border-t border-amber-200/15"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.35 }}
                      >
                        <p
                          className="text-[11px] font-semibold mb-1.5 text-white tracking-wide"
                          style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
                        >
                          이 마음이 전하는 이야기
                        </p>
                        <p
                          className="text-sm leading-relaxed text-amber-100/95 whitespace-pre-line"
                          style={{
                            fontFamily: "var(--font-a2z-regular), sans-serif",
                            lineHeight: 1.75,
                          }}
                        >
                          {(traitPopupCard.body ?? "").replace(/\[닉네임\]/g, nickname || getUserName() || "당신")}
                        </p>
                      </motion.section>
                    )}
                    <motion.section
                      className="mb-6 pt-3 border-t border-amber-200/20"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.28, duration: 0.35 }}
                    >
                      <p
                        className="text-[11px] font-semibold mb-1.5 text-white tracking-wide"
                        style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
                      >
                        별지기의 응원
                      </p>
                      <p
                        className="text-sm leading-relaxed text-slate-300 whitespace-pre-line"
                        style={{
                          fontFamily: "var(--font-a2z-regular), sans-serif",
                          lineHeight: 1.8,
                        }}
                      >
                        {(traitPopupCard.closing ?? "").replace(/\[닉네임\]/g, nickname || getUserName() || "당신") || "이 면모가 오늘을 버티는 데 한몫했을 거예요."}
                      </p>
                    </motion.section>
                  </>
                ) : (
                  <>
                    <motion.div
                      className="mb-6"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.16, duration: 0.35 }}
                    >
                      <p
                        className="text-sm leading-relaxed text-slate-200 whitespace-pre-line"
                        style={{
                          fontFamily: "var(--font-a2z-regular), sans-serif",
                          lineHeight: 1.8,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {(() => {
                          const displayName = nickname || getUserName() || "당신";
                          const raw = [traitPopupCard.opening, traitPopupCard.body, traitPopupCard.closing]
                            .filter(Boolean)
                            .join("\n\n");
                          const text = raw ? raw.replace(/\[닉네임\]/g, displayName) : "";
                          return text || "별지기가 기록한 이야기가 여기 담겨 있어요.";
                        })()}
                      </p>
                    </motion.div>
                    {traitPopupCard.evidence && (
                      <motion.section
                        className="mb-6 pt-4 border-t border-amber-200/20"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.32, duration: 0.35 }}
                      >
                        <p
                          className="text-[11px] font-medium mb-2 text-slate-500 tracking-wide"
                          style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
                        >
                          별지기가 기록한 증거들
                        </p>
                        <p
                          className="text-xs leading-relaxed text-slate-400"
                          style={{
                            fontFamily: "var(--font-a2z-r), sans-serif",
                            lineHeight: 1.7,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {traitPopupCard.evidence}
                        </p>
                      </motion.section>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 100일 미기록으로 목록에서 내려간 성격 안내 팝업 */}
      <AnimatePresence>
        {extinctTraitsToNotify.length > 0 && (
          <motion.div
            className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExtinctTraitsToNotify([])}
          >
            <motion.div
              className="rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-amber-200/20"
              style={{ backgroundColor: "#0A0E1A" }}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <p className="text-sm font-medium mb-2" style={{ color: CHAMPAGNE_GOLD }}>
                  별지기의 안내
                </p>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  100일간 기록되지 않은 성격은 목록에서 내려갔어요. 다시 일기에 그 면모가 담기면 별이 다시 켜져요.
                </p>
                <ul className="text-xs text-slate-400 space-y-1 mb-4">
                  {extinctTraitsToNotify.map((t) => (
                    <li key={t.traitId}>· {t.label}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setExtinctTraitsToNotify([])}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ backgroundColor: "rgba(253,230,138,0.2)", color: CHAMPAGNE_GOLD }}
                >
                  알겠어요
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="rounded-3xl border border-white/10 shadow-2xl p-6 max-w-sm w-full overflow-hidden bg-slate-900/95 backdrop-blur-md"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
                ✦ {selected.name}
                {selected.confirmed && (
                  <motion.span
                    className="inline-block"
                    style={{ color: CHAMPAGNE_GOLD, fontSize: 12 }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    aria-label="확정된 기록"
                  >
                    ✦
                  </motion.span>
                )}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">{selected.summary}</p>
              <p className="text-[11px] text-slate-500 mt-2">{selected.starIds.length}개의 별로 이루어진 별자리</p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-4 w-full py-2.5 rounded-xl bg-white/10 text-slate-200 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TabBar
        activeKey="constellation"
        onChange={(key: TabKey) => {
          if (key === "home") router.push("/");
          if (key === "journal") router.push("/diary");
          if (key === "bookshelf") router.push("/archive");
        }}
      />
    </div>
  );
}
