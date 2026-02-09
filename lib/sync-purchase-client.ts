/**
 * 결제 성공 후 클라이언트에서 Supabase profiles + user_data 동기화.
 * (정적 export 환경에서는 API 라우트를 쓸 수 없어 클라이언트에서 직접 처리)
 */

import { createClient } from "./supabase/client";
import {
  getShardsForProduct,
  getMembershipForProduct,
  isShardProduct,
  isMembershipProduct,
} from "./revenuecat-products";
import { setItem } from "./supabase/user-data";

export type SyncPurchaseResult =
  | { ok: true; lu_balance: number; membership_status: string }
  | { ok: false; error: string };

export async function syncPurchaseAfterPayment(
  productIdentifier: string
): Promise<SyncPurchaseResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const userId = user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("lu_balance, membership_status")
    .eq("id", userId)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    return { ok: false, error: "프로필 조회 실패: " + profileError.message };
  }

  const currentBalance = Math.max(0, profile?.lu_balance ?? 30);
  const currentMembership = (profile?.membership_status as string) || "FREE";

  let newBalance = currentBalance;
  let newMembership = currentMembership;

  if (isShardProduct(productIdentifier)) {
    const add = getShardsForProduct(productIdentifier);
    if (add > 0) newBalance = currentBalance + add;
  } else if (isMembershipProduct(productIdentifier)) {
    const info = getMembershipForProduct(productIdentifier);
    if (info) {
      newMembership = info.tier;
      newBalance = currentBalance + info.shards;
    }
  } else {
    return { ok: false, error: "알 수 없는 상품 ID: " + productIdentifier };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      lu_balance: newBalance,
      membership_status: newMembership,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    return { ok: false, error: "프로필 업데이트 실패: " + updateError.message };
  }

  await setItem(supabase, userId, "user_lu_balance", String(newBalance));
  await setItem(supabase, userId, "arisum-membership-tier", newMembership);

  return { ok: true, lu_balance: newBalance, membership_status: newMembership };
}
