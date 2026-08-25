import Ajv2020 from "ajv/dist/2020.js";
import { DomainError } from "../../domain/src/index.js";
import receiptSchema from "../../../schemas/v2/human-credit-offer-workflow-receipt.schema.json" with { type: "json" };
import mandateSchema from "../../../schemas/v2/mandate.schema.json" with { type: "json" };
import providerIntentAcknowledgementSchema from "../../../schemas/v2/provider-intent-acknowledgement.schema.json" with { type: "json" };
import providerIntentViewSchema from "../../../schemas/v2/provider-intent-view.schema.json" with { type: "json" };
import creditPassportArtifactSchema from "../../../schemas/v2/credit-passport-artifact.schema.json" with { type: "json" };
import capitalPartnerProfileSchema from "../../../schemas/v2/capital-partner-profile.schema.json" with { type: "json" };
import capitalPartnerPortfolioSchema from "../../../schemas/v2/capital-partner-portfolio.schema.json" with { type: "json" };
import creditOfferV2Schema from "../../../schemas/v2/credit-offer-v2.schema.json" with { type: "json" };
import facilityViewSchema from "../../../schemas/v2/facility-view.schema.json" with { type: "json" };
import officialReportArtifactSchema from "../../../schemas/v2/official-report-artifact.schema.json" with { type: "json" };
import tradingCreditProfileSchema from "../../../schemas/v2/trading-credit-profile.schema.json" with { type: "json" };
import tradingRealCreditProfileSchema from "../../../schemas/v2/trading-real-credit-profile.schema.json" with { type: "json" };
import tradingCapitalRequestSchema from "../../../schemas/v2/trading-capital-request.schema.json" with { type: "json" };
import tradingProviderMandateSchema from "../../../schemas/v2/trading-provider-mandate.schema.json" with { type: "json" };
import tradingMatchProposalSchema from "../../../schemas/v2/trading-match-proposal.schema.json" with { type: "json" };
import tradingFacilitySchema from "../../../schemas/v2/trading-facility.schema.json" with { type: "json" };
import tradingOrderIntentSchema from "../../../schemas/v2/trading-order-intent.schema.json" with { type: "json" };
import tradingFacilityRiskEvaluationSchema from "../../../schemas/v2/trading-facility-risk-evaluation.schema.json" with { type: "json" };
import tradingFacilityCloseRequestSchema from "../../../schemas/v2/trading-facility-close-request.schema.json" with { type: "json" };
import tradingSettlementSchema from "../../../schemas/v2/trading-settlement.schema.json" with { type: "json" };
import tradingPerformanceProofSchema from "../../../schemas/v2/trading-performance-proof.schema.json" with { type: "json" };
import agentSecuredFacilityAuthorizationSchema from "../../../schemas/v2/agent-secured-facility-authorization.schema.json" with { type: "json" };
import tenantProtocolResultSchema from "../../../schemas/v2/tenant-protocol-result.schema.json" with { type: "json" };

export const HUMAN_CREDIT_OFFER_WORKFLOW_RECEIPT_SCHEMA_VERSION =
  "human_credit_offer_workflow_receipt.v1";

function dateTime(value) {
  return (
    typeof value === "string" &&
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

const ajv = new Ajv2020({
  allErrors: false,
  allowUnionTypes: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  strictRequired: false,
  useDefaults: false,
  validateFormats: true
});
ajv.addFormat("date-time", { type: "string", validate: dateTime });
ajv.addSchema(mandateSchema);
ajv.addSchema(providerIntentAcknowledgementSchema);
ajv.addSchema(providerIntentViewSchema);
ajv.addSchema(creditPassportArtifactSchema);
ajv.addSchema(capitalPartnerProfileSchema);
ajv.addSchema(capitalPartnerPortfolioSchema);
ajv.addSchema(creditOfferV2Schema);
ajv.addSchema(facilityViewSchema);
ajv.addSchema(officialReportArtifactSchema);
ajv.addSchema(tradingCreditProfileSchema);
ajv.addSchema(tradingRealCreditProfileSchema);
ajv.addSchema(tradingCapitalRequestSchema);
ajv.addSchema(tradingProviderMandateSchema);
ajv.addSchema(tradingMatchProposalSchema);
ajv.addSchema(tradingFacilitySchema);
ajv.addSchema(tradingOrderIntentSchema);
ajv.addSchema(tradingFacilityRiskEvaluationSchema);
ajv.addSchema(tradingFacilityCloseRequestSchema);
ajv.addSchema(tradingSettlementSchema);
ajv.addSchema(tradingPerformanceProofSchema);
ajv.addSchema(agentSecuredFacilityAuthorizationSchema);
ajv.addSchema(tenantProtocolResultSchema);
const validateReceipt = ajv.compile(receiptSchema);

export function isHumanCreditOfferWorkflowReceipt(value) {
  return validateReceipt(value) === true;
}

export function assertHumanCreditOfferWorkflowReceipt(value) {
  if (!isHumanCreditOfferWorkflowReceipt(value)) {
    throw new DomainError(
      "invalid_human_credit_offer_workflow_receipt",
      "Human credit workflow receipt does not satisfy its versioned contract"
    );
  }
}
