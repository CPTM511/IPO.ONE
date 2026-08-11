import { DomainError } from "../../../packages/domain/src/index.js";
import {
  VENUE_EXECUTION_PROVIDER_OPERATIONS,
  createVenueExecutionProviderCapabilities,
  createVenueExecutionProviderDescriptor,
  createVenueExecutionProviderResult
} from "./venue-execution-provider.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function support(localOperations) {
  const supported = new Set(localOperations);
  return Object.fromEntries(
    VENUE_EXECUTION_PROVIDER_OPERATIONS.map((operationId) => [
      operationId,
      supported.has(operationId) ? "supported" : "unsupported"
    ])
  );
}

export function createLocalHypercoreVenueProvider({
  contextEpoch = 0,
  now = new Date()
} = {}) {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(contextEpoch) ||
    contextEpoch < 0
  ) {
    fail(
      "invalid_hypercore_venue_adapter_configuration",
      "a trusted clock and context epoch are required"
    );
  }
  const descriptor = createVenueExecutionProviderDescriptor({
    adapterId: "hypercore_testnet_local",
    venueId: "hyperliquid_hypercore",
    adapterVersion: "1.0.0",
    enabled: true,
    externalCallsEnabled: false
  });
  const capabilities = createVenueExecutionProviderCapabilities({
    descriptor,
    environment: "hyperliquid_testnet",
    contextEpoch,
    operationSupport: support([
      "venueDiscoverCapabilities",
      "venueReadBinding",
      "venuePrepareDelegate",
      "venueRevokeDelegate",
      "venuePrepareExecution",
      "venueReadExecution"
    ]),
    signingSchemes: ["l1_action", "user_signed_action"],
    actionClasses: [
      "order",
      "reduceOnlyOrder",
      "cancel",
      "cancelByCloid",
      "modify"
    ],
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  });

  const unavailable = async (request, reasonCode, externalState) =>
    createVenueExecutionProviderResult({
      request,
      status: "unavailable",
      reasonCodes: [reasonCode],
      externalState,
      externalCallPerformed: false,
      observedAt: now
    });

  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createVenueExecutionProviderResult({
        request,
        status: "succeeded",
        reasonCodes: ["local_capability_contract_observed"],
        externalState: "local_contract_only",
        externalCallPerformed: false,
        capabilities,
        observedAt: now
      });
    },
    async readBinding(request) {
      return unavailable(
        request,
        "external_info_read_not_invoked",
        "canonical_binding_required"
      );
    },
    async prepareDelegate(request) {
      return unavailable(
        request,
        "isolated_delegate_provisioning_not_composed",
        "local_projection_only"
      );
    },
    async activateDelegate(request) {
      return unavailable(
        request,
        "approve_agent_not_authorized",
        "not_activated"
      );
    },
    async revokeDelegate(request) {
      return unavailable(
        request,
        "external_deregistration_not_authorized",
        "local_tombstone_required"
      );
    },
    async prepareExecution(request) {
      return unavailable(
        request,
        "offline_preflight_composition_required",
        "not_prepared"
      );
    },
    async submitExecution(request) {
      return unavailable(
        request,
        "hypercore_submission_not_authorized",
        "not_submitted"
      );
    },
    async readExecution(request) {
      return unavailable(
        request,
        "external_reconciliation_not_invoked",
        "canonical_evidence_required"
      );
    }
  });
}

export function describeHypercoreVenueAdapterBoundary() {
  return Object.freeze({
    adapterId: "hypercore_testnet_local",
    venueId: "hyperliquid_hypercore",
    environment: "hyperliquid_testnet",
    localProjectionImplemented: true,
    signerFreeInfoReusable: true,
    offlineExecutionFixtureReusable: true,
    riskGuardianReusable: true,
    reconciliationReusable: true,
    externalCallsEnabled: false,
    approveAgentEnabled: false,
    delegateActivationEnabled: false,
    officialSigningEnabled: false,
    exchangeSubmissionEnabled: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
