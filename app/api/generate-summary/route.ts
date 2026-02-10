import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders } from "../../../lib/api-cors";
import type { MoodScores } from "../../../lib/arisum-types";
import { MOOD_SCORE_KEYS, MOOD_SCORE_LABELS } from "../../../lib/arisum-types";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type GenerateSummaryRequest = {
  journal: string;
  scores: MoodScores;
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function POST(req: Request) {
  const headers = getCorsHeaders(req);
  try {
    const body = (await req.json()) as GenerateSummaryRequest;
    const { journal, scores } = body;

    if (!journal?.trim()) {
      return NextResponse.json(
        { error: "journal은 비어 있을 수 없습니다." },
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500, headers }
      );
    }

    const scoresText = MOOD_SCORE_KEYS.map(
      (k) => `- ${MOOD_SCORE_LABELS[k]}: ${scores[k]}/100`
    ).join("\n");

    const systemPrompt = `당신은 사용자의 일기와 심리 분석 점수를 바탕으로 따뜻하고 통찰력 있는 총평을 작성하는 상담가입니다.

다음 7대 지표의 점수를 참고하여:
${scoresText}

일기 내용을 읽고, 1-2문장으로 짧고 명확한 총평을 작성해주세요. 
- 격려적이고 따뜻한 톤을 유지하세요.
- 구체적인 관찰이나 패턴을 언급하세요.
- 추상적이지 않고 실질적인 내용을 담아주세요.
- 총평만 응답하세요. 설명이나 추가 텍스트는 포함하지 마세요.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `사용자의 일기:\n\n${journal}`,
        },
      ],
      temperature: 0.7,
    });

    const summary = completion.choices[0]?.message?.content?.trim();

    if (!summary) {
      return NextResponse.json(
        { error: "총평을 생성할 수 없습니다." },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ summary }, { headers });
  } catch (error) {
    console.error("[GENERATE_SUMMARY_ERROR]", error);

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
      { error: "총평 생성 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
