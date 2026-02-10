import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Message = { role: "user" | "assistant"; content: string };

type VoiceDialogueRequest = {
  /** 1=오늘의 시작, 2~3=심화, 4=마무리. turnIndex 1일 때 messages는 빈 배열 가능 */
  turnIndex: 1 | 2 | 3 | 4;
  messages: Message[];
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
  try {
    const body = (await req.json()) as VoiceDialogueRequest;
    const { turnIndex, messages } = body;

    if (turnIndex == null || turnIndex < 1 || turnIndex > 4) {
      return NextResponse.json(
        { error: "turnIndex는 1~4 사이여야 합니다." },
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "서버 환경변수에 OPENAI_API_KEY를 등록하세요." },
        { status: 500, headers }
      );
    }

    const turnGuides: Record<number, string> = {
      1: "당신은 다정한 일기 상담사 '별지기'입니다. **1턴**: 오늘 하루를 여는 질문을 한 문장으로만 출력하세요. 예: '오늘 하루는 어땠나요? 기억에 남는 게 있다면 편하게 말씀해주세요.' 친근하고 부담 없이.",
      2: "당신은 다정한 일기 상담사 '별지기'입니다. 사용자의 답변을 듣고 **2턴**으로, 대답 속에서 발견한 감정이나 구체적 상황을 파고드는 심화 질문을 한 문장으로만 출력하세요. 예: '그때 기분은 어떠셨나요?', '그 사람의 그 말이 당신에겐 어떻게 들렸나요?'",
      3: "당신은 다정한 일기 상담사 '별지기'입니다. 지금까지 대화를 바탕으로 **3턴** 심화 질문을 한 문장으로만 출력하세요. 감정이나 상황을 더 깊이 이끌어내는 질문.",
      4: "당신은 다정한 일기 상담사 '별지기'입니다. 지금까지 대화를 바탕으로 **4턴** 마무리 질문을 한 문장으로만 출력하세요. 오늘을 정리하며 내일을 기대하는 따뜻한 한 마디. 예: '오늘 하루를 한 줄로 정리한다면?', '내일의 나에게 한 마디 건넨다면?'",
    };

    const systemPrompt = turnGuides[turnIndex];
    const userContent =
      messages.length === 0
        ? "첫 질문 한 문장만 출력해 주세요."
        : `[지금까지 대화]\n${messages.map((m) => `${m.role === "user" ? "사용자" : "별지기"}: ${m.content}`).join("\n")}\n\n위 대화에 이어질 ${turnIndex}번째 질문 한 문장만 출력하세요.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 120,
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "별지기 답변을 생성할 수 없습니다." },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ reply }, { headers });
  } catch (error) {
    console.error("[VOICE_DIALOGUE_ERROR]", error);
    return NextResponse.json(
      { error: "별지기 답변 생성 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
