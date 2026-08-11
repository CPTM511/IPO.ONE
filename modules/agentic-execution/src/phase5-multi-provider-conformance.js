import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  AGENTIC_WALLET_PROVIDER_OPERATIONS,
  verifyAgenticWalletProviderCapabilities,
  verifyAgenticWalletProviderDescriptor
} from "./agentic-wallet-provider.js";

export const AECL_PHASE5_CONFORMANCE_EVIDENCE_SCHEMA_VERSION =
  "aecl_phase5_multi_provider_conformance_evidence.v1";

const EXPECTED_PROVIDERS = Object.freeze({
  base_account_spend_permission_reference: {
    providerFamily: "base_account",
    architectureCategory: "native_smart_account_spend_permission"
  },
  circle_managed_agent_wallet_reference: {
    providerFamily: "circle_developer_controlled_wallets",
    architectureCategory: "managed_mpc_wallet"
  },
  metamask_agent_wallet_reference: {
    providerFamily: "metamask",
    architectureCategory: "browser_advanced_permission_wallet"
  },
  okx_agentic_wallet_reference: {
    providerFamily: "okx_onchain_os",
    architectureCategory: "wallet_cli_mcp_tee_reference"
  },
  safe_institutional_wallet_reference: {
    providerFamily: "safe",
    architectureCategory: "institutional_multisig_smart_account"
  }
});

const EXPECTED_ADAPTER_IDS = Object.freeze(Object.keys(EXPECTED_PROVIDERS).sort());
const DECISIONS = new Set(["STEP_UP", "DENY", "QUARANTINE"]);
const BYTES32 = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !required.includes(key))) {
    invalid("invalid_aecl_phase5_conformance", `${name} has an invalid closed shape`);
  }
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function immutable(value) {
  return freeze(structuredClone(value));
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_aecl_phase5_conformance", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_aecl_phase5_conformance", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_aecl_phase5_conformance", `${name} must be lowercase bytes32`);
  }
}

function id(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_aecl_phase5_conformance", `${name} must be a bounded identifier`);
  }
}

function evidenceCore(value) {
  const core = structuredClone(value);
  delete core.conformanceEvidenceId;
  delete core.conformanceEvidenceHash;
  return core;
}

function normalizeProviderInput(provider, now) {
  exact("reference provider", provider, [
    "descriptor", "capabilities", "referenceReceiptHash", "referenceDecision",
    "architectureCategory"
  ]);
  verifyAgenticWalletProviderDescriptor(provider.descriptor);
  verifyAgenticWalletProviderCapabilities(provider.capabilities, {
    descriptor: provider.descriptor,
    now
  });
  hash("referenceReceiptHash", provider.referenceReceiptHash);
  id("architectureCategory", provider.architectureCategory);
  const expected = EXPECTED_PROVIDERS[provider.descriptor.adapterId];
  if (!expected || expected.providerFamily !== provider.descriptor.providerFamily ||
      expected.architectureCategory !== provider.architectureCategory ||
      !DECISIONS.has(provider.referenceDecision)) {
    invalid("aecl_phase5_provider_set_mismatch", "reference provider identity or architecture changed");
  }
  if (provider.descriptor.enabled !== false || provider.descriptor.externalCallsEnabled !== false ||
      provider.descriptor.dynamicallyLoaded !== false || provider.descriptor.sandboxOnly !== true ||
      provider.descriptor.productionAuthority !== false || provider.descriptor.fundsAuthority !== false ||
      provider.capabilities.unknownIsNonPermissive !== true ||
      provider.capabilities.authorizationGranted !== false || provider.capabilities.fundsAuthority !== false) {
    invalid("aecl_phase5_provider_authority_widened", "reference provider is not independently disabled");
  }
  return {
    adapterId: provider.descriptor.adapterId,
    providerFamily: provider.descriptor.providerFamily,
    architectureCategory: provider.architectureCategory,
    descriptorHash: provider.descriptor.descriptorHash,
    capabilitiesHash: provider.capabilities.capabilitiesHash,
    referenceReceiptHash: provider.referenceReceiptHash,
    referenceDecision: provider.referenceDecision,
    operationCount: provider.descriptor.supportedOperations.length,
    independentlyDisabled: true,
    externalCallsEnabled: false,
    unsupportedCapabilitiesFailClosed: true,
    externalPermissionWideningAllowed: false,
    providerSecurityDataNormalized: true,
    secondAuthorizationKernelCreated: false,
    secondEconomicKernelCreated: false,
    canonicalKernelChanged: false,
    rawSecretsRetained: false,
    productionAuthority: false,
    fundsAuthority: false
  };
}

export function createPhase5MultiProviderConformanceEvidence(input) {
  exact("conformance evidence input", input, ["providers", "observedAt", "expiresAt"]);
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS) {
    invalid("invalid_aecl_phase5_conformance", "evidence lifetime is unavailable");
  }
  const providers = input.providers.map((provider) => normalizeProviderInput(provider, observedAt))
    .sort((left, right) => left.adapterId.localeCompare(right.adapterId));
  const adapterIds = providers.map(({ adapterId }) => adapterId);
  if (providers.length !== EXPECTED_ADAPTER_IDS.length || new Set(adapterIds).size !== providers.length ||
      JSON.stringify(adapterIds) !== JSON.stringify(EXPECTED_ADAPTER_IDS)) {
    invalid("aecl_phase5_provider_set_mismatch", "exactly five current reference providers are required");
  }
  const spiContractHash = hashId("aecl_agentic_wallet_provider_spi", {
    operations: AGENTIC_WALLET_PROVIDER_OPERATIONS
  });
  const value = {
    phase: "PHASE_5",
    result: "PASS",
    providerCount: providers.length,
    commonSpiOperationCount: AGENTIC_WALLET_PROVIDER_OPERATIONS.length,
    spiContractHash,
    adapterSetHash: hashId("aecl_phase5_reference_adapter_set", providers),
    referenceProviders: providers,
    commonAeclSemanticsProviderNeutral: true,
    unsupportedCapabilitiesFailClosed: true,
    externalPermissionsNarrowOnly: true,
    providerSecurityDataNormalized: true,
    adaptersIndependentlyDisableable: true,
    secondAuthorizationKernelCreated: false,
    secondEconomicKernelCreated: false,
    canonicalKernelChanged: false,
    futureProviderRequiresKernelChange: false,
    futureProviderPrimaryWork: "adapter_and_conformance",
    safeTestnetWorkDeferred: true,
    externalCallPerformed: false,
    transactionSubmissionPerformed: false,
    productionAuthority: false,
    fundsAuthority: false,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    schemaVersion: AECL_PHASE5_CONFORMANCE_EVIDENCE_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "aeclPhase5MultiProviderConformanceEvidence");
  const evidenceHash = hashId("aecl_phase5_multi_provider_conformance_evidence", value);
  return immutable({
    conformanceEvidenceId: `aecl_phase5_conformance_${evidenceHash.slice(2)}`,
    conformanceEvidenceHash: evidenceHash,
    ...value
  });
}

function verifyReferenceProvider(value) {
  exact("reference provider evidence", value, [
    "adapterId", "providerFamily", "architectureCategory", "descriptorHash", "capabilitiesHash",
    "referenceReceiptHash", "referenceDecision", "operationCount", "independentlyDisabled",
    "externalCallsEnabled", "unsupportedCapabilitiesFailClosed", "externalPermissionWideningAllowed",
    "providerSecurityDataNormalized", "secondAuthorizationKernelCreated", "secondEconomicKernelCreated",
    "canonicalKernelChanged", "rawSecretsRetained", "productionAuthority", "fundsAuthority"
  ]);
  id("adapterId", value.adapterId);
  id("providerFamily", value.providerFamily);
  id("architectureCategory", value.architectureCategory);
  for (const key of ["descriptorHash", "capabilitiesHash", "referenceReceiptHash"]) hash(key, value[key]);
  const expected = EXPECTED_PROVIDERS[value.adapterId];
  if (!expected || expected.providerFamily !== value.providerFamily ||
      expected.architectureCategory !== value.architectureCategory || !DECISIONS.has(value.referenceDecision) ||
      value.operationCount !== AGENTIC_WALLET_PROVIDER_OPERATIONS.length ||
      value.independentlyDisabled !== true || value.externalCallsEnabled !== false ||
      value.unsupportedCapabilitiesFailClosed !== true || value.externalPermissionWideningAllowed !== false ||
      value.providerSecurityDataNormalized !== true || value.secondAuthorizationKernelCreated !== false ||
      value.secondEconomicKernelCreated !== false || value.canonicalKernelChanged !== false ||
      value.rawSecretsRetained !== false || value.productionAuthority !== false || value.fundsAuthority !== false) {
    invalid("invalid_aecl_phase5_conformance", "reference provider Evidence widens authority");
  }
}

export function verifyPhase5MultiProviderConformanceEvidence(value, {
  now = new Date(), allowExpired = false
} = {}) {
  exact("conformance evidence", value, [
    "conformanceEvidenceId", "conformanceEvidenceHash", "phase", "result", "providerCount",
    "commonSpiOperationCount", "spiContractHash", "adapterSetHash", "referenceProviders",
    "commonAeclSemanticsProviderNeutral", "unsupportedCapabilitiesFailClosed",
    "externalPermissionsNarrowOnly", "providerSecurityDataNormalized", "adaptersIndependentlyDisableable",
    "secondAuthorizationKernelCreated", "secondEconomicKernelCreated", "canonicalKernelChanged",
    "futureProviderRequiresKernelChange", "futureProviderPrimaryWork", "safeTestnetWorkDeferred",
    "externalCallPerformed", "transactionSubmissionPerformed", "productionAuthority", "fundsAuthority",
    "observedAt", "expiresAt", "schemaVersion"
  ]);
  const current = trustedNow(now);
  hash("conformanceEvidenceHash", value.conformanceEvidenceHash);
  hash("spiContractHash", value.spiContractHash);
  hash("adapterSetHash", value.adapterSetHash);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  if (!Array.isArray(value.referenceProviders)) {
    invalid("invalid_aecl_phase5_conformance", "referenceProviders must be an array");
  }
  for (const provider of value.referenceProviders) verifyReferenceProvider(provider);
  const adapterIds = value.referenceProviders.map(({ adapterId }) => adapterId);
  const exactProviderSet = value.referenceProviders.length === EXPECTED_ADAPTER_IDS.length &&
    new Set(adapterIds).size === adapterIds.length &&
    JSON.stringify(adapterIds) === JSON.stringify(EXPECTED_ADAPTER_IDS);
  const invariantFlags = value.commonAeclSemanticsProviderNeutral === true &&
    value.unsupportedCapabilitiesFailClosed === true && value.externalPermissionsNarrowOnly === true &&
    value.providerSecurityDataNormalized === true && value.adaptersIndependentlyDisableable === true &&
    value.secondAuthorizationKernelCreated === false && value.secondEconomicKernelCreated === false &&
    value.canonicalKernelChanged === false && value.futureProviderRequiresKernelChange === false &&
    value.futureProviderPrimaryWork === "adapter_and_conformance" && value.safeTestnetWorkDeferred === true &&
    value.externalCallPerformed === false && value.transactionSubmissionPerformed === false &&
    value.productionAuthority === false && value.fundsAuthority === false;
  if (value.conformanceEvidenceId !==
      `aecl_phase5_conformance_${value.conformanceEvidenceHash.slice(2)}` ||
      value.phase !== "PHASE_5" || value.result !== "PASS" || value.providerCount !== 5 ||
      value.commonSpiOperationCount !== AGENTIC_WALLET_PROVIDER_OPERATIONS.length || !exactProviderSet ||
      value.spiContractHash !== hashId("aecl_agentic_wallet_provider_spi", {
        operations: AGENTIC_WALLET_PROVIDER_OPERATIONS
      }) || value.adapterSetHash !== hashId("aecl_phase5_reference_adapter_set", value.referenceProviders) ||
      !invariantFlags || value.schemaVersion !== AECL_PHASE5_CONFORMANCE_EVIDENCE_SCHEMA_VERSION ||
      expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS ||
      (!allowExpired && (observedAt > current || expiresAt <= current)) ||
      hashId("aecl_phase5_multi_provider_conformance_evidence", evidenceCore(value)) !==
        value.conformanceEvidenceHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_aecl_phase5_conformance" :
      "invalid_aecl_phase5_conformance", "Phase 5 conformance Evidence is inconsistent or stale");
  }
  return true;
}

export function describePhase5ConformanceBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    referenceProviderCount: EXPECTED_ADAPTER_IDS.length,
    fullProviderTestnetLifecycleRequired: false,
    providerActivationEnabled: false,
    externalCallsEnabled: false,
    safeTestnetWorkDeferred: true,
    futureProviderPrimaryWork: "adapter_and_conformance",
    canonicalKernelChangeAllowed: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
