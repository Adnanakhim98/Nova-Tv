const fs = require("fs");
const path = require("path");

const root = process.cwd();
const output = path.join(root, "www");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const excluded = new Set([
  ".git",
  ".github",
  "node_modules",
  "android",
  "www",
  ".gradle"
]);

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, {
    withFileTypes: true
  })) {
    if (excluded.has(entry.name)) continue;

    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (
      entry.isFile() &&
      ![
        "package.json",
        "package-lock.json",
        "capacitor.config.json"
      ].includes(entry.name)
    ) {
      fs.copyFileSync(from, to);
    }
  }
}

copyDirectory(root, output);

if (!fs.existsSync(path.join(output, "index.html"))) {
  throw new Error(
    "index.html was not found in the repository root."
  );
}

console.log("SPORTYNOVA web assets prepared successfully.");
