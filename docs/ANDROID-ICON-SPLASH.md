# Android 아이콘/스플래시 적용 가이드 및 캐시 대응

아이콘·스플래시가 앱에 반영되지 않을 때 확인할 설정과 **완전 반영을 위한 클린 재현 루틴**입니다.

---

## 0. assets vs public/icons (둘 다 씀)

| 위치 | 용도 | 적용 방법 |
|------|------|-----------|
| **assets/** | **런처 아이콘**(홈 화면 앱 아이콘), **스플래시** | `assets/icon-only.png`, `assets/splash.png` 넣고 → `npm run refresh:android-assets` 또는 `npm run android:icons` |
| **public/icons/** | **앱 내부** 탭·버튼 아이콘 (홈, 일기, 기록함, 밤하늘, 자물쇠 등) | `public/icons/` 에 파일 넣고 → `npm run build` → `npx cap sync android` |

**icons에 이미지를 넣는 것** = 앱 **안**에서 보이는 탭/UI용이라 **public/icons/** 에 넣으면 됩니다.  
**홈 화면에 보이는 앱 아이콘**은 **assets/icon-only.png** 를 바꾼 뒤 `npm run android:icons` 로 적용하세요.  
자세한 파일 목록은 **assets/README.md** 를 보세요.

---

## 1. 목표 (런처 아이콘·스플래시)

- **아이콘**: `assets/icon-only.png` (1024×1024 권장) → 런처 아이콘으로 표시
- **스플래시**: `assets/splash.png` (2732×2732 권장) → 앱 실행 시 표시. **아이콘이 아니라 이 파일만 사용** (Android 11 이하는 전체 이미지, Android 12+는 배경색 + 시스템 아이콘)

---

## 2. 현재 설정 요약

| 항목 | 위치/값 |
|------|---------|
| 아이콘 소스 | `assets/icon-only.png` |
| 스플래시 소스 | `assets/splash.png` |
| 리소스 생성 | `npm run cap:assets` (= `npx capacitor-assets generate --android --assetPath assets`) |
| Manifest 앱 아이콘 | `android:icon="@mipmap/ic_launcher"`, `android:roundIcon="@mipmap/ic_launcher_round"` |
| 런처 Activity 테마 | `android:theme="@style/AppTheme.NoActionBarLaunch"` (MainActivity) |
| 스플래시 테마 | `values/styles.xml` → `AppTheme.NoActionBarLaunch` (Theme.SplashScreen, windowBackground=@drawable/splash, windowSplashScreenBackground, windowSplashScreenIconBackgroundColor, postSplashScreenTheme) |
| 스플래시 색 | `values/colors.xml` → `splash_background` = #0A0E1A |
| 스플래시 설치 | `MainActivity.onCreate` 에서 `SplashScreen.installSplashScreen(this)` 후 `super.onCreate()` |

---

## 3. 반영되는 리소스 (cap:assets 생성 결과)

- **아이콘**
  - `android/app/src/main/res/mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/`
    - `ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`, `ic_launcher_background.png`
  - `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` → foreground/background 참조
- **스플래시**
  - `drawable/splash.png`, `drawable-port-*/splash.png`, `drawable-land-*/splash.png`, `drawable-night*/splash.png`

위 파일들이 **모두** `assets/icon-only.png`와 `assets/splash.png` 기반으로 생성·덮어쓰기됩니다.

---

## 4. 아이콘/스플래시가 안 바뀔 때 – 클린 재현 루틴

캐시·이전 빌드 때문에 반영이 안 되는 경우 아래 순서로 진행하면 됩니다.

### 4.1 터미널 (프로젝트 루트 `c:\arisum`)

```bash
# 1) 런처 아이콘/스플래시 갱신 (리소스 재생성 + Gradle clean + cap sync 한 번에)
npm run android:icons
# 또는: node scripts/refresh-android-icon-splash.cjs --sync

# 2) 웹 빌드 후 Android 동기화 (앱 내부 아이콘·코드 반영)
npm run build
npx cap sync android
```

- **런처 아이콘만 바꿨을 때**: `npm run android:icons` 만 해도 됩니다.
- **앱 내부 아이콘(public/icons)만 바꿨을 때**: `npm run build` 후 `npx cap sync android` 하면 됩니다.

`--no-clean`: Gradle clean 생략. `--sync`: 완료 후 `npx cap sync android` 실행.

```bash
node scripts/refresh-android-icon-splash.cjs --no-clean
```

### 4.2 Android Studio

1. **열어야 할 경로**: 반드시 **`c:\arisum\android`** (또는 `c:\arisum` 에서 android 모듈 사용).  
   다른 경로(예: `c-arisum` 등)를 열면 갱신한 리소스가 반영되지 않습니다.
2. **캐시 무효화**: `File` → `Invalidate Caches...` → `Invalidate and Restart`
3. **클린 빌드**: `Build` → `Clean Project`  
   (Rebuild가 있으면 `Build` → `Rebuild Project` 권장)
4. **기기에서 앱 완전 제거**: 설정 → 앱 → 별의 갈피 → 저장공간 → **데이터 삭제** 후 **앱 제거**  
   (또는 롱프레스 → 앱 정보 → 저장공간 → 삭제)
5. **다시 설치**: Run(▶)으로 디버그 빌드 설치 후 실행

### 4.3 런처 아이콘/스플래시가 전혀 적용되지 않을 때

- **원인**: 이전에 쓰이던 템플릿 리소스(drawable/ic_launcher_*)가 남아 있거나, 빌드 캐시 때문에 새 리소스가 반영되지 않을 수 있습니다.
- **조치**:  
  1. `npm run android:icons` (또는 `npm run refresh:android-assets` 후 `npx cap sync android`)로 아이콘/스플래시를 다시 생성합니다.  
  2. **apk:prepare / aab** 는 이제 항상 `refresh-android-icon-splash` 를 먼저 실행해 리소스를 갱신한 뒤 빌드합니다.  
  3. Android Studio: **File → Invalidate Caches... → Invalidate and Restart**  
  4. 기기에서 **앱 완전 삭제** 후 Run으로 재설치.

### 4.4 런처 아이콘만 안 바뀔 때

- 홈 화면에서 **앱 아이콘 제거** 후, 앱 서랍에서 다시 꺼내서 홈에 두면 새 아이콘이 보이는 경우가 있습니다.
- 또는 앱 삭제 후 위 4.2처럼 재설치.

---

## 5. 검증 체크리스트

- [ ] `assets/icon-only.png`, `assets/splash.png` 존재 및 원하는 이미지 맞음
- [ ] `node scripts/refresh-android-icon-splash.cjs` 실행 후 에러 없음
- [ ] `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` 등이 최근 수정 시각으로 갱신됨
- [ ] `android/app/src/main/res/drawable/splash.png` 가 최근 이미지로 갱신됨
- [ ] Android Studio에서 연 경로가 `c:\arisum\android` (또는 동일 프로젝트)
- [ ] Clean Project(및 Rebuild) 후 기기에서 앱 삭제 → Run으로 재설치
- [ ] (선택) 기기 설정에서 앱 데이터 삭제 후 재설치

---

## 6. 참고

- **Android 12+ 스플래시**: OS 한계로 런처 화면은 **배경색 + 런처 아이콘**만 지원됩니다. **전체 splash.png**를 보려면 앱 로드 후 `CustomSplashOverlay`(components/arisum/custom-splash-overlay.tsx)가 1.8초간 표시합니다. `public/splash.png`는 `npm run refresh:android-assets` 시 `assets/splash.png`에서 자동 복사됩니다.
- **adaptive icon**: `mipmap-anydpi-v26/ic_launcher.xml` 이 `ic_launcher_foreground`, `ic_launcher_background` 를 참조합니다. `cap:assets` 가 이 조합을 생성하므로, 스크립트만 실행해 두면 됩니다.
