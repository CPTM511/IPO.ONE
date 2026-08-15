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

test("DEPLOY-001B recommends a compatible low-cost stack without procurement authority", () => {
  assert.equal(selection.status, "recommended_pending_founder_approval");
  assert.equal(selection.provisioningBlocked, true);
  assert.equal(selection.recommendation.optionId, "vercel_neon_cloud_run");
  assert.equal(selection.recommendation.databasePlan, "launch");
  assert.equal(selection.recommendation.databaseConnectionMode, "direct_tls_application_pool");
  assert.equal(selection.recommendation.workerActivation, "disabled");
  assert.equal(selection.compatibility.providerTransactionPoolAllowed, false);
  assert.equal(selection.compatibility.vercelDirectDatabaseAccessAllowed, false);
  assert.equal(Object.values(selection.authority).every((value) => value === false), true);
});

test("DEPLOY-001B rejects approval, provisioning, access, and billing expansion", () => {
  for (const value of [
    changed((candidate) => { candidate.status = "approved"; }),
    changed((candidate) => { candidate.provisioningBlocked = false; }),
    changed((candidate) => { candidate.authority.vercelProjectLinkEnabled = true; }),
    changed((candidate) => { candidate.authority.marketplaceInstallEnabled = true; }),
    changed((candidate) => { candidate.authority.billingCommitmentEnabled = true; }),
    changed((candidate) => { candidate.authority.databaseProvisioningEnabled = true; }),
    changed((candidate) => { candidate.authority.runtimeProvisioningEnabled = true; }),
    changed((candidate) => { candidate.authority.workerProvisioningEnabled = true; }),
    changed((candidate) => { candidate.authority.secretWriteEnabled = true; }),
    changed((candidate) => { candidate.authority.dnsMutationEnabled = true; }),
    changed((candidate) => { candidate.authority.remoteAccessEnabled = true; })
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
    changed((candidate) => { candidate.recommendation.databaseConnectionMode = "provider_transaction_pool"; }),
    changed((candidate) => { candidate.recommendation.runtimeMaximumInstances = 10; }),
    changed((candidate) => { candidate.recommendation.workerActivation = "enabled"; }),
    changed((candidate) => { candidate.compatibility.postgresMajorVersion = 18; }),
    changed((candidate) => { candidate.compatibility.nodeVersion = "26.0.0"; }),
    changed((candidate) => { candidate.compatibility.providerTransactionPoolAllowed = true; }),
    changed((candidate) => { candidate.compatibility.vercelDirectDatabaseAccessAllowed = true; }),
    changed((candidate) => { candidate.approvalInputs.pop(); }),
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
