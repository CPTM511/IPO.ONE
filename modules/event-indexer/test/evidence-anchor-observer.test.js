import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult
} from "viem";
import {
  BaseSepoliaEvidenceAnchorAdapter,
  EVIDENCE_ANCHOR_REGISTRY_ABI,
  createEvidenceAnchorBatch
} from "../../chain-adapter/src/index.js";
import {
  createEvidenceAnchorNonceReader,
  createEvidenceAnchorObserver
} from "../src/index.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const ATTESTOR = "0x2222222222222222222222222222222222222222";
const TRANSACTION_HASH = `0x${"3".repeat(64)}`;
const EVIDENCE_HASH = `0x${"4".repeat(64)}`;
const ACTION_DIGEST = `0x${"5".repeat(64)}`;
const BLOCK_HASH = `0x${"6".repeat(64)}`;
const NOW = new Date("2026-07-29T04:00:00.000Z");

function rpc(result, id) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function fixture({
  wrongValue = false,
  transactionMissing = false,
  transactionTemporarilyMissing = false,
  eventBlockTemporarilyMissing = false,
  latestTemporarilyBehind = false,
  reorged = false
} = {}) {
  const batch = createEvidenceAnchorBatch({
    batchId: "evidence_anchor_batch_test_0001",
    accountId: `eip155:84532:${ATTESTOR}`,
    actionDigest: ACTION_DIGEST,
    nonce: 7,
    expiresAt: "2026-07-29T04:10:00.000Z",
    items: [{
      evidenceHash: EVIDENCE_HASH,
      eventType: "repayment_posted",
      aggregateType: "obligation",
      aggregateId: "obligation_test_0001",
      aggregateVersion: 8
    }]
  }, { now: NOW });
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({
    contractAddress: CONTRACT
  });
  const prepared = adapter.prepareAnchor(batch, { now: NOW });
  const item = batch.items[0];
  const topics = encodeEventTopics({
    abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
    eventName: "EvidenceAnchored",
    args: {
      evidenceHash: EVIDENCE_HASH,
      attestor: ATTESTOR,
      actionDigest: ACTION_DIGEST
    }
  });
  const data = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "uint16" },
      { type: "uint16" }
    ],
    [item.eventTypeHash, item.aggregateHash, 7n, 0, 1]
  );
  const expectedAnchors = [{
    evidenceHash: EVIDENCE_HASH,
    eventTypeHash: item.eventTypeHash,
    aggregateRefHash: item.aggregateHash,
    actionDigest: ACTION_DIGEST,
    attestorAccountId: `eip155:84532:${ATTESTOR}`,
    nonce: 7,
    batchOrdinal: 0,
    batchSize: 1
  }];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.method === "eth_chainId") {
      return rpc("0x14a34", request.id);
    }
    if (request.method === "eth_getTransactionByHash") {
      return rpc(
        transactionMissing || transactionTemporarilyMissing
          ? null
          : {
        hash: TRANSACTION_HASH,
        from: ATTESTOR,
        to: CONTRACT,
        value: wrongValue ? "0x1" : "0x0",
        input: prepared.data
          },
        request.id
      );
    }
    if (request.method === "eth_getTransactionReceipt") {
      return rpc(transactionMissing ? null : {
        transactionHash: TRANSACTION_HASH,
        from: ATTESTOR,
        to: CONTRACT,
        status: "0x1",
        blockNumber: "0x64",
        blockHash: BLOCK_HASH,
        logs: [{
          address: CONTRACT,
          topics,
          data,
          logIndex: "0x2"
        }]
      }, request.id);
    }
    if (request.method === "eth_getBlockByNumber") {
      const tag = request.params[0];
      if (tag === "0x64" && eventBlockTemporarilyMissing) {
        return rpc(null, request.id);
      }
      const number = tag === "latest"
        ? latestTemporarilyBehind
          ? 99
          : 110
        : tag === "safe"
          ? 108
          : tag === "finalized"
            ? 105
            : 100;
      return rpc({
        number: `0x${number.toString(16)}`,
        hash: tag === "0x64" && !reorged
          ? BLOCK_HASH
          : `0x${String(number).padStart(64, "0")}`,
        timestamp: "0x6889a0a0"
      }, request.id);
    }
    if (request.method === "eth_getBlockByHash") {
      assert.equal(request.params[0], BLOCK_HASH);
      return rpc({
        number: "0x64",
        hash: BLOCK_HASH,
        timestamp: "0x6889a090"
      }, request.id);
    }
    if (request.method === "eth_call") {
      const decoded = decodeFunctionData({
        abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
        data: request.params[0].data
      });
      assert.equal(decoded.functionName, "nextNonce");
      return rpc(encodeFunctionResult({
        abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
        functionName: "nextNonce",
        result: 7n
      }), request.id);
    }
    throw new Error(`unexpected RPC method ${request.method}`);
  };
  return { expectedAnchors, fetchImpl };
}

test("observer proves exact zero-value calldata, event binding, and finality", async () => {
  const { expectedAnchors, fetchImpl } = fixture();
  const observer = createEvidenceAnchorObserver({
    contractAddress: CONTRACT,
    fetchImpl,
    clock: () => NOW
  });
  const observations = await observer.observe({
    transactionHash: TRANSACTION_HASH,
    contractAddress: CONTRACT,
    expectedAnchors
  });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].evidenceHash, EVIDENCE_HASH);
  assert.equal(observations[0].status, "finalized");
  assert.equal(observations[0].blockNumber, "100");
  assert.equal(observations[0].logIndex, 2);
  assert.equal(observations[0].rawProviderPayloadPersisted, false);
  assert.equal(observations[0].productionFundsMoved, false);
});

test("observer returns unknown before broadcast visibility and rejects value drift", async () => {
  const missing = fixture({ transactionMissing: true });
  const observations = await createEvidenceAnchorObserver({
    contractAddress: CONTRACT,
    fetchImpl: missing.fetchImpl,
    clock: () => NOW
  }).observe({
    transactionHash: TRANSACTION_HASH,
    contractAddress: CONTRACT,
    expectedAnchors: missing.expectedAnchors
  });
  assert.equal(observations[0].status, "unknown");

  const drift = fixture({ wrongValue: true });
  await assert.rejects(
    createEvidenceAnchorObserver({
      contractAddress: CONTRACT,
      fetchImpl: drift.fetchImpl,
      clock: () => NOW
    }).observe({
      transactionHash: TRANSACTION_HASH,
      contractAddress: CONTRACT,
      expectedAnchors: drift.expectedAnchors
    }),
    (error) => error.code === "evidence_anchor_transaction_mismatch"
  );
});

test("observer keeps partial RPC propagation non-final and safely retryable", async () => {
  for (const partial of [
    fixture({ transactionTemporarilyMissing: true }),
    fixture({ eventBlockTemporarilyMissing: true }),
    fixture({ latestTemporarilyBehind: true })
  ]) {
    const observations = await createEvidenceAnchorObserver({
      contractAddress: CONTRACT,
      fetchImpl: partial.fetchImpl,
      clock: () => NOW
    }).observe({
      transactionHash: TRANSACTION_HASH,
      contractAddress: CONTRACT,
      expectedAnchors: partial.expectedAnchors
    });
    assert.equal(observations[0].status, "unknown");
    assert.equal(observations[0].confirmations, 0);
    assert.equal(observations[0].blockNumber, undefined);
  }
});

test("observer records an orphaned receipt as reorged instead of claiming finality", async () => {
  const reorg = fixture({ reorged: true });
  const observations = await createEvidenceAnchorObserver({
    contractAddress: CONTRACT,
    fetchImpl: reorg.fetchImpl,
    clock: () => NOW
  }).observe({
    transactionHash: TRANSACTION_HASH,
    contractAddress: CONTRACT,
    expectedAnchors: reorg.expectedAnchors
  });
  assert.equal(observations[0].status, "reorged");
  assert.equal(observations[0].confirmations, 0);
  assert.equal(observations[0].blockHash, BLOCK_HASH);
});

test("nonce reader is Base Sepolia-bound and read-only", async () => {
  const { fetchImpl } = fixture();
  const reader = createEvidenceAnchorNonceReader({
    contractAddress: CONTRACT,
    fetchImpl
  });
  assert.equal(await reader.read(ATTESTOR), 7);
  assert.equal(reader.descriptor().readOnly, true);
});
