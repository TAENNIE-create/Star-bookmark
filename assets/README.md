# assets/ — 네이티브 앱 아이콘·스플래시 전용

이 폴더는 **Android/iOS 앱 런처 아이콘**과 **스플래시 화면** 소스만 넣는 곳입니다.  
앱 내부에서 쓰는 탭/버튼 아이콘과는 **다릅니다**.

---

## 여기 넣는 파일 (assets/)

| 파일 | 용도 | 권장 크기 |
|------|------|-----------|
| **icon-only.png** | 홈 화면에 보이는 앱 아이콘 | 1024×1024 |
| **splash.png** | 앱 실행 시 잠깐 보이는 스플래시 이미지 | 2732×2732 |

- 이 두 파일을 넣은 뒤 **`npm run refresh:android-assets`** 를 실행하면 Android 리소스(mipmap, drawable)가 갱신됩니다.
- **스플래시는 항상 `splash.png`만 사용합니다.** 아이콘(icon-only.png)으로 대체하지 않습니다. `splash.png`가 없으면 스크립트가 실패합니다.

---

## 앱 내부 UI 아이콘 (public/icons/) — 별도 위치

탭 바(홈, 일기, 기록함, 밤하늘), 자물쇠 등 **앱 안에서 쓰는 아이콘**은 **`public/icons/`** 에 넣습니다.

| 파일명 | 쓰이는 곳 |
|--------|-----------|
| icon-home.png | 탭: 홈 |
| icon-diary.png | 탭: 일기 |
| icon-archive.png | 탭: 기록함 |
| icon-map.png | 탭: 밤하늘 |
| icon-lock.png | 기록함: 잠금 |
| icon-unlock.png | 기록함: 잠금 해제 |

- 이 파일들을 **`public/icons/`** 에 넣고 **`npm run build`** 후 **`npx cap sync android`** 하면 앱에 반영됩니다.
- 이미지 수정 후에도 예전 게 보이면 `components/arisum/tab-bar.tsx` 안의 **`ICON_CACHE_VERSION`** 숫자를 1 올리면 됩니다.

---

## 요약

- **홈 화면 앱 아이콘/스플래시** → **assets/** 에 이미지 넣고 → `npm run refresh:android-assets`
- **앱 안 탭·버튼 아이콘** → **public/icons/** 에 이미지 넣고 → `npm run build` → `npx cap sync android`
