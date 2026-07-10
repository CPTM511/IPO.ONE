import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const roots = ["packages", "modules", "apps"];

async function collectTests(dir) {
  const files = [];
  let entries = [];

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTests(fullPath)));
    } else if (entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = (await Promise.all(roots.map(collectTests))).flat().sort();

if (testFiles.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);
