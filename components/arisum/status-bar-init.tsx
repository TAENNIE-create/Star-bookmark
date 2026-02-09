"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const SKY_WHITE = "#F4F7FB";

/** Android/iOS 네이티브 앱에서 상태바 배경·글자색을 앱 테마에 맞춤 */
export function StatusBarInit() {
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    if (platform !== "android" && platform !== "ios") return;

    (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setBackgroundColor({ color: SKY_WHITE });
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        // 플러그인 미동작 시 무시
      }
    })();
  }, []);

  return null;
}
