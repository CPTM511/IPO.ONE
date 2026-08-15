import { DomainError } from "../../domain/src/index.js";
import { assertAgentCreditOfferWorkflowReceipt } from "./agent-credit-offer-workflow-receipt.js";
import { assertHumanCreditOfferWorkflowReceipt } from "./human-credit-offer-workflow-receipt.js";

export const DUAL_NATIVE_OFFER_ECONOMICS_SCHEMA_VERSION =
  "dual_native_offer_economics.v1";

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
      "invalid_dual_native_offer_parity_input",
      "Dual-native Offer parity input is invalid"
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
      "invalid_dual_native_offer_parity_input",
      "Dual-native Offer parity input is invalid"
    );
  }
}

function mismatch() {
  throw parityError(
    "dual_native_credit_offer_parity_mismatch",
    "Human and Agent Offer economics do not match"
  );
}

function offsetMilliseconds(from, to) {
  const value = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isSafeInteger(value) || value <= 0) mismatch();
  return value;
}

function economics(receipt) {
  const { creditIntent, decision, offer } = receipt;
  return {
    creditIntent: {
      assetId: creditIntent.assetId,
      requestedPrincipalMinor: creditIntent.requestedPrincipalMinor,
      purposeCode: creditIntent.purposeCode,
      requestedTermDays: creditIntent.requestedTermDays,
      repaymentFrequency: creditIntent.repaymentFrequency,
      installmentCount: creditIntent.installmentCount,
      status: creditIntent.status,
      sandboxOnly: creditIntent.sandboxOnly,
      productionFundsRequested: creditIntent.productionFundsRequested
    },
    decision: {
      status: decision.status,
      policyVersion: decision.policyVersion,
      featureSetVersion: decision.decisionPassport.featureSetVersion,
      approvedPrincipalMinor: decision.approvedPrincipalMinor,
      sandboxOnly: decision.sandboxOnly,
      productionAuthority: decision.productionAuthority,
      passportNonAuthorizing: decision.decisionPassport.nonAuthorizing,
      passportSandboxOnly: decision.decisionPassport.sandboxOnly,
      passportProductionAuthority: decision.decisionPassport.productionAuthority
    },
    offer: {
      assetId: offer.assetId,
      approvedPrincipalMinor: offer.approvedPrincipalMinor,
      annualRateBps: offer.annualRateBps,
      originationFeeMinor: offer.originationFeeMinor,
      repaymentFrequency: offer.repaymentFrequency,
      installmentCount: offer.installmentCount,
      firstPaymentOffsetMs: offsetMilliseconds(decision.decidedAt, offer.firstPaymentAt),
      maturityOffsetMs: offsetMilliseconds(decision.decidedAt, offer.maturityAt),
      validityOffsetMs: offsetMilliseconds(decision.decidedAt, offer.validUntil),
      disclosureRef: offer.disclosureRef,
      termsVersion: offer.termsVersion,
      status: offer.status,
      sandboxOnly: offer.sandboxOnly,
      productionFundsApproved: offer.productionFundsApproved
    },
    safety: {
      nonAuthorizing: receipt.nonAuthorizing,
      sandboxOnly: receipt.sandboxOnly,
      productionFundsApproved: receipt.productionFundsApproved,
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

export function assertDualNativeCreditOfferParity(input) {
  assertClosedInput(input);
  const { agentReceipt, humanReceipt } = input;
  assertHumanCreditOfferWorkflowReceipt(humanReceipt);
  assertAgentCreditOfferWorkflowReceipt(agentReceipt);
  if (
    humanReceipt.status !== "offer_ready" ||
    agentReceipt.status !== "offer_ready" ||
    !humanReceipt.offer ||
    !agentReceipt.offer
  ) {
    throw parityError(
      "dual_native_credit_offer_not_comparable",
      "Dual-native Offer parity requires two approved Offer Receipts"
    );
  }
  if (
    humanReceipt.creditIntent.status !== "decided" ||
    agentReceipt.creditIntent.status !== "decided" ||
    humanReceipt.decision.status !== "approved" ||
    agentReceipt.decision.status !== "approved" ||
    humanReceipt.offer.status !== "offered" ||
    agentReceipt.offer.status !== "offered"
  ) mismatch();
  if (
    humanReceipt.decision.decisionPassport.policyHash !==
      agentReceipt.decision.decisionPassport.policyHash ||
    humanReceipt.decision.decisionPassport.featureSetVersion !==
      agentReceipt.decision.decisionPassport.featureSetVersion
  ) mismatch();
  const humanEconomics = economics(humanReceipt);
  const agentEconomics = economics(agentReceipt);
  if (JSON.stringify(humanEconomics) !== JSON.stringify(agentEconomics)) mismatch();
  return deepFreeze({
    schemaVersion: DUAL_NATIVE_OFFER_ECONOMICS_SCHEMA_VERSION,
    matched: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsApproved: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    entries: {
      human: "consent_authenticated_http_loopback",
      agent: "mandate_mcp_stdio_local"
    },
    economics: humanEconomics
  });
}
