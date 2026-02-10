"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { createClient } from "../../lib/supabase/client";

const LOGIN_CALLBACK_SCHEME = "com.starbookmark.app://login-callback";

/** URL에서 #(해시) 또는 ?(쿼리) 뒤의 access_token, refresh_token 추출. 둘 다 있어도 모두 파싱해 병합 */
function parseTokensFromUrl(url: string): { access_token?: string; refresh_token?: string; reason?: string } {
  const params: Record<string, string> = {};
  const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " "));

  function parseSegment(segment: string) {
    if (!segment.trim()) return;
    for (const part of segment.split("&")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = decode(part.slice(0, eq)).trim();
      const value = decode(part.slice(eq + 1)).trim();
      if (key) params[key] = value;
    }
  }

  const hashIdx = url.indexOf("#");
  const queryIdx = url.indexOf("?");
  if (hashIdx !== -1) parseSegment(url.slice(hashIdx + 1));
  if (queryIdx !== -1) {
    const queryPart = hashIdx !== -1 && hashIdx > queryIdx
      ? url.slice(queryIdx + 1, hashIdx)
      : url.slice(queryIdx + 1);
    parseSegment(queryPart);
  }
  const access_token = params["access_token"];
  const refresh_token = params["refresh_token"];
  let reason: string | undefined;
  if (!access_token && !refresh_token) reason = "URL에 access_token/refresh_token이 없음 (해시# 또는 쿼리? 뒤 확인)";
  else if (!access_token) reason = "access_token 없음";
  else if (!refresh_token) reason = "refresh_token 없음";
  return { access_token, refresh_token, reason };
}

function isLoginCallbackUrl(url: string): boolean {
  return Boolean(url && (url.startsWith(LOGIN_CALLBACK_SCHEME) || url.startsWith("com.starbookmark.app://")));
}

/** 딥링크 URL 처리: 토큰 파싱 → setSession → 강제 /settings 이동 및 전체 새로고침 */
async function handleLoginCallbackUrl(url: string, router: ReturnType<typeof useRouter>): Promise<boolean> {
  if (!isLoginCallbackUrl(url)) return false;

  const parsed = parseTokensFromUrl(url);
  const { access_token, refresh_token, reason } = parsed;
  if (!access_token || !refresh_token) {
    if (typeof window !== "undefined") {
      window.alert("[딥링크] 토큰 파싱 실패: " + (reason || "알 수 없음"));
    }
    return false;
  }

  try {
    const supabase = createClient();
    await supabase.auth.setSession({ access_token, refresh_token });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn("[AuthDeepLink] setSession 후 getSession이 비어 있음");
    }
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    } catch {
      // Browser가 열려 있지 않으면 무시
    }
    if (typeof window !== "undefined") {
      window.location.href = "/settings";
    } else {
      router.replace("/settings");
    }
    return true;
  } catch (e) {
    console.error("[AuthDeepLink] setSession failed:", e);
    if (typeof window !== "undefined") {
      window.alert("[딥링크] setSession 실패: " + (e instanceof Error ? e.message : String(e)));
    }
    return false;
  }
}

/** 앱이 com.starbookmark.app://login-callback 으로 열릴 때 세션 주입 및 설정으로 이동 */
export function AuthDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    if (platform !== "android" && platform !== "ios") return;

    let listener: { remove: () => Promise<void> } | null = null;

    const run = async () => {
      const App = (await import("@capacitor/app")).App;
      const processUrl = async (url: string) => {
        if (!url) return;
        if (typeof window !== "undefined") {
          window.alert("[딥링크] 수신 URL:\n" + url);
        }
        await handleLoginCallbackUrl(url, router);
      };

      const launch = await App.getLaunchUrl();
      if (launch?.url) await processUrl(launch.url);

      listener = await App.addListener("appUrlOpen", (event: { url: string }) => {
        processUrl(event?.url ?? "");
      });
    };

    run();
    return () => {
      listener?.remove?.();
    };
  }, [router]);

  return null;
}
