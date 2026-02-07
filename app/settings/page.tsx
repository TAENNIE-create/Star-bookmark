"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import { MIDNIGHT_BLUE, MUTED, BORDER_LIGHT, SKY_WHITE } from "../../lib/theme";
import { getAppStorage } from "../../lib/app-storage";
import { createClient } from "../../lib/supabase/client";

const ONBOARDING_KEY = "arisum-onboarding";
const REMINDER_TIME_KEY = "arisum-reminder-time";

type Stored = { userName: string; completedAt?: string; hasVisited?: boolean };

/** 앱에서 사용하는 localStorage 키 패턴 전부 제거 후 온보딩으로 */
function clearAllLocalDataAndRedirect(router: ReturnType<typeof useRouter>) {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k) keys.push(k);
  }
  keys.forEach((k) => window.localStorage.removeItem(k));
  router.replace("/onboarding");
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: `${String(i).padStart(2, "0")}:00`,
  label: `${i === 0 ? "자정" : i === 12 ? "정오" : i < 12 ? `오전 ${i}시` : `오후 ${i - 12}시`} (${String(i).padStart(2, "0")}:00)`,
}));

export default function SettingsPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [saved, setSaved] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [reminderTime, setReminderTime] = useState("22:00");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

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
      if (raw) {
        const data = JSON.parse(raw) as Stored;
        setNickname(typeof data.userName === "string" ? data.userName : "");
      }
      const t = getAppStorage().getItem(REMINDER_TIME_KEY);
      if (t && /^\d{2}:\d{2}$/.test(t)) setReminderTime(t);
    } catch {
      // ignore
    }
  }, []);

  const handleSaveNickname = () => {
    if (typeof window === "undefined") return;
    try {
      const storage = getAppStorage();
      const raw = storage.getItem(ONBOARDING_KEY);
      const prev: Stored = raw ? JSON.parse(raw) : { userName: "" };
      storage.setItem(
        ONBOARDING_KEY,
        JSON.stringify({ ...prev, userName: nickname.trim() || prev.userName })
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      // ignore
    }
  };

  const handleSignIn = async (provider: "google" | "kakao") => {
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/settings")}`;
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) {
      console.error("[OAuth]", error);
      return;
    }
    if (data?.url) window.location.href = data.url;
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  const handleResetAll = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    clearAllLocalDataAndRedirect(router);
  };

  const handleWithdraw = () => {
    if (!confirmWithdraw) {
      setConfirmWithdraw(true);
      return;
    }
    setConfirmWithdraw(false);
    if (typeof window === "undefined") return;
    clearAllLocalDataAndRedirect(router);
    createClient().auth.signOut();
  };

  const Card = ({
    children,
    className = "",
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-5 ${className}`}
      style={{ backgroundColor: "#FFFFFF", border: `1px solid ${BORDER_LIGHT}` }}
    >
      {children}
    </motion.div>
  );

  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: SKY_WHITE }}>
      <div className="w-full max-w-md min-h-screen flex flex-col">
        <div className="h-10 flex-shrink-0" aria-hidden />
        <header className="flex items-center justify-between px-4 pb-4">
          <h1
            className="text-xl font-bold"
            style={{ fontFamily: "var(--font-a2z-m), sans-serif", color: MIDNIGHT_BLUE }}
          >
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
        </header>

        <main className="flex-1 px-4 pb-24 space-y-6">
          {/* 1. 계정 (Account) */}
          <Card>
            <h2
              className="text-sm font-semibold mb-3"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif", color: MIDNIGHT_BLUE }}
            >
              계정
            </h2>
            {user ? (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: MUTED }}>
                  연동 정보
                </p>
                <p className="text-sm font-medium" style={{ color: MIDNIGHT_BLUE }}>
                  {user.email ?? "로그인된 계정"}
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border transition-colors"
                  style={{ borderColor: BORDER_LIGHT, color: MIDNIGHT_BLUE }}
                >
                  로그아웃
                </button>
                <div className="pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    계정 탈퇴
                  </button>
                  <p className="text-[11px] mt-1" style={{ color: MUTED }}>
                    모든 기록을 영구히 지워버립니다.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2 mb-4">
                  <p className="text-sm flex-1" style={{ fontFamily: "var(--font-a2z-r), sans-serif", color: MUTED }}>
                    소중한 별의 기록을 안전하게 지키세요.
                  </p>
                  <span
                    className="shrink-0 px-2 py-1 rounded-lg text-[10px] text-center"
                    style={{ backgroundColor: "rgba(100,116,139,0.2)", color: MUTED }}
                    title="연동하면 기기 바꿔도 기록이 유지돼요"
                  >
                    연동 추천
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleSignIn("google")}
                    className="w-full py-3 px-4 rounded-xl text-sm font-medium border transition-colors"
                    style={{ borderColor: BORDER_LIGHT, backgroundColor: "#fff", color: MIDNIGHT_BLUE }}
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
          </Card>

          {/* 2. 개인 설정 (Personalization) */}
          <Card>
            <h2
              className="text-sm font-semibold mb-4"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif", color: MIDNIGHT_BLUE }}
            >
              개인 설정
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>
                  이름(닉네임) 변경
                </label>
                <p className="text-[11px] mb-2" style={{ color: MUTED }}>
                  별지기가 당신을 부를 이름을 수정합니다.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="부르고 싶은 이름"
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/20"
                    style={{ border: `1px solid ${BORDER_LIGHT}`, backgroundColor: "#fff", color: MIDNIGHT_BLUE }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveNickname}
                    className="rounded-xl py-2.5 px-4 text-sm font-medium text-white shrink-0"
                    style={{ backgroundColor: saved ? "#22c55e" : MIDNIGHT_BLUE }}
                  >
                    {saved ? "저장됨" : "저장"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>
                  알림 설정
                </label>
                <p className="text-[11px] mb-2" style={{ color: MUTED }}>
                  오늘을 기록할 시간입니다. 푸시 알림 시간을 설정하세요.
                </p>
                <select
                  value={reminderTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReminderTime(v);
                    if (typeof window !== "undefined") getAppStorage().setItem(REMINDER_TIME_KEY, v);
                  }}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/20"
                  style={{ border: `1px solid ${BORDER_LIGHT}`, backgroundColor: "#fff", color: MIDNIGHT_BLUE }}
                >
                  {HOUR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* 3. 데이터 (Data) */}
          <Card>
            <h2
              className="text-sm font-semibold mb-4"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif", color: MIDNIGHT_BLUE }}
            >
              데이터
            </h2>
            <div className="space-y-4">
              <div>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border transition-colors"
                  style={{
                    borderColor: confirmReset ? "#dc2626" : BORDER_LIGHT,
                    color: confirmReset ? "#dc2626" : MIDNIGHT_BLUE,
                  }}
                >
                  {confirmReset ? "다시 눌러 초기화 실행" : "모든 기록 초기화"}
                </button>
                <p className="text-[11px] mt-1.5" style={{ color: MUTED }}>
                  지금까지 쌓은 모든 별자리와 일기를 지우고 태초의 상태로 돌아갑니다.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <p className="text-sm font-medium" style={{ color: MIDNIGHT_BLUE }}>
                  기록집 내보내기
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                  준비 중 — 나중에 PDF나 이미지로 저장할 수 있어요.
                </p>
              </div>
            </div>
          </Card>

          {/* 4. 정보 (Information) */}
          <Card>
            <h2
              className="text-sm font-semibold mb-4"
              style={{ fontFamily: "var(--font-a2z-m), sans-serif", color: MIDNIGHT_BLUE }}
            >
              정보
            </h2>
            <div className="space-y-4">
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: SKY_WHITE, border: `1px solid ${BORDER_LIGHT}` }}
              >
                <p className="text-xs font-semibold mb-1.5" style={{ color: MIDNIGHT_BLUE }}>
                  흩어진 조각들이 모여 당신이라는 은하가 됩니다.
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>
                  우리가 무심코 흘려보낸 하루의 생각들은 사실 나를 이루는 소중한 별 조각들입니다. 혼자서는 찾기 어려웠던 내면의 무늬를 별지기가 함께 찾아내어 이어드릴게요. 매일의 기록이 쌓여 밤하늘을 수놓을 때, 당신은 비로소 누구보다 찬란하고 선명한 '진짜 나'를 마주하게 될 거예요.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href="/privacy"
                  className="text-sm py-1"
                  style={{ color: MIDNIGHT_BLUE }}
                >
                  개인정보 처리방침
                </a>
                <a
                  href="/terms"
                  className="text-sm py-1"
                  style={{ color: MIDNIGHT_BLUE }}
                >
                  서비스 이용약관
                </a>
              </div>
              <p className="text-[11px]" style={{ color: MUTED }}>
                버전 정보 · v1.0.0 (MVP)
              </p>
            </div>
          </Card>
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

      {/* 2단계 확인: 모든 기록 초기화 */}
      {confirmReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15,23,42,0.5)" }}
          onClick={() => setConfirmReset(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-6 max-w-sm w-full shadow-xl"
            style={{ backgroundColor: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-2" style={{ color: MIDNIGHT_BLUE }}>
              당신의 기록을 초기화하시겠습니까?
            </p>
            <p className="text-xs mb-4" style={{ color: MUTED }}>
              모든 일기와 기록이 삭제되며, 처음 화면으로 돌아갑니다.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ borderColor: BORDER_LIGHT, color: MIDNIGHT_BLUE }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ backgroundColor: "#dc2626" }}
              >
                초기화
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 2단계 확인: 계정 탈퇴 */}
      {confirmWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15,23,42,0.5)" }}
          onClick={() => setConfirmWithdraw(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-6 max-w-sm w-full shadow-xl"
            style={{ backgroundColor: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-2" style={{ color: MIDNIGHT_BLUE }}>
              탈퇴 시 모든 기록이 영구 삭제됩니다. 계속할까요?
            </p>
            <p className="text-xs mb-4" style={{ color: MUTED }}>
              복구할 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmWithdraw(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ borderColor: BORDER_LIGHT, color: MIDNIGHT_BLUE }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ backgroundColor: "#dc2626" }}
              >
                탈퇴
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
