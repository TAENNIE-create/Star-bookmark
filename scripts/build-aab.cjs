/**
 * Android App Bundle(.aab) 빌드.
 * 프로젝트 루트에서: npm run aab (또는 node scripts/build-aab.cjs)
 * 먼저 apk:prepare(웹 빌드 + cap sync)를 실행한 뒤 android 폴더에서 bundleRelease 실행.
 */

const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const androidDir = path.join(root, "android");
const isWin = process.platform === "win32";
const gradlew = isWin ? "gradlew.bat" : "./gradlew";

execSync(`${gradlew} bundleRelease`, {
  cwd: androidDir,
  stdio: "inherit",
});
