import { createHash } from "node:crypto";
import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod
} from "../../authentication/src/index.js";

export const EconomicActionType = Object.freeze({
  ACCEPT_OFFER: "accept_offer",
  EXECUTE_OBLIGATION: "execute_obligation",
  POST_REPAYMENT: "post_repayment"
});

export const EconomicActionConfirmationMethod = Object.freeze({
  WALLET_PERSONAL_SIGN: "wallet_personal_sign",
  AUTHENTICATED_ACCOUNT_CLICK: "authenticated_account_click",
  AUTHENTICATED_PROTOCOL_REQUEST: "authenticated_protocol_request"
});

const ACTION_BY_OPERATION = Object.freeze({
  pilotAcceptCreditOffer: EconomicActionType.ACCEPT_OFFER,
  pilotExecuteSandboxObligation: EconomicActionType.EXECUTE_OBLIGATION,
  pilotPostSandboxRepayment: EconomicActionType.POST_REPAYMENT
});

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const USER_CONFIRMATION_KEYS = Object.freeze([
  "actionType",
  "resourceId",
  "resourceHash",
  "payloadHash",
  "requestId",
  "requestNonce",
  "requestedAt",
  "confirmedAt",
  "expiresAt",
  "confirmationMethod",
  "confirmationHash",
  "messageHash",
  "rawSignaturePersisted",
  "blockchainTransactionSubmitted",
  "schemaVersion"
]);
const PROTOCOL_CONFIRMATION_KEYS = Object.freeze([
  "actionType",
  "resourceId",
  "resourceHash",
  "payloadHash",
  "requestId",
  "confirmationMethod",
  "confirmationHash",
  "rawSignaturePersisted",
  "blockchainTransactionSubmitted",
  "schemaVersion"
]);

function invalid(message = "Economic action confirmation is invalid") {
  throw new DomainError("economic_action_confirmation_invalid", message);
}

function exactObject(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function timestamp(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function businessPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const { actionConfirmation: _confirmation, ...value } = payload;
  return value;
}

export function economicActionTypeForOperation(operationId) {
  return ACTION_BY_OPERATION[operationId];
}

export function sha256Json(value) {
  return `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function authenticatedProtocolResourceHash(resource) {
  return hashId("economic_action_protocol_resource", resource);
}

export function authenticatedProtocolPayloadHash(operationId, payload) {
  return hashId("economic_action_protocol_payload", {
    operationId,
    payload: businessPayload(payload)
  });
}

export function createAuthenticatedProtocolActionConfirmation({
  operationId,
  payload,
  resource,
  requestId
}) {
  const actionType = economicActionTypeForOperation(operationId);
  if (
    !actionType ||
    !resource ||
    typeof resource !== "object" ||
    typeof resource.resourceId !== "string" ||
    !REQUEST_ID_PATTERN.test(requestId ?? "")
  ) {
    invalid("Authenticated protocol confirmation input is invalid");
  }
  const value = {
    actionType,
    resourceId: resource.resourceId,
    resourceHash: authenticatedProtocolResourceHash(resource),
    payloadHash: authenticatedProtocolPayloadHash(operationId, payload),
    requestId,
    confirmationMethod: EconomicActionConfirmationMethod.AUTHENTICATED_PROTOCOL_REQUEST,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
  value.confirmationHash = hashId("economic_action_authenticated_protocol_request", value);
  return Object.freeze(value);
}

function assertSharedFields(value, expected) {
  if (
    value.actionType !== expected.actionType ||
    value.resourceId !== expected.resourceId ||
    value.requestId !== expected.requestId ||
    !RESOURCE_ID_PATTERN.test(value.resourceId ?? "") ||
    !REQUEST_ID_PATTERN.test(value.requestId ?? "") ||
    !HASH_PATTERN.test(value.resourceHash ?? "") ||
    !HASH_PATTERN.test(value.payloadHash ?? "") ||
    !HASH_PATTERN.test(value.confirmationHash ?? "") ||
    value.rawSignaturePersisted !== false ||
    value.blockchainTransactionSubmitted !== false ||
    value.schemaVersion !== "economic_action_confirmation_result.v1"
  ) {
    invalid();
  }
}

function normalizeProtocolConfirmation(value, expected, authenticationContext) {
  if (
    !exactObject(value, PROTOCOL_CONFIRMATION_KEYS) ||
    value.confirmationMethod !== EconomicActionConfirmationMethod.AUTHENTICATED_PROTOCOL_REQUEST ||
    authenticationContext.authenticationMethod === ClientAuthenticationMethod.SIWE
  ) {
    invalid("The authenticated protocol confirmation is not allowed for this session");
  }
  const expectedResourceHash = authenticatedProtocolResourceHash(expected.resource);
  const expectedPayloadHash = authenticatedProtocolPayloadHash(
    expected.operationId,
    expected.businessPayload
  );
  const unsigned = {
    actionType: value.actionType,
    resourceId: value.resourceId,
    resourceHash: value.resourceHash,
    payloadHash: value.payloadHash,
    requestId: value.requestId,
    confirmationMethod: value.confirmationMethod,
    rawSignaturePersisted: value.rawSignaturePersisted,
    blockchainTransactionSubmitted: value.blockchainTransactionSubmitted,
    schemaVersion: value.schemaVersion
  };
  if (
    value.resourceHash !== expectedResourceHash ||
    value.payloadHash !== expectedPayloadHash ||
    value.confirmationHash !== hashId("economic_action_authenticated_protocol_request", unsigned)
  ) {
    invalid("The authenticated protocol confirmation does not match this request");
  }
  return structuredClone(value);
}

function normalizeUserConfirmation(value, expected, authenticationContext, now) {
  if (!exactObject(value, USER_CONFIRMATION_KEYS)) invalid();
  const method = value.confirmationMethod;
  const walletSession = authenticationContext.authenticationMethod === ClientAuthenticationMethod.SIWE;
  if (
    (walletSession && method !== EconomicActionConfirmationMethod.WALLET_PERSONAL_SIGN) ||
    (!walletSession && method !== EconomicActionConfirmationMethod.AUTHENTICATED_ACCOUNT_CLICK) ||
    authenticationContext.actorType !== ActorType.HUMAN ||
    !HASH_PATTERN.test(value.messageHash ?? "") ||
    typeof value.requestNonce !== "string" ||
    !/^human_action_confirmation_[0-9a-f-]{36}$/.test(value.requestNonce)
  ) {
    invalid("The confirmation method does not match this authenticated session");
  }
  if (
    value.resourceHash !== expected.resourceHash ||
    value.payloadHash !== expected.payloadHash
  ) {
    invalid("The confirmation is not bound to this exact action");
  }
  const requestedAt = timestamp(value.requestedAt);
  const confirmedAt = timestamp(value.confirmedAt);
  const expiresAt = timestamp(value.expiresAt);
  if (
    !requestedAt ||
    !confirmedAt ||
    !expiresAt ||
    confirmedAt < requestedAt ||
    confirmedAt > expiresAt ||
    expiresAt.getTime() - requestedAt.getTime() > 5 * 60_000 ||
    requestedAt.getTime() > now.getTime() + 60_000 ||
    confirmedAt.getTime() > now.getTime() + 60_000 ||
    now > expiresAt
  ) {
    invalid("The economic action confirmation is expired or has invalid timing");
  }
  return structuredClone(value);
}

export function normalizeEconomicActionConfirmation(value, {
  operationId,
  resource,
  resourceHash,
  payloadHash,
  requestId,
  authenticationContext,
  now = new Date(),
  businessPayload
}) {
  const actionType = economicActionTypeForOperation(operationId);
  if (
    !actionType ||
    !resource ||
    typeof resource.resourceId !== "string" ||
    !authenticationContext
  ) {
    invalid("Economic action confirmation dependencies are invalid");
  }
  const expected = {
    actionType,
    operationId,
    resource,
    resourceId: resource.resourceId,
    resourceHash,
    payloadHash,
    requestId,
    businessPayload
  };
  assertSharedFields(value, expected);
  return value.confirmationMethod === EconomicActionConfirmationMethod.AUTHENTICATED_PROTOCOL_REQUEST
    ? normalizeProtocolConfirmation(value, expected, authenticationContext)
    : normalizeUserConfirmation(value, expected, authenticationContext, now);
}

export function summarizeEconomicActionConfirmation(value) {
  return {
    actionType: value.actionType,
    confirmationMethod: value.confirmationMethod,
    confirmationHash: value.confirmationHash,
    messageHash: value.messageHash,
    resourceHash: value.resourceHash,
    payloadHash: value.payloadHash,
    requestId: value.requestId,
    confirmedAt: value.confirmedAt,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: value.schemaVersion
  };
}
