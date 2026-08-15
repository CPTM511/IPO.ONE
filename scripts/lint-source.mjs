import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ROOTS = [
  "api",
  "apps",
  "contracts",
  "deploy",
  "modules",
  "packages",
  "scripts",
  "security"
];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs"]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".ipo-one",
  ".playwright-cli",
  ".pnpm-store",
  "dist",
  "node_modules",
  "output",
  "prototypes"
]);

async function collectSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath));
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

const sourceFiles = (
  await Promise.all(SOURCE_ROOTS.map(collectSourceFiles))
).flat().sort();

assert.ok(sourceFiles.length > 0, "no JavaScript source files were found");

for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile);
  assert.equal(
    source.includes(0),
    false,
    `${sourceFile} contains a NUL byte`
  );
  execFileSync(process.execPath, ["--check", sourceFile], {
    stdio: ["ignore", "ignore", "pipe"]
  });
}

console.log(
  `Source lint passed: ${sourceFiles.length} JavaScript modules parsed with ` +
    "the pinned Node runtime and no NUL bytes were present."
);
