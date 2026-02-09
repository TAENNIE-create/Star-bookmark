/**
 * 앱 내 API 호출 주소 정규화.
 * APK/폰에서는 localhost에 API가 없으므로 NEXT_PUBLIC_API_BASE_URL(배포 서버)을 사용.
 */

const BASE =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")
    : "";

/** 배포된 API 서버 베이스 URL (없으면 상대 경로로 같은 호스트 사용) */
export function getApiBaseUrl(): string {
  return BASE;
}

/** API 경로를 절대 URL로 반환. BASE가 없으면 path 그대로(상대 경로) */
export function getApiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return BASE ? `${BASE}${path}` : path;
}
