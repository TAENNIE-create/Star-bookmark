import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type PhotoToDiaryRequest = {
  visualDescription: string;
  questions: [string, string, string, string];
  answers: [string, string, string, string];
};

/** 사진 성찰 기반 일기 생성만 수행. 7대 지표·BETMI 분석은 출력하지 않음(나중에 30별조각 해금 시 별도 실행). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PhotoToDiaryRequest;
    const { visualDescription, questions, answers } = body;

    if (!visualDescription || !Array.isArray(questions) || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "visualDescription, questions, answers가 필요합니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500 }
      );
    }

    const qaBlock = questions
      .map((q, i) => `질문: ${q}\n답변: ${(answers[i] ?? "").trim() || "(비어 있음)"}`)
      .join("\n\n");

    const systemPrompt = `당신은 사진과 사용자의 4단계 답변을 바탕으로 1인칭 시점의 서술형 일기 초안을 쓰는 별지기입니다.

규칙:
1. 객관적 묘사(visualDescription)와 4단계 질문-답변을 자연스럽게 엮어 300~500자 분량의 1인칭 일기를 작성하세요.
2. 문체는 다정하고 담백한 톤으로, 1인칭(나, 저)으로 서술하세요.
3. 사진이 담은 순간과 그때의 마음이 생생하게 느껴지도록 구체적으로 풀어내세요. 과장이나 허구를 만들지 마세요.
4. 사용자의 말을 그대로 복사하지 말고, 이해한 내용을 자연스러운 문장으로 녹여내세요.
5. 일기 본문만 출력하세요. 제목, 번호, "별지기의 생각", 7대 지표, 심층 조언 등은 절대 붙이지 마세요.`;

    const userContent = `[사진의 객관적 묘사]\n${visualDescription}

[4단계 질문과 답변]\n${qaBlock}

위 묘사와 답변을 모두 반영하여 하나의 1인칭 사진 일기 초안(300~500자)으로 통합해 주세요.`;

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
        { status: 500 }
      );
    }

    return NextResponse.json({ diary });
  } catch (error) {
    console.error("[PHOTO_TO_DIARY_ERROR]", error);
    return NextResponse.json(
      { error: "사진 일기 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
