"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Capacitor } from "@capacitor/core";

/** 네이티브 앱에서만 표시. assets/splash.png → public/splash.png 기반. Android 12+ OS 스플래시(아이콘+단색) 대신 전체 이미지 노출 */
export function CustomSplashOverlay() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const platform = Capacitor.getPlatform();
    if (platform !== "android" && platform !== "ios") return;

    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0A0E1A]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <img
            src="/splash.png"
            alt=""
            className="max-w-full max-h-full w-auto h-auto object-contain"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
