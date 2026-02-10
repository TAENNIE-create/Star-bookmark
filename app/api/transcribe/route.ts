import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "음성 파일(file)이 필요합니다." },
        { status: 400, headers }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "서버 환경변수에 OPENAI_API_KEY를 등록하세요." },
        { status: 500, headers }
      );
    }

    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ko",
    });

    const text = transcription.text?.trim() ?? "";
    return NextResponse.json({ text }, { headers });
  } catch (error) {
    console.log("Transcribe Error:", error);
    return NextResponse.json(
      { error: "음성 변환 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
