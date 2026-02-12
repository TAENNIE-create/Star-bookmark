"use client";

import { useEffect, useRef } from "react";
import { createClient } from "../../lib/supabase/client";
import {
  getAll,
  getLocalStorageKeysToMigrate,
  getProfileBalanceAndMembership,
  migrateLocalStorageToSupabase,
  setItem as setUserDataItem,
  removeItem as removeUserDataItem,
} from "../../lib/supabase/user-data";
import { setAppStorage, setStoredLoginFlag } from "../../lib/app-storage";
import { LU_BALANCE_UPDATED_EVENT } from "../../lib/lu-balance";
import { setMembershipTier } from "../../lib/economy";

export function SupabaseStorageProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Record<string, string>>({});
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const supabase = createClient();

    function initStorage(userId: string) {
      const hasLocal = typeof window !== "undefined" && getLocalStorageKeysToMigrate().length > 0;
      if (hasLocal) {
        window.dispatchEvent(new Event("arisum-migration-start"));
      }
      migrateLocalStorageToSupabase(supabase, userId)
        .then(() => getAll(supabase, userId))
        .then(async (all) => {
          cacheRef.current = { ...all };
          // 로그인 시 profiles(별조각·멤버십)를 기준으로 한 번 동기화 — 다른 기기 결제 반영 등 반영
          const profile = await getProfileBalanceAndMembership(supabase, userId);
          if (profile) {
            const balanceStr = String(profile.lu_balance);
            const tier = profile.membership_status as "FREE" | "SHORT_STORY" | "HARDCOVER" | "CHRONICLE";
            if (cacheRef.current["user_lu_balance"] !== balanceStr) {
              cacheRef.current["user_lu_balance"] = balanceStr;
              await setUserDataItem(supabase, userId, "user_lu_balance", balanceStr);
            }
            if (cacheRef.current["arisum-membership-tier"] !== tier) {
              cacheRef.current["arisum-membership-tier"] = tier;
              await setUserDataItem(supabase, userId, "arisum-membership-tier", tier);
              setMembershipTier(tier);
            }
          }
          setAppStorage({
            getItem(key: string) {
              return cacheRef.current[key] ?? null;
            },
            setItem(key: string, value: string) {
              cacheRef.current[key] = value;
              setUserDataItem(supabase, userId, key, value).then(({ error }) => {
                if (error) {
                  console.error("[Supabase] setItem failed:", key, error.message);
                }
              });
              if (key === "user_lu_balance") {
                window.dispatchEvent(new Event(LU_BALANCE_UPDATED_EVENT));
              }
              if (
                key === "arisum-report-by-date" ||
                key === "user_identity_summary" ||
                key === "arisum-journals"
              ) {
                window.dispatchEvent(new Event("report-updated"));
              }
              if (key === "global_atlas_data" || key === "current_active_constellations") {
                window.dispatchEvent(new Event("constellation-updated"));
              }
              if (key === "arisum-archive-unlocked") {
                window.dispatchEvent(new Event("lu-balance-updated"));
              }
            },
            removeItem(key: string) {
              delete cacheRef.current[key];
              removeUserDataItem(supabase, userId, key).then(({ error }) => {
                if (error) console.error("[Supabase] removeItem failed:", key, error.message);
              });
            },
          });
          if (profile && typeof window !== "undefined") {
            window.dispatchEvent(new Event(LU_BALANCE_UPDATED_EVENT));
          }
        })
        .catch((err) => {
          console.error("[Supabase] initStorage failed (getAll or migration):", err?.message ?? err);
          cacheRef.current = {};
          setAppStorage({
            getItem(key: string) {
              return cacheRef.current[key] ?? null;
            },
            setItem(key: string, value: string) {
              cacheRef.current[key] = value;
              setUserDataItem(supabase, userId, key, value).then(({ error }) => {
                if (error) console.error("[Supabase] setItem failed:", key, error.message);
              });
              if (key === "user_lu_balance") window.dispatchEvent(new Event(LU_BALANCE_UPDATED_EVENT));
              if (
                key === "arisum-report-by-date" ||
                key === "user_identity_summary" ||
                key === "arisum-journals"
              ) {
                window.dispatchEvent(new Event("report-updated"));
              }
              if (key === "global_atlas_data" || key === "current_active_constellations") {
                window.dispatchEvent(new Event("constellation-updated"));
              }
              if (key === "arisum-archive-unlocked") {
                window.dispatchEvent(new Event("lu-balance-updated"));
              }
            },
            removeItem(key: string) {
              delete cacheRef.current[key];
              removeUserDataItem(supabase, userId, key).then(({ error }) => {
                if (error) console.error("[Supabase] removeItem failed:", key, error.message);
              });
            },
          });
        })
        .finally(() => {
          if (hasLocal && typeof window !== "undefined") {
            window.dispatchEvent(new Event("arisum-migration-end"));
          }
        });
    }

    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) {
        setStoredLoginFlag(false);
        setAppStorage(null);
        return;
      }
      setStoredLoginFlag(true);
      initStorage(user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setStoredLoginFlag(false);
        setAppStorage(null);
        cacheRef.current = {};
        return;
      }
      setStoredLoginFlag(true);
      initStorage(session.user.id);
    });

    return () => {
      subscription.unsubscribe();
      setAppStorage(null);
    };
  }, []);

  return <>{children}</>;
}
