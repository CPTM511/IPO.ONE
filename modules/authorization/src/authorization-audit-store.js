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

export class InMemoryAuthorizationAuditStore {
  #events = [];
  #eventIds = new Set();

  constructor({ maximumEvents = 25_000 } = {}) {
    this.maximumEvents = assertPositiveCapacity("maximumEvents", maximumEvents);
    Object.freeze(this);
  }

  append(input) {
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
      optional: ["accessGrantId", "sourceNetworkRefHash"]
    });
    if (this.#events.length >= this.maximumEvents) {
      throw authorizationError("authorization_audit_capacity_exceeded", "authorization audit capacity is exhausted");
    }
    if (!DECISIONS.has(input.authorizationDecision)) {
      throw authorizationError("invalid_authorization_audit", "authorization decision is invalid");
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
      membershipId: assertAuthorizationIdentifier("membershipId", input.membershipId),
      ...(input.accessGrantId === undefined
        ? {}
        : { accessGrantId: assertAuthorizationIdentifier("accessGrantId", input.accessGrantId) }),
      ...(input.sourceNetworkRefHash === undefined
        ? {}
        : {
            sourceNetworkRefHash: assertAuthorizationString(
              "sourceNetworkRefHash",
              input.sourceNetworkRefHash,
              { minimum: 32, maximum: 128, pattern: /^[A-Za-z0-9_-]+$/ }
            )
          }),
      schemaVersion: AUTHORIZATION_AUDIT_SCHEMA_VERSION
    };
    assertNoSensitiveAuthorizationFields(event);
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
