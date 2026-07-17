import Ajv2020 from "ajv/dist/2020.js";
import { DomainError } from "../../domain/src/index.js";
import receiptSchema from "../../../schemas/v2/agent-credit-offer-workflow-receipt.schema.json" with { type: "json" };
import mandateSchema from "../../../schemas/v2/mandate.schema.json" with { type: "json" };
import providerIntentAcknowledgementSchema from "../../../schemas/v2/provider-intent-acknowledgement.schema.json" with { type: "json" };
import providerIntentViewSchema from "../../../schemas/v2/provider-intent-view.schema.json" with { type: "json" };
import tenantProtocolResultSchema from "../../../schemas/v2/tenant-protocol-result.schema.json" with { type: "json" };

export const AGENT_CREDIT_OFFER_WORKFLOW_RECEIPT_SCHEMA_VERSION =
  "agent_credit_offer_workflow_receipt.v1";

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
ajv.addSchema(tenantProtocolResultSchema);
const validateReceipt = ajv.compile(receiptSchema);

export function isAgentCreditOfferWorkflowReceipt(value) {
  return validateReceipt(value) === true;
}

export function assertAgentCreditOfferWorkflowReceipt(value) {
  if (!isAgentCreditOfferWorkflowReceipt(value)) {
    throw new DomainError(
      "invalid_agent_credit_offer_workflow_receipt",
      "Agent credit workflow receipt does not satisfy its versioned contract"
    );
  }
}
