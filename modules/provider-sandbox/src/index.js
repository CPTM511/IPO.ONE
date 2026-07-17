import { sign, verify } from "node:crypto";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";

export const PROVIDER_SANDBOX_DELIVERY_PATH = "/v1/provider-sandbox/deliver";
export const PROVIDER_SANDBOX_DELIVERY_ENVELOPE_SCHEMA_VERSION =
  "provider_sandbox_delivery_envelope.v1";
export const PROVIDER_SANDBOX_DELIVERY_RESULT_SCHEMA_VERSION =
  "provider_sandbox_delivery_result.v1";

const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const DELIVERY_KEYS = [
  "deliveryId",
  "deliveryHash",
  "transferIntentId",
  "transferIntentHash",
  "providerId",
  "purposeCode",
  "sourceAssetId",
  "sourceAmountMinor",
  "destinationAssetId",
  "status",
  "issuedAt",
  "expiresAt",
  "sandboxOnly",
  "productionFundsMoved",
  "withdrawable",
  "schemaVersion"
];

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function assertProviderIntentView(delivery) {
  if (
    !exactKeys(delivery, DELIVERY_KEYS) ||
    !IDENTIFIER.test(delivery.deliveryId) ||
    !HASH.test(delivery.deliveryHash) ||
    !IDENTIFIER.test(delivery.transferIntentId) ||
    !HASH.test(delivery.transferIntentHash) ||
    !IDENTIFIER.test(delivery.providerId) ||
    !IDENTIFIER.test(delivery.purposeCode) ||
    !IDENTIFIER.test(delivery.sourceAssetId) ||
    !/^[1-9][0-9]{0,77}$/.test(delivery.sourceAmountMinor) ||
    !IDENTIFIER.test(delivery.destinationAssetId) ||
    !["pending", "acknowledged", "callback_completed"].includes(delivery.status) ||
    !Number.isFinite(new Date(delivery.issuedAt).getTime()) ||
    !Number.isFinite(new Date(delivery.expiresAt).getTime()) ||
    delivery.sandboxOnly !== true ||
    delivery.productionFundsMoved !== false ||
    delivery.withdrawable !== false ||
    delivery.schemaVersion !== "provider_intent_view.v1"
  ) {
    invalid("invalid_provider_delivery_envelope", "Provider delivery view is invalid");
  }
  return delivery;
}

function unsignedEnvelope(delivery, keyId) {
  return {
    method: "POST",
    path: PROVIDER_SANDBOX_DELIVERY_PATH,
    delivery: assertProviderIntentView(delivery),
    keyId: typeof keyId === "string" && IDENTIFIER.test(keyId)
      ? keyId
      : invalid("invalid_provider_delivery_envelope", "Provider delivery key ID is invalid"),
    schemaVersion: PROVIDER_SANDBOX_DELIVERY_ENVELOPE_SCHEMA_VERSION
  };
}

export function createSignedProviderDeliveryEnvelope(delivery, { privateKey, keyId }) {
  if (!privateKey) invalid("provider_delivery_signer_unavailable", "Provider delivery signer is unavailable");
  const body = unsignedEnvelope(delivery, keyId);
  const payloadHash = hashId("provider_sandbox_delivery_payload", body);
  const signature = sign(null, Buffer.from(payloadHash, "utf8"), privateKey).toString("base64url");
  if (!SIGNATURE.test(signature)) {
    invalid("provider_delivery_signer_unavailable", "Provider delivery signer returned an invalid signature");
  }
  return Object.freeze({ ...body, payloadHash, signature });
}

export async function verifyProviderDeliveryEnvelope(envelope, { keyResolver }) {
  if (!exactKeys(envelope, [
    "method", "path", "delivery", "keyId", "schemaVersion", "payloadHash", "signature"
  ])) {
    invalid("invalid_provider_delivery_envelope", "Provider delivery envelope has an invalid shape");
  }
  if (
    envelope.method !== "POST" ||
    envelope.path !== PROVIDER_SANDBOX_DELIVERY_PATH ||
    envelope.schemaVersion !== PROVIDER_SANDBOX_DELIVERY_ENVELOPE_SCHEMA_VERSION ||
    !HASH.test(envelope.payloadHash) ||
    !SIGNATURE.test(envelope.signature)
  ) {
    invalid("invalid_provider_delivery_envelope", "Provider delivery envelope metadata is invalid");
  }
  const body = unsignedEnvelope(envelope.delivery, envelope.keyId);
  const expectedHash = hashId("provider_sandbox_delivery_payload", body);
  if (envelope.payloadHash !== expectedHash || typeof keyResolver !== "function") {
    invalid("provider_delivery_integrity_rejected", "Provider delivery integrity is invalid");
  }
  const publicKey = await keyResolver(envelope.keyId);
  if (!publicKey || !verify(
    null,
    Buffer.from(expectedHash, "utf8"),
    publicKey,
    Buffer.from(envelope.signature, "base64url")
  )) {
    invalid("provider_delivery_signature_rejected", "Provider delivery signature is invalid");
  }
  return Object.freeze({ ...envelope, delivery: Object.freeze({ ...envelope.delivery }) });
}

function assertDeliveryResult(value) {
  if (!exactKeys(value, ["acknowledgement", "callback", "replayed", "schemaVersion"])) {
    invalid("invalid_provider_sandbox_response", "Provider sandbox response has an invalid shape");
  }
  if (
    value.schemaVersion !== PROVIDER_SANDBOX_DELIVERY_RESULT_SCHEMA_VERSION ||
    typeof value.replayed !== "boolean" ||
    value.acknowledgement?.sandboxOnly !== true ||
    value.acknowledgement?.productionFundsMoved !== false ||
    value.acknowledgement?.withdrawable !== false ||
    value.callback?.sandboxOnly !== true ||
    value.callback?.productionFundsMoved !== false ||
    value.callback?.withdrawable !== false ||
    value.callback?.schemaVersion !== "provider_sandbox_callback.v1"
  ) {
    invalid("invalid_provider_sandbox_response", "Provider sandbox response violated its boundary");
  }
  return value;
}

export class FixedLoopbackProviderClient {
  #port;
  #privateKey;
  #keyId;
  #fetch;
  #timeoutMs;
  #maxAttempts;
  #failureThreshold;
  #cooldownMs;
  #clock;
  #consecutiveFailures = 0;
  #openUntil = 0;

  constructor({
    port,
    deliverySigningPrivateKey,
    deliveryKeyId,
    fetchImpl = globalThis.fetch,
    timeoutMs = 1_000,
    maxAttempts = 3,
    failureThreshold = 2,
    cooldownMs = 30_000,
    clock = () => Date.now()
  }) {
    if (
      !Number.isInteger(port) || port < 1024 || port > 65_535 ||
      !deliverySigningPrivateKey || !IDENTIFIER.test(deliveryKeyId ?? "") ||
      typeof fetchImpl !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 10_000 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3 ||
      !Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 10 ||
      !Number.isInteger(cooldownMs) || cooldownMs < 100 || cooldownMs > 300_000 ||
      typeof clock !== "function"
    ) {
      invalid("invalid_provider_sandbox_client", "Fixed Provider sandbox client configuration is invalid");
    }
    this.#port = port;
    this.#privateKey = deliverySigningPrivateKey;
    this.#keyId = deliveryKeyId;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#maxAttempts = maxAttempts;
    this.#failureThreshold = failureThreshold;
    this.#cooldownMs = cooldownMs;
    this.#clock = clock;
  }

  get circuitState() {
    return this.#openUntil > this.#clock() ? "open" : "closed";
  }

  async deliver(delivery) {
    if (this.#openUntil > this.#clock()) {
      invalid("provider_sandbox_circuit_open", "Provider sandbox circuit is open");
    }
    const envelope = createSignedProviderDeliveryEnvelope(delivery, {
      privateKey: this.#privateKey,
      keyId: this.#keyId
    });
    const body = JSON.stringify(envelope);
    if (Buffer.byteLength(body) > 32_768) {
      invalid("provider_sandbox_payload_too_large", "Provider sandbox delivery exceeds its fixed limit");
    }

    let lastCode = "provider_sandbox_transport_unavailable";
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetch(
          `http://127.0.0.1:${this.#port}${PROVIDER_SANDBOX_DELIVERY_PATH}`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
            body,
            redirect: "error",
            signal: controller.signal
          }
        );
        const announcedLength = Number(response.headers?.get?.("content-length") ?? 0);
        if (Number.isFinite(announcedLength) && announcedLength > 65_536) {
          invalid("provider_sandbox_response_too_large", "Provider sandbox response exceeds its fixed limit");
        }
        const text = await response.text();
        if (Buffer.byteLength(text) > 65_536) {
          invalid("provider_sandbox_response_too_large", "Provider sandbox response exceeds its fixed limit");
        }
        if (response.status === 409) {
          invalid("provider_sandbox_delivery_conflict", "Provider sandbox rejected a conflicting delivery replay");
        }
        if (!response.ok) {
          lastCode = "provider_sandbox_transport_unavailable";
          continue;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          invalid("invalid_provider_sandbox_response", "Provider sandbox returned invalid JSON");
        }
        this.#consecutiveFailures = 0;
        this.#openUntil = 0;
        return Object.freeze(assertDeliveryResult(parsed));
      } catch (error) {
        if (error?.code === "provider_sandbox_delivery_conflict" || error?.code === "invalid_provider_sandbox_response") {
          throw error;
        }
        lastCode = error?.name === "AbortError"
          ? "provider_sandbox_timeout"
          : "provider_sandbox_transport_unavailable";
      } finally {
        clearTimeout(timeout);
      }
    }

    this.#consecutiveFailures += 1;
    if (this.#consecutiveFailures >= this.#failureThreshold) {
      this.#openUntil = this.#clock() + this.#cooldownMs;
    }
    invalid(lastCode, "Provider sandbox delivery failed within its bounded attempt budget");
  }
}
