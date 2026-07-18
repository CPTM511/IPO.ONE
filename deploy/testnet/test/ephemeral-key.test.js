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
  process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = "CHAIN-001B";
  process.env.CI = "true";
  try {
    await assert.rejects(provisionEphemeralTestnetKey(), /disabled in CI/);
  } finally {
    if (previousCi === undefined) delete process.env.CI;
    else process.env.CI = previousCi;
  }
  try {
    await assert.rejects(
      provisionEphemeralTestnetKey({ keyPath: "/Users/cptmao/Documents/IPO.ONE/test.key" }),
      /dedicated private temporary/
    );
  } finally {
    if (previousApproval === undefined) delete process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY;
    else process.env.IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY = previousApproval;
  }
});
