"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getCurrentConstellation } from "../../lib/atlas-storage";
import { getAppStorage } from "../../lib/app-storage";

const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const JOURNALS_KEY = "arisum-journals";

const NEBULA_BG = "#0A0E1A";

type ReportEntry = { keywords?: [string, string, string] };

function getReportByDate(): Record<string, ReportEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getJournalCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const parsed: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
    return Object.values(parsed).reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

/** 자아 동기화율: 전체 일기 수에 비례 0~100% (50편 = 100%) */
function getSyncRate(): number {
  const count = getJournalCount();
  return Math.min(100, Math.round((count / 50) * 100));
}

function getPrimaryConstellationName(): string {
  const cc = getCurrentConstellation();
  return cc?.name ?? "";
}

/** 최근 7일 날짜 키, 오래된 순 */
function getLast7DayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return keys;
}

function hasJournalForDate(dateKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const parsed: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
    const entries = parsed[dateKey];
    return Array.isArray(entries) && entries.length > 0;
  } catch {
    return false;
  }
}

function getKeywordForDate(dateKey: string, reports: Record<string, ReportEntry>): string {
  const report = reports[dateKey];
  const kw = report?.keywords;
  if (Array.isArray(kw) && kw[0]) return String(kw[0]).trim();
  return "";
}

/** 해당 날짜 일기 총 글자 수 (사유 깊이 → 반지름에 반영) */
function getJournalCharCountForDate(dateKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const parsed: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
    const entries = parsed[dateKey];
    if (!Array.isArray(entries)) return 0;
    return entries.reduce((sum: number, e: unknown): number => sum + (typeof (e as { content?: string })?.content === "string" ? (e as { content: string }).content.length : 0), 0);
  } catch {
    return 0;
  }
}

/** 별 파티클 위치 (고정 시드) */
function getParticlePositions(count: number): { x: number; y: number; size: number; delay: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i * 17 + 11) % 96 + 2,
    y: (i * 23 + 7) % 94 + 3,
    size: 1 + (i % 3) * 0.5,
    delay: (i % 6) * 0.2,
  }));
}

type OrbitingStar = { dateKey: string; angle: number; keyword: string; charCount: number };

type MyRoomProps = { keywords?: [string, string, string] | null };

export function MyRoom({ keywords: _keywordsProp }: MyRoomProps) {
  const [mounted, setMounted] = useState(false);
  const [reports, setReports] = useState<Record<string, ReportEntry>>({});
  const [syncRate, setSyncRate] = useState(0);
  const [constellationName, setConstellationName] = useState("");

  const refresh = () => {
    setReports(getReportByDate());
    setSyncRate(getSyncRate());
    setConstellationName(getPrimaryConstellationName());
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    refresh();
    window.addEventListener("report-updated", refresh);
    window.addEventListener("journal-updated", refresh);
    window.addEventListener("constellation-updated", refresh);
    return () => {
      window.removeEventListener("report-updated", refresh);
      window.removeEventListener("journal-updated", refresh);
      window.removeEventListener("constellation-updated", refresh);
    };
  }, [mounted]);

  const dayKeys = getLast7DayKeys();
  const orbitingStars: OrbitingStar[] = [];
  if (mounted) {
    dayKeys.forEach((dateKey, i) => {
      if (hasJournalForDate(dateKey)) {
        const angle = (i / 7) * 360;
        const keyword = getKeywordForDate(dateKey, reports);
        const charCount = getJournalCharCountForDate(dateKey);
        orbitingStars.push({ dateKey, angle, keyword: keyword || "·", charCount });
      }
    });
  }

  const particles = getParticlePositions(28);
  const ORBIT_RADIUS_MIN = 44;
  const ORBIT_RADIUS_MAX = 72;
  const charCounts = orbitingStars.map((s) => s.charCount);
  const minChar = charCounts.length > 0 ? Math.min(...charCounts) : 0;
  const maxChar = charCounts.length > 0 ? Math.max(...charCounts) : 1;
  const charRange = maxChar - minChar || 1;
  function radiusForStar(charCount: number): number {
    const t = (charCount - minChar) / charRange;
    return ORBIT_RADIUS_MAX - t * (ORBIT_RADIUS_MAX - ORBIT_RADIUS_MIN);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="relative overflow-hidden w-full min-h-[42vh] flex flex-col rounded-2xl"
      style={{
        background: NEBULA_BG,
        boxShadow: "0 8px 32px rgba(10, 14, 26, 0.4), 0 2px 8px rgba(10, 14, 26, 0.2)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Nebula radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 40%, rgba(100, 116, 139, 0.15) 0%, rgba(71, 85, 105, 0.06) 40%, transparent 70%)",
        }}
      />

      {/* Star particles */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
        {particles.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-amber-200/60"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              boxShadow: "0 0 4px rgba(253, 230, 138, 0.6)",
            }}
            animate={{ opacity: [0.15, 0.6, 0.15] }}
            transition={{
              duration: 2.5 + (i % 4) * 0.4,
              repeat: Infinity,
              delay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Orbit system: 남은 높이 채우며 최소 200px */}
      <div className="relative flex flex-1 items-center justify-center w-full min-h-[200px]">
        {/* Orbiting stars */}
        {orbitingStars.map((star, i) => {
          const duration = 24 + (i % 5) * 4;
          const r = radiusForStar(star.charCount);
          const rad = (star.angle * Math.PI) / 180;
          const starX = ORBIT_RADIUS_MAX + Math.cos(rad) * r - 4;
          const starY = ORBIT_RADIUS_MAX + Math.sin(rad) * r - 4;
          const boxSize = ORBIT_RADIUS_MAX * 2;
          return (
            <motion.div
              key={star.dateKey}
              className="absolute"
              style={{
                width: boxSize,
                height: boxSize,
                left: "50%",
                top: "50%",
                marginLeft: -ORBIT_RADIUS_MAX,
                marginTop: -ORBIT_RADIUS_MAX,
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <div
                className="absolute flex flex-col items-center"
                style={{
                  left: starX,
                  top: starY,
                  width: 8,
                  height: 8,
                }}
              >
                <div
                  className="absolute rounded-full bg-amber-300/90"
                  style={{
                    width: 6,
                    height: 6,
                    left: 1,
                    top: 1,
                    boxShadow: "0 0 8px rgba(253, 230, 138, 0.8)",
                  }}
                />
                <motion.span
                  className="absolute max-w-[72px] text-[9px] font-normal text-amber-200/90 -translate-x-1/2 -translate-y-full -top-1 left-1/2 text-center break-words"
                  style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
                  animate={{ rotate: -360 }}
                  transition={{
                    duration,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  {star.keyword}
                </motion.span>
              </div>
            </motion.div>
          );
        })}

        {/* Sun Star (The Core) */}
        <motion.div
          className="absolute z-10 rounded-full"
          style={{
            width: 20,
            height: 20,
            left: "50%",
            top: "50%",
            marginLeft: -10,
            marginTop: -10,
            background: "radial-gradient(circle, #FDE68A 0%, #F59E0B 50%, #D97706 100%)",
            boxShadow: "0 0 20px rgba(253, 230, 138, 0.9), 0 0 40px rgba(251, 191, 36, 0.5)",
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.95, 1, 0.95],
            boxShadow: [
              "0 0 20px rgba(253, 230, 138, 0.9), 0 0 40px rgba(251, 191, 36, 0.5)",
              "0 0 28px rgba(253, 230, 138, 1), 0 0 56px rgba(251, 191, 36, 0.7)",
              "0 0 20px rgba(253, 230, 138, 0.9), 0 0 40px rgba(251, 191, 36, 0.5)",
            ],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Info overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(10, 14, 26, 0.9) 0%, transparent 100%)",
        }}
      >
        <span
          className="text-[10px] text-slate-400/90"
          style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
        >
          자아 동기화율:{" "}
          <span
            className="text-amber-200/95 font-medium"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontVariantNumeric: "tabular-nums" }}
          >
            {syncRate}%
          </span>
        </span>
        <span
          className="text-[10px] text-amber-200/95 font-medium truncate max-w-[140px] text-right"
          style={{ fontFamily: "var(--font-a2z-r), sans-serif" }}
        >
          {constellationName || "—"}
        </span>
      </div>
    </motion.div>
  );
}
