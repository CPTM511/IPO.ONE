import { DomainError } from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  X_LAYER_TESTNET_PROFILE
} from "../../chain-adapter/src/index.js";

const CONFIGS = Object.freeze({
  "eip155:84532": Object.freeze({
    chainId: "eip155:84532",
    numericChainId: 84532,
    profile: BASE_SEPOLIA_PROFILE,
    rpcSlots: Object.freeze({
      primary: "https://sepolia.base.org/",
      secondary: "https://base-sepolia-rpc.publicnode.com/"
    }),
    explorerBaseUrl: "https://sepolia-explorer.base.org",
    finalityMode: "rpc_safe_finalized_tags",
    maxFaucetBalanceWei: "100000000000000000"
  }),
  "eip155:1952": Object.freeze({
    chainId: "eip155:1952",
    numericChainId: 1952,
    profile: X_LAYER_TESTNET_PROFILE,
    rpcSlots: Object.freeze({
      primary: "https://testrpc.xlayer.tech/terigon",
      secondary: "https://xlayertestrpc.okx.com/terigon"
    }),
    explorerBaseUrl: "https://www.okx.com/web3/explorer/xlayer-test",
    finalityMode: "inclusion_only",
    maxFaucetBalanceWei: "200000000000000000"
  })
});

function fail(message) {
  throw new DomainError("invalid_live_testnet_config", message);
}

export function getLiveTestnetConfig(chainId) {
  const config = CONFIGS[chainId];
  if (!config) fail("only the two approved CHAIN-001B test profiles are available");
  return structuredClone(config);
}

export function resolveApprovedRpc({ chainId, providerSlot, rpcUrl }) {
  if (!providerSlot || !new Set(["primary", "secondary"]).has(providerSlot)) {
    fail("providerSlot must be an approved logical slot");
  }
  const config = getLiveTestnetConfig(chainId);
  const expected = new URL(config.rpcSlots[providerSlot]);
  let actual;
  try {
    actual = new URL(rpcUrl ?? expected.href);
  } catch {
    fail("RPC URL is invalid");
  }
  if (
    actual.protocol !== "https:" ||
    actual.username ||
    actual.password ||
    actual.search ||
    actual.hash ||
    actual.href !== expected.href
  ) fail("RPC URL must exactly match the approved public testnet endpoint");
  return Object.freeze({ config, rpcUrl: actual.href, providerSlot });
}

export function listLiveTestnetConfigs() {
  return Object.keys(CONFIGS).sort().map(getLiveTestnetConfig);
}
