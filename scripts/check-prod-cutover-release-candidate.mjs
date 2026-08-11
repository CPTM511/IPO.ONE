import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifestPath = "deploy/local/prod-cutover-001.release-candidate.v1.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const launchPolicy = JSON.parse(
  await readFile("deploy/launch-policy.v1.json", "utf8")
);
const constitution = await readFile("docs/PRODUCT_CONSTITUTION.md", "utf8");

assert.equal(
  manifest.schemaVersion,
  "ipo.one.prod-cutover-release-candidate/v1"
);
assert.match(
  manifest.releaseCandidateId,
  /^prod-cutover-001-[0-9]{8}-[0-9]{3}$/
);
assert.equal(manifest.status, "preflight_sealed");
assert.equal(manifest.productProfile, "deployable_sandbox_vertical_slice");
assert.match(manifest.sourceBinding.integratedSourceCommit, /^[0-9a-f]{40}$/);
assert.match(manifest.sourceBinding.integratedSourceTree, /^[0-9a-f]{40}$/);

execFileSync(
  "git",
  [
    "merge-base",
    "--is-ancestor",
    manifest.sourceBinding.integratedSourceCommit,
    "HEAD"
  ],
  { stdio: "ignore" }
);
assert.equal(
  execFileSync(
    "git",
    ["rev-parse", `${manifest.sourceBinding.integratedSourceCommit}^{tree}`],
    { encoding: "utf8" }
  ).trim(),
  manifest.sourceBinding.integratedSourceTree
);
execFileSync("git", ["ls-files", "--error-unmatch", manifestPath], {
  stdio: "ignore"
});

assert.equal(manifest.verification.repositoryTests.passed, 899);
assert.equal(manifest.verification.repositoryTests.failed, 0);
assert.equal(manifest.verification.postgresTests.passed, 85);
assert.equal(manifest.verification.postgresTests.failed, 0);
assert.equal(manifest.verification.postgresTests.founderDataTouched, false);
assert.equal(manifest.browserPreflight.consoleErrors, 0);
assert.equal(
  manifest.browserPreflight.realSignatureRegression,
  "pending_founder_invited_wallet"
);
assert.equal(
  manifest.browserPreflight.syntheticSignatureSubstitutionAllowed,
  false
);

assert.equal(launchPolicy.profiles.public_sandbox.releaseEnabled, true);
assert.equal(
  launchPolicy.profiles.public_sandbox.capabilities.realFundsEnabled,
  false
);
assert.equal(
  launchPolicy.profiles.public_sandbox.capabilities.externalProviderExecutionEnabled,
  false
);
assert.equal(
  launchPolicy.profiles.controlled_agent_credit_pilot.releaseEnabled,
  false
);
assert.equal(
  launchPolicy.profiles.controlled_agent_credit_pilot.capabilities.realFundsEnabled,
  true
);
assert.match(
  constitution,
  /\| `L4_CONTROLLED_REAL_VALUE` \|[^\n]+\| Disabled;/
);
assert.match(
  constitution,
  /\| `L5_PRODUCTION` \|[^\n]+\| Not approved\. \|/
);

assert.equal(manifest.deploymentAuthority.realFundsEnabled, false);
assert.equal(
  manifest.deploymentAuthority.externalProviderExecutionEnabled,
  false
);
assert.equal(
  manifest.productionAuthorityState.constitutionL4ControlledRealValueEnabled,
  false
);
assert.equal(
  manifest.productionAuthorityState.constitutionL5ProductionApproved,
  false
);
assert.equal(
  manifest.productionAuthorityState.launchPolicyControlledAgentCreditReleaseEnabled,
  false
);
assert.equal(
  manifest.cutoverVerdictAtSeal,
  "BLOCKED — NOT PRODUCTION RELEASED"
);
assert.equal(manifest.blockingConditions.length, 6);

process.stdout.write(`${JSON.stringify({
  status: "verified",
  releaseCandidateId: manifest.releaseCandidateId,
  integratedSourceCommit: manifest.sourceBinding.integratedSourceCommit,
  productProfile: manifest.productProfile,
  realFundsEnabled: manifest.deploymentAuthority.realFundsEnabled,
  productionVerdict: manifest.cutoverVerdictAtSeal
})}\n`);
