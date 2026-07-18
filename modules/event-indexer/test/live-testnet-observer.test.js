import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { hashId } from "../../../packages/domain/src/index.js";
import { BASE_SEPOLIA_PROFILE } from "../../chain-adapter/src/index.js";
import {
  InMemoryChainObservationStore,
  LiveChainIndexer,
  SANDBOX_EVIDENCE_EMITTER_ABI,
  createBoundedJsonRpcClient,
  createLiveTestnetObserver,
  resolveApprovedRpc
} from "../src/index.js";

const TX_HASH = `0x${"1".repeat(64)}`;
const BLOCK_HASH = `0x${"2".repeat(64)}`;
const SAFE_HASH = `0x${"3".repeat(64)}`;
const FINALIZED_HASH = `0x${"4".repeat(64)}`;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const OBLIGATION_ID = "obligation_live_test_001";
const PAYMENT_ID = "payment_live_test_001";
const EVIDENCE_HASH = hashId("live_test_evidence", { test: 1 });
const RUN_ID = "chain-001b-live-run-0001";
const OBLIGATION_HASH = hashId("testnet_obligation_reference", { obligationId: OBLIGATION_ID });
const PAYMENT_HASH = hashId("testnet_payment_reference", { paymentId: PAYMENT_ID });
const RUN_HASH = hashId("testnet_run_id", { runId: RUN_ID });

function jsonRpc(result, id) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function liveFetch({ wrongChain = false } = {}) {
  return async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.method === "eth_chainId") return jsonRpc(wrongChain ? "0x2105" : "0x14a34", request.id);
    if (request.method === "eth_getTransactionReceipt") {
      const topics = encodeEventTopics({
        abi: SANDBOX_EVIDENCE_EMITTER_ABI,
        eventName: "SandboxEvidenceEmitted",
        args: {
          evidenceHash: EVIDENCE_HASH,
          obligationHash: OBLIGATION_HASH,
          paymentHash: PAYMENT_HASH
        }
      });
      const data = encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint32" }],
        [RUN_HASH, 1]
      );
      return jsonRpc({
        transactionHash: TX_HASH,
        blockHash: BLOCK_HASH,
        blockNumber: "0x64",
        to: CONTRACT,
        status: "0x1",
        logs: [{ address: CONTRACT, topics, data, logIndex: "0x0" }]
      }, request.id);
    }
    if (request.method === "eth_getBlockByNumber") {
      const tag = request.params[0];
      if (tag === "latest") return jsonRpc({ number: "0x6e", hash: SAFE_HASH, timestamp: "0x668f5200" }, request.id);
      if (tag === "safe") return jsonRpc({ number: "0x69", hash: SAFE_HASH, timestamp: "0x668f51f0" }, request.id);
      if (tag === "finalized") return jsonRpc({ number: "0x64", hash: FINALIZED_HASH, timestamp: "0x668f51e0" }, request.id);
      if (tag === "0x64") return jsonRpc({ number: "0x64", hash: BLOCK_HASH, timestamp: "0x668f51d0" }, request.id);
    }
    throw new Error(`unexpected RPC method ${request.method}`);
  };
}

function query() {
  return {
    transactionHash: TX_HASH,
    contractAddress: CONTRACT,
    obligationId: OBLIGATION_ID,
    paymentId: PAYMENT_ID,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "100",
    evidenceHash: EVIDENCE_HASH,
    runId: RUN_ID
  };
}

test("approved live RPC configuration rejects mainnet, custom hosts, query credentials, and slot drift", () => {
  assert.equal(resolveApprovedRpc({ chainId: "eip155:84532", providerSlot: "primary" }).rpcUrl, "https://sepolia.base.org/");
  assert.throws(
    () => resolveApprovedRpc({ chainId: "eip155:8453", providerSlot: "primary" }),
    /only the two approved/
  );
  assert.throws(
    () => resolveApprovedRpc({ chainId: "eip155:84532", providerSlot: "primary", rpcUrl: "https://example.com" }),
    /exactly match/
  );
  assert.throws(
    () => resolveApprovedRpc({ chainId: "eip155:84532", providerSlot: "primary", rpcUrl: "https://sepolia.base.org/?key=secret" }),
    /exactly match/
  );
});

test("bounded RPC client allows only closed read methods and rejects oversized responses", async () => {
  const client = createBoundedJsonRpcClient({
    rpcUrl: "https://sepolia.base.org/",
    maxResponseBytes: 1024,
    fetchImpl: async (_url, options) => {
      const { id } = JSON.parse(options.body);
      return jsonRpc("x".repeat(2048), id);
    }
  });
  await assert.rejects(client.call("eth_chainId"), /rpc_response_too_large/);
  await assert.rejects(client.call("eth_sendRawTransaction", []), /rpc_method_denied/);
});

test("live observer verifies chain, decodes one fixed event, and discards raw provider payload", async () => {
  const observer = createLiveTestnetObserver({
    chainId: "eip155:84532",
    providerSlot: "primary",
    fetchImpl: liveFetch(),
    clock: () => new Date("2026-07-16T03:00:00.000Z")
  });
  const head = await observer.readHead();
  assert.equal(head.chainId, "eip155:84532");
  assert.equal(head.liveTestnetObservation, true);
  assert.equal(head.productionFundsMoved, false);

  const live = await observer.readEvidence(query());
  assert.equal(live.proof.observationStatus, "finalized");
  assert.equal(live.proof.sourceFinality, "finalized");
  assert.equal(live.eventBinding.obligationHash, OBLIGATION_HASH);
  assert.equal(live.eventBinding.sequence, 1);
  assert.equal(live.rawProviderPayloadPersisted, false);
  assert.equal(JSON.stringify(live).includes("logs"), false);
  assert.equal(JSON.stringify(live).includes("sepolia.base.org"), false);
});

test("live observer fails closed on wrong chain and event binding drift", async () => {
  const wrongChain = createLiveTestnetObserver({
    chainId: "eip155:84532",
    providerSlot: "primary",
    fetchImpl: liveFetch({ wrongChain: true })
  });
  await assert.rejects(wrongChain.readHead(), /rpc_chain_id_mismatch/);

  const observer = createLiveTestnetObserver({
    chainId: "eip155:84532",
    providerSlot: "primary",
    fetchImpl: liveFetch()
  });
  await assert.rejects(observer.readEvidence({ ...query(), paymentId: "payment_drift" }), /emitter_evidence_mismatch/);
  await assert.rejects(observer.readEvidence({ ...query(), privateKey: "0xsecret" }), /closed contract/);
});

test("normalized live observations append, deduplicate, restore, and reconcile deterministically", async () => {
  const observer = createLiveTestnetObserver({
    chainId: "eip155:84532",
    providerSlot: "primary",
    fetchImpl: liveFetch()
  });
  const live = await observer.readEvidence(query());
  const store = new InMemoryChainObservationStore();
  const indexer = new LiveChainIndexer({ profile: BASE_SEPOLIA_PROFILE, store });
  const first = await indexer.ingest(live);
  const replay = await indexer.ingest(live);
  assert.equal(first.persisted.replayed, false);
  assert.equal(replay.persisted.replayed, true);
  assert.equal((await store.listPendingOutbox("eip155:84532")).length, 1);

  const restarted = new LiveChainIndexer({ profile: BASE_SEPOLIA_PROFILE, store });
  const restored = await restarted.restore();
  assert.equal(restored.snapshotHash, first.snapshot.snapshotHash);
});
