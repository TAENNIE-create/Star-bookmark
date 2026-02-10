# RevenueCat 연동 (Reflexio/Star-Bookmark)

Capacitor 네이티브(Android/iOS)에서 RevenueCat SDK로 구독·엔틀리먼트를 처리합니다.

## Google Play 연결만 하면 결제가 되나요?

**네.** 아래 조건을 맞추면 앱에서 “구매하기”/“구독하기” 버튼을 누를 때 Google Play 결제창이 뜨고, 결제 성공 시 별조각·멤버십이 Supabase에 반영됩니다.

### 체크리스트 (Google Play)

1. **Google Play Console**
   - 앱 등록 후 **수익 창출 설정** → **제품**에서 인앱 상품/구독 생성.
   - 상품 ID를 `lib/revenuecat-products.ts`와 **동일하게** 사용 (예: `shards_100`, `starter`, `membership_short_story`, `short_story` 등).
   - 테스트용 **라이선스 테스트** 계정 추가 권장.

2. **RevenueCat 대시보드**
   - **Project** → **Apps** → Android 앱 추가 (또는 기존 앱 선택).
   - **Google Play** 연결: 서비스 계정 JSON 업로드 또는 연동 완료.
   - **Products**에 위와 같은 Product ID 등록 후 Android 앱에 연결.
   - **Offerings**에 패키지 구성 (멤버십·별조각 팩).

3. **앱 측**
   - `NEXT_PUBLIC_REVENUECAT_API_KEY`에 RevenueCat **프로덕션** API 키 설정 (Android용).
   - 결제는 **로그인한 사용자만** 가능합니다. 비로그인 시 “로그인 후 구매할 수 있습니다” 메시지가 뜨며 결제창은 열리지 않습니다.
   - 로그인 시 RevenueCat `logIn(supabaseUserId)`로 연동되어, 구독이 계정에 묶입니다.

4. **결제 흐름**
   - 스토어 모달 → 구매하기/구독하기 → `Purchases.purchasePackage(pkg)` → Google 결제창 → 성공 시 `syncPurchaseAfterPayment`로 `profiles.lu_balance`·`membership_status` 및 `user_data` 갱신.

---

## 환경 변수

- **`NEXT_PUBLIC_REVENUECAT_API_KEY`**  
  - `.env.local`에 설정.  
  - 테스트: `test_qgqHYibgzqgygxWxLkTdQixPevh`  
  - 프로덕션 배포 시 RevenueCat 대시보드의 **프로덕션** API 키로 교체.

## 대시보드 설정

### 1. 엔틀리먼트

- **엔틀리먼트 ID**: `Reflexio/Star-Bookmark Pro`  
- 코드 상수: `lib/revenuecat.ts` → `PRO_ENTITLEMENT_ID`  
- 대시보드에서 만든 엔틀리먼트 식별자와 **완전히 동일**해야 합니다.

### 2. 상품 (Products)

RevenueCat 대시보드에서 아래 식별자로 상품을 등록하고, 스토어(App Store / Google Play)와 연결합니다.  
앱 내 매핑은 `lib/revenuecat-products.ts`에 정의되어 있습니다.

**별조각 팩 (소모성/일회성)**

| Product ID   | 설명        | 지급 별조각 |
|--------------|-------------|-------------|
| `shards_100` / `starter`  | 스타터 팩   | 100         |
| `shards_300` / `balance`  | 밸런스 팩  | 300         |
| `shards_700` / `supporter`| 서포터 팩  | 700         |

**멤버십 (구독)**

| Product ID                  | 설명 (샛별/금별/은하) | 등급       | 지급 별조각 |
|-----------------------------|------------------------|------------|-------------|
| `membership_short_story` / `short_story`  | 샛별 | SHORT_STORY | 100 |
| `membership_hardcover` / `hardcover`       | 금별 | HARDCOVER   | 300 |
| `membership_chronicle` / `chronicle`      | 은하 | CHRONICLE   | 500 |

### 3. 오퍼링 (Offerings)

- 대시보드에서 **Offering**을 만들고, 위 상품들을 **Package**로 묶습니다.
- Paywall 템플릿을 해당 Offering에 연결하면 `RevenueCatUI.presentPaywall()` 호출 시 그 Paywall이 표시됩니다.
- 기본(Current) Offering을 쓰면 옵션 없이 `presentPaywall()`만 호출하면 됩니다.

## 앱 내 동작

- **네이티브(Android/iOS)**  
  - 앱 시작 시 RevenueCat `configure` → `getCustomerInfo` 조회.  
  - **엔틀리먼트/구독 상태**: `customerInfo.activeSubscriptions`로 멤버십 등급을 계산해 `setMembershipTier()`로 로컬에 반영 → `getMembershipTier()` / 할인 등 혜택 적용.  
  - 스토어 모달: `getOfferings()`로 패키지 목록 로드 후, 멤버십·별조각 팩별로 **구매하기** 클릭 시 `Purchases.purchasePackage(pkg)`로 구글/애플 결제창 표시.  
  - **결제 성공 후**: `POST /api/sync-purchase` 호출 → Supabase `profiles` 테이블의 `lu_balance`, `membership_status` 업데이트 및 `user_data`(user_lu_balance, arisum-membership-tier) 동기화.  
  - Paywall·구독 관리(Customer Center)도 지원.
- **웹**: RevenueCat 미사용. 스토어 모달에서는 "정식 출시 후 이용 가능합니다" 안내만 표시됩니다.
- **결제 후 DB**: 로그인한 사용자만 동기화 가능. `profiles`에 `lu_balance`, `membership_status` 컬럼이 있어야 하며, 마이그레이션 `002_profiles_balance_membership.sql` 적용 필요.

## 코드 위치

- **설정·고객정보·Paywall 래퍼**: `lib/revenuecat.ts`
- **React 컨텍스트**: `components/arisum/revenuecat-provider.tsx`  
  - `useRevenueCat()`: `isAvailable`, `isPro`, `customerInfo`, `presentPaywall`, `presentCustomerCenter`, `restorePurchases` 등 제공
- **스토어 모달**: `components/arisum/store-modal.tsx`  
  - 멤버십 탭에서 "구독하기" → Paywall, "구독 관리" → Customer Center (네이티브만)

## 참고

- [RevenueCat Capacitor 설치](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [Paywall 표시](https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls)
- [Customer Center](https://www.revenuecat.com/docs/tools/customer-center)
