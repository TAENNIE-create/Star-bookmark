"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MIDNIGHT_BLUE, MUTED, LU_ICON } from "../../lib/theme";
import {
  getUserName,
  getRecentRecordStatus,
  getAiGreeting,
  type RecentRecordStatus,
} from "../../lib/home-greeting";
import { LU_BALANCE_UPDATED_EVENT, getLuBalance } from "../../lib/lu-balance";
import { createClient } from "../../lib/supabase/client";

const CORAL_GLOW = "rgba(255, 107, 107, 0.5)";

export function HomeHeader() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [greeting, setGreeting] = useState("");
  const [status, setStatus] = useState<RecentRecordStatus>("none");
  const [lu, setLu] = useState(0);
  const [isGuest, setIsGuest] = useState(true);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);

  useEffect(() => {
    const n = getUserName();
    const s = getRecentRecordStatus();
    setNickname(n);
    setStatus(s);
    setGreeting(getAiGreeting(n, s));
    setLu(getLuBalance());
  }, []);

  useEffect(() => {
    const onUpdate = () => setLu(getLuBalance());
    window.addEventListener(LU_BALANCE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(LU_BALANCE_UPDATED_EVENT, onUpdate);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setIsGuest(!data?.user));
    const unsub = supabase.auth.onAuthStateChange((_e, session) => setIsGuest(!session?.user));
    return () => unsub.data.subscription.unsubscribe();
  }, []);

  const dismissTooltip = () => setTooltipDismissed(true);

  const isLoggedIn = !isGuest;
  const showFloatingTooltip = !isLoggedIn && !tooltipDismissed;

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex-shrink-0 px-4 pb-2"
    >
      <div
        className="w-full flex items-center justify-between gap-3 rounded-2xl px-5 py-4"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%)",
          boxShadow: "0 4px 20px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div className="min-w-0 flex-1">
          {nickname ? (
            <p
              className="text-xl font-bold truncate"
              style={{ color: MIDNIGHT_BLUE }}
            >
              {nickname}님
            </p>
          ) : (
            <p className="text-base font-bold opacity-70" style={{ color: MUTED }}>
              닉네임을 설정해 주세요
            </p>
          )}
          <p
            className="text-sm font-a2z-regular mt-1 line-clamp-2"
            style={{ color: MUTED }}
          >
            {greeting}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 active:translate-y-0.5 active:shadow-sm"
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.08)",
              color: MIDNIGHT_BLUE,
              boxShadow:
                "0 2px 0 rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.6)",
            }}
          >
            <span className="text-amber-600 text-sm" aria-hidden>{LU_ICON}</span>
            <span className="text-sm font-bold tabular-nums">{lu}</span>
          </div>
          <div className="relative flex flex-col items-end">
            <motion.div
              className="rounded-2xl flex items-center justify-center ring-2 ring-[#FF6B6B]/80 animate-pulse"
              animate={{
                boxShadow: [
                  `0 0 12px ${CORAL_GLOW}, 0 0 24px rgba(255,107,107,0.25)`,
                  `0 0 20px ${CORAL_GLOW}, 0 0 40px rgba(255,107,107,0.4)`,
                  `0 0 12px ${CORAL_GLOW}, 0 0 24px rgba(255,107,107,0.25)`,
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 hover:opacity-90 active:translate-y-0.5 active:shadow-sm focus-visible:ring-2 focus-visible:ring-[#0F172A]/20 focus-visible:ring-offset-2"
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.08)",
                  color: MIDNIGHT_BLUE,
                  boxShadow:
                    "0 2px 0 rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)",
                  border: "1px solid rgba(255,255,255,0.6)",
                }}
                aria-label="프로필·설정"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </motion.div>

            {/* 부유형 말풍선: 로그인 전에만 렌더, position absolute로 레이아웃 여백 없음 */}
            <AnimatePresence>
              {showFloatingTooltip && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.25 }}
                  className="absolute top-full right-0 mt-2 z-50 pointer-events-auto"
                  style={{ position: "absolute" }}
                >
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    className="rounded-2xl border border-slate-200 bg-[#F1F5F9] px-4 py-2.5 shadow-xl min-w-[280px] flex items-center gap-2 whitespace-nowrap"
                    style={{
                      color: "#0F172A",
                      boxShadow: "0 20px 25px -5px rgba(15,23,42,0.1), 0 8px 10px -6px rgba(15,23,42,0.1)",
                    }}
                  >
                    <p className="text-sm font-a2z-regular flex-1 min-w-0 truncate" style={{ color: "#0F172A" }}>
                      계정 연동을 하면 안전하게 데이터를 지킬 수 있어요! ✨
                    </p>
                    <button
                      type="button"
                      onClick={dismissTooltip}
                      className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors text-xs font-medium"
                      aria-label="닫기"
                    >
                      ×
                    </button>
                    {/* 꼬리: 오른쪽(아이콘 방향)을 향하는 삼각형 */}
                    <div
                      className="absolute -right-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-[#F1F5F9]"
                      style={{ filter: "drop-shadow(1px 0 1px rgba(15,23,42,0.08))" }}
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
