import { hashTypedData, verifyTypedData } from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { createChainProfile } from "./chain-profiles.js";
import { normalizeEvmCaip10 } from "./evm-account-proof-adapter.js";

const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const SECP256K1_ORDER = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
const HALF_ORDER = SECP256K1_ORDER / 2n;
const PROTOCOL_VERSION = "1.2";

export const EXECUTION_ACCOUNT_BINDING_PRIMARY_TYPE = "ExecutionAccountBindingProof";
export const EXECUTION_ACCOUNT_BINDING_TYPES = Object.freeze({
  [EXECUTION_ACCOUNT_BINDING_PRIMARY_TYPE]: Object.freeze([
    Object.freeze({ name: "tenantHash", type: "bytes32" }),
    Object.freeze({ name: "subjectHash", type: "bytes32" }),
    Object.freeze({ name: "controllerActorHash", type: "bytes32" }),
    Object.freeze({ name: "actorType", type: "string" }),
    Object.freeze({ name: "accountHash", type: "bytes32" }),
    Object.freeze({ name: "purpose", type: "string" }),
    Object.freeze({ name: "nonce", type: "bytes32" }),
    Object.freeze({ name: "issuedAt", type: "uint256" }),
    Object.freeze({ name: "expiresAt", type: "uint256" }),
    Object.freeze({ name: "protocolVersion", type: "string" })
  ])
});

function fail(code, message) {
  throw new DomainError(code, message);
}

function chainReference(chainId) {
  const [namespace, reference] = String(chainId).split(":");
  if (namespace !== "eip155" || !/^(0|[1-9][0-9]*)$/.test(reference ?? "")) {
    fail("unsupported_account_proof_chain", "execution AccountBinding requires an EIP-155 chain profile");
  }
  const value = BigInt(reference);
  if (value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("unsupported_account_proof_chain", "execution AccountBinding chain reference is unsupported");
  }
  return Number(value);
}

function wholeSeconds(name, value) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds % 1000 !== 0) {
    fail("invalid_account_proof_challenge", `${name} must be a whole-second timestamp`);
  }
  return String(milliseconds / 1000);
}

function bytes32(name, value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    fail("invalid_account_proof_challenge", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function assertLowS(signature) {
  if (typeof signature !== "string" || !SIGNATURE.test(signature)) {
    fail("invalid_account_proof", "signature must be a canonical 65-byte EVM signature");
  }
  const r = BigInt(`0x${signature.slice(2, 66)}`);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const recovery = Number.parseInt(signature.slice(130, 132), 16);
  if (
    r < 1n || r >= SECP256K1_ORDER ||
    s < 1n || s > HALF_ORDER ||
    ![0, 1, 27, 28].includes(recovery)
  ) fail("invalid_account_proof", "signature is malformed or non-canonical");
}

export function createExecutionAccountBindingTypedData({
  chainId,
  tenantHash,
  subjectHash,
  controllerActorHash,
  actorType,
  accountHash,
  purpose,
  nonce,
  issuedAt,
  expiresAt,
  protocolVersion = PROTOCOL_VERSION
}) {
  const issuedAtSeconds = wholeSeconds("issuedAt", issuedAt);
  const expiresAtSeconds = wholeSeconds("expiresAt", expiresAt);
  if (
    BigInt(expiresAtSeconds) <= BigInt(issuedAtSeconds) ||
    !new Set(["human", "agent"]).has(actorType) ||
    purpose !== "execution" ||
    protocolVersion !== PROTOCOL_VERSION
  ) fail("invalid_account_proof_challenge", "execution AccountBinding challenge context is invalid");
  const typedData = {
    domain: {
      name: "IPO.ONE Execution Account Binding",
      version: protocolVersion,
      chainId: chainReference(chainId)
    },
    types: EXECUTION_ACCOUNT_BINDING_TYPES,
    primaryType: EXECUTION_ACCOUNT_BINDING_PRIMARY_TYPE,
    message: {
      tenantHash: bytes32("tenantHash", tenantHash),
      subjectHash: bytes32("subjectHash", subjectHash),
      controllerActorHash: bytes32("controllerActorHash", controllerActorHash),
      actorType,
      accountHash: bytes32("accountHash", accountHash),
      purpose,
      nonce: bytes32("nonce", nonce),
      issuedAt: issuedAtSeconds,
      expiresAt: expiresAtSeconds,
      protocolVersion
    }
  };
  return Object.freeze({
    typedData,
    typedDataHash: hashTypedData(typedData),
    schemaVersion: "execution_account_binding_typed_data.v1"
  });
}

export class EvmExecutionAccountProofAdapter {
  constructor({ profile, signatureVerifier } = {}) {
    const { profileHash, schemaVersion, ...profileInput } = profile ?? {};
    this.profile = createChainProfile(profileInput);
    if (profileHash !== undefined && profileHash !== this.profile.profileHash) {
      fail("chain_profile_hash_mismatch", "execution proof profile hash does not match its contents");
    }
    if (schemaVersion !== undefined && schemaVersion !== this.profile.schemaVersion) {
      fail("invalid_chain_profile", "execution proof profile schema version is unsupported");
    }
    if (signatureVerifier !== undefined && typeof signatureVerifier?.verifyTypedData !== "function") {
      fail("invalid_account_proof_configuration", "contract-wallet signature verifier is invalid");
    }
    this.signatureVerifier = signatureVerifier;
    Object.freeze(this);
  }

  descriptor() {
    return Object.freeze({
      profileId: this.profile.profileId,
      chainId: this.profile.chainId,
      adapterVersion: this.signatureVerifier === undefined ? "1.0.0" : "1.1.0",
      proofStandard: "EIP-712",
      bindingPurpose: "execution",
      createsAuthenticationSession: false,
      createsExecutionAuthority: false,
      contractWalletSupport: this.signatureVerifier !== undefined,
      counterfactualWalletSupport: this.signatureVerifier !== undefined,
      sandboxOnly: true,
      productionApproved: false,
      schemaVersion: "execution_account_proof_adapter.v1"
    });
  }

  createTypedData(input) {
    if (input.chainId !== this.profile.chainId) {
      fail("account_proof_chain_mismatch", "challenge chain does not match execution proof adapter");
    }
    return createExecutionAccountBindingTypedData(input);
  }

  async verify({ accountId, signature, challenge, now = new Date() }) {
    const normalized = normalizeEvmCaip10(accountId, this.profile.chainId);
    if (normalized.accountHash !== challenge.accountHash) {
      fail("account_proof_account_mismatch", "proof account does not match the execution challenge");
    }
    if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
      fail("account_proof_challenge_expired", "execution AccountBinding challenge has expired");
    }
    const prepared = this.createTypedData(challenge);
    if (prepared.typedDataHash !== challenge.typedDataHash) {
      fail("account_proof_challenge_mismatch", "execution typed-data hash differs from durable challenge");
    }
    let verificationMethod = "eip712_eoa_v1";
    let signatureType = "eoa";
    if (this.signatureVerifier === undefined) {
      assertLowS(signature);
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
      if (!valid) fail("account_proof_verification_failed", "execution account ownership proof is invalid");
    } else {
      const verification = await this.signatureVerifier.verifyTypedData({
        address: normalized.address,
        chainId: normalized.chainId,
        digest: prepared.typedDataHash,
        signature,
        typedData: prepared.typedData
      });
      const methods = new Set(["eip712_eoa_v1", "eip1271_eip712_v1", "eip6492_eip712_v1"]);
      const types = new Set(["eoa", "erc1271", "erc6492"]);
      if (
        verification?.schemaVersion !== "wallet_signature_verification.v1" ||
        verification.chainId !== normalized.chainId ||
        !methods.has(verification.verificationMethod) ||
        !types.has(verification.signatureType) ||
        verification.authenticationEligible !== true ||
        verification.rawSignaturePersisted !== false ||
        verification.credentialsIncluded !== false ||
        verification.productionFundsMoved !== false
      ) fail("account_proof_verification_failed", "execution account proof result is not eligible");
      verificationMethod = verification.verificationMethod;
      signatureType = verification.signatureType;
    }
    return Object.freeze({
      accountId: normalized.accountId,
      accountHash: normalized.accountHash,
      chainId: normalized.chainId,
      proofHash: hashId("execution_account_binding_proof", {
        typedDataHash: prepared.typedDataHash,
        signatureHash: hashId("signature", signature)
      }),
      signatureType,
      verificationMethod,
      authenticationSessionCreated: false,
      executionAuthorityCreated: false,
      schemaVersion: "execution_account_binding_proof_result.v1"
    });
  }
}
