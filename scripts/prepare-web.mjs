
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const output = path.join(root, "www");

const excluded = new Set([
  ".git",
  ".github",
  "node_modules",
  "android",
  "www",
  "scripts",
  "package.json",
  "package-lock.json",
  "capacitor.config.json"
]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });

for (const entry of entries) {
  if (excluded.has(entry.name)) continue;

  await cp(
    path.join(root, entry.name),
    path.join(output, entry.name),
    { recursive: true }
  );
}

console.log("SportyNova web files prepared successfully!");
