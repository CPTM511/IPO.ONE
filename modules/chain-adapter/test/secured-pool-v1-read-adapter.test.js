import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  keccak256,
  parseAbi
} from "viem";
import {
  accountFromPoolBinding,
  createSecuredPoolV1ReadAdapter
} from "../src/secured-pool-v1-read-adapter.js";

const POOL = "0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da";
const ORACLE = "0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19";
const DEBT = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const COLLATERAL = "0x4200000000000000000000000000000000000006";
const FEED = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
const GUARDIAN = "0x8a1E62C539B802c8a204382442cA7a8caC31f19E";
const RECOVERY = "0x730766ff23D3c4366f3314c8895330fC589AA546";
const MARKET_ID = "0x47532f3aab0c30648bc01029b09b586f67bfc0c91fddbbb6b2100ae87b1459cf";
const SOURCE_LABEL = "chainlink_base_sepolia_eth_usd.v1";
const SOURCE_ID = keccak256(new TextEncoder().encode(SOURCE_LABEL));
const BYTECODE = "0x600160005260206000f3";

const POOL_ABI = parseAbi([
  "function marketId() view returns (bytes32)",
  "function marketChainId() view returns (uint256)",
  "function debtAsset() view returns (address)",
  "function collateralAsset() view returns (address)",
  "function priceOracle() view returns (address)",
  "function oracleSourceId() view returns (bytes32)",
  "function marketDebtCapAssets() view returns (uint256)",
  "function borrowerDebtCapAssets() view returns (uint256)",
  "function loanToValueBps() view returns (uint16)",
  "function LIQUIDATION_THRESHOLD_BPS() view returns (uint256)",
  "function pauseGuardian() view returns (address)",
  "function recoveryAuthority() view returns (address)",
  "function cashAssets() view returns (uint256)",
  "function grossDebtAssets() view returns (uint256)",
  "function reservesAssets() view returns (uint256)",
  "function badDebtAssets() view returns (uint256)",
  "function totalSupplyShares() view returns (uint256)",
  "function totalDebtShares() view returns (uint256)",
  "function lastAccruedAt() view returns (uint256)",
  "function acceptedPriceUsdWad() view returns (uint256)",
  "function acceptedOracleObservedAt() view returns (uint64)",
  "function acceptedOracleRoundId() view returns (uint80)",
  "function oracleDeviationHalted() view returns (bool)",
  "function newRiskPaused() view returns (bool)",
  "function position(address account) view returns ((uint256 supplyShares, uint256 collateralAssets, uint256 debtShares, uint256 supplyClaimAssets, uint256 performingDebtAssets, uint256 badDebtAssets, uint256 totalOutstandingDebtAssets))"
]);
const ORACLE_ABI = parseAbi([
  "function marketChainId() view returns (uint256)",
  "function asset() view returns (address)",
  "function feed() view returns (address)",
  "function sourceId() view returns (bytes32)",
  "function feedDecimals() view returns (uint8)"
]);

const VALUES = Object.freeze({
  marketId: MARKET_ID,
  marketChainId: 84532n,
  debtAsset: DEBT,
  collateralAsset: COLLATERAL,
  priceOracle: ORACLE,
  oracleSourceId: SOURCE_ID,
  marketDebtCapAssets: 1_000_000_000n,
  borrowerDebtCapAssets: 100_000_000n,
  loanToValueBps: 7_000,
  LIQUIDATION_THRESHOLD_BPS: 8_000n,
  pauseGuardian: GUARDIAN,
  recoveryAuthority: RECOVERY,
  cashAssets: 0n,
  grossDebtAssets: 0n,
  reservesAssets: 0n,
  badDebtAssets: 0n,
  totalSupplyShares: 0n,
  totalDebtShares: 0n,
  lastAccruedAt: 1_787_788_000n,
  acceptedPriceUsdWad: 2_500_000_000_000_000_000_000n,
  acceptedOracleObservedAt: 1_787_788_700n,
  acceptedOracleRoundId: 1n,
  oracleDeviationHalted: false,
  newRiskPaused: false
});
const ORACLE_VALUES = Object.freeze({
  marketChainId: 84532n,
  asset: COLLATERAL,
  feed: FEED,
  sourceId: SOURCE_ID,
  feedDecimals: 8
});

function configurationHash() {
  return keccak256(encodeAbiParameters(
    [
      { type: "uint256" }, { type: "address" }, { type: "address" },
      { type: "address" }, { type: "address" }, { type: "bytes32" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
      { type: "address" }, { type: "address" }
    ],
    [
      84532n, DEBT, COLLATERAL, FEED, ORACLE, SOURCE_ID,
      VALUES.marketDebtCapAssets, VALUES.borrowerDebtCapAssets,
      VALUES.loanToValueBps, GUARDIAN, RECOVERY
    ]
  ));
}

function profile() {
  return {
    chainId: "eip155:84532",
    poolContract: POOL,
    poolBytecodeHash: keccak256(BYTECODE),
    adapterVersion: "IpoOnePriceOracleAdapterV1",
    wethCollateral: COLLATERAL,
    testUsdcDebt: DEBT,
    oracleAddress: ORACLE,
    oracleSource: SOURCE_LABEL,
    marketCount: 1,
    runOwner: "Founder",
    deploymentApprovalRef: "M2A-008-DEPLOY-20260824-004",
    configurationHash: configurationHash(),
    realValueClassification: "test_assets_only"
  };
}

function successfulFetch({ failPrimary = false } = {}) {
  return async (url, options) => {
    if (failPrimary && url.includes("primary.example")) {
      return { ok: false, async json() { return {}; } };
    }
    const request = JSON.parse(options.body);
    if (!Array.isArray(request)) {
      return {
        ok: true,
        async json() {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: { number: "0x2be7a20", timestamp: "0x6aef4f20" }
          };
        }
      };
    }
    const result = request.map((item) => {
      if (item.method === "eth_getCode") {
        return { jsonrpc: "2.0", id: item.id, result: BYTECODE };
      }
      const target = item.params[0].to.toLowerCase();
      const abi = target === POOL.toLowerCase() ? POOL_ABI : ORACLE_ABI;
      const decoded = decodeFunctionData({ abi, data: item.params[0].data });
      const values = target === POOL.toLowerCase() ? VALUES : ORACLE_VALUES;
      const value = decoded.functionName === "position"
        ? [0n, 0n, 0n, 0n, 0n, 0n, 0n]
        : values[decoded.functionName];
      return {
        jsonrpc: "2.0",
        id: item.id,
        result: encodeFunctionResult({
          abi,
          functionName: decoded.functionName,
          result: value
        })
      };
    });
    return { ok: true, async json() { return result; } };
  };
}

function providers() {
  return [
    { providerSlot: "primary", rpcUrl: "https://primary.example/" },
    { providerSlot: "secondary", rpcUrl: "https://secondary.example/" }
  ];
}

test("read adapter verifies exact code/config and preserves authoritative zero", async () => {
  const adapter = createSecuredPoolV1ReadAdapter({
    deploymentProfile: profile(),
    providers: providers(),
    fetchImpl: successfulFetch(),
    clock: () => new Date("2026-08-27T00:00:00.000Z")
  });
  const snapshot = await adapter.readSnapshot();
  assert.equal(snapshot.deployment.state, "verified");
  assert.equal(snapshot.rpc.providerSlot, "primary");
  assert.equal(snapshot.state.marketId, MARKET_ID);
  assert.equal(snapshot.state.cashAssets, "0");
  assert.equal(snapshot.state.grossDebtAssets, "0");
  assert.equal(snapshot.position, null);
  assert.equal(snapshot.transactionPrimitivePresent, false);
  assert.equal(adapter.descriptor.readOnly, true);
  assert.equal(Object.hasOwn(adapter, "sendTransaction"), false);
  assert.equal(Object.hasOwn(adapter, "writeContract"), false);
});

test("read adapter fails over only to the second approved read slot", async () => {
  const adapter = createSecuredPoolV1ReadAdapter({
    deploymentProfile: profile(),
    providers: providers(),
    fetchImpl: successfulFetch({ failPrimary: true }),
    clock: () => new Date("2026-08-27T00:00:00.000Z")
  });
  const snapshot = await adapter.readSnapshot();
  assert.equal(snapshot.rpc.providerSlot, "secondary");
  assert.deepEqual(adapter.descriptor.providerSlots, ["primary", "secondary"]);
});

test("Pool AccountBinding extraction is exact and chain-bound", () => {
  assert.equal(
    accountFromPoolBinding("eip155:84532:0x9999999999999999999999999999999999999999"),
    "0x9999999999999999999999999999999999999999"
  );
  assert.equal(
    accountFromPoolBinding("eip155:1:0x9999999999999999999999999999999999999999"),
    null
  );
});
