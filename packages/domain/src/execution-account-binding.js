import {
  AccountBindingStatus,
  AgentAccountChallengeStatus,
  SubjectStatus,
  SubjectType
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import { assertCAIP10, assertCAIP2, assertNonEmptyString } from "./validators.js";

const BYTES32 = /^0x[0-9a-f]{64}$/;
const PURPOSE = "execution";
const PROTOCOL_VERSION = "1.2";
const ACTOR_TYPES = new Set(["human", "agent"]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function bytes32(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    fail("invalid_execution_account_binding", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function iso(name, value) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    fail("invalid_execution_account_binding", `${name} must be a valid timestamp`);
  }
  return parsed.toISOString();
}

export function assertExecutionBindingSubject(subject) {
  if (
    !subject ||
    !new Set([SubjectType.HUMAN, SubjectType.AGENT]).has(subject.subjectType) ||
    subject.status !== SubjectStatus.ACTIVE
  ) {
    fail(
      "execution_account_binding_subject_unavailable",
      "execution AccountBinding requires an existing active Human or Agent Subject"
    );
  }
  return subject;
}

export function createExecutionAccountBindingChallenge({
  subject,
  tenantHash,
  controllerActorHash,
  actorType,
  chainId,
  accountHash,
  nonce,
  typedDataHash,
  issuedAt,
  expiresAt,
  purpose = PURPOSE,
  protocolVersion = PROTOCOL_VERSION
}) {
  assertExecutionBindingSubject(subject);
  assertCAIP2(chainId);
  for (const [name, value] of Object.entries({
    tenantHash,
    controllerActorHash,
    accountHash,
    nonce,
    typedDataHash
  })) bytes32(name, value);
  if (!ACTOR_TYPES.has(actorType) || purpose !== PURPOSE || protocolVersion !== PROTOCOL_VERSION) {
    fail("invalid_execution_account_binding", "execution AccountBinding challenge context is invalid");
  }
  const normalizedIssuedAt = iso("issuedAt", issuedAt);
  const normalizedExpiresAt = iso("expiresAt", expiresAt);
  if (new Date(normalizedExpiresAt) <= new Date(normalizedIssuedAt)) {
    fail("invalid_execution_account_binding", "challenge expiry must follow issuance");
  }
  return Object.freeze({
    challengeId: createOperationalId("execution_account_binding_challenge"),
    subjectId: subject.subjectId,
    subjectHash: subject.subjectHash,
    tenantHash,
    controllerActorHash,
    actorType,
    chainId,
    accountHash,
    purpose,
    nonce,
    typedDataHash,
    status: AgentAccountChallengeStatus.PENDING,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedExpiresAt,
    consumedAt: undefined,
    protocolVersion,
    schemaVersion: "execution_account_binding_challenge.v1"
  });
}

export function consumeExecutionAccountBindingChallenge(challenge, { consumedAt }) {
  if (!challenge || challenge.status !== AgentAccountChallengeStatus.PENDING) {
    fail("execution_account_binding_challenge_consumed", "execution AccountBinding challenge is unavailable");
  }
  const normalizedConsumedAt = iso("consumedAt", consumedAt);
  if (new Date(challenge.expiresAt) <= new Date(normalizedConsumedAt)) {
    fail("execution_account_binding_challenge_expired", "execution AccountBinding challenge has expired");
  }
  return Object.freeze({
    ...challenge,
    status: AgentAccountChallengeStatus.CONSUMED,
    consumedAt: normalizedConsumedAt
  });
}

export function expireExecutionAccountBindingChallenge(challenge, { expiredAt }) {
  if (!challenge || challenge.status !== AgentAccountChallengeStatus.PENDING) {
    fail("execution_account_binding_challenge_consumed", "execution AccountBinding challenge is unavailable");
  }
  const normalizedExpiredAt = iso("expiredAt", expiredAt);
  if (new Date(challenge.expiresAt) > new Date(normalizedExpiredAt)) {
    fail("execution_account_binding_challenge_pending", "execution AccountBinding challenge is still current");
  }
  return Object.freeze({ ...challenge, status: AgentAccountChallengeStatus.EXPIRED, consumedAt: undefined });
}

export function createExecutionAccountBindingProofAttempt({
  challenge,
  proofHash,
  verificationMethod,
  attemptedAt
}) {
  bytes32("proofHash", proofHash);
  assertNonEmptyString("verificationMethod", verificationMethod);
  return Object.freeze({
    proofAttemptId: createOperationalId("execution_account_binding_proof_attempt"),
    challengeId: challenge.challengeId,
    subjectId: challenge.subjectId,
    accountHash: challenge.accountHash,
    chainId: challenge.chainId,
    proofHash,
    verificationMethod,
    outcome: "verified",
    attemptedAt: iso("attemptedAt", attemptedAt),
    schemaVersion: "execution_account_binding_proof_attempt.v1"
  });
}

export function createVerifiedExecutionAccountBinding({
  challenge,
  accountId,
  proofHash,
  verificationMethod,
  boundAt
}) {
  if (challenge?.status !== AgentAccountChallengeStatus.CONSUMED) {
    fail("execution_account_binding_challenge_unconsumed", "binding requires a consumed challenge");
  }
  assertCAIP10(accountId);
  bytes32("proofHash", proofHash);
  assertNonEmptyString("verificationMethod", verificationMethod);
  const chainId = accountId.split(":").slice(0, 2).join(":");
  if (chainId !== challenge.chainId) {
    fail("account_proof_chain_mismatch", "verified account chain does not match challenge");
  }
  return Object.freeze({
    accountBindingId: createOperationalId("account_binding"),
    subjectId: challenge.subjectId,
    accountHash: challenge.accountHash,
    accountIdRef: accountId,
    chainId,
    purpose: PURPOSE,
    signatureHash: proofHash,
    nonce: hashId("execution_account_binding_nonce", challenge.nonce),
    executionChallengeId: challenge.challengeId,
    controllerActorHash: challenge.controllerActorHash,
    bindingKind: "execution",
    proofHash,
    verificationMethod,
    protocolVersion: challenge.protocolVersion,
    status: AccountBindingStatus.ACTIVE,
    boundAt: iso("boundAt", boundAt),
    revokedAt: undefined,
    schemaVersion: "account_binding.v3"
  });
}

export function revokeExecutionAccountBinding(binding, { revokedAt }) {
  if (
    !binding ||
    binding.schemaVersion !== "account_binding.v3" ||
    binding.bindingKind !== "execution" ||
    binding.status !== AccountBindingStatus.ACTIVE
  ) {
    fail("execution_account_binding_not_revocable", "execution AccountBinding is not active");
  }
  return Object.freeze({
    ...binding,
    status: AccountBindingStatus.REVOKED,
    revokedAt: iso("revokedAt", revokedAt)
  });
}
