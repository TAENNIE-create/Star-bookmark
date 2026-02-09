"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "../../lib/supabase/client";

const LOGIN_CALLBACK_SCHEME = "com.starbookmark.app://login-callback";

function parseHashParams(hash: string): { access_token?: string; refresh_token?: string } {
  const params: Record<string, string> = {};
  if (!hash || !hash.startsWith("#")) return params;
  const q = hash.slice(1);
  for (const part of q.split("&")) {
    const [key, value] = part.split("=");
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return params;
}

/** 앱이 com.starbookmark.app://login-callback#... 로 열렸을 때 세션 복구 */
export function AuthDeepLinkHandler() {
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    if (platform !== "android" && platform !== "ios") return;

    const handler = async (event: { url: string }) => {
      const url = event?.url;
      if (!url || !url.startsWith(LOGIN_CALLBACK_SCHEME)) return;
      const hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
      const { access_token, refresh_token } = parseHashParams(hash);
      if (!access_token || !refresh_token) return;
      try {
        const supabase = createClient();
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch (e) {
        console.error("[AuthDeepLink] setSession failed:", e);
      }
    };

    let listener: { remove: () => Promise<void> } | null = null;
    (async () => {
      const App = (await import("@capacitor/app")).App;
      listener = await App.addListener("appUrlOpen", handler);
    })();
    return () => {
      listener?.remove?.();
    };
  }, []);

  return null;
}
