import {
  getAddress,
  hashTypedData,
  verifyTypedData
} from "viem";
import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";

export const HYPERLIQUID_TESTNET_CHAIN_ID = "eip155:998";
export const HYPERLIQUID_TESTNET_ENVIRONMENT = "hyperliquid_testnet";
export const HYPERLIQUID_BINDING_PROOF_PRIMARY_TYPE =
  "HyperliquidAccountBindingProof";
export const HYPERLIQUID_BINDING_PROOF_TYPES = Object.freeze({
  [HYPERLIQUID_BINDING_PROOF_PRIMARY_TYPE]: Object.freeze([
    Object.freeze({ name: "tenantHash", type: "bytes32" }),
    Object.freeze({ name: "subjectHash", type: "bytes32" }),
    Object.freeze({ name: "principalHash", type: "bytes32" }),
    Object.freeze({ name: "masterAddressHash", type: "bytes32" }),
    Object.freeze({ name: "subaccountAddressHash", type: "bytes32" }),
    Object.freeze({ name: "nonceHash", type: "bytes32" }),
    Object.freeze({ name: "challengeId", type: "string" }),
    Object.freeze({ name: "environment", type: "string" }),
    Object.freeze({ name: "infoProfileId", type: "string" }),
    Object.freeze({ name: "bindingEpoch", type: "uint256" }),
    Object.freeze({ name: "issuedAt", type: "uint256" }),
    Object.freeze({ name: "expiresAt", type: "uint256" })
  ])
});

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;

function fail(code, message) {
  throw new DomainError(code, message);
}

function exactObject(name, value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    fail("invalid_hyperliquid_binding_proof", `${name} has an invalid shape`);
  }
  return value;
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hyperliquid_binding_proof", `${name} must be bytes32`);
  }
  return value;
}

function safeId(name, value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("invalid_hyperliquid_binding_proof", `${name} is invalid`);
  }
  return value;
}

function timestampSeconds(name, value) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isSafeInteger(milliseconds) || milliseconds % 1_000 !== 0) {
    fail(
      "invalid_hyperliquid_binding_proof",
      `${name} must be a whole-second timestamp`
    );
  }
  return String(milliseconds / 1_000);
}

function bindingEpoch(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    fail("invalid_hyperliquid_binding_proof", "bindingEpoch is invalid");
  }
  return String(value);
}

function lowSSignature(value) {
  if (typeof value !== "string" || !SIGNATURE.test(value)) {
    fail(
      "invalid_hyperliquid_binding_proof",
      "signature must be one canonical 65-byte EVM signature"
    );
  }
  const r = BigInt(`0x${value.slice(2, 66)}`);
  const s = BigInt(`0x${value.slice(66, 130)}`);
  const recovery = Number.parseInt(value.slice(130, 132), 16);
  if (
    r < 1n ||
    r >= SECP256K1_ORDER ||
    s < 1n ||
    s > SECP256K1_HALF_ORDER ||
    ![0, 1, 27, 28].includes(recovery)
  ) {
    fail(
      "invalid_hyperliquid_binding_proof",
      "signature is malformed or non-canonical"
    );
  }
  return value;
}

export function normalizeHyperliquidAddress(value) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail(
      "invalid_hyperliquid_binding_proof",
      "Hyperliquid account address is invalid"
    );
  }
  let checksumAddress;
  try {
    checksumAddress = getAddress(value);
  } catch {
    fail(
      "invalid_hyperliquid_binding_proof",
      "Hyperliquid account checksum is invalid"
    );
  }
  const address = checksumAddress.toLowerCase();
  return Object.freeze({
    address,
    addressHash: hashId("hyperliquid_account_address", address)
  });
}

export function createHyperliquidBindingTypedData(input) {
  exactObject("binding challenge", input, [
    "bindingEpoch",
    "challengeId",
    "environment",
    "expiresAt",
    "infoProfileId",
    "issuedAt",
    "masterAddressHash",
    "nonceHash",
    "principalHash",
    "subaccountAddressHash",
    "subjectHash",
    "tenantHash"
  ]);
  if (
    input.environment !== HYPERLIQUID_TESTNET_ENVIRONMENT ||
    input.infoProfileId !== "hyperliquid_testnet_info.v1"
  ) {
    fail(
      "invalid_hyperliquid_binding_proof",
      "binding environment or Info profile is not approved"
    );
  }
  const issuedAt = timestampSeconds("issuedAt", input.issuedAt);
  const expiresAt = timestampSeconds("expiresAt", input.expiresAt);
  if (BigInt(expiresAt) <= BigInt(issuedAt)) {
    fail(
      "invalid_hyperliquid_binding_proof",
      "binding challenge expiry must follow issuance"
    );
  }
  const typedData = {
    domain: {
      name: "IPO.ONE Hyperliquid Account Binding",
      version: "1",
      chainId: 998
    },
    types: HYPERLIQUID_BINDING_PROOF_TYPES,
    primaryType: HYPERLIQUID_BINDING_PROOF_PRIMARY_TYPE,
    message: {
      tenantHash: bytes32("tenantHash", input.tenantHash),
      subjectHash: bytes32("subjectHash", input.subjectHash),
      principalHash: bytes32("principalHash", input.principalHash),
      masterAddressHash: bytes32(
        "masterAddressHash",
        input.masterAddressHash
      ),
      subaccountAddressHash: bytes32(
        "subaccountAddressHash",
        input.subaccountAddressHash
      ),
      nonceHash: bytes32("nonceHash", input.nonceHash),
      challengeId: safeId("challengeId", input.challengeId),
      environment: input.environment,
      infoProfileId: input.infoProfileId,
      bindingEpoch: bindingEpoch(input.bindingEpoch),
      issuedAt,
      expiresAt
    }
  };
  return Object.freeze({
    typedData,
    typedDataHash: hashTypedData(typedData),
    chainId: HYPERLIQUID_TESTNET_CHAIN_ID,
    environment: HYPERLIQUID_TESTNET_ENVIRONMENT,
    reusableSignature: false,
    schemaVersion: "hyperliquid_binding_typed_data.v1"
  });
}

export class HyperliquidBindingProofVerifier {
  createTypedData(input) {
    return createHyperliquidBindingTypedData(input);
  }

  async verify({
    masterAccountAddress,
    signature,
    challenge,
    now = new Date()
  }) {
    const normalized = normalizeHyperliquidAddress(masterAccountAddress);
    if (
      normalized.addressHash !== challenge.masterAddressHash ||
      challenge.status !== "pending" ||
      challenge.oneUse !== true ||
      challenge.bindingMethod !== "eip712_eoa_master_v1" ||
      challenge.environment !== HYPERLIQUID_TESTNET_ENVIRONMENT ||
      challenge.chainId !== HYPERLIQUID_TESTNET_CHAIN_ID ||
      new Date(challenge.expiresAt).getTime() <= now.getTime()
    ) {
      fail(
        "hyperliquid_binding_proof_denied",
        "Hyperliquid binding challenge is not current for this master account"
      );
    }
    const prepared = createHyperliquidBindingTypedData({
      bindingEpoch: challenge.bindingEpoch,
      challengeId: challenge.challengeId,
      environment: challenge.environment,
      expiresAt: challenge.expiresAt,
      infoProfileId: challenge.infoProfileId,
      issuedAt: challenge.issuedAt,
      masterAddressHash: challenge.masterAddressHash,
      nonceHash: challenge.nonceHash,
      principalHash: challenge.principalHash,
      subaccountAddressHash: challenge.subaccountAddressHash,
      subjectHash: challenge.subjectHash,
      tenantHash: challenge.tenantHash
    });
    if (prepared.typedDataHash !== challenge.typedDataHash) {
      fail(
        "hyperliquid_binding_proof_denied",
        "Hyperliquid binding typed-data hash does not match durable state"
      );
    }
    const checkedSignature = lowSSignature(signature);
    let valid = false;
    try {
      valid = await verifyTypedData({
        address: normalized.address,
        ...prepared.typedData,
        signature: checkedSignature
      });
    } catch {
      valid = false;
    }
    if (!valid) {
      fail(
        "hyperliquid_binding_proof_denied",
        "Hyperliquid master account ownership proof is invalid"
      );
    }
    return Object.freeze({
      masterAddressHash: normalized.addressHash,
      typedDataHash: prepared.typedDataHash,
      proofHash: hashId("hyperliquid_binding_proof", {
        typedDataHash: prepared.typedDataHash,
        signatureHash: hashId("signature", checkedSignature)
      }),
      verificationMethod: "eip712_eoa_master_v1",
      rawSignaturePersisted: false,
      reusableSignature: false,
      chainId: HYPERLIQUID_TESTNET_CHAIN_ID,
      environment: HYPERLIQUID_TESTNET_ENVIRONMENT,
      schemaVersion: "hyperliquid_binding_proof_result.v1"
    });
  }
}
