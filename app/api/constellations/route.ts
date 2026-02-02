import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { MoodScores } from "../../../lib/arisum-types";
import { DEFAULT_MOOD_SCORES } from "../../../lib/arisum-types";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ConstellationRegistryEntry = { name: string; summary: string; starIds: string[] };
type ConstellationRegistry = Record<string, ConstellationRegistryEntry>;

type ConstellationsRequest = {
  scoresHistory: Record<string, MoodScores>;
  journalContents?: Record<string, string>;
  user_identity_summary?: string | null;
  constellation_registry?: ConstellationRegistry;
};

function getRegistrySignature(starIds: string[]): string {
  return starIds.slice().sort().join("|");
}

export type ConstellationStar = {
  id: string;
  date: string;
  x: number;
  y: number;
  size: number;
  keywords?: string[];
};

export type ConstellationGroup = {
  id: string;
  name: string;
  summary: string;
  starIds: string[];
};

export type ConstellationConnection = {
  from: string;
  to: string;
};

/** viewBox 0~100 기준, 10%~90% 구간으로 안전하게 클램프 */
const VIEW_MIN = 10;
const VIEW_MAX = 90;
const VIEW_RANGE = VIEW_MAX - VIEW_MIN;

function clampToView(val: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 50;
  const pct = Math.max(0, Math.min(100, n));
  return VIEW_MIN + (pct / 100) * VIEW_RANGE;
}

/**
 * 7대 지표 → 2D 좌표 (데이터 기반). 10%~90% 구간 보장.
 * size: 2~4px 고정으로 가시성 확보.
 */
function metricsToPosition(s: MoodScores, contentLength?: number): { x: number; y: number; size: number } {
  const rawX = (s.selfAwareness + s.openness + s.meaningOrientation) / 3;
  const rawY = (s.selfAcceptance + s.resilience + s.empathy) / 3;
  const x = clampToView(rawX);
  const y = clampToView(rawY);
  const len = contentLength ?? 0;
  const sizeScale = Math.min(2, 1 + len / 400);
  const baseSize = 2 + (s.selfAcceptance + s.resilience) / 25;
  const size = Math.max(2, Math.min(4, baseSize * sizeScale));
  return { x, y, size };
}

/** 분석 없이 일기만 있을 때 날짜 문자열로 기본 좌표 생성 (분산 배치) */
function defaultPositionFromDate(date: string, contentLength?: number): { x: number; y: number; size: number } {
  const n = date.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const scores: MoodScores = {
    ...DEFAULT_MOOD_SCORES,
    selfAwareness: 40 + (n % 35),
    resilience: 45 + ((n * 7) % 30),
    empathy: 50 + ((n * 13) % 25),
    selfDirection: 40 + ((n * 11) % 35),
    meaningOrientation: 55 + ((n * 3) % 30),
    openness: 50 + ((n * 17) % 25),
    selfAcceptance: 45 + ((n * 19) % 30),
  };
  const { x, y, size } = metricsToPosition(scores, contentLength);
  return { x: clampToView(x), y: clampToView(y), size: Math.max(2, Math.min(4, size)) };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 연결 요소(별자리)로 묶기: 거리 임계값 이내면 같은 그룹 */
function clusterStars(
  stars: ConstellationStar[],
  threshold: number
): ConstellationStar[][] {
  const n = stars.length;
  const parent: number[] = stars.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) parent[pi] = pj;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (distance({ x: stars[i].x, y: stars[i].y }, { x: stars[j].x, y: stars[j].y }) < threshold) {
        union(i, j);
      }
    }
  }
  const groups = new Map<number, ConstellationStar[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(stars[i]);
  }
  return Array.from(groups.values());
}

/** 같은 별자리 내에서 가까운 별끼리 선으로 연결 (각 별당 최대 2개, 중복 없음) */
function buildConnections(
  stars: ConstellationStar[],
  groups: ConstellationStar[][]
): ConstellationConnection[] {
  const conn: ConstellationConnection[] = [];
  const added = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const starMap = new Map(stars.map((s) => [s.id, s]));
  for (const group of groups) {
    if (group.length < 2) continue;
    const ids = group.map((s) => s.id);
    for (let i = 0; i < ids.length; i++) {
      const fromStar = starMap.get(ids[i])!;
      const candidates: { id: string; d: number }[] = [];
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const toStar = starMap.get(ids[j])!;
        candidates.push({ id: ids[j], d: distance({ x: fromStar.x, y: fromStar.y }, { x: toStar.x, y: toStar.y }) });
      }
      candidates.sort((a, b) => a.d - b.d);
      for (const c of candidates.slice(0, 2)) {
        const k = key(ids[i], c.id);
        if (!added.has(k)) {
          added.add(k);
          conn.push({ from: ids[i], to: c.id });
        }
      }
    }
  }
  return conn;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ConstellationsRequest;
    const scoresHistory = body.scoresHistory ?? {};
    const journalContents = body.journalContents ?? {};
    const constellationRegistry = body.constellation_registry ?? {};
    let user_identity_summary = body.user_identity_summary?.trim() || null;
    if (user_identity_summary) {
      try {
        const parsed = JSON.parse(user_identity_summary);
        if (parsed?.summary) user_identity_summary = String(parsed.summary);
      } catch {
        // keep as-is
      }
    }

    const scoreDates = new Set(Object.keys(scoresHistory));
    const journalDates = new Set(Object.keys(journalContents));
    const allDates = [...new Set([...scoreDates, ...journalDates])].sort();

    if (allDates.length === 0) {
      return NextResponse.json({
        stars: [],
        constellations: [],
        connections: [],
      });
    }

    function forceVisibleCoord(val: number): number {
      const n = Number(val);
      if (!Number.isFinite(n) || n === 0) return 40 + Math.random() * 20;
      return clampToView(n);
    }

    const stars: ConstellationStar[] = allDates.map((date) => {
      const content = journalContents[date] ?? "";
      const contentLength = content.trim().length;
      const scores = scoresHistory[date];
      let { x, y, size } = scores ? metricsToPosition(scores, contentLength) : defaultPositionFromDate(date, contentLength);
      x = forceVisibleCoord(x);
      y = forceVisibleCoord(y);
      size = Math.max(4, Math.min(6, size * 1.5));
      return { id: `star-${date}`, date, x, y, size };
    });

    const CLUSTER_THRESHOLD = 28;
    const groups = clusterStars(stars, CLUSTER_THRESHOLD);
    let connections = buildConnections(stars, groups);
    let keywordsByDate: Record<string, string[]> = {};

    /** 공통 키워드/가치관으로 추가 연결 + 날짜별 키워드 추출 (툴팁용) */
    const keywordDates = Object.keys(journalContents).filter((d) => (journalContents[d] ?? "").trim().length > 20);
    if (keywordDates.length >= 1 && process.env.OPENAI_API_KEY) {
      try {
        const journalText = keywordDates
          .slice(0, 14)
          .map((d) => `${d}: ${(journalContents[d] ?? "").slice(0, 100)}`)
          .join("\n");
        const comp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "각 날짜별로 1~3개 키워드(또는 가치관)만 추출. JSON만 출력. 예: {\"2025-01-15\":[\"고독\",\"성장\"], \"2025-01-16\":[\"고독\",\"일상\"]}",
            },
            {
              role: "user",
              content: `다음 일기에서 날짜별 키워드를 추출:\n${journalText}\n\n날짜별 키워드 배열 JSON만 출력.`,
            },
          ],
          temperature: 0.3,
        });
        const raw = comp.choices[0]?.message?.content?.trim();
        if (raw) {
          const cleaned = raw.replace(/```json?/gi, "").replace(/```/g, "").trim();
          keywordsByDate = (JSON.parse(cleaned) as Record<string, string[]>) || {};
          if (keywordDates.length >= 2) {
            const addedConn = new Set(connections.map((c) => (c.from < c.to ? `${c.from}-${c.to}` : `${c.to}-${c.from}`)));
            const dateToStar = new Map(stars.map((s) => [s.date, s.id]));
            for (let i = 0; i < keywordDates.length; i++) {
              for (let j = i + 1; j < keywordDates.length; j++) {
                const d1 = keywordDates[i];
                const d2 = keywordDates[j];
                const kw1 = new Set((keywordsByDate[d1] ?? []).map((k) => k.trim().toLowerCase()));
                const kw2 = new Set((keywordsByDate[d2] ?? []).map((k) => k.trim().toLowerCase()));
                const overlap = [...kw1].some((k) => kw2.has(k));
                if (overlap) {
                  const id1 = dateToStar.get(d1);
                  const id2 = dateToStar.get(d2);
                  if (id1 && id2) {
                    const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
                    if (!addedConn.has(key)) {
                      addedConn.add(key);
                      connections = [...connections, { from: id1, to: id2 }];
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // keep spatial connections only
      }
    }

    const starsWithKeywords = stars.map((s) => ({
      ...s,
      keywords: keywordsByDate[s.date] ?? [],
    }));

    const constellations: ConstellationGroup[] = [];
    const apiKey = process.env.OPENAI_API_KEY;
    const identityHint = user_identity_summary ? `\n[사용자 성향 요약]\n${user_identity_summary.slice(0, 500)}` : "";

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const starIds = group.map((s) => s.id);
      const dates = group.map((s) => s.date).sort();
      const sig = getRegistrySignature(starIds);
      const cached = constellationRegistry[sig];

      let name = `별자리 ${g + 1}`;
      let summary = "이 날들의 마음이 하나의 패턴을 그립니다.";

      if (cached && cached.name && cached.summary) {
        name = cached.name;
        summary = cached.summary;
      } else {
        const journalSnippets = dates
          .map((d) => {
            const text = journalContents[d];
            return text ? `${d}: ${text.slice(0, 80)}…` : d;
          })
          .join("\n");

        if (apiKey && (journalSnippets.length > 0 || user_identity_summary)) {
          try {
            const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `당신은 사용자의 일기 별자리에 이름과 요약을 부여하는 원예사입니다. JSON만 출력하세요. 예: {"name": "정직한 고독의 별자리", "summary": "혼자 있을 때 가장 솔직해지려 했던 날들이에요."}`,
              },
              {
                role: "user",
                content: `다음 날짜들의 기록이 하나의 별자리를 이룹니다.\n날짜/일기 요약:\n${journalSnippets}${identityHint}\n\n이 별자리의 이름(예: 정직한 고독의 별자리, 용기 있는 방황의 별자리)과 기록의 요약 한 문장을 JSON으로만 출력. {"name": "...", "summary": "..."}`,
              },
            ],
            temperature: 0.7,
          });
          const content = completion.choices[0]?.message?.content?.trim();
          if (content) {
            const cleaned = content.replace(/```json?/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned) as { name?: string; summary?: string };
            if (parsed.name) name = String(parsed.name).slice(0, 40);
            if (parsed.summary) summary = String(parsed.summary).slice(0, 120);
          }
        } catch {
          // keep default name/summary
        }
        }
      }

      constellations.push({
        id: `const-${g}`,
        name,
        summary,
        starIds,
      });
    }

    return NextResponse.json({
      stars: starsWithKeywords,
      constellations,
      connections,
    });
  } catch (error) {
    console.error("[CONSTELLATIONS_ERROR]", error);
    return NextResponse.json(
      { error: "별자리를 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
