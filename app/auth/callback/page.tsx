"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LOADING_MESSAGE = "별지기가 당신의 우주를 연결하는 중입니다...";

/**
 * 웹 OAuth 콜백 페이지.
 * output: "export" 환경이므로 서버 없이 클라이언트에서만 동작합니다.
 * - URL 파싱·Supabase·리다이렉트는 모두 useEffect 내부에서만 실행해 프리렌더 시 오류를 방지합니다.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState(LOADING_MESSAGE);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") || "/";
    const errorDesc = params.get("error_description");
    const error = params.get("error");

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
      setMessage(LOADING_MESSAGE);
      try {
        const { createClient } = await import("../../../lib/supabase/client");
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
  }, [router]);

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
