export function summarizeHumanConsent(consent) {
  return {
    consentId: consent.consentId,
    consentHash: consent.consentHash,
    termsHash: consent.termsHash,
    dataUsageHash: consent.dataUsageHash,
    status: consent.status,
    purposes: consent.purposes.slice(0, 8),
    allowedAssetIds: consent.allowedAssetIds.slice(0, 16),
    allowedCreditPurposeCodes: consent.allowedCreditPurposeCodes.slice(0, 16),
    allowedRepaymentFrequencies: consent.allowedRepaymentFrequencies.slice(0, 8),
    maxRequestedPrincipalMinor: consent.maxRequestedPrincipalMinor,
    maxRequestedTermDays: consent.maxRequestedTermDays,
    maxInstallmentCount: consent.maxInstallmentCount,
    validFrom: consent.validFrom,
    expiresAt: consent.expiresAt,
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt
  };
}

export function summarizeHumanIdentityReference(reference) {
  return {
    identityReferenceId: reference.identityReferenceId,
    identityReferenceHash: reference.identityReferenceHash,
    referenceEvidenceHash: reference.referenceEvidenceHash,
    consentId: reference.consentId,
    consentHash: reference.consentHash,
    referenceType: reference.referenceType,
    providerVersion: reference.providerVersion,
    assuranceLevel: reference.assuranceLevel,
    purposeCodes: reference.purposeCodes.slice(0, 8),
    validFrom: reference.validFrom,
    expiresAt: reference.expiresAt,
    syntheticOnly: reference.syntheticOnly,
    productionVerified: reference.productionVerified,
    status: reference.status,
    createdAt: reference.createdAt,
    updatedAt: reference.updatedAt
  };
}
