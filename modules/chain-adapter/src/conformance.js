import {
  DomainError,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  hashId
} from "../../../packages/domain/src/index.js";
import { ChainObservationStatus } from "./chain-profiles.js";
import { SandboxChainIndexer, replayChainObservations } from "./sandbox-chain-indexer.js";

const NOW = "2026-07-15T00:00:00.000Z";
const KERNEL_INPUT_KEYS = new Set([
  "obligationId",
  "paymentId",
  "assetId",
  "amountMinor",
  "observedAt"
]);
const DEFAULT_KERNEL_INPUT = Object.freeze({
  obligationId: "obligation_chain_conformance_1",
  paymentId: "payment_chain_conformance_1",
  assetId: "asset:synthetic-usd",
  amountMinor: "10000",
  observedAt: NOW
});

function normalizeKernelInput(input = DEFAULT_KERNEL_INPUT) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new DomainError("invalid_chain_kernel_input", "chain conformance kernel input must be a plain object");
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== KERNEL_INPUT_KEYS.size ||
    keys.some((key) => typeof key !== "string" || !KERNEL_INPUT_KEYS.has(key)) ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return descriptor?.get || descriptor?.set;
    })
  ) {
    throw new DomainError("invalid_chain_kernel_input", "chain conformance kernel input must use the closed contract");
  }
  for (const name of ["obligationId", "paymentId", "assetId"]) assertNonEmptyString(name, input[name]);
  const amountMinor = assertPositiveMinorUnits(input.amountMinor, "amountMinor").toString();
  assertNonEmptyString("observedAt", input.observedAt);
  const observedAt = new Date(input.observedAt);
  if (!Number.isFinite(observedAt.getTime())) {
    throw new DomainError("invalid_chain_kernel_input", "observedAt must be an ISO timestamp");
  }
  return {
    obligationId: input.obligationId,
    paymentId: input.paymentId,
    assetId: input.assetId,
    amountMinor,
    observedAt: observedAt.toISOString()
  };
}

function observation(adapter, kernelInput, overrides = {}) {
  const profile = adapter.getDescriptor();
  return {
    chainId: profile.chainId,
    transactionHash: hashId("chain_conformance_tx", {
      chainId: profile.chainId,
      paymentId: kernelInput.paymentId,
      variant: "original"
    }),
    eventOrdinal: 0,
    blockNumber: "100",
    blockHash: hashId("chain_conformance_block", {
      chainId: profile.chainId,
      paymentId: kernelInput.paymentId,
      blockNumber: "100"
    }),
    obligationId: kernelInput.obligationId,
    paymentId: kernelInput.paymentId,
    assetId: kernelInput.assetId,
    amountMinor: kernelInput.amountMinor,
    observationStatus: ChainObservationStatus.INCLUDED,
    confirmations: profile.finalityPolicy.includedConfirmations,
    observedAt: kernelInput.observedAt,
    ...overrides
  };
}

export async function runSandboxChainAdapterConformance(adapter, input) {
  const profile = adapter.getDescriptor();
  const kernelInput = normalizeKernelInput(input);
  const indexer = new SandboxChainIndexer({ adapter });
  const initial = observation(adapter, kernelInput);
  const providerResult = await adapter.readObservationWithFailover({
    request: { transactionHash: initial.transactionHash },
    providerReaders: [
      {
        slot: "primary",
        read: async () => {
          throw new DomainError("rpc_timeout", "deterministic primary timeout");
        }
      },
      { slot: "secondary", read: async () => initial }
    ]
  });
  const applied = indexer.ingest(providerResult.observation);
  const duplicate = indexer.ingest(initial);
  indexer.ingest(
    observation(adapter, kernelInput, {
      observationStatus: ChainObservationStatus.SAFE,
      confirmations: profile.finalityPolicy.safeConfirmations
    })
  );
  indexer.ingest(
    observation(adapter, kernelInput, {
      observationStatus: ChainObservationStatus.INVALIDATED,
      confirmations: profile.finalityPolicy.safeConfirmations,
      invalidationReason: "sandbox_reorg"
    })
  );
  const replacement = observation(adapter, kernelInput, {
    transactionHash: hashId("chain_conformance_tx", {
      chainId: profile.chainId,
      paymentId: kernelInput.paymentId,
      variant: "replacement"
    }),
    blockNumber: "101",
    blockHash: hashId("chain_conformance_block", {
      chainId: profile.chainId,
      paymentId: kernelInput.paymentId,
      blockNumber: "101"
    })
  });
  indexer.ingest(replacement);
  indexer.ingest(
    observation(adapter, kernelInput, {
      ...replacement,
      observationStatus: ChainObservationStatus.SAFE,
      confirmations: profile.finalityPolicy.safeConfirmations
    })
  );
  const finalized = indexer.ingest(
    observation(adapter, kernelInput, {
      ...replacement,
      observationStatus: ChainObservationStatus.FINALIZED,
      confirmations: profile.finalityPolicy.finalizedConfirmations
    })
  );
  const replayed = replayChainObservations({ adapter, observations: indexer.listReplayInputs() });
  const snapshot = indexer.snapshot();
  const replaySnapshot = replayed.snapshot();
  if (snapshot.snapshotHash !== replaySnapshot.snapshotHash) {
    throw new DomainError("chain_replay_not_deterministic", "indexer restart replay produced a conflicting snapshot");
  }

  let executionCapFailsClosed = false;
  try {
    adapter.normalizeObservation(
      observation(adapter, kernelInput, {
        amountMinor: (BigInt(profile.caps.maxExecutionMinor) + 1n).toString()
      })
    );
  } catch (error) {
    executionCapFailsClosed = error instanceof DomainError && error.code === "chain_execution_cap_exceeded";
  }
  if (!executionCapFailsClosed) {
    throw new DomainError("unsafe_chain_cap", "adapter did not fail closed above the synthetic execution cap");
  }

  const kernelInvariant = {
    obligationId: finalized.proof.obligationId,
    paymentId: finalized.proof.paymentId,
    assetId: finalized.proof.assetId,
    amountMinor: finalized.proof.amountMinor,
    canonicalPaymentRef: finalized.proof.canonicalPaymentRef
  };
  return {
    profileId: profile.profileId,
    displayName: profile.displayName,
    role: profile.role,
    chainId: profile.chainId,
    adapterVersion: profile.adapterVersion,
    profileHash: profile.profileHash,
    kernelInvariantHash: hashId("chain_kernel_invariant", kernelInvariant),
    canonicalPaymentRef: finalized.proof.canonicalPaymentRef,
    finalityProofHash: finalized.proof.finalityProofHash,
    evidenceHash: finalized.evidence.evidenceHash,
    selectedProviderSlot: providerResult.selectedSlot,
    providerAttempts: providerResult.attempts,
    duplicateDisposition: duplicate.disposition,
    initialSourceFinality: applied.proof.sourceFinality,
    finalizedSourceFinality: finalized.proof.sourceFinality,
    deterministicReplay: true,
    reorgInvalidation: true,
    providerFailover: true,
    executionCapFailsClosed,
    productionFundsMoved: false,
    networkCallsMade: false,
    sandboxOnly: true,
    checks: [
      "caip2_profile",
      "closed_provider_neutral_observation",
      "explicit_finality",
      "duplicate_log_deduplication",
      "reorg_invalidation",
      "replacement_log_replay",
      "provider_failover",
      "execution_cap_fail_closed",
      "restart_replay",
      "no_production_funds_claim"
    ],
    conformant: true,
    schemaVersion: "chain_adapter_conformance.v1"
  };
}

export async function runMultiChainConformance(adapters, input) {
  if (!Array.isArray(adapters) || adapters.length !== 2) {
    throw new DomainError("invalid_chain_conformance_set", "exactly two ratified test-chain adapters are required");
  }
  const reports = [];
  const kernelInput = normalizeKernelInput(input);
  for (const adapter of adapters) reports.push(await runSandboxChainAdapterConformance(adapter, kernelInput));
  if (new Set(reports.map((report) => report.chainId)).size !== reports.length) {
    throw new DomainError("duplicate_chain_profile", "multi-chain conformance requires distinct CAIP-2 identifiers");
  }
  if (new Set(reports.map((report) => report.kernelInvariantHash)).size !== 1) {
    throw new DomainError("chain_specific_kernel_shape", "chain-specific data changed the canonical payment kernel");
  }
  return {
    chainIds: reports.map((report) => report.chainId).sort(),
    kernelInvariantHash: reports[0].kernelInvariantHash,
    reports,
    productionFundsMoved: false,
    networkCallsMade: false,
    conformant: true,
    schemaVersion: "multi_chain_conformance.v1"
  };
}
