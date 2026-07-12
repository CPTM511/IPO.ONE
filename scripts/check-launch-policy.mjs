import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  LaunchEvidenceError,
  parseCanonicalJson,
  validateLaunchPolicy,
  verifyLaunchEvidence
} from "../packages/release-governance/src/index.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [policyText, templateText, schemaText] = await Promise.all([
  source("deploy/launch-policy.v1.json"),
  source("deploy/approvals/public-sandbox.pending.json"),
  source("deploy/launch-evidence.v1.schema.json")
]);

const policy = validateLaunchPolicy(parseCanonicalJson(policyText, "Launch policy"));
const template = parseCanonicalJson(templateText, "Pending launch evidence template");
const schema = parseCanonicalJson(schemaText, "Launch evidence schema");

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.$id, "https://schemas.ipo.one/operations/launch-evidence.v1.schema.json");
assert.equal(schema.additionalProperties, false);
assert.equal(policy.profiles.public_sandbox.releaseEnabled, true);
assert.equal(policy.profiles.closed_non_funds_pilot.releaseEnabled, false);
assert.equal(policy.profiles.controlled_agent_credit_pilot.releaseEnabled, false);
assert.throws(
  () =>
    verifyLaunchEvidence(template, {
      policy,
      expectedProfile: "public_sandbox",
      expectedCommitSha: "a".repeat(40),
      now: new Date("2026-07-12T12:00:00.000Z")
    }),
  (error) =>
    error instanceof LaunchEvidenceError &&
    error.issues.some((issue) => issue.includes("status must be approved"))
);

const cliResult = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("verify-launch-evidence.mjs", import.meta.url)),
    "--",
    "--evidence",
    fileURLToPath(new URL("../deploy/approvals/public-sandbox.pending.json", import.meta.url)),
    "--profile",
    "public_sandbox",
    "--expected-sha",
    "a".repeat(40)
  ],
  { encoding: "utf8" }
);
assert.equal(cliResult.status, 1);
assert.match(cliResult.stderr, /Launch evidence is invalid\./);
assert.doesNotMatch(cliResult.stderr, /Unexpected argument/);

console.log("Launch policy is valid and pending evidence fails closed.");
