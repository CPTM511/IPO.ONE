import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("contracts/toolchain-manifest.v1.json"));
const packageJson = JSON.parse(read("package.json"));
const lockfile = read("pnpm-lock.yaml");
const foundryConfig = read("foundry.toml");

assert.equal(packageJson.license, manifest.repositoryLicense.spdx);
assert.match(read(manifest.repositoryLicense.file), /MIT License/);
assert.match(read(manifest.contributionPolicy.file), /Developer Certificate of Origin/);

assert.equal(packageJson.devDependencies["@openzeppelin/contracts"], manifest.openZeppelinContracts.version);
assert.equal(packageJson.devDependencies[manifest.foundry.npmPackage.name], manifest.foundry.npmPackage.version);
assert.equal(packageJson.devDependencies["forge-std"], manifest.forgeStd.dependencySpecifier);
assert.equal(packageJson.devDependencies.solc, manifest.solc.version);

for (const exactEvidence of [
  `${manifest.foundry.npmPackage.name}@${manifest.foundry.npmPackage.version}`,
  manifest.foundry.npmPackage.integrity,
  manifest.foundry.npmPackage.platformPackageIntegrity.darwin_arm64,
  manifest.foundry.npmPackage.platformPackageIntegrity.linux_amd64,
  `@openzeppelin/contracts@${manifest.openZeppelinContracts.version}`,
  manifest.openZeppelinContracts.integrity,
  manifest.forgeStd.commit,
  `solc@${manifest.solc.version}`,
  manifest.solc.integrity,
]) {
  assert.ok(lockfile.includes(exactEvidence), `lockfile is missing exact evidence: ${exactEvidence}`);
}
assert.equal(manifest.foundry.npmPackage.lifecycleScriptAllowed, false);
assert.match(read("pnpm-workspace.yaml"), /"@foundry-rs\/forge": false/);

assert.match(foundryConfig, /solc = "0\.8\.30"/);
assert.match(foundryConfig, /auto_detect_solc = false/);
assert.match(foundryConfig, /ffi = false/);

const forgeStdPackage = JSON.parse(read("node_modules/forge-std/package.json"));
const openZeppelinPackage = JSON.parse(read("node_modules/@openzeppelin/contracts/package.json"));
const solcPackage = JSON.parse(read("node_modules/solc/package.json"));
assert.equal(forgeStdPackage.version, manifest.forgeStd.tag.slice(1));
assert.match(forgeStdPackage.license, /MIT/);
assert.match(forgeStdPackage.license, /Apache-2\.0/);
assert.equal(openZeppelinPackage.version, manifest.openZeppelinContracts.version);
assert.equal(openZeppelinPackage.license, manifest.openZeppelinContracts.license);
assert.equal(solcPackage.version, manifest.solc.version);

function solidityFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return solidityFiles(path);
    return entry.isFile() && entry.name.endsWith(".sol") ? [path] : [];
  });
}

function installedTreeSha256(directory) {
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  walk(directory);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(directory, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

assert.equal(
  installedTreeSha256(new URL("node_modules/forge-std/", root).pathname),
  manifest.forgeStd.installedTreeSha256,
);

const contractsDirectory = new URL("contracts/", root).pathname;
const allowedOpenZeppelinImports = new Set(
  manifest.openZeppelinContracts.allowedImports.map((path) => `@openzeppelin/${path}`),
);
const importPattern = /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["'];/g;

for (const file of solidityFiles(contractsDirectory)) {
  assert.ok(statSync(file).isFile());
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const imported = match[1];
    if (imported.startsWith("@openzeppelin/")) {
      assert.ok(
        allowedOpenZeppelinImports.has(imported),
        `${relative(contractsDirectory, file)} imports unapproved dependency path ${imported}`,
      );
    }
    if (imported.startsWith("forge-std/")) {
      assert.ok(
        relative(contractsDirectory, file).startsWith("test/"),
        `${relative(contractsDirectory, file)} uses test-only forge-std outside contracts/test`,
      );
    }
  }
}

const forge = spawnSync("forge", ["--version"], { encoding: "utf8" });
assert.equal(forge.status, 0, forge.stderr || "forge --version failed");
assert.match(forge.stdout, /^forge Version: 1\.7\.1$/m);
assert.ok(forge.stdout.includes(`Commit SHA: ${manifest.foundry.commit}`));

const solc = spawnSync("node_modules/.bin/solcjs", ["--version"], { encoding: "utf8" });
assert.equal(solc.status, 0, solc.stderr || "solcjs --version failed");
assert.match(solc.stdout, /^0\.8\.30\+/);

console.log("M2 contract toolchain admission evidence is exact and internally consistent.");
