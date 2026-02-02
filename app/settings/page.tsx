"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import { MIDNIGHT_BLUE, MUTED, BORDER_LIGHT } from "../../lib/theme";
import { getAppStorage } from "../../lib/app-storage";
import { createClient } from "../../lib/supabase/client";

const ONBOARDING_KEY = "arisum-onboarding";

type Stored = { userName: string; aiTone?: string; completedAt?: string };

export default function SettingsPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [saved, setSaved] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const unsub = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => unsub.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = getAppStorage().getItem(ONBOARDING_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Stored;
      setNickname(typeof data.userName === "string" ? data.userName : "");
    } catch {
      // ignore
    }
  }, []);

  const handleSave = () => {
    if (typeof window === "undefined") return;
    try {
      const storage = getAppStorage();
      const raw = storage.getItem(ONBOARDING_KEY);
      const prev: Stored = raw ? JSON.parse(raw) : { userName: "" };
      const next: Stored = {
        ...prev,
        userName: nickname.trim() || prev.userName,
      };
      storage.setItem(ONBOARDING_KEY, JSON.stringify(next));
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      // ignore
    }
  };

  const handleSignIn = async (provider: "google" | "kakao") => {
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/")}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      console.error("[OAuth] signInWithOAuth failed", {
        provider,
        message: error.message,
        name: error.name,
        status: error.status,
        redirectTo,
        fullError: error,
      });
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    } else {
      console.error("[OAuth] No redirect URL returned", { provider, data, redirectTo });
    }
  };

  return (
    <div className="min-h-screen flex justify-center bg-transparent">
      <div className="w-full max-w-md min-h-screen flex flex-col bg-transparent">
        <div className="h-10 flex-shrink-0" aria-hidden />

        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-4 pb-4"
        >
          <h1 className="text-xl font-bold" style={{ color: MIDNIGHT_BLUE }}>
            설정
          </h1>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
            style={{ backgroundColor: "rgba(15,23,42,0.08)", color: MIDNIGHT_BLUE }}
            aria-label="홈으로"
          >
            ←
          </button>
        </motion.header>

        <main className="flex-1 px-4 pb-24 space-y-6">
          {/* 계정 연동하기 섹션 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl p-5"
            style={{ backgroundColor: "rgba(241,245,249,0.9)" }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: MIDNIGHT_BLUE }}>
              계정 연동하기
            </h2>
            {user ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-emerald-600">연동 완료</p>
                <p className="text-sm" style={{ color: MUTED }}>
                  {user.email ?? "로그인된 계정"}
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: MUTED }}>
                  계정을 연동하고 소중한 별의 기록을 안전하게 보관하세요.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => handleSignIn("google")}
                    className="w-full py-3 px-4 rounded-xl text-sm font-medium border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] transition-colors"
                    style={{ color: MIDNIGHT_BLUE }}
                  >
                    Google로 로그인
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSignIn("kakao")}
                    className="w-full py-3 px-4 rounded-xl text-sm font-medium bg-[#FEE500] hover:bg-[#FDD835] transition-colors text-[#191919]"
                  >
                    카카오로 로그인
                  </button>
                </div>
              </>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: "rgba(241,245,249,0.9)" }}
          >
            <label className="block text-sm font-medium" style={{ color: MUTED }}>
              닉네임
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="부르고 싶은 이름"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/20"
              style={{
                border: `1px solid ${BORDER_LIGHT}`,
                backgroundColor: "#fff",
                color: MIDNIGHT_BLUE,
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-xl py-3 text-sm font-medium text-white transition-colors"
              style={{
                backgroundColor: saved ? "#22c55e" : MIDNIGHT_BLUE,
              }}
            >
              {saved ? "저장됨" : "저장하기"}
            </button>
          </motion.div>
        </main>

        <TabBar
          activeKey="home"
          onChange={(key: TabKey) => {
            if (key === "home") router.push("/");
            if (key === "journal") router.push("/diary");
            if (key === "bookshelf") router.push("/archive");
            if (key === "constellation") router.push("/constellation");
          }}
        />
      </div>
    </div>
  );
}
