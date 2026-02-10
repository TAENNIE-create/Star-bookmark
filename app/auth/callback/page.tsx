"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

/**
 * 웹 OAuth 콜백: 정적 빌드 환경에서 쿼리의 code를 exchangeCodeForSession으로 세션 생성 후 next로 이동.
 * (output: "export"에서는 route.ts가 요청 시 실행되지 않으므로 이 클라이언트 페이지에서 처리)
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("로그인 처리 중…");

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/";
    const errorDesc = searchParams.get("error_description");
    const error = searchParams.get("error");

    if (error || errorDesc) {
      setStatus("error");
      setMessage(decodeURIComponent(errorDesc || error || "로그인에 실패했습니다."));
      return;
    }

    if (!code) {
      setStatus("ok");
      setMessage("로그인 정보가 없습니다. 이동합니다.");
      setTimeout(() => router.replace(next), 800);
      return;
    }

    const run = async () => {
      try {
        const supabase = createClient();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStatus("error");
          setMessage(exchangeError.message || "세션 설정에 실패했습니다.");
          return;
        }
        setStatus("ok");
        setMessage("로그인되었습니다. 이동합니다.");
        setTimeout(() => router.replace(next), 500);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "로그인 처리 중 오류가 발생했습니다.");
      }
    };

    run();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#f0f4f8]">
      <p
        className={`text-sm ${status === "error" ? "text-red-600" : "text-slate-700"}`}
      >
        {message}
      </p>
      {status === "error" && (
        <button
          type="button"
          onClick={() => router.replace("/settings")}
          className="mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-white"
        >
          설정으로
        </button>
      )}
    </div>
  );
}
