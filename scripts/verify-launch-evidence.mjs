import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  LaunchEvidenceError,
  MAX_LAUNCH_JSON_BYTES,
  parseCanonicalJson,
  verifyLaunchEvidence
} from "../packages/release-governance/src/index.js";

async function readBoundedUtf8(path, label) {
  let handle;
  try {
    handle = await open(resolve(path), "r");
    const stats = await handle.stat();
    if (!stats.isFile()) throw new LaunchEvidenceError(`${label} must be a regular file.`);
    if (stats.size > MAX_LAUNCH_JSON_BYTES) {
      throw new LaunchEvidenceError(`${label} exceeds the 128 KiB limit.`);
    }
    const buffer = Buffer.alloc(MAX_LAUNCH_JSON_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_LAUNCH_JSON_BYTES) {
      throw new LaunchEvidenceError(`${label} exceeds the 128 KiB limit.`);
    }
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (error instanceof LaunchEvidenceError) throw error;
    throw new LaunchEvidenceError(`${label} could not be read.`);
  } finally {
    await handle?.close();
  }
}

function usage() {
  return [
    "Usage:",
    "  pnpm run launch:verify -- --evidence <private-file.local.json> \\",
    "    --profile <profile> --expected-sha <40-character-git-sha>",
    "",
    "Passing this verifier is necessary but does not grant deployment permission."
  ].join("\n");
}

let values;
try {
  const commandArgs = process.argv.slice(2);
  if (commandArgs[0] === "--") commandArgs.shift();
  ({ values } = parseArgs({
    args: commandArgs,
    allowPositionals: false,
    strict: true,
    options: {
      evidence: { type: "string" },
      profile: { type: "string" },
      "expected-sha": { type: "string" },
      policy: { type: "string", default: "deploy/launch-policy.v1.json" }
    }
  }));
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(2);
}

if (!values.evidence || !values.profile || !values["expected-sha"]) {
  console.error(usage());
  process.exit(2);
}

try {
  const [policyText, evidenceText] = await Promise.all([
    readBoundedUtf8(values.policy, "Launch policy"),
    readBoundedUtf8(values.evidence, "Launch evidence")
  ]);
  const policy = parseCanonicalJson(policyText, "Launch policy");
  const evidence = parseCanonicalJson(evidenceText, "Launch evidence");
  const result = verifyLaunchEvidence(evidence, {
    policy,
    expectedProfile: values.profile,
    expectedCommitSha: values["expected-sha"]
  });
  console.log(JSON.stringify(result));
} catch (error) {
  if (error instanceof LaunchEvidenceError) {
    console.error(error.message);
    for (const issue of error.issues.slice(0, 50)) console.error(`- ${issue}`);
    process.exit(1);
  }
  throw error;
}
