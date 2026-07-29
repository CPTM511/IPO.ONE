import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  defineChain,
  encodeDeployData,
  getContractAddress,
  http,
  keccak256
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../modules/event-indexer/src/index.js";
import { compileEvidenceAnchorRegistry } from "./compile-evidence-anchor-registry.mjs";
import {
  destroyEphemeralTestnetKey,
  readEphemeralTestnetKey
} from "./ephemeral-key.mjs";
import {
  readEvidenceAnchorDeployInput
} from "./run-evidence-anchor-registry-deploy.mjs";

const CHAIN_ID = "eip155:84532";
const TRANSACTION_HASH = /^0x[0-9a-f]{64}$/;
const FINALITY_TIMEOUT_MS = 30 * 60_000;

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

export function readEvidenceAnchorReconciliationInput(env = process.env) {
  const deployment = readEvidenceAnchorDeployInput(env);
  const transactionHash = env.IPO_ONE_TESTNET_TRANSACTION_HASH;
  if (!TRANSACTION_HASH.test(transactionHash ?? "")) {
    fail(
      "invalid_evidence_anchor_reconciliation_config",
      "the exact lowercase deployment transaction hash is required"
    );
  }
  return Object.freeze({ ...deployment, transactionHash });
}

export function assertEvidenceAnchorRecoveryBinding({
  accountAddress,
  deployData,
  transaction,
  receipt
}) {
  const expectedAddress = getContractAddress({
    from: accountAddress,
    nonce: BigInt(transaction?.nonce ?? -1)
  });
  if (
    !transaction ||
    !receipt ||
    transaction.hash !== receipt.transactionHash ||
    transaction.from.toLowerCase() !== accountAddress.toLowerCase() ||
    transaction.to !== null ||
    transaction.value !== 0n ||
    transaction.input !== deployData ||
    transaction.chainId !== 84532 ||
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    receipt.contractAddress.toLowerCase() !== expectedAddress.toLowerCase() ||
    receipt.blockNumber !== transaction.blockNumber ||
    receipt.blockHash !== transaction.blockHash
  ) {
    fail(
      "evidence_anchor_recovery_binding_invalid",
      "the recovered transaction does not exactly match the reviewed deployment"
    );
  }
  return Object.freeze({
    contractAddress: receipt.contractAddress,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash
  });
}

async function waitForBothFinalized({
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
      await delay(30_000);
      continue;
    }
    process.stdout.write(`${JSON.stringify({
      event: "evidence_anchor_deployment_finality_wait",
      deploymentBlockNumber: receipt.blockNumber.toString(),
      primaryFinalizedHead: primary.number.toString(),
      secondaryFinalizedHead: secondary.number.toString()
    })}\n`);
    await delay(30_000);
  }
  fail(
    "evidence_anchor_reconciliation_finality_timeout",
    "deployment did not finalize through both approved RPCs"
  );
}

export async function reconcileEvidenceAnchorRegistryDeploy(input) {
  const config = getLiveTestnetConfig(CHAIN_ID);
  const primary = resolveApprovedRpc({
    chainId: CHAIN_ID,
    providerSlot: input.providerSlot
  });
  const secondarySlot =
    input.providerSlot === "primary" ? "secondary" : "primary";
  const secondary = resolveApprovedRpc({
    chainId: CHAIN_ID,
    providerSlot: secondarySlot
  });
  const primaryClient = publicClientFor(config, primary.rpcUrl);
  const secondaryClient = publicClientFor(config, secondary.rpcUrl);
  const artifact = await compileEvidenceAnchorRegistry();
  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode
  });
  const account = privateKeyToAccount(
    await readEphemeralTestnetKey(input.keyFile)
  );
  const [transaction, receipt] = await Promise.all([
    primaryClient.getTransaction({ hash: input.transactionHash }),
    primaryClient.getTransactionReceipt({ hash: input.transactionHash })
  ]);
  const binding = assertEvidenceAnchorRecoveryBinding({
    accountAddress: account.address,
    deployData,
    transaction,
    receipt
  });
  const finalized = await waitForBothFinalized({
    primaryClient,
    secondaryClient,
    receipt,
    expectedRuntimeCode: artifact.deployedBytecode
  });
  const deploymentArtifact = {
    checkpoint: "CHAIN-001F",
    chainId: CHAIN_ID,
    runId: input.runId,
    contractName: artifact.contractName,
    contractAddress: binding.contractAddress,
    deploymentTransactionHash: input.transactionHash,
    deploymentBlockNumber: binding.blockNumber.toString(),
    deploymentBlockHash: binding.blockHash,
    finalizedHeadNumber: finalized.primary.number.toString(),
    secondaryFinalizedHeadNumber: finalized.secondary.number.toString(),
    runtimeBytecodeHash: keccak256(finalized.runtimeCode),
    creationBytecodeHash: keccak256(artifact.bytecode),
    deployerAddress: account.address,
    explorerAddressUrl:
      `https://sepolia.basescan.org/address/${binding.contractAddress}`,
    explorerTransactionUrl:
      `https://sepolia.basescan.org/tx/${input.transactionHash}`,
    ownerlessContract: true,
    privilegedMethods: [],
    maximumBatchSize: 16,
    nativeValue: "0",
    rawPiiIncluded: false,
    privateKeyIncluded: false,
    signerFilePathIncluded: false,
    reconciledAfterFinalityTimeout: true,
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
  await writeFile(
    artifactPath,
    `${JSON.stringify(deploymentArtifact, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" }
  );
  const destroyed = await destroyEphemeralTestnetKey(input.keyFile);
  return Object.freeze({
    ...deploymentArtifact,
    artifactPath,
    deployerKeyLogicallyDestroyed: destroyed.logicallyDestroyed,
    schemaVersion: "evidence_anchor_registry_live_deployment_result.v1"
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await reconcileEvidenceAnchorRegistryDeploy(
    readEvidenceAnchorReconciliationInput()
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
