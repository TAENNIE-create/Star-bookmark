/**
 * RevenueCat 상품 ID ↔ 앱 내 상품(별조각 수량 / 멤버십 등급) 매핑.
 * 대시보드에 등록한 Product Identifier와 동일하게 사용.
 */

import type { MembershipTier } from "./economy";

/** 별조각 팩: RevenueCat product identifier → 구매 시 지급할 별조각 수 */
export const SHARD_PRODUCT_TO_AMOUNT: Record<string, number> = {
  shards_100: 100,
  shards_300: 300,
  shards_700: 700,
  // 대시보드에서 커스텀 ID 쓴 경우 여기 추가
  starter: 100,
  balance: 300,
  supporter: 700,
};

/** 멤버십 상품: RevenueCat product identifier → 등급 + 지급 별조각 */
export const MEMBERSHIP_PRODUCT_TO_TIER_AND_SHARDS: Record<
  string,
  { tier: MembershipTier; shards: number }
> = {
  membership_short_story: { tier: "SHORT_STORY", shards: 100 },
  membership_hardcover: { tier: "HARDCOVER", shards: 300 },
  membership_chronicle: { tier: "CHRONICLE", shards: 500 },
  // 대시보드 ID가 다르면 추가
  short_story: { tier: "SHORT_STORY", shards: 100 },
  hardcover: { tier: "HARDCOVER", shards: 300 },
  chronicle: { tier: "CHRONICLE", shards: 500 },
};

export function getShardsForProduct(productId: string): number {
  return SHARD_PRODUCT_TO_AMOUNT[productId] ?? 0;
}

export function getMembershipForProduct(productId: string): {
  tier: MembershipTier;
  shards: number;
} | null {
  return MEMBERSHIP_PRODUCT_TO_TIER_AND_SHARDS[productId] ?? null;
}

/** 별조각 전용 상품인지 */
export function isShardProduct(productId: string): boolean {
  return getShardsForProduct(productId) > 0;
}

/** 멤버십 전용 상품인지 */
export function isMembershipProduct(productId: string): boolean {
  return getMembershipForProduct(productId) != null;
}

/** 멤버십 등급 → RevenueCat product identifier (첫 번째 매칭) */
const TIER_TO_PRODUCT_ID: Record<string, string> = {};
for (const [id, { tier }] of Object.entries(MEMBERSHIP_PRODUCT_TO_TIER_AND_SHARDS)) {
  if (!TIER_TO_PRODUCT_ID[tier]) TIER_TO_PRODUCT_ID[tier] = id;
}
export function getProductIdForMembershipTier(tier: MembershipTier): string | null {
  return TIER_TO_PRODUCT_ID[tier] ?? null;
}
