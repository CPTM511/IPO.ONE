import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function foundryExecutable() {
  const platform = { "linux:x64": "linux-amd64", "darwin:arm64": "darwin-arm64" }[`${process.platform}:${process.arch}`];
  if (!platform) throw new Error("Unsupported reviewed Foundry platform");
  const wrapper = require.resolve("@foundry-rs/forge/package.json");
  const fromWrapper = createRequire(wrapper);
  return fromWrapper.resolve(`@foundry-rs/forge-${platform}/bin/forge`);
}

// The installed upstream npm shim spawns Forge without propagating its exit
// status. Run its exact locked platform binary and fail at the first bad stage.
export function runFoundryStages({ executable = foundryExecutable(), run = spawnSync } = {}) {
  for (const args of [
    ["fmt", "--check", "contracts/src/m2", "contracts/test/m2"],
    ["build", "--sizes"],
    ["test"]
  ]) {
    const result = run(executable, args, { stdio: "inherit", cwd: dirname(fileURLToPath(new URL("../package.json", import.meta.url))) });
    if (result.error) throw result.error;
    if (result.signal || result.status === null) return 1;
    if (result.status !== 0) return result.status;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runFoundryStages();
}
