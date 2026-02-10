"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

/**
 * Android 물리 뒤로가기 버튼: 앱이 꺼지지 않고 이전 화면으로 이동.
 * Capacitor App plugin backButton 리스너 등록.
 */
export function BackButtonHandler() {
  const router = useRouter();

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;

    let listener: { remove: () => Promise<void> } | null = null;

    (async () => {
      const { App } = await import("@capacitor/app");
      listener = await App.addListener("backButton", () => {
        router.back();
      });
    })();

    return () => {
      listener?.remove?.();
    };
  }, [router]);

  return null;
}
