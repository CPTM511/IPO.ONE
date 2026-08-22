import {
  decodeEventLog,
  getAbiItem,
  parseAbi,
  toEventSelector
} from "viem";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const CAIP_EVM_PATTERN = /^eip155:(0|[1-9][0-9]*)$/;
const FINALITY_RANK = Object.freeze({ included: 1, safe: 2, finalized: 3, invalidated: 4 });

export const SECURED_POOL_V1_ABI_VERSION = "IpoOneSecuredPoolV1.v1";

export const SECURED_POOL_V1_EVENT_ABI = parseAbi([
  "event MarketInitialized(bytes32 indexed marketId, uint256 indexed chainId, address indexed debtAsset, address collateralAsset, address priceOracle, bytes32 oracleSourceId, uint256 marketDebtCapAssets, uint256 borrowerDebtCapAssets, uint16 loanToValueBps, uint16 liquidationThresholdBps, address pauseGuardian, address recoveryAuthority)",
  "event OracleObservationAccepted(bytes32 indexed marketId, bytes32 indexed sourceId, uint80 indexed roundId, uint256 priceUsdWad, uint64 observedAt)",
  "event OracleDeviationHaltChanged(bytes32 indexed marketId, bool halted, uint256 previousPriceUsdWad, uint256 candidatePriceUsdWad, address indexed actor)",
  "event InterestAccrued(bytes32 indexed marketId, uint256 fromTimestamp, uint256 toTimestamp, uint256 chunks, uint256 interestAssets, uint256 reserveAssets)",
  "event AssetsSupplied(bytes32 indexed marketId, address indexed account, uint256 assets, uint256 shares, uint256 cashAfter, uint256 totalSupplySharesAfter)",
  "event AssetsWithdrawn(bytes32 indexed marketId, address indexed account, uint256 assets, uint256 shares, uint256 cashAfter, uint256 totalSupplySharesAfter)",
  "event CollateralAdded(bytes32 indexed marketId, address indexed account, uint256 assets, uint256 collateralAfter)",
  "event CollateralReleased(bytes32 indexed marketId, address indexed account, uint256 assets, uint256 collateralAfter)",
  "event AssetsBorrowed(bytes32 indexed marketId, address indexed account, uint256 assets, uint256 debtShares, uint256 debtAfter, uint256 cashAfter)",
  "event AssetsRepaid(bytes32 indexed marketId, address indexed account, address indexed payer, uint256 assetsTransferred, uint256 debtReducedAssets, uint256 debtSharesBurned, uint256 reserveDustAssets, uint256 debtAfter, uint256 cashAfter)",
  "event PositionLiquidated(bytes32 indexed marketId, address indexed borrower, address indexed liquidator, uint256 repaidAssets, uint256 collateralSeizedAssets, uint256 badDebtRecognizedAssets)",
  "event BadDebtRecovered(bytes32 indexed marketId, address indexed account, address indexed payer, uint256 recoveredAssets, uint256 accountBadDebtAfter, uint256 marketBadDebtAfter)",
  "event NewRiskPauseChanged(bytes32 indexed marketId, bool paused, address indexed actor)"
]);

const EVENT_NAMES = Object.freeze(
  SECURED_POOL_V1_EVENT_ABI.map((item) => item.name)
);

export const SECURED_POOL_V1_EVENT_TOPICS = Object.freeze(
  Object.fromEntries(
    EVENT_NAMES.map((eventName) => [
      eventName,
      toEventSelector(getAbiItem({ abi: SECURED_POOL_V1_EVENT_ABI, name: eventName }))
    ])
  )
);

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function normalizeAddress(name, value) {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    fail("invalid_pool_log", `${name} must be an EVM address`);
  }
  return value.toLowerCase();
}

function normalizeHex32(name, value) {
  if (typeof value !== "string" || !HEX_32_PATTERN.test(value)) {
    fail("invalid_pool_log", `${name} must be a 32-byte hex value`);
  }
  return value.toLowerCase();
}

function normalizeUnsigned(name, value) {
  const decimal = typeof value === "bigint" ? value.toString() : value;
  if (typeof decimal !== "string" || !/^(0|[1-9][0-9]*)$/.test(decimal)) {
    fail("invalid_pool_log", `${name} must be an unsigned decimal value`);
  }
  return BigInt(decimal).toString();
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") fail("invalid_pool_log", "observedAt must be an ISO timestamp");
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) fail("invalid_pool_log", "observedAt must be an ISO timestamp");
  return timestamp.toISOString();
}

function normalizeDecodedValue(name, value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && ADDRESS_PATTERN.test(value)) return value.toLowerCase();
  if (typeof value === "string" && HEX_32_PATTERN.test(value)) return value.toLowerCase();
  fail("invalid_pool_event", `decoded ${name} has an unsupported value`);
}

function normalizeArgs(args) {
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [name, normalizeDecodedValue(name, value)])
  );
}

function statusFor(confirmations, policy) {
  if (confirmations >= policy.finalizedConfirmations) return "finalized";
  if (confirmations >= policy.safeConfirmations) return "safe";
  if (confirmations >= policy.includedConfirmations) return "included";
  fail("pool_log_not_included", "pool log has not reached the inclusion threshold");
}

function assertExactKeys(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("invalid_pool_log", "pool log must be an object");
  }
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail("pool_log_not_closed", "pool logs must be normalized from a closed provider boundary", { unknown });
  }
}

export function createSecuredPoolV1Adapter({
  chainId,
  contractAddress,
  marketId,
  abiVersion = SECURED_POOL_V1_ABI_VERSION,
  finalityPolicy = {
    includedConfirmations: 1,
    safeConfirmations: 2,
    finalizedConfirmations: 4,
    maxReorgDepth: 32
  }
}) {
  if (typeof chainId !== "string" || !CAIP_EVM_PATTERN.test(chainId)) {
    fail("invalid_pool_adapter", "chainId must be an EVM CAIP-2 identifier");
  }
  const normalizedAddress = normalizeAddress("contractAddress", contractAddress);
  const normalizedMarketId = normalizeHex32("marketId", marketId);
  if (abiVersion !== SECURED_POOL_V1_ABI_VERSION) {
    fail("unsupported_pool_abi", "only the checked-in Pool V1 ABI is admitted");
  }
  const thresholds = [
    finalityPolicy?.includedConfirmations,
    finalityPolicy?.safeConfirmations,
    finalityPolicy?.finalizedConfirmations,
    finalityPolicy?.maxReorgDepth
  ];
  if (
    thresholds.some((value) => !Number.isSafeInteger(value) || value < 1) ||
    !(thresholds[0] < thresholds[1] && thresholds[1] < thresholds[2])
  ) {
    fail("invalid_pool_finality_policy", "pool finality thresholds must be positive and monotonic");
  }
  const descriptor = Object.freeze({
    chainId,
    contractAddress: normalizedAddress,
    marketId: normalizedMarketId,
    abiVersion,
    eventTopics: SECURED_POOL_V1_EVENT_TOPICS,
    finalityPolicy: Object.freeze({ ...finalityPolicy }),
    readOnly: true,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "secured_pool_v1_adapter.v1"
  });

  function normalizeLog(input) {
    assertExactKeys(
      input,
      new Set([
        "chainId", "contractAddress", "transactionHash", "transactionIndex", "logIndex",
        "blockNumber", "blockHash", "blockTimestamp", "confirmations", "topics", "data", "observedAt"
      ])
    );
    if (input.chainId !== chainId) fail("pool_chain_mismatch", "pool log chain does not match the adapter");
    if (normalizeAddress("contractAddress", input.contractAddress) !== normalizedAddress) {
      fail("pool_emitter_mismatch", "pool log emitter does not match the configured contract");
    }
    if (!Number.isSafeInteger(input.logIndex) || input.logIndex < 0) {
      fail("invalid_pool_log", "logIndex must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(input.transactionIndex) || input.transactionIndex < 0) {
      fail("invalid_pool_log", "transactionIndex must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(input.confirmations) || input.confirmations < 0) {
      fail("invalid_pool_log", "confirmations must be a non-negative safe integer");
    }
    if (
      !Array.isArray(input.topics) || input.topics.length < 1 || input.topics.length > 4 ||
      input.topics.some((topic) => typeof topic !== "string" || !HEX_32_PATTERN.test(topic))
    ) fail("invalid_pool_log", "topics must be one to four 32-byte hex values");
    if (typeof input.data !== "string" || !DATA_PATTERN.test(input.data)) {
      fail("invalid_pool_log", "data must be canonical byte-aligned hex");
    }

    let decoded;
    try {
      decoded = decodeEventLog({
        abi: SECURED_POOL_V1_EVENT_ABI,
        topics: input.topics.map((topic) => topic.toLowerCase()),
        data: input.data.toLowerCase(),
        strict: true
      });
    } catch {
      fail("unknown_or_malformed_pool_event", "pool log does not match the closed Pool V1 event ABI");
    }
    if (!EVENT_NAMES.includes(decoded.eventName)) {
      fail("unknown_or_malformed_pool_event", "pool log topic is not admitted by Pool V1");
    }
    const args = normalizeArgs(decoded.args);
    if (args.marketId !== normalizedMarketId) {
      fail("pool_market_mismatch", "decoded pool event belongs to a different market");
    }
    if (decoded.eventName === "MarketInitialized") {
      const expectedNumericChain = chainId.slice("eip155:".length);
      if (args.chainId !== expectedNumericChain) {
        fail("pool_market_chain_mismatch", "market initialization chain binding does not match CAIP-2");
      }
    }

    const transactionHash = normalizeHex32("transactionHash", input.transactionHash);
    const blockNumber = normalizeUnsigned("blockNumber", input.blockNumber);
    const blockHash = normalizeHex32("blockHash", input.blockHash);
    const blockTimestamp = normalizeUnsigned("blockTimestamp", input.blockTimestamp);
    const observationStatus = statusFor(input.confirmations, finalityPolicy);
    const eventKey = hashId("pool_chain_event_key", {
      chainId,
      contractAddress: normalizedAddress,
      transactionHash,
      logIndex: input.logIndex
    });
    const eventContentHash = hashId("pool_chain_event_content", {
      eventKey,
      transactionIndex: input.transactionIndex,
      blockNumber,
      blockHash,
      blockTimestamp,
      abiVersion,
      marketId: normalizedMarketId,
      eventName: decoded.eventName,
      args
    });
    const core = {
      eventKey,
      eventContentHash,
      chainId,
      contractAddress: normalizedAddress,
      transactionHash,
      transactionIndex: input.transactionIndex,
      logIndex: input.logIndex,
      blockNumber,
      blockHash,
      blockTimestamp,
      abiVersion,
      marketId: normalizedMarketId,
      eventName: decoded.eventName,
      eventType: `pool_${decoded.eventName.replace(/[A-Z]/g, (match, offset) => `${offset ? "_" : ""}${match.toLowerCase()}`)}`,
      args,
      observationStatus,
      finalityRank: FINALITY_RANK[observationStatus],
      confirmations: input.confirmations,
      observedAt: normalizeTimestamp(input.observedAt),
      readOnly: true,
      syntheticOnly: true,
      productionFundsMoved: false
    };
    return Object.freeze({
      observationId: hashId("pool_chain_observation_id", {
        eventKey,
        blockHash,
        observationStatus
      }),
      observationHash: hashId("pool_chain_observation", core),
      ...core,
      schemaVersion: "pool_chain_observation.v1"
    });
  }

  function createInvalidation(observation, { canonicalBlockHash, reasonCode = "non_final_block_replaced", observedAt }) {
    if (observation?.schemaVersion !== "pool_chain_observation.v1") {
      fail("invalid_pool_observation", "only normalized Pool V1 observations can be invalidated");
    }
    if (observation.observationStatus === "finalized") {
      fail("finalized_pool_event_cannot_reorg", "a finalized Pool V1 event cannot be invalidated");
    }
    const replacementHash = normalizeHex32("canonicalBlockHash", canonicalBlockHash);
    if (replacementHash === observation.blockHash) {
      fail("pool_reorg_not_observed", "canonical block hash must differ before invalidation");
    }
    if (reasonCode !== "non_final_block_replaced") {
      fail("invalid_pool_invalidation", "only the closed non-final block replacement reason is admitted");
    }
    const core = {
      ...observation,
      observationStatus: "invalidated",
      finalityRank: FINALITY_RANK.invalidated,
      confirmations: observation.confirmations,
      invalidationReason: reasonCode,
      replacedBlockHash: replacementHash,
      priorObservationHash: observation.observationHash,
      observedAt: normalizeTimestamp(observedAt)
    };
    delete core.observationId;
    delete core.observationHash;
    delete core.schemaVersion;
    return Object.freeze({
      observationId: hashId("pool_chain_invalidation_id", {
        priorObservationHash: observation.observationHash,
        replacementHash
      }),
      observationHash: hashId("pool_chain_invalidation", core),
      ...core,
      schemaVersion: "pool_chain_observation.v1"
    });
  }

  return Object.freeze({
    descriptor: () => structuredClone(descriptor),
    normalizeLog,
    createInvalidation
  });
}
