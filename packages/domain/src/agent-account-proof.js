import {
  AccountBindingStatus,
  AgentAccountChallengeStatus,
  SubjectStatus,
  SubjectType
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import { assertCAIP10, assertCAIP2, assertNonEmptyString } from "./validators.js";

const PURPOSE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;

function assertHash(name, value) {
  if (typeof value !== "string" || !BYTES32_PATTERN.test(value)) {
    throw new DomainError("invalid_agent_account_proof", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function isoTime(name, value) {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) {
    throw new DomainError("invalid_agent_account_proof", `${name} must be an ISO timestamp`);
  }
  return time.toISOString();
}

export function assertPendingAgentSubject(subject) {
  if (
    !subject ||
    subject.subjectType !== SubjectType.AGENT ||
    subject.status !== SubjectStatus.PENDING
  ) {
    throw new DomainError(
      "agent_subject_not_pending",
      "account proof requires the exact pending Agent Subject"
    );
  }
  return subject;
}

export function createAgentAccountChallenge({
  subject,
  tenantHash,
  controllerActorHash,
  agentActorHash,
  chainId,
  accountHash,
  purpose,
  nonce,
  typedDataHash,
  issuedAt,
  expiresAt,
  protocolVersion = "1.1"
}) {
  assertPendingAgentSubject(subject);
  assertCAIP2(chainId);
  for (const [name, value] of Object.entries({ tenantHash, controllerActorHash, agentActorHash, accountHash, nonce, typedDataHash })) {
    assertHash(name, value);
  }
  if (!PURPOSE_PATTERN.test(purpose)) {
    throw new DomainError("invalid_agent_account_proof", "account purpose is invalid");
  }
  const normalizedIssuedAt = isoTime("issuedAt", issuedAt);
  const normalizedExpiresAt = isoTime("expiresAt", expiresAt);
  if (new Date(normalizedExpiresAt).getTime() <= new Date(normalizedIssuedAt).getTime()) {
    throw new DomainError("invalid_agent_account_proof", "challenge expiry must follow issuance");
  }
  if (protocolVersion !== "1.1") {
    throw new DomainError("invalid_agent_account_proof", "unsupported account proof protocol version");
  }
  return Object.freeze({
    challengeId: createOperationalId("agent_account_challenge"),
    subjectId: subject.subjectId,
    subjectHash: subject.subjectHash,
    tenantHash,
    controllerActorHash,
    agentActorHash,
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
    schemaVersion: "agent_account_challenge.v1"
  });
}

export function consumeAgentAccountChallenge(challenge, { consumedAt }) {
  if (!challenge || challenge.status !== AgentAccountChallengeStatus.PENDING) {
    throw new DomainError("account_proof_challenge_consumed", "account proof challenge is no longer available");
  }
  const normalizedConsumedAt = isoTime("consumedAt", consumedAt);
  if (new Date(challenge.expiresAt).getTime() <= new Date(normalizedConsumedAt).getTime()) {
    throw new DomainError("account_proof_challenge_expired", "account proof challenge has expired");
  }
  return Object.freeze({
    ...challenge,
    status: AgentAccountChallengeStatus.CONSUMED,
    consumedAt: normalizedConsumedAt
  });
}

export function expireAgentAccountChallenge(challenge, { expiredAt }) {
  if (!challenge || challenge.status !== AgentAccountChallengeStatus.PENDING) {
    throw new DomainError("account_proof_challenge_consumed", "account proof challenge is no longer available");
  }
  const normalizedExpiredAt = isoTime("expiredAt", expiredAt);
  if (new Date(challenge.expiresAt).getTime() > new Date(normalizedExpiredAt).getTime()) {
    throw new DomainError("account_proof_challenge_pending", "account proof challenge is still active");
  }
  return Object.freeze({
    ...challenge,
    status: AgentAccountChallengeStatus.EXPIRED,
    consumedAt: undefined
  });
}

export function createAgentAccountProofAttempt({ challenge, proofHash, verificationMethod, attemptedAt }) {
  assertHash("proofHash", proofHash);
  assertNonEmptyString("verificationMethod", verificationMethod);
  return Object.freeze({
    proofAttemptId: createOperationalId("agent_account_proof_attempt"),
    challengeId: challenge.challengeId,
    subjectId: challenge.subjectId,
    accountHash: challenge.accountHash,
    chainId: challenge.chainId,
    proofHash,
    verificationMethod,
    outcome: "verified",
    attemptedAt: isoTime("attemptedAt", attemptedAt),
    schemaVersion: "agent_account_proof_attempt.v1"
  });
}

export function createVerifiedAgentAccountBinding({ challenge, accountId, proofHash, verificationMethod, boundAt }) {
  assertCAIP10(accountId);
  assertHash("proofHash", proofHash);
  assertNonEmptyString("verificationMethod", verificationMethod);
  const chainId = accountId.split(":").slice(0, 2).join(":");
  if (chainId !== challenge.chainId) {
    throw new DomainError("account_proof_chain_mismatch", "verified account chain does not match challenge");
  }
  const normalizedBoundAt = isoTime("boundAt", boundAt);
  return Object.freeze({
    accountBindingId: createOperationalId("account_binding"),
    subjectId: challenge.subjectId,
    accountHash: challenge.accountHash,
    accountIdRef: accountId,
    chainId,
    purpose: challenge.purpose,
    signatureHash: proofHash,
    nonce: hashId("agent_account_challenge_nonce", challenge.nonce),
    challengeId: challenge.challengeId,
    proofHash,
    verificationMethod,
    protocolVersion: challenge.protocolVersion,
    status: AccountBindingStatus.ACTIVE,
    boundAt: normalizedBoundAt,
    revokedAt: undefined,
    schemaVersion: "account_binding.v2"
  });
}

export function activateAgentSubjectFromAccountProof(subject, { activatedAt }) {
  assertPendingAgentSubject(subject);
  const normalizedActivatedAt = isoTime("activatedAt", activatedAt);
  return Object.freeze({
    ...subject,
    status: SubjectStatus.ACTIVE,
    updatedAt: normalizedActivatedAt
  });
}
