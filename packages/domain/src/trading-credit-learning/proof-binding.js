import { createOperationalId, hashId } from "../ids.js";
import { assessmentSafety } from "./assessment-contract.js";
import {
  TRADING_CREDIT_PROOF_BINDING_SCHEMA_VERSION,
  TRADING_CREDIT_ZERO_HASH
} from "./contracts.js";
import {
  fail,
  hash,
  immutable,
  timestamp
} from "./shared.js";

export function createTradingCreditProofBinding({
  assessment,
  acceptedOfferHash,
  providerScopeHash,
  obligationProofHash = TRADING_CREDIT_ZERO_HASH,
  validUntil
}) {
  const current = assessmentSafety(assessment);
  if (current.status !== "eligible_shadow") {
    fail("only an eligible Shadow Assessment can produce a proof binding");
  }
  const expiry = timestamp("validUntil", validUntil);
  if (new Date(expiry).getTime() <= new Date(current.evaluatedAt).getTime()) {
    fail("proof binding expiry must follow the assessment");
  }
  if (new Date(expiry).getTime() % 1_000 !== 0) {
    fail("proof binding expiry must use whole seconds");
  }
  const projectionFields = {
    subjectAccountHash: hashId("trading_credit_subject_account", {
      subjectId: current.subjectId,
      principalId: current.principalId,
      accountReferenceHash: current.accountReferenceHash,
      accountBindingHash: current.accountBindingHash
    }),
    acceptedOfferHash: hash("acceptedOfferHash", acceptedOfferHash),
    policyHash: current.policy.policyHash,
    providerScopeHash: hash("providerScopeHash", providerScopeHash),
    creditStateHash: current.proofBundle.creditStateHash,
    obligationProofHash: hash(
      "obligationProofHash",
      obligationProofHash,
      { allowZero: true }
    ),
    validUntil: expiry
  };
  const bindingCore = {
    assessmentHash: current.assessmentHash,
    registryContractSchemaVersion:
      "ipo_one_credit_authorization_registry.v1",
    projectionFields
  };
  return immutable({
    proofBindingId: createOperationalId("trading_credit_proof_binding"),
    proofBindingHash: hashId(
      "trading_credit_registry_proof_binding",
      bindingCore
    ),
    assessmentHash: current.assessmentHash,
    registryContractSchemaVersion:
      "ipo_one_credit_authorization_registry.v1",
    projectionFields,
    missingServerResolvedFields: ["authorization_id", "account_id"],
    projectionReady: false,
    publicationAllowed: false,
    requiresExistingApprovalGate: true,
    transactionCalldataIncluded: false,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false,
    productionAuthority: false,
    schemaVersion: TRADING_CREDIT_PROOF_BINDING_SCHEMA_VERSION
  });
}
