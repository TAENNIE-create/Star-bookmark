"use client";

import { motion } from "framer-motion";

const CHAMPAGNE_GOLD = "#FDE68A";
const SILVER_WHITE = "#E2E8F0";
const MIDNIGHT_OVERLAY = "rgba(10, 14, 26, 0.75)";

export type LoadingMessage =
  | "diary-analysis"      // 별지기가 오늘의 궤적을 읽고 있어요...
  | "question"           // 사유의 깊은 곳에서 질문을 길어 올리는 중입니다...
  | "constellation"      // 밤하늘의 별들을 잇는 중입니다...
  | "monthly-report"    // 한 달의 시간을 모아\n한 권의 기록집으로 엮는 중입니다...
  | "default";          // 별지기가 당신의 우주를 정돈하고 있어요.\n잠시만 기다려 주세요.

const MESSAGES: Record<LoadingMessage, string> = {
  "diary-analysis": "별지기가 오늘의 궤적을 읽고 있어요...",
  question: "사유의 깊은 곳에서 질문을 길어 올리는 중입니다...",
  constellation: "밤하늘의 별들을 잇는 중입니다...",
  "monthly-report": "한 달의 시간을 모아\n한 권의 기록집으로 엮는 중입니다...",
  default: "별지기가 당신의 우주를 정돈하고 있어요.\n잠시만 기다려 주세요.",
};

export type LoadingOverlayProps = {
  /** 상황별 메시지 키. 지정하지 않으면 default */
  message?: LoadingMessage;
  /** 직접 문구 지정 (message보다 우선) */
  messageText?: string;
};

export function LoadingOverlay({ message = "default", messageText }: LoadingOverlayProps) {
  const text = messageText ?? MESSAGES[message];

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center backdrop-blur-md"
      style={{ backgroundColor: MIDNIGHT_OVERLAY }}
      aria-live="polite"
      aria-busy="true"
    >
      {/* 반짝이는 북극성: 4개의 꼭짓점이 날카롭고 우아한 황금빛 별 */}
      <motion.div
        className="relative flex items-center justify-center w-20 h-20"
        animate={{
          rotate: 360,
          scale: [1, 1.08, 1],
        }}
        transition={{
          rotate: { duration: 8, repeat: Infinity, ease: "linear" },
          scale: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(253,230,138,0.28) 0%, transparent 72%)",
            filter: "blur(10px)",
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <svg
          width={48}
          height={48}
          viewBox="0 0 24 24"
          fill="none"
          className="relative drop-shadow-[0_0_12px_rgba(253,230,138,0.6)]"
          aria-hidden
        >
          <motion.path
            d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10L12 2Z"
            fill={CHAMPAGNE_GOLD}
            initial={{ opacity: 0.9 }}
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </motion.div>

      <motion.p
        className="mt-6 max-w-[280px] text-center text-sm leading-relaxed whitespace-pre-line"
        style={{
          fontFamily: "var(--font-a2z-r), sans-serif",
          color: SILVER_WHITE,
          letterSpacing: "0.02em",
        }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        {text}
      </motion.p>
    </div>
  );
}
