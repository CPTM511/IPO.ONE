import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmAccountProofAdapter,
  X_LAYER_TESTNET_PROFILE,
  normalizeEvmCaip10
} from "../src/index.js";

const PRIVATE_KEY = `0x${"11".repeat(32)}`;
const NOW = new Date("2026-07-16T00:00:00.000Z");

function challenge(adapter, accountId, overrides = {}) {
  const normalized = normalizeEvmCaip10(accountId, adapter.descriptor().chainId);
  const base = {
    chainId: normalized.chainId,
    tenantHash: hashId("tenant", "tenant_identity_test"),
    subjectHash: hashId("subject", "subject_identity_test"),
    accountHash: normalized.accountHash,
    purpose: "primary",
    nonce: `0x${"22".repeat(32)}`,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    protocolVersion: "1.1"
  };
  const prepared = adapter.createTypedData({ ...base, ...overrides });
  return { ...base, ...overrides, typedDataHash: prepared.typedDataHash };
}

for (const profile of [BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE]) {
  test(`${profile.chainId} verifies the same EIP-712 Agent account proof contract`, async () => {
    const adapter = new EvmAccountProofAdapter({ profile });
    const account = privateKeyToAccount(PRIVATE_KEY);
    const accountId = `${profile.chainId}:${account.address}`;
    const durableChallenge = challenge(adapter, accountId);
    const prepared = adapter.createTypedData(durableChallenge);
    assert.equal(typeof prepared.typedData.message.issuedAt, "string");
    assert.equal(typeof prepared.typedData.message.expiresAt, "string");
    assert.doesNotThrow(() => JSON.stringify(prepared.typedData));
    const signature = await account.signTypedData(prepared.typedData);
    const result = await adapter.verify({ accountId, signature, challenge: durableChallenge, now: NOW });

    assert.equal(result.accountId, accountId.toLowerCase());
    assert.equal(result.chainId, profile.chainId);
    assert.equal(result.accountHash, durableChallenge.accountHash);
    assert.equal(result.verificationMethod, "eip712_eoa_v1");
    assert.match(result.proofHash, /^0x[0-9a-f]{64}$/);
  });
}

test("account proof fails closed for wrong chain, account, expiry, challenge mutation, and high-s signatures", async () => {
  const adapter = new EvmAccountProofAdapter({ profile: BASE_SEPOLIA_PROFILE });
  const account = privateKeyToAccount(PRIVATE_KEY);
  const accountId = `${BASE_SEPOLIA_PROFILE.chainId}:${account.address}`;
  const durableChallenge = challenge(adapter, accountId);
  const signature = await account.signTypedData(adapter.createTypedData(durableChallenge).typedData);

  await assert.rejects(
    adapter.verify({
      accountId: `${X_LAYER_TESTNET_PROFILE.chainId}:${account.address}`,
      signature,
      challenge: durableChallenge,
      now: NOW
    }),
    /account_proof_chain_mismatch/
  );
  const other = privateKeyToAccount(`0x${"33".repeat(32)}`);
  await assert.rejects(
    adapter.verify({
      accountId: `${BASE_SEPOLIA_PROFILE.chainId}:${other.address}`,
      signature,
      challenge: durableChallenge,
      now: NOW
    }),
    /account_proof_account_mismatch/
  );
  await assert.rejects(
    adapter.verify({ accountId, signature, challenge: durableChallenge, now: new Date(durableChallenge.expiresAt) }),
    /account_proof_challenge_expired/
  );
  await assert.rejects(
    adapter.verify({
      accountId,
      signature,
      challenge: { ...durableChallenge, purpose: "repayment" },
      now: NOW
    }),
    /account_proof_challenge_mismatch/
  );

  const order = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const highS = (order - s).toString(16).padStart(64, "0");
  const recovery = Number.parseInt(signature.slice(130, 132), 16);
  const flippedRecovery = recovery === 27 ? 28 : recovery === 28 ? 27 : recovery ^ 1;
  const malleable = `${signature.slice(0, 66)}${highS}${flippedRecovery.toString(16).padStart(2, "0")}`;
  await assert.rejects(
    adapter.verify({ accountId, signature: malleable, challenge: durableChallenge, now: NOW }),
    /high-s/
  );
});

test("account proof accepts only an eligible explicit ERC-1271 EIP-712 result", async () => {
  const calls = [];
  const signatureVerifier = {
    async verifyTypedData(input) {
      calls.push(input);
      return Object.freeze({
        schemaVersion: "wallet_signature_verification.v1",
        chainId: input.chainId,
        walletType: "contract",
        verificationMethod: "eip1271_eip712_v1",
        authenticationEligible: true,
        rawSignaturePersisted: false,
        credentialsIncluded: false,
        productionFundsMoved: false
      });
    }
  };
  const adapter = new EvmAccountProofAdapter({
    profile: BASE_SEPOLIA_PROFILE,
    signatureVerifier
  });
  const account = privateKeyToAccount(PRIVATE_KEY);
  const accountId = `${BASE_SEPOLIA_PROFILE.chainId}:${account.address}`;
  const durableChallenge = challenge(adapter, accountId);
  const signature = `0x${"44".repeat(96)}`;
  const result = await adapter.verify({
    accountId,
    signature,
    challenge: durableChallenge,
    now: NOW
  });

  assert.equal(adapter.descriptor().contractWalletSupport, true);
  assert.equal(adapter.descriptor().adapterVersion, "1.1.0");
  assert.equal(result.verificationMethod, "eip1271_eip712_v1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].digest, durableChallenge.typedDataHash);
  assert.equal(calls[0].signature, signature);
});

test("account proof rejects contract-wallet evidence that is not authentication-eligible", async () => {
  const adapter = new EvmAccountProofAdapter({
    profile: X_LAYER_TESTNET_PROFILE,
    signatureVerifier: {
      async verifyTypedData(input) {
        return Object.freeze({
          schemaVersion: "wallet_signature_verification.v1",
          chainId: input.chainId,
          walletType: "contract",
          verificationMethod: "eip1271_eip712_v1",
          authenticationEligible: false,
          rawSignaturePersisted: false,
          credentialsIncluded: false,
          productionFundsMoved: false
        });
      }
    }
  });
  const account = privateKeyToAccount(PRIVATE_KEY);
  const accountId = `${X_LAYER_TESTNET_PROFILE.chainId}:${account.address}`;
  const durableChallenge = challenge(adapter, accountId);
  await assert.rejects(
    adapter.verify({
      accountId,
      signature: `0x${"55".repeat(65)}`,
      challenge: durableChallenge,
      now: NOW
    }),
    /account_proof_verification_failed/
  );
});
