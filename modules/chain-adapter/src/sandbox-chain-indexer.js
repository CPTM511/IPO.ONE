import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { ChainIngestionDisposition, ChainObservationStatus } from "./chain-profiles.js";

const FINALITY_RANK = Object.freeze({
  [ChainObservationStatus.SUBMITTED]: 0,
  [ChainObservationStatus.INCLUDED]: 1,
  [ChainObservationStatus.SAFE]: 2,
  [ChainObservationStatus.FINALIZED]: 3
});

function clone(value) {
  return structuredClone(value);
}

function assertTransition(current, next) {
  if (current.observationStatus === ChainObservationStatus.INVALIDATED) {
    throw new DomainError("chain_event_already_invalidated", "invalidated chain evidence cannot be mutated");
  }
  if (next.observationStatus === ChainObservationStatus.INVALIDATED) {
    if (current.observationStatus === ChainObservationStatus.FINALIZED) {
      throw new DomainError("finalized_evidence_cannot_reorg", "the sandbox finality boundary rejects post-finality invalidation");
    }
    return;
  }
  if (FINALITY_RANK[next.observationStatus] <= FINALITY_RANK[current.observationStatus]) {
    throw new DomainError("chain_finality_regression", "chain finality must advance monotonically");
  }
}

export class SandboxChainIndexer {
  #activePayments = new Map();
  #evidence = [];
  #history = [];
  #latestByEventKey = new Map();
  #paymentVersions = new Map();
  #pendingEventKeys = new Set();
  #totalExposureMinor = 0n;

  constructor({ adapter }) {
    if (!adapter || typeof adapter.normalizeObservation !== "function" || typeof adapter.createPaymentEvidence !== "function") {
      throw new DomainError("invalid_chain_adapter", "chain indexer requires a conformant adapter");
    }
    this.adapter = adapter;
    this.profile = adapter.getDescriptor();
  }

  ingest(observation, { replay = false } = {}) {
    const proof = this.adapter.normalizeObservation(observation);
    const current = this.#latestByEventKey.get(proof.eventKey);
    if (current?.finalityProofHash === proof.finalityProofHash) {
      return {
        disposition: ChainIngestionDisposition.DUPLICATE,
        proof: clone(current),
        evidence: undefined
      };
    }
    if (current) assertTransition(current, proof);
    if (!current && proof.observationStatus === ChainObservationStatus.INVALIDATED) {
      throw new DomainError("chain_event_not_found", "an invalidation must reference previously observed chain evidence");
    }

    const active = this.#activePayments.get(proof.canonicalPaymentRef);
    if (!current && proof.observationStatus !== ChainObservationStatus.INVALIDATED) {
      if (active && active.eventKey !== proof.eventKey) {
        throw new DomainError("duplicate_canonical_payment", "one canonical payment cannot be active on multiple chain logs");
      }
      if (!active) {
        const nextExposure = this.#totalExposureMinor + BigInt(proof.amountMinor);
        if (nextExposure > BigInt(this.profile.caps.maxExposureMinor)) {
          throw new DomainError("chain_exposure_cap_exceeded", "synthetic chain exposure cap would be exceeded", {
            chainId: this.profile.chainId
          });
        }
        if (
          proof.observationStatus !== ChainObservationStatus.FINALIZED &&
          this.#pendingEventKeys.size + 1 > this.profile.caps.maxPendingTransactions
        ) {
          throw new DomainError("chain_pending_cap_exceeded", "synthetic pending transaction cap would be exceeded", {
            chainId: this.profile.chainId
          });
        }
        this.#totalExposureMinor = nextExposure;
        this.#activePayments.set(proof.canonicalPaymentRef, {
          eventKey: proof.eventKey,
          amountMinor: proof.amountMinor
        });
      }
    }

    if (proof.observationStatus === ChainObservationStatus.INVALIDATED) {
      if (!active || active.eventKey !== proof.eventKey) {
        throw new DomainError("chain_payment_not_active", "only active payment evidence can be invalidated");
      }
      this.#totalExposureMinor -= BigInt(active.amountMinor);
      this.#activePayments.delete(proof.canonicalPaymentRef);
      this.#pendingEventKeys.delete(proof.eventKey);
    } else if (proof.observationStatus === ChainObservationStatus.FINALIZED) {
      this.#pendingEventKeys.delete(proof.eventKey);
    } else {
      this.#pendingEventKeys.add(proof.eventKey);
    }

    const aggregateVersion = (this.#paymentVersions.get(proof.canonicalPaymentRef) ?? 0) + 1;
    const evidence = this.adapter.createPaymentEvidence(proof, { aggregateVersion });
    this.#paymentVersions.set(proof.canonicalPaymentRef, aggregateVersion);
    this.#latestByEventKey.set(proof.eventKey, clone(proof));
    this.#history.push(clone(observation));
    this.#evidence.push(clone(evidence));
    return {
      disposition: replay ? ChainIngestionDisposition.REPLAYED : ChainIngestionDisposition.APPLIED,
      proof: clone(proof),
      evidence: clone(evidence)
    };
  }

  listEvidence() {
    return this.#evidence.map(clone);
  }

  listReplayInputs() {
    return this.#history.map(clone);
  }

  snapshot() {
    const core = {
      chainId: this.profile.chainId,
      profileHash: this.profile.profileHash,
      latestProofHashes: [...this.#latestByEventKey.values()]
        .sort((a, b) => a.eventKey.localeCompare(b.eventKey))
        .map((proof) => proof.finalityProofHash),
      evidenceHashes: this.#evidence.map((evidence) => evidence.evidenceHash),
      activePaymentRefs: [...this.#activePayments.keys()].sort(),
      pendingEventKeys: [...this.#pendingEventKeys].sort(),
      totalExposureMinor: this.#totalExposureMinor.toString()
    };
    return {
      snapshotHash: hashId("chain_indexer_snapshot", core),
      ...core,
      schemaVersion: "chain_indexer_snapshot.v1"
    };
  }
}

export function replayChainObservations({ adapter, observations }) {
  const indexer = new SandboxChainIndexer({ adapter });
  for (const observation of observations) indexer.ingest(observation, { replay: true });
  return indexer;
}
