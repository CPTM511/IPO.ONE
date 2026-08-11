import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmExecutionAccountProofAdapter,
  X_LAYER_TESTNET_PROFILE,
  normalizeEvmCaip10
} from "../src/index.js";

const NOW = new Date("2026-08-11T03:00:00.000Z");
const ACCOUNT = privateKeyToAccount(`0x${"21".repeat(32)}`);

function challenge(adapter, accountId) {
  const normalized = normalizeEvmCaip10(accountId, adapter.descriptor().chainId);
  const value = {
    chainId: normalized.chainId,
    tenantHash: hashId("tenant", "tenant_execution_proof"),
    subjectHash: hashId("subject", "subject_execution_proof"),
    controllerActorHash: hashId("actor", "actor_execution_proof"),
    actorType: "human",
    accountHash: normalized.accountHash,
    purpose: "execution",
    nonce: `0x${"22".repeat(32)}`,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    protocolVersion: "1.2"
  };
  return { ...value, typedDataHash: adapter.createTypedData(value).typedDataHash };
}

for (const profile of [BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE]) {
  test(`${profile.chainId} proves execution account control without creating login or authority`, async () => {
    const adapter = new EvmExecutionAccountProofAdapter({ profile });
    const accountId = `${profile.chainId}:${ACCOUNT.address}`;
    const durable = challenge(adapter, accountId);
    const signature = await ACCOUNT.signTypedData(adapter.createTypedData(durable).typedData);
    const result = await adapter.verify({ accountId, signature, challenge: durable, now: NOW });

    assert.equal(result.accountId, accountId.toLowerCase());
    assert.equal(result.verificationMethod, "eip712_eoa_v1");
    assert.equal(result.authenticationSessionCreated, false);
    assert.equal(result.executionAuthorityCreated, false);
    assert.equal(adapter.descriptor().bindingPurpose, "execution");
  });
}

test("execution proof fails closed on account, expiry and durable challenge drift", async () => {
  const adapter = new EvmExecutionAccountProofAdapter({ profile: BASE_SEPOLIA_PROFILE });
  const accountId = `${BASE_SEPOLIA_PROFILE.chainId}:${ACCOUNT.address}`;
  const durable = challenge(adapter, accountId);
  const signature = await ACCOUNT.signTypedData(adapter.createTypedData(durable).typedData);
  const other = privateKeyToAccount(`0x${"31".repeat(32)}`);

  await assert.rejects(
    adapter.verify({
      accountId: `${BASE_SEPOLIA_PROFILE.chainId}:${other.address}`,
      signature,
      challenge: durable,
      now: NOW
    }),
    { code: "account_proof_account_mismatch" }
  );
  await assert.rejects(
    adapter.verify({ accountId, signature, challenge: durable, now: new Date(durable.expiresAt) }),
    { code: "account_proof_challenge_expired" }
  );
  await assert.rejects(
    adapter.verify({ accountId, signature, challenge: { ...durable, actorType: "agent" }, now: NOW }),
    { code: "account_proof_challenge_mismatch" }
  );
});
