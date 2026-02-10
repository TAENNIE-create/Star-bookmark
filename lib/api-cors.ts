/**
 * API 라우트 CORS: 서버(star-bookmark)와 안드로이드 앱(capacitor) 요청 허용
 */

const ALLOWED_ORIGINS = [
  "https://star-bookmark.netlify.app",
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
];

/** 안드로이드 앱(capacitor) 등 모든 오리진 허용용 CORS 헤더 (API 라우트 공통) */
export const CORS_HEADERS_FULL: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + ":"))) return true;
  if (origin.endsWith(".netlify.app")) return true;
  return false;
}

export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers?.get("origin") ?? "";
  const allowOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
