import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../modules/event-indexer/src/index.js";
import { compileSandboxEvidenceEmitter } from "./compile-emitter.mjs";
import { destroyEphemeralTestnetKey, readEphemeralTestnetKey } from "./ephemeral-key.mjs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_RETIRE_GAS_WEI = 5_000_000_000_000_000n;

function fail(message) {
  throw new Error(`emergency_retirement_failed: ${message}`);
}

const chainId = process.env.IPO_ONE_TESTNET_CHAIN_ID;
const providerSlot = process.env.IPO_ONE_TESTNET_PROVIDER_SLOT ?? "primary";
const keyFile = process.env.IPO_ONE_TESTNET_KEY_FILE;
const contractAddress = process.env.IPO_ONE_TESTNET_CONTRACT_ADDRESS;
if (
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY !== "CHAIN-001B" ||
  !new Set(["eip155:84532", "eip155:1952"]).has(chainId) ||
  !keyFile || !ADDRESS.test(contractAddress ?? "")
) fail("closed chain, key file, contract, and runtime acknowledgement are required");

const config = getLiveTestnetConfig(chainId);
const resolved = resolveApprovedRpc({ chainId, providerSlot });
const privateKey = await readEphemeralTestnetKey(keyFile);
const account = privateKeyToAccount(privateKey);
const chain = defineChain({
  id: config.numericChainId,
  name: config.profile.displayName,
  nativeCurrency: { name: "Testnet gas", symbol: chainId === "eip155:84532" ? "ETH" : "OKB", decimals: 18 },
  rpcUrls: { default: { http: [resolved.rpcUrl] } },
  testnet: true
});
const transport = http(resolved.rpcUrl, { retryCount: 0, timeout: 5_000 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });
const artifact = await compileSandboxEvidenceEmitter();
let retired = await publicClient.readContract({ address: contractAddress, abi: artifact.abi, functionName: "retired" });
let retirementTransactionHash;
if (!retired) {
  const gas = await publicClient.estimateContractGas({
    account: account.address,
    address: contractAddress,
    abi: artifact.abi,
    functionName: "retire",
    value: 0n
  });
  const fees = await publicClient.estimateFeesPerGas();
  const gasPrice = fees.maxFeePerGas ?? fees.gasPrice ?? await publicClient.getGasPrice();
  if (gas * gasPrice > MAX_RETIRE_GAS_WEI) fail("retirement gas cap exceeded");
  retirementTransactionHash = await walletClient.writeContract({
    account,
    address: contractAddress,
    abi: artifact.abi,
    functionName: "retire",
    value: 0n
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: retirementTransactionHash,
    confirmations: 1,
    timeout: 120_000,
    pollingInterval: 1_000
  });
  if (receipt.status !== "success") fail("retirement transaction reverted");
  retired = await publicClient.readContract({ address: contractAddress, abi: artifact.abi, functionName: "retired" });
}
if (!retired) fail("retirement state could not be verified");
const destruction = await destroyEphemeralTestnetKey(keyFile);
process.stdout.write(`${JSON.stringify({
  chainId,
  contractAddress,
  retirementTransactionHash,
  contractRetired: true,
  keyLogicallyDestroyed: destruction.logicallyDestroyed,
  valueTransferredWei: "0",
  productionFundsMoved: false,
  schemaVersion: "live_testnet_emergency_retirement.v1"
}, null, 2)}\n`);
