/** 별조각 재화 – user_lu_balance (Supabase 또는 localStorage) */

import { getAppStorage } from "./app-storage";
import {
  INITIAL_SHARDS,
  MAX_DAILY_QUEST_SHARDS,
  getMembershipTier,
  getQuestRewardShards,
  getMaxDailyQuestShards,
} from "./economy";

export const USER_LU_BALANCE_KEY = "user_lu_balance";
const INITIAL_LU = INITIAL_SHARDS;
const LEGACY_LU_KEY = "arisum-aria";
export const LU_BALANCE_UPDATED_EVENT = "lu-balance-updated";

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 현재 별조각 잔액. 없으면 기존 arisum-aria 마이그레이션 후 없으면 30으로 초기화 */
export function getLuBalance(): number {
  if (typeof window === "undefined") return INITIAL_LU;
  try {
    const storage = getAppStorage();
    let raw = storage.getItem(USER_LU_BALANCE_KEY);
    if (raw === null) {
      const legacy = storage.getItem(LEGACY_LU_KEY);
      const value = legacy ? Math.max(0, parseInt(legacy, 10)) : INITIAL_LU;
      storage.setItem(USER_LU_BALANCE_KEY, String(value));
      return value;
    }
    return Math.max(0, parseInt(raw, 10));
  } catch {
    return INITIAL_LU;
  }
}

export function setLuBalance(value: number) {
  if (typeof window === "undefined") return;
  const v = Math.max(0, Math.floor(value));
  getAppStorage().setItem(USER_LU_BALANCE_KEY, String(v));
  window.dispatchEvent(new Event(LU_BALANCE_UPDATED_EVENT));
}

export function addLu(amount: number): boolean {
  const current = getLuBalance();
  setLuBalance(current + amount);
  return true;
}

/** 차감. 잔액 부족 시 false */
export function subtractLu(amount: number): boolean {
  const current = getLuBalance();
  if (current < amount) return false;
  setLuBalance(current - amount);
  return true;
}

/** 오늘 퀘스트로 벌어든 별조각. 등급별 상한(30/60) 적용. */
const DAILY_QUEST_LU_KEY = "arisum-daily-quest-lu-earned";

export function getTodayQuestLuEarned(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(DAILY_QUEST_LU_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (data.date !== getTodayKey()) return 0;
    const tier = getMembershipTier();
    const cap = getMaxDailyQuestShards(tier);
    return Math.min(cap, Math.max(0, data.amount ?? 0));
  } catch {
    return 0;
  }
}

/** 퀘스트 1회 완료 시 호출. 등급별 보상(10/20) 지급, 하루 상한(30/60) 적용. */
export function addTodayQuestLuEarned(): boolean {
  if (typeof window === "undefined") return false;
  const today = getTodayKey();
  const raw = getAppStorage().getItem(DAILY_QUEST_LU_KEY);
  const data = raw ? JSON.parse(raw) : {};
  const current = data.date === today ? Math.max(0, data.amount ?? 0) : 0;
  const tier = getMembershipTier();
  const amount = getQuestRewardShards(tier);
  const cap = getMaxDailyQuestShards(tier);
  const next = Math.min(cap, current + amount);
  if (next === current) return false;
  getAppStorage().setItem(
    DAILY_QUEST_LU_KEY,
    JSON.stringify({ date: today, amount: next })
  );
  return true;
}

/** 퀘스트 완료 취소 시 호출. 등급별 1회분(10/20) 차감. */
export function subtractTodayQuestLuEarnedByOne(): void {
  if (typeof window === "undefined") return;
  const today = getTodayKey();
  const raw = getAppStorage().getItem(DAILY_QUEST_LU_KEY);
  const data = raw ? JSON.parse(raw) : {};
  if (data.date !== today) return;
  const tier = getMembershipTier();
  const amount = getQuestRewardShards(tier);
  const next = Math.max(0, (data.amount ?? 0) - amount);
  getAppStorage().setItem(
    DAILY_QUEST_LU_KEY,
    JSON.stringify({ date: today, amount: next })
  );
}

export function subtractTodayQuestLuEarned(amount: number): void {
  if (typeof window === "undefined") return;
  const today = getTodayKey();
  const raw = getAppStorage().getItem(DAILY_QUEST_LU_KEY);
  const data = raw ? JSON.parse(raw) : {};
  if (data.date !== today) return;
  const next = Math.max(0, (data.amount ?? 0) - amount);
  getAppStorage().setItem(
    DAILY_QUEST_LU_KEY,
    JSON.stringify({ date: today, amount: next })
  );
}

export {
  MAX_DAILY_QUEST_SHARDS,
  getQuestRewardShards,
  getMaxDailyQuestShards,
  SHARDS_PER_QUEST as LU_PER_QUEST_COMPLETE,
  COST_DAILY_ANALYSIS as LU_DAILY_REPORT_UNLOCK,
  COST_RE_ANALYSIS as LU_REANALYZE,
  COST_MONTHLY_ARCHIVE_UNLOCK as LU_ARCHIVE_BOOK_UNLOCK,
  COST_DIARY_MODE as LU_QUESTION_DIARY,
} from "./economy";
export const MAX_DAILY_QUEST_LU = MAX_DAILY_QUEST_SHARDS;
