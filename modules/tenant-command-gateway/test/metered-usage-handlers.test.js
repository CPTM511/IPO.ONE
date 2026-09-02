import assert from "node:assert/strict";
import test from "node:test";
import {
  createMeteredUsageEvidence,
  createMeteredUsagePolicy
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { admitMeteredUsageCommandHandler } from "../src/index.js";

const NOW = new Date("2026-09-02T01:05:02.000Z");
const PRICE_HASH = `0x${"1".repeat(64)}`;
const PAYLOAD_HASH = `0x${"2".repeat(64)}`;

function policy(overrides = {}) {
  return createMeteredUsagePolicy({
    policyId: "spend_policy_metered_001",
    tenantId: "tenant_metered_001",
    subjectId: "subject_agent_metered_001",
    principalId: "principal_metered_001",
    mandateId: "mandate_metered_001",
    facilityId: "credit_line_metered_001",
    authorizationId: "acceptance_metered_001",
    obligationId: "obligation_metered_001",
    providerId: "provider_metered_001",
    resourceClass: "inference_tokens",
    measurementUnit: "token",
    priceScheduleHash: PRICE_HASH,
    unitPriceMinor: "2",
    assetId: "iso4217:USD",
    maxQuantityPerEvent: "1000",
    maxChargePerEventMinor: "2000",
    maxChargePerWindowMinor: "5000",
    validFrom: "2026-09-02T00:00:00.000Z",
    expiresAt: "2026-09-03T00:00:00.000Z",
    ...overrides
  });
}

function evidence(overrides = {}) {
  return createMeteredUsageEvidence({
    usageEvidenceId: "usage_metered_001",
    providerEventId: "provider_event_metered_001",
    nonce: "nonce_metered_001",
    tenantId: "tenant_metered_001",
    subjectId: "subject_agent_metered_001",
    principalId: "principal_metered_001",
    mandateId: "mandate_metered_001",
    facilityId: "credit_line_metered_001",
    authorizationId: "acceptance_metered_001",
    obligationId: "obligation_metered_001",
    providerId: "provider_metered_001",
    resourceClass: "inference_tokens",
    measurementUnit: "token",
    quantity: "250",
    priceScheduleHash: PRICE_HASH,
    unitPriceMinor: "2",
    chargeMinor: "500",
    assetId: "iso4217:USD",
    windowStartedAt: "2026-09-02T01:00:00.000Z",
    windowEndedAt: "2026-09-02T01:05:00.000Z",
    observedAt: "2026-09-02T01:05:01.000Z",
    finality: "finalized",
    reconciliation: "reconciled",
    providerKeyId: "synthetic_key_v1",
    providerPayloadHash: PAYLOAD_HASH,
    ...overrides
  });
}

function resources() {
  const obligation = {
    obligationId: "obligation_metered_001",
    obligationHash: `0x${"3".repeat(64)}`,
    subjectId: "subject_agent_metered_001",
    principalId: "principal_metered_001",
    mandateId: "mandate_metered_001",
    creditOfferAcceptanceId: "acceptance_metered_001",
    assetId: "iso4217:USD",
    outstandingPrincipalMinor: "5000",
    executionStatus: "executed",
    status: "active",
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "obligation.v2"
  };
  return {
    [CoreProjectionType.OBLIGATION]: obligation,
    [CoreProjectionType.MANDATE]: {
      mandateId: "mandate_metered_001",
      subjectId: "subject_agent_metered_001",
      principalId: "principal_metered_001",
      capabilities: ["provider_spend"],
      allowedProviderIds: ["provider_metered_001"],
      allowedCategories: ["model_api"],
      assetIds: ["iso4217:USD"],
      perActionLimitMinor: "2000",
      aggregateLimitMinor: "10000",
      utilizedMinor: "1000",
      validFrom: "2026-09-02T00:00:00.000Z",
      expiresAt: "2026-09-03T00:00:00.000Z",
      status: "active",
      sandboxOnly: true,
      productionAuthority: false,
      schemaVersion: "mandate.v3"
    },
    [CoreProjectionType.SPEND_POLICY]: {
      spendPolicyId: "spend_policy_metered_001",
      subjectId: "subject_agent_metered_001",
      providerId: "provider_metered_001",
      assetId: "iso4217:USD",
      category: "model_api",
      perTxLimitMinor: "2000",
      dailyLimitMinor: "5000",
      obligationCapMinor: "5000",
      dailySpentMinor: "1000",
      dailySpentDate: "2026-09-02",
      status: "active",
      schemaVersion: "spend_policy.v1"
    },
    [CoreProjectionType.PROVIDER]: {
      providerId: "provider_metered_001",
      status: "allowlisted",
      schemaVersion: "provider.v1"
    },
    lockbox: {
      lockboxId: "lockbox_metered_001",
      obligationId: "obligation_metered_001",
      subjectId: "subject_agent_metered_001",
      principalId: "principal_metered_001",
      mandateId: "mandate_metered_001",
      creditLineId: "credit_line_metered_001",
      assetId: "iso4217:USD",
      allowedProviderIds: ["provider_metered_001"],
      status: "active",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "lockbox.v2"
    }
  };
}

function context({ identityRows = [], tenantId = "tenant_metered_001" } = {}) {
  const values = resources();
  return {
    client: {},
    coreRepository: {
      async findMeteredUsageEvidenceIdentityInTransaction() {
        return identityRows;
      },
      async getProjectionStateInTransaction(_client, type) {
        return { value: structuredClone(values[type]), aggregateVersion: type === CoreProjectionType.OBLIGATION ? 8 : 1 };
      },
      async findAgentLockboxByObligationInTransaction() {
        return structuredClone(values.lockbox);
      },
      async getMeteredUsageWindowChargeInTransaction() {
        return "1000";
      },
      async getLedgerAccount() {
        return undefined;
      }
    },
    authenticationContext: {
      tenantId,
      actorId: "worker_metered_001",
      actorType: ActorType.SYSTEM_WORKER
    },
    authorizationDecision: {
      resourceType: "obligation",
      resourceId: "obligation_metered_001"
    },
    payload: {},
    now: NOW,
    requestId: "request-metered-001",
    correlationId: "correlation-metered-001"
  };
}

function payload(currentPolicy = policy(), currentEvidence = evidence()) {
  return {
    evidence: currentEvidence,
    expectedPolicyHash: currentPolicy.policyHash,
    providerSignature: "synthetic-signature-metered-001"
  };
}

function handler(currentPolicy = policy(), signatureAccepted = true) {
  return admitMeteredUsageCommandHandler({
    meteredUsagePolicyResolver: async () => currentPolicy,
    meteredUsageSignatureVerifier: async () => signatureAccepted
  });
}

test("plans one immutable Evidence/admission, Provider Spend reservation and balanced Ledger charge", async () => {
  const currentPolicy = policy();
  const command = handler(currentPolicy);
  const input = payload(currentPolicy);
  await command.preflight({ payload: input });
  const plan = await command.plan({ ...context(), payload: input });
  assert.equal(plan.aggregateId, "obligation_metered_001");
  assert.equal(plan.events[0].expectedVersion, 8);
  assert.equal(plan.response.admission.windowChargeBeforeMinor, "1000");
  assert.equal(plan.response.admission.windowChargeAfterMinor, "1500");
  assert.equal(plan.response.productionFundsMoved, false);
  assert.equal(plan.response.nextAction, "review_metered_usage_receipt");
  assert.deepEqual(plan.writes.map(({ type }) => type), [
    CoreProjectionType.OBLIGATION,
    CoreProjectionType.METERED_USAGE_EVIDENCE,
    CoreProjectionType.METERED_USAGE_ADMISSION,
    CoreProjectionType.MANDATE_RESERVATION,
    CoreProjectionType.MANDATE,
    CoreProjectionType.SPEND_POLICY,
    CoreProjectionType.SPEND_REQUEST,
    CoreProjectionType.LEDGER_ACCOUNT,
    CoreProjectionType.LEDGER_ACCOUNT,
    CoreProjectionType.LEDGER_TRANSACTION
  ]);
  const transaction = plan.writes.at(-1).value;
  assert.equal(transaction.debitTotalMinor, "500");
  assert.equal(transaction.creditTotalMinor, "500");
});

test("rejects bad signature, duplicate identity, cross-Tenant authority and policy drift", async () => {
  const currentPolicy = policy();
  const input = payload(currentPolicy);
  await assert.rejects(
    () => handler(currentPolicy, false).preflight({ payload: input }),
    (error) => error.code === "metered_usage_signature_rejected"
  );
  await assert.rejects(
    () => handler(currentPolicy).plan({ ...context({ identityRows: [evidence()] }), payload: input }),
    (error) => error.code === "metered_usage_replay_conflict"
  );
  await assert.rejects(
    () => handler(currentPolicy).plan({ ...context({ tenantId: "tenant_other" }), payload: input }),
    (error) => error.code === "tenant_resource_unavailable"
  );
  await assert.rejects(
    () => handler(policy({ unitPriceMinor: "3" })).plan({ ...context(), payload: input }),
    (error) => error.code === "tenant_resource_unavailable"
  );
});
