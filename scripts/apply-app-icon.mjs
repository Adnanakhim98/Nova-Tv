/**
 * After `npx cap sync android`, copy SportyNova launcher icons
 * into the generated Android project.
 */
import { cp, mkdir, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsSrc = path.join(root, "android-icons");

let resDir = null;
try {
  const found = execSync('find android -type d -name "res" 2>/dev/null | head -1', { encoding: "utf8" }).trim();
  if (found) resDir = path.resolve(root, found);
} catch {}

if (!resDir) {
  console.warn("android/.../res not found – skip icon apply");
  process.exit(0);
}

const folders = [
  "mipmap-mdpi",
  "mipmap-hdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
  "mipmap-anydpi-v26",
];

for (const folder of folders) {
  const src = path.join(iconsSrc, folder);
  const dest = path.join(resDir, folder);
  try {
    await access(src);
    await mkdir(dest, { recursive: true });
    await cp(src, dest, { recursive: true, force: true });
    console.log("Copied", folder);
  } catch (e) {
    console.warn("Skip", folder, e.message);
  }
}

console.log("SportyNova app icons applied successfully →", resDir);
