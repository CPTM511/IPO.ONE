import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  createPublicClient,
  getAddress,
  getContractAddress,
  http,
  keccak256,
  parseAbi
} from "viem";
import { parseStrictJson } from "../../modules/authentication/src/strict-json.js";
import {
  parseCanonicalJson,
  validateLaunchPolicy
} from "../../packages/release-governance/src/index.js";
import { hashId } from "../../packages/domain/src/index.js";

export const M2A008_CHAIN_ID = "eip155:84532";
export const M2A008_NUMERIC_CHAIN_ID = 84532;
export const M2A008_WETH = "0x4200000000000000000000000000000000000006";
export const M2A008_TEST_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const M2A008_ETH_USD_FEED = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
export const M2A008_ORACLE_SOURCE_LABEL = "chainlink_base_sepolia_eth_usd.v1";

const PROFILE_ID = "live_testnet_secured_pool";
const DECISION_DIRECTORY = "/private/tmp/ipo-one-m2a-008/";
const MAXIMUM_DECISION_BYTES = 32 * 1024;
const MAXIMUM_APPROVAL_AGE_MS = 24 * 60 * 60 * 1000;
const MAXIMUM_FAUCET_BALANCE_WEI = 100_000_000_000_000_000n;
const MAXIMUM_TOTAL_GAS_COST_WEI = 20_000_000_000_000_000n;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const DECISION_ID = /^M2A-008-BASE-SEPOLIA-[A-Z0-9-]{8,48}$/;
const APPROVAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "decisionId",
  "decision",
  "chainId",
  "releaseCommitSha",
  "approvedAt",
  "approvalExpiresAt",
  "deploymentApprovalRef",
  "launchEvidenceSha256",
  "addresses",
  "risk",
  "oracle",
  "signer",
  "transactionCaps",
  "deploymentAuthorized",
  "testAssetsOnly",
  "mainnetAuthorized",
  "realFundsAuthorized"
]);
const ADDRESS_KEYS = new Set([
  "wethCollateral",
  "testUsdcDebt",
  "priceFeed",
  "deployer",
  "expectedOracleAdapter",
  "expectedPool",
  "pauseGuardian",
  "recoveryAuthority"
]);
const RISK_KEYS = new Set([
  "marketDebtCapAssets",
  "borrowerDebtCapAssets",
  "loanToValueBps"
]);
const ORACLE_KEYS = new Set([
  "sourceId",
  "sourceLabel",
  "feedDecimals",
  "maximumAgeSeconds"
]);
const SIGNER_KEYS = new Set([
  "keyFile",
  "purpose",
  "startingNonce",
  "priorSignerReuse",
  "destroyAfterRun"
]);
const TRANSACTION_CAP_KEYS = new Set([
  "deploymentCount",
  "nativeValueWei",
  "expectedStartingBalanceWei",
  "maximumFaucetBalanceWei",
  "maximumTotalGasCostWei"
]);

const TOKEN_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]);
const FEED_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
]);

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function exactObject(name, value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.size ||
    Object.keys(value).some((key) => !keys.has(key))
  ) {
    fail("invalid_m2a008_decision", `${name} must use the exact closed contract`);
  }
  return value;
}

function exactValue(name, actual, expected) {
  if (actual !== expected) {
    fail("m2a008_decision_drift", `${name} does not match the approved value`);
  }
}

function exactTimestamp(name, value) {
  const milliseconds = Date.parse(value);
  if (
    typeof value !== "string" ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    fail("invalid_m2a008_decision", `${name} must be an exact UTC timestamp`);
  }
  return milliseconds;
}

function positiveIntegerString(name, value, maximum) {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{0,77}$/.test(value) ||
    BigInt(value) > maximum
  ) {
    fail("invalid_m2a008_decision", `${name} is outside the bounded positive range`);
  }
  return BigInt(value);
}

function exactAddress(name, value) {
  try {
    return getAddress(value);
  } catch {
    fail("invalid_m2a008_decision", `${name} must be a valid EVM address`);
  }
}

export function validateM2A008ExactDecision(
  decision,
  { clock = () => new Date(), expectedCommitSha } = {}
) {
  exactObject("decision", decision, TOP_LEVEL_KEYS);
  exactValue(
    "schemaVersion",
    decision.schemaVersion,
    "m2a_008_exact_deployment_decision.v1"
  );
  if (!DECISION_ID.test(decision.decisionId ?? "")) {
    fail("invalid_m2a008_decision", "decisionId is invalid");
  }
  exactValue("decision", decision.decision, "APPROVE");
  exactValue("chainId", decision.chainId, M2A008_CHAIN_ID);
  if (!SHA.test(decision.releaseCommitSha ?? "")) {
    fail("invalid_m2a008_decision", "releaseCommitSha is invalid");
  }
  if (expectedCommitSha !== undefined) {
    exactValue("releaseCommitSha", decision.releaseCommitSha, expectedCommitSha);
  }
  if (!APPROVAL_REF.test(decision.deploymentApprovalRef ?? "")) {
    fail("invalid_m2a008_decision", "deploymentApprovalRef is invalid");
  }
  if (!SHA256.test(decision.launchEvidenceSha256 ?? "")) {
    fail("invalid_m2a008_decision", "launchEvidenceSha256 is invalid");
  }

  const nowMs = clock().getTime();
  if (!Number.isFinite(nowMs)) {
    fail("invalid_m2a008_preflight", "clock returned an invalid date");
  }
  const approvedAtMs = exactTimestamp("approvedAt", decision.approvedAt);
  const approvalExpiresAtMs = exactTimestamp(
    "approvalExpiresAt",
    decision.approvalExpiresAt
  );
  if (
    approvedAtMs > nowMs + 5 * 60 * 1000 ||
    approvedAtMs < nowMs - MAXIMUM_APPROVAL_AGE_MS ||
    approvalExpiresAtMs <= nowMs ||
    approvalExpiresAtMs > approvedAtMs + MAXIMUM_APPROVAL_AGE_MS
  ) {
    fail(
      "m2a008_approval_expired",
      "the one-use approval is stale, future-dated, expired, or too broad"
    );
  }

  const addresses = exactObject("addresses", decision.addresses, ADDRESS_KEYS);
  exactValue("wethCollateral", addresses.wethCollateral, M2A008_WETH);
  exactValue("testUsdcDebt", addresses.testUsdcDebt, M2A008_TEST_USDC);
  exactValue("priceFeed", addresses.priceFeed, M2A008_ETH_USD_FEED);
  const deployer = exactAddress("deployer", addresses.deployer);
  const expectedOracleAdapter = exactAddress(
    "expectedOracleAdapter",
    addresses.expectedOracleAdapter
  );
  const expectedPool = exactAddress("expectedPool", addresses.expectedPool);
  const pauseGuardian = exactAddress("pauseGuardian", addresses.pauseGuardian);
  const recoveryAuthority = exactAddress(
    "recoveryAuthority",
    addresses.recoveryAuthority
  );

  const signer = exactObject("signer", decision.signer, SIGNER_KEYS);
  if (
    typeof signer.keyFile !== "string" ||
    !signer.keyFile.startsWith(DECISION_DIRECTORY) ||
    !/^[A-Za-z0-9._-]+\.key$/.test(signer.keyFile.slice(DECISION_DIRECTORY.length))
  ) {
    fail("invalid_m2a008_decision", "signer.keyFile must use the isolated M2A-008 directory");
  }
  exactValue(
    "signer.purpose",
    signer.purpose,
    "M2A-008 exact Base Sepolia deployment only"
  );
  if (
    !Number.isSafeInteger(signer.startingNonce) ||
    signer.startingNonce < 0 ||
    signer.priorSignerReuse !== false ||
    signer.destroyAfterRun !== true
  ) {
    fail("invalid_m2a008_decision", "signer lifecycle is not exact and one-use");
  }
  const derivedOracle = getContractAddress({
    from: deployer,
    nonce: BigInt(signer.startingNonce)
  });
  const derivedPool = getContractAddress({
    from: deployer,
    nonce: BigInt(signer.startingNonce + 1)
  });
  exactValue("expectedOracleAdapter", expectedOracleAdapter, derivedOracle);
  exactValue("expectedPool", expectedPool, derivedPool);

  const excludedRoleAddresses = new Set([
    deployer.toLowerCase(),
    M2A008_WETH.toLowerCase(),
    M2A008_TEST_USDC.toLowerCase(),
    M2A008_ETH_USD_FEED.toLowerCase(),
    expectedOracleAdapter.toLowerCase(),
    expectedPool.toLowerCase()
  ]);
  if (
    pauseGuardian === recoveryAuthority ||
    excludedRoleAddresses.has(pauseGuardian.toLowerCase()) ||
    excludedRoleAddresses.has(recoveryAuthority.toLowerCase())
  ) {
    fail(
      "invalid_m2a008_decision",
      "pause and recovery roles must be distinct from each other and deployment identities"
    );
  }

  const risk = exactObject("risk", decision.risk, RISK_KEYS);
  const marketDebtCapAssets = positiveIntegerString(
    "marketDebtCapAssets",
    risk.marketDebtCapAssets,
    1_000_000_000_000n
  );
  const borrowerDebtCapAssets = positiveIntegerString(
    "borrowerDebtCapAssets",
    risk.borrowerDebtCapAssets,
    marketDebtCapAssets
  );
  if (
    borrowerDebtCapAssets > marketDebtCapAssets ||
    !Number.isInteger(risk.loanToValueBps) ||
    risk.loanToValueBps < 1 ||
    risk.loanToValueBps >= 8_000
  ) {
    fail("invalid_m2a008_decision", "risk caps or LTV are outside the contract boundary");
  }

  const oracle = exactObject("oracle", decision.oracle, ORACLE_KEYS);
  if (!HASH.test(oracle.sourceId ?? "") || /^0x0{64}$/.test(oracle.sourceId)) {
    fail("invalid_m2a008_decision", "oracle.sourceId must be one non-zero exact hash");
  }
  exactValue("oracle.sourceLabel", oracle.sourceLabel, M2A008_ORACLE_SOURCE_LABEL);
  exactValue("oracle.feedDecimals", oracle.feedDecimals, 8);
  exactValue("oracle.maximumAgeSeconds", oracle.maximumAgeSeconds, 3_600);

  const transactionCaps = exactObject(
    "transactionCaps",
    decision.transactionCaps,
    TRANSACTION_CAP_KEYS
  );
  exactValue("transactionCaps.deploymentCount", transactionCaps.deploymentCount, 2);
  exactValue("transactionCaps.nativeValueWei", transactionCaps.nativeValueWei, "0");
  const expectedStartingBalanceWei = positiveIntegerString(
    "expectedStartingBalanceWei",
    transactionCaps.expectedStartingBalanceWei,
    MAXIMUM_FAUCET_BALANCE_WEI
  );
  const maximumFaucetBalanceWei = positiveIntegerString(
    "maximumFaucetBalanceWei",
    transactionCaps.maximumFaucetBalanceWei,
    MAXIMUM_FAUCET_BALANCE_WEI
  );
  if (expectedStartingBalanceWei > maximumFaucetBalanceWei) {
    fail(
      "invalid_m2a008_decision",
      "expected signer balance exceeds the approved faucet ceiling"
    );
  }
  positiveIntegerString(
    "maximumTotalGasCostWei",
    transactionCaps.maximumTotalGasCostWei,
    MAXIMUM_TOTAL_GAS_COST_WEI
  );

  exactValue("deploymentAuthorized", decision.deploymentAuthorized, true);
  exactValue("testAssetsOnly", decision.testAssetsOnly, true);
  exactValue("mainnetAuthorized", decision.mainnetAuthorized, false);
  exactValue("realFundsAuthorized", decision.realFundsAuthorized, false);

  return Object.freeze({
    schemaVersion: "m2a_008_exact_deployment_preflight.v1",
    status: "decision_valid",
    decisionId: decision.decisionId,
    decisionHash: hashId("m2a_008_exact_deployment_decision", decision),
    chainId: M2A008_CHAIN_ID,
    releaseCommitSha: decision.releaseCommitSha,
    expectedOracleAdapter: derivedOracle,
    expectedPool: derivedPool,
    pauseGuardian,
    recoveryAuthority,
    startingNonce: signer.startingNonce,
    expectedStartingBalanceWei: expectedStartingBalanceWei.toString(),
    deploymentCount: 2,
    nativeValueWei: "0",
    testAssetsOnly: true,
    mainnetAuthorized: false,
    realFundsAuthorized: false,
    signerKeyMaterialIncluded: false,
    transactionSigned: false,
    transactionBroadcast: false
  });
}

export function assessM2A008LaunchPolicy(policy) {
  const validated = validateLaunchPolicy(policy);
  const profile = validated.profiles[PROFILE_ID];
  const blockers = [];
  if (profile.releaseEnabled !== true) blockers.push("launch_profile_disabled");
  if (profile.exactProfile === null) blockers.push("exact_profile_missing");
  if (profile.unlockRequirements.length > 0) blockers.push("unlock_requirements_open");
  return Object.freeze({
    profile: PROFILE_ID,
    releaseEnabled: profile.releaseEnabled,
    exactProfilePresent: profile.exactProfile !== null,
    requiredGateIds: Object.freeze(profile.gates.map(({ id }) => id)),
    blockers: Object.freeze(blockers),
    ready: blockers.length === 0
  });
}

function clientFor(url) {
  return createPublicClient({
    transport: http(url, { retryCount: 0, timeout: 10_000 })
  });
}

async function inspectRpc(url, now) {
  const client = clientFor(url);
  const [
    chainId,
    blockNumber,
    wethCode,
    usdcCode,
    feedCode,
    wethDecimals,
    wethSymbol,
    usdcDecimals,
    usdcSymbol,
    feedDecimals,
    round
  ] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getCode({ address: M2A008_WETH }),
    client.getCode({ address: M2A008_TEST_USDC }),
    client.getCode({ address: M2A008_ETH_USD_FEED }),
    client.readContract({ address: M2A008_WETH, abi: TOKEN_ABI, functionName: "decimals" }),
    client.readContract({ address: M2A008_WETH, abi: TOKEN_ABI, functionName: "symbol" }),
    client.readContract({ address: M2A008_TEST_USDC, abi: TOKEN_ABI, functionName: "decimals" }),
    client.readContract({ address: M2A008_TEST_USDC, abi: TOKEN_ABI, functionName: "symbol" }),
    client.readContract({ address: M2A008_ETH_USD_FEED, abi: FEED_ABI, functionName: "decimals" }),
    client.readContract({ address: M2A008_ETH_USD_FEED, abi: FEED_ABI, functionName: "latestRoundData" })
  ]);
  const updatedAtMs = Number(round[3]) * 1_000;
  return Object.freeze({
    host: new URL(url).host,
    chainId,
    blockNumber: blockNumber.toString(),
    codeHashes: Object.freeze({
      weth: wethCode && wethCode !== "0x" ? keccak256(wethCode) : null,
      testUsdc: usdcCode && usdcCode !== "0x" ? keccak256(usdcCode) : null,
      priceFeed: feedCode && feedCode !== "0x" ? keccak256(feedCode) : null
    }),
    tokens: Object.freeze({
      weth: Object.freeze({ decimals: wethDecimals, symbol: wethSymbol }),
      testUsdc: Object.freeze({ decimals: usdcDecimals, symbol: usdcSymbol })
    }),
    priceFeed: Object.freeze({
      decimals: feedDecimals,
      roundId: round[0].toString(),
      answer: round[1].toString(),
      updatedAt: new Date(updatedAtMs).toISOString(),
      answeredInRound: round[4].toString(),
      ageSeconds: Math.max(0, Math.floor((now.getTime() - updatedAtMs) / 1_000))
    })
  });
}

export async function inspectM2A008ReadOnlyDependencies({
  primaryRpcUrl,
  secondaryRpcUrl,
  clock = () => new Date()
}) {
  if (
    typeof primaryRpcUrl !== "string" ||
    typeof secondaryRpcUrl !== "string" ||
    primaryRpcUrl === secondaryRpcUrl
  ) {
    fail("invalid_m2a008_read_only_rpc", "two distinct read-only RPC URLs are required");
  }
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail("invalid_m2a008_preflight", "clock returned an invalid date");
  }
  const observations = await Promise.all([
    inspectRpc(primaryRpcUrl, now),
    inspectRpc(secondaryRpcUrl, now)
  ]);
  const blockers = [];
  for (const observation of observations) {
    if (observation.chainId !== M2A008_NUMERIC_CHAIN_ID) blockers.push("rpc_chain_mismatch");
    if (Object.values(observation.codeHashes).some((value) => value === null)) {
      blockers.push("dependency_code_missing");
    }
    if (
      observation.tokens.weth.decimals !== 18 ||
      observation.tokens.weth.symbol !== "WETH" ||
      observation.tokens.testUsdc.decimals !== 6 ||
      observation.tokens.testUsdc.symbol !== "USDC"
    ) {
      blockers.push("asset_metadata_mismatch");
    }
    if (
      observation.priceFeed.decimals !== 8 ||
      BigInt(observation.priceFeed.answer) <= 0n ||
      BigInt(observation.priceFeed.answeredInRound) < BigInt(observation.priceFeed.roundId) ||
      observation.priceFeed.ageSeconds > 3_600
    ) {
      blockers.push("oracle_observation_invalid_or_stale");
    }
  }
  const [first, second] = observations;
  if (
    JSON.stringify(first.codeHashes) !== JSON.stringify(second.codeHashes) ||
    first.priceFeed.roundId !== second.priceFeed.roundId ||
    first.priceFeed.answer !== second.priceFeed.answer ||
    first.priceFeed.updatedAt !== second.priceFeed.updatedAt
  ) {
    blockers.push("independent_rpc_disagreement");
  }
  return Object.freeze({
    schemaVersion: "m2a_008_read_only_dependency_inspection.v1",
    observedAt: now.toISOString(),
    discoveryOnly: true,
    approvedDeploymentRpc: false,
    transactionPrimitivePresent: false,
    observations: Object.freeze(observations),
    blockers: Object.freeze([...new Set(blockers)]),
    passed: blockers.length === 0
  });
}

export async function readM2A008ExactDecision(path) {
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    !resolve(path).startsWith(DECISION_DIRECTORY)
  ) {
    fail(
      "invalid_m2a008_decision_file",
      "decision file must be an absolute path below /private/tmp/ipo-one-m2a-008"
    );
  }
  const stats = await lstat(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600 ||
    stats.size < 2 ||
    stats.size > MAXIMUM_DECISION_BYTES
  ) {
    fail(
      "invalid_m2a008_decision_file",
      "decision file must be one bounded mode-0600 regular file"
    );
  }
  try {
    return parseStrictJson(await readFile(path, "utf8"), {
      maximumBytes: MAXIMUM_DECISION_BYTES,
      maximumDepth: 8,
      maximumKeys: 128
    });
  } catch {
    fail(
      "invalid_m2a008_decision_file",
      "decision file must contain one bounded strict JSON object"
    );
  }
}

async function loadPolicy() {
  const text = await readFile(
    new URL("../launch-policy.v1.json", import.meta.url),
    "utf8"
  );
  return parseCanonicalJson(text, "M2A-008 launch policy");
}

function cliArguments(argv) {
  if (argv.length === 1 && argv[0] === "--inspect") {
    return Object.freeze({ mode: "inspect" });
  }
  if (
    argv.length === 2 &&
    argv[0] === "--decision-file" &&
    typeof argv[1] === "string"
  ) {
    return Object.freeze({ mode: "decision", decisionFile: argv[1] });
  }
  fail(
    "invalid_m2a008_preflight_arguments",
    "use --inspect or --decision-file with one absolute mode-0600 JSON path"
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = cliArguments(process.argv.slice(2));
  const policy = assessM2A008LaunchPolicy(await loadPolicy());
  const inspection = await inspectM2A008ReadOnlyDependencies({
    primaryRpcUrl: "https://sepolia.base.org",
    secondaryRpcUrl: "https://base-sepolia-rpc.publicnode.com"
  });
  const blockers = [...policy.blockers];
  let decision;
  if (args.mode === "decision") {
    const input = await readM2A008ExactDecision(args.decisionFile);
    decision = validateM2A008ExactDecision(input, {
      expectedCommitSha: process.env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA
    });
    blockers.push("private_launch_gate_evidence_not_verified_by_this_command");
  } else {
    blockers.push(
      "exact_decision_missing",
      "independent_contract_review_missing",
      "risk_and_role_approval_missing",
      "fresh_one_use_signer_missing",
      "private_launch_gate_evidence_missing"
    );
  }
  if (!inspection.passed) blockers.push(...inspection.blockers);
  const uniqueBlockers = [...new Set(blockers)];
  const result = {
    schemaVersion: "m2a_008_preflight_report.v1",
    status: uniqueBlockers.length === 0 ? "READY" : "BLOCKED",
    issue: "M2A-008",
    chainId: M2A008_CHAIN_ID,
    policy,
    inspection,
    ...(decision ? { decision } : {}),
    blockers: uniqueBlockers,
    transactionSigned: false,
    transactionBroadcast: false,
    realFundsMoved: false
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (uniqueBlockers.length > 0) process.exitCode = 2;
}
