import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [packageJson, nodeVersion, nvmVersion, workflow, dockerfile] = await Promise.all([
  source("package.json"),
  source(".node-version"),
  source(".nvmrc"),
  source(".github/workflows/quality.yml"),
  source("Dockerfile")
]);

const manifest = JSON.parse(packageJson);
const expectedNodeVersion = nodeVersion.trim();
const expectedPackageManager = "pnpm@11.1.3";

assert.equal(expectedNodeVersion, "26.5.0", ".node-version must remain on the reviewed runtime");
assert.equal(nvmVersion.trim(), expectedNodeVersion, ".nvmrc and .node-version must agree");
assert.equal(
  manifest.engines?.node,
  ">=24.19.0 <25 || >=26.5.0 <27",
  "package engines must preserve reviewed Vercel Node 24 and repository Node 26 boundaries"
);
assert.equal(manifest.packageManager, expectedPackageManager, "package manager declaration drifted");
assert.match(
  workflow,
  /node-version-file:\s*\.node-version/,
  "CI must resolve Node from the reviewed version file"
);
assert.match(
  workflow,
  /fetch-depth:\s*0/,
  "CI must retain repository history for immutable release-evidence checks"
);
assert.match(
  workflow,
  /sudo install -d -m 1777 \/private\/tmp/,
  "CI must provision the reviewed private temporary boundary used by testnet preflight checks"
);
assert.match(
  dockerfile,
  /npm install --global pnpm@11\.1\.3 --ignore-scripts/,
  "the Node 26 build image must install the reviewed pnpm version explicitly"
);
assert.doesNotMatch(
  dockerfile,
  /\bcorepack\b/,
  "the Node 26 slim build image does not provide corepack"
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
