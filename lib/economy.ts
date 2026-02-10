/**
 * 별조각(Star Shards) 경제 시스템 상수 및 멤버십 할인 로직.
 *
 * 데이터 보안: 모든 기록은 서버에 안전하게 보존됩니다. 등급에 따라 '열람 및 분석' 권한만 제어됩니다.
 */

import { getAppStorage } from "./app-storage";

// ─── 상수 (디렉터 정의) ─────────────────────────────────────────────────────
export const INITIAL_SHARDS = 30;
/** 퀘스트 1회 완료 보상: 무료/구독 10, 은하(CHRONICLE) 20. 별조각으로 구매 불가. */
export const SHARDS_PER_QUEST = 10;
export const CHRONICLE_SHARDS_PER_QUEST = 20;
/** 하루 퀘스트 보상 상한: 무료/구독 30, 은하 60 */
export const MAX_DAILY_QUEST_SHARDS = 30;
export const CHRONICLE_MAX_DAILY_QUEST_SHARDS = 60;

export const COST_DAILY_ANALYSIS = 30;
export const COST_RE_ANALYSIS = 15;
export const COST_DIARY_MODE = 10;
export const COST_MONTHLY_ARCHIVE_UNLOCK = 400;
export const COST_PERMANENT_MEMORY_KEY = 200;

// ─── 멤버십 등급 및 AI 기억 범위(Memory Window) ─────────────────────────────────
// 별지기가 참고할 수 있는 과거 기록 범위: free 30일 / short_story 180일 / hardcover 365일 / chronicle 무제한.
// 예외: 기억의 열쇠로 해금한 달(isMemoryUnlocked)은 등급에 상관없이 항상 분석·열람에 포함됩니다.
export type MembershipTier = "FREE" | "SHORT_STORY" | "HARDCOVER" | "CHRONICLE";

export const MEMBERSHIP_ACCESS_DAYS: Record<MembershipTier, number | null> = {
  FREE: 30,
  SHORT_STORY: 180,
  HARDCOVER: 365,
  CHRONICLE: null, // null = 무제한(평생)
};

export const MEMBERSHIP_PLANS: Record<
  MembershipTier,
  { name: string; price: number; accessDays: number | null; shardsPerMonth: number; benefits: string[] }
> = {
  FREE: {
    name: "잔별",
    price: 0,
    accessDays: 30,
    shardsPerMonth: 0,
    benefits: ["최근 30일 기억·연결", "정가 분석"],
  },
  SHORT_STORY: {
    name: "샛별",
    price: 2900,
    accessDays: 180,
    shardsPerMonth: 100,
    benefits: ["최근 180일 기억·연결", "100 별조각 지급"],
  },
  HARDCOVER: {
    name: "금별",
    price: 4900,
    accessDays: 365,
    shardsPerMonth: 300,
    benefits: ["최근 365일 기억·연결", "300 별조각 지급", "분석 50% 할인"],
  },
  CHRONICLE: {
    name: "은하",
    price: 7400,
    accessDays: null,
    shardsPerMonth: 500,
    benefits: [
      "별지기가 당신의 모든 과거를 기억하고 오늘과 연결해 드립니다.",
      "500 별조각 지급",
      "기록 모드(사진/음성) 무료",
      "분석 50% 할인",
    ],
  },
};

/** 행동 타입: getRequiredShards(tier, action) 에서 사용 */
export type ShardAction =
  | "daily_analysis"
  | "re_analysis"
  | "diary_mode"
  | "monthly_archive_unlock"
  | "permanent_memory_key";

const BASE_COSTS: Record<ShardAction, number> = {
  daily_analysis: COST_DAILY_ANALYSIS,
  re_analysis: COST_RE_ANALYSIS,
  diary_mode: COST_DIARY_MODE,
  monthly_archive_unlock: COST_MONTHLY_ARCHIVE_UNLOCK,
  permanent_memory_key: COST_PERMANENT_MEMORY_KEY,
};

/**
 * 멤버십 등급에 따른 최종 소모 별조각 계산.
 * 은하(CHRONICLE): 데일리 30→15, 재분석 15→7, 월간 400→200, diary_mode 무료.
 * 금별(HARDCOVER): 분석·재분석 50% 할인.
 */
export function getRequiredShards(tier: MembershipTier, action: ShardAction): number {
  const base = BASE_COSTS[action];
  if (action === "daily_analysis" || action === "re_analysis") {
    if (tier === "HARDCOVER" || tier === "CHRONICLE") return Math.max(1, Math.floor(base * 0.5));
    return base;
  }
  if (action === "diary_mode") {
    if (tier === "CHRONICLE") return 0;
    return base;
  }
  if (action === "monthly_archive_unlock") {
    if (tier === "CHRONICLE") return Math.max(1, Math.floor(base * 0.5));
    return base;
  }
  return base;
}

/** 퀘스트 1회 완료 시 지급 별조각: 은하 20, 그 외 10. */
export function getQuestRewardShards(tier: MembershipTier): number {
  return tier === "CHRONICLE" ? CHRONICLE_SHARDS_PER_QUEST : SHARDS_PER_QUEST;
}

/** 하루 퀘스트 보상 상한: 은하 60, 그 외 30. */
export function getMaxDailyQuestShards(tier: MembershipTier): number {
  return tier === "CHRONICLE" ? CHRONICLE_MAX_DAILY_QUEST_SHARDS : MAX_DAILY_QUEST_SHARDS;
}

// ─── 현재 멤버십 저장/조회 (localStorage, 추후 Supabase 연동 가능) ─────────────
const MEMBERSHIP_STORAGE_KEY = "arisum-membership-tier";

export function getMembershipTier(): MembershipTier {
  if (typeof window === "undefined") return "FREE";
  try {
    const raw = getAppStorage().getItem(MEMBERSHIP_STORAGE_KEY);
    if (raw === "SHORT_STORY" || raw === "HARDCOVER" || raw === "CHRONICLE") return raw;
    return "FREE";
  } catch {
    return "FREE";
  }
}

export function setMembershipTier(tier: MembershipTier): void {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(MEMBERSHIP_STORAGE_KEY, tier);
  window.dispatchEvent(new Event("membership-updated"));
}

// ─── 열람·분석 권한 (데이터는 서버에 보존, 권한만 등급으로 제어) ─────────────────
/** YYYY-MM-DD 가 (오늘 - accessDays) 이내인지, 또는 해당 월이 기억의 열쇠로 영구 해금되었는지 */
export function isDateAccessible(
  dateKey: string,
  accessDays: number | null,
  unlockedMonths: Set<string>
): boolean {
  const [y, m] = dateKey.split("-");
  const yearMonth = `${y}-${m}`;
  if (unlockedMonths.has(yearMonth)) return true;
  if (accessDays === null) return true; // CHRONICLE
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(dateKey.slice(8, 10), 10));
  d.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDays <= accessDays;
}
