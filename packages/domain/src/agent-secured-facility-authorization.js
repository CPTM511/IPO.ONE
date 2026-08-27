import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { MandateCapability, MandateStatus, SubjectStatus, SubjectType } from "./enums.js";
import { assertNoRawPiiReference } from "./validators.js";

export const AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION =
  "agent_secured_facility_authorization.v1";
export const AGENT_SECURED_FACILITY_OPERATION_FAMILY =
  "agent_trading_capital_intent.v1";
export const AGENT_SECURED_FACILITY_INTENT_KINDS = Object.freeze(["open", "close"]);

export const AgentSecuredFacilityAuthorizationStatus = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

const HASH = /^0x[0-9a-f]{64}$/;

function deny(code, message) {
  throw new DomainError(code, message);
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    deny("invalid_agent_secured_facility_authorization", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function iso(name, value) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    deny("invalid_agent_secured_facility_authorization", `${name} must be a valid timestamp`);
  }
  return parsed.toISOString();
}

function exactIntentKinds(value) {
  if (
    !Array.isArray(value) || value.length !== AGENT_SECURED_FACILITY_INTENT_KINDS.length ||
    value.some((item, index) => item !== AGENT_SECURED_FACILITY_INTENT_KINDS[index])
  ) deny("agent_secured_facility_operation_family_denied", "Agent intent family is not exact");
}

function currentAuthority({ subject, principal, mandate, accountBinding, obligation,
  poolObligationBinding, poolObligationProjection, tradingFacility, now }) {
  if (
    subject?.subjectType !== SubjectType.AGENT || subject.status !== SubjectStatus.ACTIVE ||
    subject.primaryPrincipalId !== principal?.principalId || principal.status !== "active"
  ) deny("agent_secured_facility_party_unavailable", "active Agent Subject and accountable Principal are required");
  if (
    mandate?.schemaVersion !== "mandate.v3" || mandate.status !== MandateStatus.ACTIVE ||
    mandate.sandboxOnly !== true || mandate.productionAuthority !== false ||
    mandate.subjectId !== subject.subjectId || mandate.principalId !== principal.principalId ||
    !mandate.capabilities?.includes(MandateCapability.EXECUTE_SANDBOX_CREDIT) ||
    !HASH.test(mandate.mandateHash ?? "") || new Date(mandate.validFrom) > now ||
    new Date(mandate.expiresAt) <= now
  ) deny("agent_secured_facility_mandate_unavailable", "current exact Agent Mandate is required");
  if (
    accountBinding?.schemaVersion !== "account_binding.v3" ||
    accountBinding.status !== "active" || accountBinding.bindingKind !== "execution" ||
    accountBinding.purpose !== "execution" || accountBinding.subjectId !== subject.subjectId ||
    !HASH.test(accountBinding.accountHash ?? "")
  ) deny("agent_secured_facility_account_binding_unavailable", "current execution AccountBinding is required");
  if (
    obligation?.schemaVersion !== "obligation.v2" || obligation.status !== "active" ||
    obligation.executionStatus !== "executed" || obligation.subjectId !== subject.subjectId ||
    obligation.principalId !== principal.principalId || obligation.mandateId !== mandate.mandateId ||
    obligation.authorityRef !== mandate.mandateId || obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false || obligation.withdrawable !== false ||
    !obligation.poolObligationBindingId || !obligation.poolExecutionReceiptId ||
    obligation.sandboxExecutionReceiptId || !HASH.test(obligation.obligationHash ?? "")
  ) deny("agent_secured_facility_obligation_unavailable", "active Pool-executed canonical Obligation is required");
  if (
    poolObligationBinding?.schemaVersion !== "pool_obligation_binding.v1" ||
    poolObligationBinding.status !== "active" || poolObligationBinding.entryMode !== "agent" ||
    poolObligationBinding.selfPrincipal !== true || poolObligationBinding.syntheticOnly !== true ||
    poolObligationBinding.productionFundsMoved !== false ||
    poolObligationBinding.subjectId !== subject.subjectId ||
    poolObligationBinding.principalId !== principal.principalId ||
    poolObligationBinding.accountBindingId !== accountBinding.accountBindingId ||
    poolObligationBinding.obligationId !== obligation.obligationId ||
    poolObligationBinding.poolObligationBindingId !== obligation.poolObligationBindingId ||
    poolObligationBinding.chainId !== accountBinding.chainId ||
    !HASH.test(poolObligationBinding.bindingHash ?? "")
  ) deny("agent_secured_facility_pool_binding_unavailable", "exact active Agent Pool binding is required");
  if (
    poolObligationProjection?.schemaVersion !== "pool_obligation_projection.v1" ||
    poolObligationProjection.poolObligationBindingId !== poolObligationBinding.poolObligationBindingId ||
    poolObligationProjection.obligationId !== obligation.obligationId ||
    poolObligationProjection.lifecycleStatus !== "active" ||
    poolObligationProjection.canonicalObligationRemainsAuthoritative !== true ||
    poolObligationProjection.creditStateAuthorizing !== false ||
    poolObligationProjection.automaticLimitChange !== false ||
    poolObligationProjection.syntheticOnly !== true ||
    poolObligationProjection.productionFundsMoved !== false ||
    poolObligationProjection.badDebtAssets !== "0" ||
    !HASH.test(poolObligationProjection.projectionHash ?? "")
  ) deny("agent_secured_facility_pool_state_unavailable", "fresh reconciled active Pool projection is required");
  if (
    tradingFacility?.schemaVersion !== "trading_facility.v1" ||
    tradingFacility.lifecycleStatus !== "active" || tradingFacility.riskState !== "NORMAL" ||
    tradingFacility.subjectId !== subject.subjectId ||
    tradingFacility.principalId !== principal.principalId ||
    tradingFacility.obligationId !== obligation.obligationId ||
    tradingFacility.linkedCanonicalObligation !== true || tradingFacility.secondLedgerCreated !== false ||
    tradingFacility.sandboxOnly !== true || tradingFacility.syntheticOnly !== true ||
    tradingFacility.withdrawable !== false || tradingFacility.transferable !== false ||
    tradingFacility.productionAuthority !== false || tradingFacility.fundsAuthority !== false ||
    !HASH.test(tradingFacility.facilityHash ?? "") || !HASH.test(tradingFacility.stateHash ?? "") ||
    !Number.isSafeInteger(tradingFacility.version) || tradingFacility.version < 1 ||
    new Date(tradingFacility.maturityAt) <= now
  ) deny("agent_secured_facility_unavailable", "active shared-kernel Trading Capital Facility is required");
}

function immutableCore(value) {
  return {
    subjectId: value.subjectId,
    principalId: value.principalId,
    mandateId: value.mandateId,
    mandateHash: value.mandateHash,
    accountBindingId: value.accountBindingId,
    accountHash: value.accountHash,
    poolObligationBindingId: value.poolObligationBindingId,
    poolBindingHash: value.poolBindingHash,
    poolProjectionHash: value.poolProjectionHash,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    tradingFacilityId: value.tradingFacilityId,
    facilityHash: value.facilityHash,
    facilityStateHash: value.facilityStateHash,
    facilityVersion: value.facilityVersion,
    chainId: value.chainId,
    operationFamily: value.operationFamily,
    allowedIntentKinds: value.allowedIntentKinds,
    validFrom: value.validFrom,
    expiresAt: value.expiresAt,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    signingAuthority: false,
    nonceAuthority: false,
    networkAuthority: false,
    withdrawalAllowed: false,
    transferAllowed: false
  };
}

export function createAgentSecuredFacilityAuthorization({
  subject, principal, mandate, accountBinding, obligation, poolObligationBinding,
  poolObligationProjection, tradingFacility,
  operationFamily = AGENT_SECURED_FACILITY_OPERATION_FAMILY,
  allowedIntentKinds = AGENT_SECURED_FACILITY_INTENT_KINDS,
  now = new Date()
}) {
  const current = new Date(now);
  currentAuthority({ subject, principal, mandate, accountBinding, obligation,
    poolObligationBinding, poolObligationProjection, tradingFacility, now: current });
  if (operationFamily !== AGENT_SECURED_FACILITY_OPERATION_FAMILY) {
    deny("agent_secured_facility_operation_family_denied", "Agent operation family is not approved");
  }
  exactIntentKinds(allowedIntentKinds);
  const validFrom = current.toISOString();
  const expiresAt = new Date(Math.min(
    new Date(mandate.expiresAt).getTime(),
    new Date(tradingFacility.maturityAt).getTime()
  )).toISOString();
  const core = immutableCore({
    subjectId: subject.subjectId, principalId: principal.principalId,
    mandateId: mandate.mandateId, mandateHash: bytes32("mandateHash", mandate.mandateHash),
    accountBindingId: accountBinding.accountBindingId, accountHash: accountBinding.accountHash,
    poolObligationBindingId: poolObligationBinding.poolObligationBindingId,
    poolBindingHash: poolObligationBinding.bindingHash,
    poolProjectionHash: poolObligationProjection.projectionHash,
    obligationId: obligation.obligationId, obligationHash: obligation.obligationHash,
    tradingFacilityId: tradingFacility.tradingFacilityId,
    facilityHash: tradingFacility.facilityHash, facilityStateHash: tradingFacility.stateHash,
    facilityVersion: tradingFacility.version, chainId: poolObligationBinding.chainId,
    operationFamily, allowedIntentKinds: [...allowedIntentKinds], validFrom, expiresAt
  });
  const authorizationHash = hashId("agent_secured_facility_authorization", core);
  const result = {
    agentSecuredFacilityAuthorizationId: `agent_secured_facility_authorization_${authorizationHash.slice(2)}`,
    authorizationHash,
    ...core,
    status: AgentSecuredFacilityAuthorizationStatus.ACTIVE,
    version: 1,
    revokedAt: null,
    revocationHash: null,
    schemaVersion: AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(result, "agentSecuredFacilityAuthorization");
  return Object.freeze(result);
}

export function revokeAgentSecuredFacilityAuthorization(authorization, {
  expectedAuthorizationHash, expectedVersion, revokedAt = new Date()
}) {
  if (
    authorization?.schemaVersion !== AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION ||
    authorization.status !== AgentSecuredFacilityAuthorizationStatus.ACTIVE ||
    authorization.authorizationHash !== expectedAuthorizationHash ||
    authorization.version !== expectedVersion
  ) deny("agent_secured_facility_authorization_stale", "Agent Facility authorization is stale or unavailable");
  const at = iso("revokedAt", revokedAt);
  return Object.freeze({
    ...structuredClone(authorization),
    status: AgentSecuredFacilityAuthorizationStatus.REVOKED,
    version: authorization.version + 1,
    revokedAt: at,
    revocationHash: hashId("agent_secured_facility_authorization_revocation", {
      authorizationHash: authorization.authorizationHash,
      previousVersion: authorization.version,
      revokedAt: at
    })
  });
}

export function authorizeAgentSecuredFacilityIntent(authorization, {
  kind, expectedAuthorizationHash, expectedVersion, currentResourceHashes, now = new Date()
}) {
  if (
    authorization?.schemaVersion !== AGENT_SECURED_FACILITY_AUTHORIZATION_SCHEMA_VERSION ||
    authorization.status !== AgentSecuredFacilityAuthorizationStatus.ACTIVE ||
    authorization.authorizationHash !== expectedAuthorizationHash ||
    authorization.version !== expectedVersion || new Date(authorization.expiresAt) <= new Date(now)
  ) deny("agent_secured_facility_authorization_unavailable", "Agent Facility authorization is not current");
  if (!authorization.allowedIntentKinds.includes(kind)) {
    deny("agent_secured_facility_intent_denied", "Agent intent is outside the exact operation family");
  }
  const expected = {
    mandateHash: authorization.mandateHash,
    accountHash: authorization.accountHash,
    poolBindingHash: authorization.poolBindingHash,
    poolProjectionHash: authorization.poolProjectionHash,
    obligationHash: authorization.obligationHash,
    facilityHash: authorization.facilityHash,
    facilityStateHash: authorization.facilityStateHash
  };
  if (
    !currentResourceHashes || Object.keys(expected).some((key) => currentResourceHashes[key] !== expected[key])
  ) deny("agent_secured_facility_resource_drift", "Agent Facility authority resources changed");
  return Object.freeze({
    admitted: true,
    kind,
    operationFamily: authorization.operationFamily,
    authorizationHash: authorization.authorizationHash,
    preSigningOnly: true,
    nonceCreated: false,
    signatureCreated: false,
    networkCalled: false,
    fundsMoved: false,
    schemaVersion: "agent_secured_facility_intent_decision.v1"
  });
}
