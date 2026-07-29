import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  EVIDENCE_ANCHOR_REGISTRY_ABI
} from "../../chain-adapter/src/index.js";
import {
  createEvidenceAnchorWorker
} from "../src/index.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const ATTESTOR = "0x2222222222222222222222222222222222222222";
const TRANSACTION_HASH = `0x${"3".repeat(64)}`;
const EVIDENCE_HASH = `0x${"4".repeat(64)}`;
const ACTION_DIGEST = `0x${"5".repeat(64)}`;
const NOW = new Date("2026-07-29T04:00:00.000Z");

function fixture() {
  const calls = [];
  let anchor = {
    evidenceHash: EVIDENCE_HASH,
    eventType: "repayment_posted",
    eventTypeHash: `0x${"6".repeat(64)}`,
    aggregateType: "obligation",
    aggregateId: "obligation_anchor_worker_0001",
    aggregateVersion: 8,
    aggregateRefHash: `0x${"7".repeat(64)}`,
    actionDigest: ACTION_DIGEST,
    attemptCount: 0,
    status: "pending"
  };
  let observationCount = 0;
  return {
    calls,
    store: {
      async listObservable() {
        calls.push("listObservable");
        return new Set(["broadcast", "unknown", "included", "safe"]).has(anchor.status)
          ? [{ ...anchor }]
          : [];
      },
      async listPrepared() {
        calls.push("listPrepared");
        return anchor.status === "prepared" ? [{ ...anchor }] : [];
      },
      async listPending() {
        calls.push("listPending");
        return anchor.status === "pending" ? [{ ...anchor }] : [];
      },
      async prepareBatch(input) {
        calls.push("prepareBatch");
        anchor = {
          ...anchor,
          status: "prepared",
          contractAddress: input.contractAddress,
          attestorAccountId: input.attestorAccountId,
          attestorNonce: input.attestorNonce,
          batchId: input.batchId,
          batchDigest: input.batchDigest,
          batchOrdinal: 0,
          batchSize: 1,
          attemptCount: 1
        };
      },
      async markSubmitted(input) {
        calls.push("markSubmitted");
        anchor = {
          ...anchor,
          status: input.outcome,
          transactionHash: input.transactionHash
        };
      },
      async recordObservation(input) {
        calls.push(`record:${input.status}`);
        anchor = { ...anchor, status: input.status };
      }
    },
    nonceReader: {
      async read(address) {
        calls.push("readNonce");
        assert.equal(address, ATTESTOR);
        return 0;
      }
    },
    sender: {
      async send(transaction) {
        calls.push("send");
        assert.equal(transaction.to, CONTRACT);
        assert.equal(transaction.from, ATTESTOR);
        assert.equal(transaction.value, "0x0");
        const decoded = decodeFunctionData({
          abi: EVIDENCE_ANCHOR_REGISTRY_ABI,
          data: transaction.data
        });
        assert.equal(decoded.args[0][0].eventTypeHash, `0x${"6".repeat(64)}`);
        assert.equal(decoded.args[0][0].aggregateHash, `0x${"7".repeat(64)}`);
        return {
          transactionHash: TRANSACTION_HASH,
          outcome: "broadcast"
        };
      }
    },
    observer: {
      async observe(input) {
        calls.push("observe");
        observationCount += 1;
        assert.equal(input.transactionHash, TRANSACTION_HASH);
        return [{
          evidenceHash: EVIDENCE_HASH,
          status: observationCount === 1 ? "unknown" : "finalized"
        }];
      }
    }
  };
}

test("worker submits once, re-observes unknown, and never resends the economic Evidence", async () => {
  const value = fixture();
  const worker = createEvidenceAnchorWorker({
    store: value.store,
    contractAddress: CONTRACT,
    attestorAddress: ATTESTOR,
    nonceReader: value.nonceReader,
    observer: value.observer,
    sender: value.sender,
    clock: () => NOW
  });
  const first = await worker.runOnce();
  assert.equal(first.status, "unknown");
  assert.equal(first.transactionHash, TRANSACTION_HASH);
  const second = await worker.runOnce();
  assert.equal(second.status, "finalized");
  assert.equal(value.calls.filter((entry) => entry === "send").length, 1);
  assert.equal(worker.descriptor().nativeValue, "0");
  assert.equal(worker.descriptor().arbitraryCallsAllowed, false);
});

test("worker refuses to resend a prepared batch with no known transaction hash", async () => {
  let sends = 0;
  const worker = createEvidenceAnchorWorker({
    store: {
      async listObservable() { return []; },
      async listPrepared() { return [{ evidenceHash: EVIDENCE_HASH }]; },
      async listPending() { throw new Error("unreachable"); },
      async prepareBatch() {},
      async markSubmitted() {},
      async recordObservation() {}
    },
    contractAddress: CONTRACT,
    attestorAddress: ATTESTOR,
    nonceReader: { async read() { return 0; } },
    observer: { async observe() { return []; } },
    sender: { async send() { sends += 1; } },
    clock: () => NOW
  });
  const result = await worker.runOnce();
  assert.equal(result.status, "prepared_submission_unresolved");
  assert.equal(result.manualReconciliationRequired, true);
  assert.equal(sends, 0);
});

test("worker pipelines one new nonce after the prior transaction is included", async () => {
  const secondTransactionHash = `0x${"8".repeat(64)}`;
  const secondEvidenceHash = `0x${"9".repeat(64)}`;
  const anchors = [
    {
      evidenceHash: EVIDENCE_HASH,
      eventType: "offer_accepted",
      eventTypeHash: `0x${"6".repeat(64)}`,
      aggregateType: "obligation",
      aggregateId: "obligation_anchor_worker_0001",
      aggregateVersion: 7,
      aggregateRefHash: `0x${"7".repeat(64)}`,
      actionDigest: ACTION_DIGEST,
      attemptCount: 1,
      status: "broadcast",
      transactionHash: TRANSACTION_HASH,
      attestorAccountId: `eip155:84532:${ATTESTOR}`,
      attestorNonce: 0,
      batchOrdinal: 0,
      batchSize: 1
    },
    {
      evidenceHash: secondEvidenceHash,
      eventType: "repayment_posted",
      eventTypeHash: `0x${"a".repeat(64)}`,
      aggregateType: "obligation",
      aggregateId: "obligation_anchor_worker_0001",
      aggregateVersion: 8,
      aggregateRefHash: `0x${"b".repeat(64)}`,
      actionDigest: `0x${"c".repeat(64)}`,
      attemptCount: 0,
      status: "pending"
    }
  ];
  let sends = 0;
  const store = {
    async listObservable() {
      const active = anchors.filter(({ status }) =>
        new Set(["broadcast", "unknown", "included", "safe"]).has(status)
      );
      const preferred = active.find(({ status }) =>
        new Set(["broadcast", "unknown"]).has(status)
      ) ?? active[0];
      return preferred ? [{ ...preferred }] : [];
    },
    async listPrepared() {
      const prepared = anchors.find(({ status }) => status === "prepared");
      return prepared ? [{ ...prepared }] : [];
    },
    async listPending() {
      const pending = anchors.find(({ status }) => status === "pending");
      return pending ? [{ ...pending }] : [];
    },
    async prepareBatch(input) {
      Object.assign(anchors[1], {
        status: "prepared",
        contractAddress: input.contractAddress,
        attestorAccountId: input.attestorAccountId,
        attestorNonce: input.attestorNonce,
        batchId: input.batchId,
        batchDigest: input.batchDigest,
        batchOrdinal: 0,
        batchSize: 1,
        attemptCount: 1
      });
    },
    async markSubmitted(input) {
      Object.assign(anchors[1], {
        status: input.outcome,
        transactionHash: input.transactionHash
      });
    },
    async recordObservation(input) {
      const anchor = anchors.find(
        ({ evidenceHash }) => evidenceHash === input.evidenceHash
      );
      Object.assign(anchor, { status: input.status });
    }
  };
  const worker = createEvidenceAnchorWorker({
    store,
    contractAddress: CONTRACT,
    attestorAddress: ATTESTOR,
    nonceReader: { async read() { return 1; } },
    observer: {
      async observe(input) {
        if (input.transactionHash === TRANSACTION_HASH) {
          return [{ evidenceHash: EVIDENCE_HASH, status: "included" }];
        }
        assert.equal(input.transactionHash, secondTransactionHash);
        return [{ evidenceHash: secondEvidenceHash, status: "unknown" }];
      }
    },
    sender: {
      async send() {
        sends += 1;
        return {
          transactionHash: secondTransactionHash,
          outcome: "broadcast"
        };
      }
    },
    clock: () => NOW
  });
  const outcome = await worker.runOnce();
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.transactionHash, secondTransactionHash);
  assert.equal(anchors[0].status, "included");
  assert.equal(anchors[1].status, "unknown");
  assert.equal(sends, 1);
});
