"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import { MIDNIGHT_BLUE, LU_ICON } from "../../lib/theme";

const LOCK_ICON_SIZE = 18;
const GOLD_FILTER = "invert(90%) sepia(30%) saturate(2000%) hue-rotate(350deg) brightness(105%) contrast(105%)";
const LOCK_GLOW_FILTER = `${GOLD_FILTER} drop-shadow(0 0 4px rgba(253,230,138,0.6)) drop-shadow(0 0 8px rgba(253,230,138,0.3))`;

import { getLuBalance, subtractLu } from "../../lib/lu-balance";
import { getMembershipTier, getRequiredShards, INSUFFICIENT_SHARDS_MESSAGE } from "../../lib/economy";
import { getUserName } from "../../lib/home-greeting";
import { getUnlockedMonths, setUnlockedMonths } from "../../lib/archive-unlock";
import { getAppStorage } from "../../lib/app-storage";
import { openStoreModal } from "../../components/arisum/store-modal-provider";

const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const SKY_WHITE = "#F4F7FB";
const CHAMPAGNE_GOLD = "#FDE68A";

/** 한글 명사 뒤 목적격 조사: 받침 있으면 '을', 없으면 '를' */
function getObjectParticle(noun: string): string {
  if (!noun || typeof noun !== "string") return "를";
  const last = noun.charCodeAt(noun.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "를";
  return (last - 0xac00) % 28 !== 0 ? "을" : "를";
}

type SlotState = "inactive" | "unlock_pending" | "unlocked";

type MonthlySlot = {
  yearMonth: string;
  label: string;
  slotType: "this_month" | "past_month";
  state: SlotState;
  recordCount: number;
  isLocked: boolean;
  isCurrentMonth: boolean;
};

function getReportByDate(): Record<string, { todayFlow?: string; gardenerWord?: string; growthSeeds?: string[] }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getCurrentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getRecordCountForMonth(
  reports: Record<string, unknown>,
  yearMonth: string
): number {
  return Object.keys(reports).filter((d) => d.startsWith(yearMonth)).length;
}

/** YYYY-MM-DD 키 목록에서 등장하는 모든 YYYY-MM 반환 (오름차순) */
function getYearMonthsFromReportKeys(reports: Record<string, unknown>): string[] {
  const set = new Set<string>();
  for (const key of Object.keys(reports)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      set.add(key.slice(0, 7));
    }
  }
  return Array.from(set).sort();
}

/** 첫 사용 월 ~ 현재 월 사이의 모든 YYYY-MM 생성 (현재 월 포함), 최신순 */
function getMonthRangeFromFirstToCurrent(
  firstYearMonth: string | null,
  currentYM: string
): string[] {
  if (!firstYearMonth) return [currentYM];
  const list: string[] = [];
  let [y, m] = firstYearMonth.split("-").map(Number);
  const [cy, cm] = currentYM.split("-").map(Number);
  while (y < cy || (y === cy && m <= cm)) {
    list.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  return list.reverse();
}

/** 첫 사용 달부터 현재 달까지 monthly_books 슬롯 생성. 현재 달은 '작성 중', 지난 달은 isLocked로 해금 여부 표시 */
function buildMonthlySlots(
  reports: Record<string, unknown>,
  unlocked: Set<string>
): MonthlySlot[] {
  const currentYM = getCurrentYearMonth();
  const yearMonths = getYearMonthsFromReportKeys(reports);
  const firstYM = yearMonths.length > 0 ? yearMonths[0]! : null;
  const range = getMonthRangeFromFirstToCurrent(firstYM, currentYM);

  const slots: MonthlySlot[] = range.map((yearMonth) => {
    const isCurrentMonth = yearMonth === currentYM;
    const recordCount = getRecordCountForMonth(reports, yearMonth);
    const isUnlocked = unlocked.has(yearMonth);
    const state: SlotState = isCurrentMonth
      ? "inactive"
      : isUnlocked
        ? "unlocked"
        : "unlock_pending";
    const isLocked = state !== "unlocked";
    const [y, m] = yearMonth.split("-");
    const monthNum = parseInt(m!, 10);
    const label = `${y}년 ${monthNum}월`;

    return {
      yearMonth,
      label,
      slotType: isCurrentMonth ? "this_month" : "past_month",
      state,
      recordCount,
      isLocked,
      isCurrentMonth,
    };
  });

  return slots;
}

export default function ArchivePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [lu, setLu] = useState(0);
  const [reports, setReports] = useState<Record<string, unknown>>({});
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [confirmUnlockMonth, setConfirmUnlockMonth] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [, setMembershipVersion] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setNickname(getUserName());
    setLu(getLuBalance());
    setReports(getReportByDate());
    setUnlocked(getUnlockedMonths());
  }, [mounted]);

  useEffect(() => {
    const onUpdate = () => setLu(getLuBalance());
    window.addEventListener("lu-balance-updated", onUpdate);
    return () => window.removeEventListener("lu-balance-updated", onUpdate);
  }, []);

  useEffect(() => {
    const onMembershipUpdated = () => setMembershipVersion((v) => v + 1);
    window.addEventListener("membership-updated", onMembershipUpdated);
    return () => window.removeEventListener("membership-updated", onMembershipUpdated);
  }, []);

  if (!mounted) return null;

  const tier = getMembershipTier();
  const slots = buildMonthlySlots(reports, unlocked);
  const costMonthly = getRequiredShards(tier, "monthly_archive_unlock");
  const costMemory = getRequiredShards(tier, "permanent_memory_key");

  const unlockMonth = (yearMonth: string) => {
    const needed = costMonthly;
    if (lu < needed || unlocked.has(yearMonth)) return;
    if (!subtractLu(needed)) return;
    setLu(getLuBalance());
    const next = new Set(unlocked);
    next.add(yearMonth);
    setUnlockedMonths(next);
    setUnlocked(next);
    setConfirmUnlockMonth(null);
    window.dispatchEvent(new Event("lu-balance-updated"));
    router.push(`/archive/${yearMonth}`);
  };

  /** 기억의 열쇠: 별조각으로 해당 달 영구 소장 (멤버십과 무관 열람·AI 맥락 포함) */
  const unlockMonthWithMemoryKey = (yearMonth: string) => {
    if (lu < costMemory || unlocked.has(yearMonth)) return;
    if (!subtractLu(costMemory)) return;
    setLu(getLuBalance());
    const next = new Set(unlocked);
    next.add(yearMonth);
    setUnlockedMonths(next);
    setUnlocked(next);
    setConfirmUnlockMonth(null);
    window.dispatchEvent(new Event("lu-balance-updated"));
    router.push(`/archive/${yearMonth}`);
  };

  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: SKY_WHITE }}>
      <div className="w-full max-w-md min-h-screen flex flex-col">
        <div className="h-12" />
        <header className="px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: MIDNIGHT_BLUE }}>
                기록함
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>한 달이 끝나면 한 권의 기록집이 꽂혀요.</p>
            </div>
            <button
              type="button"
              onClick={openStoreModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full backdrop-blur-md cursor-pointer transition-opacity hover:opacity-90"
              style={{
                backgroundColor: "rgba(255,255,255,0.85)",
                boxShadow: "0 2px 12px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
                border: "1px solid rgba(255,255,255,0.6)",
                color: MIDNIGHT_BLUE,
              }}
              aria-label="별조각 · 상점 열기"
            >
              <span className="text-amber-600 text-sm">{LU_ICON}</span>
              <span className="text-sm font-semibold tabular-nums">{lu}</span>
            </button>
          </div>
          <div className="mt-4 border-t border-slate-200" />
        </header>

        <p className="px-6 mt-4 mb-4 text-xs" style={{ color: "#64748B" }}>
          월간 기록집을 해금해 태돌님을 돌아보세요.
        </p>

        <main className="flex-1 px-6 overflow-y-auto arisum-pb-tab-safe">
          <AnimatePresence>
            {confirmUnlockMonth && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                onClick={() => setConfirmUnlockMonth(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xl max-w-sm w-full"
                >
                  {lu < costMonthly && lu < costMemory ? (
                    <>
                      <p className="text-sm font-bold mb-2" style={{ color: MIDNIGHT_BLUE }}>
                        별조각이 부족해요
                      </p>
                      <p className="text-xs text-[#64748B] mb-4">
                        {INSUFFICIENT_SHARDS_MESSAGE}
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmUnlockMonth(null)}
                          className="px-3 py-1.5 text-sm font-medium rounded-full border border-slate-300 text-[#64748B] hover:bg-slate-100"
                        >
                          닫기
                        </button>
                        <button
                          type="button"
                          onClick={() => { openStoreModal(); setConfirmUnlockMonth(null); }}
                          className="px-3 py-1.5 text-sm font-medium rounded-full text-white hover:opacity-90"
                          style={{ backgroundColor: MIDNIGHT_BLUE }}
                        >
                          상점 가기
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold mb-2" style={{ color: MIDNIGHT_BLUE }}>
                        이 달 기록집을 열어보세요.
                      </p>
                      <p className="text-xs text-[#64748B] mb-4">
                        별조각 {costMonthly}으로 한 달 열람하거나, {costMemory}으로 기억의 열쇠(영구 소장)할 수 있어요.
                      </p>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 justify-end flex-wrap">
                          <motion.button
                            type="button"
                            onClick={() => setConfirmUnlockMonth(null)}
                            className="px-3 py-1.5 text-sm rounded-full bg-slate-100 text-[#64748B] hover:bg-slate-200"
                            whileTap={{ scale: 0.97 }}
                          >
                            취소
                          </motion.button>
                          {lu >= costMonthly && (
                            <motion.button
                              type="button"
                              onClick={() => confirmUnlockMonth && unlockMonth(confirmUnlockMonth)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full"
                              style={{
                                backgroundColor: MIDNIGHT_BLUE,
                                color: CHAMPAGNE_GOLD,
                                boxShadow: "0 0 0 1px rgba(253,230,138,0.25)",
                              }}
                              whileTap={{ scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                            >
                              <span className="inline-flex items-center text-[0.85em] leading-none" aria-hidden>{LU_ICON}</span>
                              <span>{costMonthly} 열람</span>
                            </motion.button>
                          )}
                          {lu >= costMemory && (
                            <motion.button
                              type="button"
                              onClick={() => confirmUnlockMonth && unlockMonthWithMemoryKey(confirmUnlockMonth)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border"
                              style={{
                                backgroundColor: "rgba(253,230,138,0.25)",
                                color: MIDNIGHT_BLUE,
                                borderColor: "rgba(253,230,138,0.6)",
                              }}
                              whileTap={{ scale: 0.96 }}
                              transition={{ duration: 0.15 }}
                            >
                              <span className="inline-flex items-center text-[0.85em] leading-none" aria-hidden>{LU_ICON}</span>
                              <span>{costMemory} 기억의 열쇠</span>
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {slots.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-white/80 border border-slate-200 shadow-sm">
              <p className="text-sm font-medium" style={{ color: MIDNIGHT_BLUE }}>아직 꽂힌 기록집이 없어요.</p>
              <p className="text-xs mt-2" style={{ color: "#64748B" }}>일기를 쓰고 한 달이 지나면 여기에 한 권이 쌓여요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {slots.map((slot, idx) => {
                const isUnlocked = slot.state === "unlocked";
                const isInactive = slot.state === "inactive";
                const isUnlockPending = slot.state === "unlock_pending";
                const canUnlock = isUnlockPending && lu >= costMonthly;

                const monthOnly = slot.label.replace(/^\d+년\s*/, "");
                const statusMessage = slot.isCurrentMonth
                  ? "작성 중"
                  : isUnlockPending
                    ? { line1: `지난 ${monthOnly}의 궤적을 별지기가 모두 읽어냈습니다.`, line2: `별조각을 사용하여 ${nickname || "당신"}님을 돌아보세요.` }
                    : null;

                const recordText =
                  slot.recordCount > 0 ? `${slot.recordCount}일의 기록` : "기록 없음";

                return (
                  <motion.div
                    key={slot.yearMonth}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`transition-all duration-300 ${slot.isLocked ? "grayscale-[0.6]" : ""}`}
                    style={
                      isUnlocked
                        ? {
                            boxShadow: "0 0 24px rgba(253,230,138,0.4), 0 0 48px rgba(253,230,138,0.2), 0 8px 28px rgba(184,134,11,0.4), 0 14px 44px rgba(184,134,11,0.28)",
                            borderColor: "rgba(253,230,138,0.6)",
                          }
                        : {}
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isUnlocked) {
                          router.push(`/archive/${slot.yearMonth}`);
                        } else if (isUnlockPending) {
                          setConfirmUnlockMonth(slot.yearMonth);
                        }
                      }}
                      disabled={isInactive}
                      className={`w-full flex min-h-[100px] rounded-xl overflow-hidden shadow-sm text-left transition-all ${
                        isInactive ? "cursor-default opacity-90" : "hover:shadow-md cursor-pointer"
                      }`}
                      style={{
                        backgroundColor: isUnlocked ? "rgba(253,230,138,0.12)" : "#FFFFFF",
                        border: isUnlocked ? "1px solid rgba(253,230,138,0.5)" : "1px solid rgba(226,232,240,0.8)",
                      }}
                    >
                      <div
                        className="w-[10%] min-w-[28px] flex items-center justify-center shrink-0 py-2"
                        style={{
                          backgroundColor: isUnlocked ? "rgba(184,134,11,0.8)" : MIDNIGHT_BLUE,
                        }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={isUnlocked ? "unlock" : "lock"}
                            className="flex items-center justify-center"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          >
                            <Image
                              src={isUnlocked ? "/icons/icon-unlock.png" : "/icons/icon-lock.png"}
                              alt={isUnlocked ? "해금됨" : "잠김"}
                              width={LOCK_ICON_SIZE}
                              height={LOCK_ICON_SIZE}
                              className="object-contain"
                              style={{
                                filter: isUnlocked || canUnlock ? LOCK_GLOW_FILTER : "grayscale(1) brightness(0.9)",
                              }}
                            />
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      <div className="flex-1 flex flex-col justify-center p-4 relative min-w-0">
                        {slot.isLocked && (
                          <div
                            className="absolute inset-0 pointer-events-none rounded-r-xl"
                            style={{ backgroundColor: "rgba(15,23,42,0.06)" }}
                          />
                        )}
                        <div className="relative flex-1 flex flex-col justify-center">
                          <h2
                            className="text-sm font-bold mb-0.5"
                            style={{ color: isUnlocked ? "#92400E" : MIDNIGHT_BLUE }}
                          >
                            {slot.label} 기록집
                            <span className="font-normal text-[11px] ml-1.5" style={{ color: "#64748B" }}>
                              · {recordText}
                            </span>
                          </h2>
                          {slot.isCurrentMonth && (
                            <p className="text-xs mt-1" style={{ color: "#64748B" }}>
                              기록을 쌓는 중입니다...
                            </p>
                          )}
                          {statusMessage && !slot.isCurrentMonth && typeof statusMessage === "object" && (
                            <p className="text-xs mt-1 whitespace-pre-line" style={{ color: "#64748B" }}>
                              {statusMessage.line1}
                              {"\n"}
                              {statusMessage.line2}
                            </p>
                          )}
                          {!isInactive && (
                            <span
                              className="inline-block text-xs font-medium px-3 py-1.5 rounded-full w-fit mt-2"
                              style={{
                                backgroundColor: isUnlocked ? CHAMPAGNE_GOLD : canUnlock ? CHAMPAGNE_GOLD : "#94A3B8",
                                color: isUnlocked || canUnlock ? MIDNIGHT_BLUE : "#FFFFFF",
                                boxShadow: canUnlock ? "0 0 10px rgba(253,230,138,0.5), 0 0 20px rgba(253,230,138,0.25)" : undefined,
                              }}
                            >
                              {isUnlocked ? "열어보기" : `${LU_ICON} ${costMonthly} 해금`}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </main>

        <TabBar
          activeKey="bookshelf"
          onChange={(key: TabKey) => {
            if (key === "home") router.push("/");
            if (key === "journal") router.push("/diary");
            if (key === "constellation") router.push("/constellation");
          }}
        />
      </div>
    </div>
  );
}
