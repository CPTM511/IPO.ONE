import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, defineChain, http } from "viem";
import { hashId } from "../../packages/domain/src/index.js";
import { createSecuredPoolV1Adapter } from "../../modules/chain-adapter/src/index.js";
import {
  InMemoryPoolObservationStore,
  PoolEventIndexer
} from "../../modules/event-indexer/src/index.js";

const CHAIN_ID = "eip155:84532";
const NUMERIC_CHAIN_ID = 84532;
const PRIMARY_RPC_URL = "https://sepolia.base.org";
const SECONDARY_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
const POOL = "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da";
const POOL_TRANSACTION = "0x90d67e7732f752bcf13dd4278ea6ca3263f715d75766f2b497d997b07fd3d9e3";
const RECOVERY_SCHEMA = "m2a_008_base_sepolia_pool_recovery_reconciliation.v1";

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function clientFor(rpcUrl) {
  return createPublicClient({
    chain: defineChain({
      id: NUMERIC_CHAIN_ID,
      name: "Base Sepolia",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
      testnet: true
    }),
    transport: http(rpcUrl, { retryCount: 1, timeout: 15_000 })
  });
}

function decimal(value) {
  return value.toString();
}

function address(value) {
  return value.toLowerCase();
}

async function readRecoveryEvidence(path) {
  const evidence = JSON.parse(await readFile(resolve(path), "utf8"));
  if (
    evidence.schemaVersion !== RECOVERY_SCHEMA ||
    address(evidence.poolAddress ?? "") !== address(POOL) ||
    evidence.poolTransactionHash !== POOL_TRANSACTION ||
    evidence.discrepancyCount !== 0 ||
    evidence.testAssetsOnly !== true ||
    evidence.productionFundsMoved !== false
  ) {
    fail("invalid_m2a008_recovery_evidence", "finalized exact Pool recovery Evidence is required");
  }
  return evidence;
}

async function readState(client, abi, blockNumber, marketId) {
  const call = (functionName) => client.readContract({
    address: POOL,
    abi,
    functionName,
    blockNumber
  });
  const [
    marketChainId, debtAsset, collateralAsset, priceOracle, oracleSourceId,
    marketDebtCapAssets, borrowerDebtCapAssets, loanToValueBps, liquidationThresholdBps, pauseGuardian,
    recoveryAuthority, cashAssets, grossDebtAssets, reservesAssets, badDebtAssets,
    totalSupplyShares, totalDebtShares, lastAccruedAt, acceptedPriceUsdWad,
    acceptedOracleObservedAt, acceptedOracleRoundId, oracleDeviationHalted, newRiskPaused
  ] = await Promise.all([
    "marketChainId", "debtAsset", "collateralAsset", "priceOracle", "oracleSourceId",
    "marketDebtCapAssets", "borrowerDebtCapAssets", "loanToValueBps", "LIQUIDATION_THRESHOLD_BPS", "pauseGuardian",
    "recoveryAuthority", "cashAssets", "grossDebtAssets", "reservesAssets", "badDebtAssets",
    "totalSupplyShares", "totalDebtShares", "lastAccruedAt", "acceptedPriceUsdWad",
    "acceptedOracleObservedAt", "acceptedOracleRoundId", "oracleDeviationHalted", "newRiskPaused"
  ].map(call));
  return {
    chainId: CHAIN_ID,
    contractAddress: address(POOL),
    marketId,
    abiVersion: "IpoOneSecuredPoolV1.v1",
    initialized: true,
    configuration: {
      chainId: decimal(marketChainId),
      debtAsset: address(debtAsset),
      collateralAsset: address(collateralAsset),
      priceOracle: address(priceOracle),
      oracleSourceId: oracleSourceId.toLowerCase(),
      marketDebtCapAssets: decimal(marketDebtCapAssets),
      borrowerDebtCapAssets: decimal(borrowerDebtCapAssets),
      loanToValueBps: decimal(loanToValueBps),
      liquidationThresholdBps: decimal(liquidationThresholdBps),
      pauseGuardian: address(pauseGuardian),
      recoveryAuthority: address(recoveryAuthority)
    },
    cashAssets: decimal(cashAssets),
    grossDebtAssets: decimal(grossDebtAssets),
    reservesAssets: decimal(reservesAssets),
    badDebtAssets: decimal(badDebtAssets),
    totalSupplyShares: decimal(totalSupplyShares),
    totalDebtShares: decimal(totalDebtShares),
    lastAccruedAt: decimal(lastAccruedAt),
    acceptedPriceUsdWad: decimal(acceptedPriceUsdWad),
    acceptedOracleObservedAt: decimal(acceptedOracleObservedAt),
    acceptedOracleRoundId: decimal(acceptedOracleRoundId),
    oracleDeviationHalted,
    newRiskPaused,
    accounts: []
  };
}

function normalizedLog(log, receipt, block) {
  return {
    chainId: CHAIN_ID,
    contractAddress: address(log.address),
    transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: Number(log.transactionIndex),
    logIndex: Number(log.logIndex),
    blockNumber: decimal(log.blockNumber),
    blockHash: log.blockHash.toLowerCase(),
    blockTimestamp: decimal(block.timestamp),
    confirmations: 4,
    topics: log.topics.map((topic) => topic.toLowerCase()),
    data: log.data.toLowerCase(),
    observedAt: new Date().toISOString()
  };
}

function directRead(providerSlot, state, block, observedAt) {
  return {
    providerSlot,
    chainId: CHAIN_ID,
    contractAddress: address(POOL),
    marketId: state.marketId,
    blockNumber: decimal(block.number),
    blockHash: block.hash.toLowerCase(),
    state,
    complete: true,
    observedAt,
    readOnly: true,
    rawProviderPayloadPersisted: false,
    schemaVersion: "pool_direct_state_snapshot.v1"
  };
}

export async function runM2A008LiveIndexerAcceptance({ recoveryEvidenceFile }) {
  const recovery = await readRecoveryEvidence(recoveryEvidenceFile);
  const artifact = JSON.parse(await readFile(
    new URL("../../out/foundry/IpoOneSecuredPoolV1.sol/IpoOneSecuredPoolV1.json", import.meta.url),
    "utf8"
  ));
  const primary = clientFor(PRIMARY_RPC_URL);
  const secondary = clientFor(SECONDARY_RPC_URL);
  const target = BigInt(recovery.poolBlockNumber);
  const [finalizedA, finalizedB, receiptA, receiptB, blockA, blockB] = await Promise.all([
    primary.getBlock({ blockTag: "finalized" }),
    secondary.getBlock({ blockTag: "finalized" }),
    primary.getTransactionReceipt({ hash: POOL_TRANSACTION }),
    secondary.getTransactionReceipt({ hash: POOL_TRANSACTION }),
    primary.getBlock({ blockNumber: target }),
    secondary.getBlock({ blockNumber: target })
  ]);
  if (
    finalizedA.number < target || finalizedB.number < target ||
    receiptA.status !== "success" || receiptB.status !== "success" ||
    receiptA.blockHash !== receiptB.blockHash || blockA.hash !== blockB.hash ||
    receiptA.logs.length !== 2 || receiptB.logs.length !== 2
  ) fail("m2a008_live_indexer_not_final", "both RPCs must agree on one finalized two-event Pool creation");

  const marketId = await primary.readContract({
    address: POOL,
    abi: artifact.abi,
    functionName: "marketId",
    blockNumber: target
  });
  const adapter = createSecuredPoolV1Adapter({
    chainId: CHAIN_ID,
    contractAddress: POOL,
    marketId,
    finalityPolicy: {
      includedConfirmations: 1,
      safeConfirmations: 2,
      finalizedConfirmations: 4,
      maxReorgDepth: 32
    }
  });
  const store = new InMemoryPoolObservationStore();
  const clock = () => new Date();
  const indexer = new PoolEventIndexer({ adapter, store, clock });
  const orderedLogs = [...receiptA.logs].sort((left, right) => Number(left.logIndex - right.logIndex));
  for (const log of orderedLogs) await indexer.ingest(normalizedLog(log, receiptA, blockA));
  const indexed = indexer.snapshot();

  const restarted = new PoolEventIndexer({ adapter, store, clock });
  const restored = await restarted.restore();
  const replay = [];
  for (const log of orderedLogs) replay.push((await restarted.ingest(normalizedLog(log, receiptA, blockA))).disposition);
  if (
    indexed.finalizedEventCount !== 2 || restored.snapshotHash !== indexed.snapshotHash ||
    replay.some((disposition) => disposition !== "duplicate")
  ) fail("m2a008_live_indexer_replay_mismatch", "restart and duplicate replay must preserve the exact projection");

  const [stateA, stateB] = await Promise.all([
    readState(primary, artifact.abi, target, marketId.toLowerCase()),
    readState(secondary, artifact.abi, target, marketId.toLowerCase())
  ]);
  const observedAt = new Date().toISOString();
  const reads = [
    directRead("primary", stateA, blockA, observedAt),
    directRead("secondary", stateB, blockB, observedAt)
  ];
  const reconciled = await restarted.reconcile({ directReads: reads });
  if (!reconciled.run.consistent) {
    fail(
      "m2a008_live_indexer_discrepancy",
      JSON.stringify({ reasonCode: reconciled.run.reasonCode, projection: indexed.state, direct: stateA })
    );
  }

  const drifted = structuredClone(stateB);
  drifted.cashAssets = (BigInt(drifted.cashAssets) + 1n).toString();
  const frozen = await restarted.reconcile({
    directReads: [reads[0], directRead("secondary", drifted, blockB, new Date().toISOString())]
  });
  if (
    frozen.run.reasonCode !== "provider_disagreement" ||
    restarted.operationAllowed("borrow") !== false ||
    restarted.operationAllowed("repay") !== true
  ) fail("m2a008_live_indexer_freeze_failed", "local discrepancy must freeze new risk and preserve repayment");
  const zero = await restarted.reconcile({
    directReads: [
      directRead("primary", stateA, blockA, new Date().toISOString()),
      directRead("secondary", stateB, blockB, new Date().toISOString())
    ]
  });
  const recovered = await restarted.approveRecovery({
    reconciliationId: zero.run.reconciliationId,
    approvalHash: hashId("m2a008_gate_e_recovery_approval", recovery.decisionHash),
    approvedByHash: hashId("m2a008_gate_e_recovery_reviewer", "Founder/Product/Operations/Risk")
  });
  if (recovered.riskControl.newRiskFrozen || !restarted.operationAllowed("borrow")) {
    fail("m2a008_live_indexer_recovery_failed", "zero-discrepancy local recovery must restore new-risk review");
  }

  const evidence = {
    schemaVersion: "m2a_008_gate_e_live_indexer_acceptance.v1",
    releaseCommitSha: recovery.releaseCommitSha,
    chainId: CHAIN_ID,
    poolAddress: POOL,
    poolTransactionHash: POOL_TRANSACTION,
    poolBlockNumber: target.toString(),
    poolBlockHash: blockA.hash,
    marketId: marketId.toLowerCase(),
    primaryFinalizedHead: finalizedA.number.toString(),
    secondaryFinalizedHead: finalizedB.number.toString(),
    finalizedEventCount: indexed.finalizedEventCount,
    projectionHash: indexed.snapshotHash,
    projectionStateHash: indexed.stateHash,
    restoredProjectionHash: restored.snapshotHash,
    replayDispositions: replay,
    reconciliationId: reconciled.run.reconciliationId,
    reconciliationHash: reconciled.run.reconciliationHash,
    reconciliationDiscrepancyCount: 0,
    protectiveFreezeReasonCode: frozen.run.reasonCode,
    repaymentAllowedWhileFrozen: true,
    borrowAllowedWhileFrozen: false,
    recoveryReconciliationId: zero.run.reconciliationId,
    recoveryTransitionId: recovered.riskTransition.transitionId,
    newRiskFrozenAfterRecovery: recovered.riskControl.newRiskFrozen,
    observedThroughRpcCount: 2,
    readOnlyChainAccess: true,
    transactionPrimitivePresent: false,
    testAssetsOnly: true,
    productionFundsMoved: false,
    observedAt: new Date().toISOString()
  };
  const artifactPath = resolve("artifacts/testnet/eip155-84532-m2a-008-gate-e-live-indexer-20260824.json");
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ ...evidence, artifactPath, status: "PASS" });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const recoveryEvidenceFile = process.env.IPO_ONE_M2A008_RECOVERY_EVIDENCE_FILE;
  if (!recoveryEvidenceFile) fail("m2a008_recovery_evidence_required", "set the exact recovery Evidence file");
  process.stdout.write(`${JSON.stringify(await runM2A008LiveIndexerAcceptance({ recoveryEvidenceFile }), null, 2)}\n`);
}
