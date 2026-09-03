import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";
import {
  AgentTenantCommandClient,
  SystemWorkerTenantCommandClient
} from "../../../modules/tenant-command-gateway/src/index.js";
import {
  ROLE_BUNDLE_CAPABILITIES,
  RoleBundle
} from "../../../modules/authorization/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  LOCAL_METERED_PROVIDER_MAX_EVENT_CHARGE_MINOR,
  LOCAL_METERED_PROVIDER_MAX_QUANTITY,
  LOCAL_METERED_PROVIDER_MAX_WINDOW_CHARGE_MINOR,
  LOCAL_METERED_PROVIDER_MEASUREMENT_UNIT,
  LOCAL_METERED_PROVIDER_RESOURCE_CLASS,
  LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR,
  findHostedSyntheticMeteredUsageRun,
  prepareHostedSyntheticMeteredUsage
} from "./local-synthetic-metered-provider.js";

const REQUEST_SCHEMA_VERSION = "ipo_one_synthetic_metered_resource_request.v1";
const RESPONSE_SCHEMA_VERSION = "ipo_one_synthetic_metered_resource_receipt.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{15,255}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,17}$/;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exactRequest(value) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(["idempotencyKey", "obligationId", "quantity", "schemaVersion"])
  ) invalid("invalid_synthetic_metered_resource_request", "Synthetic Metered Resource request is invalid");
  if (
    value.schemaVersion !== REQUEST_SCHEMA_VERSION ||
    !SAFE_ID.test(value.obligationId ?? "") ||
    !POSITIVE_INTEGER.test(value.quantity ?? "") ||
    BigInt(value.quantity) > BigInt(LOCAL_METERED_PROVIDER_MAX_QUANTITY) ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey ?? "")
  ) invalid("invalid_synthetic_metered_resource_request", "Synthetic Metered Resource request is invalid");
  return Object.freeze({ ...value });
}

function internalCredentialId({ tenantId, systemActorId }) {
  return `credential_internal_metered_${hashId("hosted_metered_system_credential", {
    tenantId,
    systemActorId
  }).slice(2, 34)}`;
}

export function createHostedMeteredSystemBoundary({
  credentialRegistry,
  referenceHasher,
  tenantId,
  systemActorId,
  systemClientId,
  policyVersion,
  clock = () => new Date()
}) {
  if (
    typeof credentialRegistry?.assertActive !== "function" ||
    typeof referenceHasher?.hash !== "function" ||
    !SAFE_ID.test(tenantId ?? "") || !SAFE_ID.test(systemActorId ?? "") ||
    !SAFE_ID.test(systemClientId ?? "") || !SAFE_ID.test(policyVersion ?? "") ||
    typeof clock !== "function"
  ) invalid("invalid_hosted_metered_system_boundary", "Hosted Metered Resource system boundary is invalid");
  const credentialId = internalCredentialId({ tenantId, systemActorId });
  const capabilities = Object.freeze([
    ...ROLE_BUNDLE_CAPABILITIES[RoleBundle.SYSTEM_WORKER]
  ]);
  const credential = Object.freeze({
    credentialId,
    tenantId,
    actorId: systemActorId,
    actorType: ActorType.SYSTEM_WORKER,
    issuer: "https://ipo.one",
    subjectRefHash: referenceHasher.hash("subject", `internal-metered\0${systemActorId}`),
    referenceHashKeyVersion: referenceHasher.keyVersion,
    clientId: systemClientId,
    clientAuthenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraint: Object.freeze({
      method: SenderConstraintMethod.DPOP,
      thumbprint: referenceHasher.hash("sender.constraint", `internal-metered\0${systemActorId}`),
      referenceProtected: true
    }),
    roles: Object.freeze([RoleBundle.SYSTEM_WORKER]),
    allowedCapabilities: capabilities,
    policyVersion,
    status: "active",
    version: 1,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    schemaVersion: "internal_runtime_credential.v1"
  });
  const wrappedRegistry = Object.freeze({
    async assertActive(requestedCredentialId, now) {
      if (requestedCredentialId === credentialId) return credential;
      return credentialRegistry.assertActive(requestedCredentialId, now);
    }
  });
  function createContext() {
    const authenticatedAt = clock();
    return createAuthenticationContext({
      tenantId,
      actorId: systemActorId,
      actorType: ActorType.SYSTEM_WORKER,
      clientId: systemClientId,
      credentialId,
      credentialVersion: 1,
      policyVersion,
      capabilities,
      roles: [RoleBundle.SYSTEM_WORKER],
      tokenJtiHash: referenceHasher.hash("internal.metered.token", credentialId),
      authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
      senderConstraintMethod: SenderConstraintMethod.DPOP,
      authenticatedAt,
      amr: []
    });
  }
  return Object.freeze({ credentialRegistry: wrappedRegistry, createContext });
}

export function hostedSyntheticMeteredResourceProfile(provider) {
  return Object.freeze({
    status: "AVAILABLE",
    providerId: provider.providerId,
    resourceClass: LOCAL_METERED_PROVIDER_RESOURCE_CLASS,
    measurementUnit: LOCAL_METERED_PROVIDER_MEASUREMENT_UNIT,
    unitPriceMinor: LOCAL_METERED_PROVIDER_UNIT_PRICE_MINOR,
    maxQuantityPerEvent: LOCAL_METERED_PROVIDER_MAX_QUANTITY,
    maxChargePerEventMinor: LOCAL_METERED_PROVIDER_MAX_EVENT_CHARGE_MINOR,
    maxChargePerWindowMinor: LOCAL_METERED_PROVIDER_MAX_WINDOW_CHARGE_MINOR,
    syntheticOnly: true,
    productionFundsMoved: false,
    externalProviderExecutionEnabled: false,
    schemaVersion: "ipo_one_synthetic_metered_resource_profile.v1"
  });
}

export function createHostedSyntheticMeteredResourceService({
  gateway,
  pool,
  provider,
  systemBoundary,
  clock = () => new Date()
}) {
  if (
    typeof gateway?.execute !== "function" || !pool?.connect ||
    typeof provider?.signEvidence !== "function" ||
    typeof systemBoundary?.createContext !== "function" ||
    typeof clock !== "function"
  ) invalid("invalid_hosted_metered_resource_service", "Hosted Metered Resource service is invalid");
  const profile = hostedSyntheticMeteredResourceProfile(provider);
  return Object.freeze({
    profile,
    async consume({ body, authenticationContext, networkContext, requestId }) {
      const request = exactRequest(body);
      if (authenticationContext?.actorType !== ActorType.AGENT) {
        invalid("synthetic_metered_resource_denied", "Synthetic Metered Resource is available only to an authorized Agent");
      }
      const correlationId = `correlation-hosted-metered-${hashId("hosted_metered_correlation", {
        actorId: authenticationContext.actorId,
        obligationId: request.obligationId,
        idempotencyKey: request.idempotencyKey
      }).slice(2, 34)}`;
      const clientOptions = {
        gateway,
        networkContextProvider: async () => networkContext
      };
      const agentClient = new AgentTenantCommandClient({
        ...clientOptions,
        authenticationContextProvider: async () => authenticationContext
      });
      const owned = await agentClient.getOwnObligation({
        obligationId: request.obligationId,
        requestId,
        correlationId
      });
      const obligation = owned.response?.obligation;
      if (
        obligation?.obligationId !== request.obligationId ||
        obligation.status !== "active" || obligation.executionStatus !== "executed" ||
        obligation.sandboxOnly !== true || obligation.productionFundsMoved !== false
      ) invalid("synthetic_metered_resource_unavailable", "An active executed sandbox Obligation is required");
      const systemContext = systemBoundary.createContext();
      const runId = `hosted_${hashId("hosted_metered_request", {
        tenantId: authenticationContext.tenantId,
        actorId: authenticationContext.actorId,
        obligationId: request.obligationId,
        idempotencyKey: request.idempotencyKey
      }).slice(2, 34)}`;
      const previous = await findHostedSyntheticMeteredUsageRun({
        pool,
        authenticationContext: systemContext,
        runId
      });
      const prepared = await prepareHostedSyntheticMeteredUsage({
        pool,
        authenticationContext: systemContext,
        obligationId: request.obligationId,
        provider,
        runId,
        quantity: request.quantity,
        now: clock()
      });
      const worker = new SystemWorkerTenantCommandClient({
        ...clientOptions,
        authenticationContextProvider: async () => systemContext
      });
      const admitted = await worker.admitMeteredUsage({
        obligationId: request.obligationId,
        evidence: prepared.evidence,
        expectedPolicyHash: prepared.expectedPolicyHash,
        providerSignature: prepared.providerSignature,
        idempotencyKey: `hosted-metered-admission-${hashId("hosted_metered_admission_request", runId).slice(2, 34)}`,
        requestId,
        correlationId
      });
      const response = admitted.response;
      return Object.freeze({
        status: "consumed",
        providerId: profile.providerId,
        resourceClass: profile.resourceClass,
        measurementUnit: profile.measurementUnit,
        quantity: response.evidence.quantity,
        unitPriceMinor: response.evidence.unitPriceMinor,
        chargeMinor: response.admission.chargeMinor,
        consumedWindowMinor: response.admission.windowChargeAfterMinor,
        remainingWindowMinor: (
          BigInt(profile.maxChargePerWindowMinor) -
          BigInt(response.admission.windowChargeAfterMinor)
        ).toString(),
        maxChargePerWindowMinor: profile.maxChargePerWindowMinor,
        obligationId: response.obligationId,
        usageEvidenceId: response.evidence.usageEvidenceId,
        meteredUsageAdmissionId: response.admission.meteredUsageAdmissionId,
        ledgerTransactionId: response.ledgerTransactionId,
        replayed: admitted.replayed || previous !== undefined,
        nextAction: response.nextAction,
        sandboxOnly: true,
        productionFundsMoved: false,
        realFundsEnabled: false,
        schemaVersion: RESPONSE_SCHEMA_VERSION
      });
    }
  });
}
