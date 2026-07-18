import { getAddress, hashTypedData, verifyTypedData } from "viem";
import {
  DomainError,
  assertCAIP10,
  hashId
} from "../../../packages/domain/src/index.js";
import { createChainProfile } from "./chain-profiles.js";

const EVM_ACCOUNT_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const EVM_SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;
const SECP256K1_ORDER = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;
const PROTOCOL_VERSION = "1.1";

export const AGENT_ACCOUNT_PROOF_PRIMARY_TYPE = "AgentAccountBindingProof";
export const AGENT_ACCOUNT_PROOF_TYPES = Object.freeze({
  [AGENT_ACCOUNT_PROOF_PRIMARY_TYPE]: Object.freeze([
    Object.freeze({ name: "tenantHash", type: "bytes32" }),
    Object.freeze({ name: "subjectHash", type: "bytes32" }),
    Object.freeze({ name: "accountHash", type: "bytes32" }),
    Object.freeze({ name: "purpose", type: "string" }),
    Object.freeze({ name: "nonce", type: "bytes32" }),
    Object.freeze({ name: "issuedAt", type: "uint256" }),
    Object.freeze({ name: "expiresAt", type: "uint256" }),
    Object.freeze({ name: "protocolVersion", type: "string" })
  ])
});

function parseChainReference(chainId) {
  const [namespace, reference] = chainId.split(":");
  if (namespace !== "eip155" || !/^(0|[1-9][0-9]*)$/.test(reference)) {
    throw new DomainError("unsupported_account_proof_chain", "account proof requires an EIP-155 chain profile");
  }
  const numeric = BigInt(reference);
  if (numeric < 1n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError("unsupported_account_proof_chain", "EIP-155 chain reference is outside the supported range");
  }
  return Number(numeric);
}

function unixSeconds(name, value) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds % 1000 !== 0) {
    throw new DomainError("invalid_account_proof_challenge", `${name} must be a whole-second timestamp`);
  }
  return BigInt(milliseconds / 1000);
}

function assertBytes32(name, value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new DomainError("invalid_account_proof_challenge", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function assertLowS(signature) {
  if (typeof signature !== "string" || !EVM_SIGNATURE_PATTERN.test(signature)) {
    throw new DomainError("invalid_account_proof", "signature must be a canonical 65-byte EVM signature");
  }
  const r = BigInt(`0x${signature.slice(2, 66)}`);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const recovery = Number.parseInt(signature.slice(130, 132), 16);
  if (
    r < 1n || r >= SECP256K1_ORDER ||
    s < 1n || s > SECP256K1_HALF_ORDER ||
    ![0, 1, 27, 28].includes(recovery)
  ) {
    throw new DomainError("invalid_account_proof", "signature is malformed or uses a non-canonical high-s value");
  }
}

export function normalizeEvmCaip10(accountId, expectedChainId) {
  assertCAIP10(accountId);
  const parts = accountId.split(":");
  const chainId = parts.slice(0, 2).join(":");
  const address = parts.slice(2).join(":");
  if (chainId !== expectedChainId) {
    throw new DomainError("account_proof_chain_mismatch", "CAIP-10 account does not match the selected chain profile");
  }
  if (!EVM_ACCOUNT_PATTERN.test(address)) {
    throw new DomainError("invalid_evm_account", "EIP-155 CAIP-10 account must contain a 20-byte EVM address");
  }
  let checksumAddress;
  try {
    checksumAddress = getAddress(address);
  } catch {
    throw new DomainError("invalid_evm_account", "EVM account checksum is invalid");
  }
  return Object.freeze({
    accountId: `${chainId}:${checksumAddress.toLowerCase()}`,
    address: checksumAddress,
    chainId,
    accountHash: hashId("account", { accountId: `${chainId}:${checksumAddress.toLowerCase()}` })
  });
}

export function createAgentAccountBindingTypedData({
  chainId,
  tenantHash,
  subjectHash,
  accountHash,
  purpose,
  nonce,
  issuedAt,
  expiresAt,
  protocolVersion = PROTOCOL_VERSION
}) {
  const issuedAtSeconds = unixSeconds("issuedAt", issuedAt);
  const expiresAtSeconds = unixSeconds("expiresAt", expiresAt);
  if (expiresAtSeconds <= issuedAtSeconds) {
    throw new DomainError("invalid_account_proof_challenge", "challenge expiry must follow issuance");
  }
  if (typeof purpose !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(purpose)) {
    throw new DomainError("invalid_account_proof_challenge", "account purpose is invalid");
  }
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new DomainError("invalid_account_proof_challenge", "account proof protocol version is not supported");
  }
  const typedData = {
    domain: {
      name: "IPO.ONE Agent Account Binding",
      version: protocolVersion,
      chainId: parseChainReference(chainId)
    },
    types: AGENT_ACCOUNT_PROOF_TYPES,
    primaryType: AGENT_ACCOUNT_PROOF_PRIMARY_TYPE,
    message: {
      tenantHash: assertBytes32("tenantHash", tenantHash),
      subjectHash: assertBytes32("subjectHash", subjectHash),
      accountHash: assertBytes32("accountHash", accountHash),
      purpose,
      nonce: assertBytes32("nonce", nonce),
      issuedAt: issuedAtSeconds,
      expiresAt: expiresAtSeconds,
      protocolVersion
    }
  };
  return Object.freeze({
    typedData,
    typedDataHash: hashTypedData(typedData),
    schemaVersion: "agent_account_proof_typed_data.v1"
  });
}

export class EvmAccountProofAdapter {
  constructor({ profile }) {
    const { profileHash, schemaVersion, ...profileInput } = profile ?? {};
    this.profile = createChainProfile(profileInput);
    if (profileHash !== undefined && profileHash !== this.profile.profileHash) {
      throw new DomainError("chain_profile_hash_mismatch", "account proof profile hash does not match its contents");
    }
    if (schemaVersion !== undefined && schemaVersion !== this.profile.schemaVersion) {
      throw new DomainError("invalid_chain_profile", "account proof profile schema version is not supported");
    }
    Object.freeze(this);
  }

  descriptor() {
    return Object.freeze({
      profileId: this.profile.profileId,
      chainId: this.profile.chainId,
      adapterVersion: "1.0.0",
      proofStandard: "EIP-712",
      sandboxOnly: true,
      productionApproved: false,
      schemaVersion: "account_proof_adapter.v1"
    });
  }

  createTypedData(input) {
    if (input.chainId !== this.profile.chainId) {
      throw new DomainError("account_proof_chain_mismatch", "challenge chain does not match the proof adapter");
    }
    return createAgentAccountBindingTypedData(input);
  }

  async verify({ accountId, signature, challenge, now = new Date() }) {
    const normalized = normalizeEvmCaip10(accountId, this.profile.chainId);
    if (normalized.accountHash !== challenge.accountHash) {
      throw new DomainError("account_proof_account_mismatch", "proof account does not match the challenge");
    }
    if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
      throw new DomainError("account_proof_challenge_expired", "account proof challenge has expired");
    }
    assertLowS(signature);
    const prepared = this.createTypedData(challenge);
    if (prepared.typedDataHash !== challenge.typedDataHash) {
      throw new DomainError("account_proof_challenge_mismatch", "typed-data challenge hash does not match durable state");
    }
    let valid = false;
    try {
      valid = await verifyTypedData({
        address: normalized.address,
        ...prepared.typedData,
        signature
      });
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new DomainError("account_proof_verification_failed", "EIP-712 account ownership proof is invalid");
    }
    return Object.freeze({
      accountId: normalized.accountId,
      accountHash: normalized.accountHash,
      chainId: normalized.chainId,
      proofHash: hashId("agent_account_proof", {
        typedDataHash: prepared.typedDataHash,
        signatureHash: hashId("signature", signature)
      }),
      verificationMethod: "eip712_eoa_v1",
      schemaVersion: "agent_account_proof_result.v1"
    });
  }
}
