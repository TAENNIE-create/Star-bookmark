"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SKY_WHITE, MIDNIGHT_BLUE, LU_ICON } from "../../lib/theme";
import {
  MEMBERSHIP_PLANS,
  type MembershipTier,
  COST_PERMANENT_MEMORY_KEY,
} from "../../lib/economy";

const BORDER_LIGHT = "#E2E8F0";
const MUTED = "#64748B";
const CHAMPAGNE_GOLD = "#FDE68A";
const SILVER_BLUE = "#94A3B8";
/** 멤버십 섹션 전체 배경: 깊은 미드나잇 */
const MIDNIGHT_BAND = "#0A0E1A";
/** 카드 배경: 배경보다 살짝 밝은 네이비 */
const CARD_NAVY = "rgba(30, 41, 59, 0.6)";

/** 멤버십 카드용: [제목 / 가격 / 혜택 리스트] 직관적 구성 */
const MEMBERSHIP_CARD_CONFIG: Record<
  MembershipTier,
  { benefits: string[]; theme: "white" | "silver" | "champagne" | "chronicle"; ribbon?: string }
> = {
  FREE: {
    benefits: ["최근 30일 기록 보관", "데일리 분석 (별조각 30 소모)"],
    theme: "white",
  },
  SHORT_STORY: {
    benefits: ["구매 즉시 별조각 100 획득", "최근 180일 기록 보관"],
    theme: "silver",
  },
  HARDCOVER: {
    benefits: ["구매 즉시 별조각 300 획득", "분석 및 재분석 비용 50% 할인", "최근 365일 기록 보관"],
    theme: "champagne",
    ribbon: "인기",
  },
  CHRONICLE: {
    benefits: [
      "구매 즉시 별조각 500 획득",
      "분석 및 재분석 비용 50% 할인",
      "모든 기록 모드(사진/음성/인터뷰) 무료",
      "모든 기록 평생 보관",
    ],
    theme: "chronicle",
  },
};

const COMING_SOON_MSG =
  "정식 출시 후 이용 가능합니다. 현재는 모든 기능을 자유롭게 체험해 보세요!";

/** 별조각 구매 팩: 스타터 100/1,500 · 밸런스 300/3,900(추천) · 서포터 700/7,900 */
const SHARD_PACKS = [
  { id: "starter", amount: 100, price: 1500, name: "스타터 팩", recommended: false },
  { id: "balance", amount: 300, price: 3900, name: "밸런스 팩", recommended: true },
  { id: "supporter", amount: 700, price: 7900, name: "서포터 팩", recommended: false },
] as const;

type TabId = "membership" | "shards";

type StoreModalProps = {
  open: boolean;
  onClose: () => void;
};

const MEMBERSHIP_TIERS: MembershipTier[] = ["FREE", "SHORT_STORY", "HARDCOVER", "CHRONICLE"];

export function StoreModal({ open, onClose }: StoreModalProps) {
  const [tab, setTab] = useState<TabId>("membership");
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [subscribeBurst, setSubscribeBurst] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  const handleSubscribe = () => setShowComingSoon(true);
  const handleBuyShards = () => setShowComingSoon(true);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="store-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        {/* 모달 패널 + 정식 출시 전 팝업을 같은 래퍼 안에 두어 AnimatePresence 직계 자식 1개만 유지 */}
        <motion.div
          initial={{ y: "100%", opacity: 0.98 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0.98 }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: SKY_WHITE,
            border: `1px solid ${BORDER_LIGHT}`,
            boxShadow: "0 -4px 24px rgba(15,23,42,0.08)",
          }}
        >
          {/* 헤더 */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center justify-between border-b" style={{ borderColor: BORDER_LIGHT }}>
            <h2 className="text-lg font-a2z-m" style={{ color: MIDNIGHT_BLUE }}>
              별조각 · 멤버십
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity font-a2z-r"
              style={{ color: MUTED }}
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          {/* 탭 */}
          <div className="flex-shrink-0 flex border-b" style={{ borderColor: BORDER_LIGHT }}>
            <button
              type="button"
              onClick={() => setTab("membership")}
              className="flex-1 py-3 text-sm font-a2z-m transition-colors"
              style={{
                color: tab === "membership" ? MIDNIGHT_BLUE : MUTED,
                borderBottom: tab === "membership" ? `2px solid ${MIDNIGHT_BLUE}` : "2px solid transparent",
              }}
            >
              멤버십
            </button>
            <button
              type="button"
              onClick={() => setTab("shards")}
              className="flex-1 py-3 text-sm font-a2z-m transition-colors"
              style={{
                color: tab === "shards" ? MIDNIGHT_BLUE : MUTED,
                borderBottom: tab === "shards" ? `2px solid ${MIDNIGHT_BLUE}` : "2px solid transparent",
              }}
            >
              별조각 구매
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {tab === "membership" && (
              <div
                className="px-4 py-5 space-y-8 min-h-full"
                style={{ backgroundColor: MIDNIGHT_BAND }}
              >
                {MEMBERSHIP_TIERS.map((tier, idx) => {
                  const plan = MEMBERSHIP_PLANS[tier];
                  const card = MEMBERSHIP_CARD_CONFIG[tier];
                  const isFree = tier === "FREE";
                  const isChronicle = card.theme === "chronicle";
                  const isChampagne = card.theme === "champagne";
                  const isSilver = card.theme === "silver";
                  const isWhite = card.theme === "white";
                  const titleColor = isWhite ? "#FFFFFF" : isSilver ? CHAMPAGNE_GOLD : isChampagne ? "#FFFFFF" : CHAMPAGNE_GOLD;
                  const priceColor = isWhite ? "#FFFFFF" : isSilver ? "#FFFFFF" : isChampagne ? CHAMPAGNE_GOLD : CHAMPAGNE_GOLD;
                  const benefitTextColor = isChronicle ? CHAMPAGNE_GOLD : "#FFFFFF";
                  const bulletColor = isWhite ? "#FFFFFF" : CHAMPAGNE_GOLD;
                  const cardBorder = isWhite
                    ? "none"
                    : isSilver
                    ? `1px solid ${CHAMPAGNE_GOLD}`
                    : isChampagne || isChronicle
                    ? `2px solid ${CHAMPAGNE_GOLD}`
                    : "none";
                  const hasGoldBorder = isSilver || isChampagne || isChronicle;
                  const borderGlowFilter = hasGoldBorder
                    ? "drop-shadow(0 0 4px rgba(253,230,138,0.35))"
                    : "none";
                  const cardShadow = isChampagne
                    ? `0 0 0 1px ${CHAMPAGNE_GOLD}, 0 0 20px rgba(253,230,138,0.2), 0 0 40px 10px rgba(253,230,138,0.2)`
                    : isChronicle
                    ? `0 0 0 1px rgba(253,230,138,0.4), 0 0 24px rgba(253,230,138,0.12)`
                    : isSilver
                    ? `0 0 16px rgba(253,230,138,0.08)`
                    : "0 0 20px rgba(0,0,0,0.2)";
                  const cardBoxShadowChronicle = isChronicle
                    ? `inset 0 0 60px rgba(253,230,138,0.02), 0 0 28px rgba(253,230,138,0.1)`
                    : undefined;
                  return (
                    <motion.div
                      key={tier}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      className="relative overflow-visible"
                    >
                      {/* 은하 전용: 성운 아우라 (숨 쉬는 발광) */}
                      {isChronicle && (
                        <motion.div
                          className="absolute rounded-3xl pointer-events-none z-0"
                          style={{
                            inset: "-32px",
                            background: "radial-gradient(ellipse 90% 90% at 50% 50%, rgba(253,230,138,0.14) 0%, rgba(147,51,234,0.1) 45%, transparent 70%)",
                            filter: "blur(40px)",
                          }}
                          animate={{
                            opacity: [0.5, 0.85, 0.5],
                            scale: [1, 1.03, 1],
                          }}
                          transition={{
                            duration: 2.8,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          aria-hidden
                        />
                      )}

                      <motion.div
                        className="relative rounded-2xl p-5 flex flex-col overflow-hidden z-10"
                        style={{
                          backgroundColor: CARD_NAVY,
                          border: cardBorder,
                          boxShadow: cardBoxShadowChronicle || cardShadow,
                          filter: borderGlowFilter,
                        }}
                      >
                      {/* 등급별 구석 별 이미지: 잔별·샛별·금별·은하 상징 */}
                      <div
                        className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center pointer-events-none z-0"
                        aria-hidden
                      >
                        <span
                          className="font-a2z-r select-none"
                          style={{
                            fontSize: isWhite ? "1.25rem" : isSilver ? "1.5rem" : isChampagne ? "1.75rem" : "2rem",
                            color: CHAMPAGNE_GOLD,
                            opacity: isWhite ? 0.12 : isSilver ? 0.18 : isChampagne ? 0.28 : 0.22,
                            textShadow: isChampagne ? `0 0 12px ${CHAMPAGNE_GOLD}40` : isChronicle ? `0 0 16px ${CHAMPAGNE_GOLD}50` : "none",
                          }}
                        >
                          {LU_ICON}
                        </span>
                      </div>

                      {/* 연대기: 미세한 별가루 파티클 */}
                      {isChronicle && (
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none" aria-hidden>
                          {[...Array(14)].map((_, i) => (
                            <motion.span
                              key={i}
                              className="absolute w-1 h-1 rounded-full"
                              style={{
                                left: `${8 + (i * 6.5) % 84}%`,
                                top: `${10 + (i * 6) % 80}%`,
                                backgroundColor: CHAMPAGNE_GOLD,
                                opacity: 0.35,
                              }}
                              animate={{ opacity: [0.2, 0.6, 0.2] }}
                              transition={{ duration: 2.5 + (i % 4) * 0.4, repeat: Infinity, delay: i * 0.12 }}
                            />
                          ))}
                        </div>
                      )}

                      <div className="relative z-[1] flex flex-col flex-1 min-h-0">
                        {/* 1단: 등급 이름 (잔별·샛별·금별·은하) 5Medium, 미드나잇 카드와 조화 */}
                        <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                          <h3
                            className="font-a2z-m tracking-wide"
                            style={{
                              fontSize: "18px",
                              letterSpacing: "0.06em",
                              color: titleColor,
                            }}
                          >
                            {plan.name}
                          </h3>
                          {card.ribbon && (
                            <span className="text-[10px] font-a2z-r" style={{ color: CHAMPAGNE_GOLD }}>
                              {card.ribbon}
                            </span>
                          )}
                        </div>
                        {/* 2단: 가격 (5Medium, 24px) */}
                        <p
                          className="text-center font-a2z-m my-5"
                          style={{ fontSize: "24px", color: priceColor }}
                        >
                          {isFree ? "무료" : `${plan.price.toLocaleString()}원 / 월`}
                        </p>
                        {/* 3단: 혜택 리스트 (4Regular, 14px, ✦) */}
                        <ul className="space-y-2.5 mb-5 flex-1">
                          {card.benefits.map((b, i) => (
                            <li
                              key={i}
                              className="font-a2z-r flex items-start gap-2"
                              style={{
                                fontSize: "14px",
                                color: benefitTextColor,
                                wordBreak: "keep-all",
                              }}
                            >
                              <span className="mt-0.5 shrink-0" style={{ color: bulletColor }} aria-hidden>{LU_ICON}</span>
                              {b}
                            </li>
                          ))}
                        </ul>

                        {!isFree && (
                          <motion.button
                            type="button"
                            onClick={() => {
                              setSubscribeBurst(tier);
                              setTimeout(() => setSubscribeBurst(null), 400);
                              handleSubscribe();
                            }}
                            whileTap={{ scale: 0.97 }}
                            className="w-full py-3 rounded-xl text-sm font-a2z-m transition-shadow duration-200"
                            style={{
                              backgroundColor: CHAMPAGNE_GOLD,
                              color: MIDNIGHT_BLUE,
                              boxShadow: subscribeBurst === tier
                                ? `0 0 0 4px rgba(253,230,138,0.5), 0 0 16px rgba(253,230,138,0.4)`
                                : "0 4px 14px rgba(253,230,138,0.3)",
                            }}
                          >
                            구독하기
                          </motion.button>
                        )}
                      </div>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {tab === "shards" && (
              <div
                className="px-4 py-5 space-y-6"
                style={{ backgroundColor: SKY_WHITE }}
              >
                {SHARD_PACKS.map((pack, packIdx) => {
                  const isStarter = pack.id === "starter";
                  const isBalance = pack.id === "balance";
                  const isSupporter = pack.id === "supporter";
                  return (
                    <motion.button
                      key={pack.id}
                      type="button"
                      onClick={handleBuyShards}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: packIdx * 0.05 }}
                      className="w-full relative rounded-2xl p-5 flex flex-col items-center text-left border transition-colors hover:opacity-95"
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: `1px solid rgba(253,230,138,0.5)`,
                        boxShadow: "0 20px 50px rgba(0,0,0,0.05)",
                      }}
                    >
                      {/* 실크 리본: 밸런스 팩만 우측 상단 모서리에 걸침 */}
                      {pack.recommended && (
                        <div
                          className="absolute top-0 right-0 px-4 py-1.5 text-[10px] font-a2z-m shadow-sm"
                          style={{
                            backgroundColor: CHAMPAGNE_GOLD,
                            color: MIDNIGHT_BLUE,
                            borderBottomLeftRadius: 8,
                            boxShadow: "0 2px 8px rgba(253,230,138,0.4)",
                          }}
                        >
                          가장 합리적인 선택
                        </div>
                      )}

                      {/* 별 아이콘 영역: 스타터 1개 / 밸런스 3개 겹침 / 서포터 원형 성단 + 미세 파티클 */}
                      <div className="relative w-16 h-16 flex items-center justify-center mb-4">
                        {isStarter && (
                          <>
                            <span className="text-3xl text-amber-500/90" style={{ textShadow: "0 0 8px rgba(253,230,138,0.4)" }} aria-hidden>{LU_ICON}</span>
                            {[...Array(3)].map((_, i) => (
                              <span
                                key={i}
                                className="absolute w-1 h-1 rounded-full bg-amber-400/50"
                                style={{
                                  left: `${40 + (i * 10)}%`,
                                  top: `${30 + (i * 15)}%`,
                                  width: 4,
                                  height: 4,
                                }}
                              />
                            ))}
                          </>
                        )}
                        {isBalance && (
                          <>
                            <span className="absolute text-2xl text-amber-500/90 -translate-x-2 -translate-y-0.5" style={{ textShadow: "0 0 10px rgba(253,230,138,0.5)" }} aria-hidden>{LU_ICON}</span>
                            <span className="absolute text-2xl text-amber-500/95 translate-x-1 -translate-y-1" style={{ textShadow: "0 0 10px rgba(253,230,138,0.5)" }} aria-hidden>{LU_ICON}</span>
                            <span className="absolute text-2xl text-amber-500/90 translate-y-2" style={{ textShadow: "0 0 10px rgba(253,230,138,0.5)" }} aria-hidden>{LU_ICON}</span>
                            {[...Array(5)].map((_, i) => (
                              <span
                                key={i}
                                className="absolute rounded-full bg-amber-400/40"
                                style={{
                                  left: `${25 + (i * 12)}%`,
                                  top: `${20 + (i % 3) * 25}%`,
                                  width: 3,
                                  height: 3,
                                }}
                              />
                            ))}
                          </>
                        )}
                        {isSupporter && (
                          <>
                            {[0, 72, 144, 216, 288].map((deg, i) => (
                              <span
                                key={i}
                                className="absolute left-1/2 top-1/2 text-xl text-amber-500/90"
                                style={{
                                  transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-24px)`,
                                  textShadow: "0 0 8px rgba(253,230,138,0.45)",
                                }}
                                aria-hidden
                              >
                                {LU_ICON}
                              </span>
                            ))}
                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-amber-500/95" style={{ textShadow: "0 0 12px rgba(253,230,138,0.5)" }} aria-hidden>{LU_ICON}</span>
                            {[...Array(6)].map((_, i) => (
                              <span
                                key={i}
                                className="absolute rounded-full bg-amber-400/35"
                                style={{
                                  left: `${20 + (i % 3) * 30}%`,
                                  top: `${15 + Math.floor(i / 3) * 35}%`,
                                  width: 3,
                                  height: 3,
                                }}
                              />
                            ))}
                          </>
                        )}
                      </div>

                      <span className="font-a2z-m text-lg w-full text-center mb-0.5" style={{ color: MIDNIGHT_BLUE }}>
                        {pack.name}
                      </span>
                      <span className="font-a2z-m text-2xl w-full text-center mb-1" style={{ color: MIDNIGHT_BLUE }}>
                        {pack.amount} 별조각
                      </span>
                      <span className="font-a2z-r text-sm w-full text-center mb-4" style={{ color: MUTED }}>
                        {pack.price.toLocaleString()}원
                      </span>

                      <span
                        className="w-full py-2.5 rounded-full text-sm font-a2z-m text-center text-white"
                        style={{ backgroundColor: MIDNIGHT_BLUE }}
                      >
                        구매하기
                      </span>
                    </motion.button>
                  );
                })}
                <p className="text-xs font-a2z-r pt-4 border-t mt-2" style={{ color: MUTED, borderColor: "rgba(253,230,138,0.3)" }}>
                  기억의 열쇠(특정 달 영구 소장)는 {COST_PERMANENT_MEMORY_KEY} 별조각입니다. 기록함에서 해금할 수 있습니다.
                </p>
              </div>
            )}
          </div>

          {/* 정식 출시 전 안내 팝업: 직계 자식이 아닌 내부 노드로 두어 duplicate key 방지 */}
          {showComingSoon && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4"
              style={{ backgroundColor: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}
              onClick={() => setShowComingSoon(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="rounded-2xl p-6 max-w-sm w-full text-center"
                style={{ backgroundColor: SKY_WHITE, border: `1px solid ${BORDER_LIGHT}` }}
              >
                <p className="text-sm leading-relaxed font-a2z-r" style={{ color: MIDNIGHT_BLUE }}>
                  {COMING_SOON_MSG}
                </p>
                <button
                  type="button"
                  onClick={() => setShowComingSoon(false)}
                  className="mt-4 px-5 py-2.5 rounded-xl text-sm font-a2z-m text-white"
                  style={{ backgroundColor: MIDNIGHT_BLUE }}
                >
                  확인
                </button>
              </motion.div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
