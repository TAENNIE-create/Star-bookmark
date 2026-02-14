/**
 * Android 아이콘/스플래시를 assets 기준으로 재생성하고, Gradle 빌드 캐시를 비워
 * 최종 APK에 반영되도록 합니다.
 *
 * 사용: node scripts/refresh-android-icon-splash.cjs
 * 옵션:
 *   --no-clean  → Gradle clean 생략
 *   --sync      → 완료 후 npx cap sync android 실행
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const ANDROID = path.join(ROOT, "android");
const PUBLIC_ICONS = path.join(ROOT, "public", "icons");
const ICON = path.join(ASSETS, "icon-only.png");
const LOGO = path.join(ASSETS, "logo.png");
const SPLASH = path.join(ASSETS, "splash.png");

const IN_APP_ICONS = [
  "icon-home.png",
  "icon-diary.png",
  "icon-archive.png",
  "icon-map.png",
  "icon-lock.png",
  "icon-unlock.png",
];

function run(cmd, cwd = ROOT) {
  console.log("[run]", cwd === ROOT ? cmd : `(cd ${path.relative(ROOT, cwd)}) ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

// 0) 앱 내부 아이콘(public/icons) 안내
if (fs.existsSync(PUBLIC_ICONS)) {
  const missing = IN_APP_ICONS.filter((name) => !fs.existsSync(path.join(PUBLIC_ICONS, name)));
  if (missing.length > 0) {
    console.log("\n⚠ 앱 내부 탭/UI 아이콘: public/icons/ 에 다음 파일이 없습니다:", missing.join(", "));
    console.log("  (탭·자물쇠 아이콘은 public/icons/ 에 넣고, 빌드 후 cap sync 하면 반영됩니다. 자세한 건 assets/README.md)\n");
  }
}

// 1) 소스 파일 확인
if (!fs.existsSync(ICON)) {
  console.error("❌ 아이콘 소스 없음:", ICON);
  console.error("   assets/icon-only.png (1024x1024 권장)을 넣은 뒤 다시 실행하세요.");
  console.error("   (앱 내부 탭 아이콘은 public/icons/ 에 넣는 것이고, 런처 아이콘만 여기 씁니다. assets/README.md 참고)");
  process.exit(1);
}
if (!fs.existsSync(SPLASH)) {
  console.error("❌ 스플래시 소스 없음:", SPLASH);
  console.error("   스플래시는 아이콘이 아니라 assets/splash.png 를 씁니다. 2732×2732 권장.");
  process.exit(1);
}
// logo.png 없으면 icon-only.png 복사 (adaptive/레거시 아이콘용. 스플래시는 위 splash.png 사용)
if (!fs.existsSync(LOGO)) {
  fs.copyFileSync(ICON, LOGO);
  console.log("✓ assets/logo.png 없음 → icon-only.png 복사 (adaptive 아이콘 생성용)");
}
console.log("✓ assets/icon-only.png (런처 아이콘), assets/splash.png (스플래시 전용) 확인");

// 1.5) public/splash.png 복사 (in-app 커스텀 스플래시 오버레이용 – Android 12+ OS 한계 회피)
const PUBLIC_SPLASH = path.join(ROOT, "public", "splash.png");
fs.copyFileSync(SPLASH, PUBLIC_SPLASH);
console.log("✓ public/splash.png 복사 (in-app 커스텀 스플래시용)");

// 2) cap:assets 실행 → mipmap-*, drawable* 재생성 (앱 테마 배경색 적용)
const CAP_ASSETS_CMD =
  "npx capacitor-assets generate --android --assetPath assets" +
  " --iconBackgroundColor #0A0E1A" +
  " --splashBackgroundColor #0A0E1A" +
  " --splashBackgroundColorDark #0A0E1A";
run(CAP_ASSETS_CMD);

// 3) 생성된 리소스 존재 여부 확인
const mipmapHdpi = path.join(ANDROID, "app", "src", "main", "res", "mipmap-hdpi", "ic_launcher_foreground.png");
const drawableSplash = path.join(ANDROID, "app", "src", "main", "res", "drawable", "splash.png");
if (!fs.existsSync(mipmapHdpi)) {
  console.error("❌ cap:assets 후에도 mipmap 리소스가 없습니다:", mipmapHdpi);
  process.exit(1);
}
if (!fs.existsSync(drawableSplash)) {
  console.error("❌ cap:assets 후에도 drawable/splash.png가 없습니다:", drawableSplash);
  process.exit(1);
}
console.log("✓ mipmap-*/ic_launcher_foreground.png, drawable/splash.png 생성 확인");

// 4) Gradle clean (선택)
const noClean = process.argv.includes("--no-clean");
if (!noClean && fs.existsSync(path.join(ANDROID, "gradlew.bat"))) {
  console.log("\n[Gradle clean] 이전 빌드 캐시 제거 중...");
  run("gradlew.bat clean", ANDROID);
  console.log("✓ Gradle clean 완료");
} else if (noClean) {
  console.log("\n[skip] Gradle clean 생략 (--no-clean)");
}

const doSync = process.argv.includes("--sync");
if (doSync) {
  console.log("\n[cap sync] Android 동기화 중...");
  run("npx cap sync android");
}

console.log("\n✅ 아이콘/스플래시 갱신 완료. 다음 단계:");
if (!doSync) console.log("   1) npx cap sync android  (또는 이 스크립트에 --sync 옵션)");
console.log("   2) Android Studio에서 해당 프로젝트(c:\\arisum\\android) 열기");
console.log("   3) 기기에서 앱 삭제 후 Run으로 재설치");
console.log("   자세한 루틴: docs/ANDROID-ICON-SPLASH.md");
console.log("   assets vs public/icons 설명: assets/README.md");
process.exit(0);
