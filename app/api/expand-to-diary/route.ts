import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders } from "../../../lib/api-cors";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ExpandToDiaryRequest = {
  shortAnswer?: string;
  question?: string;
  /** 7단계 인터뷰: 질문-답변 배열 (우선 사용) */
  interviewAnswers?: Array< { question: string; answer: string } >;
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function POST(req: Request) {
  const headers = getCorsHeaders(req);
  try {
    const body = (await req.json()) as ExpandToDiaryRequest;
    const interviewAnswers = body.interviewAnswers;
    const shortAnswer = body.shortAnswer?.trim();
    const question = body.question?.trim();

    const useInterview = Array.isArray(interviewAnswers) && interviewAnswers.length > 0;
    const useLegacy = !useInterview && shortAnswer;

    if (!useInterview && !useLegacy) {
      return NextResponse.json(
        { error: "shortAnswer 또는 interviewAnswers가 필요합니다." },
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500, headers }
      );
    }

    const systemPrompt = `당신은 사용자의 답변을 바탕으로 1인칭 시점의 서술형 일기를 작성하는 글쓰기 도우미입니다.

규칙:
1. 사용자의 답변에 담긴 사건·감정·감각·생각·다짐을 하나의 흐름으로 엮어 300~500자 분량의 일기를 작성하세요.
2. 문체는 사용자가 평소 쓰는 다정하고 담백한 톤을 유지하세요. 1인칭(나, 저)으로 서술하세요.
3. 오늘의 감정과 상황이 생생하게 느껴지도록 구체적인 디테일을 보탭니다. 과장이나 허구를 만들지 말고, 사용자의 말을 자연스럽게 풀어내세요.
4. 일기 본문만 출력하세요. 제목이나 설명 문장은 붙이지 마세요.`;

    let userContent: string;
    if (useInterview) {
      const block = interviewAnswers!
        .map((q, i) => `[${i + 1}] ${q.question}\n답변: ${(q.answer || "").trim() || "(비어 있음)"}`)
        .join("\n\n");
      userContent = `[인터뷰 답변 모음]\n${block}\n\n위 인터뷰 답변을 모두 반영하여 하나의 1인칭 일기(300~500자)로 통합해 주세요.`;
    } else {
      userContent = question
        ? `[질문]\n${question}\n\n[사용자의 짧은 답변]\n${shortAnswer}\n\n위 답변을 바탕으로 300~500자 1인칭 일기로 확장해 주세요.`
        : `[사용자의 짧은 답변]\n${shortAnswer}\n\n위 답변을 바탕으로 300~500자 1인칭 일기로 확장해 주세요.`;
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.6,
    });

    const diary = completion.choices[0]?.message?.content?.trim();

    if (!diary) {
      return NextResponse.json(
        { error: "일기를 생성할 수 없습니다." },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ diary }, { headers });
  } catch (error) {
    console.error("[EXPAND_TO_DIARY_ERROR]", error);
    return NextResponse.json(
      { error: "일기 확장 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
