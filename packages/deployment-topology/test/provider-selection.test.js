import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ProviderSelectionError,
  parseProviderSelection,
  validateProviderSelection
} from "../src/index.js";

const selectionText = await readFile(
  new URL("../../../deploy/closed-pilot/provider-selection.pending.json", import.meta.url),
  "utf8"
);
const selection = parseProviderSelection(selectionText);

function changed(change) {
  const value = structuredClone(selection);
  change(value);
  return value;
}

test("DEPLOY-001B selects the existing Vercel and Neon stack without new-provider authority", () => {
  assert.equal(selection.status, "founder_approved_existing_stack");
  assert.equal(selection.newProviderProvisioningBlocked, true);
  assert.equal(selection.recommendation.optionId, "existing_vercel_neon");
  assert.equal(selection.recommendation.databasePlan, "launch");
  assert.equal(selection.recommendation.databaseConnectionMode, "managed_tls_role_scoped_pool");
  assert.equal(selection.recommendation.runtimeProvider, "vercel_functions");
  assert.equal(selection.recommendation.workerActivation, "configured_not_cohort_activated");
  assert.equal(selection.compatibility.runtimeDatabaseAccessAllowed, true);
  assert.equal(selection.compatibility.runtimeMigrationsAllowed, false);
  assert.equal(selection.authority.existingVercelProjectUseEnabled, true);
  assert.equal(selection.authority.existingNeonProjectUseEnabled, true);
  assert.equal(selection.authority.newProviderProvisioningEnabled, false);
});

test("DEPLOY-001B rejects approval, provisioning, access, and billing expansion", () => {
  for (const value of [
    changed((candidate) => { candidate.status = "recommended_pending_founder_approval"; }),
    changed((candidate) => { candidate.newProviderProvisioningBlocked = false; }),
    changed((candidate) => { candidate.authority.newProviderProvisioningEnabled = true; }),
    changed((candidate) => { candidate.authority.planUpgradeEnabled = true; }),
    changed((candidate) => { candidate.authority.additionalControlPlaneEnabled = true; }),
    changed((candidate) => { candidate.authority.dnsMutationEnabled = true; }),
    changed((candidate) => { candidate.authority.remoteParticipantAccessEnabled = true; }),
    changed((candidate) => { candidate.authority.profileActivationEnabled = true; }),
    changed((candidate) => { candidate.authority.realFundsEnabled = true; })
  ]) {
    assert.throws(
      () => validateProviderSelection(value),
      (error) => error instanceof ProviderSelectionError && error.issues.length > 0
    );
  }
});

test("DEPLOY-001B rejects incompatible database, runtime, pooling, and worker changes", () => {
  for (const value of [
    changed((candidate) => { candidate.recommendation.databasePlan = "free"; }),
    changed((candidate) => { candidate.recommendation.databaseConnectionMode = "unmanaged_direct"; }),
    changed((candidate) => { candidate.recommendation.runtimeProvider = "google_cloud_run"; }),
    changed((candidate) => { candidate.recommendation.workerActivation = "cohort_activated"; }),
    changed((candidate) => { candidate.compatibility.postgresMajorVersion = 18; }),
    changed((candidate) => { candidate.compatibility.deployedNodeVersion = "26.0.0"; }),
    changed((candidate) => { candidate.compatibility.runtimeMigrationsAllowed = true; }),
    changed((candidate) => { candidate.compatibility.runtimeSeedingAllowed = true; }),
    changed((candidate) => { candidate.remainingInputs.pop(); }),
    changed((candidate) => { candidate.endpoint = "https://example.invalid"; })
  ]) {
    assert.throws(
      () => validateProviderSelection(value),
      (error) => error instanceof ProviderSelectionError && error.issues.length > 0
    );
  }
});

test("DEPLOY-001B requires canonical JSON", () => {
  assert.throws(
    () => parseProviderSelection(JSON.stringify(selection)),
    (error) => error instanceof ProviderSelectionError
  );
});
