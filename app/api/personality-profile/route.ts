import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";
import {
  TRAIT_CATEGORY_ORDER,
  TRAIT_CATEGORY_LABELS,
  TRAITS,
} from "../../../constants/traits";
import type { TraitCategory } from "../../../constants/traits";
import type { ConfirmedTrait, TraitEvent } from "../../../lib/identity-archive";

const FADING_DAYS = 30;
const EXTINCTION_DAYS = 100;

export type TraitCardData = {
  category: TraitCategory;
  label: string;
  unlocked: boolean;
  traitLabel: string;
  opening: string;
  body: string;
  closing: string;
  evidence: string;
  traitId?: string;
  /** 장기 카드: 마지막 기록일. 30일 경과 시 fading, 100일 경과 시 목록에서 제외 */
  lastObservedDate?: string;
  /** 장기 카드: 'active' | 'fading' (30일 미기록 시 fading) */
  status?: "active" | "fading";
  /** active(요즘의 나) 카드용: 최근 기간 내 출현 횟수 */
  recentCount?: number;
  /** active 카드용: 7d 대비 30d에서의 변화 (선택) */
  trend?: "up" | "down" | "stable";
};

/** 100일 경과로 목록에서 내려간 성격 (클라이언트에서 안내 팝업 + removeExtinctTraits 호출용) */
export type ExtinctTraitInfo = { traitId: string; label: string };

/** confirmedTraits를 배열로 반환 (레거시 객체 형식 지원). traitEvents 파싱. */
function parseArchive(raw: unknown): {
  summary: string;
  confirmedTraits: ConfirmedTrait[];
  traitEvents: TraitEvent[];
} {
  const empty = { summary: "", confirmedTraits: [] as ConfirmedTrait[], traitEvents: [] as TraitEvent[] };
  if (!raw) return empty;
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ...empty, summary: raw };
    }
  } else if (typeof raw === "object" && raw !== null) {
    parsed = raw as Record<string, unknown>;
  } else {
    return empty;
  }

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
    ) as ConfirmedTrait[];
  } else if (ct && typeof ct === "object" && !Array.isArray(ct)) {
    const legacy = ct as Partial<Record<TraitCategory, Omit<ConfirmedTrait, "category">>>;
    for (const cat of TRAIT_CATEGORY_ORDER) {
      const t = legacy[cat];
      if (t && typeof t === "object" && typeof t.traitId === "string")
        confirmedTraits.push({ ...t, category: cat });
    }
  }

  const traitEvents: TraitEvent[] = Array.isArray(parsed.traitEvents)
    ? (parsed.traitEvents as TraitEvent[]).filter(
        (e): e is TraitEvent =>
          e != null &&
          typeof e === "object" &&
          "date" in e &&
          "traitId" in e &&
          typeof (e as TraitEvent).date === "string" &&
          typeof (e as TraitEvent).traitId === "string"
      )
    : [];

  return {
    summary: String(parsed.summary ?? ""),
    confirmedTraits,
    traitEvents,
  };
}

/** 해당 traitId의 traitEvents에서 최근 날짜 최대 3개를 "N월 N일에 포착됨" 형식으로 반환 */
function buildEvidenceFromTraitEvents(traitId: string, traitEvents: TraitEvent[]): string {
  const dates = traitEvents
    .filter((e) => e.traitId === traitId)
    .map((e) => e.date)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3);
  if (dates.length === 0) return "";
  return dates
    .map((d) => {
      const [y, m, day] = d.split("-").map(Number);
      return `${m}월 ${day}일에 포착됨`;
    })
    .join(", ");
}

function getDateRange(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const ACTIVE_TOP_PER_CATEGORY = 3;

/** 기간 내 일기만 합친 블록 (날짜: 내용 형식). 최대 2000자. */
function journalBlockForRange(
  recentJournalContents: Record<string, string>,
  fromDate: string
): string {
  const entries = Object.entries(recentJournalContents)
    .filter(([date, content]) => date >= fromDate && (content ?? "").trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  let block = entries.map(([d, c]) => `${d}: ${(c ?? "").slice(0, 400)}`).join("\n\n");
  if (block.length > 2000) block = block.slice(0, 1997) + "…";
  return block;
}

type ActiveTraitCopy = { discovery: string; deepInsight: string; encouragement: string };

/** 요즘의 면모용 문구 일괄 생성: 별지기의 발견(Evidence) + 이 마음이 전하는 이야기(Deep Insight) + 별지기의 응원(Closing). */
async function generateActiveTraitsCopyForPeriod(params: {
  traits: { traitId: string; traitLabel: string }[];
  period: "7d" | "30d";
  journalBlock: string;
  identitySummary: string;
  userName: string;
}): Promise<ActiveTraitCopy[]> {
  if (!process.env.OPENAI_API_KEY || !params.journalBlock.trim() || params.traits.length === 0) {
    return params.traits.map(() => ({ discovery: "", deepInsight: "", encouragement: "" }));
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const periodLabel = params.period === "7d" ? "최근 7일" : "최근 30일";
  const traitList = params.traits.map((t, i) => `${i + 1}. ${t.traitLabel} (id: ${t.traitId})`).join("\n");
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 사용자를 오랫동안 지켜본 다정한 상담가 '별지기'입니다.
요즘의 면모(성격) 리포트를, **각 성격 키워드마다** 다음 세 가지를 써주세요.

1. **discovery (별지기의 발견, Evidence)**  
일기 속 **구체적인 단어나 상황을 인용**하며, "이런 부분에서 이 면모를 느꼈어요"라고 언급해 주세요. 기록을 직접 인용하고, 짧게.

2. **deepInsight (이 마음이 전하는 이야기, Deep Insight)**  
사용자의 행동(B)과 감정(E) 이면에 숨겨진 **진심 어린 동기(M)나 지키고자 하는 가치**를 한 문장으로 깊이 있게 짚어 주세요.  
- "지금 당신은 [ ]을 지키고 싶은 마음이군요" 같은 **단순 반복형 문구는 쓰지 마세요.**  
- 그 성격이 나타남으로써 사용자의 삶이 **어떤 의미를 얻고 있는지**, 혹은 **어떤 성장을 암시하는지**를 상담가처럼 우아하게 서술하세요.  
- 14세도 읽을 수 있는 쉬운 비유로, 현재 상태의 심리적 본질을 담아 주세요.

3. **encouragement (별지기의 응원, Closing)**  
이 면모가 **오늘을 버티게 한 힘**이 되었음을 지지해 주는 따뜻한 한 문장.

**가치 중립**: '불안', '걱정', '무기력' 같은 성격이라도 '성장', '빛' 같은 억지 긍정 단어를 쓰지 마세요. 대신 **'나를 이해하는 소중한 단서'**, **'잠시 쉬어가는 궤도'**처럼 담백한 표현을 사용하세요.  
말투: ~해요체. 초등 수준 쉬운 말. 스냅샷·경향·모드 등 시스템 용어 금지. JSON 배열만 출력.`,
        },
        {
          role: "user",
          content: `성격 키워드 목록 (순서 유지):\n${traitList}\n\n${periodLabel} 일기:\n${params.journalBlock.slice(0, 2200)}\n\n${params.identitySummary ? `[과거 정체성 요약]\n${params.identitySummary.slice(0, 350)}` : ""}\n\n[닉네임]은 그대로 두세요. 위 목록 1번부터 순서대로 copy 배열을 만들어주세요.\nJSON: [{"discovery":"...", "deepInsight":"...", "encouragement":"..."}, ...]`,
        },
      ],
      temperature: 0.5,
    });
    const raw = res.choices[0]?.message?.content?.trim();
    if (!raw) return params.traits.map(() => ({ discovery: "", deepInsight: "", encouragement: "" }));
    const arr = JSON.parse(raw.replace(/```json?/gi, "").replace(/```/g, "").trim()) as ActiveTraitCopy[];
    if (!Array.isArray(arr)) return params.traits.map(() => ({ discovery: "", deepInsight: "", encouragement: "" }));
    return params.traits.map((_, i) => ({
      discovery: String(arr[i]?.discovery ?? "").slice(0, 280),
      deepInsight: String(arr[i]?.deepInsight ?? "").slice(0, 200),
      encouragement: String(arr[i]?.encouragement ?? "").slice(0, 180),
    }));
  } catch {
    return params.traits.map(() => ({ discovery: "", deepInsight: "", encouragement: "" }));
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
  try {
    const body = (await req.json()) as {
      identityArchiveRaw?: string | null;
      user_identity_summary?: string | null;
      userName?: string | null;
      recentJournalContents?: Record<string, string> | null;
      identitySummary?: string | null;
    };
    const raw = body.identityArchiveRaw ?? body.user_identity_summary ?? null;
    const userName = body.userName?.trim() || "당신";
    const recentJournalContents = body.recentJournalContents ?? {};
    const identitySummary = (body.identitySummary ?? (raw ? (parseArchive(raw).summary || "") : "")).slice(0, 600);

    const { confirmedTraits, traitEvents } = parseArchive(raw);
    const fadingThreshold = getDateRange(FADING_DAYS);
    const extinctionThreshold = getDateRange(EXTINCTION_DAYS);

    const extinctTraits: ExtinctTraitInfo[] = [];
    const confirmedCards: TraitCardData[] = [];
    for (const cat of TRAIT_CATEGORY_ORDER) {
      const catLabel = TRAIT_CATEGORY_LABELS[cat];
      const traitsInCat = confirmedTraits.filter((t) => t.category === cat);
      for (const t of traitsInCat) {
        const eventDates = traitEvents
          .filter((e) => e.traitId === t.traitId)
          .map((e) => e.date)
          .filter((d, i, arr) => arr.indexOf(d) === i)
          .sort((a, b) => b.localeCompare(a));
        const lastObservedDate = eventDates[0] ?? null;
        if (lastObservedDate != null && lastObservedDate <= extinctionThreshold) {
          extinctTraits.push({ traitId: t.traitId, label: t.label });
          continue;
        }
        const status: "active" | "fading" =
          lastObservedDate == null ? "active" : lastObservedDate <= fadingThreshold ? "fading" : "active";
        const evidence = buildEvidenceFromTraitEvents(t.traitId, traitEvents) || t.reasoning;
        confirmedCards.push({
          category: cat,
          label: catLabel,
          unlocked: true,
          traitId: t.traitId,
          traitLabel: t.label,
          opening: t.opening || `${userName}님을 지켜보니, 여러 순간들에서 이 특성이 잘 드러났어요.`,
          body: t.body,
          closing: t.closing || "이 기록은 당신을 더 깊이 이해하는 단서가 될 거예요.",
          evidence,
          ...(lastObservedDate != null && { lastObservedDate }),
          status,
        });
      }
    }

    const from7 = getDateRange(7);
    const from30 = getDateRange(30);
    const events7 = traitEvents.filter((e) => e.date >= from7);
    const events30 = traitEvents.filter((e) => e.date >= from30);
    const count7ByTrait: Record<string, number> = {};
    const count30ByTrait: Record<string, number> = {};
    for (const e of events7) count7ByTrait[e.traitId] = (count7ByTrait[e.traitId] ?? 0) + 1;
    for (const e of events30) count30ByTrait[e.traitId] = (count30ByTrait[e.traitId] ?? 0) + 1;

    const traitById = new Map(TRAITS.map((t) => [t.id, t]));

    const traits7d: { traitId: string; traitLabel: string; cat: TraitCategory; catLabel: string; count: number; trend: "up" | "down" | "stable" }[] = [];
    const traits30d: { traitId: string; traitLabel: string; cat: TraitCategory; catLabel: string; count: number; trend: "up" | "down" | "stable" }[] = [];
    for (const cat of TRAIT_CATEGORY_ORDER) {
      const catLabel = TRAIT_CATEGORY_LABELS[cat];
      const traitIdsInCat = new Set(TRAITS.filter((t) => t.category === cat).map((t) => t.id));
      const withCount7 = Object.entries(count7ByTrait)
        .filter(([id]) => traitIdsInCat.has(id))
        .map(([traitId, count]) => ({ traitId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, ACTIVE_TOP_PER_CATEGORY);
      const withCount30 = Object.entries(count30ByTrait)
        .filter(([id]) => traitIdsInCat.has(id))
        .map(([traitId, count]) => ({ traitId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, ACTIVE_TOP_PER_CATEGORY);
      for (const { traitId, count } of withCount7) {
        const trait = traitById.get(traitId);
        if (!trait) continue;
        const c30 = count30ByTrait[traitId] ?? 0;
        let trend: "up" | "down" | "stable" = "stable";
        if (c30 > count) trend = "up";
        else if (c30 < count) trend = "down";
        traits7d.push({ traitId, traitLabel: trait.label, cat, catLabel, count, trend });
      }
      for (const { traitId, count } of withCount30) {
        const trait = traitById.get(traitId);
        if (!trait) continue;
        const c7 = count7ByTrait[traitId] ?? 0;
        let trend: "up" | "down" | "stable" = "stable";
        if (count > c7) trend = "up";
        else if (count < c7) trend = "down";
        traits30d.push({ traitId, traitLabel: trait.label, cat, catLabel, count, trend });
      }
    }

    const journal7 = journalBlockForRange(recentJournalContents, from7);
    const journal30 = journalBlockForRange(recentJournalContents, from30);
    const [copy7d, copy30d] = await Promise.all([
      generateActiveTraitsCopyForPeriod({
        traits: traits7d.map((t) => ({ traitId: t.traitId, traitLabel: t.traitLabel })),
        period: "7d",
        journalBlock: journal7,
        identitySummary,
        userName,
      }),
      generateActiveTraitsCopyForPeriod({
        traits: traits30d.map((t) => ({ traitId: t.traitId, traitLabel: t.traitLabel })),
        period: "30d",
        journalBlock: journal30,
        identitySummary,
        userName,
      }),
    ]);

    const warmFallback = (period: "7d" | "30d") => ({
      opening: `요즘 기록을 보며 이 면모가 자주 느껴졌어요.`,
      body: "",
      closing: `이 면모가 요즘 당신을 지탱하는 데 한몫했을 거예요.`,
    });

    const activeCards7d: TraitCardData[] = traits7d.map((t, i) => {
      const copy = copy7d[i];
      const useCopy = copy && (copy.discovery || copy.encouragement);
      return {
        category: t.cat,
        label: t.catLabel,
        unlocked: true,
        traitId: t.traitId,
        traitLabel: t.traitLabel,
        opening: useCopy ? copy.discovery : warmFallback("7d").opening,
        body: useCopy ? copy.deepInsight : warmFallback("7d").body,
        closing: useCopy ? copy.encouragement : warmFallback("7d").closing,
        evidence: "",
        recentCount: t.count,
        trend: t.trend,
      };
    });
    const activeCards30d: TraitCardData[] = traits30d.map((t, i) => {
      const copy = copy30d[i];
      const useCopy = copy && (copy.discovery || copy.encouragement);
      return {
        category: t.cat,
        label: t.catLabel,
        unlocked: true,
        traitId: t.traitId,
        traitLabel: t.traitLabel,
        opening: useCopy ? copy.discovery : warmFallback("30d").opening,
        body: useCopy ? copy.deepInsight : warmFallback("30d").body,
        closing: useCopy ? copy.encouragement : warmFallback("30d").closing,
        evidence: "",
        recentCount: t.count,
        trend: t.trend,
      };
    });

    return NextResponse.json(
      {
        confirmedCards,
        activeCards7d,
        activeCards30d,
        cards: confirmedCards,
        extinctTraits,
      },
      { headers }
    );
  } catch (error) {
    console.log("Personality Profile Error:", error);
    return NextResponse.json(
      {
        confirmedCards: [],
        activeCards7d: [],
        activeCards30d: [],
        cards: [],
        extinctTraits: [],
      },
      { headers }
    );
  }
}
