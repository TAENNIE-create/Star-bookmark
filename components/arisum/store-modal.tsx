"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SKY_WHITE, MIDNIGHT_BLUE, LU_ICON } from "../../lib/theme";
import { type MembershipTier } from "../../lib/economy";
import {
  getProductIdForMembershipTier,
  isShardProduct,
  isMembershipProduct,
} from "../../lib/revenuecat-products";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { useRevenueCat } from "./revenuecat-provider";

const BORDER_LIGHT = "#E2E8F0";
const MUTED = "#64748B";
const CHAMPAGNE_GOLD = "#FDE68A";
const SILVER_BLUE = "#94A3B8";
/** 멤버십 섹션 전체 배경: 깊은 미드나잇 */
const MIDNIGHT_BAND = "#0A0E1A";
/** 카드 배경: 배경보다 살짝 밝은 네이비 */
const CARD_NAVY = "rgba(30, 41, 59, 0.6)";

const COMING_SOON_MSG =
  "정식 출시 후 이용 가능합니다. 현재는 모든 기능을 자유롭게 체험해 보세요!";

/** 통합 상점 순서: 은하 멤버십 → 600별 → 300별 → 100별. 가격 고정(에이투지체 표기). */
const UNIFIED_STORE_ITEMS: Array<
  | { type: "membership"; tier: MembershipTier; price: number; name: string; benefits: string[] }
  | { type: "shards"; id: string; amount: number; price: number; name: string }
> = [
  {
    type: "membership",
    tier: "CHRONICLE",
    price: 7400,
    name: "정기 구독권",
    benefits: [
      "가입 시점부터 모든 기록 상시 열람",
      "퀘스트 보상 2배 적립",
      "분석 비용 50% 할인",
      "더욱 쾌적한 별의 여정을 맞이해보세요!",
    ],
  },
  { type: "shards", id: "shards_600", amount: 600, price: 6900, name: "600 별조각" },
  { type: "shards", id: "balance", amount: 300, price: 3900, name: "300 별조각" },
  { type: "shards", id: "starter", amount: 100, price: 1500, name: "100 별조각" },
];

type StoreModalProps = {
  open: boolean;
  onClose: () => void;
};

export function StoreModal({ open, onClose }: StoreModalProps) {
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [subscribeBurst, setSubscribeBurst] = useState<string | null>(null);
  const [paywallError, setPaywallError] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<{
    membership: PurchasesPackage[];
    shards: PurchasesPackage[];
  }>({ membership: [], shards: [] });
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const revenueCat = useRevenueCat();

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !revenueCat.isAvailable) return;
    setOfferingsLoading(true);
    revenueCat
      .getOfferings()
      .then((o) => {
        if (!o?.current?.availablePackages?.length) {
          setOfferings({ membership: [], shards: [] });
          return;
        }
        const membership: PurchasesPackage[] = [];
        const shards: PurchasesPackage[] = [];
        for (const pkg of o.current.availablePackages) {
          const id = pkg.product?.identifier ?? "";
          if (isMembershipProduct(id)) membership.push(pkg);
          else if (isShardProduct(id)) shards.push(pkg);
        }
        setOfferings({ membership, shards });
      })
      .catch(() => setOfferings({ membership: [], shards: [] }))
      .finally(() => setOfferingsLoading(false));
  }, [open, revenueCat.isAvailable, revenueCat.getOfferings]);

  const handlePurchasePackage = async (pkg: PurchasesPackage) => {
    const id = pkg.product?.identifier ?? "";
    setPaywallError(null);
    setPurchasingProductId(id);
    try {
      await revenueCat.purchasePackage(pkg);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPaywallError(msg);
    } finally {
      setPurchasingProductId(null);
    }
  };

  const handleSubscribe = async () => {
    if (revenueCat.isAvailable) {
      setPaywallError(null);
      try {
        await revenueCat.presentPaywall({ displayCloseButton: true });
        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPaywallError(msg);
      }
    } else {
      setShowComingSoon(true);
    }
  };
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
            backgroundColor: MIDNIGHT_BAND,
            border: "1px solid rgba(253,230,138,0.25)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(253,230,138,0.1)",
          }}
        >
          {/* 헤더: 미드나잇 배경, 샴페인 골드 포인트 */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center justify-between border-b" style={{ borderColor: "rgba(253,230,138,0.2)", backgroundColor: MIDNIGHT_BAND }}>
            <h2 className="text-lg font-a2z-m" style={{ color: CHAMPAGNE_GOLD }}>
              상점
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity font-a2z-r"
              style={{ color: SILVER_BLUE }}
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-6" style={{ backgroundColor: MIDNIGHT_BAND }}>
                {revenueCat.isAvailable && revenueCat.isPro && (
                  <p className="text-sm font-a2z-m text-center py-2 rounded-xl" style={{ color: CHAMPAGNE_GOLD, backgroundColor: "rgba(253,230,138,0.12)" }}>
                    Reflexio/Star-Bookmark Pro 구독 중
                  </p>
                )}
                {revenueCat.isAvailable && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={async () => {
                        setPaywallError(null);
                        try {
                          await revenueCat.presentCustomerCenter();
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : String(e);
                          setPaywallError(msg);
                        }
                      }}
                      className="text-sm font-a2z-r underline transition-opacity hover:opacity-80"
                      style={{ color: SILVER_BLUE }}
                    >
                      구독 관리
                    </button>
                  </div>
                )}
                {paywallError && (
                  <p className="text-sm font-a2z-r text-center py-2 rounded-xl" style={{ color: "#DC2626", backgroundColor: "rgba(220,38,38,0.08)" }}>
                    {paywallError}
                  </p>
                )}
                {UNIFIED_STORE_ITEMS.map((item, idx) => {
                  const isFirst = idx === 0;
                  const isMembership = item.type === "membership";
                  return (
                    <motion.div
                      key={isMembership ? item.tier : item.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="relative"
                    >
                      {isFirst && (
                        <motion.div
                          className="absolute rounded-3xl pointer-events-none z-0"
                          style={{
                            inset: "-24px",
                            background: "radial-gradient(ellipse 90% 90% at 50% 50%, rgba(253,230,138,0.12) 0%, rgba(147,51,234,0.08) 45%, transparent 70%)",
                            filter: "blur(32px)",
                          }}
                          animate={{ opacity: [0.5, 0.8, 0.5] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                          aria-hidden
                        />
                      )}
                      <motion.div
                        className="relative rounded-2xl p-5 flex flex-col overflow-hidden z-10 border-2"
                        style={{
                          backgroundColor: CARD_NAVY,
                          borderColor: CHAMPAGNE_GOLD,
                          boxShadow: isFirst
                            ? "inset 0 0 40px rgba(253,230,138,0.04), 0 0 24px rgba(253,230,138,0.15)"
                            : "0 0 0 1px rgba(253,230,138,0.35), 0 0 12px rgba(253,230,138,0.06)",
                        }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center pointer-events-none" aria-hidden>
                          <span className="text-xl font-a2z-r" style={{ color: CHAMPAGNE_GOLD, opacity: 0.3 }}>{LU_ICON}</span>
                        </div>
                        {isMembership ? (
                          <>
                            <h3 className="font-a2z-m text-lg tracking-wide mb-1" style={{ color: CHAMPAGNE_GOLD }}>
                              {item.name}
                            </h3>
                            <p className="font-a2z-m text-2xl mb-4" style={{ color: "#FFFFFF" }}>
                              {item.price.toLocaleString()}원 <span className="text-sm font-a2z-r" style={{ color: SILVER_BLUE }}>/ 월</span>
                            </p>
                            <ul className="space-y-2 mb-5">
                              {item.benefits.map((b, i) => (
                                <li key={i} className="font-a2z-r flex items-start gap-2 text-sm" style={{ color: "rgba(253,230,138,0.95)" }}>
                                  {b === "더욱 쾌적한 별의 여정을 맞이해보세요!" ? null : <span className="shrink-0 mt-0.5" style={{ color: CHAMPAGNE_GOLD }}>{LU_ICON}</span>}
                                  {b}
                                </li>
                              ))}
                            </ul>
                            {(() => {
                              const productId = getProductIdForMembershipTier(item.tier);
                              const pkg = productId ? offerings.membership.find((p) => (p.product?.identifier ?? "") === productId) : undefined;
                              const isPurchasing = pkg && purchasingProductId === (pkg.product?.identifier ?? "");
                              return (
                                <button
                                  type="button"
                                  disabled={!!purchasingProductId}
                                  onClick={() => {
                                    if (pkg) {
                                      setSubscribeBurst(item.tier);
                                      setTimeout(() => setSubscribeBurst(null), 400);
                                      handlePurchasePackage(pkg);
                                    } else {
                                      setSubscribeBurst(item.tier);
                                      setTimeout(() => setSubscribeBurst(null), 400);
                                      handleSubscribe();
                                    }
                                  }}
                                  className="w-full py-3 rounded-xl text-sm font-a2z-m disabled:opacity-70"
                                  style={{
                                    backgroundColor: CHAMPAGNE_GOLD,
                                    color: MIDNIGHT_BLUE,
                                    boxShadow: subscribeBurst === item.tier ? "0 0 0 3px rgba(253,230,138,0.5)" : "0 4px 12px rgba(253,230,138,0.25)",
                                  }}
                                >
                                  {isPurchasing ? "결제 중…" : pkg ? `${pkg.product?.priceString ?? item.price.toLocaleString()}원 구매하기` : `${item.price.toLocaleString()}원 구독하기`}
                                </button>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            <h3 className="font-a2z-m text-lg tracking-wide mb-1" style={{ color: CHAMPAGNE_GOLD }}>
                              {item.name}
                            </h3>
                            <p className="font-a2z-m text-2xl mb-4" style={{ color: "#FFFFFF" }}>
                              {item.price.toLocaleString()}원
                            </p>
                            <p className="font-a2z-r text-sm mb-5" style={{ color: SILVER_BLUE }}>
                              {item.amount}개 별조각 · 데일리/월간 해금 등에 사용
                            </p>
                            {(() => {
                              const pkg = revenueCat.isAvailable
                                ? offerings.shards.find((p) => {
                                    const id = p.product?.identifier ?? "";
                                    const amt = id.includes("600") ? 600 : id.includes("300") || id === "balance" ? 300 : id.includes("100") || id === "starter" ? 100 : 0;
                                    return amt === item.amount;
                                  })
                                : undefined;
                              const isPurchasing = pkg && purchasingProductId === (pkg.product?.identifier ?? "");
                              return (
                                <button
                                  type="button"
                                  disabled={!!purchasingProductId}
                                  onClick={() => (pkg ? handlePurchasePackage(pkg) : handleBuyShards())}
                                  className="w-full py-3 rounded-xl text-sm font-a2z-m disabled:opacity-70 text-white"
                                  style={{ backgroundColor: MIDNIGHT_BLUE }}
                                >
                                  {isPurchasing ? "결제 중…" : `${item.price.toLocaleString()}원 구매하기`}
                                </button>
                              );
                            })()}
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  );
                })}
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
