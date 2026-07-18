import assert from "node:assert/strict";
import test from "node:test";
import { TENANT_OPERATION_POLICIES } from "../../authorization/src/index.js";
import {
  ABUSE_CONTROL_POLICY,
  ABUSE_POLICY_VERSION,
  HARD_CEILINGS,
  QUOTA_PROFILES,
  QuotaClass,
  RequestMetric,
  ResourceKind,
  TENANT_ABUSE_OPERATION_POLICIES
} from "../src/index.js";

test("ABUSE-001 policy preserves approved SEC-D08 pilot defaults", () => {
  assert.equal(ABUSE_CONTROL_POLICY.policyVersion, ABUSE_POLICY_VERSION);
  assert.equal(QUOTA_PROFILES.discovery.rate.network, 30);
  assert.equal(QUOTA_PROFILES.read.rate.actor, 600);
  assert.equal(QUOTA_PROFILES.read.rate.tenant, 3_000);
  assert.equal(QUOTA_PROFILES.mutation.rate.actor, 120);
  assert.equal(QUOTA_PROFILES.mutation.rate.tenant, 600);
  assert.equal(QUOTA_PROFILES.economic.rate.actor, 30);
  assert.equal(QUOTA_PROFILES.economic.idempotencyRequired, true);
  assert.equal(QUOTA_PROFILES.credential.windowMs, 10 * 60_000);
  assert.equal(QUOTA_PROFILES.credential.rate.account, 10);
  assert.equal(QUOTA_PROFILES.credential.rate.network, 10);
  assert.equal(QUOTA_PROFILES.privileged.rate.actor, 30);
  assert.equal(QUOTA_PROFILES.privileged.maxAutomaticRetries, 0);
  assert.equal(QUOTA_PROFILES.batch.rate.tenant, 6);
  assert.equal(QUOTA_PROFILES.batch.metrics[RequestMetric.EXPORT_ROWS], 10_000);
});

test("every authenticated operation has exactly one closed quota classification", () => {
  assert.equal(TENANT_ABUSE_OPERATION_POLICIES.length, TENANT_OPERATION_POLICIES.length);
  assert.deepEqual(
    [...TENANT_ABUSE_OPERATION_POLICIES.map((item) => item.operationId)].sort(),
    [...TENANT_OPERATION_POLICIES.map((item) => item.operationId)].sort()
  );
  assert.equal(new Set(TENANT_ABUSE_OPERATION_POLICIES.map((item) => item.operationId)).size,
    TENANT_ABUSE_OPERATION_POLICIES.length);
  for (const item of TENANT_ABUSE_OPERATION_POLICIES) {
    assert.equal(Object.hasOwn(QUOTA_PROFILES, item.quotaClass), true);
    assert.equal(item.policyVersion, ABUSE_POLICY_VERSION);
  }
  const economic = new Set(TENANT_ABUSE_OPERATION_POLICIES
    .filter((item) => item.quotaClass === QuotaClass.ECONOMIC)
    .map((item) => item.operationId));
  assert.deepEqual(economic, new Set([
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment",
    "pilotRequestCredit",
    "pilotEvaluateCreditApplication",
    "pilotSubmitSpend",
    "pilotCaptureRevenue",
    "pilotAutoRepay",
    "workerAutoRepay"
  ]));
  const byOperation = new Map(TENANT_ABUSE_OPERATION_POLICIES.map((item) => [item.operationId, item]));
  assert.equal(byOperation.get("pilotReadMandate").quotaClass, QuotaClass.READ);
  assert.equal(byOperation.get("pilotRevokeDraftMandate").quotaClass, QuotaClass.MUTATION);
});

test("all configured values remain within immutable hard ceilings", () => {
  assert.equal(HARD_CEILINGS.resources[ResourceKind.AGENT_SUBJECTS], 500);
  assert.equal(HARD_CEILINGS.resources[ResourceKind.MANDATES], 1_000);
  assert.equal(HARD_CEILINGS.resources[ResourceKind.CREDIT_DECISIONS], 1_000);
  for (const profile of Object.values(QUOTA_PROFILES)) {
    assert.ok(profile.windowMs <= HARD_CEILINGS.rate.windowMs);
    for (const [scope, value] of Object.entries(profile.rate)) {
      assert.ok(value <= HARD_CEILINGS.rate[scope], `${profile.quotaClass}.${scope}`);
    }
    for (const [scope, value] of Object.entries(profile.concurrency)) {
      assert.ok(value <= HARD_CEILINGS.concurrency[scope], `${profile.quotaClass}.${scope}`);
    }
    for (const [metric, value] of Object.entries(profile.metrics)) {
      assert.ok(value <= HARD_CEILINGS.metrics[metric], `${profile.quotaClass}.${metric}`);
    }
    for (const [kind, value] of Object.entries(profile.resources)) {
      assert.ok(value <= HARD_CEILINGS.resources[kind], `${profile.quotaClass}.${kind}`);
    }
    assert.ok(profile.admissionLeaseMs <= HARD_CEILINGS.admissionLeaseMs);
    assert.ok(profile.maxAutomaticRetries <= HARD_CEILINGS.automaticRetries);
  }
});
