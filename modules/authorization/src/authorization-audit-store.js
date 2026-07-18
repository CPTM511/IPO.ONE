import { createOperationalId } from "../../../packages/domain/src/index.js";
import {
  AUTHORIZATION_AUDIT_SCHEMA_VERSION,
  AuthorizationDecisionValue
} from "./authorization-constants.js";
import {
  assertAuthorizationIdentifier,
  assertAuthorizationList,
  assertAuthorizationShape,
  assertAuthorizationString,
  assertNoSensitiveAuthorizationFields,
  assertPositiveCapacity,
  assertReasonCode,
  authorizationError,
  authorizationTimestamp,
  cloneAuthorization,
  deepFreezeAuthorization
} from "./authorization-utils.js";

const DECISIONS = new Set(Object.values(AuthorizationDecisionValue));

export function createAuthorizationAuditEvent(input) {
  assertAuthorizationShape("authorization audit event", input, {
    required: [
      "occurredAt",
      "requestId",
      "correlationId",
      "tenantId",
      "actorId",
      "actorType",
      "clientId",
      "tokenJtiHash",
      "operationId",
      "action",
      "resourceType",
      "resourceId",
      "authorizationDecision",
      "policyVersion",
      "reasonCode",
      "approvalIds",
      "membershipId"
    ],
    optional: [
      "accessGrantId",
      "approvalProposalId",
      "approvalProposalVersion",
      "sourceNetworkRefHash",
      "authorizationDecisionId",
      "commandPayloadHash",
      "commandHash"
    ]
  });
  if (!DECISIONS.has(input.authorizationDecision)) {
    throw authorizationError("invalid_authorization_audit", "authorization decision is invalid");
  }
  if ((input.approvalProposalId === undefined) !== (input.approvalProposalVersion === undefined)) {
    throw authorizationError("invalid_authorization_audit", "approval proposal identity is incomplete");
  }
  if (
    (input.commandHash === undefined) !== (input.commandPayloadHash === undefined) ||
    (input.authorizationDecision === AuthorizationDecisionValue.ALLOW &&
      input.authorizationDecisionId === undefined) ||
    (input.authorizationDecision === AuthorizationDecisionValue.DENY &&
      input.authorizationDecisionId !== undefined)
  ) {
    throw authorizationError("invalid_authorization_audit", "authorization command audit identity is invalid");
  }
  const event = {
    eventId: createOperationalId("authorization_event"),
    occurredAt: authorizationTimestamp("occurredAt", input.occurredAt).toISOString(),
    requestId: assertAuthorizationIdentifier("requestId", input.requestId),
    correlationId: assertAuthorizationIdentifier("correlationId", input.correlationId),
    tenantId: assertAuthorizationIdentifier("tenantId", input.tenantId),
    actorId: assertAuthorizationIdentifier("actorId", input.actorId),
    actorType: assertAuthorizationIdentifier("actorType", input.actorType),
    clientId: assertAuthorizationIdentifier("clientId", input.clientId),
    tokenJtiHash: assertAuthorizationString("tokenJtiHash", input.tokenJtiHash, {
      minimum: 32,
      maximum: 128,
      pattern: /^[A-Za-z0-9_-]+$/
    }),
    operationId: assertAuthorizationIdentifier("operationId", input.operationId),
    action: assertAuthorizationIdentifier("action", input.action),
    resourceType: assertAuthorizationIdentifier("resourceType", input.resourceType),
    resourceId: assertAuthorizationIdentifier("resourceId", input.resourceId),
    authorizationDecision: input.authorizationDecision,
    policyVersion: assertAuthorizationIdentifier("policyVersion", input.policyVersion),
    reasonCode: assertReasonCode("reasonCode", input.reasonCode),
    approvalIds: assertAuthorizationList("approvalIds", input.approvalIds, {
      maximumItems: 8,
      itemValidator: assertAuthorizationIdentifier
    }),
    ...(input.approvalProposalId === undefined
      ? {}
      : {
          approvalProposalId: assertAuthorizationIdentifier("approvalProposalId", input.approvalProposalId),
          approvalProposalVersion: (() => {
            if (!Number.isSafeInteger(input.approvalProposalVersion) || input.approvalProposalVersion < 1) {
              throw authorizationError("invalid_authorization_audit", "approval proposal version is invalid");
            }
            return input.approvalProposalVersion;
          })()
        }),
    membershipId: assertAuthorizationIdentifier("membershipId", input.membershipId),
    ...(input.accessGrantId === undefined
      ? {}
      : { accessGrantId: assertAuthorizationIdentifier("accessGrantId", input.accessGrantId) }),
    ...(input.sourceNetworkRefHash === undefined
      ? {}
      : {
          sourceNetworkRefHash: assertAuthorizationString("sourceNetworkRefHash", input.sourceNetworkRefHash, {
            minimum: 32,
            maximum: 128,
            pattern: /^[A-Za-z0-9_-]+$/
          })
        }),
    ...(input.authorizationDecisionId === undefined
      ? {}
      : {
          authorizationDecisionId: assertAuthorizationIdentifier(
            "authorizationDecisionId",
            input.authorizationDecisionId
          )
        }),
    ...(input.commandPayloadHash === undefined
      ? {}
      : {
          commandPayloadHash: assertAuthorizationString("commandPayloadHash", input.commandPayloadHash, {
            minimum: 66,
            maximum: 66,
            pattern: /^0x[0-9a-f]{64}$/
          })
        }),
    ...(input.commandHash === undefined
      ? {}
      : {
          commandHash: assertAuthorizationString("commandHash", input.commandHash, {
            minimum: 66,
            maximum: 66,
            pattern: /^0x[0-9a-f]{64}$/
          })
        }),
    schemaVersion: AUTHORIZATION_AUDIT_SCHEMA_VERSION
  };
  assertNoSensitiveAuthorizationFields(event);
  return deepFreezeAuthorization(event);
}

export class InMemoryAuthorizationAuditStore {
  #events = [];
  #eventIds = new Set();

  constructor({ maximumEvents = 25_000 } = {}) {
    this.maximumEvents = assertPositiveCapacity("maximumEvents", maximumEvents);
    Object.freeze(this);
  }

  append(input) {
    if (this.#events.length >= this.maximumEvents) {
      throw authorizationError("authorization_audit_capacity_exceeded", "authorization audit capacity is exhausted");
    }
    const event = createAuthorizationAuditEvent(input);
    if (this.#eventIds.has(event.eventId)) {
      throw authorizationError("duplicate_authorization_audit", "authorization audit ID is not unique");
    }
    this.#eventIds.add(event.eventId);
    this.#events.push(deepFreezeAuthorization(event));
    return cloneAuthorization(event);
  }

  list(filter = {}) {
    return this.#events
      .filter((event) => Object.entries(filter).every(
        ([key, value]) => value === undefined || event[key] === value
      ))
      .map(cloneAuthorization);
  }
}
