import {
  TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION,
  assertTenantProtocolResult
} from "../../api-contract/src/index.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const SIGNATURE = /^0x(?:[0-9a-fA-F]{2}){65,4096}$/;

export const WALLET_EXECUTION_SDK_OPERATIONS = Object.freeze([
  "walletPrepareAccountBinding",
  "walletSubmitAccountBinding",
  "walletReadAccountBindings",
  "walletRevokeAccountBinding",
  "walletDiscoverCapabilities",
  "walletPrepareGrant",
  "walletActivateGrant",
  "walletReadGrant",
  "walletRevokeGrant",
  "walletPrepareExecution",
  "walletApproveExecution",
  "walletSubmitExecution",
  "walletReadExecution"
]);

function invalid(message) {
  throw new TypeError(message);
}

function exact(input, keys) {
  if (
    !input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))
  ) invalid("wallet execution SDK input has an invalid closed shape");
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

export class WalletExecutionClient {
  #execute;

  constructor({ execute, ...unknown }) {
    if (Object.keys(unknown).length !== 0 || typeof execute !== "function") {
      invalid("WalletExecutionClient requires one canonical Tenant Protocol execute function");
    }
    this.#execute = execute;
  }

  async #call(operationId, request) {
    const result = await this.#execute(request);
    assertTenantProtocolResult(result);
    if (result.operationId !== operationId) {
      invalid("wallet execution SDK response operation binding is invalid");
    }
    return result;
  }

  discoverCapabilities(input) {
    base(input, ["adapterId"]);
    return this.#call("walletDiscoverCapabilities", envelope(
      "walletDiscoverCapabilities", input, "wallet_adapter", input.adapterId, {}
    ));
  }

  prepareAccountBinding(input) {
    base(input, ["subjectId", "accountId"], { command: true });
    identifier("subjectId", input.subjectId);
    identifier("accountId", input.accountId);
    return this.#call("walletPrepareAccountBinding", envelope(
      "walletPrepareAccountBinding", input, "subject", input.subjectId,
      { accountId: input.accountId }
    ));
  }

  submitAccountBinding(input) {
    base(input, ["subjectId", "challengeId", "accountId", "signature"], { command: true });
    identifier("subjectId", input.subjectId);
    identifier("challengeId", input.challengeId);
    identifier("accountId", input.accountId);
    if (!SIGNATURE.test(input.signature)) invalid("signature is invalid");
    return this.#call("walletSubmitAccountBinding", envelope(
      "walletSubmitAccountBinding", input, "subject", input.subjectId,
      { challengeId: input.challengeId, accountId: input.accountId, signature: input.signature }
    ));
  }

  readAccountBindings(input) {
    base(input, ["subjectId"]);
    identifier("subjectId", input.subjectId);
    return this.#call("walletReadAccountBindings", envelope(
      "walletReadAccountBindings", input, "subject", input.subjectId, {}
    ));
  }

  revokeAccountBinding(input) {
    base(input, ["subjectId", "accountBindingId"], { command: true });
    identifier("subjectId", input.subjectId);
    identifier("accountBindingId", input.accountBindingId);
    return this.#call("walletRevokeAccountBinding", envelope(
      "walletRevokeAccountBinding", input, "subject", input.subjectId,
      { accountBindingId: input.accountBindingId }
    ));
  }

  prepareGrant(input) {
    base(input, [
      "subjectId", "providerId", "accountBindingId", "chainId", "requestedExpiresAt", "sessionEpoch", "nonce"
    ], { command: true });
    identifier("subjectId", input.subjectId);
    identifier("providerId", input.providerId);
    identifier("accountBindingId", input.accountBindingId);
    if (
      !new Set(["eip155:84532", "eip155:1952"]).has(input.chainId) ||
      !Number.isSafeInteger(input.sessionEpoch) || input.sessionEpoch < 0 ||
      !ID.test(input.nonce) || !Number.isFinite(new Date(input.requestedExpiresAt).getTime())
    ) invalid("wallet grant request is invalid");
    return this.#call("walletPrepareGrant", envelope(
      "walletPrepareGrant", input, "subject", input.subjectId,
      {
        providerId: input.providerId,
        accountBindingId: input.accountBindingId,
        chainId: input.chainId,
        requestedExpiresAt: input.requestedExpiresAt,
        sessionEpoch: input.sessionEpoch,
        nonce: input.nonce
      }
    ));
  }

  activateGrant(input) {
    base(input, ["grantId", "expectedGrantHash"], { command: true });
    bytes32("expectedGrantHash", input.expectedGrantHash);
    return this.#call("walletActivateGrant", envelope(
      "walletActivateGrant", input, "delegated_wallet_grant", input.grantId,
      { expectedGrantHash: input.expectedGrantHash }
    ));
  }

  readGrant(input) {
    base(input, ["grantId"]);
    return this.#call(
      "walletReadGrant",
      envelope("walletReadGrant", input, "delegated_wallet_grant", input.grantId, {})
    );
  }

  revokeGrant(input) {
    base(input, ["grantId", "reasonCode"], { command: true });
    if (!new Set(["credential_compromise", "operator_request", "security_incident"]).has(input.reasonCode)) {
      invalid("reasonCode is invalid");
    }
    return this.#call("walletRevokeGrant", envelope(
      "walletRevokeGrant", input, "delegated_wallet_grant", input.grantId, {},
      { reasonCode: input.reasonCode }
    ));
  }

  prepareExecution(input) {
    base(input, ["grantId", "transferIntentId"], { command: true });
    identifier("transferIntentId", input.transferIntentId);
    return this.#call("walletPrepareExecution", envelope(
      "walletPrepareExecution", input, "delegated_wallet_grant", input.grantId,
      { transferIntentId: input.transferIntentId }
    ));
  }

  approveExecution(input) {
    base(input, ["executionId", "preflightHash", "approvalArtifactHash"], { command: true });
    bytes32("preflightHash", input.preflightHash);
    bytes32("approvalArtifactHash", input.approvalArtifactHash);
    return this.#call("walletApproveExecution", envelope(
      "walletApproveExecution", input, "wallet_execution", input.executionId,
      { preflightHash: input.preflightHash, approvalArtifactHash: input.approvalArtifactHash }
    ));
  }

  submitExecution(input) {
    base(input, ["executionId", "preflightHash"], { command: true });
    bytes32("preflightHash", input.preflightHash);
    return this.#call("walletSubmitExecution", envelope(
      "walletSubmitExecution", input, "wallet_execution", input.executionId,
      { preflightHash: input.preflightHash }
    ));
  }

  readExecution(input) {
    base(input, ["executionId"]);
    return this.#call(
      "walletReadExecution",
      envelope("walletReadExecution", input, "wallet_execution", input.executionId, {})
    );
  }
}
