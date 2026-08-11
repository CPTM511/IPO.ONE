import {
  AccountBindingStatus,
  CreditEventType,
  CreditLineStatus,
  DomainError,
  FinalityStatus,
  MandateCapability,
  MandateStatus,
  ObligationStatus,
  SpendPolicyStatus,
  assertNoRawPiiReference,
  createCreditEvent,
  hashId,
  verifyCreditLineProjection
} from "../../../packages/domain/src/index.js";
import { assertAuthorizationDecision } from "../../authorization/src/index.js";

export const EXECUTION_TARGET_POLICY_SCHEMA_VERSION = "execution_target_policy.v1";
export const DELEGATED_WALLET_GRANT_SCHEMA_VERSION = "delegated_wallet_grant.v1";
export const PENDING_EXPOSURE_RESERVATION_SCHEMA_VERSION =
  "pending_exposure_reservation.v1";

export const DelegatedWalletGrantStatus = Object.freeze({
  PREPARED: "prepared",
  ACTIVE: "active",
  REVOKED: "revoked",
  EXPIRED: "expired",
  QUARANTINED: "quarantined"
});

export const PendingExposureStatus = Object.freeze({
  RESERVED: "reserved",
  RELEASED: "released",
  EXPIRED: "expired",
  QUARANTINED: "quarantined"
});

const SUPPORTED_CHAIN_IDS = new Set(["eip155:84532", "eip155:1952"]);
const CURRENT_OBLIGATION_STATUSES = new Set([
  ObligationStatus.ACTIVE,
  ObligationStatus.PARTIALLY_REPAID
]);
const BYTES32 = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const SELECTOR = /^0x[0-9a-f]{8}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const MAX_GRANT_LIFETIME_MS = 60 * 60 * 1000;
const MAX_RESERVATION_LIFETIME_MS = 5 * 60 * 1000;

function invalid(code, message, details) {
  throw new DomainError(code, message, details);
}

function freeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

function exactShape(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_agentic_execution_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    invalid("invalid_agentic_execution_input", `${name} has an invalid closed shape`);
  }
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_agentic_execution_input", `${name} must be a bounded identifier`);
  }
  return value;
}

function bytes32(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_agentic_execution_input", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function minor(name, value, { positive = false } = {}) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    invalid("invalid_agentic_execution_input", `${name} must be canonical integer minor units`);
  }
  const amount = BigInt(value);
  if (positive ? amount <= 0n : amount < 0n) {
    invalid("invalid_agentic_execution_input", `${name} is outside the permitted range`);
  }
  return amount;
}

function timestamp(name, value) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== (value instanceof Date ? parsed.toISOString() : value)) {
    invalid("invalid_agentic_execution_input", `${name} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_agentic_execution_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function closedUniqueList(name, values, { maximum = 32, pattern = IDENTIFIER } = {}) {
  if (
    !Array.isArray(values) || values.length < 1 || values.length > maximum ||
    values.some((value) => typeof value !== "string" || !pattern.test(value)) ||
    new Set(values).size !== values.length
  ) {
    invalid("invalid_agentic_execution_input", `${name} must be a bounded unique list`);
  }
  return [...values].sort();
}

function permissionDecision(decision, { operationId, resourceId, now }) {
  const trusted = assertAuthorizationDecision(decision, { now });
  if (
    trusted.operationId !== operationId ||
    trusted.resourceId !== resourceId ||
    trusted.revalidationCount < 1
  ) {
    invalid(
      "agentic_execution_authorization_stale",
      "a freshly revalidated exact authorization decision is required"
    );
  }
  return trusted;
}

function authorizationHash(decision) {
  return hashId("agentic_execution_authorization", {
    decisionId: decision.decisionId,
    tenantId: decision.tenantId,
    actorId: decision.actorId,
    operationId: decision.operationId,
    action: decision.action,
    resourceType: decision.resourceType,
    resourceId: decision.resourceId,
    commandHash: decision.commandHash,
    commandPayloadHash: decision.commandPayloadHash,
    policyVersion: decision.policyVersion,
    authorizedAt: decision.authorizedAt,
    expiresAt: decision.expiresAt,
    revalidationCount: decision.revalidationCount
  });
}

function targetPolicyCore(policy) {
  return {
    providerId: policy.providerId,
    chainId: policy.chainId,
    targetAddress: policy.targetAddress,
    codeHash: policy.codeHash,
    proxyImplementationHash: policy.proxyImplementationHash,
    allowedFunctionSelectors: policy.allowedFunctionSelectors,
    maxNativeValueMinor: policy.maxNativeValueMinor,
    allowedTokenSpenders: policy.allowedTokenSpenders,
    maxTokenAllowanceMinor: policy.maxTokenAllowanceMinor,
    approvalMode: policy.approvalMode,
    withdrawalAllowed: policy.withdrawalAllowed,
    transferAllowed: policy.transferAllowed,
    targetVerificationStatus: policy.targetVerificationStatus,
    transactionsAllowed: policy.transactionsAllowed,
    sandboxOnly: policy.sandboxOnly,
    productionAuthority: policy.productionAuthority,
    fundsAuthority: policy.fundsAuthority,
    validFrom: policy.validFrom,
    expiresAt: policy.expiresAt,
    schemaVersion: policy.schemaVersion
  };
}

export function createExecutionTargetPolicy(input) {
  exactShape(
    "ExecutionTargetPolicy input",
    input,
    [
      "providerId",
      "chainId",
      "targetAddress",
      "codeHash",
      "allowedFunctionSelectors",
      "validFrom",
      "expiresAt"
    ],
    ["proxyImplementationHash", "now"]
  );
  const now = trustedNow(input.now ?? new Date());
  const providerId = identifier("providerId", input.providerId);
  if (!SUPPORTED_CHAIN_IDS.has(input.chainId)) {
    invalid("agentic_execution_chain_not_enabled", "target policy chain is not enabled");
  }
  const targetAddress = String(input.targetAddress).toLowerCase();
  if (!ADDRESS.test(targetAddress)) {
    invalid("invalid_agentic_execution_input", "targetAddress must be a lowercase EVM address");
  }
  const codeHash = bytes32("codeHash", input.codeHash);
  const proxyImplementationHash = input.proxyImplementationHash === undefined
    ? null
    : bytes32("proxyImplementationHash", input.proxyImplementationHash);
  if (!Array.isArray(input.allowedFunctionSelectors)) {
    invalid("invalid_agentic_execution_input", "allowedFunctionSelectors must be an array");
  }
  const allowedFunctionSelectors = closedUniqueList(
    "allowedFunctionSelectors",
    input.allowedFunctionSelectors.map((value) => String(value).toLowerCase()),
    { maximum: 64, pattern: SELECTOR }
  );
  const validFrom = timestamp("validFrom", input.validFrom);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (
    validFrom > now || expiresAt <= now || expiresAt <= validFrom ||
    expiresAt.getTime() - validFrom.getTime() > 24 * 60 * 60 * 1000
  ) {
    invalid("agentic_execution_target_policy_not_current", "target policy validity is unavailable");
  }
  const policy = {
    providerId,
    chainId: input.chainId,
    targetAddress,
    codeHash,
    proxyImplementationHash,
    allowedFunctionSelectors,
    maxNativeValueMinor: "0",
    allowedTokenSpenders: [],
    maxTokenAllowanceMinor: "0",
    approvalMode: "none",
    withdrawalAllowed: false,
    transferAllowed: false,
    targetVerificationStatus: "policy_declared",
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    validFrom: validFrom.toISOString(),
    expiresAt: expiresAt.toISOString(),
    schemaVersion: EXECUTION_TARGET_POLICY_SCHEMA_VERSION
  };
  assertNoRawPiiReference(policy, "executionTargetPolicy");
  const policyHash = hashId("execution_target_policy", policy);
  return cloneFreeze({
    targetPolicyId: `execution_target_policy_${policyHash.slice(2)}`,
    policyHash,
    version: 1,
    ...policy,
    createdAt: now.toISOString()
  });
}

export function verifyExecutionTargetPolicy(policy, { now = new Date(), allowExpired = false } = {}) {
  if (!policy || policy.schemaVersion !== EXECUTION_TARGET_POLICY_SCHEMA_VERSION) {
    invalid("agentic_execution_target_policy_invalid", "target policy schema is unavailable");
  }
  const current = trustedNow(now);
  identifier("targetPolicyId", policy.targetPolicyId);
  identifier("providerId", policy.providerId);
  bytes32("policyHash", policy.policyHash);
  bytes32("codeHash", policy.codeHash);
  if (policy.proxyImplementationHash !== null) {
    bytes32("proxyImplementationHash", policy.proxyImplementationHash);
  }
  const validFrom = timestamp("validFrom", policy.validFrom);
  const expiresAt = timestamp("expiresAt", policy.expiresAt);
  if (
    hashId("execution_target_policy", targetPolicyCore(policy)) !== policy.policyHash ||
    policy.targetPolicyId !== `execution_target_policy_${policy.policyHash.slice(2)}` ||
    policy.version !== 1 ||
    !SUPPORTED_CHAIN_IDS.has(policy.chainId) ||
    !Array.isArray(policy.allowedFunctionSelectors) ||
    policy.allowedFunctionSelectors.length < 1 ||
    policy.allowedFunctionSelectors.length > 64 ||
    policy.allowedFunctionSelectors.some((selector) => !SELECTOR.test(selector)) ||
    new Set(policy.allowedFunctionSelectors).size !== policy.allowedFunctionSelectors.length ||
    policy.maxNativeValueMinor !== "0" ||
    policy.maxTokenAllowanceMinor !== "0" ||
    !Array.isArray(policy.allowedTokenSpenders) || policy.allowedTokenSpenders.length !== 0 ||
    policy.approvalMode !== "none" ||
    policy.withdrawalAllowed !== false || policy.transferAllowed !== false ||
    policy.transactionsAllowed !== false || policy.sandboxOnly !== true ||
    policy.productionAuthority !== false || policy.fundsAuthority !== false ||
    policy.targetVerificationStatus !== "policy_declared"
  ) {
    invalid("agentic_execution_target_policy_invalid", "target policy restrictions are inconsistent");
  }
  if (!ADDRESS.test(policy.targetAddress ?? "") || expiresAt <= validFrom) {
    invalid("agentic_execution_target_policy_invalid", "target policy identity or validity is inconsistent");
  }
  if (!allowExpired && (validFrom > current || expiresAt <= current)) {
    invalid("agentic_execution_target_policy_expired", "target policy has expired");
  }
  return true;
}

function grantHashCore(grant) {
  return {
    subjectId: grant.subjectId,
    principalId: grant.principalId,
    accountBindingId: grant.accountBindingId,
    executionDomain: grant.executionDomain,
    adapterId: grant.adapterId,
    mandateId: grant.mandateId,
    mandateHash: grant.mandateHash,
    spendPolicyId: grant.spendPolicyId,
    spendPolicyHash: grant.spendPolicyHash,
    creditLineId: grant.creditLineId,
    creditLineHash: grant.creditLineHash,
    obligationId: grant.obligationId,
    obligationHash: grant.obligationHash,
    authorizationDecisionId: grant.authorizationDecisionId,
    authorizationHash: grant.authorizationHash,
    sessionSignerRefHash: grant.sessionSignerRefHash,
    providerId: grant.providerId,
    chainIds: grant.chainIds,
    assetIds: grant.assetIds,
    allowedTargetPolicyIds: grant.allowedTargetPolicyIds,
    perTxLimitMinor: grant.perTxLimitMinor,
    rolling24hLimitMinor: grant.rolling24hLimitMinor,
    aggregateLimitMinor: grant.aggregateLimitMinor,
    obligationLimitMinor: grant.obligationLimitMinor,
    validFrom: grant.validFrom,
    expiresAt: grant.expiresAt,
    sessionEpoch: grant.sessionEpoch,
    nonce: grant.nonce,
    sandboxOnly: grant.sandboxOnly,
    productionAuthority: grant.productionAuthority,
    fundsAuthority: grant.fundsAuthority,
    transactionsAllowed: grant.transactionsAllowed,
    schemaVersion: grant.schemaVersion
  };
}

function lowest(values) {
  return values.reduce((result, value) => value < result ? value : result);
}

export function prepareDelegatedWalletGrant({
  authorizationDecision,
  mandate,
  spendPolicy,
  creditLine,
  obligation,
  accountBinding,
  targetPolicies,
  adapterId = "local_sandbox",
  requestedExpiresAt,
  sessionEpoch,
  nonce,
  now = new Date()
}) {
  const current = trustedNow(now);
  if (!Array.isArray(targetPolicies) || targetPolicies.length < 1 || targetPolicies.length > 16) {
    invalid("agentic_execution_target_policy_invalid", "one to sixteen target policies are required");
  }
  for (const policy of targetPolicies) verifyExecutionTargetPolicy(policy, { now: current });
  if (new Set(targetPolicies.map(({ targetPolicyId }) => targetPolicyId)).size !== targetPolicies.length) {
    invalid("agentic_execution_target_policy_invalid", "target policy IDs must be unique");
  }
  if (
    !mandate || mandate.schemaVersion !== "mandate.v3" ||
    mandate.status !== MandateStatus.ACTIVE ||
    mandate.sandboxOnly !== true || mandate.productionAuthority !== false ||
    !mandate.capabilities?.includes(MandateCapability.PROVIDER_SPEND) ||
    !BYTES32.test(mandate.mandateHash ?? "") || !BYTES32.test(mandate.termsHash ?? "")
  ) {
    invalid("agentic_execution_mandate_unavailable", "an active exact Provider-spend Mandate is required");
  }
  if (
    !spendPolicy || spendPolicy.schemaVersion !== "spend_policy.v1" ||
    spendPolicy.status !== SpendPolicyStatus.ACTIVE ||
    spendPolicy.subjectId !== mandate.subjectId ||
    !BYTES32.test(spendPolicy.spendPolicyHash ?? "") ||
    !mandate.allowedProviderIds?.includes(spendPolicy.providerId) ||
    !mandate.allowedCategories?.includes(spendPolicy.category) ||
    !mandate.assetIds?.includes(spendPolicy.assetId)
  ) {
    invalid("agentic_execution_spend_policy_unavailable", "an active exact SpendPolicy is required");
  }
  try {
    verifyCreditLineProjection(creditLine);
  } catch {
    invalid("agentic_execution_credit_line_unavailable", "a current canonical CreditLine is required");
  }
  if (
    creditLine.status !== CreditLineStatus.APPROVED ||
    creditLine.subjectId !== mandate.subjectId ||
    creditLine.principalId !== mandate.principalId ||
    creditLine.validatedMandateId !== mandate.mandateId ||
    creditLine.assetId !== spendPolicy.assetId ||
    creditLine.obligationId !== obligation?.obligationId ||
    !creditLine.allowedProviderIds?.includes(spendPolicy.providerId)
  ) {
    invalid("agentic_execution_credit_line_unavailable", "CreditLine authority does not match the grant");
  }
  if (
    !obligation || obligation.schemaVersion !== "obligation.v2" ||
    !CURRENT_OBLIGATION_STATUSES.has(obligation.status) ||
    obligation.executionStatus !== "executed" ||
    obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false ||
    obligation.subjectId !== mandate.subjectId ||
    obligation.principalId !== mandate.principalId ||
    obligation.mandateId !== mandate.mandateId || obligation.authorityRef !== mandate.mandateId ||
    obligation.assetId !== spendPolicy.assetId ||
    !BYTES32.test(obligation.obligationHash ?? "")
  ) {
    invalid("agentic_execution_obligation_unavailable", "a current executed no-funds Obligation is required");
  }
  if (
    !accountBinding ||
    !new Set(["account_binding.v2", "account_binding.v3"]).has(accountBinding.schemaVersion) ||
    accountBinding.status !== AccountBindingStatus.ACTIVE ||
    accountBinding.subjectId !== mandate.subjectId ||
    !BYTES32.test(accountBinding.accountHash ?? "") ||
    !SUPPORTED_CHAIN_IDS.has(accountBinding.chainId) ||
    (accountBinding.schemaVersion === "account_binding.v3" && (
      accountBinding.bindingKind !== "execution" || accountBinding.purpose !== "execution"
    ))
  ) {
    invalid("agentic_execution_account_binding_unavailable", "an active approved-chain AccountBinding is required");
  }
  if (
    targetPolicies.some((policy) =>
      policy.providerId !== spendPolicy.providerId || policy.chainId !== accountBinding.chainId
    )
  ) {
    invalid("agentic_execution_target_scope_mismatch", "target policy exceeds Provider or chain authority");
  }
  const decision = permissionDecision(authorizationDecision, {
    operationId: "walletPrepareGrant",
    resourceId: mandate.subjectId,
    now: current
  });
  if (decision.resourceType !== "subject") {
    invalid("agentic_execution_authorization_stale", "authorization resource type is invalid");
  }
  if (!Number.isSafeInteger(sessionEpoch) || sessionEpoch < 0) {
    invalid("invalid_agentic_execution_input", "sessionEpoch must be a non-negative safe integer");
  }
  if (typeof nonce !== "string" || !NONCE.test(nonce)) {
    invalid("invalid_agentic_execution_input", "nonce must be a bounded opaque identifier");
  }
  identifier("adapterId", adapterId);
  if (adapterId !== "local_sandbox") {
    invalid("agentic_execution_adapter_not_enabled", "only the local sandbox adapter is enabled");
  }
  const requestedExpiry = timestamp("requestedExpiresAt", requestedExpiresAt);
  const authorityExpiry = timestamp("mandate.expiresAt", mandate.expiresAt);
  const earliestPolicyExpiry = targetPolicies
    .map((policy) => timestamp("targetPolicy.expiresAt", policy.expiresAt))
    .reduce((earliest, value) => value < earliest ? value : earliest);
  if (
    requestedExpiry <= current || requestedExpiry > authorityExpiry ||
    requestedExpiry > earliestPolicyExpiry ||
    requestedExpiry.getTime() - current.getTime() > MAX_GRANT_LIFETIME_MS
  ) {
    invalid("agentic_execution_grant_expiry_invalid", "grant expiry exceeds current authority");
  }

  const perTxLimit = lowest([
    minor("mandate.perActionLimitMinor", mandate.perActionLimitMinor, { positive: true }),
    minor("spendPolicy.perTxLimitMinor", spendPolicy.perTxLimitMinor, { positive: true }),
    minor("creditLine.limitMinor", creditLine.limitMinor, { positive: true }),
    minor("obligation.outstandingPrincipalMinor", obligation.outstandingPrincipalMinor, { positive: true })
  ]);
  const rolling24hLimit = lowest([
    minor("mandate.aggregateLimitMinor", mandate.aggregateLimitMinor, { positive: true }),
    minor("spendPolicy.dailyLimitMinor", spendPolicy.dailyLimitMinor, { positive: true }),
    minor("creditLine.limitMinor", creditLine.limitMinor, { positive: true }),
    minor("obligation.outstandingPrincipalMinor", obligation.outstandingPrincipalMinor, { positive: true })
  ]);
  const aggregateLimit = lowest([
    minor("mandate.aggregateLimitMinor", mandate.aggregateLimitMinor, { positive: true }),
    minor("creditLine.limitMinor", creditLine.limitMinor, { positive: true }),
    minor("obligation.outstandingPrincipalMinor", obligation.outstandingPrincipalMinor, { positive: true })
  ]);
  const obligationLimit = lowest([
    minor("spendPolicy.obligationCapMinor", spendPolicy.obligationCapMinor, { positive: true }),
    minor("obligation.outstandingPrincipalMinor", obligation.outstandingPrincipalMinor, { positive: true })
  ]);
  const allowedTargetPolicyIds = targetPolicies.map(({ targetPolicyId }) => targetPolicyId).sort();
  const grant = {
    subjectId: mandate.subjectId,
    principalId: mandate.principalId,
    accountBindingId: accountBinding.accountBindingId,
    executionDomain: "evm",
    adapterId,
    mandateId: mandate.mandateId,
    mandateHash: mandate.mandateHash,
    spendPolicyId: spendPolicy.spendPolicyId,
    spendPolicyHash: spendPolicy.spendPolicyHash,
    creditLineId: creditLine.creditLineId,
    creditLineHash: creditLine.projectionHash,
    obligationId: obligation.obligationId,
    obligationHash: obligation.obligationHash,
    authorizationDecisionId: decision.decisionId,
    authorizationHash: authorizationHash(decision),
    sessionSignerRefHash: hashId("session_signer_reference", {
      accountBindingId: accountBinding.accountBindingId,
      accountHash: accountBinding.accountHash,
      sessionEpoch
    }),
    providerId: spendPolicy.providerId,
    chainIds: [accountBinding.chainId],
    assetIds: [spendPolicy.assetId],
    allowedTargetPolicyIds,
    perTxLimitMinor: perTxLimit.toString(),
    rolling24hLimitMinor: rolling24hLimit.toString(),
    aggregateLimitMinor: aggregateLimit.toString(),
    obligationLimitMinor: obligationLimit.toString(),
    validFrom: current.toISOString(),
    expiresAt: requestedExpiry.toISOString(),
    sessionEpoch,
    nonce,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    transactionsAllowed: false,
    schemaVersion: DELEGATED_WALLET_GRANT_SCHEMA_VERSION
  };
  assertNoRawPiiReference(grant, "delegatedWalletGrant");
  const grantHash = hashId("delegated_wallet_grant", grant);
  return cloneFreeze({
    grantId: `delegated_wallet_grant_${grantHash.slice(2)}`,
    grantHash,
    ...grant,
    externalPermissionRefHash: null,
    externalPolicyHash: null,
    status: DelegatedWalletGrantStatus.PREPARED,
    pendingExposureMinor: "0",
    version: 1,
    createdAt: current.toISOString(),
    updatedAt: current.toISOString()
  });
}

export function verifyDelegatedWalletGrant(grant, { now, requireUsable = false } = {}) {
  if (!grant || grant.schemaVersion !== DELEGATED_WALLET_GRANT_SCHEMA_VERSION) {
    invalid("agentic_execution_grant_invalid", "grant schema is unavailable");
  }
  identifier("grantId", grant.grantId);
  for (const name of [
    "subjectId",
    "principalId",
    "accountBindingId",
    "adapterId",
    "mandateId",
    "spendPolicyId",
    "creditLineId",
    "obligationId",
    "authorizationDecisionId",
    "providerId"
  ]) {
    identifier(name, grant[name]);
  }
  for (const name of [
    "grantHash",
    "mandateHash",
    "spendPolicyHash",
    "creditLineHash",
    "obligationHash",
    "authorizationHash",
    "sessionSignerRefHash"
  ]) {
    bytes32(name, grant[name]);
  }
  const validFrom = timestamp("validFrom", grant.validFrom);
  const expiresAt = timestamp("expiresAt", grant.expiresAt);
  const createdAt = timestamp("createdAt", grant.createdAt);
  const updatedAt = timestamp("updatedAt", grant.updatedAt);
  if (grant.externalPermissionRefHash !== null) {
    bytes32("externalPermissionRefHash", grant.externalPermissionRefHash);
  }
  if (grant.externalPolicyHash !== null) {
    bytes32("externalPolicyHash", grant.externalPolicyHash);
  }
  if (
    hashId("delegated_wallet_grant", grantHashCore(grant)) !== grant.grantHash ||
    grant.grantId !== `delegated_wallet_grant_${grant.grantHash.slice(2)}` ||
    grant.executionDomain !== "evm" || grant.adapterId !== "local_sandbox" ||
    !Object.values(DelegatedWalletGrantStatus).includes(grant.status) ||
    grant.sandboxOnly !== true || grant.productionAuthority !== false ||
    grant.fundsAuthority !== false || grant.transactionsAllowed !== false ||
    !Number.isSafeInteger(grant.version) || grant.version < 1 ||
    !Number.isSafeInteger(grant.sessionEpoch) || grant.sessionEpoch < 0 ||
    !Array.isArray(grant.chainIds) || grant.chainIds.length < 1 ||
    grant.chainIds.some((chainId) => !SUPPORTED_CHAIN_IDS.has(chainId)) ||
    new Set(grant.chainIds).size !== grant.chainIds.length ||
    !Array.isArray(grant.assetIds) || grant.assetIds.length < 1 ||
    grant.assetIds.some((assetId) => !IDENTIFIER.test(assetId)) ||
    new Set(grant.assetIds).size !== grant.assetIds.length ||
    !Array.isArray(grant.allowedTargetPolicyIds) || grant.allowedTargetPolicyIds.length < 1 ||
    grant.allowedTargetPolicyIds.some((policyId) => !IDENTIFIER.test(policyId)) ||
    new Set(grant.allowedTargetPolicyIds).size !== grant.allowedTargetPolicyIds.length ||
    typeof grant.nonce !== "string" || !NONCE.test(grant.nonce) ||
    expiresAt <= validFrom || createdAt > updatedAt ||
    minor("perTxLimitMinor", grant.perTxLimitMinor, { positive: true }) > minor("rolling24hLimitMinor", grant.rolling24hLimitMinor, { positive: true }) ||
    minor("rolling24hLimitMinor", grant.rolling24hLimitMinor, { positive: true }) > minor("aggregateLimitMinor", grant.aggregateLimitMinor, { positive: true }) ||
    minor("pendingExposureMinor", grant.pendingExposureMinor) > minor("aggregateLimitMinor", grant.aggregateLimitMinor)
  ) {
    invalid("agentic_execution_grant_invalid", "grant invariants are inconsistent");
  }
  if (
    grant.status === DelegatedWalletGrantStatus.PREPARED &&
    (grant.externalPermissionRefHash !== null || grant.externalPolicyHash !== null)
  ) {
    invalid("agentic_execution_grant_invalid", "prepared grant cannot contain an external permission");
  }
  if (
    grant.status === DelegatedWalletGrantStatus.ACTIVE &&
    (!BYTES32.test(grant.externalPermissionRefHash ?? "") || !BYTES32.test(grant.externalPolicyHash ?? ""))
  ) {
    invalid("agentic_execution_grant_invalid", "active grant requires exact local permission hashes");
  }
  if (requireUsable) {
    const current = trustedNow(now ?? new Date());
    if (
      grant.status !== DelegatedWalletGrantStatus.ACTIVE ||
      validFrom > current ||
      expiresAt <= current
    ) {
      invalid("agentic_execution_grant_not_usable", "grant is not active and current");
    }
  }
  return true;
}

export function activateDelegatedWalletGrant({
  grant,
  authorizationDecision,
  externalPermissionProjection,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyDelegatedWalletGrant(grant);
  if (
    grant.status !== DelegatedWalletGrantStatus.PREPARED ||
    timestamp("expiresAt", grant.expiresAt) <= current
  ) {
    invalid("agentic_execution_grant_not_activatable", "grant is not an activatable prepared grant");
  }
  const decision = permissionDecision(authorizationDecision, {
    operationId: "walletActivateGrant",
    resourceId: grant.grantId,
    now: current
  });
  exactShape("externalPermissionProjection", externalPermissionProjection, [
    "adapterId",
    "chainIds",
    "assetIds",
    "targetPolicyIds",
    "perTxLimitMinor",
    "rolling24hLimitMinor",
    "aggregateLimitMinor",
    "obligationLimitMinor",
    "expiresAt",
    "sessionEpoch",
    "sandboxOnly",
    "transactionsAllowed",
    "productionAuthority",
    "fundsAuthority"
  ]);
  const chainIds = closedUniqueList("chainIds", externalPermissionProjection.chainIds);
  const assetIds = closedUniqueList("assetIds", externalPermissionProjection.assetIds);
  const targetPolicyIds = closedUniqueList("targetPolicyIds", externalPermissionProjection.targetPolicyIds);
  const isSubset = (values, allowed) => values.every((value) => allowed.includes(value));
  if (
    externalPermissionProjection.adapterId !== grant.adapterId ||
    !isSubset(chainIds, grant.chainIds) || !isSubset(assetIds, grant.assetIds) ||
    !isSubset(targetPolicyIds, grant.allowedTargetPolicyIds) ||
    minor("external perTxLimitMinor", externalPermissionProjection.perTxLimitMinor, { positive: true }) > BigInt(grant.perTxLimitMinor) ||
    minor("external rolling24hLimitMinor", externalPermissionProjection.rolling24hLimitMinor, { positive: true }) > BigInt(grant.rolling24hLimitMinor) ||
    minor("external aggregateLimitMinor", externalPermissionProjection.aggregateLimitMinor, { positive: true }) > BigInt(grant.aggregateLimitMinor) ||
    minor("external obligationLimitMinor", externalPermissionProjection.obligationLimitMinor, { positive: true }) > BigInt(grant.obligationLimitMinor) ||
    externalPermissionProjection.expiresAt !== grant.expiresAt ||
    externalPermissionProjection.sessionEpoch !== grant.sessionEpoch ||
    externalPermissionProjection.sandboxOnly !== true ||
    externalPermissionProjection.transactionsAllowed !== false ||
    externalPermissionProjection.productionAuthority !== false ||
    externalPermissionProjection.fundsAuthority !== false
  ) {
    invalid("agentic_execution_external_permission_widened", "external permission exceeds the canonical grant");
  }
  const projection = cloneFreeze({
    ...structuredClone(externalPermissionProjection),
    chainIds,
    assetIds,
    targetPolicyIds
  });
  return cloneFreeze({
    value: {
      ...structuredClone(grant),
      externalPermissionRefHash: hashId("local_sandbox_permission_reference", projection),
      externalPolicyHash: hashId("local_sandbox_permission_policy", projection),
      status: DelegatedWalletGrantStatus.ACTIVE,
      version: grant.version + 1,
      updatedAt: current.toISOString()
    },
    transition: {
      previousStatus: grant.status,
      nextStatus: DelegatedWalletGrantStatus.ACTIVE,
      reasonCode: "local_sandbox_permission_compiled",
      authorizationDecisionId: decision.decisionId,
      authorizationHash: authorizationHash(decision),
      occurredAt: current.toISOString()
    }
  });
}

export function revokeDelegatedWalletGrant({ grant, authorizationDecision, reasonCode, now = new Date() }) {
  const current = trustedNow(now);
  verifyDelegatedWalletGrant(grant);
  if (![DelegatedWalletGrantStatus.PREPARED, DelegatedWalletGrantStatus.ACTIVE].includes(grant.status)) {
    invalid("agentic_execution_grant_terminal", "grant is already terminal");
  }
  const decision = permissionDecision(authorizationDecision, {
    operationId: "walletRevokeGrant",
    resourceId: grant.grantId,
    now: current
  });
  if (!["credential_compromise", "operator_request", "security_incident"].includes(reasonCode)) {
    invalid("invalid_agentic_execution_input", "grant revocation reason is invalid");
  }
  return cloneFreeze({
    value: {
      ...structuredClone(grant),
      status: DelegatedWalletGrantStatus.REVOKED,
      pendingExposureMinor: "0",
      version: grant.version + 1,
      updatedAt: current.toISOString()
    },
    transition: {
      previousStatus: grant.status,
      nextStatus: DelegatedWalletGrantStatus.REVOKED,
      reasonCode,
      releasedPendingExposureMinor: grant.pendingExposureMinor,
      authorizationDecisionId: decision.decisionId,
      authorizationHash: authorizationHash(decision),
      occurredAt: current.toISOString()
    }
  });
}

export function createPendingExposureReservation({
  grant,
  targetPolicy,
  amountMinor,
  sessionEpoch,
  idempotencyKey,
  expiresAt,
  now = new Date()
}) {
  const current = trustedNow(now);
  verifyDelegatedWalletGrant(grant, { now: current, requireUsable: true });
  verifyExecutionTargetPolicy(targetPolicy, { now: current });
  if (
    targetPolicy.providerId !== grant.providerId ||
    !grant.allowedTargetPolicyIds.includes(targetPolicy.targetPolicyId) ||
    !grant.chainIds.includes(targetPolicy.chainId) ||
    sessionEpoch !== grant.sessionEpoch
  ) {
    invalid("agentic_execution_context_stale", "grant target or session context changed");
  }
  const amount = minor("amountMinor", amountMinor, { positive: true });
  if (amount > BigInt(grant.perTxLimitMinor)) {
    invalid("agentic_execution_per_tx_limit_exceeded", "pending exposure exceeds the per-action limit");
  }
  identifier("idempotencyKey", idempotencyKey);
  const expiry = timestamp("expiresAt", expiresAt);
  if (
    expiry <= current || expiry > timestamp("grant.expiresAt", grant.expiresAt) ||
    expiry.getTime() - current.getTime() > MAX_RESERVATION_LIFETIME_MS
  ) {
    invalid("agentic_execution_reservation_expiry_invalid", "pending exposure expiry is invalid");
  }
  const core = {
    grantId: grant.grantId,
    targetPolicyId: targetPolicy.targetPolicyId,
    obligationId: grant.obligationId,
    assetId: grant.assetIds[0],
    amountMinor: amount.toString(),
    sessionEpoch,
    idempotencyKeyHash: hashId("pending_exposure_idempotency", idempotencyKey),
    reservedAt: current.toISOString(),
    expiresAt: expiry.toISOString(),
    sandboxOnly: true,
    transactionsAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: PENDING_EXPOSURE_RESERVATION_SCHEMA_VERSION
  };
  const reservationHash = hashId("pending_exposure_reservation", core);
  return cloneFreeze({
    reservationId: `pending_exposure_${reservationHash.slice(2)}`,
    reservationHash,
    ...core,
    status: PendingExposureStatus.RESERVED,
    releasedAt: null,
    releaseReasonCode: null
  });
}

export function releasePendingExposureReservation(reservation, {
  reasonCode,
  now = new Date()
}) {
  const current = trustedNow(now);
  if (
    !reservation || reservation.schemaVersion !== PENDING_EXPOSURE_RESERVATION_SCHEMA_VERSION ||
    reservation.status !== PendingExposureStatus.RESERVED ||
    !["cancelled_before_submission", "grant_revoked", "reservation_expired", "security_quarantine"].includes(reasonCode)
  ) {
    invalid("agentic_execution_reservation_not_releasable", "pending exposure cannot be released");
  }
  if (current < timestamp("reservation.reservedAt", reservation.reservedAt)) {
    invalid("agentic_execution_reservation_not_releasable", "pending exposure release precedes reservation");
  }
  const status = reasonCode === "reservation_expired"
    ? PendingExposureStatus.EXPIRED
    : reasonCode === "security_quarantine"
      ? PendingExposureStatus.QUARANTINED
      : PendingExposureStatus.RELEASED;
  return cloneFreeze({
    ...structuredClone(reservation),
    status,
    releasedAt: current.toISOString(),
    releaseReasonCode: reasonCode
  });
}

export function createAgenticExecutionEvent({
  eventType,
  grant,
  payload,
  correlationId,
  actorId,
  now = new Date()
}) {
  if (!Object.values(CreditEventType).includes(eventType)) {
    invalid("invalid_agentic_execution_input", "eventType is invalid");
  }
  return createCreditEvent({
    eventType,
    subjectId: grant.subjectId,
    obligationId: grant.obligationId,
    finalityStatus: FinalityStatus.FINALIZED,
    payload: {
      ...structuredClone(payload),
      correlationId,
      actorId,
      grantId: grant.grantId,
      grantHash: grant.grantHash,
      transactionsAllowed: false,
      productionAuthority: false,
      fundsAuthority: false
    },
    now
  });
}

export function describeAgenticExecutionGrantBoundary() {
  return cloneFreeze({
    schemaVersion: "agentic_execution_grant_boundary.v1",
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    enabledChains: [...SUPPORTED_CHAIN_IDS],
    enabledAdapters: ["local_sandbox"],
    mutationRoles: ["principal_controller"],
    agentMutationAllowed: false,
    externalPermissionProvisioning: false,
    exactPayloadAvailable: false,
    simulationAvailable: false,
    transactionsAllowed: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
