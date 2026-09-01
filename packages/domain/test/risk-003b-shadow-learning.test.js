import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  createRisk003BShadowRun,
  RISK_003B_SHADOW_RUN_SCHEMA_VERSION
} from "../src/index.js";

const SOURCE_PATH =
  "artifacts/testnet/hl-testnet-001b-live-20260901-001.json";
const SOURCE_SHA256 =
  "eeb1f5e77de5397d7f2317c080770da44412cca3876145752ad1a2837f50aaa3";
const EVALUATED_AT = "2026-08-31T17:00:00.000Z";
const EXPECTED_SCOPE = Object.freeze({
  subjectReferenceHash:
    "0x11c8f1afced90e80a836e394fbe547182a59e52e584172d9999530a398aac74d",
  principalReferenceHash:
    "0xa858cb56e1c5d08b99578ce2d40e823842ea607a1538d573bb668c4f440a7931"
});
const sourceEvidence = JSON.parse(
  await readFile(new URL(`../../../${SOURCE_PATH}`, import.meta.url), "utf8")
);
const requireFromApiContract = createRequire(
  new URL("../../api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL("../../../schemas/v2/risk-003b-shadow-run.schema.json", import.meta.url),
    "utf8"
  )
);
const validate = new Ajv2020({ allErrors: true, strict: true }).addFormat(
  "date-time",
  {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  }
).compile(schema);

function source(overrides = {}) {
  return {
    sourceEvidence: structuredClone(sourceEvidence),
    sourceArtifactPath: SOURCE_PATH,
    sourceArtifactSha256: SOURCE_SHA256,
    scope: structuredClone(EXPECTED_SCOPE),
    admission: {
      owner: "risk_operations_shadow_owner",
      privacyReview: "passed",
      finality: "finalized",
      reconciled: true,
      revoked: false,
      invalidated: false,
      admittedAt: "2026-08-31T16:58:00.000Z"
    },
    activePolicySnapshot: {
      policyId: "agent_credit_hyperliquid_testnet",
      policyVersion: "agent_credit_hyperliquid_testnet.v2",
      authorizationVersion: "agent_credit_authorization.v1",
      decisionMode: "deterministic_active",
      maximumNotionalUsd: "12",
      maximumEffectiveLeverage: 1,
      candidateCommit: "eb3c0fa718bb82c141c34a7717df3e8ac7597033",
      authorizingSource: "hl_testnet_001b_exact_run"
    },
    ...overrides
  };
}

function run(overrides = {}) {
  return createRisk003BShadowRun({
    sources: [source()],
    expectedScope: EXPECTED_SCOPE,
    candidateVersion: "risk_003b_challenger.v1",
    challengerEnabled: true,
    evaluatedAt: EVALUATED_AT,
    ...overrides
  });
}

test("RISK-003B admits the exact finalized Testnet source and preserves the real loss", () => {
  const result = run();

  assert.equal(result.schemaVersion, RISK_003B_SHADOW_RUN_SCHEMA_VERSION);
  assert.equal(result.mode, "shadow");
  assert.equal(result.status, "succeeded");
  assert.equal(result.sourceManifest.finality, "finalized");
  assert.equal(result.sourceManifest.reconciled, true);
  assert.equal(result.featureSnapshot.outcomeFeatures.repaymentRatioBps, 9983);
  assert.equal(result.featureSnapshot.outcomeFeatures.lossRateBps, 16);
  assert.equal(result.featureSnapshot.outcomeFeatures.utilizationBps, 8538);
  assert.equal(
    result.featureSnapshot.outcomeFeatures.effectiveLeverageBps,
    103
  );
  assert.equal(result.outcomeLabel.label, "loss_outstanding");
  assert.equal(result.outcomeLabel.repaidPrincipalMinor, "1198");
  assert.equal(result.outcomeLabel.outstandingPrincipalMinor, "2");
  assert.equal(result.outcomeLabel.sourceObligationRewritten, false);
  assert.equal(result.challenger.recommendation, "insufficient_sample");
  assert.equal(result.offlineReport.sampleSize, 1);
  assert.equal(result.offlineReport.uncertainty, "very_high_single_testnet_observation");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.featureSnapshot), true);
  assert.equal(validate(result), true, JSON.stringify(validate.errors, null, 2));
});

test("RISK-003B replay is byte-semantic deterministic and duplicate delivery dedupes", () => {
  const first = run();
  const second = run();
  const duplicated = run({ sources: [source(), source()] });

  assert.deepEqual(first, second);
  assert.equal(first.shadowRunHash, second.shadowRunHash);
  assert.equal(first.idempotencyIdentity, second.idempotencyIdentity);
  assert.equal(duplicated.shadowRunHash, first.shadowRunHash);
  assert.equal(duplicated.duplicateDeliveryCount, 1);
  assert.equal(duplicated.offlineReport.sampleSize, 1);
});

test("RISK-003B rejects conflicting duplicate admission truth", () => {
  const conflicting = source({
    admission: {
      ...source().admission,
      admittedAt: "2026-08-31T16:59:00.000Z"
    }
  });
  assert.throws(
    () => run({ sources: [source(), conflicting] }),
    /duplicate source artifact has conflicting admission truth/
  );
});

test("RISK-003B fails closed on pending, revoked, invalidated or unreconciled admission", () => {
  for (const admission of [
    { ...source().admission, finality: "pending" },
    { ...source().admission, revoked: true },
    { ...source().admission, invalidated: true },
    { ...source().admission, reconciled: false },
    { ...source().admission, privacyReview: "pending" }
  ]) {
    assert.throws(
      () => run({ sources: [source({ admission })] }),
      /invalid|must be/
    );
  }
});

test("RISK-003B rejects unreconciled, unknown and policy-drifted source Evidence", () => {
  const unreconciled = source();
  unreconciled.sourceEvidence.independentReconciliation.status = "UNKNOWN";
  assert.throws(
    () => run({ sources: [unreconciled] }),
    /not cleanly reconciled/
  );

  const unknown = source();
  unknown.sourceEvidence.execution.unknownOutcome = true;
  assert.throws(
    () => run({ sources: [unknown] }),
    /must be false/
  );

  const drifted = source();
  drifted.activePolicySnapshot.maximumNotionalUsd = "13";
  assert.throws(
    () => run({ sources: [drifted] }),
    /active policy snapshot is not bound/
  );
});

test("RISK-003B rejects wrong scope and look-ahead chronology", () => {
  const wrongScope = source();
  wrongScope.scope.subjectReferenceHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.throws(
    () => run({ sources: [wrongScope] }),
    /source scope is not approved/
  );

  assert.throws(
    () => run({ evaluatedAt: "2026-08-31T16:56:00.000Z" }),
    /chronology|precedes source finality/
  );
});

test("RISK-003B keeps decision-time features separate from the outcome window", () => {
  const result = run();
  assert.equal(
    result.featureSnapshot.futureOutcomeDataIncludedInDecisionFeatures,
    false
  );
  assert.deepEqual(Object.keys(result.featureSnapshot.decisionFeatures).sort(), [
    "accountEquityBeforeUsd",
    "automaticRetryAllowed",
    "maximumEffectiveLeverage",
    "maximumNotionalUsd",
    "runCountCap"
  ]);
  assert.ok(
    new Date(result.featureSnapshot.outcomeWindow.finalizedAt).getTime() >
      new Date(result.featureSnapshot.decisionCutoffAt).getTime()
  );
});

test("RISK-003B challenger is optional and cannot mutate the active policy", () => {
  const enabled = run();
  const disabled = run({ challengerEnabled: false });

  assert.equal(enabled.activePolicyHashBefore, enabled.activePolicyHashAfter);
  assert.equal(enabled.activePolicyUnchanged, true);
  assert.equal(enabled.activePolicyMutationAllowed, false);
  assert.equal(enabled.modelPromotionAllowed, false);
  assert.equal(enabled.externalActionPerformed, false);
  assert.equal(enabled.authorizing, false);
  assert.equal(enabled.challenger.promotionState, "shadow");
  assert.equal(enabled.challenger.proposedCapacityMultiplierBps, null);
  assert.equal(disabled.challenger.evaluationStatus, "disabled");
  assert.equal(disabled.challenger.recommendation, "disabled");
  assert.equal(disabled.status, "succeeded");
  assert.equal(disabled.activePolicyUnchanged, true);
});

test("RISK-003B aggregate report excludes raw participant and resource identifiers", () => {
  const result = run();
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("subject_52fe853c"), false);
  assert.equal(serialized.includes("principal_53323a21"), false);
  assert.equal(
    serialized.includes(sourceEvidence.canonicalOutcome.facilityId),
    false
  );
  assert.equal(
    serialized.includes(sourceEvidence.canonicalOutcome.obligationId),
    false
  );
  assert.equal(result.offlineReport.participantIdentifiersIncluded, false);
  assert.equal(result.offlineReport.aggregateOnly, true);
});
