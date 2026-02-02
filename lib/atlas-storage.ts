/** 밤하늘(Atlas) 및 별자리 전역 데이터 저장소 (Supabase 또는 localStorage) */

import { getAppStorage } from "./app-storage";

export const GLOBAL_ATLAS_DATA_KEY = "global_atlas_data";
export const CURRENT_CONSTELLATION_KEY = "current_constellation";
export const CURRENT_ACTIVE_CONSTELLATIONS_KEY = "current_active_constellations";

export type AtlasStar = {
  id: string;
  date: string;
  x: number;
  y: number;
  size: number;
  keywords?: string[];
};

export type AtlasConnection = { from: string; to: string };

export type AtlasData = {
  stars: AtlasStar[];
  constellations: { id: string; name: string; summary: string; starIds: string[]; connectionStyle?: ConnectionStyle }[];
  connections: AtlasConnection[];
};

export type ConnectionStyle = "A" | "B" | "C";

export type ActiveConstellation = {
  id: string;
  name: string;
  meaning: string;
  connectionStyle?: ConnectionStyle;
  starIds?: string[];
};

/** @deprecated 단일 별자리. 하위 호환용. getActiveConstellations 사용 권장 */
export type CurrentConstellation = {
  name: string;
  meaning: string;
  connectionStyle?: ConnectionStyle;
  starIds?: string[];
};

export function getGlobalAtlasData(): AtlasData {
  if (typeof window === "undefined") {
    return { stars: [], constellations: [], connections: [] };
  }
  try {
    const raw = getAppStorage().getItem(GLOBAL_ATLAS_DATA_KEY);
    if (!raw) return { stars: [], constellations: [], connections: [] };
    const parsed = JSON.parse(raw) as Partial<AtlasData>;
    return {
      stars: Array.isArray(parsed.stars) ? parsed.stars : [],
      constellations: Array.isArray(parsed.constellations) ? parsed.constellations : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    };
  } catch {
    return { stars: [], constellations: [], connections: [] };
  }
}

export function setGlobalAtlasData(data: AtlasData) {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(GLOBAL_ATLAS_DATA_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("constellation-updated"));
}

/** 활성 별자리 배열 조회. 기존 current_constellation 있으면 1개 배열로 마이그레이션 */
export function getActiveConstellations(): ActiveConstellation[] {
  if (typeof window === "undefined") return [];
  try {
    const storage = getAppStorage();
    const raw = storage.getItem(CURRENT_ACTIVE_CONSTELLATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c: Partial<ActiveConstellation>) => ({
          id: typeof c.id === "string" ? c.id : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: String(c.name ?? "").slice(0, 40),
          meaning: String(c.meaning ?? "").slice(0, 120),
          connectionStyle: c.connectionStyle === "A" || c.connectionStyle === "B" || c.connectionStyle === "C" ? c.connectionStyle : undefined,
          starIds: Array.isArray(c.starIds) ? c.starIds : undefined,
        }));
      }
    }
    const legacy = storage.getItem(CURRENT_CONSTELLATION_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<CurrentConstellation>;
      if (parsed?.name) {
        const one: ActiveConstellation = {
          id: "current",
          name: parsed.name,
          meaning: parsed.meaning ?? "",
          connectionStyle: parsed.connectionStyle === "A" || parsed.connectionStyle === "B" || parsed.connectionStyle === "C" ? parsed.connectionStyle : undefined,
          starIds: Array.isArray(parsed.starIds) ? parsed.starIds : undefined,
        };
        setActiveConstellations([one]);
        return [one];
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function setActiveConstellations(data: ActiveConstellation[]) {
  if (typeof window === "undefined") return;
  getAppStorage().setItem(CURRENT_ACTIVE_CONSTELLATIONS_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("constellation-updated"));
}

/** @deprecated getActiveConstellations 사용 */
export function getCurrentConstellation(): CurrentConstellation | null {
  const list = getActiveConstellations();
  return list.length > 0 ? { name: list[0].name, meaning: list[0].meaning, connectionStyle: list[0].connectionStyle, starIds: list[0].starIds } : null;
}

/** @deprecated setActiveConstellations 사용 (단일이면 1개 배열로 저장) */
export function setCurrentConstellation(data: CurrentConstellation) {
  setActiveConstellations([{ id: "current", name: data.name, meaning: data.meaning, connectionStyle: data.connectionStyle, starIds: data.starIds }]);
}

/** 오늘 별 + 연결 정보를 atlas에 병합 */
export function mergeAtlasWithNewStar(
  dateKey: string,
  starPosition: { x: number; y: number },
  keywords: [string, string, string],
  starConnections: { from: string; to: string }[],
  contentLength?: number
) {
  const atlas = getGlobalAtlasData();
  const starId = `star-${dateKey}`;

  const sizeScale = contentLength ? Math.min(2, 1 + contentLength / 400) : 1;
  const baseSize = 3;
  const size = Math.max(4, Math.min(6, baseSize * sizeScale));

  const newStar: AtlasStar = {
    id: starId,
    date: dateKey,
    x: starPosition.x,
    y: starPosition.y,
    size,
    keywords: [...keywords],
  };

  const existingIds = new Set(atlas.stars.map((s) => s.id));
  const updatedStars = existingIds.has(starId)
    ? atlas.stars.map((s) => (s.id === starId ? newStar : s))
    : [...atlas.stars, newStar];

  const connSet = new Set(atlas.connections.map((c) => (c.from < c.to ? `${c.from}-${c.to}` : `${c.to}-${c.from}`)));
  for (const c of starConnections) {
    const key = c.from < c.to ? `${c.from}-${c.to}` : `${c.to}-${c.from}`;
    if (!connSet.has(key)) {
      connSet.add(key);
      atlas.connections.push(c);
    }
  }

  setGlobalAtlasData({
    ...atlas,
    stars: updatedStars,
    connections: atlas.connections,
  });
}

/**
 * 별 삭제 시 호출: 해당 별 ID를 stars/connections/constellations/currentConstellation에서 제거.
 * 별자리의 별이 2개 미만이 되면 해당 별자리 해체(부유하는 별로 복귀).
 */
export function removeStarFromAtlas(starId: string): void {
  if (typeof window === "undefined") return;
  const atlas = getGlobalAtlasData();

  const updatedStars = atlas.stars.filter((s) => s.id !== starId);
  const updatedConnections = atlas.connections.filter((c) => c.from !== starId && c.to !== starId);

  const updatedConstellations = atlas.constellations
    .map((c) => ({
      ...c,
      starIds: c.starIds.filter((id) => id !== starId),
    }))
    .filter((c) => c.starIds.length >= 2);

  setGlobalAtlasData({
    ...atlas,
    stars: updatedStars,
    connections: updatedConnections,
    constellations: updatedConstellations,
  });

  const list = getActiveConstellations();
  const updated = list
    .map((c) => ({ ...c, starIds: (c.starIds ?? []).filter((id) => id !== starId) }))
    .filter((c) => (c.starIds?.length ?? 0) >= 2);
  setActiveConstellations(updated);
}
