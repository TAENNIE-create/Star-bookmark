"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { MoodScores } from "../../lib/arisum-types";
import { MIDNIGHT_BLUE } from "../../lib/theme";
import { getAppStorage } from "../../lib/app-storage";
import { LoadingOverlay } from "./loading-overlay";

type AnalysisPayload = {
  keywords: [string, string, string];
  counselorLetter: string;
  metrics: MoodScores;
};

type BreathingButtonProps = {
  onAnalysisComplete?: (data: AnalysisPayload) => void;
};

export function BreathingButton({ onAnalysisComplete }: BreathingButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [journal, setJournal] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleButtonClick = () => {
    // 오늘 날짜를 YYYY-MM-DD 형식으로 변환
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    router.push(`/diary/${dateKey}`);
  };

  const saveJournalToLocalStorage = (text: string) => {
    if (typeof window === "undefined") return;

    const trimmed = text.trim();
    if (!trimmed) return;

    const today = new Date();
    const dateKey = today.toISOString().slice(0, 10); // YYYY-MM-DD

    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed = raw ? JSON.parse(raw) : {};

      const listForDate: { content: string; createdAt: string }[] =
        parsed[dateKey] ?? [];

      listForDate.push({
        content: trimmed,
        createdAt: today.toISOString(),
      });

      const next = {
        ...parsed,
        [dateKey]: listForDate,
      };

      getAppStorage().setItem("arisum-journals", JSON.stringify(next));
      window.dispatchEvent(new Event("journal-updated"));
    } catch {
      // localStorage에 저장 실패해도 앱이 깨지지 않도록 조용히 무시
    }
  };

  const handleAnalyze = async () => {
    if (!journal.trim()) {
      setError("오늘의 생각이나 감정을 짧게라도 적어 주세요.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

     // 분석 성공/실패와 관계없이 일기는 반드시 로컬에 저장
    saveJournalToLocalStorage(journal);

    try {
      const user_identity_summary =
        typeof window !== "undefined"
          ? getAppStorage().getItem("user_identity_summary")
          : null;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journal,
          user_identity_summary: user_identity_summary || undefined,
        }),
      });

      if (!res.ok) {
        let message = "분석에 실패했어요. 잠시 후 다시 시도해 주세요.";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") {
            if (data.error.includes("API 키")) {
              message = "API 키를 확인해 주세요.";
            } else {
              message = data.error;
            }
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const data = await res.json();
      const metrics: MoodScores = data.metrics ?? data.scores;
      const keywords: [string, string, string] =
        Array.isArray(data.keywords) && data.keywords.length >= 3
          ? [String(data.keywords[0]), String(data.keywords[1]), String(data.keywords[2])]
          : ["오늘", "나", "마음"];
      const counselorLetter = data.counselorLetter ?? "";

      if (typeof window !== "undefined") {
        try {
          if (data.updatedSummary) {
            getAppStorage().setItem("user_identity_summary", data.updatedSummary);
          }
          getAppStorage().setItem(
            "arisum-latest-scores",
            JSON.stringify({ date: new Date().toISOString().slice(0, 10), scores: metrics })
          );
          getAppStorage().setItem(
            "arisum-latest-analysis",
            JSON.stringify({ keywords, counselorLetter })
          );
        } catch {
          // ignore
        }
      }

      if (onAnalysisComplete) {
        onAnalysisComplete({ keywords, counselorLetter, metrics });
      }

      setIsOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "알 수 없는 오류가 발생했어요."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      {isAnalyzing && <LoadingOverlay message="diary-analysis" />}
      <div className="w-full flex flex-col items-center">
        <motion.button
          type="button"
          onClick={handleButtonClick}
          className="relative w-full h-12 rounded-2xl shadow-lg flex items-center justify-center gap-2.5"
          style={{
            background: "#FDE68A",
            color: "#0F172A",
            boxShadow:
              "0 0 20px rgba(253, 230, 138, 0.6), 0 0 40px rgba(253, 230, 138, 0.3), 0 2px 8px rgba(15, 23, 42, 0.1)",
          }}
          animate={{
            boxShadow: [
              "0 0 20px rgba(253, 230, 138, 0.6), 0 0 40px rgba(253, 230, 138, 0.3), 0 2px 8px rgba(15, 23, 42, 0.1)",
              "0 0 28px rgba(253, 230, 138, 0.75), 0 0 52px rgba(253, 230, 138, 0.4), 0 2px 8px rgba(15, 23, 42, 0.1)",
              "0 0 20px rgba(253, 230, 138, 0.6), 0 0 40px rgba(253, 230, 138, 0.3), 0 2px 8px rgba(15, 23, 42, 0.1)",
            ],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="absolute inset-0.5 rounded-[14px] bg-white/20 backdrop-blur-sm" />
          <svg
            className="relative z-10 w-4 h-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span className="relative z-10 text-sm font-semibold">일기 쓰기</span>
        </motion.button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-3xl bg-white shadow-2xl">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#64748B]">오늘의 숨 고르기</p>
                <h2 className="text-base font-semibold tracking-tight mt-0.5" style={{ color: MIDNIGHT_BLUE }}>
                  마음 방을 위한 짧은 일기
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
              >
                <span className="sr-only">닫기</span>
                ✕
              </button>
            </div>

            <div className="px-5 pb-4 space-y-3">
              <textarea
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
                rows={5}
                disabled={isAnalyzing}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F4F7FB] px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/20 focus-visible:border-[#0F172A] resize-none disabled:opacity-60"
                style={{ color: MIDNIGHT_BLUE }}
                placeholder="오늘 어떤 하루였는지, 떠오르는 생각이나 감정을 편하게 적어 보세요."
              />

              {error && (
                <p className="text-xs text-red-600 leading-relaxed">{error}</p>
              )}

              <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-[#64748B]">
              일기 내용은 분석 후 어디에도 저장되지 않아요.
                </p>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-white shadow disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  style={{ backgroundColor: MIDNIGHT_BLUE }}
                >
                  {isAnalyzing && (
                    <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  )}
                  <span>{isAnalyzing ? "분석 중..." : "마음 분석하기"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

