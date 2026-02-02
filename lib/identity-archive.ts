/**
 * user_identity_archive 확장 구조
 * - summary: 누적 정체성 요약 (기존 문자열)
 * - traitCounts: 지표별 출현 횟수 (7회 이상 시 확정)
 * - confirmedTraits: 카테고리별 확정된 별자리 + AI 근거
 */

import type { TraitCategory } from "../constants/traits";

export type ConfirmedTrait = {
  traitId: string;
  label: string;
  reasoning: string;
  opening: string;
  body: string;
  closing: string;
};

export type IdentityArchive = {
  summary: string;
  traitCounts: Record<string, number>;
  confirmedTraits: Partial<Record<TraitCategory, ConfirmedTrait>>;
};

import { getAppStorage } from "./app-storage";

const STORAGE_KEY = "user_identity_summary";

function parseArchive(raw: string | null): IdentityArchive {
  if (!raw || !raw.trim()) {
    return { summary: "", traitCounts: {}, confirmedTraits: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "summary" in parsed) {
      return {
        summary: String(parsed.summary ?? ""),
        traitCounts: parsed.traitCounts && typeof parsed.traitCounts === "object" ? parsed.traitCounts : {},
        confirmedTraits: parsed.confirmedTraits && typeof parsed.confirmedTraits === "object" ? parsed.confirmedTraits : {},
      };
    }
  } catch {
    // legacy: plain string = summary only
  }
  return { summary: String(raw), traitCounts: {}, confirmedTraits: {} };
}

export function getIdentityArchive(): IdentityArchive {
  if (typeof window === "undefined") return { summary: "", traitCounts: {}, confirmedTraits: {} };
  const raw = getAppStorage().getItem(STORAGE_KEY);
  return parseArchive(raw);
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
