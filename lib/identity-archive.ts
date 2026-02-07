/**
 * user_identity_archive 확장 구조
 * - summary: 누적 정체성 요약 (기존 문자열)
 * - traitCounts: 지표별 출현 횟수 (7회 이상 시 확정)
 * - confirmedTraits: 확정된 성격 배열 (카테고리당 1개 제한 없음, traitId 중복 없음)
 * - traitEvents: 분석 시점별 trait 로그 (최근 7일/30일 activeTraits 집계 및 30일/100일 생애주기용, 최대 100일 보관)
 */

import type { TraitCategory } from "../constants/traits";

export type ConfirmedTrait = {
  category: TraitCategory;
  traitId: string;
  label: string;
  reasoning: string;
  opening: string;
  body: string;
  closing: string;
};

/** 분석 1건당 발생한 trait 기록 (날짜 + traitId) */
export type TraitEvent = { date: string; traitId: string };

export const TRAIT_EVENTS_MAX_DAYS = 100;

export type IdentityArchive = {
  summary: string;
  traitCounts: Record<string, number>;
  confirmedTraits: ConfirmedTrait[];
  /** 최근 N일 activeTraits 집계용. 없으면 레거시(무시). */
  traitEvents?: TraitEvent[];
};

import { getAppStorage } from "./app-storage";

const STORAGE_KEY = "user_identity_summary";

/** Raw JSON 문자열 파싱 (API/클라이언트 공용). confirmedTraits는 항상 배열로 반환. */
export function parseArchiveRaw(raw: string | null): IdentityArchive {
  if (!raw || !raw.trim()) {
    return { summary: "", traitCounts: {}, confirmedTraits: [], traitEvents: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "summary" in parsed) {
      const ct = parsed.confirmedTraits;
      let confirmedTraits: ConfirmedTrait[] = [];
      if (Array.isArray(ct)) {
        confirmedTraits = ct.filter(
          (t: unknown): t is ConfirmedTrait =>
            t != null &&
            typeof t === "object" &&
            "traitId" in t &&
            "category" in t &&
            typeof (t as ConfirmedTrait).traitId === "string"
        );
      } else if (ct && typeof ct === "object" && !Array.isArray(ct)) {
        const legacy = ct as Partial<Record<TraitCategory, Omit<ConfirmedTrait, "category">>>;
        for (const cat of ["emotional", "interpersonal", "workStyle", "cognitive", "selfConcept", "values"] as TraitCategory[]) {
          const t = legacy[cat];
          if (t && typeof t === "object" && typeof t.traitId === "string")
            confirmedTraits.push({ ...t, category: cat });
        }
      }
      let traitEvents: TraitEvent[] = [];
      if (Array.isArray(parsed.traitEvents)) {
        traitEvents = parsed.traitEvents.filter(
          (e: unknown): e is TraitEvent =>
            e != null &&
            typeof e === "object" &&
            "date" in e &&
            "traitId" in e &&
            typeof (e as TraitEvent).date === "string" &&
            typeof (e as TraitEvent).traitId === "string"
        );
      }
      return {
        summary: String(parsed.summary ?? ""),
        traitCounts: parsed.traitCounts && typeof parsed.traitCounts === "object" ? parsed.traitCounts : {},
        confirmedTraits,
        traitEvents,
      };
    }
  } catch {
    // legacy: plain string = summary only
  }
  return { summary: String(raw), traitCounts: {}, confirmedTraits: [], traitEvents: [] };
}

function parseArchive(raw: string | null): IdentityArchive {
  return parseArchiveRaw(raw);
}

export function getIdentityArchive(): IdentityArchive {
  if (typeof window === "undefined") return { summary: "", traitCounts: {}, confirmedTraits: [], traitEvents: [] };
  const raw = getAppStorage().getItem(STORAGE_KEY);
  return parseArchive(raw);
}

/** 100일 경과 등으로 목록에서 내려간 성격을 로컬 아카이브에서 제거 (클라이언트 호출). */
export function removeExtinctTraits(traitIds: string[]): void {
  if (typeof window === "undefined" || traitIds.length === 0) return;
  const archive = getIdentityArchive();
  const ids = new Set(traitIds);
  const confirmedTraits = archive.confirmedTraits.filter((t) => !ids.has(t.traitId));
  setIdentityArchive({
    ...archive,
    confirmedTraits,
  });
}

export function setIdentityArchive(archive: IdentityArchive): void {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(STORAGE_KEY, JSON.stringify(archive));
  window.dispatchEvent(new Event("report-updated"));
}

/** summary만 필요한 기존 호출용 (문자열 반환) */
export function getIdentitySummaryString(): string {
  return getIdentityArchive().summary;
}

/**
 * 해당 일기 분석 시 추가되었던 성격 카운트 회수.
 * traitIds 각각 -1 차감 후, 7 미만이 된 성격은 confirmedTraits에서 제거(미해금 상태로 복귀).
 * 해당 날짜의 traitEvents도 제거.
 * 삭제된 일기의 흔적을 summary에서 제거하기 위해 summary는 빈 문자열로 초기화.
 */
export function rollbackIdentityArchiveForDate(dateKey: string, traitIds: string[]): void {
  if (typeof window === "undefined" || traitIds.length === 0) return;
  const archive = getIdentityArchive();
  const counts = { ...archive.traitCounts };
  for (const id of traitIds) {
    const prev = counts[id] ?? 0;
    if (prev <= 1) delete counts[id];
    else counts[id] = prev - 1;
  }
  const stillConfirmed = archive.confirmedTraits.filter((t) => {
    const c = counts[t.traitId] ?? 0;
    return c >= 7;
  });
  const traitIdSet = new Set(traitIds);
  const traitEvents = (archive.traitEvents ?? []).filter(
    (e) => e.date !== dateKey || !traitIdSet.has(e.traitId)
  );
  setIdentityArchive({
    summary: "",
    traitCounts: counts,
    confirmedTraits: stillConfirmed,
    traitEvents,
  });
}

/**
 * [테스트용] 진정한 나 · 정서 카테고리에 '긍정적인'을 15회 누적으로 넣습니다.
 * 브라우저 콘솔에서 window.__setTestTraitPositive() 호출 후 밤하늘 탭을 새로고침하세요.
 */
export function setTestTraitPositive15(): void {
  if (typeof window === "undefined") return;
  const archive = getIdentityArchive();
  const traitId = "emotional-06";
  const label = "긍정적인";
  const category = "emotional" as TraitCategory;

  const traitCounts = { ...archive.traitCounts, [traitId]: 15 };

  const hasConfirmed = archive.confirmedTraits.some((t) => t.traitId === traitId);
  const confirmedTraits = hasConfirmed
    ? archive.confirmedTraits
    : [
        ...archive.confirmedTraits,
        {
          category,
          traitId,
          label,
          reasoning: "테스트: 15회 누적로 진정한 나에 표시됩니다.",
          opening: "[닉네임]님을 지켜보니, 긍정적인 순간들이 자주 보여요.",
          body: "이 성격이 삶에서 어떤 의미인지.",
          closing: "이 기록은 당신을 더 깊이 이해하는 단서가 될 거예요.",
        },
      ];

  const now = new Date();
  const existingEvents = (archive.traitEvents ?? []).filter((e) => e.traitId === traitId);
  let traitEvents = archive.traitEvents ?? [];
  if (existingEvents.length === 0) {
    for (let i = 0; i < 15; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      traitEvents = [...traitEvents, { date: d.toISOString().slice(0, 10), traitId }];
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRAIT_EVENTS_MAX_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    traitEvents = traitEvents.filter((e) => e.date >= cutoffStr);
  }

  setIdentityArchive({
    ...archive,
    traitCounts,
    confirmedTraits,
    traitEvents,
  });
}
