/**
 * 앱 내 API 호출 주소 정규화.
 * 기본 서버: https://star-bookmark.netlify.app (localhost 호출 없음).
 */

const DEFAULT_BASE = "https://star-bookmark.netlify.app";
const BASE =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "")
    : DEFAULT_BASE.replace(/\/$/, "");

/** 배포된 API 서버 베이스 URL */
export function getApiBaseUrl(): string {
  return BASE;
}

function logApiCall(url: string): void {
  if (typeof window !== "undefined") {
    console.log("Calling API:", url);
  }
}

/** API 경로를 절대 URL로 반환. 항상 star-bookmark 서버 기준 */
export function getApiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  const url = `${BASE}${path}`;
  logApiCall(url);
  return url;
}

/** 분석 API 전용 절대 URL */
export function getAnalyzeApiUrl(): string {
  const url = `${BASE}/api/analyze`;
  logApiCall(url);
  return url;
}
