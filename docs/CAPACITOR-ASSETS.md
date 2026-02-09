# Capacitor 아이콘·스플래시 자산 가이드

`@capacitor/assets`로 **아이콘 세트**와 **스플래시 화면**을 한 번에 생성하는 방법입니다.

---

## 1. 파일 배치 (Custom Mode – 아이콘/스플래시 분리)

아이콘과 스플래시를 **서로 다른 이미지**로 쓰려면 Custom Mode를 사용합니다.

```
assets/
├── icon-only.png  ← 앱 아이콘용 (권장: 1024×1024px 이상)
├── splash.png     ← 스플래시 전체 화면용 (권장: 2732×2732px 이상)
└── splash-dark.png ← (선택) 다크 모드 스플래시
```

- **아이콘**: `icon-only.png` → 앱 아이콘만 생성.
- **스플래시**: `splash.png` → 미드나잇 블루 + 황금별 등 이미 완성된 화면을 그대로 사용.

### 현재 프로젝트 설정

- **아이콘**: `assets/icon-map.png`를 `assets/icon-only.png`로 복사해 두었습니다. (별/맵 아이콘)
- **스플래시**: `assets/splash.png`를 그대로 사용합니다. (미드나잇 블루 배경 + 중앙 황금별)
- 이미지를 바꾼 뒤에는 아래 **2. 한 번에 생성하는 명령어**를 다시 실행하면 됩니다.

---

## 2. 한 번에 생성하는 명령어

### Android만 생성 (Custom Mode: icon-only.png + splash.png 사용)

```bash
npm run cap:assets
```

또는 직접 (배경색 옵션 없이):

```bash
npx capacitor-assets generate --android --assetPath assets
```

- **아이콘**: `assets/icon-only.png` → 앱 아이콘(mipmap) 전부 생성
- **스플래시**: `assets/splash.png` → 그대로 리사이즈해 drawable 포트/랜드/다크 전부 생성
- 스플래시 이미지에 이미 미드나잇 블루 + 황금별이 들어 있으므로 별도 배경색 옵션은 필요 없음

### iOS / PWA까지 모두 생성

```bash
npx capacitor-assets generate
```

### 플랫폼만 지정

```bash
npx capacitor-assets generate --ios
npx capacitor-assets generate --android
npx capacitor-assets generate --pwa
```

---

## 3. 생성되는 결과 위치 (Android)

| 대상 | 경로 |
|------|------|
| 앱 아이콘 (적응형) | `android/app/src/main/res/mipmap-*/ic_launcher*.png`, `ic_launcher_foreground.png`, `ic_launcher_background.png` |
| 앱 아이콘 (레거시) | `android/app/src/main/res/mipmap-*/ic_launcher.png`, `ic_launcher_round.png` |
| 스플래시 | `android/app/src/main/res/drawable*/splash.png`, `drawable-night*/splash.png` |

---

## 4. 워크플로 요약

1. **로고 교체 시**: `assets/logo.png` 수정 후 `npm run cap:assets` 실행
2. **색만 바꿀 때**: `package.json`의 `cap:assets` 스크립트에서 `#0A0E1A` 등을 원하는 색으로 바꾼 뒤 `npm run cap:assets`
3. **스플래시 별 크기**: `--logoSplashScale` 값 조정 (0.2~0.4 등)

---

## 5. 참고

- [Capacitor: Splash Screens and Icons](https://capacitorjs.com/docs/guides/splash-screens-and-icons)
- [@capacitor/assets (npm)](https://www.npmjs.com/package/@capacitor/assets)
- Android 12 이상에서는 스플래시가 “작은 아이콘 + 배경색” 형태로 표시됩니다. 배경색은 `#0A0E1A`로 설정된 상태입니다.
