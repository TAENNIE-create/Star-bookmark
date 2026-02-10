import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { getCorsHeaders, CORS_HEADERS_FULL } from "../../../lib/api-cors";

/** OPTIONS: CORS preflight */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS_FULL });
}

/**
 * POST: 현재 로그인한 사용자 계정 삭제 (스토어 필수 규정).
 * Supabase Auth auth.users 삭제 시, FK on delete cascade로 profiles·user_data(일기, 별자리, 별조각, 성격 카운트 등)가 물리적으로 함께 삭제됩니다.
 * 쿠키 세션 또는 Authorization: Bearer 토큰으로 본인 확인 후, service role로 auth.users 삭제.
 * (Capacitor 앱에서는 쿠키가 API 도메인으로 안 가므로 Bearer 토큰 사용)
 */
export async function POST(req: Request) {
  const headers = { ...getCorsHeaders(req), ...CORS_HEADERS_FULL };
  try {
    let userId: string | null = null;

    const supabase = await createServerClient();
    const {
      data: { user: cookieUser },
      error: sessionError,
    } = await supabase.auth.getUser();
    if (!sessionError && cookieUser?.id) {
      userId = cookieUser.id;
    }

    if (!userId) {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;
      if (token) {
        const { createClient: createSupabase } = await import(
          "@supabase/supabase-js"
        );
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && anonKey) {
          const anon = createSupabase(url, anonKey);
          const { data: { user: tokenUser }, error: tokenError } =
            await anon.auth.getUser(token);
          if (!tokenError && tokenUser?.id) userId = tokenUser.id;
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401, headers }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      console.error("[delete-account] SUPABASE_SERVICE_ROLE_KEY not set");
      return NextResponse.json(
        { error: "서버 설정 오류입니다." },
        { status: 500, headers }
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("[delete-account]", deleteError);
      return NextResponse.json(
        { error: "계정 삭제에 실패했습니다." },
        { status: 500, headers }
      );
    }

    return new NextResponse(null, { status: 204, headers });
  } catch (e) {
    console.log("Delete Account Error:", e);
    return NextResponse.json(
      { error: "계정 삭제 중 오류가 발생했습니다." },
      { status: 500, headers }
    );
  }
}
