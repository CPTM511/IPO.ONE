import assert from "node:assert/strict";
import test from "node:test";
import {
  MandateCapability,
  MandateStatus,
  SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
  SANDBOX_MANDATE_ASSET_ID,
  activateSandboxMandate,
  createMandate
} from "../src/index.js";

const NOW = new Date("2026-07-15T00:00:00.000Z");

function draft(overrides = {}) {
  return createMandate({
    principalId: "principal_controller",
    subjectId: "subject_agent",
    capabilities: [
      MandateCapability.REQUEST_CREDIT,
      MandateCapability.ACCEPT_CREDIT_OFFER,
      MandateCapability.EXECUTE_SANDBOX_CREDIT
    ],
    assetIds: [SANDBOX_MANDATE_ASSET_ID],
    perActionLimitMinor: "10000",
    aggregateLimitMinor: "50000",
    validFrom: "2026-07-14T00:00:00.000Z",
    expiresAt: "2027-01-14T00:00:00.000Z",
    nonce: "mandate-activation-test-0001",
    termsRef: "urn:ipo.one:terms:sandbox-mandate:v1",
    now: new Date("2026-07-14T00:00:00.000Z"),
    ...overrides
  });
}

test("Principal acknowledgement activates the exact sandbox Mandate version", () => {
  const mandate = draft();
  const active = activateSandboxMandate(mandate, {
    expectedMandateHash: mandate.mandateHash,
    acknowledgedTermsHash: mandate.termsHash,
    acknowledgementCode: SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
    activatedByActorId: "actor_controller",
    now: NOW
  });
  assert.equal(active.status, MandateStatus.ACTIVE);
  assert.equal(active.schemaVersion, "mandate.v3");
  assert.equal(active.sandboxOnly, true);
  assert.equal(active.productionAuthority, false);
  assert.match(active.activationAcknowledgement.evidenceHash, /^0x[0-9a-f]{64}$/);
  assert.equal(mandate.status, MandateStatus.DRAFT);
});

test("activation rejects stale hashes and incomplete capability scope", () => {
  const mandate = draft();
  assert.throws(() => activateSandboxMandate(mandate, {
    expectedMandateHash: `0x${"0".repeat(64)}`,
    acknowledgedTermsHash: mandate.termsHash,
    acknowledgementCode: SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
    activatedByActorId: "actor_controller",
    now: NOW
  }), /mandate_acknowledgement_stale/);

  const incomplete = draft({ capabilities: [MandateCapability.REQUEST_CREDIT] });
  assert.throws(() => activateSandboxMandate(incomplete, {
    expectedMandateHash: incomplete.mandateHash,
    acknowledgedTermsHash: incomplete.termsHash,
    acknowledgementCode: SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
    activatedByActorId: "actor_controller",
    now: NOW
  }), /mandate_scope_not_activatable/);
});
