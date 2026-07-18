import {
  CreditEventType,
  DomainError,
  MandateCapability,
  MandateStatus,
  MandateTransitions,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
  activateSandboxMandate,
  assertNoRawPiiReference,
  assertPositiveMinorUnits,
  assertTransition,
  createCreditEvent,
  createMandate,
  enumValues
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const MANDATE_CAPABILITIES = new Set(enumValues(MandateCapability));
const ALLOWED_PAYLOAD_KEYS = new Set([
  "capabilities",
  "allowedProviderIds",
  "allowedCategories",
  "assetIds",
  "perActionLimitMinor",
  "aggregateLimitMinor",
  "validFrom",
  "expiresAt",
  "nonce",
  "termsRef"
]);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]*$/;
const FIVE_MINUTES_MS = 5 * 60_000;
const THIRTY_DAYS_MS = 30 * 86_400_000;
const MAX_MANDATE_WINDOW_MS = 366 * 86_400_000;
const DRAFT_REVOCATION_REASON_CODES = new Set([
  "credential_compromise",
  "operator_request",
  "security_incident"
]);
const ACTIVATION_PAYLOAD_KEYS = new Set([
  "expectedMandateHash",
  "acknowledgedTermsHash",
  "acknowledgementCode"
]);
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

function invalid(message) {
  throw new DomainError("invalid_tenant_command_payload", message);
}

function boundedText(name, value, { minimum = 1, maximum = 256, pattern } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    (pattern && !pattern.test(value))
  ) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function uniqueList(name, value, { allowEmpty = false, maximumItems, maximumLength = 128, allowedValues } = {}) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximumItems
  ) {
    invalid(`${name} is invalid`);
  }
  const normalized = value.map((item) => boundedText(name, item, {
    maximum: maximumLength,
    pattern: IDENTIFIER_PATTERN
  }));
  if (
    new Set(normalized).size !== normalized.length ||
    (allowedValues && normalized.some((item) => !allowedValues.has(item)))
  ) {
    invalid(`${name} is invalid`);
  }
  return normalized.sort();
}

function timestamp(name, value) {
  boundedText(name, value, { maximum: 64 });
  if (!/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) invalid(`${name} is invalid`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid(`${name} is invalid`);
  return parsed;
}

function termsReference(value) {
  const normalized = boundedText("termsRef", value, { maximum: 512 });
  if (/\s/.test(normalized)) invalid("termsRef is invalid");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    invalid("termsRef is invalid");
  }
  if (
    !new Set(["https:", "ipfs:", "urn:"]).has(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol === "https:" && !parsed.hostname)
  ) {
    invalid("termsRef is invalid");
  }
  return normalized;
}

export function normalizeDraftMandatePayload(payload, now) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== ALLOWED_PAYLOAD_KEYS.size ||
    Object.keys(payload).some((key) => !ALLOWED_PAYLOAD_KEYS.has(key))
  ) {
    invalid("draft Mandate payload is invalid");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new DomainError("invalid_tenant_command_clock", "tenant command clock is invalid");
  }
  const capabilities = uniqueList("capabilities", payload.capabilities, {
    maximumItems: MANDATE_CAPABILITIES.size,
    maximumLength: 64,
    allowedValues: MANDATE_CAPABILITIES
  });
  const allowedProviderIds = uniqueList("allowedProviderIds", payload.allowedProviderIds, {
    allowEmpty: true,
    maximumItems: 32
  });
  const allowedCategories = uniqueList("allowedCategories", payload.allowedCategories, {
    allowEmpty: true,
    maximumItems: 32
  });
  const assetIds = uniqueList("assetIds", payload.assetIds, {
    maximumItems: 16,
    maximumLength: 256
  });
  const providerSpend = capabilities.includes(MandateCapability.PROVIDER_SPEND);
  if (
    (providerSpend && (allowedProviderIds.length === 0 || allowedCategories.length === 0)) ||
    (!providerSpend && (allowedProviderIds.length > 0 || allowedCategories.length > 0))
  ) {
    invalid("provider scope does not match Mandate capabilities");
  }
  const perActionLimitMinor = assertPositiveMinorUnits(
    payload.perActionLimitMinor,
    "perActionLimitMinor"
  );
  const aggregateLimitMinor = assertPositiveMinorUnits(
    payload.aggregateLimitMinor,
    "aggregateLimitMinor"
  );
  if (perActionLimitMinor > aggregateLimitMinor) invalid("Mandate limits are invalid");
  const validFrom = timestamp("validFrom", payload.validFrom);
  const expiresAt = timestamp("expiresAt", payload.expiresAt);
  if (
    validFrom.getTime() < now.getTime() - FIVE_MINUTES_MS ||
    validFrom.getTime() > now.getTime() + THIRTY_DAYS_MS ||
    expiresAt.getTime() <= now.getTime() + 60_000 ||
    expiresAt.getTime() - validFrom.getTime() < 60_000 ||
    expiresAt.getTime() - validFrom.getTime() > MAX_MANDATE_WINDOW_MS
  ) {
    invalid("Mandate validity window is invalid");
  }
  const normalized = {
    capabilities,
    allowedProviderIds,
    allowedCategories,
    assetIds,
    perActionLimitMinor: perActionLimitMinor.toString(),
    aggregateLimitMinor: aggregateLimitMinor.toString(),
    validFrom: validFrom.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce: boundedText("nonce", payload.nonce, {
      minimum: 16,
      maximum: 128,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
    }),
    termsRef: termsReference(payload.termsRef)
  };
  assertNoRawPiiReference(normalized, "draftMandate");
  return normalized;
}

function normalizeEmptyMandatePayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 0
  ) {
    invalid("Mandate management payload must be empty");
  }
  return payload;
}

export function normalizeSandboxMandateActivationPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== ACTIVATION_PAYLOAD_KEYS.size ||
    Object.keys(payload).some((key) => !ACTIVATION_PAYLOAD_KEYS.has(key))
  ) {
    invalid("sandbox Mandate activation payload is invalid");
  }
  const expectedMandateHash = boundedText("expectedMandateHash", payload.expectedMandateHash, {
    maximum: 66,
    pattern: HASH_PATTERN
  });
  const acknowledgedTermsHash = boundedText("acknowledgedTermsHash", payload.acknowledgedTermsHash, {
    maximum: 66,
    pattern: HASH_PATTERN
  });
  if (payload.acknowledgementCode !== SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE) {
    invalid("acknowledgementCode is invalid");
  }
  const normalized = {
    expectedMandateHash,
    acknowledgedTermsHash,
    acknowledgementCode: payload.acknowledgementCode
  };
  assertNoRawPiiReference(normalized, "sandboxMandateActivation");
  return normalized;
}

function mandateView(mandate) {
  return {
    ...mandate,
    capabilities: [...mandate.capabilities],
    allowedProviderIds: [...mandate.allowedProviderIds],
    allowedCategories: [...mandate.allowedCategories],
    assetIds: [...mandate.assetIds]
  };
}

function requireAgentBinding(bindings, controllerActorId) {
  const controllers = bindings.filter((binding) =>
    binding.relationship === "controller" &&
    binding.actorType === ActorType.HUMAN &&
    binding.actorId === controllerActorId
  );
  const agents = bindings.filter((binding) =>
    binding.relationship === "subject" &&
    binding.actorType === ActorType.AGENT &&
    binding.controllerActorId === controllerActorId
  );
  if (controllers.length !== 1 || agents.length !== 1) {
    throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
  }
  return agents[0];
}

async function loadMandateResourceBaselines({ client, coreRepository }) {
  return {
    [ResourceKind.MANDATES]: await coreRepository.countMandatesForCapacityInTransaction(client)
  };
}

export function createDraftMandateCommandHandler() {
  return Object.freeze({
    operationId: "pilotCreateDraftMandate",
    kind: "command",
    resourceDeltas() {
      return { [ResourceKind.MANDATES]: 1 };
    },
    loadResourceBaselines: loadMandateResourceBaselines,
    async plan({
      client,
      coreRepository,
      directory,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeDraftMandatePayload(payload, now);
      if (authorizationDecision.resourceType !== "subject") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const subject = subjectState?.value;
      if (
        !subject ||
        subject.subjectType !== SubjectType.AGENT ||
        !new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]).has(subject.status)
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const principalState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.PRINCIPAL,
        subject.primaryPrincipalId,
        { lock: true }
      );
      const principal = principalState?.value;
      if (!principal || principal.status !== PrincipalStatus.ACTIVE) {
        throw new DomainError("principal_not_active", "draft Mandate requires an active Principal");
      }
      const bindings = await directory.listActiveResourceBindings({
        resourceType: "subject",
        resourceId: subject.subjectId,
        now
      });
      const agentBinding = requireAgentBinding(bindings, authenticationContext.actorId);
      const existing = await coreRepository.findMandateByPrincipalNonceInTransaction(
        client,
        principal.principalId,
        input.nonce
      );
      if (existing) {
        throw new DomainError("mandate_nonce_conflict", "principal mandate nonce is already in use");
      }
      const resourceBaselines = await loadMandateResourceBaselines({ client, coreRepository });
      const mandate = createMandate({
        principalId: principal.principalId,
        subjectId: subject.subjectId,
        ...input,
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.MANDATE_CREATED,
        subjectId: mandate.subjectId,
        payload: {
          mandateId: mandate.mandateId,
          mandateHash: mandate.mandateHash,
          principalId: mandate.principalId,
          capabilities: mandate.capabilities,
          assetIds: mandate.assetIds,
          expiresAt: mandate.expiresAt,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "mandate",
        aggregateId: mandate.mandateId,
        events: [{
          aggregateType: "mandate",
          aggregateId: mandate.mandateId,
          expectedVersion: 0,
          event
        }],
        writes: [{ type: CoreProjectionType.MANDATE, value: mandate, eventId: event.eventId }],
        response: {
          mandateId: mandate.mandateId,
          mandateHash: mandate.mandateHash,
          subjectId: mandate.subjectId,
          status: mandate.status,
          capabilities: mandate.capabilities,
          assetIds: mandate.assetIds,
          perActionLimitMinor: mandate.perActionLimitMinor,
          aggregateLimitMinor: mandate.aggregateLimitMinor,
          validFrom: mandate.validFrom,
          expiresAt: mandate.expiresAt,
          schemaVersion: "tenant_draft_mandate_created.v1"
        },
        resourceBaselines,
        authorizationResource: {
          resourceType: "mandate",
          resourceId: mandate.mandateId,
          actorBindings: [
            {
              actorId: authenticationContext.actorId,
              actorType: authenticationContext.actorType,
              relationship: "controller"
            },
            {
              actorId: agentBinding.actorId,
              actorType: agentBinding.actorType,
              relationship: "subject",
              controllerActorId: authenticationContext.actorId
            }
          ]
        }
      };
    }
  });
}

export function readMandateQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadMandate",
    kind: "query",
    async execute({ client, coreRepository, resource, payload }) {
      normalizeEmptyMandatePayload(payload);
      if (resource?.resourceType !== "mandate") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const mandate = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.MANDATE,
        resource.resourceId,
        { lock: false }
      );
      if (!mandate || mandate.mandateId !== resource.resourceId) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      return {
        mandate: mandateView(mandate),
        schemaVersion: "tenant_mandate_view.v1"
      };
    }
  });
}

export function revokeDraftMandateCommandHandler() {
  return Object.freeze({
    operationId: "pilotRevokeDraftMandate",
    kind: "command",
    async plan({
      client,
      coreRepository,
      payload,
      authenticationContext,
      authorizationDecision,
      reasonCode,
      now,
      requestId,
      correlationId
    }) {
      normalizeEmptyMandatePayload(payload);
      if (
        authorizationDecision.resourceType !== "mandate" ||
        !DRAFT_REVOCATION_REASON_CODES.has(reasonCode)
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const state = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.MANDATE,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const mandate = state?.value;
      if (!mandate || mandate.mandateId !== authorizationDecision.resourceId) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      assertTransition("Mandate", MandateTransitions, mandate.status, MandateStatus.REVOKED);
      const revoked = {
        ...mandate,
        capabilities: [...mandate.capabilities],
        allowedProviderIds: [...mandate.allowedProviderIds],
        allowedCategories: [...mandate.allowedCategories],
        assetIds: [...mandate.assetIds],
        status: MandateStatus.REVOKED,
        updatedAt: now.toISOString()
      };
      const event = createCreditEvent({
        eventType: CreditEventType.MANDATE_STATUS_CHANGED,
        subjectId: mandate.subjectId,
        payload: {
          mandateId: mandate.mandateId,
          mandateHash: mandate.mandateHash,
          previousStatus: mandate.status,
          nextStatus: revoked.status,
          reasonCode,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "mandate",
        aggregateId: mandate.mandateId,
        events: [{
          aggregateType: "mandate",
          aggregateId: mandate.mandateId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{ type: CoreProjectionType.MANDATE, value: revoked, eventId: event.eventId }],
        response: {
          mandateId: revoked.mandateId,
          mandateHash: revoked.mandateHash,
          subjectId: revoked.subjectId,
          status: revoked.status,
          reasonCode,
          updatedAt: revoked.updatedAt,
          schemaVersion: "tenant_draft_mandate_revoked.v1"
        },
        authorizationResourceTransition: {
          resourceType: "mandate",
          resourceId: revoked.mandateId,
          expectedStatus: "active",
          nextStatus: "closed",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function activateSandboxMandateCommandHandler() {
  return Object.freeze({
    operationId: "pilotActivateSandboxMandate",
    kind: "command",
    async plan({
      client,
      coreRepository,
      directory,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeSandboxMandateActivationPayload(payload);
      if (authorizationDecision.resourceType !== "mandate") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const mandateState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.MANDATE,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const mandate = mandateState?.value;
      if (
        !mandate ||
        mandate.mandateId !== authorizationDecision.resourceId ||
        mandate.status !== MandateStatus.DRAFT
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        mandate.subjectId,
        { lock: true }
      );
      const subject = subjectState?.value;
      if (
        !subject ||
        subject.subjectType !== SubjectType.AGENT ||
        subject.status !== SubjectStatus.ACTIVE ||
        subject.primaryPrincipalId !== mandate.principalId
      ) {
        throw new DomainError("mandate_activation_subject_ineligible", "Mandate Subject is not activation eligible");
      }
      const principalState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.PRINCIPAL,
        mandate.principalId,
        { lock: true }
      );
      if (!principalState || principalState.value.status !== PrincipalStatus.ACTIVE) {
        throw new DomainError("principal_not_active", "Mandate activation requires an active Principal");
      }
      const bindings = await directory.listActiveResourceBindings({
        resourceType: "subject",
        resourceId: subject.subjectId,
        now
      });
      requireAgentBinding(bindings, authenticationContext.actorId);
      const active = activateSandboxMandate(mandate, {
        ...input,
        activatedByActorId: authenticationContext.actorId,
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.MANDATE_STATUS_CHANGED,
        subjectId: mandate.subjectId,
        payload: {
          mandateId: mandate.mandateId,
          mandateHash: mandate.mandateHash,
          termsHash: active.termsHash,
          previousStatus: mandate.status,
          nextStatus: active.status,
          acknowledgementCode: input.acknowledgementCode,
          activationEvidenceHash: active.activationAcknowledgement.evidenceHash,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId,
          sandboxOnly: true,
          productionAuthority: false
        },
        now
      });
      return {
        aggregateType: "mandate",
        aggregateId: mandate.mandateId,
        events: [{
          aggregateType: "mandate",
          aggregateId: mandate.mandateId,
          expectedVersion: mandateState.aggregateVersion,
          event
        }],
        writes: [{ type: CoreProjectionType.MANDATE, value: active, eventId: event.eventId }],
        response: {
          mandate: mandateView(active),
          activationEvidenceHash: active.activationAcknowledgement.evidenceHash,
          schemaVersion: "tenant_sandbox_mandate_activated.v1"
        }
      };
    }
  });
}

export function createMandateHandlers() {
  return Object.freeze([
    activateSandboxMandateCommandHandler(),
    createDraftMandateCommandHandler(),
    readMandateQueryHandler(),
    revokeDraftMandateCommandHandler()
  ]);
}
