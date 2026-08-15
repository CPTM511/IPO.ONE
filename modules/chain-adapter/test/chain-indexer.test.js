import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  ChainIngestionDisposition,
  ChainObservationStatus,
  SandboxChainAdapter,
  SandboxChainIndexer,
  replayChainObservations
} from "../src/index.js";

const adapter = new SandboxChainAdapter({ profile: BASE_SEPOLIA_PROFILE });

function observation(overrides = {}) {
  return {
    chainId: BASE_SEPOLIA_PROFILE.chainId,
    transactionHash: hashId("chain_indexer_test_tx", "original"),
    eventOrdinal: 1,
    blockNumber: "900",
    blockHash: hashId("chain_indexer_test_block", "900"),
    obligationId: "obligation_indexer_1",
    paymentId: "payment_indexer_1",
    assetId: "asset:synthetic-usd",
    amountMinor: "5000",
    observationStatus: ChainObservationStatus.INCLUDED,
    confirmations: 1,
    observedAt: "2026-07-15T01:00:00.000Z",
    ...overrides
  };
}

test("duplicate logs, reorg invalidation, replacement inclusion, and restart replay stay deterministic", () => {
  const indexer = new SandboxChainIndexer({ adapter });
  const included = observation();
  assert.equal(indexer.ingest(included).disposition, ChainIngestionDisposition.APPLIED);
  assert.equal(indexer.ingest(included).disposition, ChainIngestionDisposition.DUPLICATE);
  indexer.ingest(observation({ observationStatus: ChainObservationStatus.SAFE, confirmations: 2 }));
  indexer.ingest(
    observation({
      observationStatus: ChainObservationStatus.INVALIDATED,
      confirmations: 2,
      invalidationReason: "sandbox_reorg"
    })
  );
  const replacement = {
    transactionHash: hashId("chain_indexer_test_tx", "replacement"),
    blockNumber: "901",
    blockHash: hashId("chain_indexer_test_block", "901")
  };
  indexer.ingest(observation(replacement));
  indexer.ingest(
    observation({ ...replacement, observationStatus: ChainObservationStatus.FINALIZED, confirmations: 4 })
  );

  const replayed = replayChainObservations({ adapter, observations: indexer.listReplayInputs() });
  assert.equal(replayed.snapshot().snapshotHash, indexer.snapshot().snapshotHash);
  assert.equal(indexer.snapshot().totalExposureMinor, "5000");
  assert.equal(indexer.snapshot().activePaymentRefs.length, 1);
  assert.equal(indexer.snapshot().pendingEventKeys.length, 0);
  assert.equal(indexer.listEvidence().length, 5);
  assert.equal(indexer.listEvidence().some((evidence) => evidence.sourceFinality === "reorged"), true);
});

test("one canonical payment cannot be counted twice before invalidation", () => {
  const indexer = new SandboxChainIndexer({ adapter });
  indexer.ingest(observation());
  assert.throws(
    () =>
      indexer.ingest(
        observation({
          transactionHash: hashId("chain_indexer_test_tx", "conflict"),
          blockHash: hashId("chain_indexer_test_block", "conflict")
        })
      ),
    /duplicate_canonical_payment/
  );
});

test("finality cannot regress and finalized evidence cannot be invalidated", () => {
  const indexer = new SandboxChainIndexer({ adapter });
  indexer.ingest(observation());
  indexer.ingest(observation({ observationStatus: ChainObservationStatus.FINALIZED, confirmations: 4 }));
  assert.throws(
    () =>
      indexer.ingest(
        observation({
          observationStatus: ChainObservationStatus.INVALIDATED,
          confirmations: 4,
          invalidationReason: "too_late"
        })
      ),
    /finalized_evidence_cannot_reorg/
  );
  assert.throws(
    () => indexer.ingest(observation({ observationStatus: ChainObservationStatus.SAFE, confirmations: 2 })),
    /chain_finality_regression/
  );
});

test("untrusted observations reject wrong chains, provider fields, false finality, and excessive amounts", () => {
  assert.throws(() => adapter.normalizeObservation(observation({ chainId: "eip155:1952" })), /chain_profile_mismatch/);
  assert.throws(() => adapter.normalizeObservation({ ...observation(), providerPayload: {} }), /normalized before admission/);
  assert.throws(
    () => adapter.normalizeObservation(observation({ observationStatus: ChainObservationStatus.FINALIZED, confirmations: 1 })),
    /finality_threshold_not_met/
  );
  assert.throws(
    () => adapter.normalizeObservation(observation({ amountMinor: "100001" })),
    /chain_execution_cap_exceeded/
  );
});

test("aggregate exposure and pending transaction caps fail closed per chain", () => {
  const { profileHash, schemaVersion, ...profileInput } = BASE_SEPOLIA_PROFILE;
  assert.equal(typeof profileHash, "string");
  assert.equal(schemaVersion, "chain_profile.v1");
  const constrainedAdapter = new SandboxChainAdapter({
    profile: {
      ...profileInput,
      caps: { maxExecutionMinor: "10", maxExposureMinor: "20", maxPendingTransactions: 2 }
    }
  });
  const exposureIndexer = new SandboxChainIndexer({ adapter: constrainedAdapter });
  const cappedObservation = (index, overrides = {}) => ({
    ...observation({
      transactionHash: hashId("chain_cap_test_tx", String(index)),
      blockHash: hashId("chain_cap_test_block", String(index)),
      obligationId: `obligation_cap_${index}`,
      paymentId: `payment_cap_${index}`,
      amountMinor: "10",
      observationStatus: ChainObservationStatus.FINALIZED,
      confirmations: 4
    }),
    ...overrides
  });
  exposureIndexer.ingest(cappedObservation(1));
  exposureIndexer.ingest(cappedObservation(2));
  assert.throws(() => exposureIndexer.ingest(cappedObservation(3)), /chain_exposure_cap_exceeded/);
  assert.equal(exposureIndexer.snapshot().totalExposureMinor, "20");

  const pendingIndexer = new SandboxChainIndexer({ adapter: constrainedAdapter });
  pendingIndexer.ingest(
    cappedObservation(4, { amountMinor: "1", observationStatus: ChainObservationStatus.INCLUDED, confirmations: 1 })
  );
  pendingIndexer.ingest(
    cappedObservation(5, { amountMinor: "1", observationStatus: ChainObservationStatus.INCLUDED, confirmations: 1 })
  );
  assert.throws(
    () =>
      pendingIndexer.ingest(
        cappedObservation(6, { amountMinor: "1", observationStatus: ChainObservationStatus.INCLUDED, confirmations: 1 })
      ),
    /chain_pending_cap_exceeded/
  );
  assert.equal(pendingIndexer.snapshot().totalExposureMinor, "2");
});
