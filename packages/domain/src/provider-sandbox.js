import { sign, verify } from "node:crypto";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";

export const PROVIDER_INTENT_DELIVERY_SCHEMA_VERSION = "provider_intent_delivery.v1";
export const PROVIDER_INTENT_VIEW_SCHEMA_VERSION = "provider_intent_view.v1";
export const PROVIDER_INTENT_ACKNOWLEDGEMENT_SCHEMA_VERSION = "provider_intent_acknowledgement.v1";
export const PROVIDER_SANDBOX_CALLBACK_SCHEMA_VERSION = "provider_sandbox_callback.v1";
export const PROVIDER_SANDBOX_CALLBACK_RESULT_SCHEMA_VERSION = "provider_sandbox_callback_result.v1";

export const ProviderDeliveryStatus = Object.freeze({
  PENDING: "pending",
  ACKNOWLEDGED: "acknowledged",
  CALLBACK_COMPLETED: "callback_completed"
});

export const ProviderSandboxOutcome = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected"
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const OUTCOMES = new Set(Object.values(ProviderSandboxOutcome));
const REASON_CODES = new Set(["provider_accepted", "provider_policy_rejected"]);
const MAX_CALLBACK_LIFETIME_MS = 5 * 60 * 1000;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function plainObject(name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid("invalid_provider_sandbox_contract", `${name} must be a plain object`);
  }
  return value;
}

function exactKeys(name, value, required, optional = []) {
  plainObject(name, value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    invalid("invalid_provider_sandbox_contract", `${name} has an invalid shape`);
  }
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_provider_sandbox_contract", `${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    invalid("invalid_provider_sandbox_contract", `${name} is invalid`);
  }
  return value;
}

function timestamp(name, value) {
  if (typeof value !== "string") invalid("invalid_provider_sandbox_contract", `${name} is invalid`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_provider_sandbox_contract", `${name} is invalid`);
  }
  return parsed;
}

function positiveMinorUnits(name, value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,77}$/.test(value)) {
    invalid("invalid_provider_sandbox_contract", `${name} is invalid`);
  }
  return value;
}

function assertSandboxFlags(value) {
  if (value.sandboxOnly !== true || value.productionFundsMoved !== false || value.withdrawable !== false) {
    invalid("provider_sandbox_boundary_violation", "Provider sandbox contract cannot carry production funds authority");
  }
}

function deliveryBody(input) {
  return {
    deliveryId: identifier("deliveryId", input.deliveryId),
    transferIntentId: identifier("transferIntentId", input.transferIntentId),
    transferIntentHash: hash("transferIntentHash", input.transferIntentHash),
    providerId: identifier("providerId", input.providerId),
    providerActorId: identifier("providerActorId", input.providerActorId),
    purposeCode: identifier("purposeCode", input.purposeCode),
    sourceAssetId: identifier("sourceAssetId", input.sourceAssetId),
    sourceAmountMinor: positiveMinorUnits("sourceAmountMinor", input.sourceAmountMinor),
    destinationAssetId: identifier("destinationAssetId", input.destinationAssetId),
    issuedAt: timestamp("issuedAt", input.issuedAt).toISOString(),
    expiresAt: timestamp("expiresAt", input.expiresAt).toISOString(),
    sandboxOnly: input.sandboxOnly,
    productionFundsMoved: input.productionFundsMoved,
    withdrawable: input.withdrawable,
    schemaVersion: input.schemaVersion
  };
}

export function createProviderIntentDelivery({
  deliveryId = createOperationalId("provider_delivery"),
  transferIntent,
  providerActorId,
  issuedAt = new Date(),
  expiresAt = new Date(issuedAt.getTime() + MAX_CALLBACK_LIFETIME_MS)
}) {
  plainObject("transferIntent", transferIntent);
  const body = deliveryBody({
    deliveryId,
    transferIntentId: transferIntent.transferIntentId,
    transferIntentHash: transferIntent.transferIntentHash,
    providerId: transferIntent.providerId,
    providerActorId,
    purposeCode: transferIntent.purposeCode,
    sourceAssetId: transferIntent.sourceAssetId,
    sourceAmountMinor: transferIntent.sourceAmountMinor,
    destinationAssetId: transferIntent.destinationAssetId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: PROVIDER_INTENT_DELIVERY_SCHEMA_VERSION
  });
  assertSandboxFlags(body);
  if (timestamp("expiresAt", body.expiresAt) <= timestamp("issuedAt", body.issuedAt)) {
    invalid("invalid_provider_sandbox_contract", "Provider delivery expiry is invalid");
  }
  return Object.freeze({
    ...body,
    deliveryHash: hashId("provider_intent_delivery", body),
    status: ProviderDeliveryStatus.PENDING,
    acknowledgementId: undefined,
    acknowledgedAt: undefined,
    callbackId: undefined,
    callbackPayloadHash: undefined,
    callbackCompletedAt: undefined,
    aggregateVersion: 1
  });
}

export function createProviderIntentView(delivery) {
  exactKeys("provider delivery", delivery, [
    "deliveryId", "transferIntentId", "transferIntentHash", "providerId", "providerActorId",
    "purposeCode", "sourceAssetId", "sourceAmountMinor", "destinationAssetId", "issuedAt",
    "expiresAt", "sandboxOnly", "productionFundsMoved", "withdrawable", "schemaVersion",
    "deliveryHash", "status", "acknowledgementId", "acknowledgedAt", "callbackId",
    "callbackPayloadHash", "callbackCompletedAt", "aggregateVersion"
  ]);
  const body = deliveryBody(delivery);
  assertSandboxFlags(body);
  hash("deliveryHash", delivery.deliveryHash);
  if (hashId("provider_intent_delivery", body) !== delivery.deliveryHash) {
    invalid("provider_delivery_integrity_mismatch", "Provider delivery hash does not match its immutable view");
  }
  if (!Object.values(ProviderDeliveryStatus).includes(delivery.status)) {
    invalid("invalid_provider_sandbox_contract", "Provider delivery status is invalid");
  }
  if (!Number.isSafeInteger(delivery.aggregateVersion) || delivery.aggregateVersion < 1) {
    invalid("invalid_provider_sandbox_contract", "Provider delivery aggregate version is invalid");
  }
  return Object.freeze({
    deliveryId: body.deliveryId,
    deliveryHash: delivery.deliveryHash,
    transferIntentId: body.transferIntentId,
    transferIntentHash: body.transferIntentHash,
    providerId: body.providerId,
    purposeCode: body.purposeCode,
    sourceAssetId: body.sourceAssetId,
    sourceAmountMinor: body.sourceAmountMinor,
    destinationAssetId: body.destinationAssetId,
    status: delivery.status,
    issuedAt: body.issuedAt,
    expiresAt: body.expiresAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: PROVIDER_INTENT_VIEW_SCHEMA_VERSION
  });
}

export function acknowledgeProviderIntent(delivery, {
  providerActorId,
  deliveryHash,
  acknowledgementId = createOperationalId("provider_acknowledgement"),
  now = new Date()
}) {
  createProviderIntentView(delivery);
  if (
    delivery.status !== ProviderDeliveryStatus.PENDING ||
    delivery.providerActorId !== identifier("providerActorId", providerActorId) ||
    delivery.deliveryHash !== hash("deliveryHash", deliveryHash) ||
    now < timestamp("issuedAt", delivery.issuedAt) ||
    now >= timestamp("expiresAt", delivery.expiresAt)
  ) {
    invalid("provider_intent_unavailable", "The requested Provider intent is not available.");
  }
  const acknowledgement = Object.freeze({
    acknowledgementId: identifier("acknowledgementId", acknowledgementId),
    deliveryId: delivery.deliveryId,
    deliveryHash: delivery.deliveryHash,
    transferIntentId: delivery.transferIntentId,
    providerId: delivery.providerId,
    acknowledgedAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: PROVIDER_INTENT_ACKNOWLEDGEMENT_SCHEMA_VERSION
  });
  return Object.freeze({
    acknowledgement,
    delivery: Object.freeze({
      ...delivery,
      status: ProviderDeliveryStatus.ACKNOWLEDGED,
      acknowledgementId: acknowledgement.acknowledgementId,
      acknowledgedAt: acknowledgement.acknowledgedAt,
      aggregateVersion: delivery.aggregateVersion + 1
    })
  });
}

function callbackBody(input) {
  const body = {
    callbackId: identifier("callbackId", input.callbackId),
    transferIntentId: identifier("transferIntentId", input.transferIntentId),
    providerId: identifier("providerId", input.providerId),
    deliveryHash: hash("deliveryHash", input.deliveryHash),
    outcome: OUTCOMES.has(input.outcome)
      ? input.outcome
      : invalid("invalid_provider_sandbox_contract", "Provider callback outcome is invalid"),
    reasonCode: REASON_CODES.has(input.reasonCode)
      ? input.reasonCode
      : invalid("invalid_provider_sandbox_contract", "Provider callback reason is invalid"),
    providerEventRefHash: hash("providerEventRefHash", input.providerEventRefHash),
    nonce: identifier("nonce", input.nonce),
    issuedAt: timestamp("issuedAt", input.issuedAt).toISOString(),
    expiresAt: timestamp("expiresAt", input.expiresAt).toISOString(),
    keyId: identifier("keyId", input.keyId),
    sandboxOnly: input.sandboxOnly,
    productionFundsMoved: input.productionFundsMoved,
    withdrawable: input.withdrawable,
    schemaVersion: input.schemaVersion
  };
  if (
    (body.outcome === ProviderSandboxOutcome.ACCEPTED && body.reasonCode !== "provider_accepted") ||
    (body.outcome === ProviderSandboxOutcome.REJECTED && body.reasonCode !== "provider_policy_rejected")
  ) {
    invalid("invalid_provider_sandbox_contract", "Provider callback outcome and reason do not match");
  }
  return body;
}

export function createSignedProviderSandboxCallback(input, { privateKey }) {
  exactKeys("Provider callback input", input, [
    "callbackId", "transferIntentId", "providerId", "deliveryHash", "outcome", "reasonCode",
    "providerEventRefHash", "nonce", "issuedAt", "expiresAt", "keyId"
  ]);
  if (!privateKey) invalid("provider_callback_signer_unavailable", "Provider callback signer is unavailable");
  const body = callbackBody({
    ...input,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: PROVIDER_SANDBOX_CALLBACK_SCHEMA_VERSION
  });
  assertSandboxFlags(body);
  const issuedAt = timestamp("issuedAt", body.issuedAt);
  const expiresAt = timestamp("expiresAt", body.expiresAt);
  if (expiresAt <= issuedAt || expiresAt.getTime() - issuedAt.getTime() > MAX_CALLBACK_LIFETIME_MS) {
    invalid("invalid_provider_sandbox_contract", "Provider callback validity window is invalid");
  }
  const payloadHash = hashId("provider_sandbox_callback_payload", body);
  const signature = sign(null, Buffer.from(payloadHash, "utf8"), privateKey).toString("base64url");
  if (!BASE64URL_SIGNATURE.test(signature)) {
    invalid("provider_callback_signer_unavailable", "Provider callback signer returned an invalid signature");
  }
  return Object.freeze({ ...body, payloadHash, signature });
}

export async function verifyProviderSandboxCallback(callback, {
  keyResolver,
  now = new Date(),
  expectedProviderId,
  expectedTransferIntentId,
  expectedDeliveryHash
}) {
  exactKeys("Provider callback", callback, [
    "callbackId", "transferIntentId", "providerId", "deliveryHash", "outcome", "reasonCode",
    "providerEventRefHash", "nonce", "issuedAt", "expiresAt", "keyId", "sandboxOnly",
    "productionFundsMoved", "withdrawable", "schemaVersion", "payloadHash", "signature"
  ]);
  if (callback.schemaVersion !== PROVIDER_SANDBOX_CALLBACK_SCHEMA_VERSION) {
    invalid("provider_callback_schema_rejected", "Provider callback schema is unavailable");
  }
  const body = callbackBody(callback);
  assertSandboxFlags(body);
  const issuedAt = timestamp("issuedAt", body.issuedAt);
  const expiresAt = timestamp("expiresAt", body.expiresAt);
  if (
    expiresAt <= issuedAt ||
    expiresAt.getTime() - issuedAt.getTime() > MAX_CALLBACK_LIFETIME_MS ||
    now < issuedAt ||
    now >= expiresAt
  ) {
    invalid("provider_callback_expired", "Provider callback is outside its validity window");
  }
  if (
    body.providerId !== expectedProviderId ||
    body.transferIntentId !== expectedTransferIntentId ||
    body.deliveryHash !== expectedDeliveryHash
  ) {
    invalid("provider_callback_binding_rejected", "Provider callback binding is invalid");
  }
  const expectedPayloadHash = hashId("provider_sandbox_callback_payload", body);
  if (callback.payloadHash !== expectedPayloadHash || !BASE64URL_SIGNATURE.test(callback.signature)) {
    invalid("provider_callback_integrity_rejected", "Provider callback integrity is invalid");
  }
  if (typeof keyResolver !== "function") {
    invalid("provider_callback_verifier_unavailable", "Provider callback verifier is unavailable");
  }
  const publicKey = await keyResolver(body.keyId);
  if (!publicKey || !verify(null, Buffer.from(expectedPayloadHash, "utf8"), publicKey, Buffer.from(callback.signature, "base64url"))) {
    invalid("provider_callback_signature_rejected", "Provider callback signature is invalid");
  }
  return Object.freeze({ ...callback });
}

export function completeProviderSandboxCallback(delivery, callback, { now = new Date() } = {}) {
  createProviderIntentView(delivery);
  if (
    delivery.status !== ProviderDeliveryStatus.ACKNOWLEDGED ||
    callback.providerId !== delivery.providerId ||
    callback.transferIntentId !== delivery.transferIntentId ||
    callback.deliveryHash !== delivery.deliveryHash
  ) {
    invalid("provider_callback_binding_rejected", "Provider callback cannot transition this delivery");
  }
  const result = Object.freeze({
    callbackId: callback.callbackId,
    transferIntentId: callback.transferIntentId,
    providerId: callback.providerId,
    deliveryHash: callback.deliveryHash,
    payloadHash: callback.payloadHash,
    nonceHash: hashId("provider_sandbox_callback_nonce", callback.nonce),
    keyId: callback.keyId,
    outcome: callback.outcome,
    reasonCode: callback.reasonCode,
    providerEventRefHash: callback.providerEventRefHash,
    processedAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: PROVIDER_SANDBOX_CALLBACK_RESULT_SCHEMA_VERSION
  });
  return Object.freeze({
    result,
    delivery: Object.freeze({
      ...delivery,
      status: ProviderDeliveryStatus.CALLBACK_COMPLETED,
      callbackId: callback.callbackId,
      callbackPayloadHash: callback.payloadHash,
      callbackCompletedAt: result.processedAt,
      aggregateVersion: delivery.aggregateVersion + 1
    })
  });
}
