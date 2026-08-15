import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertEvidenceAnchorDeployGasCap,
  readEvidenceAnchorDeployInput
} from "../run-evidence-anchor-registry-deploy.mjs";
import {
  assertEvidenceAnchorRecoveryBinding,
  readEvidenceAnchorReconciliationInput
} from "../reconcile-evidence-anchor-registry-deploy.mjs";

test("CHAIN-001F deployment input is Base Sepolia and isolated-key bound", () => {
  const input = readEvidenceAnchorDeployInput({
    IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY: "CHAIN-001F",
    IPO_ONE_TESTNET_CHAIN_ID: "eip155:84532",
    IPO_ONE_TESTNET_PROVIDER_SLOT: "primary",
    IPO_ONE_TESTNET_KEY_FILE:
      "/private/tmp/ipo-one-chain-001f/evidence-registry.key",
    IPO_ONE_TESTNET_RUN_ID: "evidence-anchor-20260729-001"
  });
  assert.equal(input.chainId, "eip155:84532");
  assert.throws(
    () => readEvidenceAnchorDeployInput({
      IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY: "CHAIN-001D",
      IPO_ONE_TESTNET_CHAIN_ID: "eip155:84532",
      IPO_ONE_TESTNET_KEY_FILE:
        "/private/tmp/ipo-one-chain-001d/reused.key",
      IPO_ONE_TESTNET_RUN_ID: "evidence-anchor-20260729-001"
    }),
    /closed CHAIN-001F/
  );
});

test("CHAIN-001F deployment gas cap rejects oversized or malformed estimates", () => {
  assert.equal(
    assertEvidenceAnchorDeployGasCap(500_000n, 1_000_000_000n),
    500_000_000_000_000n
  );
  assert.throws(
    () => assertEvidenceAnchorDeployGasCap(3_000_000n, 1_000_000_000n),
    /gas.*(?:cap|exceeds)/
  );
  assert.throws(
    () => assertEvidenceAnchorDeployGasCap(0n, 1n),
    /gas.*(?:cap|exceeds)/
  );
});

test("CHAIN-001F recovery is transaction-bound and cannot broadcast", async () => {
  const recoverySource = await readFile(
    new URL("../reconcile-evidence-anchor-registry-deploy.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    recoverySource,
    /createWalletClient|sendTransaction|sendRawTransaction/
  );
  const transactionHash = `0x${"1".repeat(64)}`;
  const input = readEvidenceAnchorReconciliationInput({
    IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY: "CHAIN-001F",
    IPO_ONE_TESTNET_CHAIN_ID: "eip155:84532",
    IPO_ONE_TESTNET_PROVIDER_SLOT: "primary",
    IPO_ONE_TESTNET_KEY_FILE:
      "/private/tmp/ipo-one-chain-001f/evidence-registry.key",
    IPO_ONE_TESTNET_RUN_ID: "evidence-anchor-20260729-001",
    IPO_ONE_TESTNET_TRANSACTION_HASH: transactionHash
  });
  assert.equal(input.transactionHash, transactionHash);
  assert.throws(
    () => readEvidenceAnchorReconciliationInput({
      IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY: "CHAIN-001F",
      IPO_ONE_TESTNET_CHAIN_ID: "eip155:84532",
      IPO_ONE_TESTNET_KEY_FILE:
        "/private/tmp/ipo-one-chain-001f/evidence-registry.key",
      IPO_ONE_TESTNET_RUN_ID: "evidence-anchor-20260729-001",
      IPO_ONE_TESTNET_TRANSACTION_HASH: "0x1234"
    }),
    /exact lowercase deployment transaction hash/
  );

  const accountAddress = "0x1111111111111111111111111111111111111111";
  const deployData = "0x6000";
  const blockHash = `0x${"2".repeat(64)}`;
  const recovered = assertEvidenceAnchorRecoveryBinding({
    accountAddress,
    deployData,
    transaction: {
      hash: transactionHash,
      from: accountAddress,
      to: null,
      value: 0n,
      input: deployData,
      chainId: 84532,
      nonce: 0,
      blockNumber: 123n,
      blockHash
    },
    receipt: {
      transactionHash,
      status: "success",
      contractAddress: "0x8f7a45ebde059392e46a46dcc14ab24681a961ea",
      blockNumber: 123n,
      blockHash
    }
  });
  assert.equal(recovered.blockNumber, 123n);
  assert.throws(
    () => assertEvidenceAnchorRecoveryBinding({
      accountAddress,
      deployData,
      transaction: {
        hash: transactionHash,
        from: accountAddress,
        to: null,
        value: 1n,
        input: deployData,
        chainId: 84532,
        nonce: 0,
        blockNumber: 123n,
        blockHash
      },
      receipt: {
        transactionHash,
        status: "success",
        contractAddress: "0x8f7a45ebde059392e46a46dcc14ab24681a961ea",
        blockNumber: 123n,
        blockHash
      }
    }),
    /exactly match/
  );
});
