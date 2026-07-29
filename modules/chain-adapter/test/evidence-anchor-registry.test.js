import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  BaseSepoliaEvidenceAnchorAdapter,
  createEvidenceAnchorBatch,
  createStoredEvidenceAnchorBatch,
  EVIDENCE_ANCHOR_REGISTRY_ABI
} from "../src/index.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const ACCOUNT = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-07-29T04:00:00.000Z");
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const ACTION = `0x${"c".repeat(64)}`;

function input(overrides = {}) {
  return {
    batchId: "evidence_anchor_batch_test_001",
    accountId: `eip155:84532:${ACCOUNT}`,
    actionDigest: ACTION,
    nonce: 0,
    expiresAt: "2026-07-29T04:10:00.000Z",
    items: [
      {
        evidenceHash: HASH_A,
        eventType: "obligation_created",
        aggregateType: "obligation",
        aggregateId: "obligation_test_001",
        aggregateVersion: 1
      },
      {
        evidenceHash: HASH_B,
        eventType: "credit_offer_accepted",
        aggregateType: "credit_offer",
        aggregateId: "credit_offer_test_001",
        aggregateVersion: 2
      }
    ],
    ...overrides
  };
}

test("Evidence batch is exact, Base Sepolia-bound, and covers every item", () => {
  const batch = createEvidenceAnchorBatch(input(), { now: NOW });
  assert.equal(batch.chainId, "eip155:84532");
  assert.equal(batch.accountAddress, "0x2222222222222222222222222222222222222222");
  assert.equal(batch.items.length, 2);
  assert.match(batch.batchDigest, /^0x[0-9a-f]{64}$/);
  for (const item of batch.items) {
    assert.match(item.eventTypeHash, /^0x[0-9a-f]{64}$/);
    assert.match(item.aggregateHash, /^0x[0-9a-f]{64}$/);
  }
  assert.equal(batch.sandboxOnly, true);
  assert.equal(batch.productionFundsMoved, false);
});

test("prepared wallet transaction is zero-value and binds the complete Evidence batch", () => {
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({
    contractAddress: CONTRACT
  });
  const batch = createEvidenceAnchorBatch(input(), { now: NOW });
  const prepared = adapter.prepareAnchor(batch, { now: NOW });
  assert.equal(prepared.chainId, "eip155:84532");
  assert.equal(prepared.from, "0x2222222222222222222222222222222222222222");
  assert.equal(prepared.to, "0x1111111111111111111111111111111111111111");
  assert.equal(prepared.value, 0n);
  assert.match(prepared.data, /^0x[0-9a-f]+$/);
  assert.deepEqual(prepared.evidenceHashes, [HASH_A, HASH_B]);
  assert.equal(prepared.batchDigest, batch.batchDigest);
  assert.equal(prepared.sandboxOnly, true);
  assert.equal(prepared.productionFundsMoved, false);
});

test("prepared system transaction preserves exact durable Evidence hashes", () => {
  const eventTypeHash = `0x${"6".repeat(64)}`;
  const aggregateRefHash = `0x${"7".repeat(64)}`;
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({
    contractAddress: CONTRACT
  });
  const batch = createStoredEvidenceAnchorBatch({
    batchId: "stored_evidence_anchor_batch_test_001",
    accountId: `eip155:84532:${ACCOUNT}`,
    actionDigest: ACTION,
    nonce: 0,
    expiresAt: "2026-07-29T04:10:00.000Z",
    items: [{
      evidenceHash: HASH_A,
      eventTypeHash,
      aggregateRefHash
    }]
  }, { now: NOW });
  const prepared = adapter.prepareStoredAnchor(batch, { now: NOW });
  const decoded = decodeFunctionData({
    abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
    data: prepared.data
  });
  assert.equal(decoded.functionName, "anchorEvidence");
  assert.equal(decoded.args[0][0].evidenceHash, HASH_A);
  assert.equal(decoded.args[0][0].eventTypeHash, eventTypeHash);
  assert.equal(decoded.args[0][0].aggregateHash, aggregateRefHash);
  assert.equal(decoded.args[1], ACTION);
  assert.equal(decoded.args[2], 0n);
});

test("adapter rejects open, duplicate, expired, and cross-chain batches", () => {
  assert.throws(
    () => createEvidenceAnchorBatch({
      ...input(),
      accountId: `eip155:1952:${ACCOUNT}`
    }, { now: NOW }),
    /does not match the selected chain profile/
  );
  assert.throws(
    () => createEvidenceAnchorBatch({
      ...input(),
      items: [input().items[0], input().items[0]]
    }, { now: NOW }),
    /duplicate Evidence hashes/
  );
  assert.throws(
    () => createEvidenceAnchorBatch({
      ...input(),
      expiresAt: "2026-07-29T04:20:00.000Z"
    }, { now: NOW }),
    /within the next 15 minutes/
  );
  assert.throws(
    () => createEvidenceAnchorBatch({
      ...input(),
      unknown: true
    }, { now: NOW }),
    /closed contract/
  );
  assert.throws(
    () => createEvidenceAnchorBatch({
      ...input(),
      items: Array.from({ length: 17 }, (_, index) => ({
        ...input().items[0],
        evidenceHash: `0x${index.toString(16).padStart(64, "0")}`
      }))
    }, { now: NOW }),
    /1 through 16/
  );
  assert.throws(
    () => createStoredEvidenceAnchorBatch({
      ...input(),
      items: [{
        evidenceHash: HASH_A,
        eventTypeHash: `0x${"0".repeat(64)}`,
        aggregateRefHash: HASH_B
      }]
    }, { now: NOW }),
    /non-zero lowercase bytes32/
  );
});

test("BaseScan links are created only from exact transaction hashes", () => {
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({
    contractAddress: CONTRACT
  });
  const transactionHash = `0x${"d".repeat(64)}`;
  assert.equal(
    adapter.transactionUrl(transactionHash),
    `https://sepolia.basescan.org/tx/${transactionHash}`
  );
  assert.throws(() => adapter.transactionUrl(HASH_A.toUpperCase()), /lowercase EVM/);
});
