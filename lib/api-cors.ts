/**
 * API 라우트 CORS: Capacitor/로컬 개발에서 오는 요청 허용
 */

const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
];

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
