"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TabBar, type TabKey } from "../../components/arisum/tab-bar";
import { getUserName } from "../../lib/home-greeting";
import { getGlobalAtlasData, getActiveConstellations, type ConnectionStyle, type ActiveConstellation } from "../../lib/atlas-storage";
import type { MoodScores } from "../../lib/arisum-types";
import { MOOD_SCORE_KEYS } from "../../lib/arisum-types";
import { getAppStorage } from "../../lib/app-storage";

const SCORES_HISTORY_KEY = "arisum-scores-history";
const JOURNALS_KEY = "arisum-journals";
const IDENTITY_ARCHIVE_KEY = "user_identity_summary";
const NIGHT_BG = "#050810";
const NAVY_CARD = "rgba(15,23,42,0.75)";
const CHAMPAGNE_GOLD = "#FDE68A";
const SILVER_WHITE = "#E2E8F0";

type ConstellationStar = { id: string; date: string; x: number; y: number; size: number; keywords?: string[] };
type ConstellationGroup = { id: string; name: string; summary: string; starIds: string[]; confirmed?: boolean };
type ConstellationConnection = { from: string; to: string };
type TraitCardPlaceholder = {
  category: string;
  label: string;
  unlocked: boolean;
  traitLabel: string;
  opening: string;
  body: string;
  closing: string;
  evidence: string;
};

/** 기존 별자리 매핑용 (중간 섹션) */
const LEGACY_CATEGORIES = [
  { id: "echo", keys: ["selfAwareness", "openness"] as (keyof MoodScores)[] },
  { id: "flame", keys: ["resilience"] as (keyof MoodScores)[] },
  { id: "galaxy", keys: ["empathy"] as (keyof MoodScores)[] },
  { id: "voyage", keys: ["selfDirection"] as (keyof MoodScores)[] },
  { id: "value", keys: ["meaningOrientation"] as (keyof MoodScores)[] },
  { id: "reconcile", keys: ["selfAcceptance"] as (keyof MoodScores)[] },
] as const;

/** 카테고리별 은하수 필터 색상 (파스텔, 미드나잇 블루와 조화) */
const CATEGORY_COLORS: Record<
  (typeof LEGACY_CATEGORIES)[number]["id"],
  { label: string; color: string; colorRgb: string }
> = {
  echo: { label: "사고방식", color: "#CCFBF1", colorRgb: "204,251,241" },
  flame: { label: "정서", color: "#FBCFE8", colorRgb: "251,207,232" },
  galaxy: { label: "관계", color: "#BAE6FD", colorRgb: "186,230,253" },
  voyage: { label: "일", color: "#E2E8F0", colorRgb: "226,232,240" },
  value: { label: "가치관", color: "#DDD6FE", colorRgb: "221,214,254" },
  reconcile: { label: "자아", color: "#FDE68A", colorRgb: "253,230,138" },
};

/** 한글 명사 뒤 주어 조사: 받침 있으면 '이', 없으면 '가' */
function getSubjectParticle(noun: string): string {
  if (!noun || typeof noun !== "string") return "가";
  const last = noun.charCodeAt(noun.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "가";
  return (last - 0xac00) % 28 !== 0 ? "이" : "가";
}

const GRADUATION_SHOWN_KEY = "arisum-constellation-graduation-shown";
const ARCHIVE_CANDIDATES_KEY = "arisum-constellation-archive-candidates";
const MIN_STARS_TO_GRADUATE = 3;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

function getJournalEntryCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = getAppStorage().getItem(JOURNALS_KEY);
    const journals: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};
    return Object.values(journals).reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

const REPORT_BY_DATE_KEY = "arisum-report-by-date";

function getReportByDate(): Record<string, { keywords?: [string, string, string] }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REPORT_BY_DATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getIdentityArchiveRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return getAppStorage().getItem(IDENTITY_ARCHIVE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getDateFromStarId(starId: string): string | null {
  const m = starId.match(/^star-(.+)$/);
  return m ? m[1] : null;
}

function getGraduationShownIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = getAppStorage().getItem(GRADUATION_SHOWN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function setGraduationShownId(id: string) {
  if (typeof window === "undefined") return;
  const set = getGraduationShownIds();
  set.add(id);
  getAppStorage().setItem(GRADUATION_SHOWN_KEY, JSON.stringify([...set]));
}

function getArchiveCandidates(): { id: string; name: string; summary: string; completedAt: string; starIds: string[] }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getAppStorage().getItem(ARCHIVE_CANDIDATES_KEY);
    return raw ? (JSON.parse(raw) as { id: string; name: string; summary: string; completedAt: string; starIds: string[] }[]) : [];
  } catch {
    return [];
  }
}

function addArchiveCandidate(c: ConstellationGroup) {
  if (typeof window === "undefined") return;
  const dates = c.starIds.map(getDateFromStarId).filter(Boolean) as string[];
  const completedAt = dates.length > 0 ? dates.sort().reverse()[0]! : new Date().toISOString().slice(0, 10);
  const prev = getArchiveCandidates();
  if (prev.some((x) => x.id === c.id)) return;
  getAppStorage().setItem(
    ARCHIVE_CANDIDATES_KEY,
    JSON.stringify([...prev, { id: c.id, name: c.name, summary: c.summary, completedAt, starIds: c.starIds }])
  );
}

function getCategoryScore(scores: MoodScores, categoryKeys: (keyof MoodScores)[]): number {
  let sum = 0;
  let n = 0;
  for (const k of categoryKeys) {
    if (typeof scores[k] === "number") {
      sum += scores[k];
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

function assignCategory(
  constellation: ConstellationGroup,
  scoresHistory: Record<string, MoodScores>
): { categoryId: string; score: number } {
  const dates = constellation.starIds.map(getDateFromStarId).filter(Boolean) as string[];
  if (dates.length === 0) return { categoryId: LEGACY_CATEGORIES[0].id, score: 0 };
  let sum: Partial<MoodScores> = {};
  for (const d of dates) {
    const s = scoresHistory[d];
    if (!s) continue;
    for (const k of Object.keys(s) as (keyof MoodScores)[]) {
      sum[k] = (sum[k] ?? 0) + s[k];
    }
  }
  const n = dates.length;
  const avg: MoodScores = {
    selfAwareness: (sum.selfAwareness ?? 0) / n,
    resilience: (sum.resilience ?? 0) / n,
    empathy: (sum.empathy ?? 0) / n,
    selfDirection: (sum.selfDirection ?? 0) / n,
    meaningOrientation: (sum.meaningOrientation ?? 0) / n,
    openness: (sum.openness ?? 0) / n,
    selfAcceptance: (sum.selfAcceptance ?? 0) / n,
  };
  let best: { categoryId: (typeof LEGACY_CATEGORIES)[number]["id"]; score: number } = {
    categoryId: LEGACY_CATEGORIES[0].id,
    score: 0,
  };
  for (const cat of LEGACY_CATEGORIES) {
    const sc = getCategoryScore(avg, cat.keys);
    if (sc > best.score) best = { categoryId: cat.id, score: sc };
  }
  return best;
}

function getConstellationTotalScore(
  constellation: ConstellationGroup,
  scoresHistory: Record<string, MoodScores>
): number {
  const dates = constellation.starIds.map(getDateFromStarId).filter(Boolean) as string[];
  let total = 0;
  for (const d of dates) {
    const s = scoresHistory[d];
    if (!s) continue;
    total += (s.selfAwareness + s.resilience + s.empathy + s.selfDirection + s.meaningOrientation + s.openness + s.selfAcceptance) / 7;
  }
  return total + constellation.starIds.length * 5;
}

export default function ConstellationPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [data, setData] = useState<{
    stars: ConstellationStar[];
    constellations: ConstellationGroup[];
    connections: ConstellationConnection[];
  } | null>(null);
  const [activeConstellations, setActiveConstellationsState] = useState<ActiveConstellation[]>([]);
  const [selected, setSelected] = useState<ConstellationGroup | null>(null);
  const [graduationCandidate, setGraduationCandidate] = useState<ConstellationGroup | null>(null);
  const [traitPopupCard, setTraitPopupCard] = useState<TraitCardPlaceholder | null>(null);
  const [tooltipStarId, setTooltipStarId] = useState<string | null>(null);
  const [constellationDetailPopup, setConstellationDetailPopup] = useState<{
    name: string;
    meaning: string;
    keywords: string[];
    categoryLabel: string;
  } | null>(null);
  const [highlightedStarIds, setHighlightedStarIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNickname(getUserName());
  }, []);

  useEffect(() => {
    if (!tooltipStarId) return;
    const t = setTimeout(() => setTooltipStarId(null), 4000);
    return () => clearTimeout(t);
  }, [tooltipStarId]);

  const handleBackdropClick = () => setTooltipStarId(null);

  const loadFromAtlasStorage = () => {
    const atlas = getGlobalAtlasData();
    setData({
      stars: atlas.stars as ConstellationStar[],
      constellations: atlas.constellations as ConstellationGroup[],
      connections: atlas.connections,
    });
    setActiveConstellationsState(getActiveConstellations());
  };

  useEffect(() => {
    loadFromAtlasStorage();
  }, []);

  useEffect(() => {
    const onUpdate = () => loadFromAtlasStorage();
    window.addEventListener("report-updated", onUpdate);
    window.addEventListener("journal-updated", onUpdate);
    window.addEventListener("constellation-updated", onUpdate);
    return () => {
      window.removeEventListener("report-updated", onUpdate);
      window.removeEventListener("journal-updated", onUpdate);
      window.removeEventListener("constellation-updated", onUpdate);
    };
  }, []);

  const traitCards: TraitCardPlaceholder[] = [];
  const scoresHistory = useMemo(() => getAllScoresHistory(), [data]);

  const sevenDaysAgoForGraduate = useMemo(() => {
    const t = new Date().getTime() - SEVEN_DAYS_MS;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (!data || graduationCandidate) return;
    const shown = getGraduationShownIds();
    for (const c of data.constellations) {
      const recentCount = c.starIds.filter((id) => {
        const date = getDateFromStarId(id);
        return date && date >= sevenDaysAgoForGraduate;
      }).length;
      if (recentCount >= MIN_STARS_TO_GRADUATE && !shown.has(c.id)) {
        setGraduationCandidate(c);
        return;
      }
    }
  }, [data, sevenDaysAgoForGraduate, graduationCandidate]);

  const sevenDaysAgo = useMemo(() => {
    const t = new Date().getTime() - SEVEN_DAYS_MS;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const graduatedStarIds = useMemo(() => {
    if (!data) return new Set<string>();
    const shown = getGraduationShownIds();
    const ids = new Set<string>();
    for (const c of data.constellations) {
      if (!shown.has(c.id)) continue;
      const recentCount = c.starIds.filter((id) => {
        const date = getDateFromStarId(id);
        return date && date >= sevenDaysAgo;
      }).length;
      if (recentCount >= MIN_STARS_TO_GRADUATE) c.starIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [data, sevenDaysAgo]);

  /** 7일이 지나 궤도 밖으로 나간 별은 밤하늘에서 제거 (저장된 스냅샷만 표시, 나의 성격 누적에는 영향 없음) */
  const visibleStars = useMemo(() => {
    if (!data?.stars?.length) return [];
    return data.stars.filter((s) => s.date >= sevenDaysAgo && !graduatedStarIds.has(s.id));
  }, [data, sevenDaysAgo, graduatedStarIds]);
  const visibleStarIds = useMemo(() => new Set(visibleStars.map((s) => s.id)), [visibleStars]);

  const { skyStars, skyConnections } = useMemo(() => {
    const skyIdSet = new Set(visibleStars.map((s) => s.id));
    const skyConnectionsFiltered = (data?.connections ?? []).filter((c) => skyIdSet.has(c.from) && skyIdSet.has(c.to));
    return { skyStars: visibleStars, skyConnections: skyConnectionsFiltered };
  }, [visibleStars, data?.connections]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log(`Stars Rendered: ${skyStars.length}개`);
    }
  }, [skyStars]);

  const constellationsWithCategory = useMemo(() => {
    if (!data) return [];
    return data.constellations.map((c) => ({
      ...c,
      ...assignCategory(c, scoresHistory),
      totalScore: getConstellationTotalScore(c, scoresHistory),
    }));
  }, [data, scoresHistory]);

  /** 별 id → 카테고리(색상·라벨). 해당 별을 포함한 첫 별자리의 카테고리 사용 */
  const starToCategoryMap = useMemo(() => {
    const map = new Map<string, { categoryId: string; label: string; color: string; colorRgb: string }>();
    for (const c of constellationsWithCategory) {
      const info = CATEGORY_COLORS[c.categoryId as keyof typeof CATEGORY_COLORS];
      if (!info) continue;
      for (const sid of c.starIds) {
        if (!map.has(sid)) map.set(sid, { categoryId: c.categoryId, ...info });
      }
    }
    for (const ac of activeConstellations) {
      if (!ac.starIds?.length) continue;
      const virtual = { id: ac.id, name: "", summary: "", starIds: ac.starIds };
      const { categoryId } = assignCategory(virtual, scoresHistory);
      const info = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.reconcile;
      for (const sid of ac.starIds) {
        if (!map.has(sid)) map.set(sid, { categoryId, ...info });
      }
    }
    return map;
  }, [constellationsWithCategory, activeConstellations, scoresHistory]);

  /** 7대 지표 공간에서 centroid로부터의 거리 (정규화 0~100) */
  function metricDistance(scores: MoodScores, centroid: MoodScores): number {
    let sum = 0;
    for (const k of MOOD_SCORE_KEYS) {
      const a = scores[k] ?? 0;
      const b = centroid[k] ?? 0;
      sum += (a - b) ** 2;
    }
    return Math.sqrt(sum);
  }

  /** 별자리 내 별을 지표 유사도(기록의 닮음) 순으로 정렬한 id 배열 */
  function orderStarIdsBySimilarity(starIds: string[]): string[] {
    if (starIds.length <= 1) return starIds;
    const dates = starIds.map(getDateFromStarId).filter(Boolean) as string[];
    const metricsList = dates.map((d) => scoresHistory[d]).filter(Boolean) as MoodScores[];
    if (metricsList.length === 0) return starIds;
    const centroid: MoodScores = {
      selfAwareness: 0,
      resilience: 0,
      empathy: 0,
      selfDirection: 0,
      meaningOrientation: 0,
      openness: 0,
      selfAcceptance: 0,
    };
    for (const m of metricsList) {
      for (const k of MOOD_SCORE_KEYS) centroid[k] += m[k] ?? 0;
    }
    const n = metricsList.length;
    for (const k of MOOD_SCORE_KEYS) centroid[k] = centroid[k] / n;
    const withDist = starIds.map((id) => {
      const date = getDateFromStarId(id);
      const m = date ? scoresHistory[date] : null;
      const dist = m ? metricDistance(m, centroid) : 999;
      return { id, dist };
    });
    withDist.sort((a, b) => a.dist - b.dist);
    return withDist.map((x) => x.id);
  }

  /** 지표 유사도 기반 연결 경로 (별자리별, 카테고리 색상 + 직선/곡선). 활성 별자리 모두 포함 */
  const constellationPathsWithColor = useMemo(() => {
    const segments: { from: string; to: string; colorRgb: string; curved: boolean }[] = [];
    for (const c of constellationsWithCategory) {
      const ordered = orderStarIdsBySimilarity(c.starIds);
      const info = CATEGORY_COLORS[c.categoryId as keyof typeof CATEGORY_COLORS];
      const colorRgb = info?.colorRgb ?? "253,230,138";
      const curved = c.categoryId === "flame" || c.categoryId === "galaxy";
      for (let i = 0; i < ordered.length - 1; i++) {
        segments.push({ from: ordered[i]!, to: ordered[i + 1]!, colorRgb, curved });
      }
    }
    for (const ac of activeConstellations) {
      const visibleIds = (ac.starIds ?? []).filter((id) => visibleStarIds.has(id));
      if (visibleIds.length < 2) continue;
      const ordered = orderStarIdsBySimilarity(visibleIds);
      const virtual = { id: ac.id, name: "", summary: "", starIds: visibleIds };
      const { categoryId } = assignCategory(virtual, scoresHistory);
      const info = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.reconcile;
      const style = ac.connectionStyle ?? "B";
      const curved = style === "B" || categoryId === "flame" || categoryId === "galaxy";
      for (let i = 0; i < ordered.length - 1; i++) {
        segments.push({ from: ordered[i]!, to: ordered[i + 1]!, colorRgb: info.colorRgb, curved });
      }
    }
    return segments;
  }, [constellationsWithCategory, activeConstellations, visibleStarIds, scoresHistory]);

  const topConstellations = useMemo(() => {
    const sorted = [...constellationsWithCategory].sort((a, b) => b.totalScore - a.totalScore);
    return sorted.slice(0, 7);
  }, [constellationsWithCategory]);

  const starMap = data ? new Map(data.stars.map((s) => [s.id, s])) : new Map<string, ConstellationStar>();
  const skyStarMap = new Map(skyStars.map((s) => [s.id, s]));
  const vb = { x: -8, y: -8, w: 116, h: 116 };
  const selectedStarIds = selected ? new Set(selected.starIds) : new Set<string>();

  /** 밤하늘에 표시할 별: 최근 7일 이내만 (스냅샷 즉시 표시, 분석 호출 없음) */
  const atlasStars = useMemo(() => {
    return visibleStars.map((s) => ({
      id: s.id,
      date: s.date,
      left: s.x,
      top: s.y,
      keywords: (s.keywords ?? []) as string[],
    }));
  }, [visibleStars]);

  /** Atlas 연결선: 최근 7일 이내 별끼리만 (궤도 밖 별 제외) */
  const atlasConnections = useMemo(() => {
    if (!data?.connections?.length || atlasStars.length === 0) return [];
    return data.connections.filter((c) => visibleStarIds.has(c.from) && visibleStarIds.has(c.to));
  }, [data?.connections, visibleStarIds, atlasStars.length]);

  /** 활성 별자리별 메타: centroid, connectionStyle, categoryRgb, radialSegments(C일 때), 이름 위치(겹치지 않도록 오프셋) */
  const activeConstellationsMeta = useMemo(() => {
    const list: Array<{
      constellation: ActiveConstellation;
      visibleStarIds: Set<string>;
      centroid: { x: number; y: number };
      connectionStyle: ConnectionStyle;
      categoryRgb: string;
      radialSegments: Array<{ cx: number; cy: number; x: number; y: number }>;
      namePosition: { x: number; y: number };
    }> = [];
    for (let idx = 0; idx < activeConstellations.length; idx++) {
      const ac = activeConstellations[idx]!;
      const visibleIds = (ac.starIds ?? []).filter((id) => visibleStarIds.has(id));
      if (visibleIds.length < 2) continue;
      const pts = atlasStars.filter((s) => visibleIds.includes(s.id));
      if (pts.length === 0) continue;
      const sumX = pts.reduce((a, p) => a + p.left, 0);
      const sumY = pts.reduce((a, p) => a + p.top, 0);
      const centroid = { x: sumX / pts.length, y: sumY / pts.length };
      const style = ac.connectionStyle ?? "B";
      const virtual = { id: ac.id, name: "", summary: "", starIds: visibleIds };
      const { categoryId } = assignCategory(virtual, scoresHistory);
      const info = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.reconcile;
      const radialSegments = style === "C" ? pts.map((s) => ({ cx: centroid.x, cy: centroid.y, x: s.left, y: s.top })) : [];
      const nameOffsetY = list.length * 6;
      const namePosition = { x: centroid.x, y: Math.max(10, Math.min(90, centroid.y + nameOffsetY)) };
      list.push({ constellation: ac, visibleStarIds: new Set(visibleIds), centroid, connectionStyle: style, categoryRgb: info.colorRgb, radialSegments, namePosition });
    }
    return list;
  }, [activeConstellations, visibleStarIds, atlasStars, scoresHistory]);

  const defaultConnectionStyle: ConnectionStyle = "B";
  const allRadialSegments = useMemo(() => activeConstellationsMeta.flatMap((m) => m.radialSegments), [activeConstellationsMeta]);

  function getConnectionPath(c: { from: string; to: string }, style: ConnectionStyle = "B") {
    const fromStar = atlasStars.find((s) => s.id === c.from);
    const toStar = atlasStars.find((s) => s.id === c.to);
    if (!fromStar || !toStar) return "";
    const x1 = fromStar.left;
    const y1 = fromStar.top;
    const x2 = toStar.left;
    const y2 = toStar.top;
    if (style === "A") {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    if (style === "B") {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = (y2 - y1) * 0.2;
      const dy = (x1 - x2) * 0.2;
      const cx = mx + dx;
      const cy = my + dy;
      return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: NIGHT_BG }}>
      <div className="h-12" />
      <header className="flex items-center justify-between px-6 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">밤하늘</h1>
          <p className="text-xs text-slate-400">생각 조각이 모여 별자리를 이룹니다.</p>
        </div>
      </header>

      <main className="flex-1 px-6 pb-24 overflow-y-auto space-y-6">
        {/* ─── [닉네임]님의 지금 ─── */}
        <section
          className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-sm"
          style={{ backgroundColor: NAVY_CARD }}
        >
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold" style={{ color: CHAMPAGNE_GOLD }}>
              {nickname || "당신"}님의 지금
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">최근 7일간 볼 수 있는 별자리입니다.</p>
          </div>
          <div
            className="relative h-[300px] overflow-hidden rounded-b-3xl"
            style={{ backgroundColor: "#0a0a0f" }}
            onClick={handleBackdropClick}
          >
            {/* 배경 미세 입자 (먼지/별가루) */}
            {Array.from({ length: 40 }, (_, i) => {
              const x = 5 + (i * 17 + (i % 7) * 11) % 90;
              const y = 5 + (i * 23 + (i % 5) * 13) % 90;
              const size = 1 + (i % 3) * 0.5;
              const delay = (i % 5) * 0.4;
              return (
                <motion.div
                  key={`dust-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: size,
                    height: size,
                    backgroundColor: "rgba(255,255,255,0.4)",
                    zIndex: 5,
                  }}
                  animate={{ opacity: [0.2, 0.6, 0.2] }}
                  transition={{
                    duration: 3 + (i % 4) * 0.5,
                    repeat: Infinity,
                    delay,
                  }}
                />
              );
            })}
            {atlasStars.length > 0 ? (
              <>
                {/* 연결선 (SVG, % 좌표) */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ zIndex: 40 }}
                >
                  <defs>
                    <filter id="atlasLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="0.8" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="constellationLightLine" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="1.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="centroidGlow" x="-80%" y="-80%" width="260%" height="260%">
                      <feGaussianBlur stdDeviation="3" result="glow" />
                      <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <linearGradient id="atlasLineFade" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(253,230,138,0)" />
                      <stop offset="30%" stopColor="rgba(253,230,138,0.35)" />
                      <stop offset="70%" stopColor="rgba(253,230,138,0.35)" />
                      <stop offset="100%" stopColor="rgba(253,230,138,0)" />
                    </linearGradient>
                  </defs>
                  {/* 1) 신규 연결: 가느다란 실선 (방사형은 radial, 아니면 atlasConnections) */}
                  <g>
                    {allRadialSegments.length > 0
                      ? allRadialSegments.map((seg, i) => (
                          <line
                            key={`radial-solid-${i}`}
                            x1={seg.cx}
                            y1={seg.cy}
                            x2={seg.x}
                            y2={seg.y}
                            stroke="rgba(253,230,138,0.55)"
                            strokeWidth={0.45}
                            strokeLinecap="round"
                          />
                        ))
                      : atlasConnections.map((c) => (
                          <path
                            key={`atlas-solid-${c.from}-${c.to}`}
                            d={getConnectionPath(c, defaultConnectionStyle)}
                            fill="none"
                            stroke="rgba(253,230,138,0.5)"
                            strokeWidth={0.45}
                            strokeLinecap="round"
                          />
                        ))}
                  </g>
                  {/* 2) 군집 연결: 카테고리 색 빛의 선 (방사형별 색 + path별 색) */}
                  <g filter="url(#constellationLightLine)">
                    {activeConstellationsMeta.map((meta, mi) =>
                      meta.connectionStyle === "C"
                        ? meta.radialSegments.map((seg, i) => (
                            <line
                              key={`radial-glow-${mi}-${i}`}
                              x1={seg.cx}
                              y1={seg.cy}
                              x2={seg.x}
                              y2={seg.y}
                              stroke={`rgba(${meta.categoryRgb},0.55)`}
                              strokeWidth={0.7}
                              strokeLinecap="round"
                            />
                          ))
                        : null
                    )}
                    {constellationPathsWithColor.map((seg, i) => {
                      const fromStar = atlasStars.find((s) => s.id === seg.from);
                      const toStar = atlasStars.find((s) => s.id === seg.to);
                      if (!fromStar || !toStar) return null;
                      const x1 = fromStar.left;
                      const y1 = fromStar.top;
                      const x2 = toStar.left;
                      const y2 = toStar.top;
                      const d = seg.curved
                        ? (() => {
                            const mx = (x1 + x2) / 2;
                            const my = (y1 + y2) / 2;
                            const dx = (y2 - y1) * 0.2;
                            const dy = (x1 - x2) * 0.2;
                            return `M ${x1} ${y1} Q ${mx + dx} ${my + dy} ${x2} ${y2}`;
                          })()
                        : `M ${x1} ${y1} L ${x2} ${y2}`;
                      return (
                        <path
                          key={`path-glow-${i}-${seg.from}-${seg.to}`}
                          d={d}
                          fill="none"
                          stroke={`rgba(${seg.colorRgb},0.55)`}
                          strokeWidth={0.7}
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </g>
                </svg>
                {/* 별자리 이름: 원형 배경 제거, 나눔스퀘어라운드 B 18px, 자간 0.05em, 검은색 그림자 */}
                {activeConstellationsMeta.map((meta) => (
                  <div
                    key={meta.constellation.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${meta.namePosition.x}%`,
                      top: `${meta.namePosition.y}%`,
                      transform: "translate(-50%, -50%)",
                      zIndex: 45,
                      fontFamily: "var(--font-nanum-square-round-b), sans-serif",
                      fontWeight: 700,
                      fontSize: 18,
                      letterSpacing: "0.05em",
                      color: "rgba(253,230,138,0.95)",
                      textShadow: "0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.constellation.name}
                  </div>
                ))}
                {atlasStars.map((star) => {
                  const showTooltip = tooltipStarId === star.id;
                  const isHighlighted = highlightedStarIds.has(star.id);
                  const categoryInfo = starToCategoryMap.get(star.id) ?? CATEGORY_COLORS.reconcile;
                  const glowRgb = categoryInfo.colorRgb ?? "253,230,138";
                  const handleStarClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    setTooltipStarId(tooltipStarId === star.id ? null : star.id);
                  };
                  return (
                    <motion.div
                      key={star.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      style={{
                        left: `${star.left}%`,
                        top: `${star.top}%`,
                        zIndex: 50,
                        pointerEvents: "auto",
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: isHighlighted ? 1 : [0.85, 1, 0.85],
                        scale: isHighlighted ? 1.15 : 1,
                      }}
                      transition={{
                        opacity: { duration: 2, repeat: isHighlighted ? 0 : Infinity },
                        scale: { duration: 0.3 },
                      }}
                      onClick={handleStarClick}
                    >
                      {/* 클릭 영역 30px 이상 (투명) */}
                      <div
                        className="absolute rounded-full min-w-[30px] min-h-[30px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2"
                        style={{ pointerEvents: "auto" }}
                        aria-hidden
                      />
                      {/* Layer 3: Twinkle (카테고리 색, 투명도 무작위 명멸) */}
                      <motion.div
                        className="absolute rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none blur-sm"
                        style={{
                          width: 14,
                          height: 14,
                          background: `radial-gradient(circle, rgba(${glowRgb},0.3) 0%, transparent 70%)`,
                        }}
                        animate={{ opacity: [0.35, 0.85, 0.35] }}
                        transition={{ duration: 2.2 + (star.id.length % 3) * 0.3, repeat: Infinity, repeatType: "reverse" }}
                      />
                      {/* Layer 2: Glow (카테고리별 은은한 빛무리) */}
                      <div
                        className="absolute rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 blur-sm pointer-events-none"
                        style={{
                          width: 12,
                          height: 12,
                          backgroundColor: `rgba(${glowRgb},0.45)`,
                          boxShadow: `0 0 10px rgba(${glowRgb},0.5)`,
                        }}
                      />
                      {/* Layer 1: Core (밝은 흰색 핵) */}
                      <div
                        className="relative rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{
                          width: 4,
                          height: 4,
                          backgroundColor: "#FFF",
                          boxShadow: `0 0 8px #FFF, 0 0 4px rgba(${glowRgb},0.6)`,
                        }}
                      />
                      <AnimatePresence>
                        {showTooltip && (
                          <motion.div
                            className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] text-white whitespace-nowrap"
                            style={{
                              backgroundColor: "rgba(0,0,0,0.85)",
                              boxShadow: `0 0 0 1px rgba(${glowRgb},0.6), 0 2px 8px rgba(0,0,0,0.3)`,
                              pointerEvents: "none",
                            }}
                            initial={{ opacity: 0, y: 4, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.9 }}
                            transition={{ duration: 0.15 }}
                          >
                            <div
                              className="absolute left-1/2 -translate-x-1/2 top-full border-[5px] border-transparent"
                              style={{ borderTopColor: "rgba(0,0,0,0.85)" }}
                            />
                            {(star.keywords?.length ?? 0) > 0
                              ? star.keywords!.slice(0, 3).join(" · ")
                              : "키워드 없음"}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </>
            ) : null}
            {atlasStars.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 px-4">
                일기를 쓰고 분석하면 별이 쌓여 여기에 그려집니다.
              </p>
            )}
          </div>
        </section>

        {/* ─── 지금 보이는 별자리 (카드 리스트, 탭 시 해당 별자리 강조 + 상세 팝업) ─── */}
        <section
          className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-sm"
          style={{ backgroundColor: NAVY_CARD }}
        >
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold" style={{ color: CHAMPAGNE_GOLD }}>
              지금 보이는 별자리
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">탭하면 해당 별자리의 설명을 볼 수 있어요.</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {activeConstellations.length > 0 ? (
              activeConstellations.map((ac) => {
                const starIds = ac.starIds ?? [];
                const isHighlighted = starIds.length > 0 && starIds.every((id) => highlightedStarIds.has(id));
                return (
                  <motion.button
                    key={ac.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`w-full text-left rounded-xl px-4 py-3 border transition-colors ${
                      isHighlighted ? "border-amber-200/60" : "border-amber-200/20 hover:border-amber-200/40"
                    }`}
                    style={{ backgroundColor: isHighlighted ? "rgba(253,230,138,0.15)" : "rgba(253,230,138,0.08)" }}
                    onClick={() => {
                      setHighlightedStarIds(new Set(starIds));
                      const keywords: string[] = [];
                      const seen = new Set<string>();
                      for (const id of starIds) {
                        const s = atlasStars.find((x) => x.id === id);
                        if (s?.keywords) for (const k of s.keywords) if (k && !seen.has(k)) { seen.add(k); keywords.push(k); }
                      }
                      const virtual = { id: ac.id, name: "", summary: "", starIds };
                      const { categoryId } = assignCategory(virtual, scoresHistory);
                      const categoryLabel = CATEGORY_COLORS[categoryId as keyof typeof CATEGORY_COLORS]?.label ?? "자아";
                      setConstellationDetailPopup({
                        name: ac.name,
                        meaning: ac.meaning,
                        keywords,
                        categoryLabel,
                      });
                    }}
                  >
                    <h3 className="text-sm font-semibold text-white shrink-0 flex items-center gap-1.5">
                      ✦ {ac.name}
                    </h3>
                  </motion.button>
                );
              })
            ) : (
              <p className="text-sm text-slate-400 py-5 text-center">일기를 쓰고 분석하면 여기에 지금 보이는 별자리가 나타납니다.</p>
            )}
          </div>
        </section>

        {/* 별자리 상세 팝업: 이름, 키워드, 의미 */}
        <AnimatePresence>
          {constellationDetailPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
              onClick={() => {
                setConstellationDetailPopup(null);
                setHighlightedStarIds(new Set());
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl border border-amber-200/30 p-5 shadow-2xl"
                style={{ backgroundColor: NAVY_CARD }}
              >
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                  ✦ {constellationDetailPopup.name}
                </h3>
                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  당신의 <span className="font-semibold" style={{ color: CHAMPAGNE_GOLD }}>{constellationDetailPopup.categoryLabel}</span>{getSubjectParticle(constellationDetailPopup.categoryLabel)} 별자리가 되어 반짝이고 있네요.
                </p>
                {constellationDetailPopup.keywords.length > 0 && (
                  <p className="text-[11px] text-slate-400 mb-2">포함된 키워드</p>
                )}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {constellationDetailPopup.keywords.slice(0, 9).map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: "rgba(253,230,138,0.2)", color: CHAMPAGNE_GOLD }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {constellationDetailPopup.meaning}
                </p>
                <p className="text-[10px] text-slate-500 mt-3">별지기가 분석한 이 별자리가 당신의 자아에서 갖는 의미예요.</p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl py-2.5 text-sm font-medium text-white"
                  style={{ backgroundColor: "rgba(253,230,138,0.25)", color: CHAMPAGNE_GOLD }}
                  onClick={() => {
                    setConstellationDetailPopup(null);
                    setHighlightedStarIds(new Set());
                  }}
                >
                  닫기
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── 6대 별자리 와이드 카드: 정서, 관계, 일, 사고방식, 자아, 가치관 ─── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: CHAMPAGNE_GOLD }}>
              나의 성격과 자아
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">별지기가 발견한 {nickname || "당신"}님의 자아</p>
          </div>

          <div className="space-y-3">
            {(traitCards.length > 0 ? traitCards : Array.from({ length: 6 }, (_, i) => ({ category: ["emotional", "interpersonal", "workStyle", "cognitive", "selfConcept", "values"][i]!, label: ["정서", "관계", "일", "사고방식", "자아", "가치관"][i]!, unlocked: false, traitLabel: "", opening: "", body: "", closing: "", evidence: "" }))).map((card) => (
              <motion.button
                key={card.category}
                type="button"
                onClick={() => card.unlocked && setTraitPopupCard(card)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full rounded-xl overflow-hidden text-left min-h-[80px] flex flex-col relative"
                style={{
                  backgroundColor: NAVY_CARD,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: card.unlocked ? "rgba(226,232,240,0.4)" : "rgba(226,232,240,0.15)",
                }}
              >
                {/* 카테고리 명칭: 왼쪽 상단 고정, 적절한 패딩 */}
                <div
                  className="absolute top-0 left-0 pt-3 pl-4 flex items-center gap-1 text-xs font-semibold z-20"
                  style={{
                    fontFamily: "var(--font-a2z-m), sans-serif",
                    color: card.unlocked ? CHAMPAGNE_GOLD : SILVER_WHITE,
                    textShadow: card.unlocked ? "0 0 8px rgba(253,230,138,0.5)" : "none",
                  }}
                >
                  <span className="opacity-100" style={{ fontSize: "10px" }} aria-hidden>✦</span>
                  <span>{card.label}</span>
                </div>

                {/* 중앙 콘텐츠 영역 */}
                <div
                  className="flex-1 flex items-center justify-center pt-8 pb-4 px-4"
                  style={{ opacity: card.unlocked ? 1 : 0.35 }}
                >
                  {card.unlocked ? (
                    <>
                      <span
                        className="relative z-10 text-sm font-medium"
                        style={{
                          color: CHAMPAGNE_GOLD,
                          textShadow: "0 0 12px rgba(253,230,138,0.6)",
                        }}
                      >
                        {card.traitLabel}
                      </span>
                      {/* 별무리 글로우 효과 */}
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <motion.div
                            key={i}
                            className="absolute rounded-full bg-amber-200/40"
                            style={{
                              width: 3,
                              height: 3,
                              left: `${15 + (i * 7) % 70}%`,
                              top: `${35 + (i * 8) % 50}%`,
                            }}
                            animate={{ opacity: [0.2, 0.7, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.15 }}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-slate-400">아직 별이 흐릿합니다...</span>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </section>
      </main>

      {/* 별자리 완성 축하 팝업 */}
      <AnimatePresence>
        {graduationCandidate && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-amber-200/40"
                  style={{
                    width: 4,
                    height: 4,
                    left: `${(i * 13) % 100}%`,
                    top: `${(i * 17) % 100}%`,
                  }}
                  animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>
            <motion.div
              className="relative z-10 rounded-3xl border border-amber-200/20 shadow-2xl p-6 max-w-sm w-full overflow-hidden bg-slate-900/95 backdrop-blur-md"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <motion.p
                className="text-[11px] text-amber-200/90 uppercase tracking-widest mb-3"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                새로운 별자리가 완성되었어요
              </motion.p>
              <motion.h2
                className="text-xl font-bold text-amber-100 mb-2 flex items-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                ✦ {graduationCandidate.name}
                {graduationCandidate.confirmed && (
                  <motion.span
                    className="inline-block"
                    style={{ color: CHAMPAGNE_GOLD, fontSize: 14 }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    ✦
                  </motion.span>
                )}
              </motion.h2>
              <motion.p
                className="text-sm text-slate-400 leading-relaxed mb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {graduationCandidate.summary}
              </motion.p>
              <motion.p
                className="text-[11px] text-slate-500 mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {(() => {
                  const dates = graduationCandidate.starIds.map(getDateFromStarId).filter(Boolean) as string[];
                  const latest = dates.length > 0 ? dates.sort().reverse()[0]! : "";
                  const [y, m, d] = latest.split("-");
                  return latest ? `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일 완성 · ${graduationCandidate.starIds.length}개의 별` : `${graduationCandidate.starIds.length}개의 별`;
                })()}
              </motion.p>
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={() => {
                    addArchiveCandidate(graduationCandidate);
                    setGraduationShownId(graduationCandidate.id);
                    setGraduationCandidate(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500/20 text-amber-100 text-sm font-medium hover:bg-amber-500/30 transition-colors border border-amber-200/30"
                  whileTap={{ scale: 0.98 }}
                >
                  기록하기
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => {
                    setGraduationShownId(graduationCandidate.id);
                    setGraduationCandidate(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-slate-300 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
                  whileTap={{ scale: 0.98 }}
                >
                  닫기
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 성격 지표 상세 팝업 */}
      <AnimatePresence>
        {traitPopupCard && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTraitPopupCard(null)}
          >
            <motion.div
              className="rounded-3xl border border-amber-200/20 shadow-2xl p-6 max-w-sm w-full overflow-hidden bg-slate-900/95 backdrop-blur-md"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: CHAMPAGNE_GOLD }}>
                {traitPopupCard.label}
              </p>
              <h3 className="text-lg font-semibold text-white mb-4">{traitPopupCard.traitLabel}</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">{traitPopupCard.opening}</p>
              <p className="text-sm text-slate-200 leading-relaxed mb-3">{traitPopupCard.body}</p>
              {traitPopupCard.evidence && (
                <p className="text-xs text-slate-400 italic mb-3 border-l-2 border-amber-200/30 pl-3">
                  {traitPopupCard.evidence}
                </p>
              )}
              <p className="text-sm font-medium" style={{ color: CHAMPAGNE_GOLD }}>{traitPopupCard.closing}</p>
              <button
                type="button"
                onClick={() => setTraitPopupCard(null)}
                className="mt-4 w-full py-2.5 rounded-xl bg-white/10 text-slate-200 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              className="rounded-3xl border border-white/10 shadow-2xl p-6 max-w-sm w-full overflow-hidden bg-slate-900/95 backdrop-blur-md"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
                ✦ {selected.name}
                {selected.confirmed && (
                  <motion.span
                    className="inline-block"
                    style={{ color: CHAMPAGNE_GOLD, fontSize: 12 }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    aria-label="확정된 기록"
                  >
                    ✦
                  </motion.span>
                )}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">{selected.summary}</p>
              <p className="text-[11px] text-slate-500 mt-2">{selected.starIds.length}개의 별로 이루어진 별자리</p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-4 w-full py-2.5 rounded-xl bg-white/10 text-slate-200 text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TabBar
        activeKey="constellation"
        onChange={(key: TabKey) => {
          if (key === "home") router.push("/");
          if (key === "journal") router.push("/diary");
          if (key === "bookshelf") router.push("/archive");
        }}
      />
    </div>
  );
}
