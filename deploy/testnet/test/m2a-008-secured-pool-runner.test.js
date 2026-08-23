import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getContractAddress, keccak256 } from "viem";
import {
  M2A008_ETH_USD_FEED,
  M2A008_TEST_USDC,
  M2A008_WETH
} from "../m2a-008-secured-pool-preflight.mjs";
import {
  assertM2A008DeploymentReceipt,
  assertM2A008GasAndBalance,
  assertM2A008PolicyBinding,
  buildM2A008DeploymentPlan,
  m2a008ConfigurationHash
} from "../m2a-008-secured-pool-runner.mjs";
import { parseCanonicalJson } from "../../../packages/release-governance/src/index.js";

const DEPLOYER = "0x9999999999999999999999999999999999999999";
const ADAPTER = getContractAddress({ from: DEPLOYER, nonce: 0n });
const POOL = getContractAddress({ from: DEPLOYER, nonce: 1n });
const SOURCE_ID = keccak256(new TextEncoder().encode("chainlink_base_sepolia_eth_usd.v1"));

function decision() {
  return {
    schemaVersion: "m2a_008_exact_deployment_decision.v1",
    decisionId: "M2A-008-BASE-SEPOLIA-20260823-001",
    decision: "APPROVE",
    chainId: "eip155:84532",
    releaseCommitSha: "a".repeat(40),
    approvedAt: "2026-08-23T00:00:00.000Z",
    approvalExpiresAt: "2026-08-24T00:00:00.000Z",
    deploymentApprovalRef: "M2A-008-DEPLOY-20260823-001",
    launchEvidenceSha256: `sha256:${"b".repeat(64)}`,
    addresses: {
      wethCollateral: M2A008_WETH,
      testUsdcDebt: M2A008_TEST_USDC,
      priceFeed: M2A008_ETH_USD_FEED,
      deployer: DEPLOYER,
      expectedOracleAdapter: ADAPTER,
      expectedPool: POOL,
      pauseGuardian: "0x1111111111111111111111111111111111111111",
      recoveryAuthority: "0x2222222222222222222222222222222222222222"
    },
    risk: {
      marketDebtCapAssets: "1000000000",
      borrowerDebtCapAssets: "100000000",
      loanToValueBps: 5000
    },
    oracle: {
      sourceId: SOURCE_ID,
      sourceLabel: "chainlink_base_sepolia_eth_usd.v1",
      feedDecimals: 8,
      maximumAgeSeconds: 3600
    },
    signer: {
      keyFile: "/private/tmp/ipo-one-m2a-008/deployer.key",
      purpose: "M2A-008 exact Base Sepolia deployment only",
      startingNonce: 0,
      priorSignerReuse: false,
      destroyAfterRun: true
    },
    transactionCaps: {
      deploymentCount: 2,
      nativeValueWei: "0",
      expectedStartingBalanceWei: "20000000000000000",
      maximumFaucetBalanceWei: "100000000000000000",
      maximumTotalGasCostWei: "20000000000000000"
    },
    deploymentAuthorized: true,
    testAssetsOnly: true,
    mainnetAuthorized: false,
    realFundsAuthorized: false
  };
}

async function artifacts() {
  const [adapter, pool] = await Promise.all([
    readFile(new URL("../../../out/foundry/IpoOnePriceOracleAdapterV1.sol/IpoOnePriceOracleAdapterV1.json", import.meta.url), "utf8"),
    readFile(new URL("../../../out/foundry/IpoOneSecuredPoolV1.sol/IpoOneSecuredPoolV1.json", import.meta.url), "utf8")
  ]);
  return { adapter: JSON.parse(adapter), pool: JSON.parse(pool) };
}

test("M2A-008 creates exactly two zero-value constructor payloads and one stable configuration hash", async () => {
  const input = decision();
  const plan = buildM2A008DeploymentPlan(input, await artifacts());
  assert.equal(plan.transactionCount, 2);
  assert.equal(plan.nativeValueWei, "0");
  assert.match(plan.adapterData, /^0x[0-9a-f]+$/);
  assert.match(plan.poolData, /^0x[0-9a-f]+$/);
  assert.equal(plan.configurationHash, m2a008ConfigurationHash(input));
  assert.notEqual(plan.adapterCreationBytecodeHash, plan.poolCreationBytecodeHash);
});

test("M2A-008 launch binding requires the exact enabled profile and cannot self-unlock", async () => {
  const policy = parseCanonicalJson(
    await readFile(new URL("../../launch-policy.v1.json", import.meta.url), "utf8"),
    "test policy"
  );
  const input = decision();
  const plan = buildM2A008DeploymentPlan(input, await artifacts());
  assert.throws(
    () => assertM2A008PolicyBinding({ policy, decision: input, plan }),
    /enabled launch profile/
  );
  const enabled = structuredClone(policy);
  enabled.profiles.live_testnet_secured_pool.releaseEnabled = true;
  enabled.profiles.live_testnet_secured_pool.unlockRequirements = [];
  enabled.profiles.live_testnet_secured_pool.exactProfile = {
    chainId: "eip155:84532",
    poolContract: POOL,
    poolBytecodeHash: `0x${"a".repeat(64)}`,
    adapterVersion: "IpoOnePriceOracleAdapterV1",
    wethCollateral: M2A008_WETH,
    testUsdcDebt: M2A008_TEST_USDC,
    oracleAddress: ADAPTER,
    oracleSource: "chainlink_base_sepolia_eth_usd.v1",
    marketCount: 1,
    runOwner: "IPO.ONE Founder / Release Owner",
    deploymentApprovalRef: input.deploymentApprovalRef,
    configurationHash: plan.configurationHash,
    realValueClassification: "test_assets_only"
  };
  assert.equal(
    assertM2A008PolicyBinding({ policy: enabled, decision: input, plan }).releaseEnabled,
    true
  );
  enabled.profiles.live_testnet_secured_pool.exactProfile.configurationHash = `0x${"c".repeat(64)}`;
  assert.throws(
    () => assertM2A008PolicyBinding({ policy: enabled, decision: input, plan }),
    /exactly bind/
  );
});

test("M2A-008 requires an exact faucet balance and worst-case gas inside both caps", () => {
  assert.equal(assertM2A008GasAndBalance({
    balance: 20_000_000_000_000_000n,
    expectedBalance: 20_000_000_000_000_000n,
    maximumBalance: 100_000_000_000_000_000n,
    maximumFeePerGas: 1_000_000_000n,
    maximumTotalGasCost: 20_000_000_000_000_000n
  }), 12_000_000_000_000_000n);
  for (const values of [
    { balance: 19_999_999_999_999_999n, maximumFeePerGas: 1n },
    { balance: 100_000_000_000_000_001n, maximumFeePerGas: 1n },
    { balance: 20_000_000_000_000_000n, maximumFeePerGas: 2_000_000_000n }
  ]) {
    assert.throws(() => assertM2A008GasAndBalance({
      expectedBalance: 20_000_000_000_000_000n,
      maximumBalance: 100_000_000_000_000_000n,
      maximumTotalGasCost: 20_000_000_000_000_000n,
      ...values
    }), /balance or.*gas/);
  }
});

test("M2A-008 receipt binding rejects sender, nonce, value, calldata or address drift", () => {
  const hash = `0x${"1".repeat(64)}`;
  const blockHash = `0x${"2".repeat(64)}`;
  const transaction = {
    hash,
    from: DEPLOYER,
    to: null,
    chainId: 84532,
    nonce: 0,
    value: 0n,
    input: "0x6000",
    blockNumber: 100n,
    blockHash
  };
  const receipt = {
    transactionHash: hash,
    status: "success",
    contractAddress: ADAPTER,
    blockNumber: 100n,
    blockHash
  };
  assert.equal(assertM2A008DeploymentReceipt({
    transaction,
    receipt,
    expectedSender: DEPLOYER,
    expectedNonce: 0,
    expectedData: "0x6000",
    expectedContract: ADAPTER
  }), true);
  assert.throws(() => assertM2A008DeploymentReceipt({
    transaction: { ...transaction, value: 1n },
    receipt,
    expectedSender: DEPLOYER,
    expectedNonce: 0,
    expectedData: "0x6000",
    expectedContract: ADAPTER
  }), /deployment.*receipt.*invalid/);
});

test("M2A-008 live runner has a wallet only behind the closed runner and never reads an environment private key", async () => {
  const [runner, preflight, reconciliation] = await Promise.all([
    readFile(new URL("../m2a-008-secured-pool-runner.mjs", import.meta.url), "utf8"),
    readFile(new URL("../m2a-008-secured-pool-preflight.mjs", import.meta.url), "utf8"),
    readFile(new URL("../m2a-008-secured-pool-reconcile.mjs", import.meta.url), "utf8")
  ]);
  assert.match(runner, /createWalletClient/);
  assert.doesNotMatch(runner, /process\.env\.(?:PRIVATE_KEY|DEPLOYER_PRIVATE_KEY)/);
  assert.doesNotMatch(preflight, /createWalletClient|sendTransaction|deployContract/);
  assert.doesNotMatch(reconciliation, /createWalletClient|sendTransaction|deployContract|readEphemeralTestnetKey/);
});
