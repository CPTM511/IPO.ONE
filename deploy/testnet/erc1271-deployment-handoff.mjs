import {
  encodeDeployData,
  getAddress,
  keccak256,
  toHex
} from "viem";
import { compileMinimalErc1271TestWallet, materializeMinimalErc1271TestWalletRuntime } from "./compile-erc1271-test-wallet.mjs";
import { prepareMinimalErc1271DeploymentDecision } from "./prepare-erc1271-deployment.mjs";

const BASE_SEPOLIA_RPC = "https://sepolia.base.org/";
const BASE_SEPOLIA_CHAIN_ID = 84532n;
const MAXIMUM_RPC_RESPONSE_BYTES = 128 * 1_024;
const RPC_METHODS = new Set([
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt"
]);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

function quantity(name, value) {
  if (typeof value !== "string" || !HEX_QUANTITY.test(value)) {
    fail("invalid_erc1271_deployment_rpc_response", `${name} is invalid`);
  }
  return BigInt(value);
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_erc1271_deployment_rpc_response", `${name} is invalid`);
  }
  return value.toLowerCase();
}

function hexData(name, value) {
  if (typeof value !== "string" || !HEX_DATA.test(value)) {
    fail("invalid_erc1271_deployment_rpc_response", `${name} is invalid`);
  }
  return value.toLowerCase();
}

function address(name, value) {
  try {
    return getAddress(value);
  } catch {
    fail("invalid_erc1271_deployment_rpc_response", `${name} is invalid`);
  }
}

async function boundedJson(response) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAXIMUM_RPC_RESPONSE_BYTES) {
    fail("invalid_erc1271_deployment_rpc_response", "RPC response is too large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAXIMUM_RPC_RESPONSE_BYTES) {
    fail("invalid_erc1271_deployment_rpc_response", "RPC response is too large");
  }
  try {
    return JSON.parse(text);
  } catch {
    fail("invalid_erc1271_deployment_rpc_response", "RPC returned invalid JSON");
  }
}

function createRpcClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    fail("invalid_erc1271_deployment_handoff", "fetch implementation is invalid");
  }
  let sequence = 0;
  return Object.freeze({
    async call(method, params = []) {
      if (!RPC_METHODS.has(method) || !Array.isArray(params)) {
        fail("erc1271_deployment_rpc_method_denied", "RPC method is not approved");
      }
      const id = ++sequence;
      let response;
      try {
        response = await fetchImpl(BASE_SEPOLIA_RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(8_000)
        });
      } catch {
        fail("erc1271_deployment_rpc_unavailable", "Base Sepolia RPC request failed");
      }
      if (!response?.ok) {
        fail("erc1271_deployment_rpc_unavailable", "Base Sepolia RPC request failed");
      }
      const document = await boundedJson(response);
      if (
        !document ||
        typeof document !== "object" ||
        Array.isArray(document) ||
        document.jsonrpc !== "2.0" ||
        document.id !== id ||
        (Object.hasOwn(document, "result") === Object.hasOwn(document, "error"))
      ) {
        fail("invalid_erc1271_deployment_rpc_response", "RPC envelope is invalid");
      }
      if (Object.hasOwn(document, "error")) {
        fail("erc1271_deployment_rpc_rejected", "Base Sepolia RPC rejected the request");
      }
      return structuredClone(document.result);
    }
  });
}

function checkedBlock(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.number !== "string" ||
    typeof value.hash !== "string" ||
    typeof value.timestamp !== "string"
  ) {
    fail("invalid_erc1271_deployment_rpc_response", "block is invalid");
  }
  return Object.freeze({
    number: quantity("block number", value.number),
    numberHex: value.number.toLowerCase(),
    hash: hash("block hash", value.hash),
    timestamp: new Date(Number(quantity("block timestamp", value.timestamp)) * 1_000).toISOString()
  });
}

function checkedDecisionAddress(name, value) {
  try {
    return getAddress(value);
  } catch {
    fail("invalid_erc1271_deployment_handoff", `${name} is invalid`);
  }
}

export async function createMinimalErc1271DeploymentHandoff({
  decision,
  fetchImpl = globalThis.fetch,
  clock = () => new Date()
}) {
  const preflight = await prepareMinimalErc1271DeploymentDecision(decision, { clock });
  const artifact = await compileMinimalErc1271TestWallet();
  const instanceRuntime = materializeMinimalErc1271TestWalletRuntime({
    artifact,
    ownerAddress: decision.ownerAddress,
    expiresAt: decision.contractExpiresAt
  });
  if (
    instanceRuntime.deployedBytecodeKeccak256 !==
      preflight.expectedInstanceDeployedBytecodeKeccak256
  ) {
    fail("erc1271_deployment_instance_hash_drift", "instance runtime hash changed");
  }
  const ownerAddress = checkedDecisionAddress("ownerAddress", decision.ownerAddress);
  const deployerAddress = checkedDecisionAddress(
    "deployerAddress",
    decision.deployerAddress
  );
  const expiresAtSeconds = BigInt(
    new Date(decision.contractExpiresAt).getTime() / 1_000
  );
  const deploymentData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [ownerAddress, expiresAtSeconds]
  }).toLowerCase();
  const rpc = createRpcClient({ fetchImpl });
  const maximumBalance = BigInt(decision.caps.maximumFaucetBalanceWei);
  const maximumGas = BigInt(decision.caps.gasLimit);
  const maximumFeePerGas = BigInt(decision.caps.maxFeePerGasWei);

  async function assertChain() {
    const chainId = quantity("chain ID", await rpc.call("eth_chainId"));
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      fail("erc1271_deployment_chain_mismatch", "RPC did not report Base Sepolia");
    }
  }

  async function inspect() {
    await assertChain();
    const safeBlock = checkedBlock(
      await rpc.call("eth_getBlockByNumber", ["safe", false])
    );
    const [balanceValue, codeValue, gasPriceValue, simulatedRuntime] =
      await Promise.all([
        rpc.call("eth_getBalance", [deployerAddress, safeBlock.numberHex]),
        rpc.call("eth_getCode", [deployerAddress, safeBlock.numberHex]),
        rpc.call("eth_gasPrice"),
        rpc.call("eth_call", [{
          from: deployerAddress,
          data: deploymentData,
          value: "0x0"
        }, safeBlock.numberHex])
      ]);
    const balance = quantity("deployer balance", balanceValue);
    const gasPrice = quantity("gas price", gasPriceValue);
    if (hexData("deployer code", codeValue) !== "0x") {
      fail("erc1271_deployer_not_eoa", "approved deployer is not an EOA");
    }
    const simulated = hexData("simulated runtime", simulatedRuntime);
    if (
      keccak256(simulated) !==
      instanceRuntime.deployedBytecodeKeccak256
    ) {
      fail(
        "erc1271_deployment_constructor_simulation_mismatch",
        "constructor simulation did not return the approved instance runtime"
      );
    }
    const balanceWithinCap = balance <= maximumBalance;
    return Object.freeze({
      schemaVersion: "wallet_003_erc1271_deployment_inspection.v1",
      decisionId: decision.decisionId,
      chainId: "eip155:84532",
      safeBlockNumber: safeBlock.number.toString(),
      safeBlockHash: safeBlock.hash,
      safeBlockTimestamp: safeBlock.timestamp,
      balanceWei: balance.toString(),
      maximumBalanceWei: maximumBalance.toString(),
      balanceWithinCap,
      gasPriceWei: gasPrice.toString(),
      expectedInstanceDeployedBytecodeKeccak256:
        instanceRuntime.deployedBytecodeKeccak256,
      constructorSimulationMatched: true,
      deployerClassifiedAsEoa: true,
      transactionBuilt: false,
      transactionSigned: false,
      transactionBroadcast: false,
      productionFundsMoved: false
    });
  }

  async function buildUnsignedTransaction() {
    const inspection = await inspect();
    const balance = BigInt(inspection.balanceWei);
    if (!inspection.balanceWithinCap) {
      fail("erc1271_deployment_balance_cap_exceeded", "deployer balance exceeds approved cap");
    }
    const estimate = quantity(
      "estimated gas",
      await rpc.call("eth_estimateGas", [{
        from: deployerAddress,
        data: deploymentData,
        value: "0x0"
      }])
    );
    const gas = (estimate * 120n + 99n) / 100n;
    if (gas > maximumGas) {
      fail("erc1271_deployment_gas_cap_exceeded", "estimated gas exceeds approved cap");
    }
    const observedGasPrice = BigInt(inspection.gasPriceWei);
    const maxFeePerGas = [
      maximumFeePerGas,
      observedGasPrice * 2n,
      10_000_000n
    ].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)[1];
    if (maxFeePerGas > maximumFeePerGas) {
      fail("erc1271_deployment_fee_cap_exceeded", "fee exceeds approved cap");
    }
    const maxPriorityFeePerGas = maxFeePerGas < 1_000_000n
      ? maxFeePerGas
      : 1_000_000n;
    const maximumCost = gas * maxFeePerGas;
    if (balance < maximumCost) {
      fail("erc1271_deployment_balance_insufficient", "deployer needs Testnet gas");
    }
    return Object.freeze({
      schemaVersion: "wallet_003_erc1271_unsigned_transaction.v1",
      decisionId: decision.decisionId,
      chainId: "0x14a34",
      transaction: Object.freeze({
        from: deployerAddress,
        data: deploymentData,
        value: "0x0",
        gas: toHex(gas),
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas)
      }),
      estimatedGas: estimate.toString(),
      gasLimit: gas.toString(),
      maximumCostWei: maximumCost.toString(),
      approvedMaximumGas: maximumGas.toString(),
      approvedMaximumFeePerGasWei: maximumFeePerGas.toString(),
      expectedInstanceDeployedBytecodeKeccak256:
        instanceRuntime.deployedBytecodeKeccak256,
      keyMaterialAccepted: false,
      transactionBuilt: true,
      transactionSigned: false,
      transactionBroadcast: false,
      productionFundsMoved: false
    });
  }

  async function observe(transactionHash) {
    if (typeof transactionHash !== "string" || !HASH.test(transactionHash)) {
      fail("invalid_erc1271_deployment_transaction_hash", "transaction hash is invalid");
    }
    await assertChain();
    const [transaction, receipt] = await Promise.all([
      rpc.call("eth_getTransactionByHash", [transactionHash]),
      rpc.call("eth_getTransactionReceipt", [transactionHash])
    ]);
    if (transaction === null || receipt === null) {
      return Object.freeze({
        schemaVersion: "wallet_003_erc1271_deployment_observation.v1",
        status: "pending",
        transactionHash: transactionHash.toLowerCase(),
        productionFundsMoved: false
      });
    }
    if (
      !transaction ||
      typeof transaction !== "object" ||
      Array.isArray(transaction) ||
      !receipt ||
      typeof receipt !== "object" ||
      Array.isArray(receipt)
    ) {
      fail("invalid_erc1271_deployment_rpc_response", "transaction or receipt is invalid");
    }
    const from = address("transaction from", transaction.from);
    const value = quantity("transaction value", transaction.value);
    const gas = quantity("transaction gas", transaction.gas);
    const maxFeePerGas = quantity(
      "transaction max fee",
      transaction.maxFeePerGas
    );
    if (
      from !== deployerAddress ||
      transaction.to !== null ||
      hexData("transaction input", transaction.input) !== deploymentData ||
      value !== 0n ||
      gas > maximumGas ||
      maxFeePerGas > maximumFeePerGas
    ) {
      fail("erc1271_deployment_transaction_drift", "mined transaction exceeds approved scope");
    }
    if (quantity("receipt status", receipt.status) !== 1n) {
      fail("erc1271_deployment_transaction_failed", "deployment transaction failed");
    }
    const contractAddress = address("contract address", receipt.contractAddress);
    const receiptBlockNumber = quantity("receipt block number", receipt.blockNumber);
    const receiptBlockHash = hash("receipt block hash", receipt.blockHash);
    const safeBlock = checkedBlock(
      await rpc.call("eth_getBlockByNumber", ["safe", false])
    );
    if (safeBlock.number < receiptBlockNumber) {
      return Object.freeze({
        schemaVersion: "wallet_003_erc1271_deployment_observation.v1",
        status: "included_awaiting_safe",
        transactionHash: transactionHash.toLowerCase(),
        contractAddress,
        receiptBlockNumber: receiptBlockNumber.toString(),
        receiptBlockHash,
        safeBlockNumber: safeBlock.number.toString(),
        productionFundsMoved: false
      });
    }
    const code = hexData(
      "deployed code",
      await rpc.call("eth_getCode", [contractAddress, safeBlock.numberHex])
    );
    if (
      code === "0x" ||
      keccak256(code) !== instanceRuntime.deployedBytecodeKeccak256
    ) {
      fail("erc1271_deployment_code_mismatch", "safe deployed code does not match approved instance");
    }
    return Object.freeze({
      schemaVersion: "wallet_003_erc1271_deployment_observation.v1",
      status: "verified_safe",
      transactionHash: transactionHash.toLowerCase(),
      contractAddress,
      receiptBlockNumber: receiptBlockNumber.toString(),
      receiptBlockHash,
      safeBlockNumber: safeBlock.number.toString(),
      safeBlockHash: safeBlock.hash,
      deployedBytecodeKeccak256: keccak256(code),
      expectedInstanceDeployedBytecodeKeccak256:
        instanceRuntime.deployedBytecodeKeccak256,
      transactionValueWei: value.toString(),
      transactionGasLimit: gas.toString(),
      transactionMaxFeePerGasWei: maxFeePerGas.toString(),
      transactionSignedByHumanWallet: true,
      transactionBroadcastByHumanWallet: true,
      productionFundsMoved: false
    });
  }

  return Object.freeze({
    inspect,
    buildUnsignedTransaction,
    observe,
    descriptor: Object.freeze({
      schemaVersion: "wallet_003_erc1271_deployment_handoff.v1",
      decisionId: decision.decisionId,
      chainId: "eip155:84532",
      rpcEndpoint: BASE_SEPOLIA_RPC,
      rpcMethods: Object.freeze([...RPC_METHODS].sort()),
      ownerAddress,
      deployerAddress,
      contractExpiresAt: decision.contractExpiresAt,
      expectedInstanceDeployedBytecodeKeccak256:
        instanceRuntime.deployedBytecodeKeccak256,
      keyMaterialAccepted: false,
      signingAuthority: "external_human_wallet_only",
      productionFundsMoved: false
    })
  });
}
