import { NextResponse } from "next/server";

export const dynamic = "force-static";

/** 정적 내보내기용: request를 읽지 않고 고정 리다이렉트만 반환해 정적 생성 가능. 실제 OAuth 콜백은 서버 배포 시에만 동작 */
export async function GET() {
  return NextResponse.redirect(new URL("/", "https://placeholder.invalid"));
}
