import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders } from "../../../lib/api-cors";
import type { MoodScores } from "../../../lib/arisum-types";
import { MOOD_SCORE_KEYS } from "../../../lib/arisum-types";
import { TRAITS, TRAIT_CATEGORY_ORDER } from "../../../constants/traits";
import type { TraitCategory } from "../../../constants/traits";
import type { IdentityArchive, ConfirmedTrait, TraitEvent } from "../../../lib/identity-archive";
import { TRAIT_EVENTS_MAX_DAYS, parseArchiveRaw } from "../../../lib/identity-archive";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** user_identity_summary 파싱 (문자열이면 parseArchiveRaw, 객체면 JSON 직렬화 후 파싱). confirmedTraits 항상 배열. */
function parseArchive(raw: unknown): IdentityArchive {
  if (raw == null) return parseArchiveRaw(null);
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);
  return parseArchiveRaw(str || null);
}

type AnalyzeRequest = {
  journal?: string;
  /** 같은 날 여러 일기 시 전체 텍스트 */
  journals?: string[];
  date?: string;
  user_identity_summary?: string | null;
  /** 같은 날 기존 리포트가 있으면 종합 업데이트용 (mood/insight/quests 또는 todayFlow/gardenerWord/growthSeeds) */
  existing_report?: {
    mood?: string;
    insight?: string;
    quests?: string[];
    todayFlow?: string;
    gardenerWord?: string;
    growthSeeds?: string[];
  };
  /** 밤하늘(7일 별자리)용: 최근 7일 일기 맥락 */
  recentJournalContents?: Record<string, string>;
  /** 밤하늘용: 기존 별(분석된 날짜) 목록 */
  existingStarDates?: string[];
  /** 밤하늘용: 이전에 저장된 별자리 이름 (서사 연속성 유지) */
  previousConstellationName?: string | null;
};

export type ActiveConstellationFromApi = {
  id: string;
  name: string;
  meaning: string;
  connectionStyle?: "A" | "B" | "C";
  starIds?: string[];
};

type AnalyzeResponse = {
  todayFlow?: string;
  mood: string;
  insight: string;
  quests: string[];
  updatedArchive: string;
  identityArchive?: IdentityArchive;
  keywords: [string, string, string];
  metrics: MoodScores;
  starPosition?: { x: number; y: number };
  /** 활성 별자리 배열 (다중). 하위 호환용 단일은 currentConstellation */
  currentConstellations?: ActiveConstellationFromApi[];
  currentConstellation?: { name: string; meaning: string; connectionStyle?: "A" | "B" | "C"; starIds?: string[] };
  starConnections?: { from: string; to: string }[];
  newlyConfirmedTrait?: { traitId: string; label: string; opening: string; body: string; closing: string };
};

const CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Origin": "*",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), "Access-Control-Allow-Origin": "*" };
  try {
    const body = (await req.json()) as AnalyzeRequest;
    const journal = body.journal?.trim();
    const journals = body.journals;
    const archive = parseArchive(body.user_identity_summary);
    const user_identity_summary = archive.summary;
    const existing_report = body.existing_report;

    const texts: string[] = Array.isArray(journals) && journals.length > 0
      ? journals.map((j) => String(j).trim()).filter(Boolean)
      : journal
        ? [journal]
        : [];

    if (texts.length === 0) {
      return NextResponse.json(
        { error: "journal 또는 journals는 비어 있을 수 없습니다." },
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500, headers }
      );
    }

    const isComprehensive = existing_report && (existing_report.mood ?? existing_report.todayFlow ?? existing_report.insight ?? existing_report.gardenerWord);
    const systemPrompt = `
당신은 **다정하고 속 깊은 상담사 '별지기'**입니다. 친구나 상담가와 대화하는 듯한 쉬운 말투를 쓰세요.
어려운 철학·한자어는 쓰지 말고, 일상에서 쓰는 말로만 답해 주세요. **별/별자리 비유는 30%만(양념처럼), 실제 상담과 조언은 70%**로 비중을 맞추세요.

---

## 1. [오늘의 기류] (공감과 수용)
사용자의 말을 1~2문장으로 명료하게 요약해서 "이해했다"는 느낌을 전해 주세요.
예: "가치를 잘 알면서도 세상에 어떻게 보여줄지 몰라 답답했던 날이군요."

## 2. [별지기의 생각] (BETMI 기반, 쉽게)
- **말투**: 반드시 **'~해요'체**로만 작성하세요. 반말(해, 해서, 거야 등)을 쓰지 마세요.
- **내부**: 행동(B), 감정(E), 생각(T), 동기(M), 정체성(I)을 분석하세요.
- **공개 문장**: 원인을 짚어 주되, 친구에게 말하듯 쉽게. "무력감"보다 "마음이 헛돌았던 느낌"처럼.
- **과거와 연결**: [과거 누적 정체성 요약]을 참고해, 예전 고민과 오늘 고민이 어떻게 이어지는지 한두 문장으로.

## 3. [맞춤형 퀘스트] (실제로 할 수 있는 행동 제안)

**별자리·우주 비유는 넣지 마세요.** 상담가가 내일 할 일을 구체적으로 알려주는 톤으로만 쓰세요.

**10~15분 제한 원칙**: 모든 퀘스트는 **내일 당장** 15분 이내에 끝낼 수 있는 아주 구체적인 단발성 행동이어야 합니다. '하루 10분씩 ~하기'처럼 지속성을 요구하는 문구는 절대 쓰지 마세요. 오직 **내일 하루**에 집중하세요.

**종결 어미 통일**: 모든 퀘스트 문장은 반드시 **'~하기'** 형식으로 끝맺으세요. (예: 명상하기, 목록 적어보기)

**일기 맥락과의 연결 (BETMI 기반)**: 사용자의 오늘 고민(B-E-T-M-I)을 해결하거나 전환할 수 있는 실질적인 행동을 제안하세요.

- 예시 (진로 고민 시): '공무원'이라는 단어를 제외하고 내가 일할 때 즐거운 순간 3가지 적어보기 / 일반 회사 채용 공고 중 흥미로운 직무 하나만 골라 스크랩하기 / 나를 잘 아는 지인 1명에게 나의 강점 물어보고 기록하기
- 예시 (무기력할 때): 책상 위를 딱 10분만 정돈하기 / 좋아하는 차 한 잔을 마시며 휴대폰 멀리하기

**5가지 제안**: 위 규칙을 지킨 각기 다른 성격의 퀘스트 5개를 생성하세요.

## 4. 7대 지표 스펙트럼 (0~100, 절대 화면에 점수 노출 금지)
각 축은 양극단 사이의 **위치**로만 계산. 내부 저장용.
- resilience, selfAwareness, empathy, meaningOrientation, openness, selfAcceptance, selfDirection (각 0~100 정수)

${isComprehensive ? "## 이번 요청은 '종합 분석'입니다. 같은 날짜에 이미 분석된 내용이 전달됩니다. 오늘 작성된 **모든 일기**를 아우르는 하루 전체의 종합으로 todayFlow, insight, quests, updatedArchive를 업데이트하세요." : ""}

---

## 출력 (JSON만, 설명 없이)
{
  "todayFlow": "오늘의 기류. 사용자 말을 1~2문장으로 명료하게 요약한 공감 신호.",
  "mood": "오늘을 상징하는 시적인 감정 기상도 (한 문장, 은유적)",
  "insight": "별지기의 생각. BETMI 진단 + 원인 짚기 + 과거와의 연결. 반드시 ~해요체로, 친구에게 말하듯 쉬운 말로.",
  "quests": ["~하기로 끝나는 15분 내 단발 행동 1", "2", "3", "4", "5"],
  "updatedArchive": "오늘 새로 발견된 자아의 특성을 누적한 요약본 (내부 아카이브용)",
  "keywords": ["키워드1", "키워드2", "키워드3"],
  "metrics": {
    "selfAwareness": 0-100,
    "resilience": 0-100,
    "empathy": 0-100,
    "selfDirection": 0-100,
    "meaningOrientation": 0-100,
    "openness": 0-100,
    "selfAcceptance": 0-100
  }
}
quests는 반드시 5개. 각 문장은 '~하기'로 끝내고, 내일 15분 내 단발 행동으로 제한. 별자리·우주 비유 금지. 일반적 행동(하늘 보기 등) 금지.
    `.trim();

    const journalBlock = texts.length === 1
      ? `[오늘의 일기]\n${texts[0]}`
      : texts.map((t, i) => `[오늘의 일기 ${i + 1}]\n${t}`).join("\n\n");
    const existingBlock = isComprehensive && existing_report
      ? `\n\n[기존 해당 날짜 리포트]\nmood: ${existing_report.mood ?? existing_report.todayFlow ?? ""}\ninsight: ${existing_report.insight ?? existing_report.gardenerWord ?? ""}\nquests: ${JSON.stringify(existing_report.quests ?? existing_report.growthSeeds ?? [])}`
      : "";
    const userContent = user_identity_summary
      ? `[과거 누적 정체성 요약]\n${user_identity_summary.slice(0, 800)}\n\n${journalBlock}${existingBlock}`
      : `${journalBlock}${existingBlock}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.6,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "모델 응답을 가져올 수 없습니다." },
        { status: 500, headers }
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      const cleaned = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    }

    const raw = parsed as Partial<AnalyzeResponse & { todayFlow?: string; gardenerWord?: string; growthSeeds?: string[]; counselorLetter?: string; updatedSummary?: string }>;
    const firstText = texts[0] ?? "";

    const todayFlow =
      typeof raw.todayFlow === "string" && raw.todayFlow.trim()
        ? raw.todayFlow.trim()
        : (typeof raw.mood === "string" && raw.mood.trim() ? raw.mood.trim() : "오늘의 마음이 조용히 흐르고 있어요.");

    const mood =
      typeof raw.mood === "string" && raw.mood.trim()
        ? raw.mood.trim()
        : todayFlow;

    const insight =
      typeof raw.insight === "string" && raw.insight.trim()
        ? raw.insight.trim()
        : (typeof raw.gardenerWord === "string" && raw.gardenerWord.trim() ? raw.gardenerWord.trim() : "오늘도 당신의 이야기를 들어주어 고마워요.");

    const questsRaw = Array.isArray(raw.quests) ? raw.quests : (Array.isArray(raw.growthSeeds) ? raw.growthSeeds : []);
    const quests = questsRaw
      .slice(0, 5)
      .map((s) => String(s).trim().slice(0, 80))
      .filter(Boolean);

    const updatedArchive =
      typeof raw.updatedArchive === "string" && raw.updatedArchive.trim()
        ? raw.updatedArchive.trim()
        : (typeof raw.updatedSummary === "string" && raw.updatedSummary.trim() ? raw.updatedSummary.trim() : (user_identity_summary || "") + "\n[오늘 일기 요약]\n" + firstText.slice(0, 200));

    const existingTraitEvents: TraitEvent[] = Array.isArray((archive as { traitEvents?: TraitEvent[] }).traitEvents)
      ? [...(archive as { traitEvents: TraitEvent[] }).traitEvents]
      : [];
    const confirmedTraitsArray: ConfirmedTrait[] = Array.isArray(archive.confirmedTraits)
      ? [...archive.confirmedTraits]
      : [];
    let identityArchive: IdentityArchive & { traitEvents?: TraitEvent[] } = {
      summary: updatedArchive,
      traitCounts: { ...archive.traitCounts },
      confirmedTraits: confirmedTraitsArray,
      traitEvents: existingTraitEvents,
    };

    let newlyConfirmedTrait: { traitId: string; label: string; opening: string; body: string; closing: string } | undefined;
    /** 이번 분석에서 카운트를 +1 한 trait id 목록 (삭제 시 회수용) */
    const traitIdsIncrementedForThisDate: string[] = [];

    /** [트랙 B] 7회 반복 추적: 오늘 일기에서 trait 후보 추출 → 카운트 +1 → 정확히 7회 시 확정(축하 팝업용) */
    if (process.env.OPENAI_API_KEY && firstText.length > 50) {
      try {
        const traitsByCat = TRAIT_CATEGORY_ORDER.map((cat) => {
          const list = TRAITS.filter((t) => t.category === cat).map((t) => `${t.id}:${t.label}`).join(", ");
          return `${cat}: ${list}`;
        }).join("\n");

        const traitComp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `이 일기에서 드러나는 성격을 300개 지표 중에서 추출합니다. 각 카테고리당 0~2개의 trait id만 선택. JSON만 출력.
형식: {"emotional":["emotional-24"],"interpersonal":[],"workStyle":["workStyle-03"],"cognitive":["cognitive-37"],"selfConcept":[],"values":[]}
반드시 아래 id만 사용.`,
            },
            {
              role: "user",
              content: `일기:\n${firstText.slice(0, 600)}\n\n지표 목록:\n${traitsByCat}\n\n이 일기와 가장 잘 맞는 trait id 배열(카테고리별 0~2개) JSON만 출력.`,
            },
          ],
          temperature: 0.2,
        });

        const tc = traitComp.choices[0]?.message?.content?.trim();
        if (tc) {
          const parsed = JSON.parse(tc.replace(/```json?/gi, "").replace(/```/g, "").trim()) as Record<string, string[]>;
          const validIds = new Set(TRAITS.map((t) => t.id));
          for (const cat of TRAIT_CATEGORY_ORDER) {
            const ids = Array.isArray(parsed[cat]) ? parsed[cat] : [];
            for (const id of ids) {
              if (validIds.has(id)) {
                identityArchive.traitCounts[id] = (identityArchive.traitCounts[id] ?? 0) + 1;
                traitIdsIncrementedForThisDate.push(id);
                const count = identityArchive.traitCounts[id]!;
                const alreadyConfirmed = identityArchive.confirmedTraits.some((t) => t.traitId === id);
                if (count >= 7 && !alreadyConfirmed) {
                  const trait = TRAITS.find((t) => t.id === id);
                  if (trait) {
                    const reasonComp = await client.chat.completions.create({
                      model: "gpt-4o-mini",
                      messages: [
                        {
                          role: "system",
                          content: `이 성격 지표를 확정한 근거(7개 이상 일기에서 반복된 공통 패턴)를 요약하고, 별지기(다정한 상담사) 말투로 팝업용 문장 작성. JSON만.
규칙: (1) opening에는 반드시 [닉네임]을 그대로 두어라. (2) closing은 가치 중립적으로 써라. 성격이 '불안, 걱정, 무기력' 등 부정적이거나 힘든 상태를 나타낼 때는 '소중히 여기다/간직하다'나 '빛'을 사용하지 말고, '인지하다, 이해하다, 기록하다'처럼 객관적으로 관찰·기록하는 표현을 써라. 사용자가 평가받거나 교정받는 느낌이 들지 않게, 상담가로서 객관적 관찰자 태도를 유지해라.
예시 closing(긍정적): "이 기록은 당신을 더 깊이 이해하는 단서가 될 거예요."
{"reasoning":"쉽게 이해할 수 있는 근거 1~2문장","opening":"[닉네임]님을 지켜보니, ~한 순간들이 자주 보여요.","body":"이 성격이 삶에서 어떤 의미인지 2~3문장","closing":"가치 중립적 마무리 1문장"}`,
                        },
                        {
                          role: "user",
                          content: `확정 지표: ${trait.label} (${trait.id}). 사용자 일기·정체성 요약:\n${updatedArchive.slice(0, 500)}`,
                        },
                      ],
                      temperature: 0.5,
                    });
                    const rc = reasonComp.choices[0]?.message?.content?.trim();
                    if (rc) {
                      const rp = JSON.parse(rc.replace(/```json?/gi, "").replace(/```/g, "").trim()) as {
                        reasoning?: string;
                        opening?: string;
                        body?: string;
                        closing?: string;
                      };
                      const newTrait: ConfirmedTrait = {
                        category: cat as TraitCategory,
                        traitId: id,
                        label: trait.label,
                        reasoning: String(rp.reasoning ?? "").slice(0, 200),
                        opening: String(rp.opening ?? "").slice(0, 120),
                        body: String(rp.body ?? "").slice(0, 200),
                        closing: String(rp.closing ?? "이 기록은 당신을 더 깊이 이해하는 단서가 될 거예요.").slice(0, 80),
                      };
                      identityArchive.confirmedTraits.push(newTrait);
                      newlyConfirmedTrait = {
                        traitId: id,
                        label: trait.label,
                        opening: String(rp.opening ?? "").slice(0, 120),
                        body: String(rp.body ?? "").slice(0, 200),
                        closing: String(rp.closing ?? "이 기록은 당신을 더 깊이 이해하는 단서가 될 거예요.").slice(0, 80),
                      };
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[TRAIT_EXTRACT]", e);
      }
    }

    /** traitEvents: 이번 분석 날짜에 발생한 traitId 기록 추가 후 90일만 유지 */
    const dateKeyForEvents = body.date ?? new Date().toISOString().slice(0, 10);
    for (const traitId of traitIdsIncrementedForThisDate) {
      identityArchive.traitEvents!.push({ date: dateKeyForEvents, traitId });
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRAIT_EVENTS_MAX_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    if (identityArchive.traitEvents!.length > 0) {
      identityArchive.traitEvents = identityArchive.traitEvents!.filter((e) => e.date >= cutoffStr);
    }

    const keywordsRaw = Array.isArray(raw.keywords) ? raw.keywords : [];
    const keywords: [string, string, string] = [
      String(keywordsRaw[0] ?? "오늘").trim().slice(0, 20),
      String(keywordsRaw[1] ?? "나").trim().slice(0, 20),
      String(keywordsRaw[2] ?? "마음").trim().slice(0, 20),
    ];

    const metricsRaw = raw.metrics as Partial<MoodScores> | undefined;
    const metrics: MoodScores = {} as MoodScores;
    for (const key of MOOD_SCORE_KEYS) {
      metrics[key] = clampToScore(metricsRaw?.[key]);
    }

    const starPosition = metricsToStarPosition(metrics);

    let currentConstellations: ActiveConstellationFromApi[] = [];
    let starConnections: { from: string; to: string }[] | undefined;

    const dateKey = body.date ?? new Date().toISOString().slice(0, 10);
    const todayStarId = `star-${dateKey}`;
    const recentJournalContents = body.recentJournalContents ?? {};
    const existingStarDates = body.existingStarDates ?? [];
    const recentDates = Object.keys(recentJournalContents).filter((d) => (recentJournalContents[d] ?? "").trim().length > 20).sort();

    const previousConstellationName = body.previousConstellationName ?? null;
    const hasPreviousName = typeof previousConstellationName === "string" && previousConstellationName.trim().length > 0;

    /** [트랙 A] 지금의 밤하늘: 최근 7일 일기에서 서로 다른 맥락의 군집이 있으면 각각 별자리로 정의해 배열 반환 */
    if (recentDates.length >= 2 && process.env.OPENAI_API_KEY) {
      try {
        const journalBlock = recentDates
          .slice(-7)
          .map((d) => `${d}: ${(recentJournalContents[d] ?? "").slice(0, 150)}…`)
          .join("\n\n");
        const comp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `당신은 최근 7일간의 일기 맥락을 보고 '지금 보이는 별자리'를 정의하는 역할을 합니다.
서로 다른 주제·감정·맥락이 보이면 1개가 아닌 여러 개의 별자리로 나눕니다. 하나의 흐름만 보이면 별자리는 1개만 반환하세요.
각 별자리: name(이름), meaning(한 문장 의미), connectionStyle(A/B/C), dateKeys(해당 맥락에 속하는 날짜 문자열 배열, 최소 2개).
연결 스타일: A=직선·각진, B=완만한 곡선, C=중앙에서 뻗는 방사형.
날짜는 반드시 제공된 recentDates 안의 값만 사용하세요. 각 날짜는 최대 한 별자리에만 속합니다.
JSON만 출력. 형식: {"constellations":[{"id":"c1","name":"...","meaning":"...","connectionStyle":"A"|"B"|"C","dateKeys":["2025-01-01","2025-01-02"]},...]}`,
            },
            {
              role: "user",
              content: `최근 일기(날짜별 요약):\n${journalBlock}\n\n사용 가능한 날짜: ${recentDates.join(", ")}\n\n위 날짜들만 사용해서 1개 이상의 별자리로 군집화하고, 각 별자리의 id, name, meaning, connectionStyle, dateKeys를 JSON으로만 출력.`,
            },
          ],
          temperature: hasPreviousName ? 0.35 : 0.6,
        });
        const cc = comp.choices[0]?.message?.content?.trim();
        if (cc) {
          const cleaned = cc.replace(/```json?/gi, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleaned) as { constellations?: Array<{ id?: string; name?: string; meaning?: string; connectionStyle?: string; dateKeys?: string[] }> };
          const list = Array.isArray(parsed?.constellations) ? parsed.constellations : [];
          for (let i = 0; i < list.length; i++) {
            const c = list[i]!;
            const dateKeys = Array.isArray(c.dateKeys) ? c.dateKeys.filter((d: string) => recentDates.includes(d)) : [];
            if (dateKeys.length < 2) continue;
            const style = c.connectionStyle === "A" || c.connectionStyle === "B" || c.connectionStyle === "C" ? c.connectionStyle : "B";
            currentConstellations.push({
              id: typeof c.id === "string" ? c.id : `c-${i}`,
              name: String(c.name ?? "").slice(0, 40),
              meaning: String(c.meaning ?? "").slice(0, 120),
              connectionStyle: style,
              starIds: dateKeys.map((d: string) => `star-${d}`),
            });
          }
        }
      } catch {
        // ignore
      }
    }

    if (existingStarDates.length > 0 && firstText.length > 50 && process.env.OPENAI_API_KEY) {
      try {
        const existingBlock = existingStarDates
          .filter((d) => d !== dateKey)
          .slice(-10)
          .map((d) => `- ${d}`)
          .join("\n");
        const comp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "오늘 일기가 기존 어떤 날짜의 별과 '이어지는'지 판단. 감정·주제·맥락이 비슷한 날짜만 선택. JSON 배열만 출력. 예: [\"2025-01-15\", \"2025-01-18\"] - 최대 3개.",
            },
            {
              role: "user",
              content: `오늘(${dateKey}) 일기:\n${firstText.slice(0, 400)}\n\n기존 별 날짜:\n${existingBlock}\n\n오늘과 이어지는 날짜 id만 JSON 배열로. 없으면 [].`,
            },
          ],
          temperature: 0.3,
        });
        const sc = comp.choices[0]?.message?.content?.trim();
        if (sc) {
          const arr = JSON.parse(sc.replace(/```json?/gi, "").replace(/```/g, "").trim()) as string[];
          if (Array.isArray(arr)) {
            starConnections = arr
              .filter((d) => existingStarDates.includes(d) && d !== dateKey)
              .slice(0, 3)
              .map((d) => ({ from: todayStarId, to: `star-${d}` }));
          }
        }
      } catch {
        // ignore
      }
    }

    /** GPT가 별자리를 못 만들었을 때: 오늘+연결된 별로 단일 별자리 1개 생성 */
    if (currentConstellations.length === 0 && (starConnections?.length ?? 0) >= 1) {
      const ids = [todayStarId, ...(starConnections ?? []).map((c) => (c.from === todayStarId ? c.to : c.from))];
      currentConstellations = [{ id: "current", name: "지금의 별자리", meaning: "오늘과 이어지는 기록이에요.", connectionStyle: "B", starIds: ids }];
    }

    /** 오늘 별을 어떤 활성 별자리에 넣을지: 연결된 별이 있는 별자리에 추가. 없으면 첫 번째에 추가 */
    if (currentConstellations.length > 0) {
      const connectedIds = new Set((starConnections ?? []).map((c) => (c.from === todayStarId ? c.to : c.from)));
      let added = false;
      for (const c of currentConstellations) {
        const overlap = (c.starIds ?? []).filter((id) => connectedIds.has(id));
        if (overlap.length > 0 && !(c.starIds ?? []).includes(todayStarId)) {
          c.starIds = [...(c.starIds ?? []), todayStarId];
          added = true;
          break;
        }
      }
      if (!added && currentConstellations.length > 0) {
        const first = currentConstellations[0]!;
        first.starIds = [...(first.starIds ?? []), todayStarId];
      }
      currentConstellations = currentConstellations.filter((c) => (c.starIds?.length ?? 0) >= 2);
    }

    const singleForCompat = currentConstellations.length > 0 ? { name: currentConstellations[0]!.name, meaning: currentConstellations[0]!.meaning, connectionStyle: currentConstellations[0]!.connectionStyle, starIds: currentConstellations[0]!.starIds } : undefined;

    return NextResponse.json(
      {
        mood,
        insight,
        quests,
        updatedArchive,
        identityArchive,
        keywords,
        metrics,
        scores: metrics,
        todayFlow,
        gardenerWord: insight,
        growthSeeds: quests,
        counselorLetter: insight,
        updatedSummary: updatedArchive,
        starPosition,
        currentConstellations: currentConstellations.length > 0 ? currentConstellations : undefined,
        currentConstellation: singleForCompat,
        starConnections: starConnections ?? [],
        newlyConfirmedTrait: newlyConfirmedTrait ?? undefined,
        traitIdsIncrementedForThisDate:
          traitIdsIncrementedForThisDate.length > 0 ? traitIdsIncrementedForThisDate : undefined,
      },
      { headers }
    );
  } catch (error) {
    console.error("[ANALYZE_ERROR]", error);

    const err = error as {
      status?: number;
      code?: string;
      message?: string;
    };

    if (
      err?.status === 401 ||
      err?.code === "invalid_api_key" ||
      (typeof err?.message === "string" &&
        err.message.includes("Incorrect API key"))
    ) {
      return NextResponse.json(
        {
          error:
            "OpenAI API 키가 올바르지 않습니다. https://platform.openai.com/account/api-keys 에서 새 키를 복사해 .env.local 의 OPENAI_API_KEY 값을 교체해 주세요.",
        },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      { error: "분석 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}

function clampToScore(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(num)) {
    return 50;
  }

  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

const VIEW_MIN = 10;
const VIEW_MAX = 90;
const VIEW_RANGE = VIEW_MAX - VIEW_MIN;function clampToView(val: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 50;
  const pct = Math.max(0, Math.min(100, n));
  return VIEW_MIN + (pct / 100) * VIEW_RANGE;
}/** 7대 지표 → 2D 좌표 (viewBox 0~100 기준) */
function metricsToStarPosition(s: MoodScores): { x: number; y: number } {
  const rawX = (s.selfAwareness + s.openness + s.meaningOrientation) / 3;
  const rawY = (s.selfAcceptance + s.resilience + s.empathy) / 3;
  return { x: clampToView(rawX), y: clampToView(rawY) };
}