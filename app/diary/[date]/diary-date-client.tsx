"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { TabBar, type TabKey } from "../../../components/arisum/tab-bar";
import { MIDNIGHT_BLUE, MUTED, CARD_BG, PRIMARY_HOVER } from "../../../lib/theme";
import { getLuBalance, subtractLu, addLu } from "../../../lib/lu-balance";
import { getMembershipTier, getRequiredShards } from "../../../lib/economy";
import { LU_ICON } from "../../../lib/theme";
import { removeStarFromAtlas } from "../../../lib/atlas-storage";
import { getApiUrl } from "../../../lib/api-client";
import { getAppStorage } from "../../../lib/app-storage";
import { rollbackIdentityArchiveForDate } from "../../../lib/identity-archive";
import { setQuestsForDate } from "../../../lib/quest-storage";
import { LoadingOverlay } from "../../../components/arisum/loading-overlay";
import { Mic } from "lucide-react";

type JournalEntry = {
  content: string;
  createdAt: string;
  aiQuestion?: string;
  /** 사진 일기: 업로드한 사진(data URL 또는 URL). 리스트에서 텍스트와 함께 표시 */
  photoUrl?: string;
  /** BETMI 분석 해금 여부. 사진 일기 저장 시 false, 30별조각 해금 시 true */
  isAnalyzed?: boolean;
  /** 음성 일기(대화형)로 생성된 기록인지 */
  isVoice?: boolean;
};

type JournalByDate = Record<string, JournalEntry[]>;

type Mode = "view" | "select" | "free" | "question-seed" | "question-preview" | "photo" | "voice";

/** 5~7단계 심층 인터뷰 질문 (사건 → 감정 → 감각 → 내면 → 다짐 순) */
const INTERVIEW_QUESTIONS = [
  "오늘 하루에서 가장 기억에 남는 사건이나 순간은 무엇이었나요?",
  "그 순간 당신은 어떤 감정을 느꼈나요?",
  "그때 몸이나 주변에서 느껴졌던 감각(소리, 빛, 촉감 등)이 떠오르나요?",
  "그 일을 돌아보며 지금 당신의 내면에서는 어떤 생각이 스쳐 지나가나요?",
  "내일의 나에게 한 마디 다짐이나 응원을 남긴다면?",
];

const WARM_IVORY = "#FAF8F5";
const CHAMPAGNE_GOLD = "#FDE68A";
const SKY_WHITE = "#F4F7FB";

/** 기록 모드별 포인트 컬러: 수직바용(밝은 톤) / 제목·버튼·포커스용(딥 셰이드) */
const MODE_FREE_COLOR = "#3B82F6";
const MODE_FREE_DEEP = "#1D4ED8";       // Blue deep
const MODE_QUESTION_COLOR = "#10B981";
const MODE_QUESTION_DEEP = "#047857";   // Green deep
const MODE_PHOTO_COLOR = "#F59E0B";
const MODE_PHOTO_DEEP = "#B45309";      // Amber deep
const MODE_VOICE_COLOR = "#8B5CF6";
const MODE_VOICE_DEEP = "#6D28D9";      // Purple deep
const TYPING_INTERVAL_MS = 25;
const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const SCORES_HISTORY_KEY = "arisum-scores-history";

const LATEST_SCORES_KEY = "arisum-latest-scores";

/** dateKey(YYYY-MM-DD)의 다음 날 키 */
function getNextDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, "0");
  const nd = String(next.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

/** 해당 날짜의 분석 리포트·지표·플래그를 완전 삭제. 성격 카운트 회수, 내일 퀘스트 정리 포함. */
function clearReportAndMetricsForDate(dateKey: string) {
  if (typeof window === "undefined") return;
  const storage = getAppStorage();

  try {
    const reportRaw = storage.getItem(REPORT_BY_DATE_KEY);
    const report: Record<string, { traitIdsContributed?: string[] } & unknown> = reportRaw ? JSON.parse(reportRaw) : {};
    const entry = report[dateKey];
    const traitIds = Array.isArray(entry?.traitIdsContributed) ? entry.traitIdsContributed : [];
    if (traitIds.length > 0) {
      rollbackIdentityArchiveForDate(dateKey, traitIds);
    }
  } catch {
    /* ignore */
  }

  try {
    const tomorrowKey = getNextDayKey(dateKey);
    setQuestsForDate(tomorrowKey, []);
  } catch {
    /* ignore */
  }

  try {
    const reportRaw = storage.getItem(REPORT_BY_DATE_KEY);
    const report: Record<string, unknown> = reportRaw ? JSON.parse(reportRaw) : {};
    delete report[dateKey];
    storage.setItem(REPORT_BY_DATE_KEY, JSON.stringify(report));
  } catch {
    /* ignore */
  }
  try {
    const historyRaw = storage.getItem(SCORES_HISTORY_KEY);
    const history: Record<string, unknown> = historyRaw ? JSON.parse(historyRaw) : {};
    delete history[dateKey];
    storage.setItem(SCORES_HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
  try {
    const latestRaw = storage.getItem(LATEST_SCORES_KEY);
    if (latestRaw) {
      const latest: { date?: string } = JSON.parse(latestRaw);
      if (latest.date === dateKey) storage.removeItem(LATEST_SCORES_KEY);
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("report-updated"));
}

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

const LONG_PRESS_MS = 500;

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
  const [copyFeedback, setCopyFeedback] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const copyContent = useCallback(() => {
    const text = entry.aiQuestion ? `${entry.aiQuestion}\n\n${entry.content}` : entry.content;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      });
    }
  }, [entry.content, entry.aiQuestion]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      copyContent();
    },
    [copyContent]
  );

  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(copyContent, LONG_PRESS_MS);
  }, [copyContent]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

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
        {entry.photoUrl && (
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50/80 mb-4">
            <img
              src={entry.photoUrl}
              alt="일기 사진"
              className="w-full max-h-[280px] object-contain"
            />
          </div>
        )}
        {entry.aiQuestion && (
          <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: MIDNIGHT_BLUE }}>
            <p className="text-xs font-medium mb-2 opacity-90">오늘의 질문</p>
            <p className="text-sm leading-relaxed">{entry.aiQuestion}</p>
          </div>
        )}
        <div
          className="space-y-2 select-text"
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <p className="text-xs text-[#64748B] flex items-center gap-2">
            {new Date(entry.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {entry.isVoice && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#6D28D9" }}>
                음성
              </span>
            )}
          </p>
          <p className="text-sm whitespace-pre-wrap break-words leading-loose arisum-diary-content" style={{ color: MIDNIGHT_BLUE }}>
            {entry.content}
          </p>
          {copyFeedback && (
            <p className="text-xs font-medium text-emerald-600 animate-pulse">복사되었습니다</p>
          )}
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
  const costDiaryMode = getRequiredShards(getMembershipTier(), "diary_mode");

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

  /* 사진 일기 (포토보이스 6단계: 1=선택 완료, 2~6=질문 5개 순차) */
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoAnalysis, setPhotoAnalysis] = useState<{
    visualDescription: string;
    questions: [string, string, string, string];
  } | null>(null);
  const [photoStep, setPhotoStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [photoAnswers, setPhotoAnswers] = useState<string[]>(["", "", "", ""]);
  /** 사진 일기 초안 저장 시 함께 넣을 이미지 URL(data URL). 저장 후 초기화 */
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [isGeneratingPhotoDiary, setIsGeneratingPhotoDiary] = useState(false);
  const photoFileRef = useRef<File | null>(null);

  /* 음성 일기 (대화형: 별지기와 3~5회 티키타카) */
  const [isRecording, setIsRecording] = useState(false);
  const [voiceDialogueTurns, setVoiceDialogueTurns] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [voicePrompt, setVoicePrompt] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isWaitingVoiceReply, setIsWaitingVoiceReply] = useState(false);
  const [isVoiceDiaryDraft, setIsVoiceDiaryDraft] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceVolumeRef = useRef(0);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceVolumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleVoiceSegmentEndRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [showPhotoLuModal, setShowPhotoLuModal] = useState(false);
  const [showVoiceLuModal, setShowVoiceLuModal] = useState(false);

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

  /** 음성 일기: 0턴일 때 1턴 질문(오늘의 시작) 로드 */
  useEffect(() => {
    if (mode !== "voice" || voiceDialogueTurns.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getApiUrl("/api/voice-dialogue"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnIndex: 1, messages: [] }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setVoicePrompt("오늘 하루는 어땠나요?\n기억에 남는 게 있다면 편하게 말씀해주세요.");
          return;
        }
        const data = await res.json();
        setVoicePrompt((data.reply ?? "오늘 하루는 어땠나요?\n기억에 남는 게 있다면 편하게 말씀해주세요.").trim());
      } catch {
        if (!cancelled) setVoicePrompt("오늘 하루는 어땠나요?\n기억에 남는 게 있다면 편하게 말씀해주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, voiceDialogueTurns.length]);

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

  /** 인터뷰 답변 배열로 일기 초안 생성 (API 성공 후에만 별조각 차감) */
  const requestDiaryFromInterview = useCallback(
    async (allAnswers: string[]) => {
      if (allAnswers.length === 0) {
        setError("답변을 하나 이상 입력해주세요.");
        return;
      }
      const lu = getLuBalance();
      if (costDiaryMode > 0 && lu < costDiaryMode) {
        setError(`일기 초안 생성에는 별조각 ${costDiaryMode}개가 필요해요.`);
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
        const res = await fetch(getApiUrl("/api/expand-to-diary"), {
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

        if (costDiaryMode > 0 && !subtractLu(costDiaryMode)) {
          setError("별조각을 차감할 수 없어요.");
          return;
        }
        window.dispatchEvent(new Event("lu-balance-updated"));

        setGeneratedDiaryFull(diary);
        setDisplayedDiaryLength(0);
        setAiQuestion("");
        setMode("question-preview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "일기 생성 중 오류가 발생했습니다.");
      } finally {
        setIsGeneratingQuestion(false);
      }
    },
    [costDiaryMode]
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
      if (costDiaryMode > 0 && lu < costDiaryMode) {
        setError(`일기 초안 생성에는 별조각 ${costDiaryMode}개가 필요해요.`);
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

  /** 질문/사진 일기 초안 완성 시 일기만 저장. BETMI 분석은 일기 탭에서 30별조각 해금 시 별도 실행 */
  const handleConfirmGeneratedDiary = () => {
    if (!generatedDiaryFull.trim() || !dateParam) return;
    if (typeof window === "undefined") return;
    setError(null);
    try {
      const raw = getAppStorage().getItem("arisum-journals");
      const parsed: JournalByDate = raw ? JSON.parse(raw) : {};
      const entries: JournalEntry[] = parsed[dateParam] ?? [];
      const newEntry: JournalEntry = {
        content: generatedDiaryFull.trim(),
        createdAt: new Date().toISOString(),
        aiQuestion: pickedQuestion || undefined,
        ...(pendingPhotoUrl && {
          photoUrl: pendingPhotoUrl,
          isAnalyzed: false,
        }),
        ...(isVoiceDiaryDraft && { isVoice: true }),
      };
      entries.push(newEntry);
      parsed[dateParam] = entries;
      getAppStorage().setItem("arisum-journals", JSON.stringify(parsed));
      window.dispatchEvent(new Event("journal-updated"));
      setPendingPhotoUrl(null);
      setIsVoiceDiaryDraft(false);
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

      // 해당 날짜의 분석 데이터 완전 삭제: 리포트(analysisData, lastAnalyzedText, isAnalyzed), 7대 지표(metrics)
      // 삭제 후 다시 쓰면 '한 번도 분석되지 않은 날'로 인식되어 30별조각 해금 버튼이 나타남
      clearReportAndMetricsForDate(dateParam);

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

  /** 사진 선택 시 미리보기 + base64 저장 */
  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setError("이미지 파일을 선택해주세요.");
      return;
    }
    setError(null);
    photoFileRef.current = file;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  /** 사진 분석 API 호출 → 포토보이스 5질문 준비 */
  const handleAnalyzePhoto = async () => {
    if (!photoDataUrl) return;
    setIsAnalyzingPhoto(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl("/api/analyze-photo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: photoDataUrl }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "사진 분석에 실패했어요.");
      }
      const data = await res.json();
      const questions: [string, string, string, string] = Array.isArray(data.questions) && data.questions.length >= 4
        ? (data.questions.slice(0, 4) as [string, string, string, string])
        : [
            "이 장면을 보고 있으면 몸과 마음에 어떤 느낌이 전해지나요?",
            "오늘 수많은 순간 중 왜 이 사진을 골라 기록하고 싶었나요?",
            "혹시 전에도 이 사진과 닮은 분위기를 느꼈던 적이 있나요? 그때는 언제였나요?",
            "내일은 어떤 분위기의 사진을 찍고 싶나요? 오늘과는 또 다른 느낌일까요?",
          ];
      setPhotoAnalysis({
        visualDescription: data.visualDescription ?? "",
        questions,
      });
      setPhotoStep(1);
      setPhotoAnswers(["", "", "", ""]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진 분석 중 오류가 발생했어요.");
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  /** 사진 일기 생성 (API 성공 후에만 별조각 차감) */
  const handleGeneratePhotoDiary = useCallback(async () => {
    if (!photoAnalysis || (costDiaryMode > 0 && getLuBalance() < costDiaryMode)) return;
    setShowPhotoLuModal(false);
    setIsGeneratingPhotoDiary(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl("/api/photo-to-diary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visualDescription: photoAnalysis.visualDescription,
          questions: photoAnalysis.questions,
          answers: photoAnswers.slice(0, 4) as [string, string, string, string],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "사진 일기 생성에 실패했어요.");
      }
      const data = await res.json();
      const diary = data.diary?.trim();
      if (!diary) throw new Error("일기를 받지 못했어요.");
      if (costDiaryMode > 0 && !subtractLu(costDiaryMode)) {
        setError("별조각을 차감할 수 없어요.");
        return;
      }
      window.dispatchEvent(new Event("lu-balance-updated"));
      setGeneratedDiaryFull(diary);
      setDisplayedDiaryLength(0);
      setPendingPhotoUrl(photoDataUrl ?? null);
      setMode("question-preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진 일기 생성 중 오류가 발생했어요.");
    } finally {
      setIsGeneratingPhotoDiary(false);
    }
  }, [photoAnalysis, photoAnswers, photoDataUrl, costDiaryMode]);

  /** 음성 녹음 시작 + Web Audio 분석(파동용) + 침묵 감지 */
  const handleStartRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioContextRef.current?.state === "running") audioContextRef.current.close();
        analyserRef.current = null;
        audioContextRef.current = null;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        if (voiceVolumeIntervalRef.current) {
          clearInterval(voiceVolumeIntervalRef.current);
          voiceVolumeIntervalRef.current = null;
        }
        setVoiceVolume(0);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      voiceVolumeRef.current = 0;

      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const SILENCE_THRESHOLD = 15;
      const SILENCE_MS = 1400;
      let lastLoudAt = Date.now();
      voiceVolumeIntervalRef.current = setInterval(() => {
        setVoiceVolume(voiceVolumeRef.current);
      }, 80);

      const tick = () => {
        if (!analyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        voiceVolumeRef.current = avg;
        if (avg > SILENCE_THRESHOLD) {
          lastLoudAt = Date.now();
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
        } else if (!silenceTimeoutRef.current && Date.now() - lastLoudAt > 800) {
          silenceTimeoutRef.current = setTimeout(() => {
            silenceTimeoutRef.current = null;
            handleVoiceSegmentEndRef.current();
          }, SILENCE_MS);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      setError("마이크 권한이 필요해요.");
    }
  }, []);

  /** 한 번 멈춤: 녹음 중지 → Whisper → 별지기 답변 → 대화 턴 추가 */
  const handleVoiceSegmentEnd = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    setTimeout(async () => {
      const chunks = audioChunksRef.current;
      if (chunks.length === 0) {
        setVoicePrompt("녹음된 소리가 없어요. 다시 말해주세요.");
        return;
      }
      const blob = new Blob(chunks, { type: "audio/webm" });
      setIsTranscribing(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");
        const res = await fetch(getApiUrl("/api/transcribe"), { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "음성 변환에 실패했어요.");
        }
        const data = await res.json();
        const text = (data.text ?? "").trim();
        if (!text) {
          setVoicePrompt("들리지 않았어요. 다시 말해주세요.");
          setIsTranscribing(false);
          return;
        }
        const prevUserCount = voiceDialogueTurns.filter((t) => t.role === "user").length;
        setVoiceDialogueTurns((prev) => [...prev, { role: "user", text }]);
        const newUserCount = prevUserCount + 1;

        if (newUserCount >= 4) {
          setVoicePrompt("이제 당신의 이야기를 별자리 기록으로 정돈할게요");
          setIsTranscribing(false);
          setIsWaitingVoiceReply(false);
          return;
        }

        setIsWaitingVoiceReply(true);
        const messages = [...voiceDialogueTurns, { role: "user" as const, text }].map((t) => ({
          role: t.role,
          content: t.text,
        }));
        const nextTurnIndex = (newUserCount + 1) as 1 | 2 | 3 | 4;
        const dialRes = await fetch(getApiUrl("/api/voice-dialogue"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnIndex: nextTurnIndex, messages }),
        });
        if (!dialRes.ok) {
          const errData = await dialRes.json();
          throw new Error(errData.error || "별지기 답변에 실패했어요.");
        }
        const dialData = await dialRes.json();
        const reply = (dialData.reply ?? "").trim();
        if (reply) {
          setVoiceDialogueTurns((prev) => [...prev, { role: "assistant", text: reply }]);
          setVoicePrompt(reply);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 중 오류가 발생했어요.");
      } finally {
        setIsTranscribing(false);
        setIsWaitingVoiceReply(false);
      }
    }, 400);
  }, [voiceDialogueTurns]);

  useEffect(() => {
    handleVoiceSegmentEndRef.current = handleVoiceSegmentEnd;
  }, [handleVoiceSegmentEnd]);

  /** 수동으로 한 번 멈춤 (구슬 탭 등) */
  const handleVoiceSegmentEndClick = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") handleVoiceSegmentEnd();
  }, [handleVoiceSegmentEnd]);

  /** 이야기 끝내기 → 일기 승화(voice-to-diary) → 10루 모달 → 초안 생성 */
  const handleVoiceFinish = useCallback(async () => {
    const turns = voiceDialogueTurns;
    if (turns.length === 0) {
      setError("먼저 말해주신 내용이 있어야 일기로 정돈할 수 있어요.");
      return;
    }
    setShowVoiceLuModal(true);
  }, [voiceDialogueTurns]);

  /** 음성 일기 승화 API 성공 후에만 별조각 차감 → question-preview */
  const handleVoiceGenerate = useCallback(async () => {
    if (costDiaryMode > 0 && getLuBalance() < costDiaryMode) return;
    setShowVoiceLuModal(false);
    setIsGeneratingQuestion(true);
    setError(null);
    const turns = voiceDialogueTurns;
    try {
      const res = await fetch(getApiUrl("/api/voice-to-diary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogueTurns: turns }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "일기 정돈에 실패했어요.");
      }
      const data = await res.json();
      const diary = data.diary?.trim();
      if (!diary) throw new Error("일기를 받지 못했어요.");
      if (costDiaryMode > 0 && !subtractLu(costDiaryMode)) {
        setError("별조각을 차감할 수 없어요.");
        return;
      }
      window.dispatchEvent(new Event("lu-balance-updated"));
      setGeneratedDiaryFull(diary);
      setDisplayedDiaryLength(0);
      setIsVoiceDiaryDraft(true);
      setMode("question-preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "음성 일기 생성 중 오류가 발생했어요.");
    } finally {
      setIsGeneratingQuestion(false);
    }
  }, [voiceDialogueTurns, costDiaryMode]);

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

  const mainContentKey =
    mode === "view" && entriesList.length > 0
      ? "view"
      : mode === "select"
        ? "select"
        : mode === "free"
          ? "free"
          : mode === "question-seed"
            ? "question-seed"
            : mode === "question-preview"
              ? "question-preview"
              : mode === "photo"
                ? "photo"
                : mode === "voice"
                  ? "voice"
                  : "empty";

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex justify-center">
      {isWaitingVoiceReply && <LoadingOverlay message="question" />}
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
                  : "오늘의 마음을 기록해보세요."}
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
                onClick={() => {
                  if (mode === "select" || mode === "view") {
                    router.push("/diary");
                  } else {
                    if (mode === "voice") {
                      if (silenceTimeoutRef.current) {
                        clearTimeout(silenceTimeoutRef.current);
                        silenceTimeoutRef.current = null;
                      }
                      if (voiceVolumeIntervalRef.current) {
                        clearInterval(voiceVolumeIntervalRef.current);
                        voiceVolumeIntervalRef.current = null;
                      }
                      if (mediaRecorderRef.current?.state === "recording") {
                        mediaRecorderRef.current.stop();
                      }
                      setVoiceDialogueTurns([]);
                      setVoicePrompt(null);
                      setIsTranscribing(false);
                      setIsWaitingVoiceReply(false);
                      setIsVoiceDiaryDraft(false);
                      setVoiceVolume(0);
                      voiceVolumeRef.current = 0;
                    }
                    setMode("select");
                    setDiaryContent("");
                    setAiQuestion("");
                    setInterviewStep(0);
                    setInterviewAnswers([]);
                    setCurrentStepAnswer("");
                    setGeneratedDiaryFull("");
                    setDisplayedDiaryLength(0);
                    setShowLuConfirmModal(false);
                    setPhotoDataUrl(null);
                    setPhotoAnalysis(null);
                    setPhotoStep(0);
                    setPhotoAnswers(["", "", "", ""]);
                    setIsRecording(false);
                    setVoicePrompt(null);
                    setError(null);
                  }
                }}
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
            <motion.div
              key={mainContentKey}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {mode === "view" && entriesList.length > 0 ? (
                <>
                  {entriesList.map((entry, index) => (
                  <DiaryEntryCard
                    key={`diary-${index}-${entry.createdAt || ""}`}
                    entry={entry}
                    onDelete={handleDeleteEntry}
                  />
                ))}
                </>
              ) : mode === "select" ? (
                <>
                  <h2 className="text-base font-semibold text-center mb-5" style={{ color: MIDNIGHT_BLUE }}>
                    기록 모드 선택
                  </h2>

                <div className="space-y-4">
                  {/* 자유 기록 - Blue */}
                  <button
                    type="button"
                    onClick={() => {
                      setDiaryContent("");
                      setAiQuestion("");
                      setMode("free");
                    }}
                    className="arisum-mode-card-blue w-full rounded-2xl bg-white px-6 py-5 text-left border border-slate-200/80 active:scale-[0.99]"
                    style={{ borderLeftWidth: 5, borderLeftColor: "#3B82F6" }}
                  >
                    <span className="block text-sm font-semibold mb-1.5" style={{ color: "#1D4ED8" }}>
                      자유 기록
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-500">
                      떠오르는 생각과 감정을 그대로 적어요.
                    </span>
                  </button>

                  {/* 질문 답변 ✨ 10 - Green */}
                  <button
                    type="button"
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
                    className="arisum-mode-card-green w-full rounded-2xl bg-white px-6 py-5 text-left border border-slate-200/80 active:scale-[0.99]"
                    style={{ borderLeftWidth: 5, borderLeftColor: "#10B981" }}
                  >
                    <span className="block text-sm font-semibold mb-1.5" style={{ color: "#047857" }}>
                      질문 답변 {LU_ICON} 10
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-500">
                      별지기의 다정한 질문을 따라가며 내 마음을 발견해요.
                    </span>
                  </button>

                  {/* 사진 일기 ✨ 10 - Amber */}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPhotoStep(0);
                      setPhotoDataUrl(null);
                      setPhotoAnalysis(null);
                      setPhotoAnswers(["", "", "", ""]);
                      setMode("photo");
                    }}
                    className="arisum-mode-card-amber w-full rounded-2xl bg-white px-6 py-5 text-left border border-slate-200/80 active:scale-[0.99]"
                    style={{ borderLeftWidth: 5, borderLeftColor: "#F59E0B" }}
                  >
                    <span className="block text-sm font-semibold mb-1.5" style={{ color: "#B45309" }}>
                      사진 일기 {LU_ICON} 10
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-500">
                      오늘의 순간을 담은 사진 한 장으로 특별한 글을 써요.
                    </span>
                  </button>

                  {/* 음성 일기 ✨ 10 - Purple */}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode("voice");
                    }}
                    className="arisum-mode-card-purple w-full rounded-2xl bg-white px-6 py-5 text-left border border-slate-200/80 active:scale-[0.99]"
                    style={{ borderLeftWidth: 5, borderLeftColor: "#8B5CF6" }}
                  >
                    <span className="block text-sm font-semibold mb-1.5" style={{ color: "#6D28D9" }}>
                      음성 일기 {LU_ICON} 10
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-500">
                      타이핑 대신 별지기에게 오늘 하루를 다정하게 들려주세요.
                    </span>
                  </button>
                </div>
                </>
              ) : mode === "free" ? (
                <>
                  <div
                    className="rounded-3xl bg-white border border-slate-200/80 p-7 space-y-5"
                    style={{
                      borderLeftWidth: 5,
                      borderLeftColor: MODE_FREE_COLOR,
                      boxShadow: "0 20px 25px -5px rgba(59, 130, 246, 0.08), 0 8px 10px -6px rgba(59, 130, 246, 0.04)",
                    }}
                  >
                  <h2 className="text-lg font-semibold" style={{ color: MODE_FREE_DEEP }}>
                    자유 기록
                  </h2>

                  <textarea
                    value={diaryContent}
                    onChange={(e) => setDiaryContent(e.target.value)}
                    rows={12}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm outline-none resize-none text-[#0F172A] arisum-diary-content focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:border-[#1D4ED8]"
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
                      className="flex-1 rounded-2xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300/80 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveDiary}
                      disabled={isSaving || !diaryContent.trim()}
                      className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ backgroundColor: MODE_FREE_DEEP }}
                    >
                      {isSaving ? "저장 중..." : "저장하기"}
                    </button>
                  </div>
                </div>
                </>
              ) : mode === "question-seed" ? (
                <>
                  <div
                  className="rounded-3xl bg-white border border-slate-200/80 p-7 pb-8 space-y-6"
                  style={{
                    borderLeftWidth: 5,
                    borderLeftColor: MODE_QUESTION_COLOR,
                    boxShadow: "0 20px 25px -5px rgba(16, 185, 129, 0.08), 0 8px 10px -6px rgba(16, 185, 129, 0.04)",
                  }}
                >
                  <div className="text-left pt-1">
                    <h2 className="text-lg font-semibold tracking-tight" style={{ color: MODE_QUESTION_DEEP }}>
                      질문 답변
                    </h2>
                    <p className="text-xs mt-2 opacity-90" style={{ color: MODE_QUESTION_DEEP }}>
                      {interviewStep + 1} / {INTERVIEW_QUESTIONS.length} · 한 걸음씩 답해 주세요
                    </p>
                  </div>

                  <div className="rounded-2xl p-4 border border-slate-200/80 min-h-[120px] bg-slate-50/60">
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
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:border-[#047857] text-[#0F172A] disabled:opacity-60 resize-none"
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
                      className="flex-1 rounded-2xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300/80 transition-colors"
                    >
                      취소
                    </button>
                    {interviewStep > 0 && (
                      <button
                        type="button"
                        onClick={handleInterviewPrev}
                        disabled={isGeneratingQuestion}
                        className="rounded-2xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300/80 transition-colors disabled:opacity-60"
                      >
                        이전
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleInterviewNext}
                      disabled={isGeneratingQuestion || !currentStepAnswer.trim()}
                      className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ backgroundColor: MODE_QUESTION_DEEP }}
                    >
                      {interviewStep >= INTERVIEW_QUESTIONS.length - 1 ? (
                        <>일기 초안 생성 {LU_ICON} 10</>
                      ) : (
                        "다음"
                      )}
                    </button>
                  </div>
                </div>
                </>
              ) : mode === "question-preview" ? (
                <>
                  <div
                    className="rounded-3xl bg-white border border-slate-200/80 p-7 space-y-5"
                    style={{
                      borderLeftWidth: 5,
                      borderLeftColor: MODE_QUESTION_COLOR,
                      boxShadow: "0 20px 25px -5px rgba(16, 185, 129, 0.08), 0 8px 10px -6px rgba(16, 185, 129, 0.04)",
                    }}
                  >
                    <h2 className="text-lg font-semibold" style={{ color: MODE_QUESTION_DEEP }}>
                      별지기가 써드린 일기
                    </h2>
                  <p className="text-xs text-slate-500">
                    필요하면 고친 뒤 확인을 눌러주세요.
                  </p>

                  <textarea
                    value={generatedDiaryFull}
                    onChange={(e) => setGeneratedDiaryFull(e.target.value)}
                    rows={12}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-relaxed resize-none outline-none focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:border-[#047857]"
                    style={{
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
                        if (isVoiceDiaryDraft) {
                          setMode("voice");
                          setVoiceDialogueTurns([]);
                          setVoicePrompt(null);
                        } else {
                          setMode("question-seed");
                          setInterviewStep(0);
                          setInterviewAnswers([]);
                          setCurrentStepAnswer("");
                        }
                        setGeneratedDiaryFull("");
                        setDisplayedDiaryLength(0);
                        setPendingPhotoUrl(null);
                        setIsVoiceDiaryDraft(false);
                        setError(null);
                      }}
                      className="flex-1 rounded-2xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300/80 transition-colors"
                    >
                      다시 쓰기
                    </button>
                    <button
                      onClick={handleConfirmGeneratedDiary}
                      disabled={!generatedDiaryFull.trim()}
                      className="flex-1 rounded-2xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ backgroundColor: MODE_QUESTION_DEEP }}
                    >
                      저장하기
                    </button>
                  </div>
                </div>
                </>
              ) : mode === "photo" ? (
                <>
                  <div
                    className="rounded-3xl bg-white border border-slate-200/80 p-7 space-y-5"
                    style={{
                      borderLeftWidth: 5,
                      borderLeftColor: MODE_PHOTO_COLOR,
                      boxShadow: "0 20px 25px -5px rgba(245, 158, 11, 0.08), 0 8px 10px -6px rgba(245, 158, 11, 0.04)",
                    }}
                  >
                    <h2 className="text-lg font-semibold" style={{ color: MODE_PHOTO_DEEP }}>
                      사진 일기
                    </h2>

                  {photoStep === 0 && (
                    <>
                      <p className="text-sm font-medium text-slate-600">
                        오늘의 순간을 담은 사진을 선택하세요
                      </p>
                      <div className="mt-5 flex flex-row items-center gap-3">
                        <input
                          id="photo-file-input"
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoFileChange}
                          className="absolute w-0 h-0 opacity-0 overflow-hidden"
                          aria-label="사진 선택"
                        />
                        <label
                          htmlFor="photo-file-input"
                          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-white cursor-pointer transition-opacity hover:opacity-90"
                          style={{ backgroundColor: MODE_PHOTO_DEEP }}
                        >
                          사진 선택
                        </label>
                        <span className="text-xs text-slate-500">
                          {photoDataUrl ? "선택된 사진이 있어요" : "사진 선택 없음"}
                        </span>
                      </div>
                      {photoDataUrl && (
                        <>
                          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50/80">
                            <img
                              src={photoDataUrl}
                              alt="선택한 사진"
                              className="w-full max-h-[280px] object-contain"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleAnalyzePhoto}
                            disabled={isAnalyzingPhoto}
                            className="w-full rounded-2xl py-3 text-sm font-medium text-white disabled:opacity-60 transition-opacity"
                            style={{ backgroundColor: MODE_PHOTO_DEEP }}
                          >
                            {isAnalyzingPhoto ? "분석 중..." : "사진 분석하고 질문 받기"}
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {photoStep >= 1 && photoStep <= 4 && photoAnalysis && (
                    <>
                      {photoDataUrl && (
                        <div
                          className="w-full rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#F8FAFC]"
                          style={{ boxShadow: "0 4px 16px rgba(15,23,42,0.08)" }}
                        >
                          <img
                            src={photoDataUrl}
                            alt="선택한 사진"
                            className="w-full max-h-[240px] object-contain"
                          />
                        </div>
                      )}
                      <p className="text-sm font-medium leading-relaxed mt-2 mb-4" style={{ color: MODE_PHOTO_DEEP }}>
                        {photoAnalysis.questions[photoStep - 1]}
                      </p>
                      <textarea
                        value={photoAnswers[photoStep - 1] ?? ""}
                        onChange={(e) => {
                          const next = [...photoAnswers];
                          next[photoStep - 1] = e.target.value;
                          setPhotoAnswers(next);
                        }}
                        rows={4}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#B45309] focus-visible:border-[#B45309] resize-none"
                        style={{ color: MIDNIGHT_BLUE }}
                        placeholder="답변을 입력하세요"
                      />
                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={() => {
                            if (!photoAnswers[photoStep - 1]?.trim()) {
                              setError("답변을 입력해 주세요.");
                              return;
                            }
                            setError(null);
                            if (photoStep < 4) setPhotoStep((s) => (s + 1) as 1 | 2 | 3 | 4);
                            else setPhotoStep(5);
                          }}
                          disabled={!photoAnswers[photoStep - 1]?.trim()}
                          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                          style={{ backgroundColor: MODE_PHOTO_DEEP }}
                        >
                          {photoStep < 4 ? "다음" : "답변 완료"}
                        </button>
                      </div>
                    </>
                  )}
                  {photoStep === 5 && photoAnalysis && (
                    <>
                      {photoDataUrl && (
                        <div
                          className="w-full rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#F8FAFC] mb-4"
                          style={{ boxShadow: "0 4px 16px rgba(15,23,42,0.08)" }}
                        >
                          <img
                            src={photoDataUrl}
                            alt="선택한 사진"
                            className="w-full max-h-[200px] object-contain"
                          />
                        </div>
                      )}
                      <p className="text-sm leading-relaxed mb-2" style={{ color: MUTED }}>
                        오늘의 시각적 묘사
                      </p>
                      <p className="text-sm leading-relaxed mb-6" style={{ color: MIDNIGHT_BLUE }}>
                        {photoAnalysis.visualDescription}
                      </p>
                      <p className="text-sm font-medium mb-4" style={{ color: MODE_PHOTO_DEEP }}>
                        모든 답변이 준비되었어요. 일기 초안을 만들까요?
                      </p>
                      {costDiaryMode > 0 && getLuBalance() < costDiaryMode && (
                        <p className="text-xs mb-3" style={{ color: MUTED }}>
                          일기 생성에는 {LU_ICON} {costDiaryMode}개가 필요해요.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (costDiaryMode > 0 && getLuBalance() < costDiaryMode) {
                            setError(`별조각 ${costDiaryMode}개가 필요해요.`);
                            return;
                          }
                          setShowPhotoLuModal(true);
                        }}
                        disabled={isGeneratingPhotoDiary || (costDiaryMode > 0 && getLuBalance() < costDiaryMode)}
                        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                        style={{ backgroundColor: MODE_PHOTO_DEEP }}
                      >
                        {isGeneratingPhotoDiary ? "초안 만드는 중..." : `일기 초안 만들기 ${LU_ICON} 10`}
                      </button>
                    </>
                  )}
                  {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
                </>
              ) : mode === "voice" ? (
                <>
                  <div
                    className="rounded-3xl bg-white border border-slate-200/80 p-6 space-y-6"
                    style={{
                      borderLeftWidth: 5,
                      borderLeftColor: MODE_VOICE_COLOR,
                      boxShadow: "0 20px 25px -5px rgba(139, 92, 246, 0.08), 0 8px 10px -6px rgba(139, 92, 246, 0.04)",
                    }}
                  >
                    <h2 className="text-lg font-semibold" style={{ color: MODE_VOICE_DEEP }}>
                      음성 일기
                    </h2>

                    {/* 중앙: 마이크 + 단일 글로우(선/띠/border 없음, 보랏빛 연기만) */}
                    <div className="flex flex-col items-center justify-center py-6">
                      <button
                        type="button"
                        onClick={isRecording ? handleVoiceSegmentEndClick : handleStartRecording}
                        disabled={isTranscribing || isWaitingVoiceReply}
                        className="relative rounded-full flex items-center justify-center touch-manipulation focus:outline-none focus-visible:ring-0 disabled:opacity-70"
                        style={{
                          width: 160,
                          height: 160,
                          background: "transparent",
                          border: "none",
                        }}
                      >
                        {/* 단일 커다란 원형 빛: radial-gradient + 강한 blur, 경계선 없음. 말할 때 scale↑ 진한 보라, 침묵 시 연한 라벤더·숨 쉬는 애니메이션 */}
                        <motion.div
                          className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                          style={{
                            width: 200,
                            height: 200,
                            marginLeft: -100,
                            marginTop: -100,
                            border: "none",
                            boxShadow: "none",
                            background: isRecording && voiceVolume > 18
                              ? `radial-gradient(circle, rgba(109,40,217,0.32) 0%, rgba(109,40,217,0.1) 40%, transparent 70%)`
                              : `radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.06) 45%, transparent 70%)`,
                            filter: "blur(40px)",
                          }}
                          animate={{
                            scale: isRecording && voiceVolume > 18 ? [1.12, 1.28, 1.12] : [1, 1.08, 1],
                            opacity: isRecording && voiceVolume > 18 ? 1 : [0.85, 1, 0.85],
                          }}
                          transition={{
                            duration: isRecording && voiceVolume > 18 ? 1 : 3.8,
                            repeat: Infinity,
                            repeatType: "reverse",
                            ease: "easeInOut",
                          }}
                        />
                        {/* blur가 자식까지 흐리게 할 수 있으므로, 블러 레이어와 마이크를 분리. 추가로 더 부드러운 외곽 glow(선 없음) */}
                        <motion.div
                          className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                          style={{
                            width: 220,
                            height: 220,
                            marginLeft: -110,
                            marginTop: -110,
                            border: "none",
                            boxShadow: "none",
                            background: isRecording && voiceVolume > 18
                              ? `radial-gradient(circle, rgba(109,40,217,0.15) 0%, transparent 60%)`
                              : `radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 60%)`,
                            filter: "blur(60px)",
                          }}
                          animate={{
                            scale: isRecording && voiceVolume > 18 ? [1.1, 1.2, 1.1] : [1, 1.06, 1],
                          }}
                          transition={{
                            duration: isRecording && voiceVolume > 18 ? 1.1 : 4,
                            repeat: Infinity,
                            repeatType: "reverse",
                            ease: "easeInOut",
                            delay: 0.2,
                          }}
                        />
                        <span className="relative z-10" style={{ color: MIDNIGHT_BLUE }}>
                          <Mic className="w-9 h-9" strokeWidth={2.2} />
                        </span>
                      </button>
                      {!isRecording && !voicePrompt && !isTranscribing && !isWaitingVoiceReply && voiceDialogueTurns.length === 0 && (
                        <p className="text-xs mt-4 text-center" style={{ color: MUTED }}>
                          링을 눌러 말해주세요. 잠시 멈추면 별지기가 다음 질문을 해요.
                        </p>
                      )}
                      {isRecording && (
                        <p className="text-xs mt-4 text-center" style={{ color: MODE_VOICE_DEEP }}>
                          말씀하시다 잠시 멈추면 자동 전달돼요. 링을 눌러 보내기
                        </p>
                      )}
                    </div>

                    {/* 별지기 질문 / 4턴 메시지 */}
                    {isTranscribing && (
                      <p className="text-sm text-center" style={{ color: MUTED }}>
                        말씀을 글로 옮기는 중...
                      </p>
                    )}
                    {isWaitingVoiceReply && !isTranscribing && (
                      <p className="text-sm text-center" style={{ color: MUTED }}>
                        별지기가 다음 질문을 생각하는 중...
                      </p>
                    )}
                    {voicePrompt && !isTranscribing && !isWaitingVoiceReply && (
                      <div
                        className="rounded-2xl py-4 px-4 border border-purple-100 backdrop-blur-md"
                        style={{
                          backgroundColor: "rgba(245, 243, 255, 0.65)",
                          boxShadow: "0 4px 14px rgba(147, 51, 234, 0.08), 0 2px 6px rgba(139, 92, 246, 0.06)",
                        }}
                      >
                        <p
                          className="text-sm leading-loose font-a2z-regular"
                          style={{ color: MIDNIGHT_BLUE }}
                        >
                          {voicePrompt}
                        </p>
                      </div>
                    )}

                    {/* 4턴 한정: 계속 말하기(1~3턴) / 별자리 기록으로 정돈(4턴 완료) */}
                    {voiceDialogueTurns.length > 0 && !isRecording && !isTranscribing && !isWaitingVoiceReply && (() => {
                      const userCount = voiceDialogueTurns.filter((t) => t.role === "user").length;
                      const isComplete = userCount >= 4;
                      return (
                        <div className="flex flex-col gap-2">
                          {!isComplete && (
                            <button
                              type="button"
                              onClick={handleStartRecording}
                              disabled={costDiaryMode > 0 && getLuBalance() < costDiaryMode}
                              className="rounded-2xl py-2.5 px-4 text-sm font-medium text-white transition-opacity"
                              style={{ backgroundColor: MODE_VOICE_DEEP }}
                            >
                              계속 말하기 ({userCount}/4)
                            </button>
                          )}
                          {isComplete && (
                            <button
                              type="button"
                              onClick={handleVoiceFinish}
                              disabled={costDiaryMode > 0 && getLuBalance() < costDiaryMode}
                              className="rounded-2xl py-2.5 px-4 text-sm font-medium text-white transition-opacity"
                              style={{ backgroundColor: MODE_VOICE_DEEP }}
                            >
                              별자리 기록으로 정돈하기 {LU_ICON} 10
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* 화면 하단: 사용자가 말한 내용 텍스트 (입력 잘 되고 있다는 안심) */}
                    {voiceDialogueTurns.filter((t) => t.role === "user").length > 0 && (
                      <div className="rounded-xl py-3 px-4 border border-slate-200/80 bg-slate-50/60">
                        <p className="text-[10px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: MUTED }}>
                          지금까지 말씀하신 내용
                        </p>
                        <div className="space-y-1.5 max-h-24 overflow-y-auto">
                          {voiceDialogueTurns
                            .filter((t) => t.role === "user")
                            .map((t, i) => (
                              <p key={i} className="text-xs leading-relaxed" style={{ color: MIDNIGHT_BLUE }}>
                                {t.text}
                              </p>
                            ))}
                        </div>
                      </div>
                    )}

                    {error && <p className="text-xs text-red-600">{error}</p>}
                  </div>
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* 10루 차감 확인 팝업 (일기 초안 생성 직전) - AnimatePresence 밖에 두어 key 중복 방지 */}
          <AnimatePresence>
            {showLuConfirmModal && (
              <motion.div
                key="lu-confirm-modal"
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
                      className="flex-1 rounded-2xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300/80"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDiaryFromInterview([...interviewAnswers, currentStepAnswer.trim()])}
                      disabled={isGeneratingQuestion || (costDiaryMode > 0 && getLuBalance() < costDiaryMode)}
                      className="flex-1 rounded-2xl bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-60"
                    >
                      {LU_ICON} 별조각 10개 사용
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 사진 일기 10루 확인 모달 */}
          <AnimatePresence>
            {showPhotoLuModal && (
              <motion.div
                key="photo-lu-modal"
                initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
                  onClick={() => !isGeneratingPhotoDiary && setShowPhotoLuModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
                  >
                    <p className="text-base font-semibold text-[#0F172A] mb-1">
                      일기 초안을 만들까요?
                    </p>
                    <p className="text-sm text-[#64748B] mb-4">
                      {LU_ICON} 별조각 10개가 소모돼요.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPhotoLuModal(false)}
                        className="flex-1 rounded-2xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGeneratePhotoDiary()}
                        disabled={isGeneratingPhotoDiary || (costDiaryMode > 0 && getLuBalance() < costDiaryMode)}
                        className="flex-1 rounded-2xl bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {LU_ICON} 10개 사용
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          {/* 음성 일기 10루 확인 모달 */}
          <AnimatePresence>
            {showVoiceLuModal && (
              <motion.div
                key="voice-lu-modal"
                initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 backdrop-blur-sm px-4"
                  onClick={() => !isGeneratingQuestion && setShowVoiceLuModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
                  >
                    <p className="text-base font-semibold text-[#0F172A] mb-1">
                      음성 일기를 정돈해서 생성할까요?
                    </p>
                    <p className="text-sm text-[#64748B] mb-4">
                      {LU_ICON} 별조각 10개가 소모돼요.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowVoiceLuModal(false)}
                        className="flex-1 rounded-2xl bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVoiceGenerate()}
                        disabled={isGeneratingQuestion || (costDiaryMode > 0 && getLuBalance() < costDiaryMode)}
                        className="flex-1 rounded-2xl bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {LU_ICON} 10개 사용
                      </button>
                    </div>
                  </motion.div>
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
