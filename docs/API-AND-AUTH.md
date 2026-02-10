# API·로그인 설정 (APK/배포)

## 1. API 베이스 URL (폰/APK)

폰에서는 `localhost`에 API 서버가 없으므로, **배포된 API 서버 URL**을 환경 변수로 지정해야 합니다.

- **`.env.local`** (또는 빌드 시 사용하는 env)에 추가:
  ```env
  NEXT_PUBLIC_API_BASE_URL=https://star-bookmark.netlify.app
  ```
- 값을 비우거나 넣지 않으면 앱은 **상대 경로**(`/api/...`)로 요청합니다 (같은 호스트 기준).
- APK 빌드 시 이 값을 넣어 두면, 모든 `fetch(getApiUrl('/api/...'))` 호출이 위 주소로 갑니다.

**참고:** 이 프로젝트는 `output: "export"`로 정적 빌드하므로, API 라우트(`app/api/.../route.ts`)는 **별도 서버**(Netlify Functions, Node 서버 등)에서 실행해야 합니다. 그 서버 URL을 `NEXT_PUBLIC_API_BASE_URL`에 넣으면 됩니다.

### AI 분석이 전혀 동작하지 않을 때

1. **API가 실제로 호출되는 서버에 배포되어 있는지**
   - 정적 빌드(`output: "export"`)에서는 **같은 빌드에 API 라우트가 포함되지 않습니다.**
   - `NEXT_PUBLIC_API_BASE_URL`(예: `https://star-bookmark.netlify.app`)에 **API를 제공하는 서버**가 떠 있어야 합니다.
   - Netlify에 **정적 사이트만** 올려 두었다면 `/api/analyze` 요청은 **404**가 납니다.  
     → Netlify Functions로 API를 배포했는지, 또는 Next.js를 서버 모드로 배포했는지 확인하세요.

2. **API 서버 환경 변수에 `OPENAI_API_KEY`가 설정되어 있는지**
   - 분석 API(`/api/analyze`)는 서버에서 `process.env.OPENAI_API_KEY`를 사용합니다.
   - `.env.local`의 키는 **로컬에서만** 쓰입니다. Netlify(또는 실제 API가 돌아가는 곳) **대시보드 → Site settings → Environment variables**에 `OPENAI_API_KEY`를 넣어야 합니다.
   - 키가 없으면 API가 500을 반환하고, 본문에 `"OpenAI API 키가 설정되어 있지 않습니다."` 같은 메시지가 담깁니다.

3. **앱에서 에러 메시지 확인**
   - 분석 실패 시 화면에 안내 문구와 함께 **서버에서 내려준 에러 메시지**가 보이도록 되어 있습니다.  
     (예: "OpenAI API 키가 설정되어 있지 않습니다.")  
   - 네트워크 오류(연결 실패)면 API 서버 URL/네트워크를, 404면 API 배포 여부를, 500이면 서버 로그/환경 변수를 확인하면 됩니다.

---

## 2. 로그인 리다이렉트 (구글/카카오)

- **앱(Android/iOS)**에서는 `redirectTo`가 **`com.starbookmark.app://login-callback`**으로 설정됩니다.
- 로그인 후 브라우저에서 앱으로 돌아올 때 **Capacitor `App.addListener('appUrlOpen', ...)`**로 URL을 받아, 해시의 `access_token`/`refresh_token`으로 Supabase 세션을 복구합니다.

**Supabase 대시보드 설정:**

1. **Authentication → URL Configuration → Redirect URLs**에 다음을 추가:
   - `com.starbookmark.app://login-callback`
   - (웹 사용 시) `https://star-bookmark.netlify.app/auth/callback`

---

## 3. CORS (API 서버에서 실행 시)

`app/api/.../route.ts`를 **서버에서 실행할 때** Capacitor/로컬에서 오는 요청을 허용하려면 CORS 헤더가 필요합니다.

- **`lib/api-cors.ts`**의 `getCorsHeaders(request)`를 사용해 응답에 헤더를 붙입니다.
- 허용 origin: `capacitor://localhost`, `http://localhost`, `http://localhost:3000`, `http://127.0.0.1`, `*.netlify.app` 등.
- 이미 적용된 라우트 예: `analyze`, `transcribe`, `voice-dialogue`, `expand-to-diary`, `photo-to-diary`, `voice-to-diary`, `analyze-photo`.
- 나머지 라우트(`analyze-monthly`, `constellations`, `personality-profile`, `generate-question`, `generate-summary`)에도 동일하게 `getCorsHeaders`를 import하고, `OPTIONS` 핸들러와 각 `NextResponse.json(..., { headers })`에 `headers`를 넣으면 됩니다.

---

## 4. 계정 탈퇴 (delete-account API)

- **설정 → 계정 탈퇴** 시 `/api/delete-account`가 호출되며, Supabase Auth 사용자와 연동된 데이터(profiles, user_data는 `on delete cascade`로 함께 삭제)가 삭제됩니다.
- API 서버(Netlify 등) 환경 변수에 **`SUPABASE_SERVICE_ROLE_KEY`**를 설정해야 합니다. (Supabase 대시보드 → Settings → API → service_role key)
- 웹은 쿠키, APK/Capacitor는 `Authorization: Bearer <access_token>`으로 본인 확인 후 삭제합니다.

---

## 5. 별조각 차감 (원자적 동작)

- **일기 해금·재분석·인터뷰/사진/음성 일기 생성** 등: **API 호출이 성공한 뒤에만** 별조각을 차감합니다.
- API 실패 시 별조각은 차감되지 않으며, 사용자가 별조각만 잃는 상황은 발생하지 않습니다.
