import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deriveReferenceAgentAcceptanceSecret,
  loadReferenceAgentAcceptanceScope,
  requireReferenceAgentAcceptanceAction
} from "../src/agent-reference-acceptance-scope.js";
import { derivePrivatePilotAgentAccount } from "../src/private-pilot-agent-account.js";

const source = await readFile(
  new URL("../src/agent-reference-acceptance.js", import.meta.url),
  "utf8"
);
const recoverySource = source.slice(
  source.indexOf("async function recoverCurrentReferenceAcceptance"),
  source.indexOf("const humanRuntime")
);

test("reference Agent acceptance locates one current v2 lifecycle read-only", () => {
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /account\.chain_id = 'eip155:1952'/);
  assert.match(source, /line\.schema_version = 'credit_line\.v2'/);
  for (const identifier of [
    "facility_id",
    "mandate_id",
    "credit_intent_id",
    "credit_offer_id",
    "obligation_id"
  ]) {
    assert.match(source, new RegExp(`line\\.${identifier}`));
  }
  assert.match(source, /if \(reference\.recovery\)/);
});

test("reference Agent restart recovery uses canonical reads without a second lifecycle", () => {
  for (const read of [
    "getMandate",
    "resumeWorkspace",
    "getSelf",
    "getAccountBinding",
    "getCreditApplication",
    "getOwnObligation",
    "getOwnObligationEvidence"
  ]) {
    assert.match(recoverySource, new RegExp(`\\.${read}\\(`));
  }
  for (const mutation of [
    "createDraftMandate",
    "activateSandboxMandate",
    "submitAccountProof",
    "runLocalAgentApplicationWorkflow",
    "runLocalAgentRuntimeWorkflow"
  ]) {
    assert.doesNotMatch(recoverySource, new RegExp(mutation));
  }
  assert.match(source, /obligation\?\.status === "fully_repaid"/);
  assert.match(source, /obligation\?\.outstandingPrincipalMinor === "0"/);
  assert.match(source, /"obligation_sandbox_executed"/);
  assert.match(source, /"repayment_posted"/);
});

test("exact Agent acceptance requires ordered candidate-bound phases", () => {
  const candidateReleaseId = "a".repeat(40);
  const before = loadReferenceAgentAcceptanceScope({
    IPO_ONE_M1_B_RELEASE_SHA: candidateReleaseId,
    IPO_ONE_M1_B_ACCEPTANCE_PHASE: "before_restart"
  });
  const after = loadReferenceAgentAcceptanceScope({
    IPO_ONE_M1_B_RELEASE_SHA: candidateReleaseId,
    IPO_ONE_M1_B_ACCEPTANCE_PHASE: "after_restart"
  });

  assert.equal(before.displayName, `IPO.ONE M1-B Agent ${candidateReleaseId}`);
  assert.equal(before.mandateNonce, `m1b.agent.${candidateReleaseId}`);
  assert.equal(requireReferenceAgentAcceptanceAction(before, null), "execute");
  assert.equal(requireReferenceAgentAcceptanceAction(before, { subjectStatus: "pending" }), "execute");
  assert.equal(
    requireReferenceAgentAcceptanceAction(before, {
      recovery: { obligationId: "obligation_1" }
    }),
    "execute"
  );
  assert.equal(
    requireReferenceAgentAcceptanceAction(after, { recovery: { obligationId: "obligation_1" } }),
    "recover"
  );
  assert.throws(
    () => requireReferenceAgentAcceptanceAction(after, null),
    (error) => error.code === "reference_agent_candidate_recovery_unavailable"
  );
});

test("exact pre-restart Agent acceptance always crosses MCP and re-queries its lifecycle", () => {
  assert.match(source, /runLocalAgentRuntimeWorkflow\(/);
  assert.match(source, /const completedCandidate = scope\.mode === "exact_release"/);
  assert.match(source, /requireCanonicalRecoveryIds\(completedCandidate\?\.recovery\)/);
  assert.match(source, /lifecycle\.mcpReceipt/);
  assert.match(source, /databaseStartedAt: completedCandidate\.databaseStartedAt/);
  assert.match(source, /accountHash: reference\.expectedAccountHash/);
});

test("active-Mandate retry consumes the persisted Offer without inventing an application handoff", () => {
  assert.match(source, /const applicationHandoff = mandate\.status === "draft"/);
  assert.match(source, /const recoveredApplicationHandoff = applicationHandoff \?\?/);
  assert.match(source, /status: "offer_recovered"/);
  assert.match(source, /nonAuthorizing: true/);
  assert.match(source, /reference_agent_candidate_offer_unavailable/);
});

test("exact Mandate retries keep the original command payload stable", () => {
  assert.match(source, /s\.created_at AS subject_created_at/);
  assert.match(source, /subjectCreatedAt = databaseClock\?\.subjectCreatedAt/);
  assert.match(source, /subjectCreatedAt,\n\s+candidateLifecycle/);
  assert.match(source, /new Date\(reference\.subjectCreatedAt\)/);
  assert.match(source, /`m1b-agent-mandate-\$\{scope\.candidateReleaseId\}`/);
  assert.match(source, /nonce: scope\.mandateNonce/);
});

test("post-restart output is exact and does not misstate audit-free database reads", () => {
  assert.match(recoverySource, /canonicalLifecycleReadOnly: true/);
  assert.match(recoverySource, /lifecycleMutationPerformed: false/);
  assert.doesNotMatch(recoverySource, /\breadOnly: true/);
  assert.match(recoverySource, /candidateMarker: scope\.mandateNonce/);
  assert.match(recoverySource, /accountHash,/);
  assert.match(recoverySource, /databaseStartedAt,/);
  assert.match(recoverySource, /recoveryReceipt,/);
  assert.doesNotMatch(recoverySource, /\n\s+lifecycle,\n/);
});

test("exact Agent acceptance rejects an incomplete or drifted scope", () => {
  assert.deepEqual(loadReferenceAgentAcceptanceScope({}), { mode: "developer" });
  for (const environment of [
    { IPO_ONE_M1_B_RELEASE_SHA: "a".repeat(40) },
    { IPO_ONE_M1_B_ACCEPTANCE_PHASE: "before_restart" },
    {
      IPO_ONE_M1_B_RELEASE_SHA: "not-a-sha",
      IPO_ONE_M1_B_ACCEPTANCE_PHASE: "before_restart"
    },
    {
      IPO_ONE_M1_B_RELEASE_SHA: "a".repeat(40),
      IPO_ONE_M1_B_ACCEPTANCE_PHASE: "during_restart"
    }
  ]) {
    assert.throws(
      () => loadReferenceAgentAcceptanceScope(environment),
      (error) => error.code === "invalid_reference_agent_acceptance_scope"
    );
  }
});

test("candidate Agent account derivation is stable, Tenant-bound, and SHA-bound", () => {
  const databaseSecret = "s".repeat(43);
  const tenantId = "tenant_ipo_one_local_pilot";
  const firstSecret = deriveReferenceAgentAcceptanceSecret(
    databaseSecret,
    tenantId,
    "a".repeat(40)
  );
  const replaySecret = deriveReferenceAgentAcceptanceSecret(
    databaseSecret,
    tenantId,
    "a".repeat(40)
  );
  const nextSecret = deriveReferenceAgentAcceptanceSecret(
    databaseSecret,
    tenantId,
    "b".repeat(40)
  );
  const otherTenantSecret = deriveReferenceAgentAcceptanceSecret(
    databaseSecret,
    "tenant_other",
    "a".repeat(40)
  );

  assert.equal(firstSecret, replaySecret);
  assert.notEqual(firstSecret, nextSecret);
  assert.notEqual(firstSecret, otherTenantSecret);
  assert.notEqual(
    derivePrivatePilotAgentAccount(firstSecret, { tenantId }).address,
    derivePrivatePilotAgentAccount(nextSecret, { tenantId }).address
  );
  assert.notEqual(
    derivePrivatePilotAgentAccount(firstSecret, { tenantId }).address,
    derivePrivatePilotAgentAccount(databaseSecret, { tenantId }).address
  );
});
