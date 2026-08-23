import assert from "node:assert/strict";
import { access, lstat } from "node:fs/promises";
import test from "node:test";
import {
  destroyEphemeralTestnetKey,
  provisionEphemeralTestnetKey,
  readEphemeralTestnetKey
} from "../ephemeral-key.mjs";

test("ephemeral key stays owner-only outside the repository and is logically destroyed", async () => {
  const previous = process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = "CHAIN-001B";
  const keyPath = `/private/tmp/ipo-one-chain-001b/test-${process.pid}-${Date.now()}.key`;
  try {
    const provisioned = await provisionEphemeralTestnetKey({ keyPath });
    assert.match(provisioned.address, /^0x[0-9A-Fa-f]{40}$/);
    assert.equal(JSON.stringify(provisioned).includes("privateKey"), false);
    const stat = await lstat(keyPath);
    assert.equal(stat.mode & 0o077, 0);
    assert.match(await readEphemeralTestnetKey(keyPath), /^0x[0-9a-f]{64}$/);
    const destroyed = await destroyEphemeralTestnetKey(keyPath);
    assert.equal(destroyed.logicallyDestroyed, true);
    assert.equal(destroyed.storageMediumSecureEraseClaimed, false);
    await assert.rejects(access(keyPath), /ENOENT/);
  } finally {
    if (previous === undefined) delete process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
    else process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = previous;
  }
});

test("ephemeral key provisioning refuses CI and repository paths", async () => {
  const previousApproval = process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
  const previousCi = process.env.CI;
  const previousGithubActions = process.env.GITHUB_ACTIONS;
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = "CHAIN-001B";
  try {
    delete process.env.GITHUB_ACTIONS;
    process.env.CI = "true";
    await assert.rejects(provisionEphemeralTestnetKey(), /disabled in CI/);

    delete process.env.CI;
    process.env.GITHUB_ACTIONS = "true";
    await assert.rejects(provisionEphemeralTestnetKey(), /disabled in CI/);

    delete process.env.GITHUB_ACTIONS;
    await assert.rejects(
      provisionEphemeralTestnetKey({ keyPath: "/Users/cptmao/Documents/IPO.ONE/test.key" }),
      /dedicated private temporary/
    );
  } finally {
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
    if (previousGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previousGithubActions;
    if (previousApproval === undefined) delete process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
    else process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = previousApproval;
  }
});

test("CHAIN-001D keys use an isolated owner-only temporary scope", async () => {
  const previous = process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = "CHAIN-001D";
  const keyPath = `/private/tmp/ipo-one-chain-001d/test-${process.pid}-${Date.now()}.key`;
  try {
    const provisioned = await provisionEphemeralTestnetKey({ keyPath });
    assert.equal(provisioned.approvalScope, "CHAIN-001D");
    assert.equal(provisioned.keyPath, keyPath);
    assert.equal((await lstat(keyPath)).mode & 0o077, 0);
    await assert.rejects(
      provisionEphemeralTestnetKey({
        keyPath: `/private/tmp/ipo-one-chain-001b/cross-scope-${process.pid}-${Date.now()}.key`
      }),
      /dedicated private temporary/
    );
    await destroyEphemeralTestnetKey(keyPath);
  } finally {
    if (previous === undefined) delete process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
    else process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = previous;
  }
});

test("CHAIN-001F deployer uses a new isolated owner-only temporary scope", async () => {
  const previous = process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = "CHAIN-001F";
  const keyPath =
    `/private/tmp/ipo-one-chain-001f/test-${process.pid}-${Date.now()}.key`;
  try {
    const provisioned = await provisionEphemeralTestnetKey({ keyPath });
    assert.equal(provisioned.approvalScope, "CHAIN-001F");
    assert.equal(provisioned.keyPath, keyPath);
    assert.equal((await lstat(keyPath)).mode & 0o077, 0);
    await assert.rejects(
      provisionEphemeralTestnetKey({
        keyPath:
          `/private/tmp/ipo-one-chain-001d/cross-scope-${process.pid}-${Date.now()}.key`
      }),
      /dedicated private temporary/
    );
    await destroyEphemeralTestnetKey(keyPath);
  } finally {
    if (previous === undefined) {
      delete process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
    } else {
      process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = previous;
    }
  }
});

test("M2A-008 deployer uses its own one-use owner-only temporary scope", async () => {
  const previous = process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = "M2A-008";
  const keyPath = `/private/tmp/ipo-one-m2a-008/test-${process.pid}-${Date.now()}.key`;
  try {
    const provisioned = await provisionEphemeralTestnetKey({ keyPath });
    assert.equal(provisioned.approvalScope, "M2A-008");
    assert.equal(provisioned.keyPath, keyPath);
    assert.equal((await lstat(keyPath)).mode & 0o077, 0);
    await assert.rejects(
      provisionEphemeralTestnetKey({
        keyPath: `/private/tmp/ipo-one-chain-001f/cross-scope-${process.pid}-${Date.now()}.key`
      }),
      /dedicated private temporary/
    );
    await destroyEphemeralTestnetKey(keyPath);
  } finally {
    if (previous === undefined) delete process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
    else process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = previous;
  }
});
