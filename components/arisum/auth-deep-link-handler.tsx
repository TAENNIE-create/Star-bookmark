"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { createClient } from "../../lib/supabase/client";

const LOGIN_CALLBACK_SCHEME = "com.starbookmark.app://login-callback";

/** URL에서 # 또는 ? 뒤의 access_token, refresh_token 추출 (Supabase OAuth는 보통 # fragment 사용) */
function parseTokensFromUrl(url: string): { access_token?: string; refresh_token?: string } {
  const params: Record<string, string> = {};
  const hashIdx = url.indexOf("#");
  const queryIdx = url.indexOf("?");
  let segment = "";
  if (hashIdx !== -1) segment = url.slice(hashIdx + 1);
  else if (queryIdx !== -1) segment = url.slice(queryIdx + 1);
  if (!segment) return params;
  for (const part of segment.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq).replace(/\+/g, " "));
    const value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    if (key && value) params[key] = value;
  }
  return params;
}

function isLoginCallbackUrl(url: string): boolean {
  return Boolean(url && url.startsWith(LOGIN_CALLBACK_SCHEME));
}

/** 딥링크 URL 처리: 토큰 파싱 → setSession → 브라우저 닫기 → 설정 화면으로 */
async function handleLoginCallbackUrl(url: string, router: ReturnType<typeof useRouter>) {
  if (!isLoginCallbackUrl(url)) return false;
  const { access_token, refresh_token } = parseTokensFromUrl(url);
  if (!access_token || !refresh_token) return false;
  try {
    const supabase = createClient();
    await supabase.auth.setSession({ access_token, refresh_token });
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    } catch {
      // Browser가 열려 있지 않으면 무시
    }
    router.replace("/settings");
    return true;
  } catch (e) {
    console.error("[AuthDeepLink] setSession failed:", e);
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
      const processUrl = (url: string) => handleLoginCallbackUrl(url, router);

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
