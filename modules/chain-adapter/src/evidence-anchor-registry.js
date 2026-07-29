import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseAbi
} from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { BASE_SEPOLIA_PROFILE } from "./chain-profiles.js";
import { normalizeEvmCaip10 } from "./evm-account-proof-adapter.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_]{1,127}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_UINT64 = 18_446_744_073_709_551_615n;
const MAX_LIFETIME_SECONDS = 15 * 60;
const MAX_BATCH_SIZE = 16;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia.basescan.org";
const INPUT_KEYS = new Set([
  "batchId",
  "accountId",
  "actionDigest",
  "nonce",
  "expiresAt",
  "items"
]);
const ITEM_KEYS = new Set([
  "evidenceHash",
  "eventType",
  "aggregateType",
  "aggregateId",
  "aggregateVersion"
]);
const STORED_ITEM_KEYS = new Set([
  "evidenceHash",
  "eventTypeHash",
  "aggregateRefHash"
]);

export const EVIDENCE_ANCHOR_REGISTRY_ABI = parseAbi([
  "event EvidenceAnchored(bytes32 indexed evidenceHash,address indexed attestor,bytes32 indexed actionDigest,bytes32 eventTypeHash,bytes32 aggregateHash,uint64 nonce,uint16 batchOrdinal,uint16 batchSize)",
  "function anchorEvidence((bytes32 evidenceHash,bytes32 eventTypeHash,bytes32 aggregateHash)[] items,bytes32 actionDigest,uint64 nonce,uint64 expiresAt)",
  "function getAnchor(bytes32 evidenceHash) view returns ((address attestor,bytes32 eventTypeHash,bytes32 aggregateHash,bytes32 actionDigest,uint64 nonce,uint64 anchoredAt,uint16 batchOrdinal,uint16 batchSize))",
  "function nextNonce(address attestor) view returns (uint64)"
]);

function invalid(message) {
  return new DomainError("invalid_evidence_anchor", message);
}

function plainClosed(value, keys, name) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalid(`${name} must be a plain object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.size ||
    ownKeys.some((key) => typeof key !== "string" || !keys.has(key)) ||
    ownKeys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.get || descriptor?.set;
    })
  ) {
    throw invalid(`${name} must use the closed contract`);
  }
}

function bytes32(name, value) {
  if (!HASH.test(value ?? "") || value === `0x${"0".repeat(64)}`) {
    throw invalid(`${name} must be a non-zero lowercase bytes32 value`);
  }
  return value;
}

function identifier(name, value) {
  if (!ID.test(value ?? "")) throw invalid(`${name} is invalid`);
  return value;
}

function eventType(value) {
  if (!EVENT_TYPE.test(value ?? "")) throw invalid("eventType is invalid");
  return value;
}

function aggregateVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalid("aggregateVersion must be a positive safe integer");
  }
  return value;
}

function uint64(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${name} must be a non-negative safe integer`);
  }
  const checked = BigInt(value);
  if (checked > MAX_UINT64) throw invalid(`${name} is outside uint64`);
  return checked;
}

function unixSeconds(name, value) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds % 1_000 !== 0) {
    throw invalid(`${name} must be a whole-second timestamp`);
  }
  const checked = BigInt(milliseconds / 1_000);
  if (checked < 1n || checked > MAX_UINT64) {
    throw invalid(`${name} is outside uint64`);
  }
  return checked;
}

function address(value) {
  if (!ADDRESS.test(value ?? "")) {
    throw invalid("Evidence Registry contract address is invalid");
  }
  try {
    return getAddress(value);
  } catch {
    throw invalid("Evidence Registry contract checksum is invalid");
  }
}

function normalizeItem(value) {
  plainClosed(value, ITEM_KEYS, "Evidence anchor item");
  const normalized = {
    evidenceHash: bytes32("evidenceHash", value.evidenceHash),
    eventType: eventType(value.eventType),
    aggregateType: identifier("aggregateType", value.aggregateType),
    aggregateId: identifier("aggregateId", value.aggregateId),
    aggregateVersion: aggregateVersion(value.aggregateVersion)
  };
  return Object.freeze({
    ...normalized,
    eventTypeHash: hashId("evidence_event_type", {
      eventType: normalized.eventType
    }),
    aggregateHash: hashId("evidence_aggregate_reference", {
      aggregateType: normalized.aggregateType,
      aggregateId: normalized.aggregateId,
      aggregateVersion: normalized.aggregateVersion
    })
  });
}

function normalizeStoredItem(value) {
  plainClosed(value, STORED_ITEM_KEYS, "Stored Evidence anchor item");
  return Object.freeze({
    evidenceHash: bytes32("evidenceHash", value.evidenceHash),
    eventTypeHash: bytes32("eventTypeHash", value.eventTypeHash),
    aggregateRefHash: bytes32("aggregateRefHash", value.aggregateRefHash)
  });
}

export function createEvidenceAnchorBatch(input, {
  now = new Date()
} = {}) {
  plainClosed(input, INPUT_KEYS, "Evidence anchor batch");
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > MAX_BATCH_SIZE
  ) {
    throw invalid("items must contain 1 through 16 Evidence envelopes");
  }
  const items = input.items.map(normalizeItem);
  if (new Set(items.map(({ evidenceHash }) => evidenceHash)).size !== items.length) {
    throw invalid("items contain duplicate Evidence hashes");
  }
  const account = normalizeEvmCaip10(
    input.accountId,
    BASE_SEPOLIA_PROFILE.chainId
  );
  const expiresAtSeconds = unixSeconds("expiresAt", input.expiresAt);
  const nowMilliseconds = new Date(now).getTime();
  if (!Number.isFinite(nowMilliseconds)) throw invalid("now is invalid");
  const nowSeconds = BigInt(Math.floor(nowMilliseconds / 1_000));
  if (
    nowSeconds < 1n ||
    expiresAtSeconds <= nowSeconds ||
    expiresAtSeconds > nowSeconds + BigInt(MAX_LIFETIME_SECONDS)
  ) {
    throw invalid("expiresAt must be within the next 15 minutes");
  }
  const core = {
    batchId: identifier("batchId", input.batchId),
    accountId: account.accountId,
    actionDigest: bytes32("actionDigest", input.actionDigest),
    nonce: Number(uint64("nonce", input.nonce)),
    expiresAt: new Date(Number(expiresAtSeconds) * 1_000).toISOString(),
    items,
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    sandboxOnly: true,
    productionFundsMoved: false
  };
  return Object.freeze({
    ...core,
    accountAddress: account.address,
    batchDigest: hashId("evidence_anchor_batch", core),
    schemaVersion: "evidence_anchor_batch.v1"
  });
}

export function createStoredEvidenceAnchorBatch(input, {
  now = new Date()
} = {}) {
  plainClosed(input, INPUT_KEYS, "Stored Evidence anchor batch");
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > MAX_BATCH_SIZE
  ) {
    throw invalid("items must contain 1 through 16 stored Evidence bindings");
  }
  const items = input.items.map(normalizeStoredItem);
  if (new Set(items.map(({ evidenceHash }) => evidenceHash)).size !== items.length) {
    throw invalid("items contain duplicate Evidence hashes");
  }
  const account = normalizeEvmCaip10(
    input.accountId,
    BASE_SEPOLIA_PROFILE.chainId
  );
  const expiresAtSeconds = unixSeconds("expiresAt", input.expiresAt);
  const nowMilliseconds = new Date(now).getTime();
  if (!Number.isFinite(nowMilliseconds)) throw invalid("now is invalid");
  const nowSeconds = BigInt(Math.floor(nowMilliseconds / 1_000));
  if (
    nowSeconds < 1n ||
    expiresAtSeconds <= nowSeconds ||
    expiresAtSeconds > nowSeconds + BigInt(MAX_LIFETIME_SECONDS)
  ) {
    throw invalid("expiresAt must be within the next 15 minutes");
  }
  const core = {
    batchId: identifier("batchId", input.batchId),
    accountId: account.accountId,
    actionDigest: bytes32("actionDigest", input.actionDigest),
    nonce: Number(uint64("nonce", input.nonce)),
    expiresAt: new Date(Number(expiresAtSeconds) * 1_000).toISOString(),
    items,
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    sandboxOnly: true,
    productionFundsMoved: false
  };
  return Object.freeze({
    ...core,
    accountAddress: account.address,
    batchDigest: hashId("stored_evidence_anchor_batch", core),
    schemaVersion: "stored_evidence_anchor_batch.v1"
  });
}

function prepareTransaction(adapter, checked) {
  return Object.freeze({
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    from: checked.accountAddress,
    to: adapter.contractAddress,
    data: encodeFunctionData({
      abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
      functionName: "anchorEvidence",
      args: [
        checked.items.map((item) => ({
          evidenceHash: item.evidenceHash,
          eventTypeHash: item.eventTypeHash,
          aggregateHash: item.aggregateRefHash ?? item.aggregateHash
        })),
        checked.actionDigest,
        BigInt(checked.nonce),
        unixSeconds("expiresAt", checked.expiresAt)
      ]
    }),
    value: 0n,
    batchDigest: checked.batchDigest,
    evidenceHashes: Object.freeze(
      checked.items.map(({ evidenceHash }) => evidenceHash)
    ),
    idempotencyKey: hashId("evidence_anchor_transaction", {
      chainId: BASE_SEPOLIA_PROFILE.chainId,
      contractAddress: adapter.contractAddress,
      batchDigest: checked.batchDigest
    }),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "evidence_anchor_prepared_transaction.v1"
  });
}

export class BaseSepoliaEvidenceAnchorAdapter {
  constructor({ contractAddress }) {
    this.contractAddress = address(contractAddress);
    Object.freeze(this);
  }

  descriptor() {
    return Object.freeze({
      chainId: BASE_SEPOLIA_PROFILE.chainId,
      profileId: BASE_SEPOLIA_PROFILE.profileId,
      profileHash: BASE_SEPOLIA_PROFILE.profileHash,
      contractAddress: this.contractAddress,
      explorerUrl:
        `${BASE_SEPOLIA_EXPLORER_URL}/address/${this.contractAddress}`,
      maximumBatchSize: MAX_BATCH_SIZE,
      directWalletTransaction: true,
      attestedAccountRelaySupported: true,
      nativeValue: "0",
      sandboxOnly: true,
      productionApproved: false,
      schemaVersion: "evidence_anchor_registry_adapter.v1"
    });
  }

  prepareAnchor(batch, { now = new Date() } = {}) {
    const checked = createEvidenceAnchorBatch({
      batchId: batch.batchId,
      accountId: batch.accountId,
      actionDigest: batch.actionDigest,
      nonce: batch.nonce,
      expiresAt: batch.expiresAt,
      items: batch.items.map((item) => ({
        evidenceHash: item.evidenceHash,
        eventType: item.eventType,
        aggregateType: item.aggregateType,
        aggregateId: item.aggregateId,
        aggregateVersion: item.aggregateVersion
      }))
    }, { now });
    if (checked.batchDigest !== batch.batchDigest) {
      throw invalid("batchDigest does not match the Evidence batch");
    }
    return prepareTransaction(this, checked);
  }

  prepareStoredAnchor(batch, { now = new Date() } = {}) {
    const checked = createStoredEvidenceAnchorBatch({
      batchId: batch.batchId,
      accountId: batch.accountId,
      actionDigest: batch.actionDigest,
      nonce: batch.nonce,
      expiresAt: batch.expiresAt,
      items: batch.items.map((item) => ({
        evidenceHash: item.evidenceHash,
        eventTypeHash: item.eventTypeHash,
        aggregateRefHash: item.aggregateRefHash
      }))
    }, { now });
    if (checked.batchDigest !== batch.batchDigest) {
      throw invalid("batchDigest does not match the stored Evidence batch");
    }
    return prepareTransaction(this, checked);
  }

  decodeAnchor(resultData) {
    const record = decodeFunctionResult({
      abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
      functionName: "getAnchor",
      data: resultData
    });
    if (record.attestor.toLowerCase() === ZERO_ADDRESS) {
      return Object.freeze({
        anchored: false,
        schemaVersion: "evidence_anchor_chain_state.v1"
      });
    }
    return Object.freeze({
      anchored: true,
      attestorAddress: getAddress(record.attestor),
      eventTypeHash: bytes32("eventTypeHash", record.eventTypeHash),
      aggregateHash: bytes32("aggregateHash", record.aggregateHash),
      actionDigest: bytes32("actionDigest", record.actionDigest),
      nonce: Number(record.nonce),
      anchoredAt: new Date(Number(record.anchoredAt) * 1_000).toISOString(),
      batchOrdinal: Number(record.batchOrdinal),
      batchSize: Number(record.batchSize),
      schemaVersion: "evidence_anchor_chain_state.v1"
    });
  }

  decodeReceiptLog({ data, topics }) {
    const decoded = decodeEventLog({
      abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
      data,
      topics,
      strict: true
    });
    if (decoded.eventName !== "EvidenceAnchored") {
      throw invalid("receipt log is not an Evidence anchor");
    }
    return Object.freeze({
      evidenceHash: bytes32("evidenceHash", decoded.args.evidenceHash),
      attestorAddress: getAddress(decoded.args.attestor),
      actionDigest: bytes32("actionDigest", decoded.args.actionDigest),
      eventTypeHash: bytes32("eventTypeHash", decoded.args.eventTypeHash),
      aggregateHash: bytes32("aggregateHash", decoded.args.aggregateHash),
      nonce: Number(decoded.args.nonce),
      batchOrdinal: Number(decoded.args.batchOrdinal),
      batchSize: Number(decoded.args.batchSize),
      schemaVersion: "evidence_anchor_receipt_event.v1"
    });
  }

  transactionUrl(transactionHash) {
    if (!HASH.test(transactionHash ?? "")) {
      throw invalid("transactionHash must be a lowercase EVM transaction hash");
    }
    return `${BASE_SEPOLIA_EXPLORER_URL}/tx/${transactionHash}`;
  }
}
