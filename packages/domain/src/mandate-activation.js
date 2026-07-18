import { MandateCapability, MandateStatus } from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { createMandateTermsHash } from "./credit-decision.js";
import { assertNoRawPiiReference, assertNonEmptyString } from "./validators.js";

export const SANDBOX_MANDATE_ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
export const SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE = "principal_authorizes_sandbox_credit_v1";

export function activateSandboxMandate(mandate, {
  expectedMandateHash,
  acknowledgedTermsHash,
  acknowledgementCode,
  activatedByActorId,
  now = new Date()
}) {
  if (!mandate || typeof mandate !== "object") {
    throw new DomainError("invalid_mandate", "Mandate is required");
  }
  for (const [name, value] of Object.entries({
    expectedMandateHash,
    acknowledgedTermsHash,
    acknowledgementCode,
    activatedByActorId
  })) assertNonEmptyString(name, value);
  assertNoRawPiiReference({ acknowledgementCode }, "mandateActivation");
  if (
    mandate.status !== MandateStatus.DRAFT ||
    mandate.sandboxOnly !== true ||
    mandate.productionAuthority !== false
  ) {
    throw new DomainError("mandate_not_activatable", "Mandate is not an activatable sandbox draft");
  }
  if (now < new Date(mandate.validFrom) || now >= new Date(mandate.expiresAt)) {
    throw new DomainError("mandate_not_current", "Mandate is outside its validity window");
  }
  const termsHash = mandate.termsHash ?? createMandateTermsHash(mandate);
  if (expectedMandateHash !== mandate.mandateHash || acknowledgedTermsHash !== termsHash) {
    throw new DomainError("mandate_acknowledgement_stale", "Mandate acknowledgement hashes are stale");
  }
  if (acknowledgementCode !== SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE) {
    throw new DomainError("invalid_mandate_acknowledgement", "Mandate acknowledgement code is invalid");
  }
  const required = [
    MandateCapability.REQUEST_CREDIT,
    MandateCapability.ACCEPT_CREDIT_OFFER,
    MandateCapability.EXECUTE_SANDBOX_CREDIT
  ];
  if (
    required.some((capability) => !mandate.capabilities.includes(capability)) ||
    mandate.assetIds.length !== 1 ||
    mandate.assetIds[0] !== SANDBOX_MANDATE_ASSET_ID
  ) {
    throw new DomainError("mandate_scope_not_activatable", "Mandate lacks the closed sandbox credit scope");
  }
  const activatedAt = now.toISOString();
  const acknowledgement = {
    expectedMandateHash,
    acknowledgedTermsHash,
    acknowledgementCode,
    activatedByActorId,
    activatedAt
  };
  return {
    ...structuredClone(mandate),
    termsHash,
    sandboxOnly: true,
    productionAuthority: false,
    status: MandateStatus.ACTIVE,
    activationAcknowledgement: {
      ...acknowledgement,
      evidenceHash: hashId("sandbox_mandate_activation_acknowledgement", acknowledgement)
    },
    updatedAt: activatedAt,
    schemaVersion: "mandate.v3"
  };
}
