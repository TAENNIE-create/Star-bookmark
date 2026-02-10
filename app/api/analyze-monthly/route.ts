import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";
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
  /** 별지기의 해석 노트: 지표 간 모순/병행 포착 → 발견의 문장 */
  interpretationNote?: string;
  modeAnalysis: MindMap;
  metricShift: Partial<MoodScores>;
  goldenSentences: { sentence: string; empathyComment: string }[];
  charmSentence: string;
};

const SPECTRUM_LABELS: { key: keyof MoodScores; label: string; low: string; high: string }[] = [
  { key: "resilience", label: "감정회복", low: "가라앉음", high: "다시 일어남" },
  { key: "selfAwareness", label: "사고방식", low: "생각", high: "행동" },
  { key: "empathy", label: "관계맺기", low: "혼자", high: "함께" },
  { key: "meaningOrientation", label: "가치기준", low: "이성", high: "감정" },
  { key: "openness", label: "도전정신", low: "익숙함", high: "새로움" },
  { key: "selfAcceptance", label: "자아수용", low: "자책", high: "이해" },
  { key: "selfDirection", label: "삶의동력", low: "통제", high: "순응" },
];

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
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
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "서버 환경변수에 OPENAI_API_KEY를 등록하세요." },
        { status: 500, headers }
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

## 2. interpretationNote (별지기의 해석 노트 - Paradox Logic)
개별 지표 요약이 아니라, **두 개 이상의 지표나 감정이 '충돌'하거나 '병행'하는 지점**을 찾아 그 심리적 의미를 해석하세요.
- 예: [감정회복·가라앉음]과 [삶의동력·통제/순응]이 동시에 움직인다 → "불안은 보통 우리를 멈추게 하지만, 당신은 그 불안을 연료 삼아 앞으로 나갔습니다. 이는 변화 직전의 가장 역동적인 신호입니다."
- 예: 어떤 지표는 낮고 [사고방식·생각]은 높다 → "겉으로는 멈춰 있는 듯 보였지만, 내면은 그 어느 때보다 치열하게 움직였습니다. 겨울의 시간을 잘 보내셨네요."
- 예: [가치기준·이성]과 [감정]이 번갈아 나타난다 → "머리와 가슴이 번갈아 목소리를 냈던 한 달입니다. 이 치열한 줄다리기는 결국 가장 후회 없는 선택을 하기 위한 신중한 과정이었습니다."
**톤**: "보통 사람들은 ~하지만, 당신은 ~했습니다" 같은 대조로 사용자의 고유한 반응 패턴을 칭찬하고 정의하세요. **뻔한 위로가 아닌, 데이터를 근거로 한 '발견의 문장'**이어야 합니다. 2~4문장, 해요체.

## 3. modeAnalysis (마음의 지도 - 7개 항목)
일기 속 구체적인 사례를 짧게 언급하면서, 각 항목을 한 문장씩 쉽게 풀어주세요. "변화의 의지가 강해졌다"처럼 추상적으로 말하지 말고, 일기에서 나온 실제 에피소드나 표현을 담아주세요.
예시: "인력거 대신 자동차를 타겠다고 결심했던 그날처럼, 새로운 길을 가려는 마음이 아주 강하게 느껴졌어요."
- dominantPersona: 이달의 대표 마음 (이번 달 가장 자주 드러난 행동과 마음의 모습)
- shadowConfession: 숨겨두었던 조각 (겉으로는 안 보였지만 일기 속에 숨어 있던 속마음)
- defenseWall: 마음을 지키는 법 (불안할 때 어떻게 스스로를 보호하려 했는지)
- stubbornRoots: 흔들리지 않는 중심 (어떤 상황에서도 끝까지 지켜온 소중한 것)
- personalityDiurnalRange: 가장 많이 변한 곳 (한 달 사이에 가장 크게 달라진 마음의 지점)
- unconsciousLanguage: 입버릇처럼 쓴 말 (일기에 자주 반복된 말이나 표현)
- latentPotential: 새로 돋아난 싹 (후반부 일기에서 살짝 보이기 시작한 좋은 변화)

## 4. goldenSentences (별지기가 골라준 문장 - 극F 공감)
- **sentence**: 일기 본문에 사용자가 실제로 썼던 문장을 **끊지 말고 그대로** 인용하세요. 해요체로 바꾸거나 요약·재작성하지 마세요. 원문을 한 글자도 바꾸지 않고 복사해서 넣으세요.
- **empathyComment**: 그 문장에 대한 별지기의 공감 한 문장. **해요체(~해요)**로 통일.

## 5. charmSentence (매력 섹션)
사용자의 핵심을 사회적 강점으로 풀어낸 매력적인 한 문장. 해요체로.

## 출력 (JSON만)
{
  "monthlyTitle": "한 달을 관통하는 시적 제목",
  "prologue": "별지기 서문 (2~4문장)",
  "terrainComment": "자아 지형도 AI 코멘트 (2줄 이내)",
  "interpretationNote": "별지기의 해석 노트: 지표 간 모순·병행을 포착한 발견의 문장 2~4문장(해요체)",
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
    { "sentence": "일기 원문에서 그대로 인용한 문장(해요체 변환 금지)", "empathyComment": "극F 공감 한 문장(해요체)" },
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
        { status: 500, headers }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.replace(/```json/gi, "").replace(/```/g, "").trim());
    } catch {
      return NextResponse.json(
        { error: "월간 분석 파싱에 실패했습니다." },
        { status: 500, headers }
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

    return NextResponse.json(raw, { headers });
  } catch (error) {
    console.log("Analyze Monthly Error:", error);
    return NextResponse.json(
      { error: "월간 분석 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
