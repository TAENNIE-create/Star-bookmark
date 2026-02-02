import { NextResponse } from "next/server";
import {
  TRAIT_CATEGORY_ORDER,
  TRAIT_CATEGORY_LABELS,
} from "../../../constants/traits";
import type { TraitCategory } from "../../../constants/traits";
import type { ConfirmedTrait } from "../../../lib/identity-archive";

export type TraitCardData = {
  category: TraitCategory;
  label: string;
  unlocked: boolean;
  traitLabel: string;
  opening: string;
  body: string;
  closing: string;
  evidence: string;
};

function parseArchive(raw: unknown): { summary: string; confirmedTraits: Partial<Record<TraitCategory, ConfirmedTrait>> } {
  if (!raw) return { summary: "", confirmedTraits: {} };
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return {
          summary: String(p.summary ?? ""),
          confirmedTraits: (p.confirmedTraits && typeof p.confirmedTraits === "object") ? p.confirmedTraits : {},
        };
      }
    } catch {
      return { summary: raw, confirmedTraits: {} };
    }
  }
  return { summary: "", confirmedTraits: {} };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      identityArchiveRaw?: string | null;
      user_identity_summary?: string | null;
      userName?: string | null;
    };
    const raw = body.identityArchiveRaw ?? body.user_identity_summary ?? null;
    const userName = body.userName?.trim() || "당신";

    const { confirmedTraits } = parseArchive(raw);

    const cards: TraitCardData[] = TRAIT_CATEGORY_ORDER.map((cat) => {
      const confirmed = confirmedTraits[cat];
      const catLabel = TRAIT_CATEGORY_LABELS[cat];
      if (confirmed) {
        return {
          category: cat,
          label: catLabel,
          unlocked: true,
          traitLabel: confirmed.label,
          opening: confirmed.opening || `${userName}님의 우주를 지켜보니, 여러 순간들에서 이 특별한 빛을 발견했어요.`,
          body: confirmed.body,
          closing: confirmed.closing || "이 빛을 소중히 간직하세요.",
          evidence: confirmed.reasoning,
        };
      }
      return {
        category: cat,
        label: catLabel,
        unlocked: false,
        traitLabel: "",
        opening: "",
        body: "",
        closing: "이 빛을 소중히 간직하세요.",
        evidence: "",
      };
    });

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("[PERSONALITY_PROFILE_ERROR]", error);
    const cards: TraitCardData[] = TRAIT_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: TRAIT_CATEGORY_LABELS[cat],
      unlocked: false,
      traitLabel: "",
      opening: "",
      body: "",
      closing: "이 빛을 소중히 간직하세요.",
      evidence: "",
    }));
    return NextResponse.json({ cards });
  }
}
