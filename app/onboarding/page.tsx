"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getAppStorage } from "../../lib/app-storage";

const STORAGE_KEY = "arisum-onboarding";
const DEEP_SPACE = "#05070A";
const CHAMPAGNE = "#FDE68A";

// 줄바꿈: 문자열 안에 \n 을 넣으면 됩니다. 예: "첫째 줄\n둘째 줄"
const PHRASES = [
  "반가워요.\n당신의 밤하늘을 지키고 있던\n별지기예요.",
  "당신이 바쁜 하루 속에서 잠시 놓쳤던 마음들이\n이곳에서 별이 되어 반짝이고 있었어요.",
  "사라지지 않게\n제가 소중히 간직해왔답니다.",
  "이제 이 별들을\n하나씩 찾아내어 이어보려 해요.",
  "별과 별이 이어질 때마다,\n당신이 어떤 사람인지\n조금씩 선명하게 드러날 거예요.",
  "자, 그럼 이 우주의 주인인 당신을\n뭐라고 부르면 좋을까요?",
  "준비됐어요.\n이제 당신만의 첫 일기를\n함께 써볼까요?",
];

const STAR_COUNT = 60;

function StarField() {
  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }).map((_, i) => ({
        id: i,
        size: 0.8 + (i % 5) * 0.6,
        left: `${(i * 13 + 7) % 100}%`,
        top: `${(i * 17 + 11) % 100}%`,
        duration: 2.5 + (i % 4) * 0.8,
        delay: (i % 15) * 0.2,
        opacity: 0.15 + (i % 6) * 0.15,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            left: s.left,
            top: s.top,
            background: "radial-gradient(circle, rgba(255,249,196,0.95) 0%, rgba(253,230,138,0.4) 100%)",
            boxShadow: `0 0 ${s.size * 4}px rgba(255,249,196,0.5)`,
          }}
          animate={{
            opacity: [s.opacity * 0.2, s.opacity, s.opacity * 0.2],
            scale: [1, 1.4, 1],
          }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            delay: s.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function NebulaGlow() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none flex items-center justify-center"
      initial={false}
      animate={{
        opacity: [0.6, 1, 0.6],
      }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="w-[320px] h-[320px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(253,230,138,0.1) 0%, rgba(253,230,138,0.03) 35%, transparent 65%)",
          filter: "blur(28px)",
        }}
      />
    </motion.div>
  );
}

function SupernovaEffect({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="absolute w-4 h-4 rounded-full bg-white"
        style={{ boxShadow: "0 0 60px 30px rgba(255,249,196,0.8)" }}
        initial={{ scale: 0, opacity: 1 }}
        animate={{
          scale: [0, 2, 15, 25],
          opacity: [1, 1, 0.8, 0],
        }}
        transition={{
          duration: 1.4,
          ease: [0.25, 0.46, 0.45, 0.94],
          times: [0, 0.3, 0.7, 1],
        }}
        onAnimationComplete={onComplete}
      />
    </motion.div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSupernova, setShowSupernova] = useState(false);
  const [nameInputVisible, setNameInputVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentPhrase = PHRASES[step];
  const isNameQuestionStep = step === 5;
  const isNameStep = isNameQuestionStep && nameInputVisible;
  const isFinalStep = step === 6;

  const handleTap = useCallback(() => {
    if (isNameStep) return;
    if (isFinalStep) {
      setShowSupernova(true);
      return;
    }
    if (isNameQuestionStep && !nameInputVisible) {
      setNameInputVisible(true);
      return;
    }
    if (step < PHRASES.length - 1) setStep(step + 1);
  }, [step, isNameStep, isFinalStep, isNameQuestionStep, nameInputVisible]);

  const handleNameNext = useCallback(() => {
    const name = userName.trim();
    if (!name) {
      setError("이름을 입력해 주세요.");
      return;
    }
    setError(null);
    if (typeof window !== "undefined") {
      const data = { userName: name, completedAt: new Date().toISOString() };
      getAppStorage().setItem(STORAGE_KEY, JSON.stringify(data));
    }
    setStep(6);
  }, [userName]);

  const handleSupernovaComplete = useCallback(() => {
    router.push("/");
  }, [router]);

  if (!mounted) return null;

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${DEEP_SPACE} 0%, #0a0e14 50%, ${DEEP_SPACE} 100%)`,
      }}
    >
      <StarField />
      <NebulaGlow />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center min-h-[320px]">
        <button
          type="button"
          onClick={handleTap}
          disabled={isNameStep}
          aria-label={isNameStep ? "이름 입력" : "다음"}
          className="w-full flex-1 flex items-center justify-center text-center min-h-[160px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/30 rounded-2xl disabled:cursor-default"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={step}
              className="block text-lg leading-relaxed px-4 whitespace-pre-line"
              style={{
                color: "#F8FAFC",
                textShadow:
                  "0 0 6px rgba(255,255,255,1), 0 0 12px rgba(255,255,255,0.7), 0 0 20px rgba(255,255,255,0.5), 0 0 36px rgba(255,255,255,0.35)",
              }}
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(12px)" }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              {currentPhrase}
            </motion.span>
          </AnimatePresence>
        </button>

        {isNameStep && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full mt-6 space-y-3"
          >
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: "rgba(15,23,42,0.4)",
                border: "1px solid rgba(253,230,138,0.25)",
                boxShadow: "0 0 20px rgba(253,230,138,0.08)",
              }}
            >
              <motion.div
                className="absolute inset-0 opacity-30"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(253,230,138,0.15), transparent)",
                }}
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
              <input
                type="text"
                value={userName}
                onChange={(e) => {
                  setUserName(e.target.value);
                  setError(null);
                }}
                placeholder="닉네임이나 부르고 싶은 이름"
                className="relative w-full rounded-2xl px-4 py-3.5 bg-transparent outline-none placeholder:opacity-50"
                style={{ color: "#E2E8F0" }}
                onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
              />
            </div>
            {error && (
              <p className="text-sm text-amber-300/90">{error}</p>
            )}
            <button
              type="button"
              onClick={handleNameNext}
              className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
              style={{
                backgroundColor: "rgba(253,230,138,0.2)",
                color: CHAMPAGNE,
                border: "1px solid rgba(253,230,138,0.3)",
              }}
            >
              다음
            </button>
          </motion.div>
        )}

        {!isNameStep && !isFinalStep && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] mt-6"
            style={{ color: "rgba(226,232,240,0.5)" }}
          >
            터치하면 다음으로
          </motion.p>
        )}

        {isFinalStep && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] mt-6"
            style={{ color: "rgba(226,232,240,0.5)" }}
          >
            터치하여 시작하기
          </motion.p>
        )}
      </div>

      <AnimatePresence>
        {showSupernova && <SupernovaEffect onComplete={handleSupernovaComplete} />}
      </AnimatePresence>
    </div>
  );
}
