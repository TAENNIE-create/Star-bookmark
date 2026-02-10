/**
 * 기록함 월간 기록집 해금 상태 (Supabase 또는 localStorage).
 * 모든 기록은 서버에 안전하게 보존되며, 등급에 따라 열람·분석 권한만 제어됩니다.
 * 기억의 열쇠(별조각 200)로 해금한 달은 등급에 상관없이 항상 기억 범위에 포함됩니다.
 */

import { getAppStorage } from "./app-storage";

export const ARCHIVE_UNLOCKED_KEY = "arisum-archive-unlocked";

export function getUnlockedMonths(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = getAppStorage().getItem(ARCHIVE_UNLOCKED_KEY);
    const data = raw ? (JSON.parse(raw) as { months?: string[] }) : {};
    return new Set(Array.isArray(data.months) ? data.months : []);
  } catch {
    return new Set();
  }
}

export function setUnlockedMonths(months: Set<string>): void {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(ARCHIVE_UNLOCKED_KEY, JSON.stringify({ months: Array.from(months) }));
}

/** 2월(YYYY-02) 해금을 모두 취소하고 저장. 취소된 개수 반환 */
export function clearFebruaryUnlocks(): number {
  if (typeof window === "undefined") return 0;
  const current = getUnlockedMonths();
  const filtered = new Set([...current].filter((ym) => !ym.endsWith("-02")));
  const removed = current.size - filtered.size;
  if (removed > 0) setUnlockedMonths(filtered);
  return removed;
}
