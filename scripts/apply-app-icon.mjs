/**
 * Run AFTER: npx cap add android && npx cap sync android
 * Overwrites all launcher icons with SportyNova logo.
 */
import { cp, mkdir, rm, readdir, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsSrc = path.join(root, "android-icons");

// Find the real app res directory
let resDir = null;
try {
  const found = execSync(
    'find android/app/src/main -type d -name "res" 2>/dev/null | head -1',
    { encoding: "utf8" }
  ).trim();
  if (found) resDir = path.resolve(root, found);
} catch {}

if (!resDir) {
  console.error("ERROR: android/app/src/main/res not found. Did you run 'npx cap add android' and 'npx cap sync'?");
  process.exit(1);
}

console.log("Target res dir:", resDir);

const folders = [
  "mipmap-mdpi",
  "mipmap-hdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
  "mipmap-anydpi-v26",
];

// Remove old default icons first (Capacitor leaves these)
const oldNames = [
  "ic_launcher.png",
  "ic_launcher_round.png",
  "ic_launcher_foreground.png",
  "ic_launcher_background.png",
  "ic_launcher.xml",
  "ic_launcher_round.xml",
];

for (const folder of folders) {
  const dest = path.join(resDir, folder);
  await mkdir(dest, { recursive: true });

  // Delete any existing launcher files
  for (const name of oldNames) {
    try { await rm(path.join(dest, name), { force: true }); } catch {}
  }

  const src = path.join(iconsSrc, folder);
  try {
    await access(src);
    await cp(src, dest, { recursive: true, force: true });
    const files = await readdir(dest);
    console.log("✓", folder, "→", files.join(", "));
  } catch (e) {
    console.warn("✗", folder, e.message);
  }
}

// Also make sure AndroidManifest uses @mipmap/ic_launcher
try {
  const manifestPath = path.join(resDir, "..", "AndroidManifest.xml");
  let manifest = await (await import("node:fs/promises")).readFile(manifestPath, "utf8");
  if (!manifest.includes('android:icon="@mipmap/ic_launcher"')) {
    manifest = manifest.replace(
      /android:icon="[^"]*"/,
      'android:icon="@mipmap/ic_launcher"'
    );
    manifest = manifest.replace(
      /android:roundIcon="[^"]*"/,
      'android:roundIcon="@mipmap/ic_launcher_round"'
    );
    await writeFile(manifestPath, manifest, "utf8");
    console.log("✓ AndroidManifest.xml icon references updated");
  } else {
    console.log("✓ AndroidManifest already uses @mipmap/ic_launcher");
  }
} catch (e) {
  console.warn("Manifest check:", e.message);
}

console.log("\nSportyNova icons applied successfully!");
