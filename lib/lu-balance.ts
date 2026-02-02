/** 별조각 재화 – user_lu_balance (Supabase 또는 localStorage) */

import { getAppStorage } from "./app-storage";

export const USER_LU_BALANCE_KEY = "user_lu_balance";
const INITIAL_LU = 30;
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

/** 오늘 퀘스트로 벌어든 루 (최대 60) */
const DAILY_QUEST_LU_KEY = "arisum-daily-quest-lu-earned";

export function getTodayQuestLuEarned(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(DAILY_QUEST_LU_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (data.date !== getTodayKey()) return 0;
    return Math.min(60, Math.max(0, data.amount ?? 0));
  } catch {
    return 0;
  }
}

export function addTodayQuestLuEarned(amount: number): boolean {
  if (typeof window === "undefined") return false;
  const today = getTodayKey();
  const current = getTodayQuestLuEarned();
  const next = Math.min(60, current + amount);
  if (next === current) return false;
  getAppStorage().setItem(
    DAILY_QUEST_LU_KEY,
    JSON.stringify({ date: today, amount: next })
  );
  return true;
}

export function subtractTodayQuestLuEarned(amount: number) {
  if (typeof window === "undefined") return;
  const today = getTodayKey();
  const current = getTodayQuestLuEarned();
  const next = Math.max(0, current - amount);
  getAppStorage().setItem(
    DAILY_QUEST_LU_KEY,
    JSON.stringify({ date: today, amount: next })
  );
}

export const MAX_DAILY_QUEST_LU = 60;
export const LU_PER_QUEST_COMPLETE = 20;
export const LU_DAILY_REPORT_UNLOCK = 30;
export const LU_REANALYZE = 15;
export const LU_ARCHIVE_BOOK_UNLOCK = 600;
/** 질문 답변 모드: 짧은 답변 → 일기 확장 시 10루 소모 */
export const LU_QUESTION_DIARY = 10;
