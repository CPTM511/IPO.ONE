import {
  hashTypedData,
  isAddress,
  keccak256,
  recoverTypedDataAddress,
  toHex
} from "viem";
import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HypercoreSigningScheme,
  verifyHypercorePreparedAction
} from "./hypercore-action.js";

export const HYPERCORE_OFFICIAL_SIGNING_REQUEST_SCHEMA_VERSION =
  "hypercore_official_signing_request.v1";
export const HYPERCORE_TRANSIENT_SIGNATURE_SCHEMA_VERSION =
  "hypercore_transient_signature.v1";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const HASH = /^0x[0-9a-f]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const APPROVED_L1_ACTION_TYPES = new Set([
  "order",
  "cancel",
  "cancelByCloid",
  "batchModify"
]);
const MAX_MESSAGEPACK_BYTES = 64 * 1024;
const MAX_STRING_BYTES = 16 * 1024;
const MAX_CONTAINER_ITEMS = 64;
const MAX_DEPTH = 20;

const L1_DOMAIN = Object.freeze({
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: ZERO_ADDRESS
});
const L1_TYPES = Object.freeze({
  Agent: Object.freeze([
    Object.freeze({ name: "source", type: "string" }),
    Object.freeze({ name: "connectionId", type: "bytes32" })
  ])
});
const APPROVE_AGENT_DOMAIN = Object.freeze({
  name: "HyperliquidSignTransaction",
  version: "1",
  chainId: 421614,
  verifyingContract: ZERO_ADDRESS
});
const EIP712_DOMAIN_TYPES = Object.freeze([
  Object.freeze({ name: "name", type: "string" }),
  Object.freeze({ name: "version", type: "string" }),
  Object.freeze({ name: "chainId", type: "uint256" }),
  Object.freeze({ name: "verifyingContract", type: "address" })
]);
const APPROVE_AGENT_TYPES = Object.freeze({
  "HyperliquidTransaction:ApproveAgent": Object.freeze([
    Object.freeze({ name: "hyperliquidChain", type: "string" }),
    Object.freeze({ name: "agentAddress", type: "address" }),
    Object.freeze({ name: "agentName", type: "string" }),
    Object.freeze({ name: "nonce", type: "uint64" })
  ]),
  EIP712Domain: EIP712_DOMAIN_TYPES
});

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactShape(name, value, required, optional = []) {
  if (!plainObject(value)) {
    fail("invalid_hypercore_official_signing_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    fail(
      "invalid_hypercore_official_signing_input",
      `${name} has an invalid closed shape`
    );
  }
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(
      "invalid_hypercore_official_signing_input",
      `${name} must be lowercase bytes32`
    );
  }
  return value;
}

function safeUint64(name, value, { allowZero = false } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1)
  ) {
    fail(
      "invalid_hypercore_official_signing_input",
      `${name} must be a safe uint64`
    );
  }
  return value;
}

function address(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value !== value.toLowerCase() ||
    !isAddress(value, { strict: true }) ||
    value === ZERO_ADDRESS
  ) {
    fail(
      "invalid_hypercore_official_signing_input",
      `${name} must be a non-zero lowercase EVM address`
    );
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_official_signing_input", `${name} is invalid`);
  }
  return value;
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

function join(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  if (size > MAX_MESSAGEPACK_BYTES) {
    fail(
      "hypercore_signing_payload_too_large",
      "official signing payload exceeds the fixed byte bound"
    );
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function prefixWithLength(prefix, value, width) {
  const output = new Uint8Array(1 + width);
  output[0] = prefix;
  const view = new DataView(output.buffer);
  if (width === 1) view.setUint8(1, value);
  else if (width === 2) view.setUint16(1, value, false);
  else view.setUint32(1, value, false);
  return output;
}

function unsignedInteger(value) {
  safeUint64("MessagePack integer", value, { allowZero: true });
  if (value <= 0x7f) return Uint8Array.of(value);
  if (value <= 0xff) return Uint8Array.of(0xcc, value);
  if (value <= 0xffff) return prefixWithLength(0xcd, value, 2);
  if (value <= 0xffffffff) return prefixWithLength(0xce, value, 4);
  const output = new Uint8Array(9);
  output[0] = 0xcf;
  new DataView(output.buffer).setBigUint64(1, BigInt(value), false);
  return output;
}

function encodeString(value) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > MAX_STRING_BYTES) {
    fail("hypercore_signing_payload_too_large", "MessagePack string is too large");
  }
  let prefix;
  if (bytes.length <= 31) prefix = Uint8Array.of(0xa0 | bytes.length);
  else if (bytes.length <= 0xff) prefix = prefixWithLength(0xd9, bytes.length, 1);
  else prefix = prefixWithLength(0xda, bytes.length, 2);
  return join([prefix, bytes]);
}

function encodeMessagePack(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    fail("hypercore_signing_payload_too_deep", "MessagePack payload is too deep");
  }
  if (value === null) return Uint8Array.of(0xc0);
  if (value === false) return Uint8Array.of(0xc2);
  if (value === true) return Uint8Array.of(0xc3);
  if (typeof value === "number") return unsignedInteger(value);
  if (typeof value === "string") return encodeString(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_CONTAINER_ITEMS) {
      fail("hypercore_signing_payload_too_large", "MessagePack array is too large");
    }
    const prefix = value.length <= 15
      ? Uint8Array.of(0x90 | value.length)
      : prefixWithLength(0xdc, value.length, 2);
    return join([
      prefix,
      ...value.map((item) => encodeMessagePack(item, depth + 1))
    ]);
  }
  if (plainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_CONTAINER_ITEMS) {
      fail("hypercore_signing_payload_too_large", "MessagePack map is too large");
    }
    const prefix = entries.length <= 15
      ? Uint8Array.of(0x80 | entries.length)
      : prefixWithLength(0xde, entries.length, 2);
    return join([
      prefix,
      ...entries.flatMap(([key, item]) => [
        encodeString(key),
        encodeMessagePack(item, depth + 1)
      ])
    ]);
  }
  fail(
    "invalid_hypercore_official_signing_input",
    "MessagePack input contains an unsupported value"
  );
}

function uint64Bytes(value) {
  safeUint64("uint64", value, { allowZero: true });
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, BigInt(value), false);
  return output;
}

function addressBytes(value) {
  return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
}

// Kept as a direct-file export for official SDK conformance tests. Runtime
// callers use createHypercoreL1SigningRequest, which first validates a closed
// IPO.ONE prepared action.
export function computeOfficialHyperliquidActionHash({
  action,
  vaultAddress = null,
  nonce,
  expiresAfter = null
}) {
  if (!plainObject(action)) {
    fail("invalid_hypercore_official_signing_input", "action must be an object");
  }
  const trustedVault = address("vaultAddress", vaultAddress, { nullable: true });
  safeUint64("nonce", nonce, { allowZero: true });
  if (expiresAfter !== null) safeUint64("expiresAfter", expiresAfter);
  const encoded = encodeMessagePack(action);
  const parts = [
    encoded,
    uint64Bytes(nonce),
    trustedVault === null
      ? Uint8Array.of(0)
      : join([Uint8Array.of(1), addressBytes(trustedVault)])
  ];
  if (expiresAfter !== null) {
    parts.push(Uint8Array.of(0), uint64Bytes(expiresAfter));
  }
  return keccak256(toHex(join(parts)));
}

function createSigningRequest({
  scheme,
  purpose,
  actionHash,
  preparedActionHash,
  action,
  typedData,
  signerReferenceHash,
  canonicalAccountAddressHash,
  nonce,
  expiresAfter,
  vaultAddress
}) {
  const digestHash = hashTypedData(typedData);
  const core = {
    scheme,
    purpose,
    actionHash,
    preparedActionHash,
    digestHash,
    action,
    typedData,
    signerReferenceHash,
    canonicalAccountAddressHash,
    nonce,
    expiresAfter,
    vaultAddressPresent: vaultAddress !== null,
    vaultAddressHash: vaultAddress === null
      ? null
      : hashId("hypercore_account_address", vaultAddress),
    environment: "hyperliquid_testnet",
    referenceImplementation:
      "hyperliquid-dex/hyperliquid-python-sdk:hyperliquid/utils/signing.py",
    officialDigestComputed: true,
    rawKeyAccepted: false,
    rawKeyPersisted: false,
    rawSignaturePersisted: false,
    reusableSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    secretsIncluded: false,
    schemaVersion: HYPERCORE_OFFICIAL_SIGNING_REQUEST_SCHEMA_VERSION
  };
  return cloneFreeze({
    signingRequestHash: hashId("hypercore_official_signing_request", core),
    ...core
  });
}

export function createHypercoreL1SigningRequest({
  preparedAction,
  signerReferenceHash,
  canonicalAccountAddressHash,
  vaultAddress = null,
  nonce,
  expiresAfter
}) {
  verifyHypercorePreparedAction(preparedAction);
  bytes32("signerReferenceHash", signerReferenceHash);
  bytes32("canonicalAccountAddressHash", canonicalAccountAddressHash);
  address("vaultAddress", vaultAddress, { nullable: true });
  safeUint64("nonce", nonce);
  safeUint64("expiresAfter", expiresAfter);
  if (
    preparedAction.signingScheme !== HypercoreSigningScheme.L1_ACTION ||
    !APPROVED_L1_ACTION_TYPES.has(preparedAction.hyperliquidAction.type)
  ) {
    fail(
      "hypercore_signing_action_denied",
      "only closed order/cancel/modify L1 actions are signable"
    );
  }
  const actionHash = computeOfficialHyperliquidActionHash({
    action: preparedAction.hyperliquidAction,
    vaultAddress,
    nonce,
    expiresAfter
  });
  const typedData = {
    domain: L1_DOMAIN,
    types: L1_TYPES,
    primaryType: "Agent",
    message: {
      source: "b",
      connectionId: actionHash
    }
  };
  return createSigningRequest({
    scheme: HypercoreSigningScheme.L1_ACTION,
    purpose: "hypercore_testnet_execution",
    actionHash,
    preparedActionHash: preparedAction.preparedActionHash,
    action: preparedAction.hyperliquidAction,
    typedData,
    signerReferenceHash,
    canonicalAccountAddressHash,
    nonce,
    expiresAfter,
    vaultAddress
  });
}

export function createHypercoreApproveAgentSigningRequest({
  agentAddress,
  agentName,
  nonce,
  signerReferenceHash,
  canonicalAccountAddressHash
}) {
  const trustedAgentAddress = address("agentAddress", agentAddress);
  if (
    typeof agentName !== "string" ||
    agentName.length < 8 ||
    agentName.length > 48 ||
    !/^[a-z0-9][a-z0-9_-]+$/.test(agentName)
  ) {
    fail(
      "invalid_hypercore_official_signing_input",
      "agentName must be a bounded stable Testnet name"
    );
  }
  safeUint64("nonce", nonce);
  bytes32("signerReferenceHash", signerReferenceHash);
  bytes32("canonicalAccountAddressHash", canonicalAccountAddressHash);
  const action = {
    type: "approveAgent",
    agentAddress: trustedAgentAddress,
    agentName,
    nonce,
    signatureChainId: "0x66eee",
    hyperliquidChain: "Testnet"
  };
  const typedData = {
    domain: APPROVE_AGENT_DOMAIN,
    types: APPROVE_AGENT_TYPES,
    primaryType: "HyperliquidTransaction:ApproveAgent",
    message: {
      hyperliquidChain: action.hyperliquidChain,
      agentAddress: action.agentAddress,
      agentName: action.agentName,
      nonce: action.nonce
    }
  };
  return createSigningRequest({
    scheme: HypercoreSigningScheme.USER_SIGNED_ACTION,
    purpose: "hypercore_testnet_delegate_provisioning",
    actionHash: hashId("hypercore_approve_agent_action", action),
    preparedActionHash: null,
    action,
    typedData,
    signerReferenceHash,
    canonicalAccountAddressHash,
    nonce,
    expiresAfter: null,
    vaultAddress: null
  });
}

export function verifyHypercoreOfficialSigningRequest(value) {
  exactShape("official signing request", value, [
    "signingRequestHash",
    "scheme",
    "purpose",
    "actionHash",
    "preparedActionHash",
    "digestHash",
    "action",
    "typedData",
    "signerReferenceHash",
    "canonicalAccountAddressHash",
    "nonce",
    "expiresAfter",
    "vaultAddressPresent",
    "vaultAddressHash",
    "environment",
    "referenceImplementation",
    "officialDigestComputed",
    "rawKeyAccepted",
    "rawKeyPersisted",
    "rawSignaturePersisted",
    "reusableSignaturePersisted",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "secretsIncluded",
    "schemaVersion"
  ]);
  for (const key of [
    "signingRequestHash",
    "actionHash",
    "digestHash",
    "signerReferenceHash",
    "canonicalAccountAddressHash"
  ]) bytes32(key, value[key]);
  if (value.preparedActionHash !== null) {
    bytes32("preparedActionHash", value.preparedActionHash);
  }
  if (value.vaultAddressHash !== null) {
    bytes32("vaultAddressHash", value.vaultAddressHash);
  }
  identifier("purpose", value.purpose);
  safeUint64("nonce", value.nonce);
  if (value.expiresAfter !== null) safeUint64("expiresAfter", value.expiresAfter);
  if (
    !Object.values(HypercoreSigningScheme).includes(value.scheme) ||
    value.environment !== "hyperliquid_testnet" ||
    value.officialDigestComputed !== true ||
    value.rawKeyAccepted !== false ||
    value.rawKeyPersisted !== false ||
    value.rawSignaturePersisted !== false ||
    value.reusableSignaturePersisted !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.secretsIncluded !== false ||
    value.schemaVersion !== HYPERCORE_OFFICIAL_SIGNING_REQUEST_SCHEMA_VERSION ||
    hashTypedData(value.typedData) !== value.digestHash
  ) {
    fail("invalid_hypercore_official_signing_request", "signing request drifted");
  }
  const { signingRequestHash: _ignored, ...core } = value;
  if (hashId("hypercore_official_signing_request", core) !== value.signingRequestHash) {
    fail("invalid_hypercore_official_signing_request", "request hash drifted");
  }
  return true;
}

function signatureComponents(signature) {
  if (typeof signature !== "string" || !SIGNATURE.test(signature)) {
    fail("invalid_hypercore_transient_signature", "signature must be 65 bytes");
  }
  const recovery = Number.parseInt(signature.slice(130, 132), 16);
  const v = recovery >= 27 ? recovery : recovery + 27;
  if (![27, 28].includes(v)) {
    fail("invalid_hypercore_transient_signature", "signature recovery bit is invalid");
  }
  return {
    r: signature.slice(0, 66).toLowerCase(),
    s: `0x${signature.slice(66, 130)}`.toLowerCase(),
    v
  };
}

export class IsolatedHypercoreTypedDataSigner {
  #signTypedData;
  #expectedSignerAddress;

  constructor({ signerId, expectedSignerAddress, signTypedData, ...unknown } = {}) {
    if (Object.keys(unknown).length !== 0) {
      fail("invalid_hypercore_signer_configuration", "signer configuration is open");
    }
    identifier("signerId", signerId);
    this.#expectedSignerAddress = address(
      "expectedSignerAddress",
      expectedSignerAddress
    );
    if (typeof signTypedData !== "function") {
      fail("invalid_hypercore_signer_configuration", "signTypedData port is required");
    }
    this.#signTypedData = signTypedData;
    this.profile = cloneFreeze({
      signerId,
      mode: "isolated_typed_data",
      environment: "hyperliquid_testnet",
      privateKeyAccepted: false,
      rawKeyAccessible: false,
      keyExportable: false,
      signatureReusable: false,
      mainnetAuthority: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "hypercore_isolated_signer_profile.v1"
    });
  }

  async sign(request) {
    verifyHypercoreOfficialSigningRequest(request);
    const signature = await this.#signTypedData(cloneFreeze(request.typedData));
    const recovered = (
      await recoverTypedDataAddress({
        ...request.typedData,
        signature
      })
    ).toLowerCase();
    if (recovered !== this.#expectedSignerAddress) {
      fail(
        "hypercore_signer_identity_mismatch",
        "isolated signer does not match the approved signer identity"
      );
    }
    const components = signatureComponents(signature);
    return cloneFreeze({
      signingRequestHash: request.signingRequestHash,
      digestHash: request.digestHash,
      signature: components,
      signatureHash: hashId("hypercore_transient_signature", {
        signingRequestHash: request.signingRequestHash,
        digestHash: request.digestHash,
        recoveredSignerAddressHash: hashId(
          "hypercore_signer_address",
          recovered
        ),
        signature: components
      }),
      recoveredSignerAddressHash: hashId(
        "hypercore_signer_address",
        recovered
      ),
      rawKeyAccepted: false,
      rawKeyPersisted: false,
      rawSignaturePersisted: false,
      reusable: false,
      mainnetAuthority: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: HYPERCORE_TRANSIENT_SIGNATURE_SCHEMA_VERSION
    });
  }
}
