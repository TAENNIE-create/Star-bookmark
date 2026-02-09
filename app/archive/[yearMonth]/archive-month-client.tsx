"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, useInView } from "framer-motion";
import { TabBar, type TabKey } from "../../../components/arisum/tab-bar";
import type { MoodScores } from "../../../lib/arisum-types";
import { MOOD_SCORE_KEYS } from "../../../lib/arisum-types";
import { getUserName } from "../../../lib/home-greeting";
import { getUnlockedMonths } from "../../../lib/archive-unlock";
import { getApiUrl } from "../../../lib/api-client";
import { getAppStorage } from "../../../lib/app-storage";
import { LoadingOverlay } from "../../../components/arisum/loading-overlay";

const REPORT_BY_DATE_KEY = "arisum-report-by-date";
const JOURNALS_KEY = "arisum-journals";
const SCORES_HISTORY_KEY = "arisum-scores-history";
const MONTHLY_REPORT_KEY = "arisum-monthly-report";
const IDENTITY_ARCHIVE_KEY = "user_identity_summary";

const MIDNIGHT_BLUE = "#0F172A";
const SILVER_WHITE = "#E2E8F0";
const CHAMPAGNE_GOLD = "#FDE68A";
const ANTIQUE_GOLD = "#b8860b";
const ANTIQUE_GOLD_DARK = "#8B6914";

const SPECTRUM_CONFIG: { key: keyof MoodScores; label: string; low: string; high: string }[] = [
  { key: "resilience", label: "감정회복", low: "가라앉음", high: "다시 일어남" },
  { key: "selfAwareness", label: "사고방식", low: "생각", high: "행동" },
  { key: "empathy", label: "관계맺기", low: "혼자", high: "함께" },
  { key: "meaningOrientation", label: "가치기준", low: "이성", high: "감정" },
  { key: "openness", label: "도전정신", low: "익숙함", high: "새로움" },
  { key: "selfAcceptance", label: "자아수용", low: "자책", high: "이해" },
  { key: "selfDirection", label: "삶의동력", low: "통제", high: "순응" },
];

type MindMap = {
  dominantPersona: string;
  shadowConfession: string;
  defenseWall: string;
  stubbornRoots: string;
  personalityDiurnalRange: string;
  unconsciousLanguage: string;
  latentPotential: string;
};

type MonthlyReport = {
  monthlyTitle: string;
  prologue: string;
  terrainComment: string;
  /** 별지기의 해석 노트: 지표 간 모순/병행 포착 */
  interpretationNote?: string;
  modeAnalysis: MindMap;
  metricShift: Partial<MoodScores>;
  goldenSentences: { sentence: string; empathyComment: string }[];
  charmSentence: string;
  socialSelfSeed?: string;
};

function getReportByDate(): Record<string, { todayFlow?: string; gardenerWord?: string }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getJournals(): Record<string, { content: string }[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getScoresHistory(): Record<string, MoodScores> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(SCORES_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getStoredMonthlyReport(yearMonth: string): MonthlyReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = getAppStorage().getItem(`${MONTHLY_REPORT_KEY}-${yearMonth}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredMonthlyReport(yearMonth: string, report: MonthlyReport) {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(`${MONTHLY_REPORT_KEY}-${yearMonth}`, JSON.stringify(report));
}

/** 수평 궤적: 연한 골드 축, 속빈 별(시작) / 황금 별(끝), 진한 골드 연결선 */
function TrajectoryBar({
  low,
  high,
  startVal,
  endVal,
}: {
  low: string;
  high: string;
  startVal: number;
  endVal: number;
}) {
  const trackW = 140;
  const toPct = (v: number) => (v / 100) * 100;
  const startPct = toPct(startVal);
  const endPct = toPct(endVal);
  const left = Math.min(startPct, endPct);
  const width = Math.abs(endPct - startPct) || 2;
  const isRight = endVal >= startVal;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[14px]" style={{ color: "#ffffff" }}>
        <span>{low}</span>
        <span>{high}</span>
      </div>
      <div className="relative h-8 flex items-center">
        <div
          className="relative w-full max-w-[180px] mx-auto"
          style={{ width: trackW }}
        >
          {/* 수평축: 연한 골드 */}
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2" style={{ backgroundColor: "rgba(253,230,138,0.5)" }} />
          {/* 연결선: 진한 골드 */}
          {Math.abs(endVal - startVal) > 2 && (
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: `linear-gradient(${isRight ? "90deg" : "270deg"}, ${ANTIQUE_GOLD}, ${ANTIQUE_GOLD_DARK})`,
              }}
            />
          )}
          {/* 시작점: 속이 빈 별 ☆ */}
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-base"
            style={{ left: `${startPct}%`, color: CHAMPAGNE_GOLD, opacity: 0.9 }}
          >
            ☆
          </span>
          {/* 끝점: 빛나는 황금 별 ★ */}
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg"
            style={{ left: `${endPct}%`, color: CHAMPAGNE_GOLD, filter: "drop-shadow(0 0 4px rgba(253,230,138,0.8))" }}
          >
            ★
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.section
      ref={ref}
      initial="initial"
      animate={isInView ? "animate" : "initial"}
      variants={{
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export default function MonthlyReportPage() {
  const router = useRouter();
  const params = useParams();
  const yearMonth = params.yearMonth as string;

  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstScores, setFirstScores] = useState<MoodScores | null>(null);
  const [lastScores, setLastScores] = useState<MoodScores | null>(null);
  const [nickname, setNickname] = useState("");
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    setNickname(getUserName());
  }, []);

  useEffect(() => {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      router.replace("/archive");
      return;
    }

    const unlocked = getUnlockedMonths();
    if (!unlocked.has(yearMonth)) {
      router.replace("/archive");
      return;
    }

    const cached = getStoredMonthlyReport(yearMonth);
    if (cached) {
      setReport(migrateReport(cached));
      const reports = getReportByDate();
      const scoresHistory = getScoresHistory();
      const dates = Object.keys(reports)
        .filter((d) => d.startsWith(yearMonth))
        .sort();
      if (dates.length > 0) {
        setFirstScores(scoresHistory[dates[0]] ?? null);
        setLastScores(scoresHistory[dates[dates.length - 1]] ?? null);
      }
      setLoading(false);
      return;
    }

    const reports = getReportByDate();
    const journals = getJournals();
    const scoresHistory = getScoresHistory();
    const dates = Object.keys(reports)
      .filter((d) => d.startsWith(yearMonth))
      .sort();

    if (dates.length === 0) {
      setError("이 달에 분석된 일기가 없어요.");
      setLoading(false);
      return;
    }

    const diaries = dates
      .map((date) => {
        const entries = (journals[date] ?? []).map((e: { content?: string }) => e.content ?? "");
        const content = entries.join("\n\n");
        const r = reports[date];
        return {
          date,
          content,
          todayFlow: r?.todayFlow,
          gardenerWord: r?.gardenerWord,
        };
      })
      .filter((d) => d.content.trim());

    if (diaries.length === 0) {
      setError("이 달에 일기 내용이 없어요.");
      setLoading(false);
      return;
    }

    setFirstScores(scoresHistory[dates[0]] ?? null);
    setLastScores(scoresHistory[dates[dates.length - 1]] ?? null);

    const identity = getAppStorage().getItem(IDENTITY_ARCHIVE_KEY);

    fetch(getApiUrl("/api/analyze-monthly"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yearMonth,
        diaries,
        scoresHistory,
        user_identity_summary: identity || undefined,
        userName: getUserName() || undefined,
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("분석 실패"))))
      .then((data) => {
        const r: MonthlyReport = {
          monthlyTitle: data.monthlyTitle ?? "",
          prologue: data.prologue ?? "",
          terrainComment: data.terrainComment ?? "",
          modeAnalysis: data.modeAnalysis ?? {
            dominantPersona: "",
            shadowConfession: "",
            defenseWall: "",
            stubbornRoots: "",
            personalityDiurnalRange: "",
            unconsciousLanguage: "",
            latentPotential: "",
          },
          metricShift: data.metricShift ?? {},
          goldenSentences: (data.goldenSentences ?? []).map((g: { sentence?: string; empathyComment?: string; reason?: string }) => ({
            sentence: g.sentence ?? "",
            empathyComment: g.empathyComment ?? g.reason ?? "",
          })),
          charmSentence: data.charmSentence ?? data.socialSelfSeed ?? "",
        };
        setStoredMonthlyReport(yearMonth, r);
        setReport(r);
      })
      .catch(() => setError("월간 분석을 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, [yearMonth, router, refetchTrigger]);

  function migrateReport(cached: MonthlyReport): MonthlyReport {
    const old = cached as { socialSelfSeed?: string; terrainComment?: string; modeAnalysis?: { dominantMode?: string } };
    const mm = cached.modeAnalysis ?? ({} as MindMap);
    return {
      ...cached,
      charmSentence: (cached.charmSentence || old.socialSelfSeed) ?? "",
      terrainComment: (cached.terrainComment || old.terrainComment) ?? "",
      modeAnalysis: {
        dominantPersona: (mm.dominantPersona || (mm as { dominantMode?: string }).dominantMode) ?? "",
        shadowConfession: mm.shadowConfession ?? "",
        defenseWall: mm.defenseWall ?? "",
        stubbornRoots: mm.stubbornRoots ?? "",
        personalityDiurnalRange: mm.personalityDiurnalRange ?? "",
        unconsciousLanguage: mm.unconsciousLanguage ?? "",
        latentPotential: mm.latentPotential ?? "",
      },
      goldenSentences: (cached.goldenSentences ?? []).map((g) => ({
        sentence: g.sentence,
        empathyComment: (g as { empathyComment?: string; reason?: string }).empathyComment ?? (g as { reason?: string }).reason ?? "",
      })),
    };
  }

  const [y, m] = yearMonth?.split("-") ?? ["", ""];
  const monthLabel = y && m ? `${y}년 ${parseInt(m, 10)}월` : "";

  if (loading) {
    return <LoadingOverlay message="monthly-report" />;
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 arisum-vintage-page" style={{ backgroundColor: MIDNIGHT_BLUE }}>
        <p className="text-sm text-center" style={{ color: SILVER_WHITE }}>{error ?? "보고서를 불러올 수 없어요."}</p>
        <button
          type="button"
          onClick={() => router.push("/archive")}
          className="mt-4 px-4 py-2 rounded-full text-sm font-medium"
          style={{ backgroundColor: CHAMPAGNE_GOLD, color: MIDNIGHT_BLUE }}
        >
          기록함으로 돌아가기
        </button>
      </div>
    );
  }

  const defaultScores: MoodScores = {
    selfAwareness: 50,
    resilience: 50,
    empathy: 50,
    selfDirection: 50,
    meaningOrientation: 50,
    openness: 50,
    selfAcceptance: 50,
  };
  const first = firstScores ?? defaultScores;
  const last = lastScores ?? defaultScores;

  const mindItems = [
    { key: "dominantPersona", label: "이달의 대표 마음" },
    { key: "shadowConfession", label: "숨겨두었던 조각" },
    { key: "defenseWall", label: "마음을 지키는 법" },
    { key: "stubbornRoots", label: "흔들리지 않는 중심" },
    { key: "personalityDiurnalRange", label: "가장 많이 변한 곳" },
    { key: "unconsciousLanguage", label: "입버릇처럼 쓴 말" },
    { key: "latentPotential", label: "새로 돋아난 싹" },
  ] as const;

  return (
    <div className="min-h-screen arisum-vintage-page relative" style={{ backgroundColor: MIDNIGHT_BLUE, color: SILVER_WHITE }}>
      <div className="relative z-10 w-full max-w-md mx-auto px-6 py-8 pb-24">
        {/* 커버 */}
        <Section className="mb-16">
          <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: SILVER_WHITE, opacity: 0.8 }}>
            {monthLabel} · 월간 기록집
          </p>
          <h1 className="text-2xl font-bold font-a2z-m leading-tight mb-6" style={{ color: CHAMPAGNE_GOLD }}>{report.monthlyTitle}</h1>
          <p className="text-sm leading-relaxed font-a2z-r" style={{ color: SILVER_WHITE }}>{report.prologue}</p>
        </Section>

        {/* 자아 지형도 - 한 달의 시작점과 끝점 */}
        <Section className="mb-16">
          <h2 className="arisum-section-title text-lg mb-4">한 달의 시작점과 끝점</h2>
          <div className="space-y-5">
            {SPECTRUM_CONFIG.map(({ key, label, low, high }) => (
              <div key={key}>
                <p className="text-[14px] font-medium mb-1" style={{ color: CHAMPAGNE_GOLD, opacity: 0.9 }}>{label}</p>
                <TrajectoryBar
                  low={low}
                  high={high}
                  startVal={first[key] ?? 50}
                  endVal={last[key] ?? 50}
                />
              </div>
            ))}
          </div>
          {report.terrainComment && (
            <p className="mt-4 text-sm font-a2z-r leading-relaxed" style={{ color: SILVER_WHITE, opacity: 0.95 }}>
              {report.terrainComment}
            </p>
          )}
          <div className="flex gap-6 mt-3 text-[10px]" style={{ color: CHAMPAGNE_GOLD, opacity: 0.9 }}>
            <span className="flex items-center gap-1.5">
              <span className="text-sm">☆</span> 시작
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-sm">★</span> 끝
            </span>
          </div>
        </Section>

        {/* 별지기의 해석 노트 - 차트와 마음의 지도 사이 브릿지, 포스트잇/연구 노트 느낌 */}
        {report.interpretationNote && (
          <Section className="mb-16">
            <h2 className="arisum-section-title text-lg mb-4">별지기의 해석 노트</h2>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                backgroundColor: "rgba(254,252,232,0.92)",
                border: "1px solid rgba(253,230,138,0.6)",
                boxShadow: "0 2px 12px rgba(15,23,42,0.08), 0 0 0 1px rgba(253,230,138,0.25)",
              }}
            >
              <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none opacity-30" style={{ background: "radial-gradient(circle at top right, rgba(253,230,138,0.4) 0%, transparent 70%)" }} aria-hidden />
              <p
                className="text-sm font-a2z-r leading-relaxed whitespace-pre-line relative z-10"
                style={{ color: MIDNIGHT_BLUE, lineHeight: 1.85 }}
              >
                {report.interpretationNote}
              </p>
            </motion.div>
          </Section>
        )}

        {/* 마음의 지도 - 얇은 골드 테두리 반투명 네이비 카드 */}
        <Section className="mb-16">
          <h2 className="arisum-section-title text-lg mb-6">마음의 지도</h2>
          <div className="space-y-5">
            {mindItems.map(({ key, label }) => {
              const val = report.modeAnalysis?.[key];
              if (!val) return null;
              return (
                <div
                  key={key}
                  className="rounded-xl p-4"
                  style={{
                    border: "1px solid rgba(253,230,138,0.4)",
                    backgroundColor: "rgba(15,23,42,0.6)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: CHAMPAGNE_GOLD, opacity: 0.95 }}>
                    {label}
                  </p>
                  <p className="text-sm font-a2z-r leading-relaxed" style={{ color: SILVER_WHITE }}>{val}</p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* 별지기가 골라준 문장 - 홈 일기쓰기 버튼 스타일: 샴페인 골드 캡슐, 황금빛 아우라 */}
        <Section className="mb-16">
          <h2 className="arisum-section-title text-lg mb-6">별지기가 골라준 문장</h2>
          <div className="space-y-6">
            {report.goldenSentences.map((gs, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div
                  className="rounded-2xl px-5 py-4"
                  style={{
                    backgroundColor: CHAMPAGNE_GOLD,
                    color: MIDNIGHT_BLUE,
                    boxShadow: "0 0 24px rgba(253, 230, 138, 0.6), 0 0 48px rgba(253, 230, 138, 0.35), 0 2px 8px rgba(15, 23, 42, 0.12)",
                  }}
                >
                  <p className="text-sm font-a2z-r leading-relaxed" style={{ color: MIDNIGHT_BLUE }}>
                    "{gs.sentence}"
                  </p>
                </div>
                <p
                  className="text-xs font-a2z-r italic mt-2 pl-1"
                  style={{ color: SILVER_WHITE, opacity: 0.85 }}
                >
                  — {gs.empathyComment}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* 매력 섹션 - 하단 특별 강조, 별자리 문양 */}
        <Section className="mb-8">
          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ backgroundColor: "rgba(15,23,42,0.7)", border: "1px solid rgba(253,230,138,0.4)" }}>
            {/* 별자리 문양 배경 */}
            <div className="absolute inset-0 pointer-events-none opacity-20" aria-hidden>
              <span className="absolute top-3 left-4 text-amber-200/60" style={{ fontSize: 10 }}>✦</span>
              <span className="absolute top-6 right-6 text-amber-200/60" style={{ fontSize: 8 }}>☆</span>
              <span className="absolute bottom-4 left-8 text-amber-200/60" style={{ fontSize: 10 }}>★</span>
              <span className="absolute bottom-6 right-4 text-amber-200/60" style={{ fontSize: 8 }}>✦</span>
            </div>
            <h2 className="arisum-section-title text-lg mb-4 relative">
              세상이 발견할 {nickname || "당신"}님의 매력
            </h2>
            <p className="text-sm font-a2z-r leading-relaxed relative" style={{ color: SILVER_WHITE }}>{report.charmSentence}</p>
          </div>
        </Section>

        <button
          type="button"
          onClick={() => router.push("/archive")}
          className="w-full py-3 rounded-2xl text-sm font-medium"
          style={{ borderColor: "rgba(253,230,138,0.4)", color: SILVER_WHITE, backgroundColor: "transparent", borderWidth: 1 }}
        >
          기록함으로 돌아가기
        </button>
      </div>

      <TabBar
        activeKey="bookshelf"
        onChange={(key: TabKey) => {
          if (key === "home") router.push("/");
          if (key === "journal") router.push("/diary");
          if (key === "constellation") router.push("/constellation");
        }}
      />
    </div>
  );
}
