import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { getContractAddress } from "viem";
import {
  M2A008_ETH_USD_FEED,
  M2A008_TEST_USDC,
  M2A008_WETH,
  assessM2A008LaunchPolicy,
  inspectM2A008ReadOnlyDependencies,
  readM2A008ExactDecision,
  validateM2A008ExactDecision
} from "../m2a-008-secured-pool-preflight.mjs";
import {
  parseCanonicalJson
} from "../../../packages/release-governance/src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const decisionSchema = JSON.parse(await readFile(
  new URL(
    "../../../schemas/v2/m2a-008-exact-deployment-decision.schema.json",
    import.meta.url
  ),
  "utf8"
));
const validateSchema = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false
}).compile(decisionSchema);

const NOW = new Date("2026-08-22T20:00:00.000Z");
const DEPLOYER = "0x9999999999999999999999999999999999999999";
const ORACLE = getContractAddress({ from: DEPLOYER, nonce: 0n });
const POOL = getContractAddress({ from: DEPLOYER, nonce: 1n });

function decision(overrides = {}) {
  const base = {
    schemaVersion: "m2a_008_exact_deployment_decision.v1",
    decisionId: "M2A-008-BASE-SEPOLIA-20260822-001",
    decision: "APPROVE",
    chainId: "eip155:84532",
    releaseCommitSha: "a".repeat(40),
    approvedAt: "2026-08-22T19:45:00.000Z",
    approvalExpiresAt: "2026-08-23T19:45:00.000Z",
    deploymentApprovalRef: "M2A-008-DEPLOY-20260822-001",
    launchEvidenceSha256: `sha256:${"b".repeat(64)}`,
    addresses: {
      wethCollateral: M2A008_WETH,
      testUsdcDebt: M2A008_TEST_USDC,
      priceFeed: M2A008_ETH_USD_FEED,
      deployer: DEPLOYER,
      expectedOracleAdapter: ORACLE,
      expectedPool: POOL,
      pauseGuardian: "0x1111111111111111111111111111111111111111",
      recoveryAuthority: "0x2222222222222222222222222222222222222222"
    },
    testnetRoleCustody: {
      pauseGuardian: {
        controllerRole: "Founder",
        scope: "Base Sepolia test assets only"
      },
      recoveryAuthority: {
        controllerRole: "Founder",
        scope: "Base Sepolia test assets only"
      },
      distinctPrivateKeysAttested: true,
      privateKeysIncluded: false,
      institutionalCustodyRequired: false,
      multisigRequired: false
    },
    risk: {
      marketDebtCapAssets: "1000000000",
      borrowerDebtCapAssets: "100000000",
      loanToValueBps: 5000
    },
    oracle: {
      sourceId: `0x${"3".repeat(64)}`,
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
      expectedStartingBalanceWei: "10000000000000000",
      maximumFaucetBalanceWei: "100000000000000000",
      maximumTotalGasCostWei: "20000000000000000"
    },
    deploymentAuthorized: true,
    testAssetsOnly: true,
    mainnetAuthorized: false,
    realFundsAuthorized: false
  };
  return {
    ...base,
    ...overrides,
    addresses: { ...base.addresses, ...(overrides.addresses ?? {}) },
    testnetRoleCustody: {
      ...base.testnetRoleCustody,
      ...(overrides.testnetRoleCustody ?? {}),
      pauseGuardian: {
        ...base.testnetRoleCustody.pauseGuardian,
        ...(overrides.testnetRoleCustody?.pauseGuardian ?? {})
      },
      recoveryAuthority: {
        ...base.testnetRoleCustody.recoveryAuthority,
        ...(overrides.testnetRoleCustody?.recoveryAuthority ?? {})
      }
    },
    risk: { ...base.risk, ...(overrides.risk ?? {}) },
    oracle: { ...base.oracle, ...(overrides.oracle ?? {}) },
    signer: { ...base.signer, ...(overrides.signer ?? {}) },
    transactionCaps: {
      ...base.transactionCaps,
      ...(overrides.transactionCaps ?? {})
    }
  };
}

test("exact M2A-008 decision validates without creating a transaction", () => {
  const input = decision();
  assert.equal(validateSchema(input), true, JSON.stringify(validateSchema.errors));
  const result = validateM2A008ExactDecision(input, {
    clock: () => NOW,
    expectedCommitSha: "a".repeat(40)
  });
  assert.equal(result.status, "decision_valid");
  assert.equal(result.expectedOracleAdapter, ORACLE);
  assert.equal(result.expectedPool, POOL);
  assert.equal(result.deploymentCount, 2);
  assert.equal(result.nativeValueWei, "0");
  assert.equal(result.testAssetsOnly, true);
  assert.equal(result.mainnetAuthorized, false);
  assert.equal(result.realFundsAuthorized, false);
  assert.equal(result.founderControlledTestnetRoles, true);
  assert.equal(result.distinctRolePrivateKeysAttested, true);
  assert.equal(result.signerKeyMaterialIncluded, false);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.transactionBroadcast, false);
});

test("decision rejects authority, address, nonce, role, expiry and cap drift", () => {
  const cases = [
    decision({ chainId: "eip155:1" }),
    decision({ unknown: true }),
    decision({ releaseCommitSha: "b".repeat(40) }),
    decision({ addresses: { wethCollateral: M2A008_TEST_USDC } }),
    decision({ addresses: { expectedPool: ORACLE } }),
    decision({ addresses: { recoveryAuthority: "0x1111111111111111111111111111111111111111" } }),
    decision({ addresses: { pauseGuardian: DEPLOYER } }),
    decision({ testnetRoleCustody: { distinctPrivateKeysAttested: false } }),
    decision({
      testnetRoleCustody: { recoveryAuthority: { controllerRole: "Custodian" } }
    }),
    decision({ testnetRoleCustody: { privateKeysIncluded: true } }),
    decision({ signer: { startingNonce: 1 } }),
    decision({ signer: { priorSignerReuse: true } }),
    decision({ risk: { borrowerDebtCapAssets: "1000000001" } }),
    decision({ risk: { marketDebtCapAssets: "999999999" } }),
    decision({ risk: { borrowerDebtCapAssets: "99999999" } }),
    decision({ risk: { loanToValueBps: 4999 } }),
    decision({ risk: { loanToValueBps: 8000 } }),
    decision({ oracle: { sourceId: `0x${"0".repeat(64)}` } }),
    decision({ transactionCaps: { deploymentCount: 3 } }),
    decision({ transactionCaps: { expectedStartingBalanceWei: "100000000000000001" } }),
    decision({ transactionCaps: { maximumFaucetBalanceWei: "100000000000000001" } }),
    decision({ approvedAt: "2026-08-21T19:59:59.999Z" }),
    decision({ approvalExpiresAt: "2026-08-22T20:00:00.000Z" }),
    decision({ deploymentAuthorized: false }),
    decision({ mainnetAuthorized: true }),
    decision({ realFundsAuthorized: true })
  ];
  for (const input of cases) {
    assert.throws(() => validateM2A008ExactDecision(input, {
      clock: () => NOW,
      expectedCommitSha: "a".repeat(40)
    }));
  }
});

test("checked-in policy enables only the exact M2A-008 profile behind five staged technical gates", async () => {
  const policyText = await readFile(
    new URL("../../launch-policy.v1.json", import.meta.url),
    "utf8"
  );
  const assessment = assessM2A008LaunchPolicy(
    parseCanonicalJson(policyText, "Test launch policy")
  );
  assert.equal(assessment.releaseEnabled, true);
  assert.equal(assessment.exactProfilePresent, true);
  assert.equal(assessment.ready, true);
  assert.deepEqual(assessment.blockers, []);
  assert.deepEqual(assessment.requiredGateIds, [
    "m2a_testnet_code_integrity",
    "m2a_testnet_exact_configuration",
    "m2a_testnet_authority_signer_safety",
    "m2a_testnet_exact_deployment",
    "m2a_testnet_post_deployment_acceptance"
  ]);
  assert.deepEqual(assessment.preDeploymentGateIds, [
    "m2a_testnet_code_integrity",
    "m2a_testnet_exact_configuration",
    "m2a_testnet_authority_signer_safety"
  ]);
  assert.deepEqual(assessment.runtimeEnforcedGateIds, ["m2a_testnet_exact_deployment"]);
  assert.deepEqual(assessment.postDeploymentGateIds, [
    "m2a_testnet_post_deployment_acceptance"
  ]);
  assert.equal(assessment.independentSecurityReviewBlocking, false);
});

test("read-only inspection requires two distinct RPCs before any live read", async () => {
  await assert.rejects(
    inspectM2A008ReadOnlyDependencies({
      primaryRpcUrl: "https://sepolia.base.org",
      secondaryRpcUrl: "https://sepolia.base.org"
    }),
    /two distinct read-only RPC URLs/
  );
});

test("decision reader accepts only strict mode-0600 files in its isolated directory", async (t) => {
  const directory = "/private/tmp/ipo-one-m2a-008";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = `${directory}/test-${process.pid}.json`;
  const link = `${directory}/test-${process.pid}.link.json`;
  t.after(async () => {
    await rm(path, { force: true });
    await rm(link, { force: true });
  });
  await writeFile(path, JSON.stringify(decision()), { mode: 0o600 });
  assert.deepEqual(await readM2A008ExactDecision(path), decision());

  await chmod(path, 0o644);
  await assert.rejects(readM2A008ExactDecision(path), /mode-0600/);
  await chmod(path, 0o600);
  await symlink(path, link);
  await assert.rejects(readM2A008ExactDecision(link), /mode-0600/);
  await assert.rejects(
    readM2A008ExactDecision("./decision.json"),
    /absolute path/
  );
});

test("preflight source exposes no signing, broadcast, mainnet or secret-input primitive", async () => {
  const source = await readFile(
    new URL("../m2a-008-secured-pool-preflight.mjs", import.meta.url),
    "utf8"
  );
  for (const forbidden of [
    "private" + "KeyToAccount",
    "create" + "WalletClient",
    "sign" + "Transaction",
    "send" + "Transaction",
    "send" + "RawTransaction",
    "eth_send" + "RawTransaction",
    "process.env.PRIVATE" + "_KEY",
    "eip155:1\""
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
