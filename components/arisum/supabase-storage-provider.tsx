"use client";

import { useEffect, useRef } from "react";
import { createClient } from "../../lib/supabase/client";
import {
  getAll,
  migrateLocalStorageToSupabase,
  setItem as setUserDataItem,
  removeItem as removeUserDataItem,
} from "../../lib/supabase/user-data";
import { setAppStorage } from "../../lib/app-storage";
import { LU_BALANCE_UPDATED_EVENT } from "../../lib/lu-balance";

export function SupabaseStorageProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Record<string, string>>({});
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) {
        setAppStorage(null);
        return;
      }
      const userId = user.id;
      migrateLocalStorageToSupabase(supabase, userId)
        .then(() => getAll(supabase, userId))
        .then((all) => {
          cacheRef.current = { ...all };
          setAppStorage({
            getItem(key: string) {
              return cacheRef.current[key] ?? null;
            },
            setItem(key: string, value: string) {
              cacheRef.current[key] = value;
              setUserDataItem(supabase, userId, key, value).catch(() => {});
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
              removeUserDataItem(supabase, userId, key).catch(() => {});
            },
          });
        });
    });

    return () => {
      setAppStorage(null);
    };
  }, []);

  return <>{children}</>;
}
