import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type DialogueTurn = { role: "user" | "assistant"; text: string };

type VoiceToDiaryRequest = {
  dialogueTurns: DialogueTurn[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VoiceToDiaryRequest;
    const turns = body.dialogueTurns ?? [];

    const userTexts = turns.filter((t) => t.role === "user").map((t) => t.text.trim()).filter(Boolean);
    if (userTexts.length === 0) {
      return NextResponse.json(
        { error: "사용자 발화가 없습니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500 }
      );
    }

    const dialogueBlock = turns
      .map((t) => (t.role === "user" ? `[사용자] ${t.text}` : `[별지기] ${t.text}`))
      .join("\n");

    const systemPrompt = `당신은 사용자의 음성 대화를 '잘 쓰여진 한 편의 수필' 같은 1인칭 일기로 정돈하는 글쓰기 도우미입니다.

규칙:
1. "어...", "음...", "그러니까...", "뭐랄까" 등 군더더기와 반복어는 모두 제거하세요.
2. 말투와 감정은 그대로 살리되, 문장 구조만 정교하게 다듬어 문어체 일기로 만드세요.
3. 300~500자 분량의 1인칭 서술형 일기 본문만 출력하세요. 제목·설명 문장은 붙이지 마세요.
4. 별지기의 질문은 일기 문장에 넣지 말고, 사용자가 말한 내용만 일기로 엮으세요.`;

    const userContent = `[별지기와의 음성 대화]\n${dialogueBlock}\n\n위 대화에서 사용자가 말한 내용만 추려, 군더더기를 제거하고 정갈한 1인칭 일기(300~500자)로 다시 써 주세요.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.5,
      max_tokens: 800,
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
    console.error("[VOICE_TO_DIARY_ERROR]", error);
    return NextResponse.json(
      { error: "일기 정돈 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
