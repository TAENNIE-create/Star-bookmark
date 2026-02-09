/**
 * RevenueCat SDK 래퍼 (Capacitor 네이티브 전용).
 * 웹에서는 모든 API가 no-op 또는 기본값을 반환합니다.
 */

import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { RevenueCatUI } from "@revenuecat/purchases-capacitor-ui";
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

/** RevenueCat 대시보드에 등록한 Pro 엔틀리먼트 식별자 (대시보드와 동일해야 함) */
export const PRO_ENTITLEMENT_ID = "Reflexio/Star-Bookmark Pro";

const API_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_REVENUECAT_API_KEY ?? ""
    : "";

/** Capacitor 네이티브(Android/iOS)에서만 true */
export function isNativeRevenueCatAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const platform = Capacitor.getPlatform();
  return (platform === "android" || platform === "ios") && Boolean(API_KEY);
}

/** SDK 설정. 네이티브가 아니거나 API 키가 없으면 아무 작업도 하지 않음 */
export async function configureRevenueCat(appUserId?: string | null): Promise<void> {
  if (!isNativeRevenueCatAvailable()) return;
  try {
    await Purchases.configure({
      apiKey: API_KEY,
      appUserID: appUserId ?? undefined,
    });
  } catch (e) {
    console.error("[RevenueCat] configure failed:", e);
    throw e;
  }
}

/** 현재 고객 정보 조회 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNativeRevenueCatAvailable()) return null;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (e) {
    console.error("[RevenueCat] getCustomerInfo failed:", e);
    return null;
  }
}

/** Pro 엔틀리먼트 보유 여부 */
export function hasProEntitlement(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  const ent = customerInfo.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  return Boolean(ent?.isActive);
}

/** 구독 복원 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!isNativeRevenueCatAvailable()) return null;
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return customerInfo;
  } catch (e) {
    console.error("[RevenueCat] restorePurchases failed:", e);
    throw e;
  }
}

/** 캐시 무효화 후 최신 고객 정보 반영 시 유용 */
export async function invalidateCustomerInfoCache(): Promise<void> {
  if (!isNativeRevenueCatAvailable()) return;
  try {
    await Purchases.invalidateCustomerInfoCache();
  } catch (e) {
    console.error("[RevenueCat] invalidateCustomerInfoCache failed:", e);
  }
}

/** RevenueCat Paywall 표시 (네이티브만). 옵션으로 offering 전달 가능 */
export async function presentPaywall(options?: {
  displayCloseButton?: boolean;
}): Promise<{ result: string } | null> {
  if (!isNativeRevenueCatAvailable()) return null;
  try {
    const paywallResult = await RevenueCatUI.presentPaywall(options);
    return paywallResult;
  } catch (e) {
    console.error("[RevenueCat] presentPaywall failed:", e);
    throw e;
  }
}

/**
 * Pro 엔틀리먼트가 없을 때만 Paywall 표시.
 * 복원 후 자동으로 닫히는 동작이 필요할 때 권장.
 */
export async function presentPaywallIfNeeded(options?: {
  displayCloseButton?: boolean;
}): Promise<{ result: string } | null> {
  if (!isNativeRevenueCatAvailable()) return null;
  try {
    const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
      ...options,
    });
    return paywallResult;
  } catch (e) {
    console.error("[RevenueCat] presentPaywallIfNeeded failed:", e);
    throw e;
  }
}

/** 구독 관리(고객 센터) 화면 표시 */
export async function presentCustomerCenter(): Promise<void> {
  if (!isNativeRevenueCatAvailable()) return;
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.error("[RevenueCat] presentCustomerCenter failed:", e);
    throw e;
  }
}

/** CustomerInfo 업데이트 리스너 등록 (콜백 ID 반환, 제거 시 사용) */
export async function addCustomerInfoUpdateListener(
  listener: (info: CustomerInfo) => void
): Promise<string | null> {
  if (!isNativeRevenueCatAvailable()) return null;
  try {
    const id = await Purchases.addCustomerInfoUpdateListener(listener);
    return id ?? null;
  } catch (e) {
    console.error("[RevenueCat] addCustomerInfoUpdateListener failed:", e);
    return null;
  }
}

/** 리스너 제거 */
export async function removeCustomerInfoUpdateListener(
  listenerId: string
): Promise<boolean> {
  if (!isNativeRevenueCatAvailable()) return false;
  try {
    const { wasRemoved } = await Purchases.removeCustomerInfoUpdateListener({
      listenerToRemove: listenerId,
    });
    return wasRemoved;
  } catch (e) {
    console.error("[RevenueCat] removeCustomerInfoUpdateListener failed:", e);
    return false;
  }
}

/** 오퍼링 목록 조회 (스토어 상품·패키지 표시용) */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!isNativeRevenueCatAvailable()) return null;
  try {
    return await Purchases.getOfferings();
  } catch (e) {
    console.error("[RevenueCat] getOfferings failed:", e);
    return null;
  }
}

/** 패키지 구매 (구글/애플 결제창 표시). 성공 시 customerInfo 반환 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ customerInfo: CustomerInfo; productIdentifier: string }> {
  if (!isNativeRevenueCatAvailable()) {
    throw new Error("RevenueCat is not available on this platform");
  }
  try {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    return {
      customerInfo: result.customerInfo,
      productIdentifier: result.productIdentifier,
    };
  } catch (e) {
    console.error("[RevenueCat] purchasePackage failed:", e);
    throw e;
  }
}
