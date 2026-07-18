import { decodeFunctionResult, encodeFunctionData, getAddress, parseAbi } from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { BASE_SEPOLIA_PROFILE } from "./chain-profiles.js";
import { normalizeEvmCaip10 } from "./evm-account-proof-adapter.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PROJECTION_KEYS = new Set([
  "authorizationId", "accountId", "subjectAccountHash", "acceptedOfferHash",
  "policyHash", "providerScopeHash", "creditStateHash", "obligationProofHash",
  "validUntil"
]);

export const CREDIT_AUTHORIZATION_REGISTRY_ABI = parseAbi([
  "function publishAuthorization(bytes32 authorizationHash,address account,bytes32 subjectAccountHash,bytes32 acceptedOfferHash,bytes32 policyHash,bytes32 providerScopeHash,bytes32 creditStateHash,bytes32 obligationProofHash,uint64 validUntil)",
  "function updateProof(bytes32 authorizationHash,uint64 expectedVersion,bytes32 creditStateHash,bytes32 obligationProofHash)",
  "function suspendAuthorization(bytes32 authorizationHash,uint64 expectedVersion)",
  "function revokeAuthorization(bytes32 authorizationHash,uint64 expectedVersion)",
  "function closeAuthorization(bytes32 authorizationHash,uint64 expectedVersion,bytes32 settledObligationProofHash)",
  "function getAuthorization(bytes32 authorizationHash) view returns ((address account,bytes32 subjectAccountHash,bytes32 acceptedOfferHash,bytes32 policyHash,bytes32 providerScopeHash,bytes32 creditStateHash,bytes32 obligationProofHash,uint64 validUntil,uint64 version,uint8 status))"
]);

export const CreditAuthorizationChainStatus = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REVOKED: "revoked",
  CLOSED: "closed"
});

const STATUS_BY_NUMBER = Object.freeze({
  1: CreditAuthorizationChainStatus.ACTIVE,
  2: CreditAuthorizationChainStatus.SUSPENDED,
  3: CreditAuthorizationChainStatus.REVOKED,
  4: CreditAuthorizationChainStatus.CLOSED
});

function invalid(message) {
  return new DomainError("invalid_credit_authorization_projection", message);
}

function plainClosed(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw invalid("credit authorization projection must be a plain object");
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.size ||
    ownKeys.some((key) => typeof key !== "string" || !keys.has(key)) ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.get || descriptor?.set;
    })
  ) throw invalid("credit authorization projection must use the closed contract");
}

function bytes32(name, value, { allowZero = false } = {}) {
  if (!HASH.test(value ?? "") || (!allowZero && value === `0x${"0".repeat(64)}`)) {
    throw invalid(`${name} must be a non-zero lowercase bytes32 value`);
  }
  return value;
}

function unixSeconds(name, value) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds % 1_000 !== 0) throw invalid(`${name} must be a whole-second timestamp`);
  const seconds = BigInt(milliseconds / 1_000);
  if (seconds < 1n || seconds > 18_446_744_073_709_551_615n) throw invalid(`${name} is outside uint64`);
  return seconds;
}

export function createCreditAuthorizationProjection(input) {
  plainClosed(input, PROJECTION_KEYS);
  if (!ID.test(input.authorizationId ?? "")) throw invalid("authorizationId is invalid");
  const account = normalizeEvmCaip10(input.accountId, BASE_SEPOLIA_PROFILE.chainId);
  const validUntilSeconds = unixSeconds("validUntil", input.validUntil);
  const core = {
    authorizationId: input.authorizationId,
    accountId: account.accountId,
    subjectAccountHash: bytes32("subjectAccountHash", input.subjectAccountHash),
    acceptedOfferHash: bytes32("acceptedOfferHash", input.acceptedOfferHash),
    policyHash: bytes32("policyHash", input.policyHash),
    providerScopeHash: bytes32("providerScopeHash", input.providerScopeHash),
    creditStateHash: bytes32("creditStateHash", input.creditStateHash),
    obligationProofHash: bytes32("obligationProofHash", input.obligationProofHash, { allowZero: true }),
    validUntil: new Date(Number(validUntilSeconds) * 1_000).toISOString(),
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    chainProfileHash: BASE_SEPOLIA_PROFILE.profileHash,
    chainProfileVersion: 1,
    sandboxOnly: true,
    productionFundsMoved: false
  };
  return Object.freeze({
    authorizationHash: hashId("credit_authorization", core),
    accountAddress: account.address,
    ...core,
    schemaVersion: "credit_authorization_chain_projection.v1"
  });
}

function address(value) {
  if (!ADDRESS.test(value ?? "")) throw invalid("registry contract address is invalid");
  try { return getAddress(value); } catch { throw invalid("registry contract checksum is invalid"); }
}

function transaction(contractAddress, functionName, args, authorizationHash) {
  return Object.freeze({
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    to: contractAddress,
    data: encodeFunctionData({ abi: CREDIT_AUTHORIZATION_REGISTRY_ABI, functionName, args }),
    value: 0n,
    authorizationHash,
    idempotencyKey: hashId("credit_authorization_chain_transaction", { functionName, args }),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "credit_authorization_prepared_transaction.v1"
  });
}

function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid("expectedVersion must be a positive safe integer");
  return BigInt(value);
}

export class BaseSepoliaCreditAuthorizationAdapter {
  constructor({ contractAddress }) {
    this.contractAddress = address(contractAddress);
    Object.freeze(this);
  }

  descriptor() {
    return Object.freeze({
      chainId: BASE_SEPOLIA_PROFILE.chainId,
      profileId: BASE_SEPOLIA_PROFILE.profileId,
      profileHash: BASE_SEPOLIA_PROFILE.profileHash,
      chainProfileVersion: 1,
      contractAddress: this.contractAddress,
      explorerUrl: `${BASE_SEPOLIA_PROFILE.explorerBaseUrl ?? "https://sepolia.basescan.org"}/address/${this.contractAddress}`,
      sandboxOnly: true,
      productionApproved: false,
      schemaVersion: "credit_authorization_registry_adapter.v1"
    });
  }

  preparePublish(projection) {
    const checked = createCreditAuthorizationProjection({
      authorizationId: projection.authorizationId,
      accountId: projection.accountId,
      subjectAccountHash: projection.subjectAccountHash,
      acceptedOfferHash: projection.acceptedOfferHash,
      policyHash: projection.policyHash,
      providerScopeHash: projection.providerScopeHash,
      creditStateHash: projection.creditStateHash,
      obligationProofHash: projection.obligationProofHash,
      validUntil: projection.validUntil
    });
    if (projection.authorizationHash !== checked.authorizationHash) throw invalid("authorizationHash does not match projection");
    return transaction(this.contractAddress, "publishAuthorization", [
      checked.authorizationHash, checked.accountAddress, checked.subjectAccountHash,
      checked.acceptedOfferHash, checked.policyHash, checked.providerScopeHash,
      checked.creditStateHash, checked.obligationProofHash,
      unixSeconds("validUntil", checked.validUntil)
    ], checked.authorizationHash);
  }

  prepareUpdate({ authorizationHash, expectedVersion, creditStateHash, obligationProofHash }) {
    return transaction(this.contractAddress, "updateProof", [
      bytes32("authorizationHash", authorizationHash), version(expectedVersion),
      bytes32("creditStateHash", creditStateHash),
      bytes32("obligationProofHash", obligationProofHash, { allowZero: true })
    ], authorizationHash);
  }

  prepareSuspend({ authorizationHash, expectedVersion }) {
    return transaction(this.contractAddress, "suspendAuthorization", [
      bytes32("authorizationHash", authorizationHash), version(expectedVersion)
    ], authorizationHash);
  }

  prepareRevoke({ authorizationHash, expectedVersion }) {
    return transaction(this.contractAddress, "revokeAuthorization", [
      bytes32("authorizationHash", authorizationHash), version(expectedVersion)
    ], authorizationHash);
  }

  prepareClose({ authorizationHash, expectedVersion, obligationProofHash }) {
    return transaction(this.contractAddress, "closeAuthorization", [
      bytes32("authorizationHash", authorizationHash), version(expectedVersion),
      bytes32("obligationProofHash", obligationProofHash)
    ], authorizationHash);
  }

  decodeAuthorization(resultData) {
    const record = decodeFunctionResult({
      abi: CREDIT_AUTHORIZATION_REGISTRY_ABI,
      functionName: "getAuthorization",
      data: resultData
    });
    const status = STATUS_BY_NUMBER[Number(record.status)];
    if (!status) throw invalid("registry returned an unknown authorization status");
    return Object.freeze({
      accountAddress: getAddress(record.account),
      subjectAccountHash: bytes32("subjectAccountHash", record.subjectAccountHash),
      acceptedOfferHash: bytes32("acceptedOfferHash", record.acceptedOfferHash),
      policyHash: bytes32("policyHash", record.policyHash),
      providerScopeHash: bytes32("providerScopeHash", record.providerScopeHash),
      creditStateHash: bytes32("creditStateHash", record.creditStateHash),
      obligationProofHash: bytes32("obligationProofHash", record.obligationProofHash, { allowZero: true }),
      validUntil: new Date(Number(record.validUntil) * 1_000).toISOString(),
      version: Number(record.version),
      status,
      schemaVersion: "credit_authorization_chain_state.v1"
    });
  }

  reconcile(projection, state) {
    const fields = [
      ["accountAddress", projection.accountAddress, state.accountAddress],
      ["subjectAccountHash", projection.subjectAccountHash, state.subjectAccountHash],
      ["acceptedOfferHash", projection.acceptedOfferHash, state.acceptedOfferHash],
      ["policyHash", projection.policyHash, state.policyHash],
      ["providerScopeHash", projection.providerScopeHash, state.providerScopeHash],
      ["creditStateHash", projection.creditStateHash, state.creditStateHash],
      ["obligationProofHash", projection.obligationProofHash, state.obligationProofHash],
      ["validUntil", projection.validUntil, state.validUntil]
    ];
    const differences = fields.filter(([, expected, actual]) => expected !== actual).map(([name]) => name);
    return Object.freeze({
      authorizationHash: projection.authorizationHash,
      chainId: BASE_SEPOLIA_PROFILE.chainId,
      stateVersion: state.version,
      status: state.status,
      differences,
      reconciled: differences.length === 0,
      schemaVersion: "credit_authorization_reconciliation.v1"
    });
  }
}
