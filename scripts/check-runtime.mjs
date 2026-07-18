import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [packageJson, nodeVersion, nvmVersion, workflow] = await Promise.all([
  source("package.json"),
  source(".node-version"),
  source(".nvmrc"),
  source(".github/workflows/quality.yml")
]);

const manifest = JSON.parse(packageJson);
const expectedNodeVersion = nodeVersion.trim();
const expectedPackageManager = "pnpm@11.1.3";

assert.equal(expectedNodeVersion, "24.18.0", ".node-version must remain on the reviewed runtime");
assert.equal(nvmVersion.trim(), expectedNodeVersion, ".nvmrc and .node-version must agree");
assert.equal(manifest.engines?.node, ">=24.18.0 <25", "package engines must preserve the Node 24 boundary");
assert.equal(manifest.packageManager, expectedPackageManager, "package manager declaration drifted");
assert.match(
  workflow,
  /node-version-file:\s*\.node-version/,
  "CI must resolve Node from the reviewed version file"
);
assert.equal(
  process.versions.node,
  expectedNodeVersion,
  `IPO.ONE checks require Node v${expectedNodeVersion}; current runtime is ${process.version}`
);
assert.match(
  process.env.npm_config_user_agent ?? "",
  /^pnpm\/11\.1\.3\s/,
  "IPO.ONE checks must be launched by pnpm 11.1.3"
);

console.log(`Runtime contract satisfied: Node ${process.version}, pnpm 11.1.3.`);
