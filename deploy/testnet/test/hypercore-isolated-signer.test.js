import assert from "node:assert/strict";
import { access, lstat } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_CREDIT_HYPERLIQUID_SIGNER_KEY_DIRECTORY,
  HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL,
  destroyHypercoreIsolatedTestnetSigner,
  inspectHypercoreIsolatedTestnetSigner,
  provisionAgentCreditHyperliquidTestnetSigner,
  provisionHypercoreIsolatedTestnetSigner,
  withHypercoreIsolatedTestnetSigner
} from "../hypercore-isolated-signer.mjs";

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("HyperCore API wallet key stays owner-only and descriptors never expose it", async () => {
  const variable = "IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER";
  const previous = process.env[variable];
  process.env[variable] = HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL;
  const keyPath =
    `/private/tmp/ipo-one-hypercore-002d/test-${process.pid}-${Date.now()}.key`;
  try {
    const provisioned = await provisionHypercoreIsolatedTestnetSigner({ keyPath });
    const storedKey = await import("node:fs/promises").then(({ readFile }) =>
      readFile(keyPath, "utf8")
    );
    assert.match(storedKey, /^0x[0-9a-f]{64}$/);
    assert.equal((await lstat(keyPath)).mode & 0o077, 0);
    assert.equal(JSON.stringify(provisioned).includes(storedKey), false);
    assert.equal(Object.hasOwn(provisioned, "apiWalletAddress"), false);
    assert.equal(Object.hasOwn(provisioned, "privateKey"), false);
    assert.deepEqual(await inspectHypercoreIsolatedTestnetSigner(keyPath), provisioned);

    const observed = await withHypercoreIsolatedTestnetSigner(
      keyPath,
      ({ descriptor, transientApiWalletAddress, signer }) => ({
        descriptor,
        transientApiWalletAddress,
        profile: signer.profile
      })
    );
    assert.match(observed.transientApiWalletAddress, /^0x[0-9a-f]{40}$/);
    assert.equal(observed.profile.rawKeyAccessible, false);
    assert.equal(observed.profile.keyExportable, false);
    assert.equal(JSON.stringify(observed.descriptor).includes(
      observed.transientApiWalletAddress
    ), false);

    const destroyed = await destroyHypercoreIsolatedTestnetSigner(keyPath);
    assert.equal(destroyed.logicallyDestroyed, true);
    assert.equal(Object.hasOwn(destroyed, "keyPath"), false);
    await assert.rejects(access(keyPath), /ENOENT/);
  } finally {
    restore(variable, previous);
  }
});

test("Agent Credit signer requires one exact approved run and remains private", async () => {
  const runId = `agent-credit-exec-001-l3-test-${process.pid}-${Date.now()}`;
  const keyPath =
    `${AGENT_CREDIT_HYPERLIQUID_SIGNER_KEY_DIRECTORY}/${runId}.key`;
  const env = { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId };
  try {
    const descriptor = await provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env
    });
    assert.equal((await lstat(keyPath)).mode & 0o077, 0);
    assert.match(descriptor.signerId, /^agent_credit_exec_001_signer_/);
    assert.equal(Object.hasOwn(descriptor, "apiWalletAddress"), false);
    assert.equal(Object.hasOwn(descriptor, "privateKey"), false);
    assert.deepEqual(await inspectHypercoreIsolatedTestnetSigner(keyPath), descriptor);
    await destroyHypercoreIsolatedTestnetSigner(keyPath);
  } finally {
    await access(keyPath).then(
      () => destroyHypercoreIsolatedTestnetSigner(keyPath),
      () => undefined
    );
  }
});

test("old marker, wrong run, cross-directory path, and CI cannot provision Agent Credit signer", async () => {
  const runId = `agent-credit-exec-001-l3-deny-${process.pid}-${Date.now()}`;
  const keyPath =
    `${AGENT_CREDIT_HYPERLIQUID_SIGNER_KEY_DIRECTORY}/${runId}.key`;
  await assert.rejects(
    provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env: {
        IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER:
          HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL
      }
    }),
    /exact Agent Credit Testnet run approval/
  );
  await assert.rejects(
    provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env: { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: `${runId}-wrong` }
    }),
    /exact Agent Credit Testnet run approval/
  );
  await assert.rejects(
    provisionAgentCreditHyperliquidTestnetSigner({
      keyPath: `/private/tmp/ipo-one-hypercore-002d/${runId}.key`,
      runId,
      env: { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId }
    }),
    /dedicated private temporary directory/
  );
  await assert.rejects(
    provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env: {
        IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId,
        CI: "true"
      }
    }),
    /disabled in CI/
  );
});
test("HyperCore signer provisioning fails closed without the exact marker and in CI", async () => {
  const variable = "IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER";
  const previousApproval = process.env[variable];
  const previousCi = process.env.CI;
  const previousGithubActions = process.env.GITHUB_ACTIONS;
  delete process.env[variable];
  try {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    await assert.rejects(
      provisionHypercoreIsolatedTestnetSigner(),
      /exact Testnet signer provisioning approval/
    );
    process.env[variable] = HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL;
    process.env.CI = "true";
    await assert.rejects(
      provisionHypercoreIsolatedTestnetSigner(),
      /disabled in CI/
    );

    delete process.env.CI;
    process.env.GITHUB_ACTIONS = "true";
    await assert.rejects(
      provisionHypercoreIsolatedTestnetSigner(),
      /disabled in CI/
    );
  } finally {
    restore(variable, previousApproval);
    restore("CI", previousCi);
    restore("GITHUB_ACTIONS", previousGithubActions);
  }
});

test("HyperCore signer cannot escape its dedicated scope or sign user actions", async () => {
  const variable = "IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER";
  const previous = process.env[variable];
  process.env[variable] = HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL;
  const keyPath =
    `/private/tmp/ipo-one-hypercore-002d/closed-${process.pid}-${Date.now()}.key`;
  try {
    await assert.rejects(
      provisionHypercoreIsolatedTestnetSigner({
        keyPath: `/private/tmp/ipo-one-chain-001d/cross-${Date.now()}.key`
      }),
      /dedicated private temporary directory/
    );
    await provisionHypercoreIsolatedTestnetSigner({ keyPath });
    await withHypercoreIsolatedTestnetSigner(keyPath, async ({ signer }) => {
      await assert.rejects(
        signer.sign({ scheme: "user_signed_action", purpose: "approveAgent" }),
        /only the exact L1 execution request/
      );
    });
    await destroyHypercoreIsolatedTestnetSigner(keyPath);
  } finally {
    restore(variable, previous);
  }
});
