import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  getContractAddress,
  http,
  keccak256
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../packages/domain/src/index.js";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../modules/event-indexer/src/index.js";
import { compileEvidenceAnchorRegistry } from "./compile-evidence-anchor-registry.mjs";
import {
  destroyEphemeralTestnetKey,
  readEphemeralTestnetKey
} from "./ephemeral-key.mjs";

const APPROVAL_SCOPE = "CHAIN-001F";
const CHAIN_ID = "eip155:84532";
const KEY_DIRECTORY = "/private/tmp/ipo-one-chain-001f";
const MAX_STARTING_BALANCE_WEI = 10_000_000_000_000_000n;
const MAX_DEPLOY_GAS_WEI = 2_000_000_000_000_000n;
const RECEIPT_TIMEOUT_MS = 120_000;
const FINALITY_TIMEOUT_MS = 30 * 60_000;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;

function fail(code, message) {
  throw new Error(`${code}: ${message}`);
}

export function readEvidenceAnchorDeployInput(env = process.env) {
  const input = {
    chainId: env.IPO_ONE_TESTNET_CHAIN_ID,
    providerSlot: env.IPO_ONE_TESTNET_PROVIDER_SLOT ?? "primary",
    keyFile: env.IPO_ONE_TESTNET_KEY_FILE,
    runId: env.IPO_ONE_TESTNET_RUN_ID
  };
  if (
    env.CI === "true" ||
    env.GITHUB_ACTIONS === "true" ||
    env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY !== APPROVAL_SCOPE ||
    input.chainId !== CHAIN_ID ||
    !new Set(["primary", "secondary"]).has(input.providerSlot) ||
    !input.keyFile?.startsWith(`${KEY_DIRECTORY}/`) ||
    !input.keyFile.endsWith(".key") ||
    !RUN_ID.test(input.runId ?? "")
  ) {
    fail(
      "invalid_evidence_anchor_deploy_config",
      "closed CHAIN-001F Base Sepolia deployment configuration is required"
    );
  }
  return Object.freeze(input);
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
    blockExplorers: {
      default: {
        name: "BaseScan Sepolia",
        url: config.explorerBaseUrl
      }
    },
    testnet: true
  });
}

function publicClientFor(config, rpcUrl) {
  return createPublicClient({
    chain: chainFor(config, rpcUrl),
    transport: http(rpcUrl, { retryCount: 0, timeout: 5_000 })
  });
}

async function gasPriceFor(client) {
  const fees = await client.estimateFeesPerGas();
  return fees.maxFeePerGas ?? fees.gasPrice ?? client.getGasPrice();
}

export function assertEvidenceAnchorDeployGasCap(gas, gasPrice) {
  if (
    typeof gas !== "bigint" ||
    typeof gasPrice !== "bigint" ||
    gas <= 0n ||
    gasPrice <= 0n ||
    gas * gasPrice > MAX_DEPLOY_GAS_WEI
  ) {
    fail(
      "evidence_anchor_deploy_gas_cap_exceeded",
      "estimated Base Sepolia deployment gas exceeds the approved CHAIN-001F cap"
    );
  }
  return gas * gasPrice;
}

async function deploymentContext(input) {
  const primary = resolveApprovedRpc({
    chainId: input.chainId,
    providerSlot: input.providerSlot
  });
  const secondarySlot =
    input.providerSlot === "primary" ? "secondary" : "primary";
  const secondary = resolveApprovedRpc({
    chainId: input.chainId,
    providerSlot: secondarySlot
  });
  const config = getLiveTestnetConfig(input.chainId);
  const privateKey = await readEphemeralTestnetKey(input.keyFile);
  const account = privateKeyToAccount(privateKey);
  const primaryClient = publicClientFor(config, primary.rpcUrl);
  const secondaryClient = publicClientFor(config, secondary.rpcUrl);
  const observedChainIds = await Promise.all([
    primaryClient.getChainId(),
    secondaryClient.getChainId()
  ]);
  if (observedChainIds.some((value) => value !== config.numericChainId)) {
    fail("rpc_chain_id_mismatch", "approved RPC does not match Base Sepolia");
  }
  const artifact = await compileEvidenceAnchorRegistry();
  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode
  });
  return {
    account,
    artifact,
    config,
    deployData,
    primaryClient,
    secondaryClient,
    primaryRpcUrl: primary.rpcUrl
  };
}

export async function preflightEvidenceAnchorRegistryDeploy(input) {
  const context = await deploymentContext(input);
  const balance = await context.primaryClient.getBalance({
    address: context.account.address
  });
  if (balance > MAX_STARTING_BALANCE_WEI) {
    fail(
      "evidence_anchor_deployer_balance_cap_exceeded",
      "ephemeral deployer balance exceeds the approved faucet cap"
    );
  }
  const nonce = await context.primaryClient.getTransactionCount({
    address: context.account.address,
    blockTag: "pending"
  });
  const predictedContractAddress = getContractAddress({
    from: context.account.address,
    nonce: BigInt(nonce)
  });
  let gas;
  let maximumGasCostWei;
  if (balance > 0n) {
    gas = await context.primaryClient.estimateGas({
      account: context.account.address,
      data: context.deployData
    });
    maximumGasCostWei = assertEvidenceAnchorDeployGasCap(
      gas,
      await gasPriceFor(context.primaryClient)
    );
  }
  return Object.freeze({
    chainId: CHAIN_ID,
    runId: input.runId,
    runIdHash: hashId("evidence_anchor_registry_deploy", {
      chainId: CHAIN_ID,
      runId: input.runId
    }),
    deployerAddress: context.account.address,
    predictedContractAddress,
    observedBalanceWei: balance.toString(),
    maximumStartingBalanceWei: MAX_STARTING_BALANCE_WEI.toString(),
    estimatedGas: gas?.toString(),
    maximumGasCostWei: maximumGasCostWei?.toString(),
    compilerVersion: context.artifact.compilerVersion,
    creationBytecodeHash: keccak256(context.artifact.bytecode),
    funded: balance > 0n,
    ready:
      balance > 0n &&
      maximumGasCostWei !== undefined &&
      balance >= maximumGasCostWei,
    ownerlessContract: true,
    nativeValue: "0",
    privateKeyIncluded: false,
    signerFilePathIncluded: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "evidence_anchor_registry_deploy_preflight.v1"
  });
}

async function waitForFinalizedDeployment({
  primaryClient,
  secondaryClient,
  receipt,
  expectedRuntimeCode
}) {
  const deadline = Date.now() + FINALITY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let primary;
    let secondary;
    let canonical;
    try {
      [primary, secondary, canonical] = await Promise.all([
        primaryClient.getBlock({ blockTag: "finalized" }),
        secondaryClient.getBlock({ blockTag: "finalized" }),
        primaryClient.getBlock({ blockNumber: receipt.blockNumber })
      ]);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        event: "evidence_anchor_deployment_finality_rpc_retry",
        deploymentBlockNumber: receipt.blockNumber.toString(),
        errorName: error?.name ?? "Error"
      })}\n`);
      await delay(30_000);
      continue;
    }
    if (canonical.hash !== receipt.blockHash) {
      fail(
        "evidence_anchor_deploy_reorged",
        "the deployment receipt block is no longer canonical"
      );
    }
    if (
      primary.number >= receipt.blockNumber &&
      secondary.number >= receipt.blockNumber
    ) {
      let primaryCode;
      let secondaryCode;
      try {
        [primaryCode, secondaryCode] = await Promise.all([
          primaryClient.getBytecode({
            address: receipt.contractAddress,
            blockTag: "finalized"
          }),
          secondaryClient.getBytecode({
            address: receipt.contractAddress,
            blockTag: "finalized"
          })
        ]);
      } catch (error) {
        process.stdout.write(`${JSON.stringify({
          event: "evidence_anchor_deployment_finalized_code_rpc_retry",
          deploymentBlockNumber: receipt.blockNumber.toString(),
          errorName: error?.name ?? "Error"
        })}\n`);
        await delay(30_000);
        continue;
      }
      if (
        (primaryCode && primaryCode !== expectedRuntimeCode) ||
        (secondaryCode && secondaryCode !== expectedRuntimeCode)
      ) {
        fail(
          "evidence_anchor_deploy_code_mismatch",
          "non-empty finalized runtime code differs from the reviewed bytecode"
        );
      }
      if (primaryCode && secondaryCode) {
        return Object.freeze({
          primary,
          secondary,
          runtimeCode: primaryCode
        });
      }
      process.stdout.write(`${JSON.stringify({
        event: "evidence_anchor_deployment_finalized_code_wait",
        deploymentBlockNumber: receipt.blockNumber.toString(),
        primaryCodePresent: Boolean(primaryCode),
        secondaryCodePresent: Boolean(secondaryCode)
      })}\n`);
    }
    await delay(30_000);
  }
  fail(
    "evidence_anchor_deploy_finality_timeout",
    "deployment did not reach the finalized Base Sepolia head in time"
  );
}

export async function deployEvidenceAnchorRegistry(input) {
  const preflight = await preflightEvidenceAnchorRegistryDeploy(input);
  if (!preflight.ready) {
    fail(
      "evidence_anchor_deployer_unfunded",
      "fund the exact ephemeral Base Sepolia deployer before deployment"
    );
  }
  const context = await deploymentContext(input);
  const chain = chainFor(context.config, context.primaryRpcUrl);
  const walletClient = createWalletClient({
    account: context.account,
    chain,
    transport: http(context.primaryRpcUrl, {
      retryCount: 0,
      timeout: 5_000
    })
  });
  const transactionHash = await walletClient.sendTransaction({
    account: context.account,
    chain,
    data: context.deployData,
    value: 0n,
    gas: BigInt(preflight.estimatedGas)
  });
  const receipt = await context.primaryClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
    timeout: RECEIPT_TIMEOUT_MS,
    pollingInterval: 1_000
  });
  if (
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    receipt.contractAddress.toLowerCase() !==
      preflight.predictedContractAddress.toLowerCase()
  ) {
    fail(
      "evidence_anchor_deploy_receipt_invalid",
      "Base Sepolia deployment receipt is invalid"
    );
  }
  const finalized = await waitForFinalizedDeployment({
    primaryClient: context.primaryClient,
    secondaryClient: context.secondaryClient,
    receipt,
    expectedRuntimeCode: context.artifact.deployedBytecode
  });
  const artifact = {
    checkpoint: "CHAIN-001F",
    chainId: CHAIN_ID,
    runId: input.runId,
    contractName: context.artifact.contractName,
    contractAddress: receipt.contractAddress,
    deploymentTransactionHash: transactionHash,
    deploymentBlockNumber: receipt.blockNumber.toString(),
    deploymentBlockHash: receipt.blockHash,
    finalizedHeadNumber: finalized.primary.number.toString(),
    secondaryFinalizedHeadNumber: finalized.secondary.number.toString(),
    runtimeBytecodeHash: keccak256(finalized.runtimeCode),
    creationBytecodeHash: preflight.creationBytecodeHash,
    deployerAddress: context.account.address,
    explorerAddressUrl:
      `https://sepolia.basescan.org/address/${receipt.contractAddress}`,
    explorerTransactionUrl:
      `https://sepolia.basescan.org/tx/${transactionHash}`,
    ownerlessContract: true,
    privilegedMethods: [],
    maximumBatchSize: 16,
    nativeValue: "0",
    rawPiiIncluded: false,
    privateKeyIncluded: false,
    signerFilePathIncluded: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    observedThroughApprovedRpcCount: 2,
    schemaVersion: "evidence_anchor_registry_live_deployment.v1"
  };
  const artifactPath = resolve(
    "artifacts/testnet",
    `eip155-84532-chain-001f-${input.runId}.json`
  );
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
  const destroyed = await destroyEphemeralTestnetKey(input.keyFile);
  return Object.freeze({
    ...artifact,
    artifactPath,
    deployerKeyLogicallyDestroyed: destroyed.logicallyDestroyed,
    schemaVersion: "evidence_anchor_registry_live_deployment_result.v1"
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await deployEvidenceAnchorRegistry(
    readEvidenceAnchorDeployInput()
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
