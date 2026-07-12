import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  LaunchEvidenceError,
  MAX_LAUNCH_JSON_BYTES,
  parseCanonicalJson,
  validateLaunchPolicy,
  verifyLaunchEvidence
} from "../src/index.js";

const POLICY_URL = new URL("../../../deploy/launch-policy.v1.json", import.meta.url);
const NOW = new Date("2026-07-12T12:00:00.000Z");
const COMMIT_SHA = "a".repeat(40);
const IMAGE_DIGEST = "b".repeat(64);

const policy = validateLaunchPolicy(
  parseCanonicalJson(await readFile(POLICY_URL, "utf8"), "Test launch policy")
);

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validEvidence(profileId = "public_sandbox") {
  const profile = policy.profiles[profileId];
  return {
    schemaVersion: "ipo.one.launch-evidence/v1",
    policyVersion: policy.policyVersion,
    profile: profileId,
    release: {
      repository: policy.repository,
      commitSha: COMMIT_SHA,
      ciRunUrl: "https://github.com/CPTM511/IPO.ONE/actions/runs/123456789",
      imageUri: `asia-southeast1-docker.pkg.dev/ipo-one/ipo-one/app@sha256:${IMAGE_DIGEST}`,
      builtAt: "2026-07-12T10:00:00.000Z"
    },
    capabilities: { ...profile.capabilities },
    externalAuthorization: {
      system: "protected_environment",
      environment: profile.environment,
      approvalUrl: "https://github.com/CPTM511/IPO.ONE/actions/runs/123456789",
      approvedAt: "2026-07-12T10:30:00.000Z"
    },
    gates: profile.gates.map((gate, index) => ({
      id: gate.id,
      status: "approved",
      ownerRole: gate.ownerRole,
      approvedBy: `test-approver-${index + 1}`,
      approvedAt: "2026-07-12T10:30:00.000Z",
      expiresAt: new Date(
        Date.parse("2026-07-12T10:30:00.000Z") + Math.min(gate.maxAgeHours, 24) * 60 * 60 * 1000
      ).toISOString(),
      evidenceUrl: `https://github.com/CPTM511/IPO.ONE/issues/${index + 1}`
    }))
  };
}

function verify(evidence, overrides = {}) {
  return verifyLaunchEvidence(evidence, {
    policy,
    expectedProfile: evidence.profile,
    expectedCommitSha: COMMIT_SHA,
    now: NOW,
    ...overrides
  });
}

function hasIssue(fragment) {
  return (error) =>
    error instanceof LaunchEvidenceError &&
    error.issues.some((issue) => issue.includes(fragment));
}

test("launch policy exposes only the public sandbox profile", () => {
  assert.equal(policy.profiles.public_sandbox.releaseEnabled, true);
  assert.equal(policy.profiles.closed_non_funds_pilot.releaseEnabled, false);
  assert.equal(policy.profiles.controlled_agent_credit_pilot.releaseEnabled, false);
  assert.equal(policy.profiles.public_sandbox.capabilities.realFundsEnabled, false);
  assert.equal(policy.profiles.public_sandbox.capabilities.privateTenantDataEnabled, false);

  const unsafePolicy = structuredClone(policy);
  unsafePolicy.profiles.closed_non_funds_pilot.releaseEnabled = true;
  unsafePolicy.profiles.closed_non_funds_pilot.unlockRequirements = [];
  assert.throws(
    () => validateLaunchPolicy(unsafePolicy),
    hasIssue("must remain policy-locked while private tenant data")
  );
});

test("canonical JSON rejects duplicate-key and alternate review representations", () => {
  assert.deepEqual(parseCanonicalJson(canonical({ value: 1 }), "fixture"), { value: 1 });
  assert.throws(
    () => parseCanonicalJson('{"value":1,"value":2}\n', "fixture"),
    /canonical two-space JSON/
  );
  assert.throws(() => parseCanonicalJson('{"value":1}', "fixture"), /canonical two-space JSON/);
});

test("complete fresh public-sandbox evidence verifies", () => {
  const result = verify(validEvidence());
  assert.deepEqual(result, {
    status: "verified",
    policyVersion: "1.0.0",
    profile: "public_sandbox",
    repository: "CPTM511/IPO.ONE",
    commitSha: COMMIT_SHA,
    imageUri: `asia-southeast1-docker.pkg.dev/ipo-one/ipo-one/app@sha256:${IMAGE_DIGEST}`,
    gateCount: policy.profiles.public_sandbox.gates.length,
    externalAuthorization: "protected_environment"
  });
});

test("CLI verifies canonical evidence through the pnpm argument separator", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-launch-"));
  const evidencePath = join(directory, "public-sandbox.local.json");
  const evidence = validEvidence();
  const currentTime = Date.now();
  evidence.release.builtAt = new Date(currentTime - 60 * 60 * 1000).toISOString();
  evidence.externalAuthorization.approvedAt = new Date(currentTime - 30 * 60 * 1000).toISOString();
  for (const gate of evidence.gates) {
    gate.approvedAt = new Date(currentTime - 30 * 60 * 1000).toISOString();
    gate.expiresAt = new Date(currentTime + 60 * 60 * 1000).toISOString();
  }

  try {
    await writeFile(evidencePath, canonical(evidence), { encoding: "utf8", mode: 0o600 });
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../../scripts/verify-launch-evidence.mjs", import.meta.url)),
        "--",
        "--evidence",
        evidencePath,
        "--profile",
        "public_sandbox",
        "--expected-sha",
        COMMIT_SHA
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        encoding: "utf8"
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "verified");

    const oversizedPath = join(directory, "oversized.local.json");
    await writeFile(oversizedPath, "x".repeat(MAX_LAUNCH_JSON_BYTES + 1), {
      encoding: "utf8",
      mode: 0o600
    });
    const oversized = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../../scripts/verify-launch-evidence.mjs", import.meta.url)),
        "--evidence",
        oversizedPath,
        "--profile",
        "public_sandbox",
        "--expected-sha",
        COMMIT_SHA
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        encoding: "utf8"
      }
    );
    assert.equal(oversized.status, 1);
    assert.match(oversized.stderr, /exceeds the 128 KiB limit/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release identity rejects a wrong SHA and mutable image", () => {
  const wrongSha = validEvidence();
  wrongSha.release.commitSha = "c".repeat(40);
  assert.throws(() => verify(wrongSha), hasIssue("does not match the expected immutable release commit"));

  const mutableImage = validEvidence();
  mutableImage.release.imageUri = "asia-southeast1-docker.pkg.dev/ipo-one/ipo-one/app:latest";
  assert.throws(() => verify(mutableImage), hasIssue("imageUri has an invalid format"));
});

test("gate set rejects pending, missing, duplicate, extra, and wrong-owner evidence", () => {
  const pending = validEvidence();
  pending.gates[0].status = "pending";
  assert.throws(() => verify(pending), hasIssue("status must be approved"));

  const missing = validEvidence();
  const missingId = missing.gates.pop().id;
  assert.throws(() => verify(missing), hasIssue(`is missing ${missingId}`));

  const duplicate = validEvidence();
  duplicate.gates.push({ ...duplicate.gates[0] });
  assert.throws(() => verify(duplicate), hasIssue("duplicates another gate"));

  const extra = validEvidence();
  extra.gates.push({ ...extra.gates[0], id: "invented_approval" });
  assert.throws(() => verify(extra), hasIssue("is not defined by the selected profile"));

  const wrongOwner = validEvidence();
  wrongOwner.gates[0].ownerRole = "Nobody";
  assert.throws(() => verify(wrongOwner), hasIssue("ownerRole does not match policy"));
});

test("capability escalation and policy-locked profiles fail closed", () => {
  const escalation = validEvidence();
  escalation.capabilities.realFundsEnabled = true;
  assert.throws(() => verify(escalation), hasIssue("realFundsEnabled does not match"));

  const closedPilot = validEvidence("closed_non_funds_pilot");
  assert.throws(() => verify(closedPilot), hasIssue("profile is policy-locked"));

  const creditPilot = validEvidence("controlled_agent_credit_pilot");
  assert.throws(() => verify(creditPilot), hasIssue("profile is policy-locked"));
});

test("stale, expired, and future evidence fails closed", () => {
  const stale = validEvidence();
  stale.gates[0].approvedAt = "2026-07-01T10:00:00.000Z";
  stale.gates[0].expiresAt = "2026-07-20T10:00:00.000Z";
  assert.throws(() => verify(stale), hasIssue("older than the gate approval window"));

  const expired = validEvidence();
  expired.gates[0].expiresAt = "2026-07-12T11:59:59.000Z";
  assert.throws(() => verify(expired), hasIssue("expiresAt must be in the future"));

  const reversed = validEvidence();
  reversed.gates[0].approvedAt = "2026-07-12T11:30:00.000Z";
  reversed.gates[0].expiresAt = "2026-07-12T11:00:00.000Z";
  assert.throws(() => verify(reversed), hasIssue("must be later than approvedAt"));

  const future = validEvidence();
  future.externalAuthorization.approvedAt = "2026-07-13T12:00:00.000Z";
  assert.throws(() => verify(future), hasIssue("must not be in the future"));
});

test("placeholders, secret-like text, and credential-bearing URLs fail closed", () => {
  const placeholder = validEvidence();
  placeholder.gates[0].approvedBy = "[APPROVER]";
  assert.throws(() => verify(placeholder), hasIssue("contains a placeholder"));

  const secret = validEvidence();
  secret.gates[0].approvedBy = `ghp_${"a".repeat(36)}`;
  assert.throws(() => verify(secret), hasIssue("resembles secret material"));

  const credentialUrl = validEvidence();
  credentialUrl.gates[0].evidenceUrl = "https://github.com/CPTM511/IPO.ONE/issues/1?token=secret";
  assert.throws(() => verify(credentialUrl), hasIssue("credential-like query parameters"));

  const fragmentUrl = validEvidence();
  fragmentUrl.gates[0].evidenceUrl = "https://github.com/CPTM511/IPO.ONE/issues/1#temporary-secret";
  assert.throws(() => verify(fragmentUrl), hasIssue("must not contain a URL fragment"));

  const nonRunApproval = validEvidence();
  nonRunApproval.externalAuthorization.approvalUrl = "https://github.com/CPTM511/IPO.ONE/issues/1";
  assert.throws(() => verify(nonRunApproval), hasIssue("immutable GitHub Actions run"));
});
