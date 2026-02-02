"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { TabBar, type TabKey } from "../../../components/arisum/tab-bar";
import { MIDNIGHT_BLUE, MUTED, CARD_BG, PRIMARY_HOVER } from "../../../lib/theme";
import { getLuBalance, subtractLu, addLu } from "../../../lib/lu-balance";
import { LU_QUESTION_DIARY } from "../../../lib/lu-balance";
import { LU_ICON } from "../../../lib/theme";
import { removeStarFromAtlas } from "../../../lib/atlas-storage";
import { getAppStorage } from "../../../lib/app-storage";

type JournalEntry = {
  content: string;
  createdAt: string;
  aiQuestion?: string;
};

type JournalByDate = Record<string, JournalEntry[]>;

type Mode = "view" | "select" | "free" | "question-seed" | "question-preview";

/** 5~7단계 심층 인터뷰 질문 (사건 → 감정 → 감각 → 내면 → 다짐 순) */
const INTERVIEW_QUESTIONS = [
  "오늘 하루에서 가장 기억에 남는 사건이나 순간은 무엇이었나요?",
  "그 순간 당신은 어떤 감정을 느꼈나요?",
  "그때 몸이나 주변에서 느껴졌던 감각(소리, 빛, 촉감 등)이 떠오르나요?",
  "그 일을 돌아보며 지금 당신의 내면에서는 어떤 생각이 스쳐 지나가나요?",
  "내일의 나에게 한 마디 다짐이나 응원을 남긴다면?",
];

const WARM_IVORY = "#FAF8F5";
const TYPING_INTERVAL_MS = 25;
const REPORT_BY_DATE_KEY = "arisum-report-by-date";

function setReportByDate(
  dateKey: string,
  report: { todayFlow: string; gardenerWord: string; growthSeeds: string[]; lastAnalyzedText?: string; keywords?: [string, string, string] }
) {
  if (typeof window === "undefined") return;
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    getAppStorage().setItem(REPORT_BY_DATE_KEY, JSON.stringify({ ...prev, [dateKey]: report }));
    window.dispatchEvent(new Event("report-updated"));
  } catch {
    /* ignore */
  }
}

const SWIPE_THRESHOLD = 72;

function DiaryEntryCard({
  entry,
  onDelete,
}: {
  entry: JournalEntry;
  onDelete: (entry: JournalEntry) => void;
}) {
  const slideX = useMotionValue(0);
  const deleteBgOpacity = useTransform(slideX, [0, -10], [0, 1]);
  const [deleteRevealed, setDeleteRevealed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      const v = info.offset.x;
      if (v < -SWIPE_THRESHOLD) {
        setDeleteRevealed(true);
        animate(slideX, -SWIPE_THRESHOLD, { type: "spring", stiffness: 180, damping: 22 });
      } else {
        setDeleteRevealed(false);
        animate(slideX, 0, { type: "spring", stiffness: 180, damping: 22 });
      }
    },
    [slideX]
  );

  const handleDragStart = useCallback(() => {
    if (deleteRevealed) setDeleteRevealed(false);
  }, [deleteRevealed]);

  const handleTrashClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete(entry);
    setShowConfirm(false);
    animate(slideX, 0, { type: "spring", stiffness: 200, damping: 25 });
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ overflow: "hidden" }}>
      {/* 스와이프 시 카드 뒤에 보이는 빨간 배경 + 휴지통 */}
      <motion.div
        className="absolute right-0 top-0 bottom-0 w-[72px] flex items-center justify-center rounded-r-2xl"
        style={{
          backgroundColor: "#EF4444",
          opacity: deleteBgOpacity,
          zIndex: 0,
        }}
      >
        <button
          type="button"
          onClick={handleTrashClick}
          className="w-full h-full flex items-center justify-center text-white hover:bg-red-600/20 transition-colors"
          aria-label="삭제"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </motion.div>

      <motion.div
        className="relative w-full min-w-full rounded-2xl border shadow-sm p-6 space-y-4 cursor-grab active:cursor-grabbing"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#E2E8F0",
          x: slideX,
          zIndex: 2,
        }}
        drag="x"
        dragConstraints={{ left: -SWIPE_THRESHOLD, right: 0 }}
        dragElastic={0.12}
        dragTransition={{ bounceStiffness: 200, bounceDamping: 25 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
      >
        {entry.aiQuestion && (
          <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: MIDNIGHT_BLUE }}>
            <p className="text-xs font-medium mb-2 opacity-90">오늘의 질문</p>
            <p className="text-sm leading-relaxed">{entry.aiQuestion}</p>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs text-[#64748B]">
            {new Date(entry.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-sm whitespace-pre-wrap break-words leading-loose arisum-diary-content" style={{ color: MIDNIGHT_BLUE }}>
            {entry.content}
          </p>
        </div>
      </motion.div>

      {/* 삭제 확인 팝업 */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            >
              <p className="text-sm text-center mb-4" style={{ color: MIDNIGHT_BLUE }}>
                이 일기를 삭제할까요?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium border border-[#E2E8F0]"
                  style={{ color: MIDNIGHT_BLUE }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white"
                  style={{ backgroundColor: "#EF4444" }}
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DiaryWritePage() {
  const router = useRouter();
  const params = useParams();
  const dateParam = params.date as string;

  const [mode, setMode] = useState<Mode>("select");
  const [interviewStep, setInterviewStep] = useState(0);
  const [interviewAnswers, setInterviewAnswers] = useState<string[]>([]);
  const [currentStepAnswer, setCurrentStepAnswer] = useState("");
  const [showLuConfirmModal, setShowLuConfirmModal] = useState(false);
  const [pickedQuestion, setPickedQuestion] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [diaryContent, setDiaryContent] = useState("");
  const [generatedDiaryFull, setGeneratedDiaryFull] = useState("");
  const [displayedDiaryLength, setDisplayedDiaryLength] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingEntry, setExistingEntry] = useState<JournalEntry | null>(null);
  const [entriesList, setEntriesList] = useState<JournalEntry[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadEntriesForDate = useCallback(() => {
    if (typeof window === "undefined" || !dateParam) return;
    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      const entries = (parsed[dateParam] ?? []).slice();
      entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setEntriesList(entries);
      if (entries.length > 0) {
        setMode("view");
      } else {
        setMode("select");
      }
    } catch {
      setMode("select");
    }
  }, [dateParam]);

  useEffect(() => {
    loadEntriesForDate();
  }, [loadEntriesForDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("journal-updated", loadEntriesForDate);
    return () => window.removeEventListener("journal-updated", loadEntriesForDate);
  }, [loadEntriesForDate]);

  /** 타이핑 애니메이션: question-preview에서 생성된 일기 한 글자씩 표시 */
  useEffect(() => {
    if (mode !== "question-preview" || !generatedDiaryFull) return;
    if (displayedDiaryLength >= generatedDiaryFull.length) return;
    typingTimerRef.current = setTimeout(() => {
      setDisplayedDiaryLength((prev) => Math.min(prev + 1, generatedDiaryFull.length));
    }, TYPING_INTERVAL_MS);
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [mode, generatedDiaryFull, displayedDiaryLength]);

  /** 오늘 기준 최근 3일(오늘 포함) 날짜 키 배열 */
  const getLastThreeDayKeys = (): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      keys.push(`${y}-${m}-${day}`);
    }
    return keys;
  };

  const getRecentJournals = (): Array<{
    date: string;
    content: string;
    aiQuestion?: string;
  }> => {
    if (typeof window === "undefined") return [];

    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      const dateKeys = getLastThreeDayKeys();

      return dateKeys
        .map((date) => {
          const entries = parsed[date] ?? [];
          if (entries.length === 0) return null;
          const latest = entries[entries.length - 1];
          return {
            date,
            content: latest.content,
            aiQuestion: latest.aiQuestion,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    } catch {
      return [];
    }
  };

  /** 인터뷰 답변 배열로 일기 초안 생성 (10루 차감 후 API 호출) */
  const requestDiaryFromInterview = useCallback(
    async (allAnswers: string[]) => {
      if (allAnswers.length === 0) {
        setError("답변을 하나 이상 입력해주세요.");
        return;
      }
      const lu = getLuBalance();
      if (lu < LU_QUESTION_DIARY) {
        setError(`일기 초안 생성에는 별조각 ${LU_QUESTION_DIARY}개가 필요해요.`);
        return;
      }
      if (!subtractLu(LU_QUESTION_DIARY)) {
        setError("별조각을 차감할 수 없어요.");
        return;
      }
      setShowLuConfirmModal(false);
      setIsGeneratingQuestion(true);
      setError(null);

      try {
        const interviewPayload = INTERVIEW_QUESTIONS.slice(0, allAnswers.length).map((q, i) => ({
          question: q,
          answer: allAnswers[i] ?? "",
        }));
        const res = await fetch("/api/expand-to-diary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewAnswers: interviewPayload }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "일기 확장에 실패했습니다.");
        }

        const data = await res.json();
        const diary = data.diary?.trim();
        if (!diary) throw new Error("일기를 받지 못했어요.");

        setGeneratedDiaryFull(diary);
        setDisplayedDiaryLength(0);
        setAiQuestion("");
        setMode("question-preview");
      } catch (e) {
        addLu(LU_QUESTION_DIARY);
        setError(e instanceof Error ? e.message : "일기 생성 중 오류가 발생했습니다.");
      } finally {
        setIsGeneratingQuestion(false);
      }
    },
    []
  );

  const handleInterviewNext = () => {
    const trimmed = currentStepAnswer.trim();
    if (!trimmed) {
      setError("답변을 입력한 뒤 다음으로 넘어가세요.");
      return;
    }
    setError(null);
    if (interviewStep >= INTERVIEW_QUESTIONS.length - 1) {
      const allAnswers = [...interviewAnswers, trimmed];
      const lu = getLuBalance();
      if (lu < LU_QUESTION_DIARY) {
        setError(`일기 초안 생성에는 별조각 ${LU_QUESTION_DIARY}개가 필요해요.`);
        return;
      }
      setShowLuConfirmModal(true);
      return;
    }
    setInterviewAnswers((prev) => [...prev, trimmed]);
    setCurrentStepAnswer("");
    setInterviewStep((prev) => prev + 1);
  };

  const handleInterviewPrev = () => {
    setError(null);
    if (interviewStep <= 0) return;
    setInterviewStep((prev) => prev - 1);
    setCurrentStepAnswer(interviewAnswers[interviewStep - 1] ?? "");
    setInterviewAnswers((prev) => prev.slice(0, interviewStep - 1));
  };

  /** 질문 답변으로 만든 초안 완성 시 일기만 저장. 분석은 일기 탭에서 별도로 해금 후 실행 */
  const handleConfirmGeneratedDiary = () => {
    if (!generatedDiaryFull.trim() || !dateParam) return;
    if (typeof window === "undefined") return;
    setError(null);
    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      const entries: JournalEntry[] = parsed[dateParam] ?? [];
      entries.push({
        content: generatedDiaryFull.trim(),
        createdAt: new Date().toISOString(),
        aiQuestion: pickedQuestion || undefined,
      });
      parsed[dateParam] = entries;
      getAppStorage().setItem("arisum-journals", JSON.stringify(parsed));
      window.dispatchEvent(new Event("journal-updated"));
      router.push("/diary");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    }
  };

  const handleDeleteEntry = (entry: JournalEntry) => {
    if (typeof window === "undefined" || !dateParam) return;
    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      const entries: JournalEntry[] = (parsed[dateParam] ?? []).filter(
        (e) => e.createdAt !== entry.createdAt
      );
      if (entries.length === 0) {
        delete parsed[dateParam];
        removeStarFromAtlas(`star-${dateParam}`);
      } else {
        parsed[dateParam] = entries;
      }
      getAppStorage().setItem("arisum-journals", JSON.stringify(parsed));
      window.dispatchEvent(new Event("journal-updated"));
      setEntriesList((prev) => {
        const next = prev.filter((e) => e.createdAt !== entry.createdAt);
        if (next.length === 0) setMode("select");
        return next;
      });
      setDiaryContent("");
      setAiQuestion("");
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    }
  };

  const saveDiary = async () => {
    if (!diaryContent.trim()) {
      setError("일기 내용을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (typeof window === "undefined" || !dateParam) return;

      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};

      const entries: JournalEntry[] = parsed[dateParam] ?? [];
      const newEntry: JournalEntry = {
        content: diaryContent.trim(),
        createdAt: new Date().toISOString(),
        ...(aiQuestion && { aiQuestion }),
      };

      // 기존 항목이 있으면 업데이트, 없으면 추가
      if (existingEntry) {
        const index = entries.findIndex(
          (e) => e.createdAt === existingEntry.createdAt
        );
        if (index >= 0) {
          entries[index] = newEntry;
        } else {
          entries.push(newEntry);
        }
      } else {
        entries.push(newEntry);
      }

      parsed[dateParam] = entries;
      getAppStorage().setItem("arisum-journals", JSON.stringify(parsed));
      window.dispatchEvent(new Event("journal-updated"));

      // 저장 후 달력으로 이동
      router.push("/diary");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "일기 저장 중 오류가 발생했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const getCharCountFeedback = () => {
    const count = diaryContent.length;
    if (count < 100) {
      return {
        text: "분석을 위해 조금 더 자세히 적어볼까요?",
        color: "text-orange-500",
      };
    } else if (count < 500) {
      return {
        text: "이제 분석이 가능해요!",
        color: "text-[#0F172A]",
      };
    } else {
      return {
        text: "축하해요! 기록이 쌓여 보너스가 지급돼요!",
        color: "text-yellow-600",
        sparkle: true,
      };
    }
  };

  const charFeedback = getCharCountFeedback();

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#F4F7FB] relative flex flex-col">
        {/* Safe area top padding */}
        <div className="h-12" />

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 mb-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
                {dateParam
                  ? (() => {
                      const [year, month, day] = dateParam.split("-");
                      return new Date(
                        parseInt(year),
                        parseInt(month) - 1,
                        parseInt(day)
                      ).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      });
                    })()
                  : "일기 작성"}
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                {entriesList.length > 0
                  ? `기존 일기 ${entriesList.length}편을 확인하거나 새로 작성할 수 있어요`
                  : "오늘의 마음을 기록해보세요"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mode === "view" && (
                <button
                  onClick={() => setMode("select")}
                  className="w-10 h-10 rounded-2xl bg-[#0F172A] flex items-center justify-center text-white hover:bg-[#1E293B] transition-colors shadow-sm"
                  title="새로 작성하기"
                >
                  +
                </button>
              )}
              <button
                onClick={() => router.back()}
                className="w-10 h-10 rounded-2xl bg-[#E2E8F0] flex items-center justify-center text-[#0F172A] hover:bg-[#64748B]/20 transition-colors"
              >
                ←
              </button>
            </div>
          </div>
        </motion.header>

        {/* Main Content */}
        <main className="flex-1 px-6 pb-24 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* View: 해당 날짜의 모든 일기 (오래된 순 → 아래로) */}
            {mode === "view" && entriesList.length > 0 && (
              <motion.div
                key="view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {entriesList.map((entry) => (
                  <DiaryEntryCard
                    key={entry.createdAt}
                    entry={entry}
                    onDelete={handleDeleteEntry}
                  />
                ))}
              </motion.div>
            )}

            {/* Mode Selection */}
            {mode === "select" && (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div className="rounded-3xl bg-[#F1F5F9] border border-[#E2E8F0] shadow-sm p-6 space-y-3">
                  <h2 className="text-base font-semibold text-[#0F172A] text-center mb-4">
                    기록 모드 선택
                  </h2>

                  <button
                    onClick={() => {
                      setDiaryContent("");
                      setAiQuestion("");
                      setMode("free");
                    }}
                    className="w-full rounded-xl bg-[#0F172A] text-white px-4 py-3 text-sm font-medium hover:bg-[#1E293B] transition-colors"
                  >
                    자유 기록
                  </button>

                  <button
                    onClick={() => {
                      setDiaryContent("");
                      setAiQuestion("");
                      setInterviewStep(0);
                      setInterviewAnswers([]);
                      setCurrentStepAnswer("");
                      setGeneratedDiaryFull("");
                      setDisplayedDiaryLength(0);
                      setShowLuConfirmModal(false);
                      setError(null);
                      setMode("question-seed");
                    }}
                    className="w-full rounded-xl bg-[#64748B] text-white px-4 py-3 text-sm font-medium hover:bg-[#475569] transition-colors"
                  >
                    질문 답변 {LU_ICON} 10
                  </button>
                </div>
              </motion.div>
            )}

            {/* Free Write Mode */}
            {mode === "free" && (
              <motion.div
                key="free"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div className="rounded-3xl bg-[#F1F5F9] border border-[#E2E8F0] shadow-sm p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-[#0F172A]">
                    자유 기록
                  </h2>

                  <textarea
                    value={diaryContent}
                    onChange={(e) => setDiaryContent(e.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-[#F4F7FB] px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/40 focus-visible:border-[#0F172A] resize-none text-[#0F172A] arisum-diary-content"
                    placeholder="오늘 어떤 하루였는지, 떠오르는 생각이나 감정을 편하게 적어 보세요."
                  />

                  {/* Character Counter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">
                        {diaryContent.length}자
                      </span>
                      <span className={charFeedback.color}>
                        {charFeedback.text}
                        {charFeedback.sparkle && " ✨"}
                      </span>
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs text-red-600 leading-relaxed">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode("select")}
                      className="flex-1 rounded-full bg-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#64748B]/20 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveDiary}
                      disabled={isSaving || !diaryContent.trim()}
                      className="flex-1 rounded-full bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E293B] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSaving ? "저장 중..." : "저장하기"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Question Mode - 5~7단계 심층 인터뷰 (단계별 입력, 조용한 분위기) */}
            {mode === "question-seed" && (
              <motion.div
                key="question-seed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div
                  className="rounded-3xl border border-[#E8E4DC] shadow-sm p-6 pb-7 space-y-6"
                  style={{
                    backgroundColor: WARM_IVORY,
                    boxShadow: "0 2px 16px rgba(15,23,42,0.04)",
                  }}
                >
                  <div className="text-center pt-1">
                    <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">
                      심층 인터뷰
                    </h2>
                    <p className="text-xs text-[#64748B] mt-2 opacity-90">
                      {interviewStep + 1} / {INTERVIEW_QUESTIONS.length} · 한 걸음씩 답해 주세요
                    </p>
                  </div>

                  <div
                    className="rounded-xl p-4 border border-[#E8E4DC] min-h-[120px]"
                    style={{ backgroundColor: "#F5F2EB" }}
                  >
                    <p className="text-sm font-medium text-[#0F172A] mb-3 leading-relaxed">
                      {INTERVIEW_QUESTIONS[interviewStep]}
                    </p>
                    <textarea
                      value={currentStepAnswer}
                      onChange={(e) => setCurrentStepAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleInterviewNext();
                        }
                      }}
                      disabled={isGeneratingQuestion}
                      rows={3}
                      className="w-full rounded-lg border border-[#64748B]/25 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/40 focus-visible:border-[#0F172A] text-[#0F172A] disabled:opacity-60 resize-none"
                      style={{ backgroundColor: WARM_IVORY }}
                      placeholder="답변을 입력한 뒤 [다음]을 눌러주세요..."
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-600 leading-relaxed">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setMode("select");
                        setInterviewStep(0);
                        setInterviewAnswers([]);
                        setCurrentStepAnswer("");
                        setError(null);
                      }}
                      className="flex-1 rounded-full bg-[#E8E4DC] px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:bg-[#DDD8CE] transition-colors"
                    >
                      취소
                    </button>
                    {interviewStep > 0 && (
                      <button
                        type="button"
                        onClick={handleInterviewPrev}
                        disabled={isGeneratingQuestion}
                        className="rounded-full bg-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:bg-[#CBD5E1] transition-colors disabled:opacity-60"
                      >
                        이전
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleInterviewNext}
                      disabled={isGeneratingQuestion || !currentStepAnswer.trim()}
                      className="flex-1 rounded-full bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {interviewStep >= INTERVIEW_QUESTIONS.length - 1 ? (
                        <>일기 초안 생성 {LU_ICON} 10</>
                      ) : (
                        "다음"
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 10루 차감 확인 팝업 (일기 초안 생성 직전) */}
            <AnimatePresence>
              {showLuConfirmModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
                  onClick={() => !isGeneratingQuestion && setShowLuConfirmModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#E8E4DC]"
                  >
                    <p className="text-base font-semibold text-[#0F172A] mb-1">
                      일기 초안을 생성할까요?
                    </p>
                    <p className="text-sm text-[#64748B] mb-4">
                      {LU_ICON} 별조각 10개가 소모돼요. 인터뷰 답변을 바탕으로 1인칭 일기 초안을 만들어 드려요.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLuConfirmModal(false)}
                        className="flex-1 rounded-full bg-[#E2E8F0] px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:bg-[#CBD5E1]"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDiaryFromInterview([...interviewAnswers, currentStepAnswer.trim()])}
                        disabled={isGeneratingQuestion || getLuBalance() < LU_QUESTION_DIARY}
                        className="flex-1 rounded-full bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-60"
                      >
                        {LU_ICON} 별조각 10개 사용
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Question Mode - 생성된 일기 초안 (수정 가능 에디터) */}
            {mode === "question-preview" && (
              <motion.div
                key="question-preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div
                  className="rounded-3xl border border-[#E8E4DC] shadow-sm p-6 space-y-4"
                  style={{ backgroundColor: WARM_IVORY }}
                >
                  <h2 className="text-lg font-semibold text-[#0F172A]">
                    별지기가 써드린 일기
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    필요하면 고친 뒤 확인을 눌러주세요.
                  </p>

                  <textarea
                    value={generatedDiaryFull}
                    onChange={(e) => setGeneratedDiaryFull(e.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-[#E8E4DC] px-4 py-4 text-sm leading-relaxed resize-none outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/40 focus-visible:border-[#0F172A]"
                    style={{
                      backgroundColor: "#FFFEF9",
                      color: MIDNIGHT_BLUE,
                      fontFamily: "var(--font-a2z-r), serif",
                    }}
                    placeholder="일기 초안이 여기에 표시돼요."
                  />

                  {error && (
                    <p className="text-xs text-red-600 leading-relaxed">{error}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setMode("question-seed");
                        setInterviewStep(0);
                        setInterviewAnswers([]);
                        setCurrentStepAnswer("");
                        setGeneratedDiaryFull("");
                        setDisplayedDiaryLength(0);
                        setError(null);
                      }}
                      className="flex-1 rounded-full bg-[#E8E4DC] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#DDD8CE] transition-colors"
                    >
                      다시 쓰기
                    </button>
                    <button
                      onClick={handleConfirmGeneratedDiary}
                      disabled={!generatedDiaryFull.trim()}
                      className="flex-1 rounded-full bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E293B] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      완성
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <TabBar
          activeKey="journal"
          onChange={(key: TabKey) => {
            if (key === "home") router.push("/");
            else if (key === "journal") router.push("/diary");
            else if (key === "bookshelf") router.push("/archive");
            else if (key === "constellation") router.push("/constellation");
          }}
        />
      </div>
    </div>
  );
}
