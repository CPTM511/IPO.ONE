import {
  TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
  assertTenantProtocolResult
} from "../../api-contract/src/index.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const REVOCATION_REASONS = new Set([
  "credential_compromise", "operator_request", "security_incident",
  "scheduled_rotation", "delegate_expired"
]);

export const VENUE_EXECUTION_SDK_OPERATIONS = Object.freeze([
  "venueDiscoverCapabilities", "venueReadBinding", "venuePrepareDelegate",
  "venueActivateDelegate", "venueRevokeDelegate", "venuePrepareExecution",
  "venueSubmitExecution", "venueReadExecution"
]);

function invalid(message) { throw new TypeError(message); }

function exact(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
    invalid("venue execution SDK input has an invalid closed shape");
  }
  return input;
}

function identifier(name, value) {
  if (typeof value !== "string" || !ID.test(value)) invalid(`${name} is invalid`);
  return value;
}

function requestIdentifier(name, value) {
  if (typeof value !== "string" || !REQUEST_ID.test(value)) invalid(`${name} is invalid`);
  return value;
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) invalid(`${name} is invalid`);
  return value;
}

function base(input, keys, { command = false } = {}) {
  exact(input, [...keys, ...(command ? ["idempotencyKey"] : []), "requestId", "correlationId"]);
  requestIdentifier("requestId", input.requestId);
  requestIdentifier("correlationId", input.correlationId);
  if (command) requestIdentifier("idempotencyKey", input.idempotencyKey);
  return input;
}

function envelope(operationId, input, resourceType, resourceId, payload, extra = {}) {
  return {
    operationId,
    payload,
    resource: { resourceType, resourceId: identifier("resourceId", resourceId) },
    requestId: input.requestId,
    correlationId: input.correlationId,
    ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
    ...extra,
    schemaVersion: TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION
  };
}

export class VenueExecutionClient {
  #execute;

  constructor({ execute, ...unknown }) {
    if (Object.keys(unknown).length !== 0 || typeof execute !== "function") {
      invalid("VenueExecutionClient requires one canonical Tenant Protocol execute function");
    }
    this.#execute = execute;
  }

  async #call(operationId, request) {
    const result = await this.#execute(request);
    assertTenantProtocolResult(result);
    if (result.operationId !== operationId) invalid("venue execution SDK response operation binding is invalid");
    return result;
  }

  discoverCapabilities(input) {
    base(input, ["adapterId"]);
    return this.#call("venueDiscoverCapabilities", envelope(
      "venueDiscoverCapabilities", input, "venue_adapter", input.adapterId, {}
    ));
  }

  readBinding(input) {
    base(input, ["bindingId"]);
    return this.#call("venueReadBinding", envelope(
      "venueReadBinding", input, "venue_binding", input.bindingId, {}
    ));
  }

  prepareDelegate(input) {
    base(input, ["bindingId", "delegateAddressHash", "signerReferenceHash", "requestedExpiresAt"], { command: true });
    bytes32("delegateAddressHash", input.delegateAddressHash);
    bytes32("signerReferenceHash", input.signerReferenceHash);
    if (!Number.isFinite(new Date(input.requestedExpiresAt).getTime())) invalid("requestedExpiresAt is invalid");
    return this.#call("venuePrepareDelegate", envelope(
      "venuePrepareDelegate", input, "venue_binding", input.bindingId,
      {
        delegateAddressHash: input.delegateAddressHash,
        signerReferenceHash: input.signerReferenceHash,
        requestedExpiresAt: input.requestedExpiresAt
      }
    ));
  }

  activateDelegate(input) {
    base(input, ["delegateId", "expectedDelegateHash"], { command: true });
    bytes32("expectedDelegateHash", input.expectedDelegateHash);
    return this.#call("venueActivateDelegate", envelope(
      "venueActivateDelegate", input, "venue_delegate", input.delegateId,
      { expectedDelegateHash: input.expectedDelegateHash }
    ));
  }

  revokeDelegate(input) {
    base(input, ["delegateId", "reasonCode"], { command: true });
    if (!REVOCATION_REASONS.has(input.reasonCode)) invalid("reasonCode is invalid");
    return this.#call("venueRevokeDelegate", envelope(
      "venueRevokeDelegate", input, "venue_delegate", input.delegateId, {},
      { reasonCode: input.reasonCode }
    ));
  }

  prepareExecution(input) {
    base(input, ["delegateId", "orderIntentId", "orderIntentHash"], { command: true });
    identifier("orderIntentId", input.orderIntentId);
    bytes32("orderIntentHash", input.orderIntentHash);
    return this.#call("venuePrepareExecution", envelope(
      "venuePrepareExecution", input, "venue_delegate", input.delegateId,
      { orderIntentId: input.orderIntentId, orderIntentHash: input.orderIntentHash }
    ));
  }

  submitExecution(input) {
    base(input, ["executionId", "preparedExecutionHash"], { command: true });
    bytes32("preparedExecutionHash", input.preparedExecutionHash);
    return this.#call("venueSubmitExecution", envelope(
      "venueSubmitExecution", input, "venue_execution", input.executionId,
      { preparedExecutionHash: input.preparedExecutionHash }
    ));
  }

  readExecution(input) {
    base(input, ["executionId"]);
    return this.#call("venueReadExecution", envelope(
      "venueReadExecution", input, "venue_execution", input.executionId, {}
    ));
  }
}
