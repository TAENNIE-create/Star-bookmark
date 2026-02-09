"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import type { PurchasesOfferings, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import {
  isNativeRevenueCatAvailable,
  configureRevenueCat,
  getCustomerInfo,
  getOfferings as rcGetOfferings,
  purchasePackage as rcPurchasePackage,
  hasProEntitlement,
  invalidateCustomerInfoCache,
  addCustomerInfoUpdateListener,
  removeCustomerInfoUpdateListener,
  presentPaywall as rcPresentPaywall,
  presentPaywallIfNeeded as rcPresentPaywallIfNeeded,
  presentCustomerCenter as rcPresentCustomerCenter,
  restorePurchases as rcRestorePurchases,
} from "../../lib/revenuecat";
import { getMembershipForProduct } from "../../lib/revenuecat-products";
import { setMembershipTier } from "../../lib/economy";
import { getAppStorage } from "../../lib/app-storage";
import { LU_BALANCE_UPDATED_EVENT } from "../../lib/lu-balance";

type RevenueCatContextValue = {
  /** Capacitor 네이티브에서 RevenueCat 사용 가능 여부 */
  isAvailable: boolean;
  /** Pro 엔틀리먼트 활성 여부 */
  isPro: boolean;
  /** 현재 고객 정보 (네이티브가 아니거나 아직 로드 전이면 null) */
  customerInfo: CustomerInfo | null;
  /** 초기 설정 및 첫 조회 중 */
  loading: boolean;
  /** 설정/조회 실패 시 메시지 */
  error: string | null;
  /** 고객 정보 새로고침 (캐시 무효화 후 재조회) */
  refresh: () => Promise<void>;
  /** 오퍼링 목록 (스토어 상품/패키지) */
  getOfferings: () => Promise<PurchasesOfferings | null>;
  /** 패키지 구매 후 서버 동기화까지 수행 */
  purchasePackage: (pkg: PurchasesPackage) => Promise<void>;
  /** Paywall 표시 */
  presentPaywall: (options?: { displayCloseButton?: boolean }) => Promise<void>;
  /** Pro가 없을 때만 Paywall 표시 (복원 후 자동 닫기 등에 유리) */
  presentPaywallIfNeeded: (options?: {
    displayCloseButton?: boolean;
  }) => Promise<void>;
  /** 구독 관리(고객 센터) 표시 */
  presentCustomerCenter: () => Promise<void>;
  /** 구독 복원 */
  restorePurchases: () => Promise<CustomerInfo | null>;
};

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

/** customerInfo의 활성 구독 → 멤버십 등급으로 로컬에 반영 (앱 혜택 적용) */
function applyMembershipFromCustomerInfo(info: CustomerInfo | null) {
  if (!info?.activeSubscriptions?.length) {
    setMembershipTier("FREE");
    return;
  }
  const ids = info.activeSubscriptions;
  let tier: "FREE" | "SHORT_STORY" | "HARDCOVER" | "CHRONICLE" = "FREE";
  for (const productId of ids) {
    const m = getMembershipForProduct(productId);
    if (m) {
      if (m.tier === "CHRONICLE") tier = "CHRONICLE";
      else if (m.tier === "HARDCOVER" && tier !== "CHRONICLE") tier = "HARDCOVER";
      else if (m.tier === "SHORT_STORY" && tier === "FREE") tier = "SHORT_STORY";
    }
  }
  setMembershipTier(tier);
}

export function RevenueCatProvider({ children }: { children: React.ReactNode }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listenerId, setListenerId] = useState<string | null>(null);

  const isAvailable = isNativeRevenueCatAvailable();
  const isPro = hasProEntitlement(customerInfo);

  const refresh = useCallback(async () => {
    if (!isAvailable) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await invalidateCustomerInfoCache();
      const info = await getCustomerInfo();
      setCustomerInfo(info);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isAvailable]);

  useEffect(() => {
    if (!isAvailable) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        await configureRevenueCat();
        if (cancelled) return;
        const info = await getCustomerInfo();
        if (cancelled) return;
        setCustomerInfo(info);

        const id = await addCustomerInfoUpdateListener((info) => {
          if (!cancelled) {
            setCustomerInfo(info);
            applyMembershipFromCustomerInfo(info);
          }
        });
        if (cancelled) return;
        setListenerId(id ?? null);
        applyMembershipFromCustomerInfo(info);
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAvailable]);

  useEffect(() => {
    return () => {
      if (listenerId) {
        removeCustomerInfoUpdateListener(listenerId).catch(() => {});
      }
    };
  }, [listenerId]);

  const presentPaywall = useCallback(
    async (options?: { displayCloseButton?: boolean }) => {
      if (!isAvailable) return;
      try {
        await rcPresentPaywall(options);
        await refresh();
      } catch (e) {
        console.error("[RevenueCat] presentPaywall:", e);
        throw e;
      }
    },
    [isAvailable, refresh]
  );

  const presentPaywallIfNeeded = useCallback(
    async (options?: { displayCloseButton?: boolean }) => {
      if (!isAvailable) return;
      try {
        await rcPresentPaywallIfNeeded(options);
        await refresh();
      } catch (e) {
        console.error("[RevenueCat] presentPaywallIfNeeded:", e);
        throw e;
      }
    },
    [isAvailable, refresh]
  );

  const presentCustomerCenter = useCallback(async () => {
    if (!isAvailable) return;
    try {
      await rcPresentCustomerCenter();
      await refresh();
    } catch (e) {
      console.error("[RevenueCat] presentCustomerCenter:", e);
      throw e;
    }
  }, [isAvailable, refresh]);

  const restorePurchases = useCallback(async () => {
    if (!isAvailable) return null;
    try {
      const info = await rcRestorePurchases();
      setCustomerInfo(info);
      return info;
    } catch (e) {
      console.error("[RevenueCat] restorePurchases:", e);
      throw e;
    }
  }, [isAvailable]);

  const getOfferings = useCallback(async () => {
    if (!isAvailable) return null;
    return rcGetOfferings();
  }, [isAvailable]);

  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage) => {
      if (!isAvailable) return;
      const { customerInfo: info, productIdentifier } =
        await rcPurchasePackage(pkg);
      setCustomerInfo(info);

      const { syncPurchaseAfterPayment } = await import(
        "../../lib/sync-purchase-client"
      );
      const result = await syncPurchaseAfterPayment(productIdentifier);
      if (!result.ok) throw new Error(result.error);

      const storage = getAppStorage();
      storage.setItem("user_lu_balance", String(result.lu_balance));
      storage.setItem("arisum-membership-tier", result.membership_status);
      setMembershipTier(result.membership_status as "FREE" | "SHORT_STORY" | "HARDCOVER" | "CHRONICLE");
      window.dispatchEvent(new Event(LU_BALANCE_UPDATED_EVENT));
      window.dispatchEvent(new Event("membership-updated"));
    },
    [isAvailable]
  );

  const value = useMemo<RevenueCatContextValue>(
    () => ({
      isAvailable,
      isPro,
      customerInfo,
      loading,
      error,
      refresh,
      getOfferings,
      purchasePackage,
      presentPaywall,
      presentPaywallIfNeeded,
      presentCustomerCenter,
      restorePurchases,
    }),
    [
      isAvailable,
      isPro,
      customerInfo,
      loading,
      error,
      refresh,
      getOfferings,
      purchasePackage,
      presentPaywall,
      presentPaywallIfNeeded,
      presentCustomerCenter,
      restorePurchases,
    ]
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat(): RevenueCatContextValue {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) {
    return {
      isAvailable: false,
      isPro: false,
      customerInfo: null,
      loading: false,
      error: null,
      refresh: async () => {},
      getOfferings: async () => null,
      purchasePackage: async () => {},
      presentPaywall: async () => {},
      presentPaywallIfNeeded: async () => {},
      presentCustomerCenter: async () => {},
      restorePurchases: async () => null,
    };
  }
  return ctx;
}
