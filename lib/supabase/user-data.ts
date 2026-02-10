import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "user_data";

export async function getItem(
  supabase: SupabaseClient,
  userId: string,
  key: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  const v = data.value as Record<string, unknown> | string | null;
  if (v == null) return null;
  if (typeof v === "object" && "__raw" in v && typeof (v as { __raw: string }).__raw === "string")
    return (v as { __raw: string }).__raw;
  return JSON.stringify(v);
}

export async function setItem(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  value: string | object
): Promise<void> {
  const valueJson =
    typeof value === "string" ? ({ __raw: value } as object) : value;
  await supabase.from(TABLE).upsert(
    { user_id: userId, key, value: valueJson, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
}

export async function removeItem(
  supabase: SupabaseClient,
  userId: string,
  key: string
): Promise<void> {
  await supabase.from(TABLE).delete().eq("user_id", userId).eq("key", key);
}

/** 해당 사용자의 user_data 전체 로드 (key -> 원본 문자열) */
export async function getAll(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("key, value")
    .eq("user_id", userId);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    const v = row.value as Record<string, unknown> | string | null;
    if (v == null) continue;
    if (typeof v === "object" && "__raw" in v && typeof (v as { __raw: string }).__raw === "string")
      out[row.key] = (v as { __raw: string }).__raw;
    else out[row.key] = JSON.stringify(v);
  }
  return out;
}

/** localStorage에서 Supabase로 이사할 키 목록 */
export const MIGRATABLE_KEYS = [
  "arisum-onboarding",
  "arisum-report-by-date",
  "arisum-journals",
  "arisum-scores-history",
  "arisum-latest-scores",
  "user_identity_summary",
  "arisum-archive-unlocked",
  "global_atlas_data",
  "current_active_constellations",
  "current_constellation",
  "arisum-constellation-archive-candidates",
  "arisum-graduation-shown",
  "arisum-daily-quests-done",
  "arisum-today-quests",
  "arisum-daily-quests",
  "user_lu_balance",
  "arisum-daily-quest-lu-earned",
  "arisum-achievements",
  "arisum-latest-analysis",
  "arisum-quests",
  "arisum-personality-profile",
  "constellation_registry",
  "arisum-membership-tier",
] as const;

const KEY_PREFIX_QUESTS = "arisum-quests-";
const KEY_PREFIX_MONTHLY = "arisum-monthly-report-";

/** localStorage에 있는 마이그레이션 대상 키 전부 수집 (접두사 포함) */
export function getLocalStorageKeysToMigrate(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (MIGRATABLE_KEYS.includes(k as (typeof MIGRATABLE_KEYS)[number])) keys.push(k);
    else if (k.startsWith(KEY_PREFIX_QUESTS) || k.startsWith(KEY_PREFIX_MONTHLY)) keys.push(k);
  }
  return keys;
}

/** localStorage 데이터를 Supabase user_data로 업로드 후 로컬 삭제 */
export async function migrateLocalStorageToSupabase(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  if (typeof window === "undefined") return;
  const keys = getLocalStorageKeysToMigrate();
  if (keys.length === 0) return;
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = { __raw: raw };
    }
    await setItem(supabase, userId, key, value as object);
    window.localStorage.removeItem(key);
  }
}
