import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  http,
  parseAbi
} from "viem";
import { parseStrictJson } from "../../modules/authentication/src/strict-json.js";
import { hashId } from "../../packages/domain/src/index.js";
import {
  SECURED_POOL_V1_EVENT_ABI,
  createSecuredPoolV1Adapter
} from "../../modules/chain-adapter/src/index.js";
import {
  InMemoryPoolObservationStore,
  PoolEventIndexer
} from "../../modules/event-indexer/src/index.js";

export const M2A009_CHAIN_ID = "eip155:84532";
export const M2A009_POOL = "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da";
export const M2A009_ADAPTER = "0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19";
export const M2A009_POOL_TRANSACTION = "0x90d67e7732f752bcf13dd4278ea6ca3263f715d75766f2b497d997b07fd3d9e3";
export const M2A009_ADAPTER_TRANSACTION = "0x9653196281e29f96476a53aed2b21a2a6ee14794987dd1aeaeb98df376c8721f";

const PRIMARY_RPC_URL = "https://sepolia.base.org";
const SECONDARY_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
const NUMERIC_CHAIN_ID = 84532;
const CANDIDATE_SCHEMA = "m2a_009_recovery_candidate.v1";
const MAXIMUM_CANDIDATE_BYTES = 64 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const HASH = /^0x[a-f0-9]{64}$/;
const CANDIDATE_ID = /^M2A-009-V0\.2\.0-RC-[0-9]{8}-[0-9]{3}$/;
const REQUIRED_EVIDENCE = new Set([
  "deployment_reconciliation",
  "source_verification",
  "live_indexer",
  "product_acceptance"
]);
const FAILURE_TRIGGERS = new Set([
  "rpc_disagreement",
  "oracle_invalid_or_stale",
  "reorg_uncertainty",
  "projection_discrepancy",
  "process_restart",
  "database_restore"
]);
const EXCLUDED_AUTHORITY = new Set([
  "mainnet",
  "real_funds",
  "human_cash_lending",
  "custody",
  "kyc",
  "production_deployment",
  "agent_venue_write",
  "new_chain_transaction",
  "automatic_unfreeze"
]);
const TOP_LEVEL_KEYS = new Set([
  "schemaVersion", "candidateId", "releaseVersion", "releaseCommitSha",
  "chain", "evidence", "database", "recovery", "acceptance", "rollback",
  "excludedAuthority"
]);
const CHAIN_KEYS = new Set([
  "chainId", "poolAddress", "adapterAddress", "poolTransactionHash",
  "adapterTransactionHash", "testAssetsOnly", "readOnlyRecovery",
  "transactionPrimitivePresent"
]);
const EVIDENCE_KEYS = new Set(["kind", "path", "sha256"]);
const DATABASE_KEYS = new Set([
  "migrationCount", "latestMigration", "forcedRlsRequired",
  "destructiveMigrationPresent", "restartRestoreRequired"
]);
const RECOVERY_KEYS = new Set([
  "ownerApprovals", "failureTriggers", "newRiskFrozenOnFailure",
  "protectiveRepaymentAvailable", "automaticUnfreeze",
  "zeroDiscrepancyRequired"
]);
const OWNER_KEYS = new Set(["role", "approvalHash"]);
const ACCEPTANCE_KEYS = new Set([
  "repositoryGatePassed", "postgresPassed", "securityPassed",
  "transportPassed", "browserPassed", "forkDryRunPassed", "unresolvedP0P1"
]);
const ROLLBACK_KEYS = new Set([
  "profilePosture", "stopIngestion", "preserveEvidence",
  "rebuildFromFinalizedLogs", "onchainTransactionPracticed"
]);
const POOL_READ_ABI = parseAbi([
  "function marketId() view returns (bytes32)",
  "function pauseGuardian() view returns (address)",
  "function recoveryAuthority() view returns (address)",
  "function oracleDeviationHalted() view returns (bool)",
  "function newRiskPaused() view returns (bool)"
]);

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function exactObject(name, value, keys) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.size ||
    Object.keys(value).some((key) => !keys.has(key))
  ) fail("invalid_m2a009_candidate", `${name} must use the exact closed contract`);
  return value;
}

function exact(name, value, expected) {
  if (value !== expected) fail("m2a009_candidate_drift", `${name} does not match the candidate contract`);
}

function exactSet(name, values, expected) {
  if (
    !Array.isArray(values) || values.length !== expected.size ||
    new Set(values).size !== values.length ||
    values.some((value) => !expected.has(value))
  ) fail("invalid_m2a009_candidate", `${name} must contain the exact closed set`);
}

export function validateM2A009RecoveryCandidate(candidate, { expectedCommitSha } = {}) {
  exactObject("candidate", candidate, TOP_LEVEL_KEYS);
  exact("schemaVersion", candidate.schemaVersion, CANDIDATE_SCHEMA);
  if (!CANDIDATE_ID.test(candidate.candidateId ?? "")) {
    fail("invalid_m2a009_candidate", "candidateId is invalid");
  }
  exact("releaseVersion", candidate.releaseVersion, "0.2.0-rc.1");
  if (!SHA.test(candidate.releaseCommitSha ?? "")) {
    fail("invalid_m2a009_candidate", "releaseCommitSha is invalid");
  }
  if (expectedCommitSha !== undefined) exact("releaseCommitSha", candidate.releaseCommitSha, expectedCommitSha);

  const chain = exactObject("chain", candidate.chain, CHAIN_KEYS);
  exact("chainId", chain.chainId, M2A009_CHAIN_ID);
  exact("poolAddress", chain.poolAddress, M2A009_POOL);
  exact("adapterAddress", chain.adapterAddress, M2A009_ADAPTER);
  exact("poolTransactionHash", chain.poolTransactionHash, M2A009_POOL_TRANSACTION);
  exact("adapterTransactionHash", chain.adapterTransactionHash, M2A009_ADAPTER_TRANSACTION);
  exact("testAssetsOnly", chain.testAssetsOnly, true);
  exact("readOnlyRecovery", chain.readOnlyRecovery, true);
  exact("transactionPrimitivePresent", chain.transactionPrimitivePresent, false);

  if (!Array.isArray(candidate.evidence) || candidate.evidence.length < REQUIRED_EVIDENCE.size) {
    fail("invalid_m2a009_candidate", "required Evidence bindings are missing");
  }
  const evidenceKinds = new Set();
  const evidencePaths = new Set();
  for (const item of candidate.evidence) {
    exactObject("evidence item", item, EVIDENCE_KEYS);
    if (typeof item.kind !== "string" || typeof item.path !== "string" || !SHA256.test(item.sha256 ?? "")) {
      fail("invalid_m2a009_candidate", "Evidence binding is invalid");
    }
    if (!/^(artifacts\/testnet|output\/playwright)\/[A-Za-z0-9._/-]+\.json$/.test(item.path)) {
      fail("invalid_m2a009_candidate", "Evidence path is outside the reviewed roots");
    }
    if (evidenceKinds.has(item.kind) || evidencePaths.has(item.path)) {
      fail("invalid_m2a009_candidate", "Evidence kinds and paths must be unique");
    }
    evidenceKinds.add(item.kind);
    evidencePaths.add(item.path);
  }
  for (const kind of REQUIRED_EVIDENCE) {
    if (!evidenceKinds.has(kind)) fail("invalid_m2a009_candidate", `required Evidence kind ${kind} is missing`);
  }

  const database = exactObject("database", candidate.database, DATABASE_KEYS);
  exact("migrationCount", database.migrationCount, 65);
  exact("latestMigration", database.latestMigration, "0065_pool_obligation_integration");
  exact("forcedRlsRequired", database.forcedRlsRequired, true);
  exact("destructiveMigrationPresent", database.destructiveMigrationPresent, false);
  exact("restartRestoreRequired", database.restartRestoreRequired, true);

  const recovery = exactObject("recovery", candidate.recovery, RECOVERY_KEYS);
  if (!Array.isArray(recovery.ownerApprovals) || recovery.ownerApprovals.length !== 2) {
    fail("invalid_m2a009_candidate", "exactly two recovery owner approvals are required");
  }
  const roles = new Set();
  const approvals = new Set();
  for (const owner of recovery.ownerApprovals) {
    exactObject("recovery owner", owner, OWNER_KEYS);
    if (!new Set(["release_owner", "risk_operations_owner"]).has(owner.role) || !HASH.test(owner.approvalHash ?? "")) {
      fail("invalid_m2a009_candidate", "recovery owner approval is invalid");
    }
    roles.add(owner.role);
    approvals.add(owner.approvalHash);
  }
  if (roles.size !== 2 || approvals.size !== 2) {
    fail("invalid_m2a009_candidate", "recovery owners and approval hashes must be distinct");
  }
  exactSet("failureTriggers", recovery.failureTriggers, FAILURE_TRIGGERS);
  exact("newRiskFrozenOnFailure", recovery.newRiskFrozenOnFailure, true);
  exact("protectiveRepaymentAvailable", recovery.protectiveRepaymentAvailable, true);
  exact("automaticUnfreeze", recovery.automaticUnfreeze, false);
  exact("zeroDiscrepancyRequired", recovery.zeroDiscrepancyRequired, true);

  const acceptance = exactObject("acceptance", candidate.acceptance, ACCEPTANCE_KEYS);
  for (const key of [...ACCEPTANCE_KEYS].filter((key) => key !== "unresolvedP0P1")) exact(key, acceptance[key], true);
  exact("unresolvedP0P1", acceptance.unresolvedP0P1, 0);

  const rollback = exactObject("rollback", candidate.rollback, ROLLBACK_KEYS);
  exact("profilePosture", rollback.profilePosture, "deployed_testnet_read_only_when_disabled");
  exact("stopIngestion", rollback.stopIngestion, true);
  exact("preserveEvidence", rollback.preserveEvidence, true);
  exact("rebuildFromFinalizedLogs", rollback.rebuildFromFinalizedLogs, true);
  exact("onchainTransactionPracticed", rollback.onchainTransactionPracticed, false);
  exactSet("excludedAuthority", candidate.excludedAuthority, EXCLUDED_AUTHORITY);

  return Object.freeze({
    status: "candidate_valid",
    candidateId: candidate.candidateId,
    releaseCommitSha: candidate.releaseCommitSha,
    evidenceCount: candidate.evidence.length,
    dualControl: true,
    transactionPrimitivePresent: false,
    testAssetsOnly: true,
    mainnetAuthorized: false,
    realFundsAuthorized: false
  });
}

export async function readM2A009RecoveryCandidate(file, options = {}) {
  const path = resolve(file);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAXIMUM_CANDIDATE_BYTES) {
    fail("invalid_m2a009_candidate_file", "candidate must be one bounded regular file");
  }
  const candidate = parseStrictJson(await readFile(path, "utf8"), {
    maximumBytes: MAXIMUM_CANDIDATE_BYTES,
    maximumDepth: 16,
    maximumKeys: 256
  });
  validateM2A009RecoveryCandidate(candidate, options);
  return candidate;
}

function evidenceRootFor(root, path) {
  const allowed = path.startsWith("artifacts/testnet/")
    ? resolve(root, "artifacts/testnet")
    : resolve(root, "output/playwright");
  const resolved = resolve(root, path);
  if (resolved !== allowed && !resolved.startsWith(`${allowed}${sep}`)) {
    fail("invalid_m2a009_evidence_path", "Evidence escaped the reviewed root");
  }
  return resolved;
}

export async function verifyM2A009EvidenceDigests(candidate, { root = process.cwd() } = {}) {
  const receipts = [];
  for (const binding of candidate.evidence) {
    const path = evidenceRootFor(root, binding.path);
    const bytes = await readFile(path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== binding.sha256) fail("m2a009_evidence_digest_mismatch", `${binding.kind} Evidence drifted`);
    const evidence = parseStrictJson(bytes.toString("utf8"), {
      maximumBytes: 4 * 1024 * 1024,
      maximumDepth: 32,
      maximumKeys: 16_384
    });
    if (
      evidence.testAssetsOnly !== true || evidence.productionFundsMoved !== false ||
      (evidence.poolAddress !== undefined && evidence.poolAddress.toLowerCase() !== M2A009_POOL.toLowerCase())
    ) fail("invalid_m2a009_evidence", `${binding.kind} Evidence expands authority or drifts Pool binding`);
    receipts.push(Object.freeze({ kind: binding.kind, path: binding.path, sha256: digest }));
  }
  return Object.freeze(receipts);
}

function encodedEvent(eventName, args) {
  const item = getAbiItem({ abi: SECURED_POOL_V1_EVENT_ABI, name: eventName });
  const indexed = Object.fromEntries(
    item.inputs.filter(({ indexed: isIndexed }) => isIndexed).map(({ name }) => [name, args[name]])
  );
  const dataInputs = item.inputs.filter(({ indexed: isIndexed }) => !isIndexed);
  return {
    topics: encodeEventTopics({ abi: SECURED_POOL_V1_EVENT_ABI, eventName, args: indexed }),
    data: encodeAbiParameters(dataInputs, dataInputs.map(({ name }) => args[name]))
  };
}

function fixtureLog(eventName, args, { blockNumber, logIndex, confirmations = 4, blockTag = String(blockNumber) }) {
  return {
    chainId: M2A009_CHAIN_ID,
    contractAddress: M2A009_POOL,
    transactionHash: hashId("m2a009_recovery_fixture_tx", `${eventName}:${blockNumber}:${logIndex}`),
    transactionIndex: 0,
    logIndex,
    blockNumber: String(blockNumber),
    blockHash: hashId("m2a009_recovery_fixture_block", blockTag),
    blockTimestamp: String(1_787_385_600 + blockNumber),
    confirmations,
    ...encodedEvent(eventName, args),
    observedAt: new Date(Date.UTC(2026, 7, 25, 4, 0, blockNumber % 60)).toISOString()
  };
}

function directRead(providerSlot, snapshot, { state = snapshot.state, complete = true } = {}) {
  return {
    providerSlot,
    chainId: M2A009_CHAIN_ID,
    contractAddress: M2A009_POOL.toLowerCase(),
    marketId: snapshot.marketId,
    blockNumber: "500",
    blockHash: hashId("m2a009_recovery_direct_block", "500"),
    ...(complete ? { state } : {}),
    complete,
    observedAt: "2026-08-25T04:00:00.000Z",
    readOnly: true,
    rawProviderPayloadPersisted: false,
    schemaVersion: "pool_direct_state_snapshot.v1"
  };
}

export async function approveM2A009DualRecovery({ indexer, reconciliationId, ownerApprovals }) {
  if (
    !Array.isArray(ownerApprovals) || ownerApprovals.length !== 2 ||
    new Set(ownerApprovals.map(({ role }) => role)).size !== 2 ||
    new Set(ownerApprovals.map(({ approvalHash }) => approvalHash)).size !== 2 ||
    ownerApprovals.some(({ role, approvalHash }) =>
      !new Set(["release_owner", "risk_operations_owner"]).has(role) || !HASH.test(approvalHash ?? "")
    )
  ) fail("m2a009_dual_control_required", "two distinct named owner approvals are required");
  const ordered = [...ownerApprovals].sort((left, right) => left.role.localeCompare(right.role));
  return indexer.approveRecovery({
    reconciliationId,
    approvalHash: hashId("m2a009_dual_recovery_approval", ordered),
    approvedByHash: hashId("m2a009_dual_recovery_owners", ordered.map(({ role }) => role))
  });
}

export async function runM2A009DeterministicRecoveryDrill(candidate) {
  validateM2A009RecoveryCandidate(candidate);
  const marketId = hashId("m2a009_recovery_market", M2A009_POOL);
  const adapter = createSecuredPoolV1Adapter({
    chainId: M2A009_CHAIN_ID,
    contractAddress: M2A009_POOL,
    marketId
  });
  const store = new InMemoryPoolObservationStore();
  const indexer = new PoolEventIndexer({
    adapter,
    store,
    clock: () => new Date("2026-08-25T04:00:00.000Z")
  });
  const initialized = {
    marketId,
    chainId: 84532n,
    debtAsset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    collateralAsset: "0x4200000000000000000000000000000000000006",
    priceOracle: M2A009_ADAPTER,
    oracleSourceId: hashId("m2a009_oracle_source", "chainlink_base_sepolia_eth_usd.v1"),
    marketDebtCapAssets: 1_000_000_000n,
    borrowerDebtCapAssets: 100_000_000n,
    loanToValueBps: 5_000,
    liquidationThresholdBps: 8_000,
    pauseGuardian: "0x8a1e62c539b802c8a204382442ca7a8cac31f19e",
    recoveryAuthority: "0x730766ff23d3c4366f3314c8895330fc589aa546"
  };
  const oracle = {
    marketId,
    sourceId: initialized.oracleSourceId,
    roundId: 1n,
    priceUsdWad: 2_000n * 10n ** 18n,
    observedAt: 1_787_385_600n
  };
  const logs = [
    fixtureLog("MarketInitialized", initialized, { blockNumber: 100, logIndex: 0 }),
    fixtureLog("OracleObservationAccepted", oracle, { blockNumber: 100, logIndex: 1 })
  ];
  for (const log of logs) await indexer.ingest(log);
  const initial = indexer.snapshot();
  const restarted = new PoolEventIndexer({ adapter, store });
  const restored = await restarted.restore();
  const replayDispositions = [];
  for (const log of logs) replayDispositions.push((await restarted.ingest(log)).disposition);
  if (
    initial.snapshotHash !== restored.snapshotHash ||
    replayDispositions.some((disposition) => disposition !== "duplicate")
  ) fail("m2a009_restart_replay_failed", "restart or duplicate replay changed canonical truth");

  const reorgStore = new InMemoryPoolObservationStore();
  const reorgIndexer = new PoolEventIndexer({ adapter, store: reorgStore });
  const nonFinal = fixtureLog("MarketInitialized", initialized, {
    blockNumber: 200,
    logIndex: 0,
    confirmations: 1,
    blockTag: "orphan"
  });
  await reorgIndexer.ingest(nonFinal);
  const reorg = await reorgIndexer.observeCanonicalBlock({
    blockNumber: "200",
    blockHash: hashId("m2a009_recovery_fixture_block", "replacement"),
    observedAt: "2026-08-25T04:01:00.000Z"
  });
  if (reorg.invalidations.length !== 1 || reorg.invalidations[0].observationStatus !== "invalidated") {
    fail("m2a009_reorg_drill_failed", "non-final reorg must invalidate additively");
  }

  const providerDrift = structuredClone(initial.state);
  providerDrift.cashAssets = "1";
  const providerFailure = await restarted.reconcile({
    directReads: [
      directRead("primary", initial),
      directRead("secondary", initial, { state: providerDrift })
    ]
  });
  if (
    providerFailure.run.reasonCode !== "provider_disagreement" ||
    restarted.operationAllowed("borrow") || !restarted.operationAllowed("repay")
  ) fail("m2a009_provider_freeze_failed", "provider disagreement must freeze new risk and preserve repayment");

  const oracleInvalid = structuredClone(initial.state);
  oracleInvalid.oracleDeviationHalted = true;
  const oracleFailure = await restarted.reconcile({
    directReads: [
      directRead("primary", initial, { state: oracleInvalid }),
      directRead("secondary", initial, { state: oracleInvalid })
    ]
  });
  if (oracleFailure.run.reasonCode !== "projection_mismatch" || restarted.operationAllowed("borrow")) {
    fail("m2a009_oracle_freeze_failed", "oracle/projection drift must retain the new-risk freeze");
  }

  const zero = await restarted.reconcile({
    directReads: [directRead("primary", initial), directRead("secondary", initial)]
  });
  if (!zero.run.consistent || restarted.riskControl().newRiskFrozen !== true) {
    fail("m2a009_zero_discrepancy_failed", "zero discrepancy must not automatically unfreeze");
  }
  let singleApprovalRejected = false;
  try {
    await approveM2A009DualRecovery({
      indexer: restarted,
      reconciliationId: zero.run.reconciliationId,
      ownerApprovals: candidate.recovery.ownerApprovals.slice(0, 1)
    });
  } catch (error) {
    singleApprovalRejected = error.code === "m2a009_dual_control_required";
  }
  if (!singleApprovalRejected) fail("m2a009_dual_control_failed", "one owner must not recover new-risk admission");
  const recovered = await approveM2A009DualRecovery({
    indexer: restarted,
    reconciliationId: zero.run.reconciliationId,
    ownerApprovals: candidate.recovery.ownerApprovals
  });
  if (recovered.riskControl.newRiskFrozen || !restarted.operationAllowed("borrow")) {
    fail("m2a009_recovery_failed", "dual-controlled zero-discrepancy recovery did not restore local review");
  }

  return Object.freeze({
    schemaVersion: "m2a_009_recovery_drill_receipt.v1",
    candidateId: candidate.candidateId,
    releaseCommitSha: candidate.releaseCommitSha,
    chainId: M2A009_CHAIN_ID,
    poolAddress: M2A009_POOL,
    initialProjectionHash: initial.snapshotHash,
    restoredProjectionHash: restored.snapshotHash,
    replayDispositions,
    reorgInvalidationCount: reorg.invalidations.length,
    providerFailureReasonCode: providerFailure.run.reasonCode,
    oracleFailureReasonCode: oracleFailure.run.reasonCode,
    borrowAllowedDuringFailure: false,
    repaymentAllowedDuringFailure: true,
    zeroDiscrepancyBeforeRecovery: zero.run.consistent,
    singleApprovalRejected,
    dualControlRecovered: recovered.riskControl.newRiskFrozen === false,
    transactionPrimitivePresent: false,
    testAssetsOnly: true,
    productionFundsMoved: false,
    status: "PASS"
  });
}

function publicClient(rpcUrl) {
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

export async function runM2A009LiveReadOnlyRecovery(candidate) {
  validateM2A009RecoveryCandidate(candidate);
  const primary = publicClient(PRIMARY_RPC_URL);
  const secondary = publicClient(SECONDARY_RPC_URL);
  const [
    chainA, chainB, finalizedA, finalizedB,
    poolReceiptA, poolReceiptB, adapterReceiptA, adapterReceiptB,
    poolCodeA, poolCodeB, adapterCodeA, adapterCodeB
  ] = await Promise.all([
    primary.getChainId(), secondary.getChainId(),
    primary.getBlock({ blockTag: "finalized" }), secondary.getBlock({ blockTag: "finalized" }),
    primary.getTransactionReceipt({ hash: M2A009_POOL_TRANSACTION }),
    secondary.getTransactionReceipt({ hash: M2A009_POOL_TRANSACTION }),
    primary.getTransactionReceipt({ hash: M2A009_ADAPTER_TRANSACTION }),
    secondary.getTransactionReceipt({ hash: M2A009_ADAPTER_TRANSACTION }),
    primary.getBytecode({ address: M2A009_POOL }), secondary.getBytecode({ address: M2A009_POOL }),
    primary.getBytecode({ address: M2A009_ADAPTER }), secondary.getBytecode({ address: M2A009_ADAPTER })
  ]);
  if (
    chainA !== NUMERIC_CHAIN_ID || chainB !== NUMERIC_CHAIN_ID ||
    poolReceiptA.status !== "success" || poolReceiptB.status !== "success" ||
    adapterReceiptA.status !== "success" || adapterReceiptB.status !== "success" ||
    poolReceiptA.blockHash !== poolReceiptB.blockHash ||
    adapterReceiptA.blockHash !== adapterReceiptB.blockHash ||
    finalizedA.number < poolReceiptA.blockNumber || finalizedB.number < poolReceiptB.blockNumber ||
    !poolCodeA || !poolCodeB || !adapterCodeA || !adapterCodeB ||
    poolCodeA !== poolCodeB || adapterCodeA !== adapterCodeB
  ) fail("m2a009_live_read_only_disagreement", "two finalized RPC observations must agree exactly");

  const observationBlockNumber = finalizedA.number < finalizedB.number
    ? finalizedA.number
    : finalizedB.number;
  const read = (client, functionName) => client.readContract({
    address: M2A009_POOL,
    abi: POOL_READ_ABI,
    functionName,
    blockNumber: observationBlockNumber
  });
  const functions = [
    "marketId", "pauseGuardian", "recoveryAuthority",
    "oracleDeviationHalted", "newRiskPaused"
  ];
  const [stateA, stateB] = await Promise.all([
    Promise.all(functions.map((name) => read(primary, name))),
    Promise.all(functions.map((name) => read(secondary, name)))
  ]);
  if (JSON.stringify(stateA) !== JSON.stringify(stateB)) {
    fail("m2a009_live_configuration_disagreement", "Pool configuration differs across RPCs");
  }
  return Object.freeze({
    schemaVersion: "m2a_009_live_read_only_recovery_receipt.v1",
    candidateId: candidate.candidateId,
    releaseCommitSha: candidate.releaseCommitSha,
    chainId: M2A009_CHAIN_ID,
    poolAddress: M2A009_POOL,
    adapterAddress: M2A009_ADAPTER,
    poolBlockNumber: poolReceiptA.blockNumber.toString(),
    adapterBlockNumber: adapterReceiptA.blockNumber.toString(),
    configurationObservationBlockNumber: observationBlockNumber.toString(),
    primaryFinalizedHead: finalizedA.number.toString(),
    secondaryFinalizedHead: finalizedB.number.toString(),
    marketId: stateA[0],
    pauseGuardian: stateA[1],
    recoveryAuthority: stateA[2],
    oracleDeviationHalted: stateA[3],
    newRiskPaused: stateA[4],
    observedThroughRpcCount: 2,
    readOnlyChainAccess: true,
    transactionPrimitivePresent: false,
    testAssetsOnly: true,
    productionFundsMoved: false,
    status: "PASS"
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const candidateFile = process.env.IPO_ONE_M2A009_CANDIDATE_FILE ??
    "deploy/releases/m2a-009-v0.2.0-candidate.json";
  const candidate = await readM2A009RecoveryCandidate(candidateFile, {
    expectedCommitSha: process.env.IPO_ONE_M2A009_RELEASE_SHA
  });
  const evidence = await verifyM2A009EvidenceDigests(candidate);
  const result = process.argv.includes("--live-read-only")
    ? await runM2A009LiveReadOnlyRecovery(candidate)
    : await runM2A009DeterministicRecoveryDrill(candidate);
  process.stdout.write(`${JSON.stringify({ ...result, evidence }, null, 2)}\n`);
}
