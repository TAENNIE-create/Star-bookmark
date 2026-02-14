# public/icons/ — 앱 내부 UI 아이콘

이 폴더에는 **앱 안에서만** 쓰는 아이콘을 넣습니다.  
(홈 화면 앱 아이콘·스플래시는 **assets/** 폴더입니다. → `assets/README.md` 참고)

## 필요한 파일

| 파일명 | 쓰이는 곳 |
|--------|-----------|
| icon-home.png | 하단 탭: 홈 |
| icon-diary.png | 하단 탭: 일기 |
| icon-archive.png | 하단 탭: 기록함 |
| icon-map.png | 하단 탭: 밤하늘 |
| icon-lock.png | 기록함: 잠금 표시 |
| icon-unlock.png | 기록함: 잠금 해제 표시 |

위 PNG 파일들을 이 폴더에 넣은 뒤:

1. **`npm run build`**
2. **`npx cap sync android`**

하면 앱에 반영됩니다.  
이미지가 안 바뀌면 `components/arisum/tab-bar.tsx` 안 **ICON_CACHE_VERSION** 값을 1 올리세요.
