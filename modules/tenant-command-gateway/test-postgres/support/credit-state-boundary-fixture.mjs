import { hashId } from "../../../../packages/domain/src/index.js";

// Synthetic upstream fixture adapted from pool-obligation-integration.test.mjs.
export function creditBoundaryFixture(subjectKey, sequence, writtenOff = false) {
  const SUBJECT_ID = `subject_credit_boundary_${subjectKey}`;
  const PRINCIPAL_ID = `principal_credit_boundary_${subjectKey}`;
  const OBLIGATION_ID = `obligation_credit_boundary_${subjectKey}_${sequence}`;
  const ACCOUNT_BINDING_ID = `account_credit_boundary_${subjectKey}`;
  const CHAIN = "eip155:84532";
  const ACCOUNT = "0x2222222222222222222222222222222222222222";
  const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
  const createdAt = "2026-08-23T00:00:00.000Z";
  const installmentId = `installment_credit_boundary_${subjectKey}_${sequence}`;
  const riskDecisionId = `decision_credit_boundary_${subjectKey}_${sequence}`;
  const decisionHash = hashId("m2a006_risk_decision", riskDecisionId);
  const policyHash = hashId("m2a006_risk_policy", "v1");
  const featureSnapshotHash = hashId("m2a006_feature_snapshot", riskDecisionId);
  const riskFeatureSnapshotId = `risk_feature_snapshot_${featureSnapshotHash.slice(2)}`;
  const decisionPassportHash = hashId("m2a006_decision_passport", riskDecisionId);
  const result = {
    principal: {
      principalId: PRINCIPAL_ID,
      principalHash: hashId("m2a006_principal", PRINCIPAL_ID),
      principalType: "individual",
      responsibilityScope: "full",
      status: "active",
      createdAt,
      schemaVersion: "principal.v1"
    },
    subject: {
      subjectId: SUBJECT_ID,
      subjectHash: hashId("m2a006_subject", SUBJECT_ID),
      subjectType: "human",
      displayName: "Synthetic M2A-006 Human",
      primaryPrincipalId: PRINCIPAL_ID,
      riskTier: "standard",
      prototypeOnly: true,
      status: "active",
      createdAt,
      updatedAt: createdAt,
      schemaVersion: "subject.v1"
    },
    accountBinding: {
      accountBindingId: ACCOUNT_BINDING_ID,
      subjectId: SUBJECT_ID,
      accountHash: hashId("m2a006_account", `${CHAIN}:${ACCOUNT}`),
      accountIdRef: `${CHAIN}:${ACCOUNT}`,
      chainId: CHAIN,
      purpose: "execution",
      signatureHash: hashId("m2a006_proof", "redacted"),
      nonce: hashId("m2a006_nonce", "one"),
      verificationMethod: "eip712_eoa_v1",
      status: "active",
      boundAt: createdAt,
      proofHash: hashId("m2a006_proof", "redacted"),
      protocolVersion: "1.2",
      executionChallengeId: "execution_account_binding_challenge_m2a006",
      controllerActorHash: hashId("m2a006_actor", "controller"),
      bindingKind: "execution",
      schemaVersion: "account_binding.v3"
    },
    riskDecision: {
      riskDecisionId,
      decisionHash,
      creditIntentId: `intent_credit_boundary_${subjectKey}_${sequence}`,
      subjectId: SUBJECT_ID,
      principalId: PRINCIPAL_ID,
      authorityType: "consent",
      authorityRef: "consent_m2a006",
      consentId: "consent_m2a006",
      assetId: ASSET_ID,
      status: "approved",
      modelVersion: "credit-application-rules.v1",
      limitMinor: "2000",
      utilizationMinor: "0",
      action: "credit_application_evaluation",
      reasons: [{ code: "sandbox_rules_v1_approved" }],
      policyHash,
      riskFeatureSnapshotId,
      featureSnapshotHash,
      riskFeatureSnapshot: {
        riskFeatureSnapshotId,
        featureSnapshotHash,
        featureSetVersion: "credit-application-evidence-features.v1",
        policyVersion: "credit-application-rules.v1",
        policyHash,
        features: { allRequiredFeaturesSatisfied: true },
        sourceEvidence: [{
          role: "credit_intent",
          evidenceHash: hashId("m2a006_risk_source", riskDecisionId)
        }],
        riskStateAttestation: {
          queryVersion: "credit-application-risk-state.v1",
          stateHash: hashId("m2a006_risk_state", riskDecisionId)
        },
        asOf: createdAt,
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: "risk_feature_snapshot.v1"
      },
      decisionPassport: {
        riskDecisionPassportId: `risk_decision_passport_${decisionPassportHash.slice(2)}`,
        decisionPassportHash,
        riskDecisionId,
        decisionHash,
        riskFeatureSnapshotId,
        featureSnapshotHash,
        featureSetVersion: "credit-application-evidence-features.v1",
        policyVersion: "credit-application-rules.v1",
        policyHash,
        reasonLineage: [{
          reasonCode: "sandbox_rules_v1_approved",
          featureKeys: ["allRequiredFeaturesSatisfied"],
          sourceRoles: ["credit_intent", "risk_state_attestation"]
        }],
        asOf: createdAt,
        nonAuthorizing: true,
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: "risk_decision_passport.v1"
      },
      sandboxOnly: true,
      productionAuthority: false,
      createdAt,
      schemaVersion: "risk_decision.v3"
    },
    obligation: {
      obligationId: OBLIGATION_ID,
      obligationHash: hashId("m2a006_obligation", OBLIGATION_ID),
      subjectId: SUBJECT_ID,
      principalId: PRINCIPAL_ID,
      creditIntentId: `intent_credit_boundary_${subjectKey}_${sequence}`,
      riskDecisionId: `decision_credit_boundary_${subjectKey}_${sequence}`,
      creditOfferId: `offer_${subjectKey}_${sequence}`,
      creditOfferAcceptanceId: `acceptance_${subjectKey}_${sequence}`,
      authorityType: "consent",
      authorityRef: "consent_m2a006",
      consentId: "consent_m2a006",
      assetId: ASSET_ID,
      originalPrincipalMinor: "2000",
      outstandingPrincipalMinor: "2000",
      annualRateBps: 0,
      originationFeeMinor: "0",
      accruedInterestMinor: "0",
      outstandingInterestMinor: "0",
      accruedFeesMinor: "0",
      outstandingFeesMinor: "0",
      totalRepaidMinor: "0",
      repaymentFrequency: "end_of_term",
      installmentCount: 1,
      firstPaymentAt: "2027-08-23T00:00:00.000Z",
      maturityAt: "2027-08-23T00:00:00.000Z",
      scheduleVersion: "obligation_schedule.v1",
      scheduleHash: hashId("m2a006_schedule", OBLIGATION_ID),
      scheduleSequence: 1,
      installments: [{
        installmentId,
        obligationId: OBLIGATION_ID,
        installmentNumber: 1,
        dueAt: "2027-08-23T00:00:00.000Z",
        scheduledPrincipalMinor: "2000",
        scheduledInterestMinor: "0",
        scheduledFeeMinor: "0",
        paidPrincipalMinor: "0",
        paidInterestMinor: "0",
        paidFeeMinor: "0",
        status: "scheduled",
        scheduleVersion: "obligation_schedule.v1",
        scheduleSequence: 1,
        schemaVersion: "obligation_installment.v1"
      }],
      executionStatus: "pending",
      sandboxOnly: true,
      productionFundsMoved: false,
      status: "created",
      servicingClassification: "current",
      daysPastDue: 0,
      oldestUnpaidInstallmentId: installmentId,
      servicingEffectiveAt: createdAt,
      servicingReasonCode: "obligation_created",
      servicingPolicyVersion: "sandbox-servicing-policy.v1",
      servicingOwnerCode: "sandbox_platform",
      writtenOffPrincipalMinor: "0",
      writtenOffInterestMinor: "0",
      writtenOffFeesMinor: "0",
      acceptedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: "obligation.v2"
    }
  };

  const obligation = result.obligation;
  obligation.status = writtenOff ? "written_off" : "fully_repaid";
  obligation.executionStatus = "executed";
  obligation.sandboxExecutionReceiptId = `receipt_${subjectKey}_${sequence}`;
  obligation.executedAt = createdAt;
  obligation.lastAccruedAt = createdAt;
  if (writtenOff) {
    obligation.servicingClassification = "written_off";
    obligation.resolutionType = "write_off";
    obligation.resolutionReasonCode = "synthetic_boundary_loss";
    obligation.resolutionAt = createdAt;
  }
  obligation.totalRepaidMinor = writtenOff ? "0" : obligation.originalPrincipalMinor;
  obligation.outstandingPrincipalMinor = writtenOff ? obligation.originalPrincipalMinor : "0";
  obligation.writtenOffPrincipalMinor = writtenOff ? obligation.originalPrincipalMinor : "0";
  return result;
}
