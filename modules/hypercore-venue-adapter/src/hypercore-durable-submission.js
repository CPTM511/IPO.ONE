import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HypercoreDelegateStatus,
  verifyHypercoreAccountBinding,
  verifyHypercoreDelegate
} from "./hypercore-delegate.js";
import { verifyHypercorePreparedAction } from "./hypercore-action.js";
import {
  verifyHypercoreTestnetActionAuthorization,
  verifyHypercoreTestnetExchangeResult,
  verifyHypercoreTestnetProofPolicy
} from "./hypercore-testnet-proof.js";

export const HYPERCORE_TESTNET_SIGNER_HANDOFF_SCHEMA_VERSION =
  "hypercore_testnet_signer_handoff.v1";
export const HYPERCORE_TESTNET_FOUNDER_APPROVAL_SCHEMA_VERSION =
  "hypercore_testnet_founder_approval.v1";
export const HYPERCORE_TESTNET_SUBMISSION_ATTEMPT_SCHEMA_VERSION =
  "hypercore_testnet_submission_attempt.v1";

export const HypercoreTestnetSignerHandoffStatus = Object.freeze({
  VERIFIED: "VERIFIED",
  RETIRED: "RETIRED"
});

export const HypercoreTestnetFounderApprovalStatus = Object.freeze({
  APPROVED: "APPROVED",
  CONSUMED: "CONSUMED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED"
});

export const HypercoreTestnetSubmissionState = Object.freeze({
  PREPARED: "PREPARED",
  APPROVED: "APPROVED",
  SUBMITTING: "SUBMITTING",
  SUBMITTED: "SUBMITTED",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN",
  RECONCILED: "RECONCILED",
  CLOSED: "CLOSED"
});

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const TERMINAL_TRANSPORT_STATES = new Set([
  HypercoreTestnetSubmissionState.SUBMITTED,
  HypercoreTestnetSubmissionState.REJECTED,
  HypercoreTestnetSubmissionState.UNKNOWN
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactShape(name, value, required) {
  if (!plainObject(value)) {
    fail("invalid_hypercore_durable_submission_input", `${name} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...required].sort();
  if (
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index])
  ) {
    fail(
      "invalid_hypercore_durable_submission_input",
      `${name} has an invalid closed shape`
    );
  }
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_durable_submission_input", `${name} must be bytes32`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_durable_submission_input", `${name} is invalid`);
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_durable_submission_input", `${name} must be trusted`);
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_hypercore_durable_submission_input", `${name} must be ISO time`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    fail("invalid_hypercore_durable_submission_input", `${name} must be canonical`);
  }
  return date;
}

function positiveSafeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(
      "invalid_hypercore_durable_submission_input",
      `${name} must be a positive safe integer`
    );
  }
  return value;
}

function cloneFreeze(value) {
  const clone = structuredClone(value);
  const freeze = (item) => {
    if (Array.isArray(item)) for (const nested of item) freeze(nested);
    else if (item && typeof item === "object") {
      for (const nested of Object.values(item)) freeze(nested);
    }
    return Object.freeze(item);
  };
  return freeze(clone);
}

function handoffCore(value) {
  const { handoffId: _id, handoffHash: _hash, ...core } = value;
  return core;
}

function approvalIdentity(value) {
  const {
    approvalId: _id,
    approvalHash: _hash,
    status: _status,
    consumedAt: _consumedAt,
    version: _version,
    ...identity
  } = value;
  return identity;
}

export function createHypercoreTestnetSignerHandoff({
  binding,
  delegate,
  registrationEvidenceHash,
  verifiedAt,
  expiresAt
}) {
  verifyHypercoreAccountBinding(binding);
  verifyHypercoreDelegate(delegate);
  bytes32("registrationEvidenceHash", registrationEvidenceHash);
  const verified = trustedDate("verifiedAt", verifiedAt);
  const expires = trustedDate("expiresAt", expiresAt);
  if (
    delegate.status !== HypercoreDelegateStatus.PREPARED ||
    delegate.accountBindingId !== binding.accountBindingId ||
    delegate.accountBindingHash !== binding.accountBindingHash ||
    delegate.canonicalAccountAddressHash !== binding.canonicalAccountAddressHash ||
    expires <= verified ||
    expires > new Date(delegate.expiresAt)
  ) {
    fail(
      "hypercore_testnet_signer_handoff_denied",
      "binding, delegate or handoff lifetime is unavailable"
    );
  }
  const value = {
    accountBindingId: binding.accountBindingId,
    accountBindingHash: binding.accountBindingHash,
    canonicalAccountAddressHash: binding.canonicalAccountAddressHash,
    delegateId: delegate.delegateId,
    delegateHash: delegate.delegateHash,
    apiWalletAddressHash: delegate.apiWalletAddressHash,
    signerReferenceHash: delegate.signerReferenceHash,
    registrationEvidenceHash,
    status: HypercoreTestnetSignerHandoffStatus.VERIFIED,
    verifiedAt: verified.toISOString(),
    expiresAt: expires.toISOString(),
    retiredAt: null,
    retirementEvidenceHash: null,
    version: 1,
    rawAddressPersisted: false,
    rawKeyAccepted: false,
    rawKeyPersisted: false,
    rawSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_TESTNET_SIGNER_HANDOFF_SCHEMA_VERSION
  };
  const handoffHash = hashId("hypercore_testnet_signer_handoff", value);
  return cloneFreeze({
    handoffId: `hypercore_testnet_handoff_${handoffHash.slice(2)}`,
    handoffHash,
    ...value
  });
}

export function verifyHypercoreTestnetSignerHandoff(value) {
  exactShape("signer handoff", value, [
    "handoffId", "handoffHash", "accountBindingId", "accountBindingHash",
    "canonicalAccountAddressHash", "delegateId", "delegateHash",
    "apiWalletAddressHash", "signerReferenceHash", "registrationEvidenceHash",
    "status", "verifiedAt", "expiresAt", "retiredAt",
    "retirementEvidenceHash", "version", "rawAddressPersisted",
    "rawKeyAccepted", "rawKeyPersisted", "rawSignaturePersisted",
    "mainnetAuthority", "productionAuthority", "realFundsAuthority",
    "schemaVersion"
  ]);
  for (const key of [
    "handoffHash", "accountBindingHash", "canonicalAccountAddressHash",
    "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
    "registrationEvidenceHash"
  ]) bytes32(key, value[key]);
  bytes32("retirementEvidenceHash", value.retirementEvidenceHash, {
    nullable: true
  });
  timestamp("verifiedAt", value.verifiedAt);
  const expires = timestamp("expiresAt", value.expiresAt);
  const retired = value.retiredAt === null ? null : timestamp("retiredAt", value.retiredAt);
  const active = value.status === HypercoreTestnetSignerHandoffStatus.VERIFIED;
  if (
    !Object.values(HypercoreTestnetSignerHandoffStatus).includes(value.status) ||
    (active && (retired !== null || value.retirementEvidenceHash !== null || value.version !== 1)) ||
    (!active && (retired === null || value.retirementEvidenceHash === null || value.version !== 2)) ||
    expires <= new Date(value.verifiedAt) ||
    value.rawAddressPersisted !== false ||
    value.rawKeyAccepted !== false ||
    value.rawKeyPersisted !== false ||
    value.rawSignaturePersisted !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_TESTNET_SIGNER_HANDOFF_SCHEMA_VERSION ||
    !IDENTIFIER.test(value.handoffId) ||
    hashId("hypercore_testnet_signer_handoff", handoffCore(value)) !== value.handoffHash
  ) {
    fail("invalid_hypercore_testnet_signer_handoff", "signer handoff drifted");
  }
  return true;
}

export function retireHypercoreTestnetSignerHandoff({
  handoff,
  retirementEvidenceHash,
  now
}) {
  verifyHypercoreTestnetSignerHandoff(handoff);
  bytes32("retirementEvidenceHash", retirementEvidenceHash);
  const retiredAt = trustedDate("now", now);
  if (
    handoff.status !== HypercoreTestnetSignerHandoffStatus.VERIFIED ||
    retiredAt < new Date(handoff.verifiedAt)
  ) {
    fail("hypercore_testnet_signer_retirement_denied", "signer is not retireable");
  }
  const transitioned = {
    ...structuredClone(handoff),
    status: HypercoreTestnetSignerHandoffStatus.RETIRED,
    retiredAt: retiredAt.toISOString(),
    retirementEvidenceHash,
    version: 2
  };
  delete transitioned.handoffId;
  delete transitioned.handoffHash;
  const handoffHash = hashId("hypercore_testnet_signer_handoff", transitioned);
  return cloneFreeze({
    handoffId: handoff.handoffId,
    handoffHash,
    ...transitioned
  });
}

function attemptIdentity(value) {
  return {
    economicActionHash: value.economicActionHash,
    idempotencyKeyHash: value.idempotencyKeyHash,
    facilityId: value.facilityId,
    accountBindingId: value.accountBindingId,
    accountBindingHash: value.accountBindingHash,
    canonicalAccountAddressHash: value.canonicalAccountAddressHash,
    handoffId: value.handoffId,
    handoffHash: value.handoffHash,
    delegateId: value.delegateId,
    delegateHash: value.delegateHash,
    apiWalletAddressHash: value.apiWalletAddressHash,
    signerReferenceHash: value.signerReferenceHash,
    preparedActionHash: value.preparedActionHash,
    policyHash: value.policyHash,
    metadataHash: value.metadataHash,
    riskSnapshotHash: value.riskSnapshotHash,
    actionKind: value.actionKind,
    market: value.market,
    maxOrderNotionalUsd: value.maxOrderNotionalUsd,
    openingTimeInForce: value.openingTimeInForce,
    nonce: value.nonce,
    expiresAt: value.expiresAt
  };
}

export function createHypercoreTestnetSubmissionAttempt({
  binding,
  handoff,
  policy,
  preparedAction,
  idempotencyKey,
  nonce,
  now,
  expiresAt
}) {
  verifyHypercoreAccountBinding(binding);
  verifyHypercoreTestnetSignerHandoff(handoff);
  verifyHypercoreTestnetProofPolicy(policy);
  verifyHypercorePreparedAction(preparedAction);
  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 256
  ) {
    fail("invalid_hypercore_durable_submission_input", "idempotencyKey is invalid");
  }
  positiveSafeInteger("nonce", nonce);
  const preparedAt = trustedDate("now", now);
  const expiry = trustedDate("expiresAt", expiresAt);
  if (
    handoff.status !== HypercoreTestnetSignerHandoffStatus.VERIFIED ||
    preparedAt >= new Date(handoff.expiresAt) ||
    expiry <= preparedAt ||
    expiry > new Date(handoff.expiresAt) ||
    expiry.getTime() - preparedAt.getTime() > policy.proofWindowMs ||
    policy.accountBindingHash !== binding.accountBindingHash ||
    policy.accountBindingHash !== handoff.accountBindingHash ||
    policy.delegateHash !== handoff.delegateHash ||
    policy.signerReferenceHash !== handoff.signerReferenceHash ||
    preparedAction.accountBindingHash !== binding.accountBindingHash ||
    preparedAction.delegateHash !== handoff.delegateHash ||
    preparedAction.riskSnapshotHash === undefined
  ) {
    fail(
      "hypercore_testnet_submission_preparation_denied",
      "Testnet binding, signer, policy or action drifted"
    );
  }
  const economicActionHash = hashId("hypercore_testnet_economic_action", {
    facilityId: binding.facilityId,
    accountBindingHash: binding.accountBindingHash,
    preparedActionHash: preparedAction.preparedActionHash,
    policyHash: policy.policyHash
  });
  const mutable = {
    founderApprovalId: null,
    founderApprovalHash: null,
    humanConfirmationHash: null,
    actionAuthorizationHash: null,
    requestBodyHash: null,
    signatureHash: null,
    claimHash: null,
    disposition: null,
    responseHash: null,
    reconciliationHash: null,
    venueOrderStateHash: null,
    venueAccountStateHash: null,
    ledgerStateHash: null,
    obligationEvidenceHash: null,
    signerRetirementHash: null,
    state: HypercoreTestnetSubmissionState.PREPARED,
    version: 1,
    approvedAt: null,
    claimedAt: null,
    resolvedAt: null,
    reconciledAt: null,
    closedAt: null,
    externalSubmissionAttempted: false
  };
  const value = {
    economicActionHash,
    idempotencyKeyHash: hashId("hypercore_testnet_submission_idempotency", {
      idempotencyKey
    }),
    facilityId: binding.facilityId,
    accountBindingId: binding.accountBindingId,
    accountBindingHash: binding.accountBindingHash,
    canonicalAccountAddressHash: binding.canonicalAccountAddressHash,
    handoffId: handoff.handoffId,
    handoffHash: handoff.handoffHash,
    delegateId: handoff.delegateId,
    delegateHash: handoff.delegateHash,
    apiWalletAddressHash: handoff.apiWalletAddressHash,
    signerReferenceHash: handoff.signerReferenceHash,
    preparedActionHash: preparedAction.preparedActionHash,
    preparedAction: structuredClone(preparedAction),
    policyHash: policy.policyHash,
    metadataHash: policy.metadataHash,
    riskSnapshotHash: preparedAction.riskSnapshotHash,
    actionKind: preparedAction.actionKind,
    market: policy.market,
    maxOrderNotionalUsd: policy.maxOrderNotionalUsd,
    openingTimeInForce: policy.openingTimeInForce,
    nonce,
    preparedAt: preparedAt.toISOString(),
    expiresAt: expiry.toISOString(),
    ...mutable,
    retryAllowed: false,
    rawActionEvidencePersisted: false,
    rawResponsePersisted: false,
    rawKeyPersisted: false,
    rawSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_TESTNET_SUBMISSION_ATTEMPT_SCHEMA_VERSION
  };
  const executionHash = hashId("hypercore_testnet_execution", attemptIdentity(value));
  return cloneFreeze({
    executionId: `hypercore_testnet_execution_${executionHash.slice(2)}`,
    executionHash,
    ...value
  });
}

export function createHypercoreTestnetFounderApproval({
  attempt,
  actorId,
  confirmationNonceHash,
  approvedAt,
  expiresAt
}) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  identifier("actorId", actorId);
  bytes32("confirmationNonceHash", confirmationNonceHash);
  const approved = trustedDate("approvedAt", approvedAt);
  const expires = trustedDate("expiresAt", expiresAt);
  if (
    attempt.state !== HypercoreTestnetSubmissionState.PREPARED ||
    approved < new Date(attempt.preparedAt) ||
    expires <= approved ||
    expires > new Date(attempt.expiresAt)
  ) {
    fail("hypercore_testnet_founder_approval_denied", "approval timing is invalid");
  }
  const humanConfirmationCore = {
    actorId,
    preparedActionHash: attempt.preparedActionHash,
    policyHash: attempt.policyHash,
    accountBindingHash: attempt.accountBindingHash,
    delegateHash: attempt.delegateHash,
    approvedAt: approved.toISOString(),
    expiresAt: expires.toISOString(),
    oneUse: true,
    consumed: false
  };
  const value = {
    executionId: attempt.executionId,
    executionHash: attempt.executionHash,
    economicActionHash: attempt.economicActionHash,
    actorId,
    confirmationNonceHash,
    humanConfirmationHash: hashId(
      "hypercore_testnet_human_confirmation",
      humanConfirmationCore
    ),
    accountBindingHash: attempt.accountBindingHash,
    canonicalAccountAddressHash: attempt.canonicalAccountAddressHash,
    handoffHash: attempt.handoffHash,
    delegateHash: attempt.delegateHash,
    apiWalletAddressHash: attempt.apiWalletAddressHash,
    signerReferenceHash: attempt.signerReferenceHash,
    preparedActionHash: attempt.preparedActionHash,
    policyHash: attempt.policyHash,
    metadataHash: attempt.metadataHash,
    riskSnapshotHash: attempt.riskSnapshotHash,
    actionKind: attempt.actionKind,
    market: attempt.market,
    maxOrderNotionalUsd: attempt.maxOrderNotionalUsd,
    openingTimeInForce: attempt.openingTimeInForce,
    nonce: attempt.nonce,
    status: HypercoreTestnetFounderApprovalStatus.APPROVED,
    approvedAt: approved.toISOString(),
    expiresAt: expires.toISOString(),
    consumedAt: null,
    version: 1,
    exactExecutionOnly: true,
    oneUse: true,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: HYPERCORE_TESTNET_FOUNDER_APPROVAL_SCHEMA_VERSION
  };
  const approvalHash = hashId(
    "hypercore_testnet_founder_approval",
    approvalIdentity(value)
  );
  return cloneFreeze({
    approvalId: `hypercore_testnet_approval_${approvalHash.slice(2)}`,
    approvalHash,
    ...value
  });
}

export function founderApprovalHumanConfirmation(approval) {
  verifyHypercoreTestnetFounderApproval(approval);
  return cloneFreeze({
    confirmationHash: approval.humanConfirmationHash,
    actorId: approval.actorId,
    preparedActionHash: approval.preparedActionHash,
    policyHash: approval.policyHash,
    accountBindingHash: approval.accountBindingHash,
    delegateHash: approval.delegateHash,
    approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt,
    oneUse: true,
    consumed: false
  });
}

export function verifyHypercoreTestnetFounderApproval(value) {
  exactShape("Founder approval", value, [
    "approvalId", "approvalHash", "executionId", "executionHash",
    "economicActionHash", "actorId", "confirmationNonceHash",
    "humanConfirmationHash", "accountBindingHash",
    "canonicalAccountAddressHash", "handoffHash", "delegateHash",
    "apiWalletAddressHash", "signerReferenceHash", "preparedActionHash",
    "policyHash", "metadataHash", "riskSnapshotHash", "actionKind", "market",
    "maxOrderNotionalUsd", "openingTimeInForce", "nonce", "status",
    "approvedAt", "expiresAt", "consumedAt", "version",
    "exactExecutionOnly", "oneUse", "mainnetAuthority",
    "productionAuthority", "realFundsAuthority", "schemaVersion"
  ]);
  for (const key of [
    "approvalHash", "executionHash", "economicActionHash", "confirmationNonceHash",
    "humanConfirmationHash", "accountBindingHash", "canonicalAccountAddressHash",
    "handoffHash", "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
    "preparedActionHash", "policyHash", "metadataHash", "riskSnapshotHash"
  ]) bytes32(key, value[key]);
  for (const key of ["approvalId", "executionId", "actorId"]) {
    identifier(key, value[key]);
  }
  positiveSafeInteger("nonce", value.nonce);
  const approvedAt = timestamp("approvedAt", value.approvedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const consumedAt = value.consumedAt === null
    ? null
    : timestamp("consumedAt", value.consumedAt);
  const { approvalHash } = value;
  const approvalLifecycleValid =
    (value.status === HypercoreTestnetFounderApprovalStatus.APPROVED &&
      value.version === 1 && value.consumedAt === null) ||
    (value.status === HypercoreTestnetFounderApprovalStatus.CONSUMED &&
      value.version === 2 && value.consumedAt !== null) ||
    ([
      HypercoreTestnetFounderApprovalStatus.EXPIRED,
      HypercoreTestnetFounderApprovalStatus.REVOKED
    ].includes(value.status) && value.version === 2 && value.consumedAt === null);
  if (
    value.schemaVersion !== HYPERCORE_TESTNET_FOUNDER_APPROVAL_SCHEMA_VERSION ||
    value.approvalId !== `hypercore_testnet_approval_${approvalHash.slice(2)}` ||
    value.exactExecutionOnly !== true ||
    value.oneUse !== true ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    expiresAt <= approvedAt ||
    (consumedAt !== null && consumedAt < approvedAt) ||
    value.market !== "BTC" ||
    value.maxOrderNotionalUsd !== "10" ||
    value.openingTimeInForce !== "Alo" ||
    !approvalLifecycleValid ||
    hashId("hypercore_testnet_founder_approval", approvalIdentity(value)) !==
      approvalHash
  ) {
    fail("invalid_hypercore_testnet_founder_approval", "approval drifted");
  }
  return true;
}

export function verifyHypercoreTestnetSubmissionAttempt(value) {
  exactShape("submission attempt", value, [
    "executionId", "executionHash", "economicActionHash", "idempotencyKeyHash",
    "facilityId", "accountBindingId", "accountBindingHash",
    "canonicalAccountAddressHash", "handoffId", "handoffHash", "delegateId",
    "delegateHash", "apiWalletAddressHash", "signerReferenceHash",
    "preparedActionHash", "preparedAction", "policyHash", "metadataHash",
    "riskSnapshotHash", "actionKind", "market", "maxOrderNotionalUsd",
    "openingTimeInForce", "nonce", "founderApprovalId", "founderApprovalHash",
    "humanConfirmationHash", "actionAuthorizationHash", "requestBodyHash",
    "signatureHash", "claimHash", "disposition", "responseHash",
    "reconciliationHash", "venueOrderStateHash", "venueAccountStateHash",
    "ledgerStateHash", "obligationEvidenceHash", "signerRetirementHash",
    "state", "version", "preparedAt", "expiresAt", "approvedAt", "claimedAt",
    "resolvedAt", "reconciledAt", "closedAt", "externalSubmissionAttempted",
    "retryAllowed", "rawActionEvidencePersisted", "rawResponsePersisted",
    "rawKeyPersisted", "rawSignaturePersisted", "mainnetAuthority",
    "productionAuthority", "realFundsAuthority", "schemaVersion"
  ]);
  verifyHypercorePreparedAction(value.preparedAction);
  for (const key of [
    "executionHash", "economicActionHash", "idempotencyKeyHash", "accountBindingHash",
    "canonicalAccountAddressHash", "handoffHash", "delegateHash",
    "apiWalletAddressHash", "signerReferenceHash", "preparedActionHash",
    "policyHash", "metadataHash", "riskSnapshotHash"
  ]) bytes32(key, value[key]);
  for (const key of [
    "founderApprovalHash", "humanConfirmationHash", "actionAuthorizationHash",
    "requestBodyHash", "signatureHash", "claimHash", "responseHash",
    "reconciliationHash", "venueOrderStateHash", "venueAccountStateHash",
    "ledgerStateHash", "obligationEvidenceHash", "signerRetirementHash"
  ]) bytes32(key, value[key], { nullable: true });
  for (const key of [
    "executionId", "facilityId", "accountBindingId", "handoffId", "delegateId"
  ]) identifier(key, value[key]);
  if (value.founderApprovalId !== null) {
    identifier("founderApprovalId", value.founderApprovalId);
  }
  positiveSafeInteger("nonce", value.nonce);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const times = Object.fromEntries([
    "approvedAt", "claimedAt", "resolvedAt", "reconciledAt", "closedAt"
  ].map((key) => [
    key,
    value[key] === null ? null : timestamp(key, value[key])
  ]));
  const noApproval =
    value.founderApprovalId === null &&
    value.founderApprovalHash === null &&
    value.humanConfirmationHash === null;
  const hasApproval =
    value.founderApprovalId !== null &&
    value.founderApprovalHash !== null &&
    value.humanConfirmationHash !== null;
  const noClaim =
    value.actionAuthorizationHash === null &&
    value.requestBodyHash === null &&
    value.signatureHash === null &&
    value.claimHash === null;
  const hasClaim =
    value.actionAuthorizationHash !== null &&
    value.requestBodyHash !== null &&
    value.signatureHash !== null &&
    value.claimHash !== null;
  const noResolution = value.disposition === null && value.responseHash === null;
  const hasResolution =
    ["confirmed", "rejected", "unknown"].includes(value.disposition) &&
    value.responseHash !== null;
  const hasReconciliation = [
    value.reconciliationHash,
    value.venueOrderStateHash,
    value.venueAccountStateHash,
    value.ledgerStateHash,
    value.obligationEvidenceHash
  ].every((item) => item !== null);
  const noReconciliation = [
    value.reconciliationHash,
    value.venueOrderStateHash,
    value.venueAccountStateHash,
    value.ledgerStateHash,
    value.obligationEvidenceHash,
    value.signerRetirementHash
  ].every((item) => item === null);
  const timesOrdered =
    (times.approvedAt === null || times.approvedAt >= preparedAt) &&
    (times.claimedAt === null ||
      (times.approvedAt !== null && times.claimedAt >= times.approvedAt)) &&
    (times.resolvedAt === null ||
      (times.claimedAt !== null && times.resolvedAt >= times.claimedAt)) &&
    (times.reconciledAt === null ||
      (times.resolvedAt !== null && times.reconciledAt >= times.resolvedAt)) &&
    (times.closedAt === null ||
      (times.reconciledAt !== null && times.closedAt >= times.reconciledAt));
  const lifecycleValid =
    (value.state === HypercoreTestnetSubmissionState.PREPARED &&
      value.version === 1 && noApproval && noClaim && noResolution && noReconciliation &&
      times.approvedAt === null && times.claimedAt === null &&
      times.resolvedAt === null && times.reconciledAt === null &&
      times.closedAt === null && value.externalSubmissionAttempted === false) ||
    (value.state === HypercoreTestnetSubmissionState.APPROVED &&
      value.version === 2 && hasApproval && noClaim && noResolution && noReconciliation &&
      times.approvedAt !== null && times.claimedAt === null &&
      times.resolvedAt === null && times.reconciledAt === null &&
      times.closedAt === null && value.externalSubmissionAttempted === false) ||
    (value.state === HypercoreTestnetSubmissionState.SUBMITTING &&
      value.version === 3 && hasApproval && hasClaim && noResolution && noReconciliation &&
      times.approvedAt !== null && times.claimedAt !== null &&
      times.resolvedAt === null && times.reconciledAt === null &&
      times.closedAt === null && value.externalSubmissionAttempted === true) ||
    ([
      HypercoreTestnetSubmissionState.SUBMITTED,
      HypercoreTestnetSubmissionState.REJECTED,
      HypercoreTestnetSubmissionState.UNKNOWN
    ].includes(value.state) && value.version === 4 && hasApproval && hasClaim &&
      hasResolution && noReconciliation && value.disposition === ({
        SUBMITTED: "confirmed",
        REJECTED: "rejected",
        UNKNOWN: "unknown"
      })[value.state] && times.resolvedAt !== null &&
      times.reconciledAt === null && times.closedAt === null &&
      value.externalSubmissionAttempted === true) ||
    (value.state === HypercoreTestnetSubmissionState.RECONCILED &&
      value.version === 5 && hasApproval && hasClaim && hasResolution &&
      hasReconciliation && value.signerRetirementHash === null &&
      times.resolvedAt !== null && times.reconciledAt !== null &&
      times.closedAt === null && value.externalSubmissionAttempted === true) ||
    (value.state === HypercoreTestnetSubmissionState.CLOSED &&
      value.version === 6 && hasApproval && hasClaim && hasResolution &&
      hasReconciliation && value.signerRetirementHash !== null &&
      times.resolvedAt !== null && times.reconciledAt !== null &&
      times.closedAt !== null && value.externalSubmissionAttempted === true);
  if (
    !Object.values(HypercoreTestnetSubmissionState).includes(value.state) ||
    expiresAt <= preparedAt ||
    !timesOrdered ||
    !lifecycleValid ||
    value.preparedAction.preparedActionHash !== value.preparedActionHash ||
    value.actionKind !== value.preparedAction.actionKind ||
    value.market !== "BTC" ||
    value.maxOrderNotionalUsd !== "10" ||
    value.openingTimeInForce !== "Alo" ||
    value.executionId !== `hypercore_testnet_execution_${value.executionHash.slice(2)}` ||
    hashId("hypercore_testnet_execution", attemptIdentity(value)) !== value.executionHash ||
    value.retryAllowed !== false ||
    value.rawActionEvidencePersisted !== false ||
    value.rawResponsePersisted !== false ||
    value.rawKeyPersisted !== false ||
    value.rawSignaturePersisted !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    value.schemaVersion !== HYPERCORE_TESTNET_SUBMISSION_ATTEMPT_SCHEMA_VERSION
  ) {
    fail("invalid_hypercore_testnet_submission_attempt", "attempt drifted");
  }
  return true;
}

export function approveHypercoreTestnetSubmissionAttempt({ attempt, approval }) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  verifyHypercoreTestnetFounderApproval(approval);
  if (
    attempt.state !== HypercoreTestnetSubmissionState.PREPARED ||
    approval.executionHash !== attempt.executionHash ||
    approval.economicActionHash !== attempt.economicActionHash
  ) {
    fail("hypercore_testnet_founder_approval_binding_denied", "approval drifted");
  }
  return cloneFreeze({
    ...structuredClone(attempt),
    founderApprovalId: approval.approvalId,
    founderApprovalHash: approval.approvalHash,
    humanConfirmationHash: approval.humanConfirmationHash,
    state: HypercoreTestnetSubmissionState.APPROVED,
    version: attempt.version + 1,
    approvedAt: approval.approvedAt
  });
}

export function claimHypercoreTestnetSubmissionAttempt({
  attempt,
  approval,
  authorization,
  requestBodyHash,
  signatureHash,
  claimHash,
  now
}) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  verifyHypercoreTestnetFounderApproval(approval);
  verifyHypercoreTestnetActionAuthorization(authorization);
  for (const [name, value] of Object.entries({
    requestBodyHash,
    signatureHash,
    claimHash
  })) bytes32(name, value);
  const claimedAt = trustedDate("now", now);
  if (
    attempt.state !== HypercoreTestnetSubmissionState.APPROVED ||
    approval.status !== HypercoreTestnetFounderApprovalStatus.APPROVED ||
    approval.approvalHash !== attempt.founderApprovalHash ||
    approval.executionHash !== attempt.executionHash ||
    approval.humanConfirmationHash !== authorization.humanConfirmationHash ||
    authorization.preparedActionHash !== attempt.preparedActionHash ||
    authorization.policyHash !== attempt.policyHash ||
    authorization.riskSnapshotHash !== attempt.riskSnapshotHash ||
    authorization.accountBindingHash !== attempt.accountBindingHash ||
    authorization.delegateHash !== attempt.delegateHash ||
    authorization.signerReferenceHash !== attempt.signerReferenceHash ||
    claimedAt >= new Date(approval.expiresAt) ||
    claimedAt >= new Date(attempt.expiresAt) ||
    claimedAt >= new Date(authorization.effectiveUntil)
  ) {
    fail("hypercore_testnet_submission_claim_denied", "claim is stale or drifted");
  }
  return cloneFreeze({
    ...structuredClone(attempt),
    actionAuthorizationHash: authorization.authorizationHash,
    requestBodyHash,
    signatureHash,
    claimHash,
    state: HypercoreTestnetSubmissionState.SUBMITTING,
    version: attempt.version + 1,
    claimedAt: claimedAt.toISOString(),
    externalSubmissionAttempted: true
  });
}

export function resolveHypercoreTestnetSubmissionAttempt({ attempt, result, now }) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  verifyHypercoreTestnetExchangeResult(result);
  const resolvedAt = trustedDate("now", now);
  const state = {
    confirmed: HypercoreTestnetSubmissionState.SUBMITTED,
    rejected: HypercoreTestnetSubmissionState.REJECTED,
    unknown: HypercoreTestnetSubmissionState.UNKNOWN
  }[result.disposition];
  if (
    attempt.state !== HypercoreTestnetSubmissionState.SUBMITTING ||
    result.authorizationHash !== attempt.actionAuthorizationHash ||
    result.requestBodyHash !== attempt.requestBodyHash ||
    result.signatureHash !== attempt.signatureHash
  ) {
    fail("hypercore_testnet_submission_result_denied", "result binding drifted");
  }
  return cloneFreeze({
    ...structuredClone(attempt),
    state,
    disposition: result.disposition,
    responseHash: result.responseHash,
    version: attempt.version + 1,
    resolvedAt: resolvedAt.toISOString()
  });
}

export function recoverHypercoreTestnetSubmissionUnknown({ attempt, reasonHash, now }) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  bytes32("reasonHash", reasonHash);
  const resolvedAt = trustedDate("now", now);
  if (attempt.state !== HypercoreTestnetSubmissionState.SUBMITTING) {
    fail("hypercore_testnet_unknown_recovery_denied", "only in-flight work is recoverable");
  }
  return cloneFreeze({
    ...structuredClone(attempt),
    state: HypercoreTestnetSubmissionState.UNKNOWN,
    disposition: "unknown",
    responseHash: reasonHash,
    version: attempt.version + 1,
    resolvedAt: resolvedAt.toISOString()
  });
}

export function reconcileHypercoreTestnetSubmissionAttempt({
  attempt,
  reconciliationHash,
  venueOrderStateHash,
  venueAccountStateHash,
  ledgerStateHash,
  obligationEvidenceHash,
  now
}) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  for (const [name, value] of Object.entries({
    reconciliationHash,
    venueOrderStateHash,
    venueAccountStateHash,
    ledgerStateHash,
    obligationEvidenceHash
  })) bytes32(name, value);
  if (!TERMINAL_TRANSPORT_STATES.has(attempt.state)) {
    fail("hypercore_testnet_reconciliation_denied", "transport truth is not terminal");
  }
  return cloneFreeze({
    ...structuredClone(attempt),
    state: HypercoreTestnetSubmissionState.RECONCILED,
    reconciliationHash,
    venueOrderStateHash,
    venueAccountStateHash,
    ledgerStateHash,
    obligationEvidenceHash,
    version: attempt.version + 1,
    reconciledAt: trustedDate("now", now).toISOString()
  });
}

export function closeHypercoreTestnetSubmissionAttempt({ attempt, handoff, now }) {
  verifyHypercoreTestnetSubmissionAttempt(attempt);
  verifyHypercoreTestnetSignerHandoff(handoff);
  if (
    attempt.state !== HypercoreTestnetSubmissionState.RECONCILED ||
    handoff.status !== HypercoreTestnetSignerHandoffStatus.RETIRED ||
    handoff.handoffId !== attempt.handoffId ||
    handoff.retirementEvidenceHash === null
  ) {
    fail("hypercore_testnet_submission_close_denied", "retired signer proof is required");
  }
  return cloneFreeze({
    ...structuredClone(attempt),
    state: HypercoreTestnetSubmissionState.CLOSED,
    signerRetirementHash: handoff.retirementEvidenceHash,
    version: attempt.version + 1,
    closedAt: trustedDate("now", now).toISOString()
  });
}
