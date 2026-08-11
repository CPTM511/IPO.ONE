import assert from "node:assert/strict";
import test from "node:test";
import {
  createExecutionAccountBindingChallenge,
  createExecutionAccountBindingProofAttempt,
  createVerifiedExecutionAccountBinding,
  consumeExecutionAccountBindingChallenge,
  hashId,
  revokeExecutionAccountBinding
} from "../src/index.js";

const NOW = new Date("2026-08-11T02:00:00.000Z");
const SUBJECT = Object.freeze({
  subjectId: "subject_human_execution_binding",
  subjectHash: hashId("subject", "subject_human_execution_binding"),
  subjectType: "human",
  status: "active"
});

function challenge(overrides = {}) {
  return createExecutionAccountBindingChallenge({
    subject: SUBJECT,
    tenantHash: hashId("tenant", "tenant_execution_binding"),
    controllerActorHash: hashId("actor", "actor_human_execution_binding"),
    actorType: "human",
    chainId: "eip155:84532",
    accountHash: hashId("account", "execution_binding_account"),
    nonce: `0x${"11".repeat(32)}`,
    typedDataHash: `0x${"22".repeat(32)}`,
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 300_000),
    ...overrides
  });
}

test("Human execution AccountBinding creates neither authentication nor authority state", () => {
  const consumed = consumeExecutionAccountBindingChallenge(challenge(), {
    consumedAt: new Date(NOW.getTime() + 30_000)
  });
  const attempt = createExecutionAccountBindingProofAttempt({
    challenge: consumed,
    proofHash: `0x${"33".repeat(32)}`,
    verificationMethod: "eip712_eoa_v1",
    attemptedAt: new Date(NOW.getTime() + 30_000)
  });
  const binding = createVerifiedExecutionAccountBinding({
    challenge: consumed,
    accountId: "eip155:84532:0x1111111111111111111111111111111111111111",
    proofHash: attempt.proofHash,
    verificationMethod: attempt.verificationMethod,
    boundAt: new Date(NOW.getTime() + 30_000)
  });

  assert.equal(binding.subjectId, SUBJECT.subjectId);
  assert.equal(binding.bindingKind, "execution");
  assert.equal(binding.purpose, "execution");
  assert.equal(binding.schemaVersion, "account_binding.v3");
  assert.equal(Object.hasOwn(binding, "actorId"), false);
  assert.equal(Object.hasOwn(binding, "role"), false);
  assert.equal(Object.hasOwn(binding, "executionAuthority"), false);
  assert.equal(Object.hasOwn(binding, "authenticationSession"), false);

  const revoked = revokeExecutionAccountBinding(binding, {
    revokedAt: new Date(NOW.getTime() + 60_000)
  });
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.subjectId, SUBJECT.subjectId);
});

test("execution AccountBinding admits only an existing active Human or Agent Subject", () => {
  for (const subject of [
    { ...SUBJECT, status: "pending" },
    { ...SUBJECT, subjectType: "provider" }
  ]) {
    assert.throws(
      () => challenge({ subject }),
      { code: "execution_account_binding_subject_unavailable" }
    );
  }
  assert.doesNotThrow(() => challenge({ subject: { ...SUBJECT, subjectType: "agent" }, actorType: "agent" }));
});
