"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import type { MoodScores } from "../../lib/arisum-types";
import { MOOD_SCORE_KEYS } from "../../lib/arisum-types";
import { LU_ICON, LU_LABEL, SKY_WHITE, MIDNIGHT_BLUE, BORDER_LIGHT, MUTED } from "../../lib/theme";
import { getApiUrl } from "../../lib/api-client";
import { getAppStorage } from "../../lib/app-storage";

const SCORES_KEY = "arisum-latest-scores";
const SCORES_HISTORY_KEY = "arisum-scores-history";
const LU_KEY = "arisum-aria";
const ACHIEVEMENTS_KEY = "arisum-achievements";
const IDENTITY_ARCHIVE_KEY = "user_identity_summary";
const LATEST_ANALYSIS_KEY = "arisum-latest-analysis";
const JOURNALS_KEY = "arisum-journals";

const BG = SKY_WHITE;
const NIGHT_BG = "#0A0E1A";
const POINT_COLOR = "#0F172A";

type ScoreHistoryEntry = { date: string; scores: MoodScores };

/** 7축 스펙트럼: 0 = 왼쪽 극, 100 = 오른쪽 극 (해설용) */
const SPECTRUM_CONFIG: { key: keyof MoodScores; low: string; high: string }[] = [
  { key: "resilience", low: "깊은 침잠", high: "즉각적 복원" },
  { key: "selfAwareness", low: "실천적 발상", high: "관념적 탐구" },
  { key: "empathy", low: "독립적 경계", high: "공감적 연결" },
  { key: "meaningOrientation", low: "원칙과 논리", high: "가치와 감정" },
  { key: "openness", low: "안정과 질서", high: "확장과 모험" },
  { key: "selfAcceptance", low: "엄격한 질책", high: "너그러운 수용" },
  { key: "selfDirection", low: "외부의 순응", high: "내면의 통제" },
];

function getLast7DayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return keys.reverse();
}

function getScoresHistory(): ScoreHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getAppStorage().getItem(SCORES_HISTORY_KEY);
    const history: Record<string, MoodScores> = raw ? JSON.parse(raw) : {};
    return getLast7DayKeys()
      .map((date) => (history[date] ? { date, scores: history[date] } : null))
      .filter((e): e is ScoreHistoryEntry => e !== null);
  } catch {
    return [];
  }
}

function getAllScoresHistory(): Record<string, MoodScores> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(SCORES_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getJournalContentsForConstellations(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const journals: Record<string, { content: string }[]> = raw ? JSON.parse(raw) : {};
    const out: Record<string, string> = {};
    for (const [date, entries] of Object.entries(journals)) {
      if (entries?.length > 0) out[date] = entries[entries.length - 1].content ?? "";
    }
    return out;
  } catch {
    return {};
  }
}

function getStoredScores(): MoodScores | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = getAppStorage().getItem(SCORES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scores?: MoodScores };
    return parsed.scores ?? null;
  } catch {
    return null;
  }
}

function getStoredLu(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(LU_KEY);
    return raw ? Math.max(0, parseInt(raw, 10)) : 0;
  } catch {
    return 0;
  }
}

function setStoredLu(value: number) {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(LU_KEY, String(Math.max(0, value)));
}

function getStoredAchievements(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(ACHIEVEMENTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStoredAchievements(achieved: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(ACHIEVEMENTS_KEY, JSON.stringify(achieved));
}

function getIdentityArchive(): string {
  if (typeof window === "undefined") return "";
  try {
    return getAppStorage().getItem(IDENTITY_ARCHIVE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getLatestAnalysis(): { counselorLetter?: string; keywords?: string[] } {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(LATEST_ANALYSIS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 스펙트럼 해설 문장 생성 */
function getSpectrumCommentary(scores: MoodScores | null, history: ScoreHistoryEntry[]): string {
  if (!scores || history.length === 0) {
    return "일기를 쓰고 날짜를 선택하면 7대 지표의 위치 변화가 쌓여요.";
  }
  let maxKey: keyof MoodScores = MOOD_SCORE_KEYS[0];
  let maxVal = scores[maxKey];
  for (const k of MOOD_SCORE_KEYS) {
    if (scores[k] > maxVal) {
      maxVal = scores[k];
      maxKey = k;
    }
  }
  const config = SPECTRUM_CONFIG.find((c) => c.key === maxKey);
  if (!config) return "이번 주 당신의 정원이 조금씩 선명해지고 있어요.";
  const toward = maxVal >= 60 ? config.high : config.low;
  return `이번 주 당신의 기록은 [${toward}] 쪽으로 더 깊게 이어졌어요.`;
}

const CARD_CLASS =
  "rounded-3xl border border-[#E2E8F0] bg-white overflow-hidden shadow-[0_8px_32px_rgba(15,23,42,0.06)]";

/** [정원] The Chronicle – 7축 스펙트럼 차트 + 해설 */
function SectionGarden({
  history,
  latestScores,
  commentary,
}: {
  history: ScoreHistoryEntry[];
  latestScores: MoodScores | null;
  commentary: string;
}) {
  const hasData = latestScores && history.length > 0;

  // 7각형 레이더: 중심 (cx, cy), 반지름 r, 7개 꼭짓점
  const cx = 120;
  const cy = 120;
  const r = 80;
  const points = MOOD_SCORE_KEYS.map((_, i) => {
    const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });

  const valuePoints = latestScores
    ? MOOD_SCORE_KEYS.map((key, i) => {
        const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
        const val = (latestScores[key] ?? 50) / 100;
        const ri = r * val;
        return { x: cx + ri * Math.cos(angle), y: cy + ri * Math.sin(angle) };
      })
    : [];

  const radarPath =
    valuePoints.length === 7
      ? valuePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z"
      : "";

  // 위치 변화 선 그래프 (7일 × 7축 평균)
  const lineData = history.slice(-7);
  const w = 280;
  const h = 120;
  const pad = { t: 8, r: 8, b: 20, l: 8 };
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;
  const avg = (s: MoodScores) => MOOD_SCORE_KEYS.reduce((sum, k) => sum + s[k], 0) / 7;
  const linePoints = lineData.map((e, i) => ({
    x: pad.l + (i / Math.max(1, lineData.length - 1)) * chartW,
    y: pad.t + chartH - (avg(e.scores) / 100) * chartH,
  }));
  const lineD = linePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full"
    >
      <div className={`${CARD_CLASS} p-6`}>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-1">정원</h2>
        <p className="text-[11px] text-[#64748B] uppercase tracking-wider mb-4">The Chronicle</p>

        {!hasData ? (
          <p className="text-sm text-[#64748B] py-8 text-center">
            일기를 쓰고 달력에서 날짜를 선택하면 7대 지표의 위치가 쌓여요.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-6 items-center justify-center">
              <div className="flex-shrink-0">
                <svg width={240} height={240} viewBox="0 0 240 240" className="overflow-visible">
                  <defs>
                    <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={POINT_COLOR} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={POINT_COLOR} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  {points.map((p, i) => (
                    <line
                      key={i}
                      x1={cx}
                      y1={cy}
                      x2={p.x}
                      y2={p.y}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                    />
                  ))}
                  {[0.25, 0.5, 0.75, 1].map((scale) => (
                    <polygon
                      key={scale}
                      points={points.map((p) => `${cx + (p.x - cx) * scale},${cy + (p.y - cy) * scale}`).join(" ")}
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="1"
                    />
                  ))}
                  {radarPath && (
                    <motion.path
                      d={radarPath}
                      fill="url(#radarFill)"
                      stroke={POINT_COLOR}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.8 }}
                    />
                  )}
                </svg>
              </div>
              <div className="flex-1 min-w-0 w-full max-w-[280px]">
                <p className="text-xs text-[#64748B] mb-2">최근 7일 · 7축 평균 변화</p>
                <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
                  <motion.path
                    d={lineD}
                    fill="none"
                    stroke={POINT_COLOR}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </svg>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
              <p className="text-sm text-[#0F172A] leading-relaxed">{commentary}</p>
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
}

/** [시선] The Identity – 동기화율 + 나의 초상화 */
function SectionSight({
  syncRate,
  archiveText,
  counselorLetter,
  keywords,
}: {
  syncRate: number;
  archiveText: string;
  counselorLetter: string;
  keywords: string[];
}) {
  const coreValues = archiveText
    ? archiveText
        .replace(/\n+/g, " ")
        .split(/[.!?]\s+/)
        .filter((s) => s.trim().length > 10)
        .slice(0, 3)
    : [];
  const modes = keywords.length >= 3 ? keywords : [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full"
    >
      <div className={`${CARD_CLASS} p-6`}>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-1">시선</h2>
        <p className="text-[11px] text-[#64748B] uppercase tracking-wider mb-4">The Identity</p>

        {/* 자아 동기화율 */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[#64748B]">자아 동기화율</span>
            <span className="font-semibold text-[#0F172A]">{syncRate}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#0F172A]"
              initial={{ width: 0 }}
              animate={{ width: `${syncRate}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* 나의 초상화 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#0F172A]">나의 초상화</h3>

          {coreValues.length > 0 && (
            <div>
              <p className="text-[11px] text-[#64748B] mb-2">발견된 본질</p>
              <ul className="space-y-1.5">
                {coreValues.map((line, i) => (
                  <li key={i} className="text-sm text-[#0F172A] leading-relaxed flex items-start gap-2">
                    <span className="text-[#64748B]">·</span>
                    {line.trim()}.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {modes.length > 0 && (
            <div>
              <p className="text-[11px] text-[#64748B] mb-2">자주 출현하는 마음의 모드</p>
              <div className="flex flex-wrap gap-2">
                {modes.map((m, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-[#E2E8F0] px-2.5 py-0.5 text-xs text-[#0F172A]"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {archiveText && (
            <div className="pt-2 border-t border-[#E2E8F0]">
              <p className="text-[11px] text-[#64748B] mb-2">아카이브 요약</p>
              <p className="text-sm text-[#0F172A] leading-relaxed max-h-20 overflow-hidden text-ellipsis">{archiveText}</p>
            </div>
          )}

          {counselorLetter && (
            <div className="pt-2 border-t border-[#E2E8F0]">
              <p className="text-[11px] text-[#64748B] mb-2">AI 관찰 노트</p>
              <p className="text-sm text-[#0F172A] leading-relaxed italic">
                &ldquo;{counselorLetter.slice(0, 120)}
                {counselorLetter.length > 120 ? "…" : ""}&rdquo;
              </p>
            </div>
          )}

          {!archiveText && !counselorLetter && coreValues.length === 0 && (
            <p className="text-sm text-[#64748B]">일기를 더 쓸수록 여기가 채워져요.</p>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/** 별자리 API 응답 타입 */
type ConstellationStar = { id: string; date: string; x: number; y: number; size: number };
type ConstellationGroup = { id: string; name: string; summary: string; starIds: string[] };
type ConstellationConnection = { from: string; to: string };

/** [밤하늘] The Constellation – 7일 별자리 + 7대 지표 기반 + 클릭 시 이름/요약 */
function SectionConstellation({ lu }: { lu: number }) {
  const router = useRouter();
  const [data, setData] = useState<{
    stars: ConstellationStar[];
    constellations: ConstellationGroup[];
    connections: ConstellationConnection[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConstellationGroup | null>(null);

  useEffect(() => {
    const scoresHistory = getAllScoresHistory();
    const journalContents = getJournalContentsForConstellations();
    const archive = getIdentityArchive();

    if (Object.keys(scoresHistory).length === 0) {
      setData({ stars: [], constellations: [], connections: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(getApiUrl("/api/constellations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scoresHistory,
        journalContents,
        user_identity_summary: archive || undefined,
      }),
    })
      .then((res) => res.ok ? res.json() : { stars: [], constellations: [], connections: [] })
      .then((json) => {
        setData({
          stars: json.stars ?? [],
          constellations: json.constellations ?? [],
          connections: json.connections ?? [],
        });
      })
      .catch(() => setData({ stars: [], constellations: [], connections: [] }))
      .finally(() => setLoading(false));
  }, []);

  const starMap = data ? new Map(data.stars.map((s) => [s.id, s])) : new Map<string, ConstellationStar>();
  const vb = { x: -8, y: -8, w: 116, h: 116 };

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full"
    >
      <div
        className="relative rounded-3xl overflow-hidden border border-[#1a1f2e] shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
        style={{ backgroundColor: NIGHT_BG }}
      >
        {/* 반짝이는 별 입자들 */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl z-0">
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                width: 2,
                height: 2,
                left: `${(i * 7 + 3) % 100}%`,
                top: `${(i * 11 + 5) % 100}%`,
              }}
              animate={{ opacity: [0.2, 0.8, 0.2] }}
              transition={{
                duration: 2 + (i % 3) * 0.5,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 p-6">
          <h2 className="text-lg font-semibold text-[#E2E8F0] mb-1">밤하늘</h2>
          <p className="text-[11px] text-[#64748B] uppercase tracking-wider mb-4">The Constellation</p>

          {/* 별조각 수집 */}
          <div className="flex items-center justify-between mb-4 px-4 py-3 rounded-2xl bg-[#111827] border border-[#1a1f2e]">
            <div className="flex items-center gap-2">
              <span className="text-xl text-amber-200">{LU_ICON}</span>
              <span className="text-sm font-semibold text-[#E2E8F0]">별조각 수집</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[#E2E8F0]">{lu}</span>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-full bg-[#0F172A] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#1E293B] transition-colors"
              >
                보상 받기
              </button>
            </div>
          </div>

          {/* 별자리 SVG */}
          <div className="relative rounded-2xl bg-[#0d1220] border border-[#1a1f2e] min-h-[200px] flex items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <div className="h-6 w-6 rounded-full border-2 border-[#64748B] border-t-transparent animate-spin" />
                <span className="text-xs text-[#64748B]">별자리를 그리는 중...</span>
              </div>
            ) : data && data.stars.length > 0 ? (
              <svg
                viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                className="w-full max-h-[220px]"
                style={{ minHeight: 200 }}
              >
                <defs>
                  <linearGradient id="starGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#E2E8F0" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#64748B" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                {/* 선: 비슷한 별끼리 연결 */}
                <g>
                  {data.connections.map((c, i) => {
                    const from = starMap.get(c.from);
                    const to = starMap.get(c.to);
                    if (!from || !to) return null;
                    return (
                      <motion.line
                        key={`${c.from}-${c.to}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="url(#starGlow)"
                        strokeWidth="0.8"
                        strokeOpacity={0.6}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: i * 0.04 }}
                      />
                    );
                  })}
                </g>
                {/* 별: 7대 지표에 따른 위치·크기 */}
                {data.stars.map((s, i) => (
                  <motion.g key={s.id}>
                    <motion.circle
                      cx={s.x}
                      cy={s.y}
                      r={s.size}
                      fill="url(#starGlow)"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.3 + i * 0.03 }}
                    />
                    <motion.circle
                      cx={s.x}
                      cy={s.y}
                      r={s.size * 0.6}
                      fill="#E2E8F0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.9 }}
                      transition={{ duration: 0.3, delay: 0.5 + i * 0.03 }}
                    />
                  </motion.g>
                ))}
              </svg>
            ) : (
              <p className="text-sm text-[#64748B] py-8 text-center">
                일기를 쓰고 분석하면 여기에 별이 쌓여 별자리가 됩니다.
              </p>
            )}
          </div>

          {/* 별자리 카드 목록 – 클릭 시 확대·이름·요약 */}
          {data && data.constellations.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] text-[#64748B] mb-2">별자리를 눌러 보세요</p>
              {data.constellations.map((c) => (
                <motion.button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-[#111827] border border-[#1a1f2e] hover:border-[#64748B]/50 transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-sm font-medium text-[#E2E8F0]">✦ {c.name}</span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 클릭 시 확대 모달: 별자리 이름 + 기록 요약 */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="rounded-3xl border border-[#1a1f2e] shadow-2xl p-6 max-w-sm w-full overflow-hidden"
              style={{ backgroundColor: NIGHT_BG }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-[#E2E8F0] mb-2">✦ {selected.name}</h3>
              <p className="text-sm text-[#b8c4a8] leading-relaxed">{selected.summary}</p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-4 w-full py-2 rounded-xl bg-[#0F172A] text-white text-sm font-medium hover:bg-[#1E293B] transition-colors"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export default function InsightPage() {
  const router = useRouter();
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [latestScores, setLatestScores] = useState<MoodScores | null>(null);
  const [lu, setLu] = useState(0);
  const [archive, setArchive] = useState("");
  const [analysis, setAnalysis] = useState<{ counselorLetter?: string; keywords?: string[] }>({});

  const syncRate =
    latestScores
      ? Math.round(MOOD_SCORE_KEYS.reduce((s, k) => s + latestScores[k], 0) / 7)
      : 0;
  const commentary = getSpectrumCommentary(latestScores, history);

  useEffect(() => {
    setHistory(getScoresHistory());
    setLatestScores(getStoredScores());
    setLu(getStoredLu());
    setArchive(getIdentityArchive());
    setAnalysis(getLatestAnalysis());
  }, []);

  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: BG }}>
      <div className="w-full max-w-md min-h-screen flex flex-col">
        <div className="h-12" />
        <header className="flex items-center justify-between mb-4 px-6">
          <div>
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">인사이트</h1>
            <p className="text-xs text-[#64748B]">3단 아카이브</p>
          </div>
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-[#E2E8F0] flex items-center justify-center text-[#0F172A]"
          >
            ←
          </button>
        </header>

        <main className="flex-1 px-6 pb-24 overflow-y-auto space-y-6">
          <SectionGarden
            history={history}
            latestScores={latestScores}
            commentary={commentary}
          />
          <SectionSight
            syncRate={syncRate}
            archiveText={archive}
            counselorLetter={analysis.counselorLetter ?? ""}
            keywords={analysis.keywords ?? []}
          />
          <SectionConstellation lu={lu} />
        </main>

        <TabBar
          activeKey="home"
          onChange={(key: TabKey) => {
            if (key === "home") router.push("/");
            if (key === "journal") router.push("/diary");
            if (key === "bookshelf") router.push("/archive");
            if (key === "constellation") router.push("/constellation");
          }}
        />
      </div>
    </div>
  );
}
