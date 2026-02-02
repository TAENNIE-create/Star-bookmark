/**
 * 퀘스트 저장: quests_for_YYYY-MM-DD (Supabase 또는 localStorage)
 */

import { getAppStorage } from "./app-storage";

export const QUESTS_FOR_DATE_PREFIX = "quests_for_";
const LEGACY_DAILY_QUESTS_KEY = "dailyQuests";

function storageKey(dateKey: string): string {
  return `${QUESTS_FOR_DATE_PREFIX}${dateKey}`;
}

export type QuestItem = { id: string; label: string };

/** 해당 날짜의 퀘스트 목록. 구 형식(dailyQuests) 마이그레이션 지원 */
export function getQuestsForDate(dateKey: string): QuestItem[] {
  if (typeof window === "undefined") return [];
  try {
    const storage = getAppStorage();
    const raw = storage.getItem(storageKey(dateKey));
    if (raw) {
      const data = JSON.parse(raw) as { items?: QuestItem[] };
      return Array.isArray(data?.items) ? data.items : [];
    }
    const legacyRaw = storage.getItem(LEGACY_DAILY_QUESTS_KEY);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as Record<string, { items?: QuestItem[] }> | { date?: string; items?: QuestItem[] };
    if (legacy.date !== undefined && Array.isArray(legacy.items)) {
      return dateKey === legacy.date ? legacy.items : [];
    }
    const byDate = legacy as Record<string, { items?: QuestItem[] }>;
    const entry = byDate[dateKey];
    return Array.isArray(entry?.items) ? entry.items : [];
  } catch {
    return [];
  }
}

export function setQuestsForDate(dateKey: string, items: QuestItem[]): void {
  if (typeof window === "undefined") return;
  try {
    getAppStorage().setItem(storageKey(dateKey), JSON.stringify({ items }));
    window.dispatchEvent(new Event("dailyQuests-updated"));
  } catch {
    // ignore
  }
}

export const DAILY_QUESTS_UPDATED_EVENT = "dailyQuests-updated";
