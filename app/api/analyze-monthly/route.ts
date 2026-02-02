import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { MoodScores } from "../../../lib/arisum-types";
import { MOOD_SCORE_KEYS } from "../../../lib/arisum-types";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type DiaryEntry = { date: string; content: string; todayFlow?: string; gardenerWord?: string };

type AnalyzeMonthlyRequest = {
  yearMonth: string;
  diaries: DiaryEntry[];
  scoresHistory: Record<string, MoodScores>;
  user_identity_summary?: string | null;
  userName?: string | null;
};

type MindMap = {
  dominantPersona: string;
  shadowConfession: string;
  defenseWall: string;
  stubbornRoots: string;
  personalityDiurnalRange: string;
  unconsciousLanguage: string;
  latentPotential: string;
};

type AnalyzeMonthlyResponse = {
  monthlyTitle: string;
  prologue: string;
  terrainComment: string;
  modeAnalysis: MindMap;
  metricShift: Partial<MoodScores>;
  goldenSentences: { sentence: string; empathyComment: string }[];
  charmSentence: string;
};

const SPECTRUM_LABELS: { key: keyof MoodScores; label: string; low: string; high: string }[] = [
  { key: "resilience", label: "감정회복", low: "침잠", high: "복원" },
  { key: "selfAwareness", label: "사고방식", low: "본질", high: "실천" },
  { key: "empathy", label: "관계맺기", low: "독립", high: "연결" },
  { key: "meaningOrientation", label: "가치기준", low: "논리", high: "감정" },
  { key: "openness", label: "도전정신", low: "안정", high: "모험" },
  { key: "selfAcceptance", label: "자아수용", low: "채찍", high: "포용" },
  { key: "selfDirection", label: "삶의동력", low: "통제", high: "순응" },
];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeMonthlyRequest;
    const { yearMonth, diaries, scoresHistory, userName } = body;
    let user_identity_summary = body.user_identity_summary?.trim() || null;
    if (user_identity_summary) {
      try {
        const p = JSON.parse(user_identity_summary);
        if (p?.summary) user_identity_summary = String(p.summary);
      } catch {
        /* keep as-is */
      }
    }

    if (!yearMonth || !Array.isArray(diaries) || diaries.length === 0) {
      return NextResponse.json(
        { error: "yearMonth와 diaries(최소 1개)가 필요합니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500 }
      );
    }

    const dates = diaries.map((d) => d.date).sort();
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const firstScores = firstDate ? scoresHistory[firstDate] : undefined;
    const lastScores = lastDate ? scoresHistory[lastDate] : undefined;

    const metricShiftDesc = firstScores && lastScores
      ? SPECTRUM_LABELS.map(({ key, label }) => {
          const diff = (lastScores[key] ?? 50) - (firstScores[key] ?? 50);
          return `${label}(${key}): ${diff >= 0 ? "+" : ""}${diff}`;
        }).join(", ")
      : "데이터 부족";

    const diaryBlock = diaries
      .map(
        (d) =>
          `[${d.date}]\n일기: ${d.content}\n오늘의 기류: ${d.todayFlow ?? "-"}\n별지기: ${d.gardenerWord ?? "-"}`
      )
      .join("\n\n---\n\n");

    const nickname = (userName ?? "").trim() || "당신";

    const systemPrompt = `당신은 다정한 상담사 '별지기'입니다. BETMI 모델 기반으로 한 달 일기를 분석합니다.

**공통 제약 (Readability)**:
- 만 14세 이상, 초등 교육을 마친 사람이 한 번에 이해할 수 있는 쉬운 단어만 사용하세요.
- 전문 용어(회피 동기, 자기수용, 페르소나, 방어 기제 등)를 절대 사용하지 마세요. 일상적인 말로 풀어서 설명하세요.
- 예시: "자아수용이 두드러진 모습" (X) → "자신을 너그럽게 안아주는 마음이 돋보였어요" (O)
- 기계적인 보고서가 아니라, 다정한 성인이 아이를 다독이는 듯한 따뜻한 말투를 유지하세요.

## 1. terrainComment (자아 지형도 AI 코멘트)
한 달의 시작과 끝 7대 지표 변화를 보며, '생각의 무게중심이 어디로 움직였는지' 쉽게 풀어서 짚어주세요. 2줄 이내로.

## 2. modeAnalysis (마음의 지도 - 7개 항목)
일기 속 구체적인 사례를 짧게 언급하면서, 각 항목을 한 문장씩 쉽게 풀어주세요. "변화의 의지가 강해졌다"처럼 추상적으로 말하지 말고, 일기에서 나온 실제 에피소드나 표현을 담아주세요.
예시: "인력거 대신 자동차를 타겠다고 결심했던 그날처럼, 새로운 길을 가려는 마음이 아주 강하게 느껴졌어요."
- dominantPersona: 이달의 대표 마음 (이번 달 가장 자주 드러난 행동과 마음의 모습)
- shadowConfession: 숨겨두었던 조각 (겉으로는 안 보였지만 일기 속에 숨어 있던 속마음)
- defenseWall: 마음을 지키는 법 (불안할 때 어떻게 스스로를 보호하려 했는지)
- stubbornRoots: 흔들리지 않는 중심 (어떤 상황에서도 끝까지 지켜온 소중한 것)
- personalityDiurnalRange: 가장 많이 변한 곳 (한 달 사이에 가장 크게 달라진 마음의 지점)
- unconsciousLanguage: 입버릇처럼 쓴 말 (일기에 자주 반복된 말이나 표현)
- latentPotential: 새로 돋아난 싹 (후반부 일기에서 살짝 보이기 시작한 좋은 변화)

## 3. goldenSentences (별지기가 골라준 문장 - 극F 공감)
사용자 아픔과 기쁨에 온 마음으로 공감하세요. empathyComment는 **딱 한 문장**, **해요체(~해요)**로 통일.

## 4. charmSentence (매력 섹션)
사용자의 핵심을 사회적 강점으로 풀어낸 매력적인 한 문장. 해요체로.

## 출력 (JSON만)
{
  "monthlyTitle": "한 달을 관통하는 시적 제목",
  "prologue": "별지기 서문 (2~4문장)",
  "terrainComment": "자아 지형도 AI 코멘트 (2줄 이내)",
  "modeAnalysis": {
    "dominantPersona": "...",
    "shadowConfession": "...",
    "defenseWall": "...",
    "stubbornRoots": "...",
    "personalityDiurnalRange": "...",
    "unconsciousLanguage": "...",
    "latentPotential": "..."
  },
  "metricShift": { "resilience": 숫자, "selfAwareness": 숫자, ... (1일차 대비 말일차 변화량) },
  "goldenSentences": [
    { "sentence": "선명했던 문장", "empathyComment": "극F 공감 한 문장" },
    ... (3~5개)
  ],
  "charmSentence": "매력 한 문장"
}`;

    const userContent = `[닉네임] ${nickname}

[과거 누적 정체성]\n${user_identity_summary || "(없음)"}

[7대 지표 변화]\n${metricShiftDesc}

[한 달 일기 및 분석]\n${diaryBlock}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "모델 응답을 가져올 수 없습니다." },
        { status: 500 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.replace(/```json/gi, "").replace(/```/g, "").trim());
    } catch {
      return NextResponse.json(
        { error: "월간 분석 파싱에 실패했습니다." },
        { status: 500 }
      );
    }

    const raw = parsed as Partial<AnalyzeMonthlyResponse>;

    const metricShift: Partial<MoodScores> = {};
    if (firstScores && lastScores) {
      for (const k of MOOD_SCORE_KEYS) {
        const diff = (lastScores[k] ?? 50) - (firstScores[k] ?? 50);
        metricShift[k] = Math.round(diff * 10) / 10;
      }
    }
    raw.metricShift = raw.metricShift ?? metricShift;

    return NextResponse.json(raw);
  } catch (error) {
    console.error("[ANALYZE_MONTHLY_ERROR]", error);
    return NextResponse.json(
      { error: "월간 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
