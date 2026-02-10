import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type GenerateQuestionRequest = {
  seedAnswer: string;
  recentJournals: Array<{
    date: string;
    content: string;
    aiQuestion?: string;
  }>;
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
  try {
    const body = (await req.json()) as GenerateQuestionRequest;
    const { seedAnswer, recentJournals } = body;

    if (!seedAnswer?.trim()) {
      return NextResponse.json(
        { error: "seedAnswer는 비어 있을 수 없습니다." },
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "서버 환경변수에 OPENAI_API_KEY를 등록하세요." },
        { status: 500, headers }
      );
    }

    // 최근 일기 데이터를 컨텍스트로 구성
    const recentContext = recentJournals
      .map((journal) => {
        const dateStr = new Date(journal.date).toLocaleDateString("ko-KR");
        return `[${dateStr}]\n${journal.content}${journal.aiQuestion ? `\n(이전 질문: ${journal.aiQuestion})` : ""}`;
      })
      .join("\n\n");

    const systemPrompt = `당신은 사용자의 내면을 파고드는 상담가입니다. 사용자가 오늘 던진 단어와 최근의 고민을 엮어서, 반드시 구체적이고 뻔하지 않은 질문을 하나만 생성하세요. 질문은 "왜"라는 물음을 포함해야 합니다.

중요한 원칙:
1. 추상적인 질문은 하지 마세요. 사용자의 구체적인 상황·감정·일기 내용과 연결된 질문을 하세요.
2. 질문은 반드시 "왜"라는 물음을 포함해야 합니다.
3. 질문만 한 문장으로 응답하세요. 설명이나 추가 텍스트는 포함하지 마세요.`;

    const userPrompt = `사용자가 오늘 던진 단어(색깔/단어 등): "${seedAnswer}"

최근 3일간의 일기 내용:
${recentContext || "(아직 저장된 일기가 없습니다.)"}

위 정보를 바탕으로, 사용자의 내면을 파고드는 구체적이고 뻔하지 않은 질문 하나를 생성해주세요. 반드시 "왜"가 포함되어야 합니다.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const question = completion.choices[0]?.message?.content?.trim();

    if (!question) {
      return NextResponse.json(
        { error: "질문을 생성할 수 없습니다." },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ question }, { headers });
  } catch (error) {
    console.log("Generate Question Error:", error);

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
      { error: "질문 생성 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
