import { DomainError } from "../../domain/src/index.js";
import { assertAgentSandboxObligationWorkflowReceipt } from "./agent-sandbox-obligation-workflow-receipt.js";
import { assertHumanSandboxObligationWorkflowReceipt } from "./human-sandbox-obligation-workflow-receipt.js";

export const DUAL_NATIVE_OBLIGATION_ECONOMICS_SCHEMA_VERSION =
  "dual_native_obligation_economics.v1";

const CONFIG_KEYS = new Set(["agentReceipt", "humanReceipt"]);

function parityError(code, message) {
  return new DomainError(code, message);
}

function assertClosedInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw parityError(
      "invalid_dual_native_obligation_parity_input",
      "Dual-native Obligation parity input is invalid"
    );
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== CONFIG_KEYS.size ||
    keys.some((key) => typeof key !== "string" || !CONFIG_KEYS.has(key)) ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return descriptor?.get || descriptor?.set;
    })
  ) {
    throw parityError(
      "invalid_dual_native_obligation_parity_input",
      "Dual-native Obligation parity input is invalid"
    );
  }
}

function mismatch() {
  throw parityError(
    "dual_native_sandbox_obligation_parity_mismatch",
    "Human and Agent sandbox Obligation economics do not match"
  );
}

function offsetMilliseconds(from, to, { allowZero = false } = {}) {
  const value = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) mismatch();
  return value;
}

function installmentEconomics(installment, acceptedAt) {
  return {
    installmentNumber: installment.installmentNumber,
    dueOffsetMs: offsetMilliseconds(acceptedAt, installment.dueAt),
    scheduledPrincipalMinor: installment.scheduledPrincipalMinor,
    scheduledInterestMinor: installment.scheduledInterestMinor,
    scheduledFeeMinor: installment.scheduledFeeMinor,
    paidPrincipalMinor: installment.paidPrincipalMinor,
    paidInterestMinor: installment.paidInterestMinor,
    paidFeeMinor: installment.paidFeeMinor,
    status: installment.status,
    scheduleVersion: installment.scheduleVersion,
    scheduleSequence: installment.scheduleSequence,
    schemaVersion: installment.schemaVersion
  };
}

function economics(receipt) {
  const { acceptance, executionReceipt, obligation, repayment } = receipt;
  return {
    obligation: {
      assetId: obligation.assetId,
      originalPrincipalMinor: obligation.originalPrincipalMinor,
      outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
      annualRateBps: obligation.annualRateBps,
      originationFeeMinor: obligation.originationFeeMinor,
      accruedInterestMinor: obligation.accruedInterestMinor,
      outstandingInterestMinor: obligation.outstandingInterestMinor,
      accruedFeesMinor: obligation.accruedFeesMinor,
      outstandingFeesMinor: obligation.outstandingFeesMinor,
      totalRepaidMinor: obligation.totalRepaidMinor,
      repaymentFrequency: obligation.repaymentFrequency,
      installmentCount: obligation.installmentCount,
      firstPaymentOffsetMs: offsetMilliseconds(acceptance.acceptedAt, obligation.firstPaymentAt),
      maturityOffsetMs: offsetMilliseconds(acceptance.acceptedAt, obligation.maturityAt),
      scheduleVersion: obligation.scheduleVersion,
      scheduleSequence: obligation.scheduleSequence,
      installments: obligation.installments.map((installment) =>
        installmentEconomics(installment, acceptance.acceptedAt)
      ),
      executionStatus: obligation.executionStatus,
      status: obligation.status,
      servicingClassification: obligation.servicingClassification,
      daysPastDue: obligation.daysPastDue,
      servicingReasonCode: obligation.servicingReasonCode,
      servicingPolicyVersion: obligation.servicingPolicyVersion,
      servicingOwnerCode: obligation.servicingOwnerCode,
      writtenOffPrincipalMinor: obligation.writtenOffPrincipalMinor,
      writtenOffInterestMinor: obligation.writtenOffInterestMinor,
      writtenOffFeesMinor: obligation.writtenOffFeesMinor
    },
    execution: {
      assetId: executionReceipt.assetId,
      amountMinor: executionReceipt.amountMinor,
      adapterId: executionReceipt.adapterId,
      adapterVersion: executionReceipt.adapterVersion,
      executedOffsetMs: offsetMilliseconds(acceptance.acceptedAt, executionReceipt.executedAt),
      sandboxOnly: executionReceipt.sandboxOnly,
      productionFundsMoved: executionReceipt.productionFundsMoved,
      withdrawable: executionReceipt.withdrawable
    },
    repayment: {
      assetId: repayment.assetId,
      requestedMinor: repayment.requestedMinor,
      appliedMinor: repayment.appliedMinor,
      appliedFeeMinor: repayment.appliedFeeMinor,
      appliedInterestMinor: repayment.appliedInterestMinor,
      appliedPrincipalMinor: repayment.appliedPrincipalMinor,
      surplusMinor: repayment.surplusMinor,
      remainingPrincipalMinor: repayment.remainingPrincipalMinor,
      remainingInterestMinor: repayment.remainingInterestMinor,
      remainingFeesMinor: repayment.remainingFeesMinor,
      accruedInterestMinor: repayment.accruedInterestMinor,
      accrualDays: repayment.accrualDays,
      occurredOffsetMs: offsetMilliseconds(acceptance.acceptedAt, repayment.occurredAt),
      sandboxOnly: repayment.sandboxOnly,
      productionFundsMoved: repayment.productionFundsMoved
    },
    safety: {
      nonAuthorizing: receipt.nonAuthorizing,
      sandboxOnly: receipt.sandboxOnly,
      productionFundsMoved: receipt.productionFundsMoved,
      withdrawable: receipt.withdrawable,
      fundsAuthority: receipt.fundsAuthority,
      credentialsIncluded: receipt.credentialsIncluded,
      publicEndpointEnabled: receipt.publicEndpointEnabled,
      remoteMcpEnabled: receipt.remoteMcpEnabled
    }
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function assertDualNativeSandboxObligationParity(input) {
  assertClosedInput(input);
  const { agentReceipt, humanReceipt } = input;
  assertHumanSandboxObligationWorkflowReceipt(humanReceipt);
  assertAgentSandboxObligationWorkflowReceipt(agentReceipt);
  if (
    humanReceipt.status !== "repayment_posted" ||
    agentReceipt.status !== "repayment_posted" ||
    humanReceipt.acceptance.authorityType !== "consent" ||
    agentReceipt.acceptance.authorityType !== "mandate"
  ) mismatch();
  const humanEconomics = economics(humanReceipt);
  const agentEconomics = economics(agentReceipt);
  if (JSON.stringify(humanEconomics) !== JSON.stringify(agentEconomics)) mismatch();
  return deepFreeze({
    schemaVersion: DUAL_NATIVE_OBLIGATION_ECONOMICS_SCHEMA_VERSION,
    matched: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    entries: {
      human: "consent_authenticated_http_loopback",
      agent: "mandate_local_in_process"
    },
    economics: humanEconomics
  });
}
