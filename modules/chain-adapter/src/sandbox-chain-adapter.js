import {
  DomainError,
  FinalityStatus,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  createEvidenceEnvelope,
  hashId
} from "../../../packages/domain/src/index.js";
import { ChainObservationStatus, createChainProfile } from "./chain-profiles.js";

const OBSERVATION_STATUSES = new Set(Object.values(ChainObservationStatus));
const RETRYABLE_PROVIDER_CODES = new Set(["rpc_rate_limited", "rpc_timeout", "rpc_unavailable"]);
const HEX_32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function clone(value) {
  return structuredClone(value);
}

function normalizeHex32(name, value) {
  assertNonEmptyString(name, value);
  if (!HEX_32_PATTERN.test(value)) {
    throw new DomainError("invalid_chain_observation", `${name} must be a 32-byte hex value`, { name });
  }
  return value.toLowerCase();
}

function normalizeTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new DomainError("invalid_chain_observation", `${name} must be an ISO timestamp`, { name });
  }
  return timestamp.toISOString();
}

function normalizeBlockNumber(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new DomainError("invalid_chain_observation", "blockNumber must be an unsigned decimal string");
  }
  return BigInt(value).toString();
}

function sourceFinalityFor(status) {
  return {
    [ChainObservationStatus.SUBMITTED]: FinalityStatus.PENDING,
    [ChainObservationStatus.INCLUDED]: FinalityStatus.PENDING,
    [ChainObservationStatus.SAFE]: FinalityStatus.CONFIRMED,
    [ChainObservationStatus.FINALIZED]: FinalityStatus.FINALIZED,
    [ChainObservationStatus.INVALIDATED]: FinalityStatus.REORGED
  }[status];
}

function aggregateVersionFor(status) {
  return {
    [ChainObservationStatus.SUBMITTED]: 1,
    [ChainObservationStatus.INCLUDED]: 2,
    [ChainObservationStatus.SAFE]: 3,
    [ChainObservationStatus.FINALIZED]: 4,
    [ChainObservationStatus.INVALIDATED]: 4
  }[status];
}

export class SandboxChainAdapter {
  constructor({ profile }) {
    const { profileHash, schemaVersion, ...profileInput } = profile;
    this.profile = createChainProfile(profileInput);
    if (
      (profileHash !== undefined && profileHash !== this.profile.profileHash) ||
      (schemaVersion !== undefined && schemaVersion !== this.profile.schemaVersion)
    ) {
      throw new DomainError("chain_profile_tampered", "chain profile metadata does not match its normalized content");
    }
  }

  getDescriptor() {
    return clone(this.profile);
  }

  normalizeObservation(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new DomainError("invalid_chain_observation", "chain observation must be an object");
    }
    const allowedKeys = new Set([
      "chainId",
      "transactionHash",
      "eventOrdinal",
      "blockNumber",
      "blockHash",
      "obligationId",
      "paymentId",
      "assetId",
      "amountMinor",
      "observationStatus",
      "confirmations",
      "invalidationReason",
      "observedAt"
    ]);
    const unknown = Object.keys(input).filter((key) => !allowedKeys.has(key));
    if (unknown.length > 0) {
      throw new DomainError("invalid_chain_observation", "provider observations must be normalized before admission", {
        unknown
      });
    }
    for (const name of ["chainId", "obligationId", "paymentId", "assetId", "observationStatus", "observedAt"]) {
      assertNonEmptyString(name, input[name]);
    }
    if (input.chainId !== this.profile.chainId) {
      throw new DomainError("chain_profile_mismatch", "observation chain does not match the adapter profile", {
        expected: this.profile.chainId,
        actual: input.chainId
      });
    }
    if (!OBSERVATION_STATUSES.has(input.observationStatus)) {
      throw new DomainError("invalid_chain_observation", "observationStatus is not supported");
    }
    if (!Number.isSafeInteger(input.eventOrdinal) || input.eventOrdinal < 0) {
      throw new DomainError("invalid_chain_observation", "eventOrdinal must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(input.confirmations) || input.confirmations < 0) {
      throw new DomainError("invalid_chain_observation", "confirmations must be a non-negative safe integer");
    }

    const amountMinor = assertPositiveMinorUnits(input.amountMinor, "amountMinor").toString();
    if (BigInt(amountMinor) > BigInt(this.profile.caps.maxExecutionMinor)) {
      throw new DomainError("chain_execution_cap_exceeded", "synthetic execution exceeds the per-chain execution cap", {
        chainId: this.profile.chainId
      });
    }
    const transactionHash = normalizeHex32("transactionHash", input.transactionHash);
    const submitted = input.observationStatus === ChainObservationStatus.SUBMITTED;
    const blockNumber = submitted ? undefined : normalizeBlockNumber(input.blockNumber);
    const blockHash = submitted ? undefined : normalizeHex32("blockHash", input.blockHash);
    if (submitted && (input.blockNumber !== undefined || input.blockHash !== undefined || input.confirmations !== 0)) {
      throw new DomainError("invalid_chain_observation", "submitted observations cannot claim block inclusion or confirmations");
    }
    const threshold = {
      [ChainObservationStatus.INCLUDED]: this.profile.finalityPolicy.includedConfirmations,
      [ChainObservationStatus.SAFE]: this.profile.finalityPolicy.safeConfirmations,
      [ChainObservationStatus.FINALIZED]: this.profile.finalityPolicy.finalizedConfirmations,
      [ChainObservationStatus.INVALIDATED]: 0
    }[input.observationStatus];
    if (!submitted && input.observationStatus !== ChainObservationStatus.INVALIDATED && input.confirmations < threshold) {
      throw new DomainError("finality_threshold_not_met", "observation does not meet the configured sandbox threshold", {
        observationStatus: input.observationStatus,
        threshold
      });
    }
    if (input.observationStatus === ChainObservationStatus.INVALIDATED) {
      assertNonEmptyString("invalidationReason", input.invalidationReason);
    } else if (input.invalidationReason !== undefined) {
      throw new DomainError("invalid_chain_observation", "only invalidated observations may include an invalidation reason");
    }

    const canonicalPaymentRef = hashId("canonical_payment", {
      obligationId: input.obligationId,
      paymentId: input.paymentId,
      assetId: input.assetId,
      amountMinor
    });
    const eventKey = hashId("chain_event_key", {
      chainId: input.chainId,
      transactionHash,
      eventOrdinal: input.eventOrdinal
    });
    const core = {
      chainId: input.chainId,
      transactionHash,
      eventOrdinal: input.eventOrdinal,
      ...(blockNumber === undefined ? {} : { blockNumber, blockHash }),
      obligationId: input.obligationId,
      paymentId: input.paymentId,
      canonicalPaymentRef,
      assetId: input.assetId,
      amountMinor,
      observationStatus: input.observationStatus,
      sourceFinality: sourceFinalityFor(input.observationStatus),
      confirmations: input.confirmations,
      ...(input.invalidationReason === undefined ? {} : { invalidationReason: input.invalidationReason }),
      eventKey,
      sandboxOnly: true,
      productionFundsMoved: false,
      observedAt: normalizeTimestamp("observedAt", input.observedAt)
    };
    return {
      finalityProofId: hashId("chain_finality_proof_id", { eventKey, observationStatus: input.observationStatus }),
      finalityProofHash: hashId("chain_finality_proof", core),
      ...core,
      schemaVersion: "chain_finality_proof.v1"
    };
  }

  createPaymentEvidence(finalityProof, { aggregateVersion = aggregateVersionFor(finalityProof.observationStatus) } = {}) {
    const proof = this.normalizeObservation({
      chainId: finalityProof.chainId,
      transactionHash: finalityProof.transactionHash,
      eventOrdinal: finalityProof.eventOrdinal,
      ...(finalityProof.blockNumber === undefined
        ? {}
        : { blockNumber: finalityProof.blockNumber, blockHash: finalityProof.blockHash }),
      obligationId: finalityProof.obligationId,
      paymentId: finalityProof.paymentId,
      assetId: finalityProof.assetId,
      amountMinor: finalityProof.amountMinor,
      observationStatus: finalityProof.observationStatus,
      confirmations: finalityProof.confirmations,
      ...(finalityProof.invalidationReason === undefined
        ? {}
        : { invalidationReason: finalityProof.invalidationReason }),
      observedAt: finalityProof.observedAt
    });
    if (proof.finalityProofHash !== finalityProof.finalityProofHash) {
      throw new DomainError("finality_proof_tampered", "finality proof no longer matches its normalized content");
    }
    return createEvidenceEnvelope({
      eventId: hashId("chain_payment_evidence_event", proof.finalityProofHash),
      eventType: `payment_chain_${proof.observationStatus}`,
      aggregateType: "payment",
      aggregateId: proof.paymentId,
      aggregateVersion,
      obligationId: proof.obligationId,
      correlationId: proof.canonicalPaymentRef,
      idempotencyKey: proof.finalityProofId,
      actorRef: `chain:${proof.chainId}`,
      sourceSystem: "ipo.one.chain-adapter.v1",
      sourceFinality: proof.sourceFinality,
      payload: {
        chainId: proof.chainId,
        transactionHash: proof.transactionHash,
        eventOrdinal: proof.eventOrdinal,
        finalityProofHash: proof.finalityProofHash,
        canonicalPaymentRef: proof.canonicalPaymentRef,
        paymentId: proof.paymentId,
        assetId: proof.assetId,
        amountMinor: proof.amountMinor,
        observationStatus: proof.observationStatus,
        ...(proof.invalidationReason === undefined ? {} : { invalidationReason: proof.invalidationReason }),
        sandboxOnly: true,
        productionFundsMoved: false
      },
      occurredAt: proof.observedAt,
      recordedAt: proof.observedAt
    });
  }

  async readObservationWithFailover({ providerReaders, request }) {
    if (!Array.isArray(providerReaders) || providerReaders.length === 0) {
      throw new DomainError("chain_provider_unavailable", "at least one provider reader is required");
    }
    const configuredSlots = this.profile.providerSlots.slice(0, this.profile.requestPolicy.maxProviderAttempts);
    const readers = new Map(providerReaders.map((entry) => [entry.slot, entry.read]));
    if (
      readers.size !== providerReaders.length ||
      providerReaders.some((entry) => !configuredSlots.includes(entry.slot))
    ) {
      throw new DomainError("chain_provider_unavailable", "provider readers must use unique configured logical slots");
    }
    const attempts = [];
    for (const slot of configuredSlots) {
      const read = readers.get(slot);
      if (typeof read !== "function") {
        throw new DomainError("chain_provider_unavailable", "all configured failover slots require a reader", { slot });
      }
      try {
        const observation = await read(clone(request));
        return { observation: clone(observation), selectedSlot: slot, attempts: [...attempts, slot] };
      } catch (error) {
        attempts.push(slot);
        if (!(error instanceof DomainError) || !RETRYABLE_PROVIDER_CODES.has(error.code)) throw error;
      }
    }
    throw new DomainError("chain_provider_failover_exhausted", "all bounded sandbox provider attempts failed", {
      attempts
    });
  }
}
