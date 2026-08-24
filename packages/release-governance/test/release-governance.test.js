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

function validEvidence(profileId = "public_sandbox", selectedPolicy = policy) {
  const profile = selectedPolicy.profiles[profileId];
  const m2aTestnet = profileId === "live_testnet_secured_pool";
  return {
    schemaVersion: "ipo.one.launch-evidence/v1",
    policyVersion: selectedPolicy.policyVersion,
    profile: profileId,
    release: {
      repository: selectedPolicy.repository,
      commitSha: COMMIT_SHA,
      ciRunUrl: "https://github.com/CPTM511/IPO.ONE/actions/runs/123456789",
      imageUri: m2aTestnet
        ? null
        : `asia-southeast1-docker.pkg.dev/ipo-one/ipo-one/app@sha256:${IMAGE_DIGEST}`,
      builtAt: "2026-07-12T10:00:00.000Z"
    },
    capabilities: { ...profile.capabilities },
    externalAuthorization: {
      system: m2aTestnet
        ? "founder_exact_testnet_decision"
        : "protected_environment",
      environment: profile.environment,
      approvalUrl: m2aTestnet
        ? `https://github.com/CPTM511/IPO.ONE/commit/${COMMIT_SHA}`
        : "https://github.com/CPTM511/IPO.ONE/actions/runs/123456789",
      approvedAt: "2026-07-12T10:30:00.000Z"
    },
    gates: profile.gates
      .filter((gate) => gate.stage === undefined || gate.stage === "pre_deployment")
      .map((gate, index) => ({
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

test("launch policy exposes five staged M2 testnet gates and one exact enabled profile", () => {
  assert.equal(policy.profiles.public_sandbox.releaseEnabled, true);
  assert.equal(policy.profiles.closed_non_funds_pilot.releaseEnabled, false);
  assert.equal(policy.profiles.live_testnet_secured_pool.releaseEnabled, true);
  assert.equal(
    policy.profiles.live_testnet_secured_pool.exactProfile.poolContract,
    "0xe3a50a2BA033661F87C09A796f7ae4C8aDb93a1f"
  );
  assert.equal(
    policy.profiles.live_testnet_secured_pool.exactProfile.oracleAddress,
    "0xA67DDDEA7DF4b084cE70B0c87C16621664C4fb98"
  );
  assert.equal(policy.profiles.live_testnet_secured_pool.capabilities.realFundsEnabled, false);
  assert.equal(policy.profiles.live_testnet_secured_pool.capabilities.testAssetsEnabled, true);
  assert.equal(policy.profiles.live_testnet_secured_pool.capabilities.securedPoolEnabled, true);
  assert.equal(
    policy.profiles.live_testnet_secured_pool.capabilities.publicPoolParticipationEnabled,
    true
  );
  assert.equal(policy.profiles.live_testnet_secured_pool.capabilities.marketCreationEnabled, false);
  assert.equal(policy.profiles.live_testnet_secured_pool.capabilities.agentVenueExecutionEnabled, false);
  assert.deepEqual(
    policy.profiles.live_testnet_secured_pool.gates.map(({ id, stage }) => ({ id, stage })),
    [
      { id: "m2a_testnet_code_integrity", stage: "pre_deployment" },
      { id: "m2a_testnet_exact_configuration", stage: "pre_deployment" },
      { id: "m2a_testnet_authority_signer_safety", stage: "pre_deployment" },
      { id: "m2a_testnet_exact_deployment", stage: "runtime_enforced" },
      { id: "m2a_testnet_post_deployment_acceptance", stage: "post_deployment" }
    ]
  );
  assert.equal(
    policy.profiles.live_testnet_secured_pool.gates.some(
      ({ ownerRole }) => ownerRole === "Independent Security"
    ),
    false
  );
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

  const prematureM2Policy = structuredClone(policy);
  prematureM2Policy.profiles.live_testnet_secured_pool.exactProfile = null;
  assert.throws(
    () => validateLaunchPolicy(prematureM2Policy),
    hasIssue("exactProfile must be complete")
  );

  const placeholderM2Policy = structuredClone(policy);
  placeholderM2Policy.profiles.live_testnet_secured_pool.exactProfile = {
    chainId: "eip155:84532",
    poolContract: "REQUIRED_EXACT_ADDRESS",
    poolBytecodeHash: "REQUIRED_BYTES32",
    adapterVersion: "REQUIRED_VERSION",
    wethCollateral: "0x4200000000000000000000000000000000000006",
    testUsdcDebt: "REQUIRED_EXACT_ADDRESS",
    oracleAddress: "REQUIRED_EXACT_ADDRESS",
    oracleSource: "[REQUIRED_SOURCE]",
    marketCount: 1,
    runOwner: "[REQUIRED_OWNER]",
    deploymentApprovalRef: "[REQUIRED_APPROVAL]",
    configurationHash: "REQUIRED_BYTES32",
    realValueClassification: "test_assets_only"
  };
  assert.throws(
    () => validateLaunchPolicy(placeholderM2Policy),
    (error) => error instanceof LaunchEvidenceError && error.issues.length >= 8
  );
});

test("Base Sepolia test-assets release does not require Independent Security Evidence", () => {
  const evidence = validEvidence("live_testnet_secured_pool", policy);
  assert.deepEqual(
    evidence.gates.map(({ id }) => id),
    [
      "m2a_testnet_code_integrity",
      "m2a_testnet_exact_configuration",
      "m2a_testnet_authority_signer_safety"
    ]
  );
  const result = verifyLaunchEvidence(evidence, {
    policy,
    expectedProfile: "live_testnet_secured_pool",
    expectedCommitSha: COMMIT_SHA,
    now: NOW
  });
  assert.equal(result.status, "verified");
  assert.equal(result.gateCount, 3);
  assert.equal(result.imageUri, null);
  assert.equal(result.externalAuthorization, "founder_exact_testnet_decision");

  const productionShaped = validEvidence("live_testnet_secured_pool", policy);
  productionShaped.release.imageUri =
    `asia-southeast1-docker.pkg.dev/ipo-one/ipo-one/app@sha256:${IMAGE_DIGEST}`;
  productionShaped.externalAuthorization.system = "protected_environment";
  assert.throws(
    () => verifyLaunchEvidence(productionShaped, {
      policy,
      expectedProfile: "live_testnet_secured_pool",
      expectedCommitSha: COMMIT_SHA,
      now: NOW
    }),
    hasIssue("imageUri must be null")
  );

  evidence.gates.pop();
  assert.throws(
    () => verifyLaunchEvidence(evidence, {
      policy,
      expectedProfile: "live_testnet_secured_pool",
      expectedCommitSha: COMMIT_SHA,
      now: NOW
    }),
    hasIssue("is missing m2a_testnet_authority_signer_safety")
  );
});

test("mainnet or real-value profiles retain an Independent Security hard gate", () => {
  const realValueWithoutReview = structuredClone(policy);
  realValueWithoutReview.profiles.controlled_agent_credit_pilot.gates =
    realValueWithoutReview.profiles.controlled_agent_credit_pilot.gates.filter(
      ({ ownerRole }) => ownerRole !== "Independent Security"
    );
  assert.throws(
    () => validateLaunchPolicy(realValueWithoutReview),
    hasIssue("requires an Independent Security gate before mainnet or real value")
  );

  const mainnetWithoutReview = structuredClone(policy);
  mainnetWithoutReview.profiles.mainnet_engineering = {
    ...structuredClone(mainnetWithoutReview.profiles.public_sandbox),
    displayName: "Mainnet engineering candidate",
    releaseEnabled: false,
    environment: "mainnet-engineering",
    unlockRequirements: ["Independent Security review and explicit mainnet policy are required."]
  };
  assert.throws(
    () => validateLaunchPolicy(mainnetWithoutReview),
    hasIssue("requires an Independent Security gate before mainnet or real value")
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
    policyVersion: "1.3.1",
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

test("capability escalation and remaining policy-locked profiles fail closed", () => {
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
