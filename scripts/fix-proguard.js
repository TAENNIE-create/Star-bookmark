/**
 * node_modules 내 Android build.gradle에서 proguard-android.txt 를
 * proguard-android-optimize.txt 로 교체 (R8 호환).
 * npm install 후 postinstall에서 실행.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "node_modules");
const oldLine = "getDefaultProguardFile('proguard-android.txt')";
const newLine = "getDefaultProguardFile('proguard-android-optimize.txt')";

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes(oldLine)) {
      content = content.replace(oldLine, newLine);
      fs.writeFileSync(filePath, content);
      console.log("[fix-proguard] Updated:", filePath.replace(root, "node_modules"));
    }
  } catch (e) {
    // ignore
  }
}

function walk(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && ent.name !== ".bin" && !ent.name.startsWith(".")) {
        walk(full);
      } else if (ent.name === "build.gradle" && full.includes("android")) {
        fixFile(full);
      }
    }
  } catch (e) {
    // ignore
  }
}

walk(root);
