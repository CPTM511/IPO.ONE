import { createOperationalId } from "../../../packages/domain/src/index.js";
import { AuthenticationEventType } from "./constants.js";
import {
  assertBoundedString,
  assertExactObjectKeys,
  assertSafeIdentifier,
  authenticationError,
  deepFreeze
} from "./security-utils.js";

const EVENT_TYPES = new Set(Object.values(AuthenticationEventType));
const PROHIBITED_FIELD_PATTERN = /^(?:access|refresh)?token$|cookie|privatekey|signature|authorizationcode|password|secret|rawip|pii/i;
const EVENT_PAYLOAD_FIELDS = new Map([
  [AuthenticationEventType.CREDENTIAL_REGISTERED, [
    "actorType",
    "clientAuthenticationMethod",
    "senderConstraintMethod",
    "version"
  ]],
  [AuthenticationEventType.CREDENTIAL_ROTATED, ["senderConstraintMethod", "version"]],
  [AuthenticationEventType.CREDENTIAL_SUSPENDED, ["status"]],
  [AuthenticationEventType.CREDENTIAL_REVOKED, ["status"]],
  [AuthenticationEventType.CREDENTIAL_EXPIRED, ["status"]],
  [AuthenticationEventType.SESSION_CREATED, ["sessionRefHash", "rotation"]],
  [AuthenticationEventType.SESSION_ROTATED, ["sessionRefHash", "rotation"]],
  [AuthenticationEventType.SESSION_REVOKED, ["sessionRefHash", "rotation"]],
  [AuthenticationEventType.SESSION_EXPIRED, ["sessionRefHash", "rotation"]]
]);

function assertCredentialFree(value, path = "event") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_FIELD_PATTERN.test(key.replace(/[^a-z0-9]/gi, ""))) {
      throw authenticationError("sensitive_authentication_event_rejected", `${path} contains a prohibited field`);
    }
    assertCredentialFree(nested, `${path}.${key}`);
  }
}

export class InMemoryAuthenticationEventStore {
  #events = [];
  #eventIds = new Set();

  constructor({ maximumEvents = 10_000 } = {}) {
    if (!Number.isSafeInteger(maximumEvents) || maximumEvents < 1 || maximumEvents > 100_000) {
      throw authenticationError("invalid_authentication_configuration", "maximumEvents is invalid");
    }
    this.maximumEvents = maximumEvents;
  }

  append(input) {
    if (this.#events.length >= this.maximumEvents) {
      throw authenticationError("authentication_event_capacity_exceeded", "authentication event capacity is exhausted");
    }
    const event = createAuthenticationEvent(input);
    if (this.#eventIds.has(event.eventId)) {
      throw authenticationError("duplicate_authentication_event", "authentication event id is not unique");
    }
    this.#eventIds.add(event.eventId);
    this.#events.push(event);
    return structuredClone(event);
  }

  list(filter = {}) {
    return this.#events
      .filter((event) => Object.entries(filter).every(([key, value]) => value === undefined || event[key] === value))
      .map((event) => structuredClone(event));
  }
}

export function createAuthenticationEvent(input) {
  assertExactObjectKeys("authentication event", input, {
      required: ["eventType", "tenantId", "actorId", "credentialId", "reasonCode", "occurredAt"],
      optional: ["payload"]
    });
    if (!EVENT_TYPES.has(input.eventType)) {
      throw authenticationError("invalid_authentication_event", "authentication event type is invalid");
    }
    const payload = input.payload ?? {};
    assertCredentialFree(payload);
    assertExactObjectKeys("authentication event payload", payload, {
      optional: EVENT_PAYLOAD_FIELDS.get(input.eventType) ?? []
    });
    const event = deepFreeze({
      eventId: createOperationalId("auth_event"),
      eventType: input.eventType,
      tenantId: assertSafeIdentifier("tenantId", input.tenantId),
      actorId: assertSafeIdentifier("actorId", input.actorId),
      credentialId: assertSafeIdentifier("credentialId", input.credentialId),
      reasonCode: assertBoundedString("reasonCode", input.reasonCode, {
        maximum: 96,
        pattern: /^[a-z][a-z0-9_]+$/
      }),
      occurredAt: new Date(input.occurredAt).toISOString(),
      payload: structuredClone(payload),
      schemaVersion: "authentication_event.v1"
    });
    assertCredentialFree(event);
    return event;
}
