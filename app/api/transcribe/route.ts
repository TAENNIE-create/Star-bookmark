import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "음성 파일(file)이 필요합니다." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되어 있지 않습니다." },
        { status: 500 }
      );
    }

    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ko",
    });

    const text = transcription.text?.trim() ?? "";
    return NextResponse.json({ text });
  } catch (error) {
    console.error("[TRANSCRIBE_ERROR]", error);
    return NextResponse.json(
      { error: "음성 변환 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
