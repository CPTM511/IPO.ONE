import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeDeployData,
  getAddress,
  http,
  keccak256
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  parseCanonicalJson,
  validateLaunchPolicy,
  verifyLaunchEvidence
} from "../../packages/release-governance/src/index.js";
import {
  M2A008_CHAIN_ID,
  M2A008_ETH_USD_FEED,
  M2A008_NUMERIC_CHAIN_ID,
  M2A008_ORACLE_SOURCE_LABEL,
  M2A008_TEST_USDC,
  M2A008_WETH,
  inspectM2A008ReadOnlyDependencies,
  readM2A008ExactDecision,
  validateM2A008ExactDecision
} from "./m2a-008-secured-pool-preflight.mjs";
import {
  destroyEphemeralTestnetKey,
  readEphemeralTestnetKey
} from "./ephemeral-key.mjs";

const PROFILE_ID = "live_testnet_secured_pool";
const PRIMARY_RPC_URL = "https://sepolia.base.org";
const SECONDARY_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
const PRIVATE_DIRECTORY = "/private/tmp/ipo-one-m2a-008";
const MAXIMUM_PRIVATE_FILE_BYTES = 128 * 1024;
const MAXIMUM_DEPLOY_GAS = 12_000_000n;
const RECEIPT_TIMEOUT_MS = 120_000;
const FINALITY_TIMEOUT_MS = 30 * 60_000;
const SOURCE_ID = keccak256(new TextEncoder().encode(M2A008_ORACLE_SOURCE_LABEL));
const HASH = /^0x[0-9a-f]{64}$/;

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function chainFor(rpcUrl) {
  return defineChain({
    id: M2A008_NUMERIC_CHAIN_ID,
    name: "Base Sepolia",
    nativeCurrency: { name: "Base Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: {
      default: { name: "BaseScan Sepolia", url: "https://sepolia.basescan.org" }
    },
    testnet: true
  });
}

function publicClientFor(rpcUrl) {
  return createPublicClient({
    chain: chainFor(rpcUrl),
    transport: http(rpcUrl, { retryCount: 0, timeout: 10_000 })
  });
}

async function readOwnerOnlyFile(path, label) {
  const absolute = resolve(path);
  const stats = await lstat(absolute);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600 ||
    stats.size < 2 ||
    stats.size > MAXIMUM_PRIVATE_FILE_BYTES
  ) {
    fail("invalid_m2a008_private_file", `${label} must be one bounded mode-0600 regular file`);
  }
  return readFile(absolute, "utf8");
}

async function loadArtifacts() {
  const [adapter, pool] = await Promise.all([
    readFile(
      new URL("../../out/foundry/IpoOnePriceOracleAdapterV1.sol/IpoOnePriceOracleAdapterV1.json", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../../out/foundry/IpoOneSecuredPoolV1.sol/IpoOneSecuredPoolV1.json", import.meta.url),
      "utf8"
    )
  ]);
  const parsed = {
    adapter: JSON.parse(adapter),
    pool: JSON.parse(pool)
  };
  for (const [name, artifact] of Object.entries(parsed)) {
    if (
      !Array.isArray(artifact.abi) ||
      !/^0x[0-9a-f]+$/.test(artifact.bytecode?.object ?? "") ||
      !/^0x[0-9a-f]+$/.test(artifact.deployedBytecode?.object ?? "")
    ) {
      fail("invalid_m2a008_contract_artifact", `${name} Foundry artifact is missing closed bytecode`);
    }
  }
  return parsed;
}

export function m2a008ConfigurationHash(decision) {
  return keccak256(encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint16" },
      { type: "address" },
      { type: "address" }
    ],
    [
      BigInt(M2A008_NUMERIC_CHAIN_ID),
      decision.addresses.testUsdcDebt,
      decision.addresses.wethCollateral,
      decision.addresses.priceFeed,
      decision.addresses.expectedOracleAdapter,
      decision.oracle.sourceId,
      BigInt(decision.risk.marketDebtCapAssets),
      BigInt(decision.risk.borrowerDebtCapAssets),
      decision.risk.loanToValueBps,
      decision.addresses.pauseGuardian,
      decision.addresses.recoveryAuthority
    ]
  ));
}

export function buildM2A008DeploymentPlan(decision, artifacts) {
  if (decision.oracle.sourceId !== SOURCE_ID) {
    fail("m2a008_oracle_source_drift", "decision sourceId does not match the admitted source label");
  }
  const adapterData = encodeDeployData({
    abi: artifacts.adapter.abi,
    bytecode: artifacts.adapter.bytecode.object,
    args: [
      BigInt(M2A008_NUMERIC_CHAIN_ID),
      M2A008_WETH,
      M2A008_ETH_USD_FEED,
      SOURCE_ID,
      8
    ]
  });
  const poolData = encodeDeployData({
    abi: artifacts.pool.abi,
    bytecode: artifacts.pool.bytecode.object,
    args: [[
      BigInt(M2A008_NUMERIC_CHAIN_ID),
      M2A008_TEST_USDC,
      M2A008_WETH,
      decision.addresses.expectedOracleAdapter,
      BigInt(decision.risk.marketDebtCapAssets),
      BigInt(decision.risk.borrowerDebtCapAssets),
      decision.risk.loanToValueBps,
      decision.addresses.pauseGuardian,
      decision.addresses.recoveryAuthority
    ]]
  });
  return Object.freeze({
    adapterData,
    poolData,
    adapterCreationBytecodeHash: keccak256(artifacts.adapter.bytecode.object),
    poolCreationBytecodeHash: keccak256(artifacts.pool.bytecode.object),
    configurationHash: m2a008ConfigurationHash(decision),
    transactionCount: 2,
    nativeValueWei: "0"
  });
}

export function assertM2A008PolicyBinding({ policy, decision, plan }) {
  const validated = validateLaunchPolicy(policy);
  const profile = validated.profiles[PROFILE_ID];
  const exact = profile.exactProfile;
  if (
    profile.releaseEnabled !== true ||
    profile.unlockRequirements.length !== 0 ||
    !exact ||
    exact.chainId !== M2A008_CHAIN_ID ||
    getAddress(exact.poolContract) !== getAddress(decision.addresses.expectedPool) ||
    getAddress(exact.oracleAddress) !== getAddress(decision.addresses.expectedOracleAdapter) ||
    exact.wethCollateral !== M2A008_WETH ||
    exact.testUsdcDebt !== M2A008_TEST_USDC ||
    exact.oracleSource !== M2A008_ORACLE_SOURCE_LABEL ||
    exact.adapterVersion !== "IpoOnePriceOracleAdapterV1" ||
    exact.marketCount !== 1 ||
    exact.deploymentApprovalRef !== decision.deploymentApprovalRef ||
    exact.configurationHash !== plan.configurationHash ||
    exact.realValueClassification !== "test_assets_only" ||
    !HASH.test(exact.poolBytecodeHash)
  ) {
    fail("m2a008_launch_policy_binding_invalid", "enabled launch profile does not exactly bind the deployment decision");
  }
  return profile;
}

export function assertM2A008GasAndBalance({
  balance,
  expectedBalance,
  maximumBalance,
  maximumFeePerGas,
  maximumTotalGasCost
}) {
  const maximumCost = MAXIMUM_DEPLOY_GAS * maximumFeePerGas;
  if (
    balance !== expectedBalance ||
    balance > maximumBalance ||
    maximumFeePerGas <= 0n ||
    maximumCost > maximumTotalGasCost ||
    balance < maximumCost
  ) {
    fail("m2a008_gas_or_balance_boundary_invalid", "signer balance or worst-case deployment gas is outside the exact decision");
  }
  return maximumCost;
}

export function assertM2A008DeploymentReceipt({
  transaction,
  receipt,
  expectedSender,
  expectedNonce,
  expectedData,
  expectedContract
}) {
  if (
    !transaction ||
    !receipt ||
    getAddress(transaction.from) !== getAddress(expectedSender) ||
    transaction.to !== null ||
    transaction.chainId !== M2A008_NUMERIC_CHAIN_ID ||
    transaction.nonce !== expectedNonce ||
    transaction.value !== 0n ||
    transaction.input !== expectedData ||
    receipt.transactionHash !== transaction.hash ||
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    getAddress(receipt.contractAddress) !== getAddress(expectedContract) ||
    receipt.blockNumber !== transaction.blockNumber ||
    receipt.blockHash !== transaction.blockHash
  ) {
    fail("m2a008_deployment_receipt_invalid", "deployment transaction or receipt drifted from the exact decision");
  }
  return true;
}

async function loadClosedInputs({ decisionFile, launchEvidenceFile, expectedCommitSha }) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommitSha ?? "")) {
    fail("invalid_m2a008_release_sha", "one exact lowercase release commit SHA is required");
  }
  const [decisionInput, policyText, evidenceText, artifacts] = await Promise.all([
    readM2A008ExactDecision(decisionFile),
    readFile(new URL("../launch-policy.v1.json", import.meta.url), "utf8"),
    readOwnerOnlyFile(launchEvidenceFile, "launch evidence"),
    loadArtifacts()
  ]);
  const decision = validateM2A008ExactDecision(decisionInput, { expectedCommitSha });
  const policy = parseCanonicalJson(policyText, "M2A-008 launch policy");
  const evidence = parseCanonicalJson(evidenceText, "M2A-008 launch evidence");
  const evidenceHash = `sha256:${createHash("sha256").update(evidenceText).digest("hex")}`;
  if (evidenceHash !== decisionInput.launchEvidenceSha256) {
    fail("m2a008_launch_evidence_hash_mismatch", "private launch Evidence is not the decision-bound file");
  }
  const launchVerification = verifyLaunchEvidence(evidence, {
    policy,
    expectedProfile: PROFILE_ID,
    expectedCommitSha
  });
  const plan = buildM2A008DeploymentPlan(decisionInput, artifacts);
  const profile = assertM2A008PolicyBinding({ policy, decision: decisionInput, plan });
  return { artifacts, decision, decisionInput, evidenceHash, launchVerification, plan, profile };
}

export async function preflightM2A008Deployment(input) {
  const closed = await loadClosedInputs(input);
  const privateKey = await readEphemeralTestnetKey(closed.decisionInput.signer.keyFile);
  const account = privateKeyToAccount(privateKey);
  if (getAddress(account.address) !== getAddress(closed.decisionInput.addresses.deployer)) {
    fail("m2a008_signer_address_mismatch", "one-use key does not match the exact deployer");
  }
  const [inspection, primaryChainId, secondaryChainId] = await Promise.all([
    inspectM2A008ReadOnlyDependencies({
      primaryRpcUrl: PRIMARY_RPC_URL,
      secondaryRpcUrl: SECONDARY_RPC_URL
    }),
    publicClientFor(PRIMARY_RPC_URL).getChainId(),
    publicClientFor(SECONDARY_RPC_URL).getChainId()
  ]);
  if (!inspection.passed || primaryChainId !== M2A008_NUMERIC_CHAIN_ID || secondaryChainId !== M2A008_NUMERIC_CHAIN_ID) {
    fail("m2a008_dependency_preflight_failed", "two-RPC dependency inspection did not pass");
  }
  const primary = publicClientFor(PRIMARY_RPC_URL);
  const secondary = publicClientFor(SECONDARY_RPC_URL);
  const [balanceA, balanceB, nonceA, nonceB, adapterCodeA, adapterCodeB, poolCodeA, poolCodeB, fees] = await Promise.all([
    primary.getBalance({ address: account.address }),
    secondary.getBalance({ address: account.address }),
    primary.getTransactionCount({ address: account.address, blockTag: "pending" }),
    secondary.getTransactionCount({ address: account.address, blockTag: "pending" }),
    primary.getCode({ address: closed.decisionInput.addresses.expectedOracleAdapter }),
    secondary.getCode({ address: closed.decisionInput.addresses.expectedOracleAdapter }),
    primary.getCode({ address: closed.decisionInput.addresses.expectedPool }),
    secondary.getCode({ address: closed.decisionInput.addresses.expectedPool }),
    primary.estimateFeesPerGas()
  ]);
  if (
    balanceA !== balanceB ||
    nonceA !== nonceB ||
    nonceA !== closed.decisionInput.signer.startingNonce ||
    (adapterCodeA !== undefined && adapterCodeA !== "0x") ||
    (adapterCodeB !== undefined && adapterCodeB !== "0x") ||
    (poolCodeA !== undefined && poolCodeA !== "0x") ||
    (poolCodeB !== undefined && poolCodeB !== "0x")
  ) {
    fail("m2a008_live_state_drift", "RPC balance/nonce or predicted-address state disagrees with the decision");
  }
  const maximumFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? await primary.getGasPrice();
  const maximumGasCostWei = assertM2A008GasAndBalance({
    balance: balanceA,
    expectedBalance: BigInt(closed.decisionInput.transactionCaps.expectedStartingBalanceWei),
    maximumBalance: BigInt(closed.decisionInput.transactionCaps.maximumFaucetBalanceWei),
    maximumFeePerGas,
    maximumTotalGasCost: BigInt(closed.decisionInput.transactionCaps.maximumTotalGasCostWei)
  });
  return Object.freeze({
    ...closed,
    account,
    primary,
    secondary,
    maximumFeePerGas,
    maximumGasCostWei,
    observedBalanceWei: balanceA.toString(),
    observedNonce: nonceA,
    ready: true
  });
}

async function writePrivateJournal(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function waitForBothFinalized({ primary, secondary, receipts }) {
  const deadline = Date.now() + FINALITY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [primaryHead, secondaryHead] = await Promise.all([
      primary.getBlock({ blockTag: "finalized" }),
      secondary.getBlock({ blockTag: "finalized" })
    ]);
    if (receipts.every((receipt) => primaryHead.number >= receipt.blockNumber && secondaryHead.number >= receipt.blockNumber)) {
      for (const receipt of receipts) {
        const canonical = await primary.getBlock({ blockNumber: receipt.blockNumber });
        if (canonical.hash !== receipt.blockHash) {
          fail("m2a008_deployment_reorged", "a deployment receipt is no longer canonical");
        }
      }
      return { primaryHead, secondaryHead };
    }
    await delay(30_000);
  }
  fail("m2a008_finality_timeout", "both deployments did not reach two-RPC finalized heads");
}

async function observeAndAssertDeployment({ context, hash, nonce, data, contract }) {
  const [transaction, receipt] = await Promise.all([
    context.primary.getTransaction({ hash }),
    context.primary.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: RECEIPT_TIMEOUT_MS,
      pollingInterval: 1_000
    })
  ]);
  assertM2A008DeploymentReceipt({
    transaction,
    receipt,
    expectedSender: context.account.address,
    expectedNonce: nonce,
    expectedData: data,
    expectedContract: contract
  });
  return receipt;
}

async function assertFinalRuntime(context) {
  const { decisionInput, artifacts, profile } = context;
  const poolAddress = decisionInput.addresses.expectedPool;
  const adapterAddress = decisionInput.addresses.expectedOracleAdapter;
  const [adapterCodeA, adapterCodeB, poolCodeA, poolCodeB] = await Promise.all([
    context.primary.getCode({ address: adapterAddress, blockTag: "finalized" }),
    context.secondary.getCode({ address: adapterAddress, blockTag: "finalized" }),
    context.primary.getCode({ address: poolAddress, blockTag: "finalized" }),
    context.secondary.getCode({ address: poolAddress, blockTag: "finalized" })
  ]);
  if (
    !adapterCodeA || adapterCodeA !== adapterCodeB ||
    !poolCodeA || poolCodeA !== poolCodeB ||
    keccak256(poolCodeA) !== profile.exactProfile.poolBytecodeHash
  ) {
    fail("m2a008_runtime_bytecode_mismatch", "two-RPC finalized runtime bytecode does not match the exact profile");
  }
  const poolFunctions = [
    ["marketChainId"], ["debtAsset"], ["collateralAsset"], ["priceOracle"],
    ["oracleSourceId"], ["marketDebtCapAssets"], ["borrowerDebtCapAssets"],
    ["loanToValueBps"], ["pauseGuardian"], ["recoveryAuthority"], ["newRiskPaused"]
  ];
  const adapterFunctions = [
    ["marketChainId"], ["asset"], ["feed"], ["sourceId"],
    ["feedDecimals"], ["normalizationFactor"]
  ];
  const readAll = (client, address, abi, functions) => Promise.all(
    functions.map(([functionName]) => client.readContract({ address, abi, functionName }))
  );
  const [reads, secondaryReads, adapterReads, secondaryAdapterReads] = await Promise.all([
    readAll(context.primary, poolAddress, artifacts.pool.abi, poolFunctions),
    readAll(context.secondary, poolAddress, artifacts.pool.abi, poolFunctions),
    readAll(context.primary, adapterAddress, artifacts.adapter.abi, adapterFunctions),
    readAll(context.secondary, adapterAddress, artifacts.adapter.abi, adapterFunctions)
  ]);
  const expected = [
    BigInt(M2A008_NUMERIC_CHAIN_ID), M2A008_TEST_USDC, M2A008_WETH, adapterAddress,
    SOURCE_ID, BigInt(decisionInput.risk.marketDebtCapAssets),
    BigInt(decisionInput.risk.borrowerDebtCapAssets), decisionInput.risk.loanToValueBps,
    decisionInput.addresses.pauseGuardian, decisionInput.addresses.recoveryAuthority, false
  ];
  if (reads.some((value, index) => typeof value === "string"
    ? value.toLowerCase() !== String(expected[index]).toLowerCase()
    : value !== expected[index]) ||
    reads.some((value, index) => value !== secondaryReads[index])) {
    fail("m2a008_runtime_configuration_mismatch", "finalized pool configuration drifted from the exact decision");
  }
  const expectedAdapter = [
    BigInt(M2A008_NUMERIC_CHAIN_ID), M2A008_WETH, M2A008_ETH_USD_FEED,
    SOURCE_ID, 8, 10_000_000_000n
  ];
  if (adapterReads.some((value, index) => typeof value === "string"
    ? value.toLowerCase() !== String(expectedAdapter[index]).toLowerCase()
    : value !== expectedAdapter[index]) ||
    adapterReads.some((value, index) => value !== secondaryAdapterReads[index])) {
    fail("m2a008_runtime_adapter_mismatch", "finalized oracle adapter configuration drifted from the exact decision");
  }
  return {
    adapterRuntimeBytecodeHash: keccak256(adapterCodeA),
    poolRuntimeBytecodeHash: keccak256(poolCodeA)
  };
}

export async function reconcileM2A008Deployment(input) {
  if (
    !HASH.test(input.adapterTransactionHash ?? "") ||
    !HASH.test(input.poolTransactionHash ?? "")
  ) {
    fail("invalid_m2a008_reconciliation_hash", "two exact lowercase deployment transaction hashes are required");
  }
  const closed = await loadClosedInputs(input);
  const context = {
    ...closed,
    primary: publicClientFor(PRIMARY_RPC_URL),
    secondary: publicClientFor(SECONDARY_RPC_URL)
  };
  const [adapterTransaction, adapterReceipt, poolTransaction, poolReceipt] = await Promise.all([
    context.primary.getTransaction({ hash: input.adapterTransactionHash }),
    context.primary.getTransactionReceipt({ hash: input.adapterTransactionHash }),
    context.primary.getTransaction({ hash: input.poolTransactionHash }),
    context.primary.getTransactionReceipt({ hash: input.poolTransactionHash })
  ]);
  assertM2A008DeploymentReceipt({
    transaction: adapterTransaction,
    receipt: adapterReceipt,
    expectedSender: closed.decisionInput.addresses.deployer,
    expectedNonce: closed.decisionInput.signer.startingNonce,
    expectedData: closed.plan.adapterData,
    expectedContract: closed.decisionInput.addresses.expectedOracleAdapter
  });
  assertM2A008DeploymentReceipt({
    transaction: poolTransaction,
    receipt: poolReceipt,
    expectedSender: closed.decisionInput.addresses.deployer,
    expectedNonce: closed.decisionInput.signer.startingNonce + 1,
    expectedData: closed.plan.poolData,
    expectedContract: closed.decisionInput.addresses.expectedPool
  });
  const finalized = await waitForBothFinalized({
    primary: context.primary,
    secondary: context.secondary,
    receipts: [adapterReceipt, poolReceipt]
  });
  const runtime = await assertFinalRuntime(context);
  const evidence = {
    schemaVersion: "m2a_008_base_sepolia_deployment_reconciliation.v1",
    decisionId: closed.decisionInput.decisionId,
    decisionHash: closed.decision.decisionHash,
    releaseCommitSha: closed.decisionInput.releaseCommitSha,
    chainId: M2A008_CHAIN_ID,
    adapterTransactionHash: input.adapterTransactionHash,
    poolTransactionHash: input.poolTransactionHash,
    adapterBlockNumber: adapterReceipt.blockNumber.toString(),
    poolBlockNumber: poolReceipt.blockNumber.toString(),
    primaryFinalizedHead: finalized.primaryHead.number.toString(),
    secondaryFinalizedHead: finalized.secondaryHead.number.toString(),
    configurationHash: closed.plan.configurationHash,
    ...runtime,
    observedThroughRpcCount: 2,
    discrepancyCount: 0,
    transactionPrimitivePresent: false,
    testAssetsOnly: true,
    productionFundsMoved: false,
    privateKeyIncluded: false
  };
  const artifactPath = resolve(
    "artifacts/testnet",
    `eip155-84532-m2a-008-${closed.decisionInput.decisionId.toLowerCase()}-reconciled.json`
  );
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
  return Object.freeze({ ...evidence, artifactPath, status: "RECONCILED" });
}

export async function deployM2A008SecuredPool(input) {
  const context = await preflightM2A008Deployment(input);
  const journalPath = `${PRIVATE_DIRECTORY}/${context.decisionInput.decisionId}.journal.json`;
  const wallet = createWalletClient({
    account: context.account,
    chain: chainFor(PRIMARY_RPC_URL),
    transport: http(PRIMARY_RPC_URL, { retryCount: 0, timeout: 10_000 })
  });
  const journal = {
    schemaVersion: "m2a_008_deployment_journal.v1",
    decisionId: context.decisionInput.decisionId,
    deployerAddress: context.account.address,
    startedAt: new Date().toISOString(),
    adapterTransactionHash: null,
    poolTransactionHash: null,
    terminal: false
  };
  let transactionAttempted = false;
  try {
    transactionAttempted = true;
    journal.adapterTransactionHash = await wallet.sendTransaction({
      account: context.account,
      chain: chainFor(PRIMARY_RPC_URL),
      data: context.plan.adapterData,
      value: 0n,
      nonce: context.decisionInput.signer.startingNonce,
      gas: 4_000_000n,
      maxFeePerGas: context.maximumFeePerGas
    });
    await writePrivateJournal(journalPath, journal);
    const adapterReceipt = await observeAndAssertDeployment({
      context,
      hash: journal.adapterTransactionHash,
      nonce: context.decisionInput.signer.startingNonce,
      data: context.plan.adapterData,
      contract: context.decisionInput.addresses.expectedOracleAdapter
    });
    const poolGas = await context.primary.estimateGas({
      account: context.account.address,
      data: context.plan.poolData,
      value: 0n
    });
    if (poolGas <= 0n || poolGas > 8_000_000n) {
      fail("m2a008_pool_gas_cap_exceeded", "pool deployment estimate exceeds the closed gas limit");
    }
    journal.poolTransactionHash = await wallet.sendTransaction({
      account: context.account,
      chain: chainFor(PRIMARY_RPC_URL),
      data: context.plan.poolData,
      value: 0n,
      nonce: context.decisionInput.signer.startingNonce + 1,
      gas: poolGas,
      maxFeePerGas: context.maximumFeePerGas
    });
    await writePrivateJournal(journalPath, journal);
    const poolReceipt = await observeAndAssertDeployment({
      context,
      hash: journal.poolTransactionHash,
      nonce: context.decisionInput.signer.startingNonce + 1,
      data: context.plan.poolData,
      contract: context.decisionInput.addresses.expectedPool
    });
    const finalized = await waitForBothFinalized({
      primary: context.primary,
      secondary: context.secondary,
      receipts: [adapterReceipt, poolReceipt]
    });
    const runtime = await assertFinalRuntime(context);
    const artifact = {
      schemaVersion: "m2a_008_base_sepolia_deployment_evidence.v1",
      decisionId: context.decisionInput.decisionId,
      decisionHash: context.decision.decisionHash,
      launchEvidenceSha256: context.evidenceHash,
      releaseCommitSha: context.decisionInput.releaseCommitSha,
      chainId: M2A008_CHAIN_ID,
      testAssetsOnly: true,
      mainnetAuthorized: false,
      realFundsAuthorized: false,
      deployerAddress: context.account.address,
      oracleAdapterAddress: context.decisionInput.addresses.expectedOracleAdapter,
      poolAddress: context.decisionInput.addresses.expectedPool,
      adapterTransactionHash: journal.adapterTransactionHash,
      poolTransactionHash: journal.poolTransactionHash,
      adapterBlockNumber: adapterReceipt.blockNumber.toString(),
      poolBlockNumber: poolReceipt.blockNumber.toString(),
      primaryFinalizedHead: finalized.primaryHead.number.toString(),
      secondaryFinalizedHead: finalized.secondaryHead.number.toString(),
      configurationHash: context.plan.configurationHash,
      ...runtime,
      observedThroughRpcCount: 2,
      sourceExplorerVerification: "PENDING_SEPARATE_EXPLORER_CONFIRMATION",
      indexerReconciliation: "PENDING_SEPARATE_FINALIZED_INGESTION",
      browserAcceptance: "PENDING_EXACT_DEPLOYED_SHA",
      productionFundsMoved: false,
      privateKeyIncluded: false
    };
    const artifactPath = resolve(
      "artifacts/testnet",
      `eip155-84532-m2a-008-${context.decisionInput.decisionId.toLowerCase()}.json`
    );
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    journal.terminal = true;
    journal.terminalStatus = "DEPLOYED_PENDING_PRODUCT_VERIFICATION";
    await writePrivateJournal(journalPath, journal);
    const destruction = await destroyEphemeralTestnetKey(context.decisionInput.signer.keyFile);
    return Object.freeze({
      ...artifact,
      artifactPath,
      signerLogicallyDestroyed: destruction.logicallyDestroyed,
      status: "DEPLOYED_PENDING_PRODUCT_VERIFICATION"
    });
  } catch (error) {
    journal.terminal = true;
    journal.terminalStatus = "FAILED_OR_UNKNOWN_READ_ONLY_RECONCILIATION_REQUIRED";
    journal.errorCode = error?.code ?? "m2a008_unknown_failure";
    await writePrivateJournal(journalPath, journal);
    if (transactionAttempted) {
      await destroyEphemeralTestnetKey(context.decisionInput.signer.keyFile);
    }
    throw error;
  }
}

function argumentsFromEnvironment(env = process.env) {
  if (
    env.IPO_ONE_M2A008_MODE !== "deploy" ||
    env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY !== "M2A-008" ||
    !env.IPO_ONE_M2A008_DECISION_FILE?.startsWith(`${PRIVATE_DIRECTORY}/`) ||
    !env.IPO_ONE_M2A008_LAUNCH_EVIDENCE_FILE ||
    !/^[a-f0-9]{40}$/.test(env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA ?? "") ||
    env.CI === "true" ||
    env.GITHUB_ACTIONS === "true"
  ) {
    fail("invalid_m2a008_runner_environment", "closed local M2A-008 deploy environment is required");
  }
  return Object.freeze({
    decisionFile: env.IPO_ONE_M2A008_DECISION_FILE,
    launchEvidenceFile: env.IPO_ONE_M2A008_LAUNCH_EVIDENCE_FILE,
    expectedCommitSha: env.IPO_ONE_M2A008_EXPECTED_COMMIT_SHA
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await deployM2A008SecuredPool(argumentsFromEnvironment());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
