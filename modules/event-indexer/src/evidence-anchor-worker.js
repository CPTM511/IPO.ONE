import {
  BaseSepoliaEvidenceAnchorAdapter,
  createStoredEvidenceAnchorBatch
} from "../../chain-adapter/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function expectedAnchors(anchors) {
  return anchors.map((anchor) => ({
    evidenceHash: anchor.evidenceHash,
    eventTypeHash: anchor.eventTypeHash,
    aggregateRefHash: anchor.aggregateRefHash,
    actionDigest: anchor.actionDigest,
    attestorAccountId: anchor.attestorAccountId,
    nonce: anchor.attestorNonce,
    batchOrdinal: anchor.batchOrdinal,
    batchSize: anchor.batchSize
  }));
}

function result({
  status,
  evidenceHashes = [],
  transactionHash,
  manualReconciliationRequired = false
}) {
  return Object.freeze({
    status,
    evidenceHashes: Object.freeze([...evidenceHashes]),
    transactionHash,
    manualReconciliationRequired,
    rawPrivateKeyPersisted: false,
    nativeValue: "0",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "evidence_anchor_worker_cycle.v1"
  });
}

export function createEvidenceAnchorWorker({
  store,
  contractAddress,
  attestorAddress,
  nonceReader,
  observer,
  sender,
  clock = () => new Date()
} = {}) {
  if (
    !store?.listPending ||
    !store?.listPrepared ||
    !store?.listObservable ||
    !store?.prepareBatch ||
    !store?.markSubmitted ||
    !store?.recordObservation ||
    !ADDRESS.test(contractAddress ?? "") ||
    !ADDRESS.test(attestorAddress ?? "") ||
    !nonceReader?.read ||
    !observer?.observe ||
    !sender?.send ||
    typeof clock !== "function"
  ) {
    fail(
      "invalid_evidence_anchor_worker",
      "Evidence anchor worker dependencies are incomplete"
    );
  }
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({ contractAddress });
  const attestorAccountId = `eip155:84532:${attestorAddress}`;

  async function observe(anchors) {
    const ordered = [...anchors].sort(
      (left, right) => left.batchOrdinal - right.batchOrdinal
    );
    const observations = await observer.observe({
      transactionHash: ordered[0].transactionHash,
      contractAddress,
      expectedAnchors: expectedAnchors(ordered)
    });
    for (const item of observations) await store.recordObservation(item);
    return result({
      status: observations.every(({ status }) => status === "finalized")
        ? "finalized"
        : observations[0].status,
      evidenceHashes: ordered.map(({ evidenceHash }) => evidenceHash),
      transactionHash: ordered[0].transactionHash
    });
  }

  return Object.freeze({
    async runOnce({ limit = 16 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) {
        fail("invalid_evidence_anchor_worker", "Evidence anchor worker limit is invalid");
      }
      const observable = await store.listObservable({ limit });
      let observed;
      if (observable.length > 0) {
        observed = await observe(observable);
        if (!new Set(["included", "safe"]).has(observed.status)) {
          return observed;
        }
      }

      const prepared = await store.listPrepared({ limit });
      if (prepared.length > 0) {
        return result({
          status: "prepared_submission_unresolved",
          evidenceHashes: prepared.map(({ evidenceHash }) => evidenceHash),
          manualReconciliationRequired: true
        });
      }

      const pending = await store.listPending({ limit });
      if (pending.length === 0) {
        return observed ?? result({ status: "idle" });
      }
      if (new Set(pending.map(({ actionDigest }) => actionDigest)).size !== 1) {
        fail(
          "evidence_anchor_worker_batch_drift",
          "Evidence anchor worker received more than one action group"
        );
      }
      const now = clock();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      expiresAt.setMilliseconds(0);
      const nonce = await nonceReader.read(attestorAddress);
      const evidenceHashes = pending.map(({ evidenceHash }) => evidenceHash);
      const attempt = Math.max(...pending.map(({ attemptCount }) => attemptCount)) + 1;
      const batch = createStoredEvidenceAnchorBatch({
        batchId: hashId("system_evidence_anchor_batch_id", {
          actionDigest: pending[0].actionDigest,
          evidenceHashes,
          attestorAccountId,
          attempt
        }),
        accountId: attestorAccountId,
        actionDigest: pending[0].actionDigest,
        nonce,
        expiresAt: expiresAt.toISOString(),
        items: pending.map((anchor) => ({
          evidenceHash: anchor.evidenceHash,
          eventTypeHash: anchor.eventTypeHash,
          aggregateRefHash: anchor.aggregateRefHash
        }))
      }, { now });
      const preparedAnchor = adapter.prepareStoredAnchor(batch, { now });
      const preparedTransaction = {
        chainId: preparedAnchor.chainId,
        from: preparedAnchor.from,
        to: preparedAnchor.to,
        data: preparedAnchor.data,
        value: "0x0",
        batchDigest: preparedAnchor.batchDigest,
        evidenceHashes: [...preparedAnchor.evidenceHashes]
      };
      await store.prepareBatch({
        evidenceHashes,
        contractAddress,
        attestorAccountId,
        confirmationMode: "system_attestor",
        batchId: batch.batchId,
        batchDigest: batch.batchDigest,
        attestorNonce: batch.nonce,
        expiresAt: batch.expiresAt,
        preparedTransaction,
        preparedAt: now.toISOString()
      });
      const submission = await sender.send(Object.freeze({
        from: preparedTransaction.from,
        to: preparedTransaction.to,
        data: preparedTransaction.data,
        value: "0x0",
        chainId: "eip155:84532"
      }));
      if (
        !submission ||
        typeof submission !== "object" ||
        !HASH.test(submission.transactionHash ?? "") ||
        !new Set(["broadcast", "unknown"]).has(submission.outcome)
      ) {
        fail(
          "evidence_anchor_submission_indeterminate",
          "Evidence anchor sender did not return one bounded transaction result"
        );
      }
      await store.markSubmitted({
        batchId: batch.batchId,
        transactionHash: submission.transactionHash,
        outcome: submission.outcome,
        submittedAt: clock().toISOString()
      });
      const submitted = await store.listObservable({ limit });
      if (
        submitted.length !== evidenceHashes.length ||
        submitted.some(({ transactionHash }) =>
          transactionHash !== submission.transactionHash
        )
      ) {
        fail(
          "evidence_anchor_submission_binding_lost",
          "Submitted Evidence anchor batch could not be reloaded"
        );
      }
      return observe(submitted);
    },
    descriptor() {
      return Object.freeze({
        chainId: "eip155:84532",
        contractAddress,
        attestorAccountId,
        confirmationMode: "system_attestor",
        maximumBatchSize: 16,
        nativeValue: "0",
        arbitraryCallsAllowed: false,
        rawPrivateKeyAccepted: false,
        schemaVersion: "evidence_anchor_worker.v1"
      });
    }
  });
}
