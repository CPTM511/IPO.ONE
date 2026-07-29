import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  http,
  keccak256
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  BaseSepoliaCreditAuthorizationAdapter,
  CREDIT_AUTHORIZATION_REGISTRY_ABI,
  createCreditAuthorizationProjection
} from "../../modules/chain-adapter/src/index.js";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../modules/event-indexer/src/index.js";
import { compileCreditAuthorizationRegistry } from "./compile-credit-registry.mjs";
import {
  destroyEphemeralTestnetKey,
  readEphemeralTestnetKey
} from "./ephemeral-key.mjs";

const APPROVAL_SCOPE = "CHAIN-001D";
const CHAIN_ID = "eip155:84532";
const KEY_DIRECTORY = "/private/tmp/ipo-one-chain-001d";
const MAX_STARTING_BALANCE_WEI = 100_000_000_000_000_000n;
const MAX_SINGLE_TRANSACTION_GAS_WEI = 5_000_000_000_000_000n;
const MAX_RUN_GAS_WEI = 15_000_000_000_000_000n;
const MAX_TRANSACTION_COUNT = 5;
const RECEIPT_TIMEOUT_MS = 120_000;
const SAFE_TIMEOUT_MS = 240_000;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;
const OPERATOR_ID = /^[a-z][a-z0-9._:-]{7,71}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

function fail(code, message) {
  throw new Error(`${code}: ${message}`);
}

export function readCreditRegistryRuntimeInput(env = process.env) {
  const input = {
    chainId: env.IPO_ONE_TESTNET_CHAIN_ID,
    providerSlot: env.IPO_ONE_TESTNET_PROVIDER_SLOT ?? "primary",
    keyFile: env.IPO_ONE_TESTNET_KEY_FILE,
    runId: env.IPO_ONE_TESTNET_RUN_ID,
    operatorId: env.IPO_ONE_TESTNET_OPERATOR_ID,
    ...(env.IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS
      ? {
        resumeContractAddress: env.IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS,
        resumeDeploymentTransactionHash:
          env.IPO_ONE_TESTNET_RESUME_DEPLOYMENT_TRANSACTION_HASH,
        ...(env.IPO_ONE_TESTNET_RESUME_PUBLICATION_TRANSACTION_HASH
          ? {
            resumePublicationTransactionHash:
              env.IPO_ONE_TESTNET_RESUME_PUBLICATION_TRANSACTION_HASH,
            ...(env.IPO_ONE_TESTNET_RESUME_PROOF_UPDATE_TRANSACTION_HASH
              ? {
                resumeProofUpdateTransactionHash:
                  env.IPO_ONE_TESTNET_RESUME_PROOF_UPDATE_TRANSACTION_HASH
              }
              : {}),
            ...(env.IPO_ONE_TESTNET_RESUME_CLOSE_TRANSACTION_HASH
              ? {
                resumeCloseTransactionHash:
                  env.IPO_ONE_TESTNET_RESUME_CLOSE_TRANSACTION_HASH
              }
              : {}),
            ...(env.IPO_ONE_TESTNET_RESUME_PAUSE_TRANSACTION_HASH
              ? {
                resumePauseTransactionHash:
                  env.IPO_ONE_TESTNET_RESUME_PAUSE_TRANSACTION_HASH
              }
              : {})
          }
          : {})
      }
      : {})
  };
  const resumePairIsValid =
    (!env.IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS &&
      !env.IPO_ONE_TESTNET_RESUME_DEPLOYMENT_TRANSACTION_HASH) ||
    (ADDRESS.test(env.IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS ?? "") &&
      TRANSACTION_HASH.test(
        env.IPO_ONE_TESTNET_RESUME_DEPLOYMENT_TRANSACTION_HASH ?? ""
      ));
  const resumeStageHashes = [
    env.IPO_ONE_TESTNET_RESUME_PUBLICATION_TRANSACTION_HASH,
    env.IPO_ONE_TESTNET_RESUME_PROOF_UPDATE_TRANSACTION_HASH,
    env.IPO_ONE_TESTNET_RESUME_CLOSE_TRANSACTION_HASH,
    env.IPO_ONE_TESTNET_RESUME_PAUSE_TRANSACTION_HASH
  ];
  let resumeGapObserved = false;
  let resumeStagesAreValid = true;
  for (const value of resumeStageHashes) {
    if (!value) {
      resumeGapObserved = true;
    } else if (
      resumeGapObserved ||
      !env.IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS ||
      !TRANSACTION_HASH.test(value)
    ) {
      resumeStagesAreValid = false;
    }
  }
  if (
    env.CI === "true" ||
    env.GITHUB_ACTIONS === "true" ||
    env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY !== APPROVAL_SCOPE ||
    input.chainId !== CHAIN_ID ||
    !new Set(["primary", "secondary"]).has(input.providerSlot) ||
    !input.keyFile?.startsWith(`${KEY_DIRECTORY}/`) ||
    !input.keyFile.endsWith(".key") ||
    !RUN_ID.test(input.runId ?? "") ||
    !OPERATOR_ID.test(input.operatorId ?? "") ||
    !resumePairIsValid ||
    !resumeStagesAreValid
  ) {
    fail(
      "invalid_credit_registry_run_config",
      "closed CHAIN-001D Base Sepolia runtime configuration is required"
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

function clientsFor(config, rpcUrl, account) {
  const chain = chainFor(config, rpcUrl);
  const transport = http(rpcUrl, { retryCount: 0, timeout: 5_000 });
  return {
    chain,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: account
      ? createWalletClient({ account, chain, transport })
      : undefined
  };
}

async function gasPriceFor(publicClient) {
  const fees = await publicClient.estimateFeesPerGas();
  return fees.maxFeePerGas ?? fees.gasPrice ?? await publicClient.getGasPrice();
}

export function assertCreditRegistryGasCap(gas, gasPrice, alreadyCommitted = 0n) {
  if (
    typeof gas !== "bigint" ||
    typeof gasPrice !== "bigint" ||
    typeof alreadyCommitted !== "bigint" ||
    gas <= 0n ||
    gasPrice <= 0n ||
    alreadyCommitted < 0n
  ) {
    fail("invalid_credit_registry_gas", "gas inputs must be positive integers");
  }
  const maximum = gas * gasPrice;
  if (
    maximum > MAX_SINGLE_TRANSACTION_GAS_WEI ||
    alreadyCommitted + maximum > MAX_RUN_GAS_WEI
  ) {
    fail(
      "credit_registry_gas_cap_exceeded",
      "estimated Base Sepolia gas exceeds the approved CHAIN-001D cap"
    );
  }
  return maximum;
}

export function buildSyntheticCreditRegistryLifecycle({
  runId,
  accountAddress,
  now = new Date()
}) {
  if (!RUN_ID.test(runId ?? "") || !ADDRESS.test(accountAddress ?? "")) {
    fail("invalid_synthetic_credit_registry_input", "run ID and test account are required");
  }
  const nowMilliseconds = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMilliseconds)) {
    fail("invalid_synthetic_credit_registry_input", "current time is invalid");
  }
  const account = getAddress(accountAddress);
  const timestamp = new Date(Math.floor(nowMilliseconds / 1_000) * 1_000);
  const validUntil = new Date(timestamp.getTime() + 2 * 60 * 60 * 1_000).toISOString();
  const safeRunId = runId.replace(/[^A-Za-z0-9._:-]/g, "_");
  const authorizationId = `authorization_base_sepolia_${safeRunId}`;
  const accountId = `${CHAIN_ID}:${account}`;
  const common = Object.freeze({
    chainId: CHAIN_ID,
    runId,
    authorizationId,
    accountId,
    sandboxOnly: true,
    productionFundsMoved: false
  });
  const subjectAccountHash = hashId("testnet_subject_account", common);
  const acceptedOfferHash = hashId("testnet_accepted_offer", {
    ...common,
    amountMinor: "1",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    installments: 1
  });
  const policyHash = hashId("testnet_credit_policy", {
    ...common,
    policyVersion: "chain-001d.synthetic.v1",
    maximumExposureMinor: "1"
  });
  const providerScopeHash = hashId("testnet_provider_scope", {
    ...common,
    provider: "synthetic_no_funds"
  });
  const initialCreditStateHash = hashId("testnet_credit_state", {
    ...common,
    status: "authorized",
    outstandingMinor: "1"
  });
  const initialObligationProofHash = hashId("testnet_obligation_proof", {
    ...common,
    status: "accepted",
    paidMinor: "0",
    outstandingMinor: "1"
  });
  const repaidCreditStateHash = hashId("testnet_credit_state", {
    ...common,
    status: "repaid",
    outstandingMinor: "0"
  });
  const repaymentProofHash = hashId("testnet_obligation_proof", {
    ...common,
    status: "fully_repaid",
    paidMinor: "1",
    outstandingMinor: "0"
  });
  const settledObligationProofHash = hashId("testnet_obligation_proof", {
    ...common,
    status: "closed_settled",
    paidMinor: "1",
    outstandingMinor: "0"
  });
  const initialProjection = createCreditAuthorizationProjection({
    authorizationId,
    accountId,
    subjectAccountHash,
    acceptedOfferHash,
    policyHash,
    providerScopeHash,
    creditStateHash: initialCreditStateHash,
    obligationProofHash: initialObligationProofHash,
    validUntil
  });
  return Object.freeze({
    initialProjection,
    repaidCreditStateHash,
    repaymentProofHash,
    settledObligationProofHash,
    repaidProjection: Object.freeze({
      ...initialProjection,
      creditStateHash: repaidCreditStateHash,
      obligationProofHash: repaymentProofHash
    }),
    settledProjection: Object.freeze({
      ...initialProjection,
      creditStateHash: repaidCreditStateHash,
      obligationProofHash: settledObligationProofHash
    }),
    syntheticOnly: true,
    rawPiiIncluded: false,
    realProductAccountIncluded: false,
    schemaVersion: "synthetic_credit_registry_lifecycle.v1"
  });
}

export async function preflightCreditRegistryRun(input) {
  const resolved = resolveApprovedRpc({
    chainId: input.chainId,
    providerSlot: input.providerSlot
  });
  const config = getLiveTestnetConfig(input.chainId);
  const privateKey = await readEphemeralTestnetKey(input.keyFile);
  const account = privateKeyToAccount(privateKey);
  const { publicClient } = clientsFor(config, resolved.rpcUrl);
  const observedChainId = await publicClient.getChainId();
  if (observedChainId !== config.numericChainId) {
    fail("rpc_chain_id_mismatch", "RPC does not match Base Sepolia");
  }
  const startingBalance = await publicClient.getBalance({ address: account.address });
  if (startingBalance > MAX_STARTING_BALANCE_WEI) {
    fail(
      "credit_registry_deployer_balance_cap_exceeded",
      "ephemeral deployer balance exceeds the approved faucet cap"
    );
  }
  const artifact = await compileCreditAuthorizationRegistry();
  return Object.freeze({
    chainId: input.chainId,
    providerSlot: input.providerSlot,
    runId: input.runId,
    runIdHash: hashId("credit_registry_testnet_run", {
      chainId: input.chainId,
      runId: input.runId
    }),
    operatorIdHash: hashId("credit_registry_testnet_operator", input.operatorId),
    deployerAddress: account.address,
    observedBalanceWei: startingBalance.toString(),
    maximumStartingBalanceWei: MAX_STARTING_BALANCE_WEI.toString(),
    compilerVersion: artifact.compilerVersion,
    creationBytecodeHash: keccak256(artifact.bytecode),
    funded: startingBalance > 0n,
    ready: startingBalance > 0n,
    privateKeyIncluded: false,
    signerFilePathIncluded: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "credit_registry_live_preflight.v1"
  });
}

async function waitForReceipt(publicClient, transactionHash) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
    timeout: RECEIPT_TIMEOUT_MS,
    pollingInterval: 1_000
  });
  if (receipt.status !== "success") {
    fail("credit_registry_transaction_reverted", "Base Sepolia transaction reverted");
  }
  return receipt;
}

function exactEvent(receipt, contractAddress, abi, eventName) {
  const matches = [];
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(contractAddress)) continue;
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
        strict: true
      });
      if (decoded.eventName === eventName) matches.push(decoded.args);
    } catch {
      // Logs that are not part of the closed Registry ABI are ignored here and
      // cause the exact-event count below to fail when the expected event is absent.
    }
  }
  if (matches.length !== 1) {
    fail(
      "credit_registry_event_mismatch",
      `expected exactly one ${eventName} event`
    );
  }
  return matches[0];
}

function equalHash(name, actual, expected) {
  if (actual !== expected) {
    fail("credit_registry_event_mismatch", `${name} does not match the expected hash`);
  }
}

async function waitForSafeBlock(publicClient, requiredBlockNumber) {
  const deadline = Date.now() + SAFE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const safeBlock = await publicClient.getBlock({ blockTag: "safe" });
    if (safeBlock.number !== null && safeBlock.number >= requiredBlockNumber) {
      return safeBlock;
    }
    await delay(1_000);
  }
  fail(
    "credit_registry_safe_block_timeout",
    "final Registry transaction was not observed at the Base Sepolia safe block"
  );
}

async function waitForRuntimeCode(publicClient, contractAddress) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const runtimeCode = await publicClient.getBytecode({
      address: contractAddress
    });
    if (runtimeCode && runtimeCode !== "0x") return runtimeCode;
    await delay(500);
  }
  fail(
    "credit_registry_deployment_failed",
    "deployed Registry runtime bytecode was not observable within the bounded retry"
  );
}

async function estimateGasAfterStateVisibility(publicClient, request) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      return await publicClient.estimateGas(request);
    } catch {
      await delay(500);
    }
  }
  fail(
    "credit_registry_state_visibility_timeout",
    "the next Registry transition was not estimable after the bounded visibility wait"
  );
}

async function verifyReceipts(publicClient, receipts, transactionHashes) {
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash) {
      fail("credit_registry_reorg_detected", "receipt block hash changed before acceptance");
    }
    const transaction = await publicClient.getTransaction({
      hash: transactionHashes[index]
    });
    if (transaction.value !== 0n) {
      fail("credit_registry_nonzero_value", "Registry transaction carried native value");
    }
  }
}

async function decodeAuthorization(publicClient, adapter, contractAddress, authorizationHash) {
  const data = encodeFunctionData({
    abi: CREDIT_AUTHORIZATION_REGISTRY_ABI,
    functionName: "getAuthorization",
    args: [authorizationHash]
  });
  const result = await publicClient.call({ to: contractAddress, data });
  if (!result.data) {
    fail("credit_registry_read_failed", "Registry state call returned no data");
  }
  return adapter.decodeAuthorization(result.data);
}

async function waitForAuthorizationState({
  publicClient,
  adapter,
  contractAddress,
  projection,
  expectedVersion,
  expectedStatus
}) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const state = await decodeAuthorization(
        publicClient,
        adapter,
        contractAddress,
        projection.authorizationHash
      );
      const reconciliation = adapter.reconcile(projection, state);
      if (
        reconciliation.reconciled &&
        state.version === expectedVersion &&
        state.status === expectedStatus
      ) {
        return state;
      }
    } catch {
      // A just-mined state transition can briefly be absent from an RPC read.
    }
    await delay(500);
  }
  fail(
    "credit_registry_state_visibility_timeout",
    `Registry version ${expectedVersion} ${expectedStatus} state was not observable`
  );
}

async function writeRedactedRunReceipt({
  input,
  result,
  keyFile,
  destroyKey = true
}) {
  await mkdir(new URL("../../artifacts/testnet/", import.meta.url), {
    recursive: true
  });
  await mkdir(new URL(`file://${KEY_DIRECTORY}/`), {
    recursive: true,
    mode: 0o700
  });
  const safeRun = input.runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const outputUrl = new URL(
    `../../artifacts/testnet/eip155-84532-${safeRun}-credit-registry.json`,
    import.meta.url
  );
  const preDestructionUrl = new URL(
    `file://${KEY_DIRECTORY}/redacted-eip155-84532-${safeRun}-credit-registry.json`
  );
  await writeFile(preDestructionUrl, `${JSON.stringify({
    ...result,
    keyLogicallyDestroyed: false,
    storageMediumSecureEraseClaimed: false
  }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  const destruction = destroyKey
    ? await destroyEphemeralTestnetKey(keyFile)
    : { logicallyDestroyed: false };
  const completed = Object.freeze({
    ...result,
    keyLogicallyDestroyed: destruction.logicallyDestroyed,
    storageMediumSecureEraseClaimed: false
  });
  await writeFile(outputUrl, `${JSON.stringify(completed, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  return Object.freeze({
    result: completed,
    artifactPath: outputUrl.pathname
  });
}

export async function runCreditRegistryOnce(input, { recoveryState = {} } = {}) {
  const preflight = await preflightCreditRegistryRun(input);
  if (!preflight.ready) {
    fail(
      "credit_registry_deployer_unfunded",
      "ephemeral deployer needs official-faucet Base Sepolia ETH"
    );
  }
  const resolved = resolveApprovedRpc({
    chainId: input.chainId,
    providerSlot: input.providerSlot
  });
  const config = getLiveTestnetConfig(input.chainId);
  const privateKey = await readEphemeralTestnetKey(input.keyFile);
  const account = privateKeyToAccount(privateKey);
  const { publicClient, walletClient } = clientsFor(config, resolved.rpcUrl, account);
  const artifact = await compileCreditAuthorizationRegistry();
  let resumePublicationReceipt;
  let recoveredLifecycleNow;
  if (input.resumePublicationTransactionHash) {
    resumePublicationReceipt = await publicClient.getTransactionReceipt({
      hash: input.resumePublicationTransactionHash
    });
    if (resumePublicationReceipt.status !== "success") {
      fail(
        "credit_registry_resume_mismatch",
        "publication checkpoint receipt is not successful"
      );
    }
    const publicationEvent = exactEvent(
      resumePublicationReceipt,
      input.resumeContractAddress,
      artifact.abi,
      "AuthorizationPublished"
    );
    recoveredLifecycleNow = new Date(
      (Number(publicationEvent.validUntil) - 7_200) * 1_000
    );
  }
  const lifecycle = buildSyntheticCreditRegistryLifecycle({
    runId: input.runId,
    accountAddress: account.address,
    ...(recoveredLifecycleNow ? { now: recoveredLifecycleNow } : {})
  });
  const transactionHashes = [];
  const receipts = [];
  let maximumGasCommitted = 0n;
  Object.assign(recoveryState, {
    contractAddress: undefined,
    transactionHashes,
    transactionCount: 0,
    keyLogicallyDestroyed: false
  });

  const submit = async ({ to, data }) => {
    const gasPrice = await gasPriceFor(publicClient);
    const gas = await estimateGasAfterStateVisibility(publicClient, {
      account: account.address,
      to,
      data,
      value: 0n
    });
    maximumGasCommitted += assertCreditRegistryGasCap(
      gas,
      gasPrice,
      maximumGasCommitted
    );
    const transactionHash = await walletClient.sendTransaction({
      account,
      to,
      data,
      value: 0n
    });
    transactionHashes.push(transactionHash);
    recoveryState.transactionCount = transactionHashes.length;
    const receipt = await waitForReceipt(publicClient, transactionHash);
    receipts.push(receipt);
    return receipt;
  };

  const acceptExisting = async ({
    transactionHash,
    expectedNonce,
    to,
    data,
    receipt: cachedReceipt
  }) => {
    const [transaction, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: transactionHash }),
      cachedReceipt
        ? Promise.resolve(cachedReceipt)
        : publicClient.getTransactionReceipt({ hash: transactionHash })
    ]);
    if (
      getAddress(transaction.from) !== account.address ||
      !transaction.to ||
      getAddress(transaction.to) !== getAddress(to) ||
      transaction.nonce !== expectedNonce ||
      transaction.value !== 0n ||
      transaction.input !== data ||
      receipt.status !== "success"
    ) {
      fail(
        "credit_registry_resume_mismatch",
        `checkpoint transaction nonce ${expectedNonce} drifted`
      );
    }
    maximumGasCommitted += assertCreditRegistryGasCap(
      receipt.gasUsed,
      receipt.effectiveGasPrice,
      maximumGasCommitted
    );
    transactionHashes.push(transactionHash.toLowerCase());
    receipts.push(receipt);
    recoveryState.transactionCount = transactionHashes.length;
    return receipt;
  };

  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [
      BASE_SEPOLIA_PROFILE.profileHash,
      1,
      account.address
    ]
  });
  let deploymentReceipt;
  let contractAddress;
  if (input.resumeContractAddress) {
    const acceptedCheckpointCount = 1 + [
      input.resumePublicationTransactionHash,
      input.resumeProofUpdateTransactionHash,
      input.resumeCloseTransactionHash,
      input.resumePauseTransactionHash
    ].filter(Boolean).length;
    const resumeContractAddress = getAddress(input.resumeContractAddress);
    const deploymentTransactionHash =
      input.resumeDeploymentTransactionHash.toLowerCase();
    const [deploymentTransaction, observedReceipt, pendingNonce] =
      await Promise.all([
        publicClient.getTransaction({ hash: deploymentTransactionHash }),
        publicClient.getTransactionReceipt({ hash: deploymentTransactionHash }),
        publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending"
        })
      ]);
    const expectedContractAddress = getContractAddress({
      from: account.address,
      nonce: deploymentTransaction.nonce
    });
    if (
      getAddress(deploymentTransaction.from) !== account.address ||
      deploymentTransaction.to !== null ||
      deploymentTransaction.nonce !== 0 ||
      deploymentTransaction.value !== 0n ||
      deploymentTransaction.input !== deployData ||
      observedReceipt.status !== "success" ||
      !observedReceipt.contractAddress ||
      getAddress(observedReceipt.contractAddress) !== resumeContractAddress ||
      expectedContractAddress !== resumeContractAddress ||
      pendingNonce !== acceptedCheckpointCount
    ) {
      fail(
        "credit_registry_resume_mismatch",
        "deployment transaction, signer nonce, calldata, or contract address drifted"
      );
    }
    deploymentReceipt = observedReceipt;
    contractAddress = resumeContractAddress;
    transactionHashes.push(deploymentTransactionHash);
    receipts.push(deploymentReceipt);
    maximumGasCommitted = assertCreditRegistryGasCap(
      deploymentReceipt.gasUsed,
      deploymentReceipt.effectiveGasPrice,
      0n
    );
    recoveryState.transactionCount = 1;
  } else {
    deploymentReceipt = await submit({
      to: undefined,
      data: deployData
    });
    contractAddress = deploymentReceipt.contractAddress;
    if (!contractAddress) {
      fail(
        "credit_registry_deployment_failed",
        "deployment receipt has no contract address"
      );
    }
  }
  recoveryState.contractAddress = contractAddress;
  const runtimeCode = await waitForRuntimeCode(publicClient, contractAddress);
  const adapter = new BaseSepoliaCreditAuthorizationAdapter({ contractAddress });
  const operator = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "operator"
  });
  const publisher = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "publisher"
  });
  const chainProfileHash = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "chainProfileHash"
  });
  const chainProfileVersion = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "chainProfileVersion"
  });
  const initiallyPaused = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "paused"
  });
  if (
    getAddress(operator) !== account.address ||
    getAddress(publisher) !== account.address ||
    chainProfileHash !== BASE_SEPOLIA_PROFILE.profileHash ||
    Number(chainProfileVersion) !== 1 ||
    initiallyPaused !== Boolean(input.resumePauseTransactionHash)
  ) {
    fail(
      "credit_registry_deployment_mismatch",
      "deployed Registry configuration does not match CHAIN-001D"
    );
  }

  const publish = adapter.preparePublish(lifecycle.initialProjection);
  const publishReceipt = input.resumePublicationTransactionHash
    ? await acceptExisting({
      transactionHash: input.resumePublicationTransactionHash,
      expectedNonce: 1,
      to: publish.to,
      data: publish.data,
      receipt: resumePublicationReceipt
    })
    : await submit({ to: publish.to, data: publish.data });
  const published = exactEvent(
    publishReceipt,
    contractAddress,
    artifact.abi,
    "AuthorizationPublished"
  );
  equalHash(
    "authorizationHash",
    published.authorizationHash,
    lifecycle.initialProjection.authorizationHash
  );
  equalHash(
    "acceptedOfferHash",
    published.acceptedOfferHash,
    lifecycle.initialProjection.acceptedOfferHash
  );
  if (Number(published.version) !== 1) {
    fail("credit_registry_event_mismatch", "published version must be 1");
  }
  if (!input.resumeProofUpdateTransactionHash) {
    await waitForAuthorizationState({
      publicClient,
      adapter,
      contractAddress,
      projection: lifecycle.initialProjection,
      expectedVersion: 1,
      expectedStatus: "active"
    });
  }

  const update = adapter.prepareUpdate({
    authorizationHash: lifecycle.initialProjection.authorizationHash,
    expectedVersion: 1,
    creditStateHash: lifecycle.repaidCreditStateHash,
    obligationProofHash: lifecycle.repaymentProofHash
  });
  const updateReceipt = input.resumeProofUpdateTransactionHash
    ? await acceptExisting({
      transactionHash: input.resumeProofUpdateTransactionHash,
      expectedNonce: 2,
      to: update.to,
      data: update.data
    })
    : await submit({ to: update.to, data: update.data });
  const updated = exactEvent(
    updateReceipt,
    contractAddress,
    artifact.abi,
    "AuthorizationProofUpdated"
  );
  equalHash(
    "updated authorizationHash",
    updated.authorizationHash,
    lifecycle.initialProjection.authorizationHash
  );
  equalHash(
    "repayment creditStateHash",
    updated.creditStateHash,
    lifecycle.repaidCreditStateHash
  );
  equalHash(
    "repayment obligationProofHash",
    updated.obligationProofHash,
    lifecycle.repaymentProofHash
  );
  if (Number(updated.version) !== 2) {
    fail("credit_registry_event_mismatch", "updated version must be 2");
  }
  if (!input.resumeCloseTransactionHash) {
    await waitForAuthorizationState({
      publicClient,
      adapter,
      contractAddress,
      projection: lifecycle.repaidProjection,
      expectedVersion: 2,
      expectedStatus: "active"
    });
  }

  const close = adapter.prepareClose({
    authorizationHash: lifecycle.initialProjection.authorizationHash,
    expectedVersion: 2,
    obligationProofHash: lifecycle.settledObligationProofHash
  });
  const closeReceipt = input.resumeCloseTransactionHash
    ? await acceptExisting({
      transactionHash: input.resumeCloseTransactionHash,
      expectedNonce: 3,
      to: close.to,
      data: close.data
    })
    : await submit({ to: close.to, data: close.data });
  const closed = exactEvent(
    closeReceipt,
    contractAddress,
    artifact.abi,
    "AuthorizationStatusChanged"
  );
  equalHash(
    "closed authorizationHash",
    closed.authorizationHash,
    lifecycle.initialProjection.authorizationHash
  );
  equalHash(
    "settled obligationProofHash",
    closed.obligationProofHash,
    lifecycle.settledObligationProofHash
  );
  if (Number(closed.status) !== 4 || Number(closed.version) !== 3) {
    fail(
      "credit_registry_event_mismatch",
      "closed event must contain Closed status and version 3"
    );
  }
  await waitForAuthorizationState({
    publicClient,
    adapter,
    contractAddress,
    projection: lifecycle.settledProjection,
    expectedVersion: 3,
    expectedStatus: "closed"
  });

  const pauseData = encodeFunctionData({
    abi: artifact.abi,
    functionName: "setPaused",
    args: [true]
  });
  const pauseReceipt = input.resumePauseTransactionHash
    ? await acceptExisting({
      transactionHash: input.resumePauseTransactionHash,
      expectedNonce: 4,
      to: contractAddress,
      data: pauseData
    })
    : await submit({ to: contractAddress, data: pauseData });
  const pauseEvent = exactEvent(
    pauseReceipt,
    contractAddress,
    artifact.abi,
    "RegistryPauseChanged"
  );
  if (pauseEvent.paused !== true) {
    fail("credit_registry_event_mismatch", "Registry pause event must be true");
  }
  if (
    transactionHashes.length !== MAX_TRANSACTION_COUNT ||
    receipts.length !== MAX_TRANSACTION_COUNT
  ) {
    fail(
      "credit_registry_transaction_count_mismatch",
      "CHAIN-001D requires exactly five transactions"
    );
  }

  const finalState = await decodeAuthorization(
    publicClient,
    adapter,
    contractAddress,
    lifecycle.initialProjection.authorizationHash
  );
  const reconciliation = adapter.reconcile(
    lifecycle.settledProjection,
    finalState
  );
  const paused = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "paused"
  });
  const active = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "isActive",
    args: [lifecycle.initialProjection.authorizationHash]
  });
  if (
    !reconciliation.reconciled ||
    reconciliation.differences.length > 0 ||
    finalState.status !== "closed" ||
    finalState.version !== 3 ||
    paused !== true ||
    active !== false
  ) {
    fail(
      "credit_registry_reconciliation_failed",
      "final chain state does not match the closed local projection"
    );
  }

  await verifyReceipts(publicClient, receipts, transactionHashes);
  const safeBlock = await waitForSafeBlock(
    publicClient,
    pauseReceipt.blockNumber
  );
  const gasSpent = receipts.reduce(
    (total, receipt) => total + receipt.gasUsed * receipt.effectiveGasPrice,
    0n
  );
  if (gasSpent > MAX_RUN_GAS_WEI) {
    fail(
      "credit_registry_gas_cap_exceeded",
      "actual Base Sepolia gas exceeds the approved CHAIN-001D cap"
    );
  }
  const receiptBlocks = receipts.map((receipt) => Object.freeze({
    number: receipt.blockNumber.toString(),
    hash: receipt.blockHash
  }));
  const finalityProofHash = hashId("credit_registry_live_finality", {
    chainId: input.chainId,
    contractAddress,
    transactionHashes,
    receiptBlocks,
    safeBlockNumber: safeBlock.number.toString(),
    safeBlockHash: safeBlock.hash
  });
  const redactedReceipt = Object.freeze({
    chainId: input.chainId,
    providerSlot: input.providerSlot,
    runIdHash: preflight.runIdHash,
    operatorIdHash: preflight.operatorIdHash,
    deployerAddress: account.address,
    contractAddress,
    runtimeBytecodeHash: keccak256(runtimeCode),
    creationBytecodeHash: preflight.creationBytecodeHash,
    authorizationHash: lifecycle.initialProjection.authorizationHash,
    subjectAccountHash: lifecycle.initialProjection.subjectAccountHash,
    acceptedOfferHash: lifecycle.initialProjection.acceptedOfferHash,
    policyHash: lifecycle.initialProjection.policyHash,
    providerScopeHash: lifecycle.initialProjection.providerScopeHash,
    initialCreditStateHash: lifecycle.initialProjection.creditStateHash,
    repaidCreditStateHash: lifecycle.repaidCreditStateHash,
    initialObligationProofHash: lifecycle.initialProjection.obligationProofHash,
    repaymentProofHash: lifecycle.repaymentProofHash,
    settledObligationProofHash: lifecycle.settledObligationProofHash,
    deploymentTransactionHash: transactionHashes[0],
    publicationTransactionHash: transactionHashes[1],
    proofUpdateTransactionHash: transactionHashes[2],
    closeTransactionHash: transactionHashes[3],
    pauseTransactionHash: transactionHashes[4],
    receiptBlocks,
    safeBlockNumber: safeBlock.number.toString(),
    safeBlockHash: safeBlock.hash,
    finalityProofHash,
    finalStatus: finalState.status,
    finalVersion: finalState.version,
    registryPaused: paused,
    authorizationActive: active,
    reconciliation,
    transactionCount: transactionHashes.length,
    valueTransferredWei: "0",
    gasSpentTestnetWei: gasSpent.toString(),
    syntheticOnly: true,
    privateKeyIncluded: false,
    rawSignatureIncluded: false,
    rawPiiIncluded: false,
    realProductAccountIncluded: false,
    productionFundsMoved: false,
    realAssetMoved: false,
    liveTestnetExecution: true,
    schemaVersion: "credit_registry_live_run_receipt.v1"
  });
  const output = await writeRedactedRunReceipt({
    input,
    result: redactedReceipt,
    keyFile: input.keyFile
  });
  recoveryState.keyLogicallyDestroyed = output.result.keyLogicallyDestroyed;
  return output;
}

async function recordFailure(input, recoveryState, error) {
  const code = String(error?.message ?? "credit_registry_run_failed").split(":", 1)[0];
  await mkdir(new URL(`file://${KEY_DIRECTORY}/`), {
    recursive: true,
    mode: 0o700
  });
  const recoveryUrl = new URL(
    `file://${KEY_DIRECTORY}/recovery-${Date.now()}-credit-registry.json`
  );
  const recovery = {
    chainId: input?.chainId ?? CHAIN_ID,
    runIdHash: input?.runId
      ? hashId("credit_registry_testnet_run", {
        chainId: input.chainId,
        runId: input.runId
      })
      : undefined,
    ...recoveryState,
    errorCode: code,
    keyRetainedForRecovery: recoveryState.keyLogicallyDestroyed !== true,
    privateKeyIncluded: false,
    rawSignatureIncluded: false,
    recoveryCommand: recoveryState.contractAddress
      ? "pnpm run testnet:credit-registry:emergency:pause"
      : "pnpm run testnet:key:destroy",
    recordedAt: new Date().toISOString(),
    schemaVersion: "credit_registry_live_recovery.v1"
  };
  await writeFile(recoveryUrl, `${JSON.stringify(recovery, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  return { ...recovery, recoveryPath: recoveryUrl.pathname };
}

async function main() {
  const input = readCreditRegistryRuntimeInput();
  const recoveryState = {
    contractAddress: undefined,
    transactionCount: 0,
    keyLogicallyDestroyed: false
  };
  try {
    const output = await runCreditRegistryOnce(input, { recoveryState });
    process.stdout.write(`${JSON.stringify({
      ...output.result,
      artifactPath: output.artifactPath
    }, null, 2)}\n`);
  } catch (error) {
    const recovery = await recordFailure(input, recoveryState, error);
    process.stderr.write(`${JSON.stringify(recovery, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
