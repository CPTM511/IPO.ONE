import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../packages/domain/src/index.js";
import {
  createLiveTestnetObserver,
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../modules/event-indexer/src/index.js";
import { compileSandboxEvidenceEmitter } from "./compile-emitter.mjs";
import { destroyEphemeralTestnetKey, readEphemeralTestnetKey } from "./ephemeral-key.mjs";

const MAX_SINGLE_TRANSACTION_GAS_WEI = 5_000_000_000_000_000n;
const MAX_RUN_GAS_WEI = 10_000_000_000_000_000n;
const MAX_TRANSACTION_COUNT = 3;
const RECEIPT_TIMEOUT_MS = 120_000;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;

function fail(code, message) {
  throw new Error(`${code}: ${message}`);
}

function runtimeInput() {
  const input = {
    chainId: process.env.IPO_ONE_TESTNET_CHAIN_ID,
    providerSlot: process.env.IPO_ONE_TESTNET_PROVIDER_SLOT ?? "primary",
    keyFile: process.env.IPO_ONE_TESTNET_KEY_FILE,
    runId: process.env.IPO_ONE_TESTNET_RUN_ID,
    evidenceHash: process.env.IPO_ONE_TESTNET_EVIDENCE_HASH,
    obligationId: process.env.IPO_ONE_TESTNET_OBLIGATION_ID,
    paymentId: process.env.IPO_ONE_TESTNET_PAYMENT_ID,
    assetId: process.env.IPO_ONE_TESTNET_ASSET_ID ?? "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: process.env.IPO_ONE_TESTNET_AMOUNT_MINOR ?? "1"
  };
  if (
    process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY !== "CHAIN-001B" ||
    !new Set(["eip155:84532", "eip155:1952"]).has(input.chainId) ||
    !input.keyFile || !RUN_ID.test(input.runId ?? "") ||
    !HASH.test(input.evidenceHash ?? "") ||
    !IDENTIFIER.test(input.obligationId ?? "") ||
    !IDENTIFIER.test(input.paymentId ?? "") ||
    !IDENTIFIER.test(input.assetId ?? "") ||
    !/^[1-9][0-9]{0,5}$/.test(input.amountMinor)
  ) fail("invalid_testnet_run_config", "closed CHAIN-001B runtime configuration is required");
  return input;
}

function chainFor(config, rpcUrl) {
  return defineChain({
    id: config.numericChainId,
    name: config.profile.displayName,
    nativeCurrency: {
      name: config.chainId === "eip155:84532" ? "Base Sepolia ETH" : "X Layer Testnet OKB",
      symbol: config.chainId === "eip155:84532" ? "ETH" : "OKB",
      decimals: 18
    },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Testnet explorer", url: config.explorerBaseUrl } },
    testnet: true
  });
}

async function gasPriceFor(publicClient) {
  const fees = await publicClient.estimateFeesPerGas();
  return fees.maxFeePerGas ?? fees.gasPrice ?? await publicClient.getGasPrice();
}

function assertGasCap(gas, gasPrice, spent) {
  const maximum = gas * gasPrice;
  if (maximum > MAX_SINGLE_TRANSACTION_GAS_WEI || spent + maximum > MAX_RUN_GAS_WEI) {
    fail("testnet_gas_cap_exceeded", "estimated testnet gas exceeds the approved run cap");
  }
  return maximum;
}

async function wait(publicClient, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: RECEIPT_TIMEOUT_MS,
    pollingInterval: 1_000
  });
  if (receipt.status !== "success") fail("testnet_transaction_reverted", "testnet transaction reverted");
  return receipt;
}

const recoveryState = {
  contractAddress: undefined,
  deploymentTransactionHash: undefined,
  emissionTransactionHash: undefined,
  retirementTransactionHash: undefined,
  transactionCount: 0,
  keyLogicallyDestroyed: false,
  preDestructionReceiptPath: undefined
};

async function main() {
const input = runtimeInput();
const resolved = resolveApprovedRpc({ chainId: input.chainId, providerSlot: input.providerSlot });
const config = getLiveTestnetConfig(input.chainId);
const privateKey = await readEphemeralTestnetKey(input.keyFile);
const account = privateKeyToAccount(privateKey);
const chain = chainFor(config, resolved.rpcUrl);
const transport = http(resolved.rpcUrl, { retryCount: 0, timeout: 5_000 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });

if (await publicClient.getChainId() !== config.numericChainId) {
  fail("rpc_chain_id_mismatch", "wallet transport does not match the approved testnet");
}
const startingBalance = await publicClient.getBalance({ address: account.address });
if (startingBalance <= 0n) fail("testnet_deployer_unfunded", "ephemeral deployer needs faucet-only gas tokens");
if (startingBalance > BigInt(config.maxFaucetBalanceWei)) {
  fail("testnet_deployer_balance_cap_exceeded", "ephemeral deployer balance exceeds the approved faucet cap");
}

const artifact = await compileSandboxEvidenceEmitter();
const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
const expiresAt = nowSeconds + 7_200n;
const deploymentIdHash = hashId("testnet_deployment", { chainId: input.chainId, runId: input.runId });
const obligationHash = hashId("testnet_obligation_reference", { obligationId: input.obligationId });
const paymentHash = hashId("testnet_payment_reference", { paymentId: input.paymentId });
const runIdHash = hashId("testnet_run_id", { runId: input.runId });
const deployData = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [deploymentIdHash, expiresAt, 1]
});

let maximumGasCommitted = 0n;
let transactionCount = 0;
const gasPrice = await gasPriceFor(publicClient);
const deployGas = await publicClient.estimateGas({ account: account.address, data: deployData, value: 0n });
maximumGasCommitted += assertGasCap(deployGas, gasPrice, maximumGasCommitted);
const deploymentTransactionHash = await walletClient.deployContract({
  account,
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [deploymentIdHash, expiresAt, 1],
  value: 0n
});
transactionCount += 1;
recoveryState.deploymentTransactionHash = deploymentTransactionHash;
recoveryState.transactionCount = transactionCount;
const deploymentReceipt = await wait(publicClient, deploymentTransactionHash);
const contractAddress = deploymentReceipt.contractAddress;
if (!contractAddress) fail("testnet_deployment_failed", "deployment receipt has no contract address");
recoveryState.contractAddress = contractAddress;

const emissionArgs = [input.evidenceHash, obligationHash, paymentHash, runIdHash];
const emitGas = await publicClient.estimateContractGas({
  account: account.address,
  address: contractAddress,
  abi: artifact.abi,
  functionName: "emitEvidence",
  args: emissionArgs,
  value: 0n
});
maximumGasCommitted += assertGasCap(emitGas, gasPrice, maximumGasCommitted);
const emissionTransactionHash = await walletClient.writeContract({
  account,
  address: contractAddress,
  abi: artifact.abi,
  functionName: "emitEvidence",
  args: emissionArgs,
  value: 0n
});
transactionCount += 1;
recoveryState.emissionTransactionHash = emissionTransactionHash;
recoveryState.transactionCount = transactionCount;
const emissionReceipt = await wait(publicClient, emissionTransactionHash);

const observer = createLiveTestnetObserver({ chainId: input.chainId, providerSlot: input.providerSlot });
const liveEvidence = await observer.readEvidence({
  transactionHash: emissionTransactionHash,
  contractAddress,
  obligationId: input.obligationId,
  paymentId: input.paymentId,
  assetId: input.assetId,
  amountMinor: input.amountMinor,
  evidenceHash: input.evidenceHash,
  runId: input.runId
});

const retireGas = await publicClient.estimateContractGas({
  account: account.address,
  address: contractAddress,
  abi: artifact.abi,
  functionName: "retire",
  value: 0n
});
maximumGasCommitted += assertGasCap(retireGas, gasPrice, maximumGasCommitted);
const retirementTransactionHash = await walletClient.writeContract({
  account,
  address: contractAddress,
  abi: artifact.abi,
  functionName: "retire",
  value: 0n
});
transactionCount += 1;
recoveryState.retirementTransactionHash = retirementTransactionHash;
recoveryState.transactionCount = transactionCount;
const retirementReceipt = await wait(publicClient, retirementTransactionHash);
if (transactionCount !== MAX_TRANSACTION_COUNT) fail("testnet_transaction_count_mismatch", "one run must use exactly three transactions");
const retired = await publicClient.readContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "retired"
});
const emissionCount = await publicClient.readContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "emissionCount"
});
if (retired !== true || emissionCount !== 1) fail("testnet_retirement_unverified", "emitter retirement state is invalid");

const gasUsed = [deploymentReceipt, emissionReceipt, retirementReceipt]
  .reduce((total, receipt) => total + receipt.gasUsed * receipt.effectiveGasPrice, 0n);
if (gasUsed > MAX_RUN_GAS_WEI) fail("testnet_gas_cap_exceeded", "actual testnet gas exceeds the approved run cap");

await mkdir(new URL("../../artifacts/testnet/", import.meta.url), { recursive: true });
await mkdir(new URL("file:///private/tmp/ipo-one-chain-001b/"), { recursive: true, mode: 0o700 });
const safeChain = input.chainId.replace(":", "-");
const safeRun = input.runId.replace(/[^A-Za-z0-9._-]/g, "_");
const outputUrl = new URL(`../../artifacts/testnet/${safeChain}-${safeRun}.json`, import.meta.url);
const preDestructionUrl = new URL(
  `file:///private/tmp/ipo-one-chain-001b/redacted-${safeChain}-${safeRun}.json`
);
const redactedReceipt = {
  chainId: input.chainId,
  providerSlot: input.providerSlot,
  runIdHash,
  deployerAddress: account.address,
  contractAddress,
  deploymentTransactionHash,
  emissionTransactionHash,
  retirementTransactionHash,
  deploymentBlockNumber: deploymentReceipt.blockNumber.toString(),
  emissionBlockNumber: emissionReceipt.blockNumber.toString(),
  retirementBlockNumber: retirementReceipt.blockNumber.toString(),
  finalityProofHash: liveEvidence.proof.finalityProofHash,
  evidenceHash: liveEvidence.evidence.evidenceHash,
  sourceEvidenceHash: input.evidenceHash,
  observationStatus: liveEvidence.proof.observationStatus,
  transactionCount,
  valueTransferredWei: "0",
  gasSpentTestnetWei: gasUsed.toString(),
  contractRetired: true,
  emissionCount: Number(emissionCount),
  sandboxOnly: true,
  liveTestnetExecution: true,
  productionFundsMoved: false,
  realAssetMoved: false,
  schemaVersion: "live_testnet_emitter_run_receipt.v1"
};
await writeFile(preDestructionUrl, `${JSON.stringify({
  ...redactedReceipt,
  keyLogicallyDestroyed: false,
  storageMediumSecureEraseClaimed: false
}, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
recoveryState.preDestructionReceiptPath = preDestructionUrl.pathname;
const keyDestruction = await destroyEphemeralTestnetKey(input.keyFile);
recoveryState.keyLogicallyDestroyed = keyDestruction.logicallyDestroyed;
const result = {
  ...redactedReceipt,
  keyLogicallyDestroyed: keyDestruction.logicallyDestroyed,
  storageMediumSecureEraseClaimed: false
};
await writeFile(outputUrl, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  ...result,
  artifactPath: outputUrl.pathname
}, null, 2)}\n`);
}

await main().catch(async (error) => {
  const code = String(error?.message ?? "testnet_run_failed").split(":", 1)[0];
  const recovery = {
    ...recoveryState,
    errorCode: code,
    keyRetainedForEmergencyRetirement: !recoveryState.keyLogicallyDestroyed,
    privateKeyIncluded: false,
    recoveryCommand: "pnpm run testnet:emergency:retire",
    recordedAt: new Date().toISOString(),
    schemaVersion: "live_testnet_emitter_recovery.v1"
  };
  await mkdir(new URL("file:///private/tmp/ipo-one-chain-001b/"), { recursive: true, mode: 0o700 });
  const recoveryUrl = new URL(`file:///private/tmp/ipo-one-chain-001b/recovery-${Date.now()}.json`);
  await writeFile(recoveryUrl, `${JSON.stringify(recovery, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stderr.write(`${JSON.stringify({ ...recovery, recoveryPath: recoveryUrl.pathname }, null, 2)}\n`);
  process.exitCode = 1;
});
