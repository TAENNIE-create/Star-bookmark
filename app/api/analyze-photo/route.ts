import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** Q2~Q4 고정 질문 (14세 수준, 다정·명료) */
const Q2 = "오늘 수많은 순간 중 왜 이 사진을 골라 기록하고 싶었나요?";
const Q3 =
  "혹시 전에도 이 사진과 닮은 분위기를 느꼈던 적이 있나요? 그때는 언제였나요?";
const Q4 =
  "내일은 어떤 분위기의 사진을 찍고 싶나요? 오늘과는 또 다른 느낌일까요?";

type AnalyzePhotoRequest = {
  imageBase64: string;
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
  try {
    const body = (await req.json()) as AnalyzePhotoRequest;
    let imageBase64 = body.imageBase64?.trim();
    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64가 필요합니다." },
        { status: 400, headers }
      );
    }
    if (imageBase64.startsWith("data:")) {
      imageBase64 = imageBase64.split(",")[1] ?? imageBase64;
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "서버 환경변수에 OPENAI_API_KEY를 등록하세요." },
        { status: 500, headers }
      );
    }

    const imageUrl = `data:image/jpeg;base64,${imageBase64}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `당신은 사진 성찰을 돕는 별지기입니다.

1) 사진을 해석 없이 객관적으로 한 문장으로 묘사하세요 (색, 구도, 밝기, 눈에 띄는 사물·인물).

2) 첫 번째 질문(Q1)을 하나만 만들어 주세요. 규칙:
- 사진에 **인물의 얼굴·표정이 또렷이 보일 때만** 표정을 묻고, 이때 반드시 "사진 속 인물의 표정"이라고 표현하세요. (대상이 촬영자인지 타인인지 모르므로 "당신의 표정"이라고 하지 마세요.)
- 인물이 **실루엣·뒷모습·손만 보이거나 표정이 보이지 않을 때**는 표정을 묻지 마세요. 대신 자세, 손짓, 몸의 방향, 눈에 띄는 동작, 빛과 그림자, 혹은 장면 전체의 분위기 중에서 **가장 의미 있어 보이는 것 하나**를 골라 질문하세요. (예: "사진 속 인물의 자세를 보면 어떤 이야기가 떠오르나요?", "이 손짓이 당신에게 어떤 느낌을 주나요?", "이 장면을 보고 있으면 몸과 마음에 어떤 느낌이 전해지나요?")
- **사람이 전혀 없고 풍경·사물만** 있을 때는 "이 장면을 보고 있으면 몸과 마음에 어떤 느낌이 전해지나요?"처럼 감각·느낌을 묻는 질문을 하세요.
- 질문은 14세가 이해할 수 있도록 다정하고 명료하게, 한 문장으로 끝내세요.

출력은 반드시 다음 JSON 형식만 사용하세요 (다른 말 없이):
{
  "visualDescription": "한 문장 객관적 묘사",
  "firstQuestion": "위 규칙에 맞는 Q1 질문 한 문장"
}`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 280,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    let visualDescription = "";
    let firstQuestion =
      "이 장면을 보고 있으면 몸과 마음에 어떤 느낌이 전해지나요?";
    if (content) {
      try {
        const parsed = JSON.parse(
          content.replace(/```json/gi, "").replace(/```/g, "").trim()
        ) as { visualDescription?: string; firstQuestion?: string };
        visualDescription = parsed.visualDescription ?? "";
        if (typeof parsed.firstQuestion === "string" && parsed.firstQuestion.trim()) {
          firstQuestion = parsed.firstQuestion.trim();
        }
      } catch {
        visualDescription = content.slice(0, 120);
      }
    }

    const questions: [string, string, string, string] = [
      firstQuestion,
      Q2,
      Q3,
      Q4,
    ];

    return NextResponse.json(
      { visualDescription, questions },
      { headers }
    );
  } catch (error) {
    console.log("Analyze Photo Error:", error);
    return NextResponse.json(
      { error: "사진 분석 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
