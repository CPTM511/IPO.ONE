import {
  generateKeyPairSync,
  sign as signMessage,
  verify as verifySignature
} from "node:crypto";
import {
  DomainError,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  hashId
} from "../../../packages/domain/src/index.js";

const REQUEST_KEYS = Object.freeze([
  "obligationId",
  "assetId",
  "amountMinor",
  "requestId",
  "correlationId",
  "issuedAt"
]);

function normalizeRequest(input) {
  if (
    !input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).length !== REQUEST_KEYS.length ||
    REQUEST_KEYS.some((key) => !Object.hasOwn(input, key))
  ) {
    throw new DomainError("sandbox_rail_unavailable", "sandbox rail request has an invalid shape");
  }
  for (const key of ["obligationId", "assetId", "requestId", "correlationId"]) {
    assertNonEmptyString(key, input[key]);
  }
  const issuedAt = new Date(input.issuedAt);
  if (!Number.isFinite(issuedAt.getTime())) {
    throw new DomainError("sandbox_rail_unavailable", "sandbox rail issuedAt is invalid");
  }
  const normalized = {
    obligationId: input.obligationId,
    assetId: input.assetId,
    amountMinor: assertPositiveMinorUnits(input.amountMinor).toString(),
    requestId: input.requestId,
    correlationId: input.correlationId,
    issuedAt: issuedAt.toISOString()
  };
  assertNoRawPiiReference(normalized, "sandboxRail.request");
  return Object.freeze(normalized);
}

function receiptMessage({ request, adapterId, adapterVersion, adapterKeyId }) {
  return Object.freeze({
    ...request,
    adapterId,
    adapterVersion,
    adapterKeyId,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    schemaVersion: "signed_sandbox_rail_receipt.v1"
  });
}

export class SignedSandboxRailAdapter {
  #privateKey;
  #publicKey;

  constructor({
    adapterId = "ipo_one_local_signed_sandbox_rail",
    adapterVersion = "1.0.0",
    privateKey,
    publicKey
  } = {}) {
    assertNonEmptyString("adapterId", adapterId);
    assertNonEmptyString("adapterVersion", adapterVersion);
    if (!privateKey || !publicKey) {
      const generated = generateKeyPairSync("ed25519");
      privateKey = generated.privateKey;
      publicKey = generated.publicKey;
    }
    const publicJwk = publicKey.export({ format: "jwk" });
    this.adapterId = adapterId;
    this.adapterVersion = adapterVersion;
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
    this.adapterKeyId = hashId("sandbox_rail_public_key", publicJwk);
  }

  async execute(input) {
    const request = normalizeRequest(input);
    const message = receiptMessage({
      request,
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      adapterKeyId: this.adapterKeyId
    });
    const messageHash = hashId("signed_sandbox_rail_message", message);
    const signature = signMessage(null, Buffer.from(messageHash, "utf8"), this.#privateKey)
      .toString("base64url");
    return Object.freeze({
      obligationId: request.obligationId,
      assetId: request.assetId,
      amountMinor: request.amountMinor,
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      adapterKeyId: this.adapterKeyId,
      messageHash,
      signature,
      issuedAt: request.issuedAt,
      requestId: request.requestId,
      correlationId: request.correlationId,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "signed_sandbox_rail_receipt.v1"
    });
  }

  verify(receipt, expected) {
    const request = normalizeRequest(expected);
    if (
      !receipt || receipt.schemaVersion !== "signed_sandbox_rail_receipt.v1" ||
      receipt.obligationId !== request.obligationId ||
      receipt.assetId !== request.assetId ||
      receipt.amountMinor !== request.amountMinor ||
      receipt.requestId !== request.requestId ||
      receipt.correlationId !== request.correlationId ||
      receipt.issuedAt !== request.issuedAt ||
      receipt.adapterId !== this.adapterId ||
      receipt.adapterVersion !== this.adapterVersion ||
      receipt.adapterKeyId !== this.adapterKeyId ||
      receipt.sandboxOnly !== true ||
      receipt.productionFundsMoved !== false ||
      receipt.withdrawable !== false
    ) {
      throw new DomainError("sandbox_rail_unavailable", "sandbox rail receipt binding is invalid");
    }
    const message = receiptMessage({
      request,
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      adapterKeyId: this.adapterKeyId
    });
    const expectedHash = hashId("signed_sandbox_rail_message", message);
    let signature;
    try {
      signature = Buffer.from(receipt.signature, "base64url");
    } catch {
      throw new DomainError("sandbox_rail_unavailable", "sandbox rail signature encoding is invalid");
    }
    if (
      receipt.messageHash !== expectedHash || signature.length !== 64 ||
      !verifySignature(null, Buffer.from(expectedHash, "utf8"), this.#publicKey, signature)
    ) {
      throw new DomainError("sandbox_rail_unavailable", "sandbox rail signature is invalid");
    }
    return true;
  }
}
