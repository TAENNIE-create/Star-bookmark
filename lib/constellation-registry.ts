/**
 * 별자리 이름 영구 저장소 (Supabase 또는 localStorage)
 */

import { getAppStorage } from "./app-storage";

export type ConstellationRegistryEntry = {
  name: string;
  summary: string;
  starIds: string[];
};

const REGISTRY_KEY = "constellation_registry";

export type ConstellationRegistry = Record<string, ConstellationRegistryEntry>;

function getSignature(starIds: string[]): string {
  return starIds.slice().sort().join("|");
}

export function getConstellationRegistry(): ConstellationRegistry {
  if (typeof window === "undefined") return {};
  try {
    const raw = getAppStorage().getItem(REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConstellationRegistry;
    return typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedConstellation(
  starIds: string[],
  registry: ConstellationRegistry
): ConstellationRegistryEntry | null {
  const sig = getSignature(starIds);
  return registry[sig] ?? null;
}

export function setConstellationRegistryEntry(
  starIds: string[],
  entry: ConstellationRegistryEntry
): void {
  if (typeof window === "undefined") return;
  try {
    const registry = getConstellationRegistry();
    const sig = getSignature(starIds);
    registry[sig] = entry;
    getAppStorage().setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // ignore
  }
}
