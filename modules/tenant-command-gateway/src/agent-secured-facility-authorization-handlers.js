import {
  CreditEventType,
  DomainError,
  authorizeAgentSecuredFacilityIntent,
  createAgentSecuredFacilityAuthorization,
  createCreditEvent,
  revokeAgentSecuredFacilityAuthorization
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

export const AGENT_SECURED_FACILITY_AUTHORIZATION_OPERATION_IDS = Object.freeze([
  "agentCreateSecuredFacilityAuthorization",
  "agentReadSecuredFacilityAuthorization",
  "agentRevokeSecuredFacilityAuthorization"
]);

const HASH = /^0x[0-9a-f]{64}$/;

function unavailable() {
  throw new DomainError(
    "tenant_resource_unavailable",
    "The requested resource is not available."
  );
}

function closed(payload, keys) {
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(payload, key))
  ) unavailable();
  return payload;
}

function normalizeRevoke(payload) {
  const value = closed(payload, ["expectedAuthorizationHash", "expectedVersion"]);
  if (!HASH.test(value.expectedAuthorizationHash ?? "")) unavailable();
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion !== 1) unavailable();
  return value;
}

async function projection(client, coreRepository, type, id, { lock }) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    type,
    id,
    { lock }
  );
  if (!state?.value) unavailable();
  return state;
}

async function loadResources({
  client,
  coreRepository,
  tradingFacilityId,
  lock
}) {
  const tradingFacility = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.TRADING_FACILITY,
      tradingFacilityId,
      { lock }
    )
  ).value;
  const subject = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.SUBJECT,
      tradingFacility.subjectId,
      { lock }
    )
  ).value;
  const principal = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.PRINCIPAL,
      tradingFacility.principalId,
      { lock }
    )
  ).value;
  const obligation = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.OBLIGATION,
      tradingFacility.obligationId,
      { lock }
    )
  ).value;
  const mandate = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.MANDATE,
      obligation.mandateId,
      { lock }
    )
  ).value;
  const poolObligationBinding = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.POOL_OBLIGATION_BINDING,
      obligation.poolObligationBindingId,
      { lock }
    )
  ).value;
  const accountBinding = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.ACCOUNT_BINDING,
      poolObligationBinding.accountBindingId,
      { lock }
    )
  ).value;
  const poolObligationProjection = (
    await projection(
      client,
      coreRepository,
      CoreProjectionType.POOL_OBLIGATION_PROJECTION,
      `pool_obligation_projection_${poolObligationBinding.bindingHash.slice(2)}`,
      { lock }
    )
  ).value;
  return {
    subject,
    principal,
    mandate,
    accountBinding,
    obligation,
    poolObligationBinding,
    poolObligationProjection,
    tradingFacility
  };
}

function response(authorization, { readyForIntent, schemaVersion }) {
  return {
    authorization: structuredClone(authorization),
    readyForIntent,
    executionPrewriteReadiness: {
      status: "BLOCKED_PREWRITE",
      launchProfileId: "live_testnet_secured_pool_agent_execution",
      compositionAvailable: false,
      compositionHash: null,
      blockers: [
        "distinct_agent_venue_launch_profile_missing",
        "durable_exact_composition_not_supplied",
        "fresh_reconciled_hyperliquid_account_observation_missing",
        "fresh_non_exporting_signer_handoff_missing",
        "exact_one_use_founder_run_approval_missing",
        ...(readyForIntent ? [] : ["current_facility_authorization_unavailable"])
      ],
      externalNonceAllocated: false,
      signatureCreated: false,
      networkCalled: false,
      submissionAuthorized: false,
      schemaVersion: "agent_hyperliquid_prewrite_readiness.v1"
    },
    preSigningOnly: true,
    nonceCreated: false,
    signatureCreated: false,
    networkCalled: false,
    fundsMoved: false,
    schemaVersion
  };
}

function eventFor({ eventType, authorization, actorId, requestId, correlationId, now }) {
  return createCreditEvent({
    eventType,
    subjectId: authorization.subjectId,
    obligationId: authorization.obligationId,
    chainId: authorization.chainId,
    payload: {
      agentSecuredFacilityAuthorizationId:
        authorization.agentSecuredFacilityAuthorizationId,
      authorizationHash: authorization.authorizationHash,
      subjectId: authorization.subjectId,
      principalId: authorization.principalId,
      mandateId: authorization.mandateId,
      accountBindingId: authorization.accountBindingId,
      poolObligationBindingId: authorization.poolObligationBindingId,
      obligationId: authorization.obligationId,
      tradingFacilityId: authorization.tradingFacilityId,
      operationFamily: authorization.operationFamily,
      allowedIntentKinds: authorization.allowedIntentKinds,
      status: authorization.status,
      version: authorization.version,
      actorId,
      causationId: requestId,
      correlationId,
      preSigningOnly: true,
      nonceCreated: false,
      signatureCreated: false,
      networkCalled: false,
      fundsMoved: false,
      productionAuthority: false,
      fundsAuthority: false
    },
    now
  });
}

export function createAgentSecuredFacilityAuthorizationHandler() {
  return Object.freeze({
    operationId: "agentCreateSecuredFacilityAuthorization",
    kind: "command",
    preflight: ({ payload }) => closed(payload, []),
    async plan(context) {
      const {
        client,
        coreRepository,
        authenticationContext,
        authorizationDecision,
        now,
        requestId,
        correlationId
      } = context;
      closed(context.payload, []);
      if (authorizationDecision.resourceType !== "trading_facility") unavailable();
      const resources = await loadResources({
        client,
        coreRepository,
        tradingFacilityId: authorizationDecision.resourceId,
        lock: true
      });
      const authorization = createAgentSecuredFacilityAuthorization({
        ...resources,
        now
      });
      const existing =
        await coreRepository.findAgentSecuredFacilityAuthorizationForFacilityInTransaction(
          client,
          authorization.tradingFacilityId,
          { lock: true }
        );
      if (existing) {
        throw new DomainError(
          "agent_secured_facility_authorization_exists",
          "The Facility already has an authorization record."
        );
      }
      const event = eventFor({
        eventType:
          CreditEventType.AGENT_SECURED_FACILITY_AUTHORIZATION_CREATED,
        authorization,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "agent_secured_facility_authorization",
        aggregateId: authorization.agentSecuredFacilityAuthorizationId,
        events: [{
          aggregateType: "agent_secured_facility_authorization",
          aggregateId: authorization.agentSecuredFacilityAuthorizationId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.AGENT_SECURED_FACILITY_AUTHORIZATION,
          value: authorization,
          eventId: event.eventId
        }],
        response: response(authorization, {
          readyForIntent: true,
          schemaVersion:
            "tenant_agent_secured_facility_authorization_created.v1"
        }),
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "active",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function readAgentSecuredFacilityAuthorizationHandler() {
  return Object.freeze({
    operationId: "agentReadSecuredFacilityAuthorization",
    kind: "query",
    preflight: ({ payload }) => closed(payload, []),
    async execute({
      client,
      coreRepository,
      authorizationDecision,
      payload,
      now
    }) {
      closed(payload, []);
      if (authorizationDecision.resourceType !== "trading_facility") unavailable();
      const resources = await loadResources({
        client,
        coreRepository,
        tradingFacilityId: authorizationDecision.resourceId,
        lock: false
      });
      const authorization =
        await coreRepository.findAgentSecuredFacilityAuthorizationForFacilityInTransaction(
          client,
          authorizationDecision.resourceId,
          { lock: false }
        );
      if (!authorization) unavailable();
      authorizeAgentSecuredFacilityIntent(authorization, {
        kind: "open",
        expectedAuthorizationHash: authorization.authorizationHash,
        expectedVersion: authorization.version,
        currentResourceHashes: {
          mandateHash: resources.mandate.mandateHash,
          accountHash: resources.accountBinding.accountHash,
          poolBindingHash: resources.poolObligationBinding.bindingHash,
          poolProjectionHash: resources.poolObligationProjection.projectionHash,
          obligationHash: resources.obligation.obligationHash,
          facilityHash: resources.tradingFacility.facilityHash,
          facilityStateHash: resources.tradingFacility.stateHash
        },
        now
      });
      return response(authorization, {
        readyForIntent: true,
        schemaVersion: "tenant_agent_secured_facility_authorization_ready.v1"
      });
    }
  });
}

export function revokeAgentSecuredFacilityAuthorizationHandler() {
  return Object.freeze({
    operationId: "agentRevokeSecuredFacilityAuthorization",
    kind: "command",
    preflight: ({ payload }) => normalizeRevoke(payload),
    async plan(context) {
      const {
        client,
        coreRepository,
        authenticationContext,
        authorizationDecision,
        now,
        requestId,
        correlationId
      } = context;
      const input = normalizeRevoke(context.payload);
      if (authorizationDecision.resourceType !== "trading_facility") unavailable();
      const current =
        await coreRepository.findAgentSecuredFacilityAuthorizationForFacilityInTransaction(
          client,
          authorizationDecision.resourceId,
          { lock: true }
        );
      if (!current) unavailable();
      const authorization = revokeAgentSecuredFacilityAuthorization(current, {
        expectedAuthorizationHash: input.expectedAuthorizationHash,
        expectedVersion: input.expectedVersion,
        revokedAt: now
      });
      const event = eventFor({
        eventType:
          CreditEventType.AGENT_SECURED_FACILITY_AUTHORIZATION_REVOKED,
        authorization,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "agent_secured_facility_authorization",
        aggregateId: authorization.agentSecuredFacilityAuthorizationId,
        events: [{
          aggregateType: "agent_secured_facility_authorization",
          aggregateId: authorization.agentSecuredFacilityAuthorizationId,
          expectedVersion: input.expectedVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.AGENT_SECURED_FACILITY_AUTHORIZATION,
          value: authorization,
          eventId: event.eventId
        }],
        response: response(authorization, {
          readyForIntent: false,
          schemaVersion:
            "tenant_agent_secured_facility_authorization_revoked.v1"
        }),
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "active",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function createAgentSecuredFacilityAuthorizationHandlers() {
  return Object.freeze([
    createAgentSecuredFacilityAuthorizationHandler(),
    readAgentSecuredFacilityAuthorizationHandler(),
    revokeAgentSecuredFacilityAuthorizationHandler()
  ]);
}
