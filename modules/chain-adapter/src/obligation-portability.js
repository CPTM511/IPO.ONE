import {
  assertAgentSandboxObligationWorkflowReceipt,
  assertHumanSandboxObligationWorkflowReceipt,
  assertSandboxObligationPortabilityReceipt
} from "@ipo-one/api-contract";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { listSandboxChainProfiles } from "./chain-profiles.js";
import { runMultiChainConformance } from "./conformance.js";
import { SandboxChainAdapter } from "./sandbox-chain-adapter.js";

const INPUT_KEYS = new Set(["workflowReceipt"]);
const EXPECTED_CHAIN_IDS = new Set(["eip155:84532", "eip155:1952"]);
const RECEIPT_SCHEMA_VERSIONS = new Map([
  ["human_sandbox_obligation_workflow_receipt.v1", "human"],
  ["agent_sandbox_obligation_workflow_receipt.v1", "agent"]
]);

function failInput() {
  throw new DomainError(
    "invalid_obligation_portability_input",
    "Obligation portability input must contain one closed sandbox workflow receipt"
  );
}

function assertPlainDataGraph(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) failInput();
  seen.add(value);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) failInput();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") failInput();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) failInput();
    assertPlainDataGraph(descriptor.value, seen);
  }
  seen.delete(value);
}

function assertClosedInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) failInput();
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== INPUT_KEYS.size ||
    keys.some((key) => typeof key !== "string" || !INPUT_KEYS.has(key)) ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return descriptor?.get || descriptor?.set;
    })
  ) failInput();
  assertPlainDataGraph(input.workflowReceipt);
}

function validateWorkflowReceipt(receipt) {
  const entryMode = RECEIPT_SCHEMA_VERSIONS.get(receipt?.schemaVersion);
  if (entryMode === "human") assertHumanSandboxObligationWorkflowReceipt(receipt);
  else if (entryMode === "agent") assertAgentSandboxObligationWorkflowReceipt(receipt);
  else failInput();
  return entryMode;
}

function assertWorkflowLinkage(receipt) {
  if (
    receipt.status !== "repayment_posted" ||
    receipt.obligation.schemaVersion !== "obligation.v2" ||
    receipt.obligation.obligationId !== receipt.repayment.obligationId ||
    receipt.obligation.assetId !== receipt.repayment.assetId ||
    receipt.obligation.executionStatus !== "executed" ||
    receipt.repayment.sandboxOnly !== true ||
    receipt.repayment.productionFundsMoved !== false ||
    receipt.productionFundsMoved !== false ||
    receipt.withdrawable !== false
  ) {
    throw new DomainError(
      "obligation_portability_linkage_mismatch",
      "Sandbox workflow receipt does not preserve one executed Obligation and repayment linkage"
    );
  }
}

function assertConformanceSet(conformance) {
  if (
    conformance.conformant !== true ||
    conformance.productionFundsMoved !== false ||
    conformance.networkCallsMade !== false ||
    conformance.reports.length !== 2 ||
    conformance.reports.some((report) => !EXPECTED_CHAIN_IDS.has(report.chainId)) ||
    new Set(conformance.reports.map((report) => report.chainId)).size !== 2 ||
    new Set(conformance.reports.map((report) => report.canonicalPaymentRef)).size !== 1 ||
    new Set(conformance.reports.map((report) => report.kernelInvariantHash)).size !== 1 ||
    conformance.reports.some((report) => (
      report.finalizedSourceFinality !== "finalized" ||
      report.duplicateDisposition !== "duplicate" ||
      report.selectedProviderSlot !== "secondary" ||
      report.deterministicReplay !== true ||
      report.reorgInvalidation !== true ||
      report.providerFailover !== true ||
      report.executionCapFailsClosed !== true ||
      report.sandboxOnly !== true ||
      report.productionFundsMoved !== false ||
      report.networkCallsMade !== false
    ))
  ) {
    throw new DomainError(
      "obligation_portability_conformance_failed",
      "Both ratified test-chain profiles must preserve one sandbox Payment kernel"
    );
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export async function runSandboxObligationPortabilityConformance(input) {
  assertClosedInput(input);
  const receipt = input.workflowReceipt;
  const entryMode = validateWorkflowReceipt(receipt);
  assertWorkflowLinkage(receipt);

  const kernelInput = {
    obligationId: receipt.obligation.obligationId,
    paymentId: receipt.repayment.repaymentId,
    assetId: receipt.repayment.assetId,
    amountMinor: receipt.repayment.appliedMinor,
    observedAt: receipt.repayment.occurredAt
  };
  const adapters = listSandboxChainProfiles().map((profile) => new SandboxChainAdapter({ profile }));
  const conformance = await runMultiChainConformance(adapters, kernelInput);
  assertConformanceSet(conformance);

  const canonicalPaymentRef = conformance.reports[0].canonicalPaymentRef;
  const expectedCanonicalPaymentRef = hashId("canonical_payment", {
    obligationId: kernelInput.obligationId,
    paymentId: kernelInput.paymentId,
    assetId: kernelInput.assetId,
    amountMinor: kernelInput.amountMinor
  });
  if (canonicalPaymentRef !== expectedCanonicalPaymentRef) {
    throw new DomainError(
      "obligation_portability_kernel_mismatch",
      "Chain-specific data changed the canonical sandbox Payment reference"
    );
  }

  const profiles = conformance.reports.map((report) => ({
    profileId: report.profileId,
    displayName: report.displayName,
    role: report.role,
    chainId: report.chainId,
    adapterVersion: report.adapterVersion,
    profileHash: report.profileHash,
    canonicalPaymentRef: report.canonicalPaymentRef,
    finalityProofHash: report.finalityProofHash,
    evidenceHash: report.evidenceHash,
    sourceFinality: report.finalizedSourceFinality,
    selectedProviderSlot: report.selectedProviderSlot,
    duplicateDisposition: report.duplicateDisposition,
    deterministicReplay: report.deterministicReplay,
    reorgInvalidation: report.reorgInvalidation,
    providerFailover: report.providerFailover,
    executionCapFailsClosed: report.executionCapFailsClosed,
    sandboxOnly: true,
    productionFundsMoved: false,
    networkCallsMade: false
  }));
  const core = {
    schemaVersion: "sandbox_obligation_portability_receipt.v1",
    status: "conformant",
    entryMode,
    sourceReceiptSchemaVersion: receipt.schemaVersion,
    obligationId: kernelInput.obligationId,
    paymentId: kernelInput.paymentId,
    assetId: kernelInput.assetId,
    amountMinor: kernelInput.amountMinor,
    principalLedgerTransactionId: receipt.principalLedgerTransactionId,
    paymentLedgerTransactionId: receipt.repayment.ledgerTransactionId,
    canonicalPaymentRef,
    kernelInvariantHash: conformance.kernelInvariantHash,
    profiles,
    invariants: {
      canonicalPaymentChainNeutral: true,
      obligationKernelUnchanged: true,
      ledgerReferencesBound: true,
      explicitFinality: true,
      deterministicReplay: true,
      reorgInvalidation: true,
      providerFailover: true,
      executionCapFailsClosed: true
    },
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    fundsAuthority: false,
    networkCallsMade: false,
    liveTestnetExecution: false,
    credentialsIncluded: false,
    privateKeysIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false
  };
  const portabilityReceipt = {
    ...core,
    receiptHash: hashId("sandbox_obligation_portability_receipt", core)
  };
  assertSandboxObligationPortabilityReceipt(portabilityReceipt);
  return deepFreeze(portabilityReceipt);
}
