/**
 * public/icons/icon-map.png 를 안드로이드 앱 아이콘으로 복사합니다.
 * mipmap-* 폴더의 ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png 를 덮어씁니다.
 * 프로젝트 루트에서 실행: node scripts/copy-android-icon.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public", "icons", "icon-map.png");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");
const MIPMAPS = ["mipmap-hdpi", "mipmap-mdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"];
const FILES = ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"];

if (!fs.existsSync(SRC)) {
  console.error("소스 아이콘 없음:", SRC);
  process.exit(1);
}
if (!fs.existsSync(RES)) {
  console.error("android res 폴더 없음. 먼저 'npx cap add android' 실행 후 다시 시도하세요.");
  process.exit(1);
}

for (const dir of MIPMAPS) {
  const dirPath = path.join(RES, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const file of FILES) {
    const dest = path.join(dirPath, file);
    fs.copyFileSync(SRC, dest);
    console.log("복사:", path.relative(ROOT, dest));
  }
}
console.log("아이콘 복사 완료: icon-map.png -> Android mipmap");
