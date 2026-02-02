/**
 * 홈 상단: 닉네임, AI 인사말 (최근 기록 여부에 따라 분기)
 */

import { getAppStorage } from "./app-storage";

const ONBOARDING_KEY = "arisum-onboarding";
const JOURNALS_KEY = "arisum-journals";

export type RecentRecordStatus = "today" | "recent" | "none";

export function getUserName(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = getAppStorage().getItem(ONBOARDING_KEY);
    if (!raw) return "";
    const data = JSON.parse(raw) as { userName?: string };
    return typeof data.userName === "string" ? data.userName.trim() : "";
  } catch {
    return "";
  }
}

/** 오늘 / 최근 1~2일 / 그 외(없음) */
export function getRecentRecordStatus(): RecentRecordStatus {
  if (typeof window === "undefined") return "none";
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    if (!raw) return "none";
    const parsed = JSON.parse(raw) as Record<string, unknown[]>;
    const keys = Object.keys(parsed);
    if (keys.length === 0) return "none";

    const today = formatDateKey(new Date());
    const yesterday = formatDateKey(shiftDays(new Date(), -1));
    const twoDaysAgo = formatDateKey(shiftDays(new Date(), -2));

    if (keys.includes(today)) return "today";
    if (keys.includes(yesterday) || keys.includes(twoDaysAgo)) return "recent";
    return "none";
  } catch {
    return "none";
  }
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

const GREETINGS: Record<RecentRecordStatus, string[]> = {
  today: [
    "오늘도 반가워요.",
    "오늘 하루 잘 보내고 계시죠?",
    "오늘의 마음도 여기 있을 거예요.",
  ],
  recent: [
    "오랜만이에요. 오늘 하루는 어땠나요?",
    "다시 만나서 반가워요.",
    "오늘 하루를 돌아볼까요?",
  ],
  none: [
    "반가워요. 오늘 하루를 돌아볼까요?",
    "오늘의 마음을 나눠 보아요.",
    "일기 쓰러 와 주셔서 감사해요.",
  ],
};

export function getAiGreeting(nickname: string, status: RecentRecordStatus): string {
  const list = GREETINGS[status];
  const dayIndex = typeof window !== "undefined"
    ? Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % list.length
    : 0;
  const msg = list[dayIndex] ?? list[0];
  return msg;
}
