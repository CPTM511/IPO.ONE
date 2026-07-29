import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../../modules/event-indexer/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const CHAIN_ID = "eip155:84532";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DATA = /^0x[0-9a-f]+$/;
const PRIVATE_KEY = /^0x[0-9a-f]{64}$/;
const KEY_DIRECTORY = "/private/tmp/ipo-one-chain-001f";
const MAX_STARTING_BALANCE_WEI = 10_000_000_000_000_000n;
const MAX_TRANSACTION_GAS_COST_WEI = 500_000_000_000_000n;

function fail(code, message) {
  throw new DomainError(code, message);
}

async function readAttestorKey(keyFile) {
  const selected = resolve(keyFile);
  if (
    !selected.startsWith(`${KEY_DIRECTORY}/`) ||
    !selected.endsWith(".key")
  ) {
    fail(
      "invalid_evidence_anchor_attestor",
      "Evidence anchor attestor key path is outside the approved scope"
    );
  }
  const stat = await lstat(selected);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail(
      "invalid_evidence_anchor_attestor",
      "Evidence anchor attestor key must be a regular owner-only file"
    );
  }
  const value = (await readFile(selected, "utf8")).trim();
  if (!PRIVATE_KEY.test(value)) {
    fail(
      "invalid_evidence_anchor_attestor",
      "Evidence anchor attestor key content is invalid"
    );
  }
  return value;
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

export async function createEvidenceAnchorTestnetAttestor({
  contractAddress,
  keyFile,
  providerSlot = "primary"
} = {}) {
  if (
    !ADDRESS.test(contractAddress ?? "") ||
    typeof keyFile !== "string" ||
    !keyFile.startsWith(`${KEY_DIRECTORY}/`) ||
    !keyFile.endsWith(".key") ||
    !new Set(["primary", "secondary"]).has(providerSlot)
  ) {
    fail(
      "invalid_evidence_anchor_attestor",
      "Evidence anchor testnet attestor configuration is invalid"
    );
  }
  const config = getLiveTestnetConfig(CHAIN_ID);
  const resolved = resolveApprovedRpc({
    chainId: CHAIN_ID,
    providerSlot
  });
  const chain = chainFor(config, resolved.rpcUrl);
  const account = privateKeyToAccount(
    await readAttestorKey(keyFile)
  );
  const transport = http(resolved.rpcUrl, {
    retryCount: 0,
    timeout: 5_000
  });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const [remoteChainId, startingBalance] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBalance({ address: account.address })
  ]);
  if (
    remoteChainId !== config.numericChainId ||
    startingBalance > MAX_STARTING_BALANCE_WEI
  ) {
    fail(
      "evidence_anchor_attestor_preflight_failed",
      "Evidence anchor attestor chain or balance cap is invalid"
    );
  }

  return Object.freeze({
    address: account.address,
    sender: Object.freeze({
      async send(transaction) {
        if (
          !transaction ||
          typeof transaction !== "object" ||
          Array.isArray(transaction) ||
          Object.keys(transaction).length !== 5 ||
          transaction.chainId !== CHAIN_ID ||
          transaction.from?.toLowerCase() !== account.address.toLowerCase() ||
          transaction.to?.toLowerCase() !== contractAddress.toLowerCase() ||
          transaction.value !== "0x0" ||
          !DATA.test(transaction.data ?? "")
        ) {
          fail(
            "evidence_anchor_attestor_transaction_rejected",
            "Attestor accepts only exact zero-value Registry calldata"
          );
        }
        const gasEstimate = await publicClient.estimateGas({
          account: account.address,
          to: contractAddress,
          data: transaction.data,
          value: 0n
        });
        const fees = await publicClient.estimateFeesPerGas();
        const gasPrice =
          fees.maxFeePerGas ?? fees.gasPrice ?? await publicClient.getGasPrice();
        const gas = gasEstimate + gasEstimate / 5n;
        if (gas * gasPrice > MAX_TRANSACTION_GAS_COST_WEI) {
          fail(
            "evidence_anchor_attestor_gas_cap_exceeded",
            "Evidence anchor transaction exceeds the testnet gas cap"
          );
        }
        const transactionHash = await walletClient.sendTransaction({
          account,
          chain,
          to: contractAddress,
          data: transaction.data,
          value: 0n,
          gas
        });
        return Object.freeze({
          transactionHash: transactionHash.toLowerCase(),
          outcome: "broadcast",
          nativeValue: "0",
          rawPrivateKeyIncluded: false,
          schemaVersion: "evidence_anchor_attestor_submission.v1"
        });
      }
    }),
    descriptor: Object.freeze({
      chainId: CHAIN_ID,
      contractAddress,
      accountId: `${CHAIN_ID}:${account.address}`,
      providerSlot,
      maximumStartingBalanceWei: MAX_STARTING_BALANCE_WEI.toString(),
      maximumTransactionGasCostWei:
        MAX_TRANSACTION_GAS_COST_WEI.toString(),
      nativeValue: "0",
      arbitraryCallsAllowed: false,
      rawPrivateKeyIncluded: false,
      schemaVersion: "evidence_anchor_testnet_attestor.v1"
    })
  });
}
