import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../packages/domain/src/index.js";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../modules/event-indexer/src/index.js";
import { compileCreditAuthorizationRegistry } from "./compile-credit-registry.mjs";
import {
  assertCreditRegistryGasCap,
  readCreditRegistryRuntimeInput
} from "./run-credit-registry-once.mjs";
import {
  destroyEphemeralTestnetKey,
  readEphemeralTestnetKey
} from "./ephemeral-key.mjs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KEY_DIRECTORY = "/private/tmp/ipo-one-chain-001d";
const RECEIPT_TIMEOUT_MS = 120_000;
const SAFE_TIMEOUT_MS = 240_000;

function fail(code, message) {
  throw new Error(`${code}: ${message}`);
}

function chainFor(config, rpcUrl) {
  return defineChain({
    id: config.numericChainId,
    name: "Base Sepolia",
    nativeCurrency: {
      name: "Base Sepolia ETH",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true
  });
}

async function waitForSafe(publicClient, blockNumber) {
  const deadline = Date.now() + SAFE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const safe = await publicClient.getBlock({ blockTag: "safe" });
    if (safe.number !== null && safe.number >= blockNumber) return safe;
    await delay(1_000);
  }
  fail("credit_registry_recovery_safe_timeout", "pause was not observed at a safe block");
}

async function main() {
  const input = readCreditRegistryRuntimeInput();
  const rawAddress = process.env.IPO_ONE_TESTNET_RECOVERY_CONTRACT_ADDRESS;
  if (!ADDRESS.test(rawAddress ?? "")) {
    fail(
      "invalid_credit_registry_recovery_config",
      "exact recovery Registry address is required"
    );
  }
  const contractAddress = getAddress(rawAddress);
  const resolved = resolveApprovedRpc({
    chainId: input.chainId,
    providerSlot: input.providerSlot
  });
  const config = getLiveTestnetConfig(input.chainId);
  const privateKey = await readEphemeralTestnetKey(input.keyFile);
  const account = privateKeyToAccount(privateKey);
  const chain = chainFor(config, resolved.rpcUrl);
  const transport = http(resolved.rpcUrl, { retryCount: 0, timeout: 5_000 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  if (await publicClient.getChainId() !== config.numericChainId) {
    fail("rpc_chain_id_mismatch", "recovery RPC does not match Base Sepolia");
  }
  const artifact = await compileCreditAuthorizationRegistry();
  const runtimeCode = await publicClient.getBytecode({ address: contractAddress });
  if (!runtimeCode || runtimeCode === "0x") {
    fail("credit_registry_recovery_contract_missing", "Registry bytecode is absent");
  }
  const operator = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "operator"
  });
  if (getAddress(operator) !== account.address) {
    fail(
      "credit_registry_recovery_operator_mismatch",
      "ephemeral signer is not the Registry operator"
    );
  }
  let paused = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "paused"
  });
  let pauseTransactionHash;
  let pauseBlockNumber;
  let pauseBlockHash;
  let gasSpentTestnetWei = 0n;
  if (!paused) {
    const data = encodeFunctionData({
      abi: artifact.abi,
      functionName: "setPaused",
      args: [true]
    });
    const gas = await publicClient.estimateGas({
      account: account.address,
      to: contractAddress,
      data,
      value: 0n
    });
    const fees = await publicClient.estimateFeesPerGas();
    const gasPrice =
      fees.maxFeePerGas ?? fees.gasPrice ?? await publicClient.getGasPrice();
    assertCreditRegistryGasCap(gas, gasPrice, 0n);
    pauseTransactionHash = await walletClient.sendTransaction({
      account,
      to: contractAddress,
      data,
      value: 0n
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: pauseTransactionHash,
      confirmations: 1,
      timeout: RECEIPT_TIMEOUT_MS,
      pollingInterval: 1_000
    });
    if (receipt.status !== "success") {
      fail("credit_registry_recovery_reverted", "emergency pause reverted");
    }
    const transaction = await publicClient.getTransaction({
      hash: pauseTransactionHash
    });
    if (transaction.value !== 0n) {
      fail("credit_registry_recovery_nonzero_value", "pause carried native value");
    }
    const block = await publicClient.getBlock({
      blockNumber: receipt.blockNumber
    });
    if (block.hash !== receipt.blockHash) {
      fail("credit_registry_recovery_reorg", "pause receipt block changed");
    }
    const safe = await waitForSafe(publicClient, receipt.blockNumber);
    pauseBlockNumber = receipt.blockNumber.toString();
    pauseBlockHash = receipt.blockHash;
    gasSpentTestnetWei = receipt.gasUsed * receipt.effectiveGasPrice;
    paused = await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "paused"
    });
    if (!paused) {
      fail("credit_registry_recovery_pause_failed", "Registry did not remain paused");
    }
    if (safe.number < receipt.blockNumber) {
      fail("credit_registry_recovery_safe_timeout", "pause is not safe");
    }
  }

  await mkdir(new URL(`file://${KEY_DIRECTORY}/`), {
    recursive: true,
    mode: 0o700
  });
  await mkdir(new URL("../../artifacts/testnet/", import.meta.url), {
    recursive: true
  });
  const safeRun = input.runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const outputUrl = new URL(
    `../../artifacts/testnet/eip155-84532-${safeRun}-credit-registry-recovery.json`,
    import.meta.url
  );
  const preDestructionUrl = new URL(
    `file://${KEY_DIRECTORY}/redacted-${safeRun}-credit-registry-recovery.json`
  );
  const result = {
    chainId: input.chainId,
    runIdHash: hashId("credit_registry_testnet_run", {
      chainId: input.chainId,
      runId: input.runId
    }),
    operatorIdHash: hashId("credit_registry_testnet_operator", input.operatorId),
    deployerAddress: account.address,
    contractAddress,
    pauseTransactionHash,
    pauseBlockNumber,
    pauseBlockHash,
    registryPaused: paused,
    valueTransferredWei: "0",
    gasSpentTestnetWei: gasSpentTestnetWei.toString(),
    privateKeyIncluded: false,
    rawSignatureIncluded: false,
    productionFundsMoved: false,
    liveTestnetExecution: true,
    schemaVersion: "credit_registry_live_recovery_receipt.v1"
  };
  await writeFile(preDestructionUrl, `${JSON.stringify({
    ...result,
    keyLogicallyDestroyed: false,
    storageMediumSecureEraseClaimed: false
  }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  const destruction = await destroyEphemeralTestnetKey(input.keyFile);
  const completed = {
    ...result,
    keyLogicallyDestroyed: destruction.logicallyDestroyed,
    storageMediumSecureEraseClaimed: false
  };
  await writeFile(outputUrl, `${JSON.stringify(completed, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  process.stdout.write(`${JSON.stringify({
    ...completed,
    artifactPath: outputUrl.pathname
  }, null, 2)}\n`);
}

await main();
