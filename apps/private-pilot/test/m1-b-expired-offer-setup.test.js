import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION,
  M1_B_EXPIRED_OFFER_SETUP_LIMITS,
  M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE,
  createM1BExpiredOfferCriticalBinding,
  createM1BExpiredOfferSetupCapture,
  parseM1BExpiredOfferSetupResponseLine,
  produceM1BExpiredOfferSetupFixtureReceiptForTest,
  produceM1BExpiredOfferSetupReceipt,
  validateM1BExpiredOfferSetupReceipt
} from "../src/m1-b-expired-offer-setup.js";
import {
  hashM1BAcceptanceManifest,
  inspectM1BResponseOnlyOperation
} from "../src/m1-b-human-capital-partner-acceptance.js";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);
const IMAGE = `sha256:${"c".repeat(64)}`;
const DIGEST = "d".repeat(64);
const HASH = `0x${"1".repeat(64)}`;
const OTHER_HASH = `0x${"2".repeat(64)}`;
const THIRD_HASH = `0x${"3".repeat(64)}`;
const START = "2026-08-15T00:00:00.000Z";
const TENANT = "tenant_local";
const HUMAN = "actor_human_borrower_pilot";
const CAPITAL_PARTNER = "actor_capital_partner_pilot";
const SUBJECT = "subject_human_shared";
const PARTNER_ID = "capital_partner_local";
const CONSENT_C = "consent_expired_c";
const INTENT_C = "credit_intent_expired_c";
const DECISION_C = "risk_decision_expired_c";
const PASSPORT_C = "passport_expired_c";
const PRELIMINARY_C = "credit_offer_preliminary_c";
const OFFER_C = "credit_offer_expired_c";
const CREATED_AT = "2026-08-15T00:00:35.000Z";
const VALID_UNTIL = "2026-08-15T00:02:20.000Z";
const BASELINE_AT = "2026-08-15T00:00:40.000Z";
const EXPIRED_AT = "2026-08-15T00:02:20.000Z";
const FINAL_AT = "2026-08-15T00:02:21.000Z";

function actorHash(actorId) {
  return hashId("m1_b_acceptance_actor_reference", { actorId });
}

function criticalReceipt() {
  const preparation = (suffix) => ({
    consentId: `consent_${suffix}`,
    creditIntentId: `credit_intent_${suffix}`,
    riskDecisionId: `risk_decision_${suffix}`,
    passportArtifactId: `passport_${suffix}`,
    preliminaryOfferId: `credit_offer_preliminary_${suffix}`
  });
  const lineage = (suffix, status, digit) => ({
    subjectId: SUBJECT,
    borrowerActorRefHash: actorHash(HUMAN),
    authoredOffer: {
      creditOfferId: `credit_offer_${suffix}`,
      creditOfferHash: `0x${digit.repeat(64)}`,
      termsHash: `0x${String(Number(digit) + 1).repeat(64)}`,
      aggregateVersion: status === "offered" ? 1 : 2,
      status
    }
  });
  return {
    schemaVersion: "m1_b_capital_partner_critical_receipt.v1",
    candidateReleaseId: SHA,
    databaseStartedAt: START,
    capturedAt: "2026-08-15T00:00:10.000Z",
    sourceRuntime: "local_exact_commit",
    status: "passed",
    profile: {
      capitalPartnerId: PARTNER_ID,
      operatorActorRefHash: actorHash(CAPITAL_PARTNER)
    },
    preparation: {
      currentLineage: preparation("a"),
      withdrawalLineage: preparation("b")
    },
    currentLineage: lineage("a", "offered", "4"),
    withdrawalLineage: lineage("b", "withdrawn", "6"),
    durability: { fixtureUsed: false },
    safety: {
      sandboxOnly: true,
      productionFundsApproved: false,
      fundsAuthority: false
    }
  };
}

function inboxResponse() {
  return {
    items: [{
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: PASSPORT_C
      },
      reviewContext: {
        creditIntentId: INTENT_C,
        artifactHash: HASH,
        artifactVersion: 1
      },
      summary: {
        claimCount: 3,
        purpose: "private_credit_review",
        issuedAt: "2026-08-15T00:00:18.000Z",
        expiresAt: "2026-08-15T01:00:18.000Z"
      }
    }],
    count: 1,
    hasMore: false,
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
  };
}

function authorResponse({ validUntil = VALID_UNTIL } = {}) {
  return {
    offer: {
      creditOfferId: OFFER_C,
      creditOfferHash: OTHER_HASH,
      termsHash: THIRD_HASH,
      creditIntentId: INTENT_C,
      subjectId: SUBJECT,
      riskDecisionId: DECISION_C,
      capitalPartnerId: PARTNER_ID,
      creditPassportArtifactId: PASSPORT_C,
      creditPassportArtifactHash: HASH,
      creditPassportArtifactVersion: 1,
      passportVerificationHash: HASH,
      underwritingSnapshotHash: OTHER_HASH,
      status: "offered",
      validUntil,
      sandboxOnly: true,
      productionFundsApproved: false,
      schemaVersion: "credit_offer.v2"
    },
    capitalPartner: { capitalPartnerId: PARTNER_ID },
    fundsAuthority: false,
    schemaVersion: "tenant_capital_partner_offer_authored.v1"
  };
}

function capturedEntry(sequence, response) {
  const [actorRole, operationId, responseSchemaVersion] =
    M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE[sequence - 1];
  return {
    sequence,
    actorRole,
    operationId,
    requestId: `request-expired-offer-${sequence}`,
    correlationId: `correlation-expired-offer-${sequence}`,
    responseSchemaVersion,
    capturedAt: sequence === 1
      ? "2026-08-15T00:00:30.000Z"
      : "2026-08-15T00:00:36.000Z",
    rawResponseHash: inspectM1BResponseOnlyOperation({
      operationId,
      responseSchemaVersion,
      response
    }).rawResponseHash,
    response
  };
}

function capture({ validUntil = VALID_UNTIL } = {}) {
  return createM1BExpiredOfferSetupCapture({
    candidateReleaseId: SHA,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: START,
    preparationObservedAt: "2026-08-15T00:00:20.000Z",
    responses: [
      capturedEntry(1, inboxResponse()),
      capturedEntry(2, authorResponse({ validUntil }))
    ]
  });
}

function authorizationAudit(operationId, suffix, actorId, {
  occurredAt = CREATED_AT,
  requestId = `request-${suffix}`,
  correlationId = `correlation-${suffix}`,
  resourceType = "workspace",
  resourceId = "workspace_local"
} = {}) {
  return {
    eventId: `authorization_${suffix}`,
    operationId,
    requestId,
    correlationId,
    resourceType,
    resourceId,
    authorizationDecision: "allow",
    authorizationDecisionId: `authorization_decision_${suffix}`,
    actorRefHash: actorHash(actorId),
    policyVersion: "authorization_policy.v1",
    reasonCode: "authorization_allowed",
    occurredAt
  };
}

function event(operationId, index, overrides = {}) {
  const value = {
    sequence: index,
    eventId: `event_${operationId}_${index}`,
    eventType: `${operationId}_event`,
    aggregateType: "credit_offer",
    aggregateId: OFFER_C,
    aggregateVersion: index + 1,
    payloadHash: HASH,
    evidenceId: `event_${operationId}_${index}`,
    evidenceHash: OTHER_HASH,
    evidencePayloadHash: HASH,
    sourceFinality: "finalized",
    causationId: `request-${operationId}`,
    correlationId: `correlation-${operationId}`,
    occurredAt: CREATED_AT,
    ...overrides
  };
  if (overrides.eventId !== undefined && overrides.evidenceId === undefined) {
    value.evidenceId = value.eventId;
  }
  if (plainObjectForFixture(value.payloadProjection)) {
    value.payloadHash = hashId("event_payload", value.payloadProjection);
    value.evidencePayloadHash = value.payloadHash;
  }
  return value;
}

function plainObjectForFixture(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function commandProof(operationId, index) {
  const requestId = `request-preparation-${index}`;
  const correlationId = index === 1 || index === 2
    ? "correlation-preparation-workflow"
    : `correlation-preparation-${index}`;
  const occurredAt = new Date(
    Date.parse(START) + 12_000 + (index * 2_000)
  ).toISOString();
  const completedAt = new Date(
    Date.parse(START) + 13_000 + (index * 2_000)
  ).toISOString();
  const auditInput = {
    requestId,
    correlationId,
    occurredAt
  };
  return {
    operationId,
    requestId,
    correlationId,
    resourceType: "workspace",
    resourceId: "workspace_local",
    authorizationAuditEventId: `authorization_preparation_${index}_1`,
    authorizationDecisionId: `authorization_decision_preparation_${index}_1`,
    authorizationDecision: "allow",
    authorizationAudits: [
      authorizationAudit(
        operationId,
        `preparation_${index}_1`,
        HUMAN,
        auditInput
      ),
      authorizationAudit(
        operationId,
        `preparation_${index}_2`,
        HUMAN,
        auditInput
      )
    ],
    commandHash: HASH,
    responseHash: OTHER_HASH,
    responseSchemaVersion: HUMAN_COMMAND_SCHEMAS[index],
    occurredAt,
    completedAt,
    eventManifest: [event(operationId, 0, {
      eventId: `event_preparation_${index}`,
      aggregateType: HUMAN_AGGREGATES[index],
      aggregateId: [CONSENT_C, INTENT_C, DECISION_C, PASSPORT_C][index],
      causationId: requestId,
      correlationId,
      occurredAt
    })]
  };
}

const HUMAN_COMMAND_SCHEMAS = [
  "tenant_consent_created.v1",
  "tenant_credit_intent_created.v1",
  "tenant_credit_application_evaluated.v2",
  "tenant_credit_passport_artifact_created.v1"
];
const HUMAN_AGGREGATES = [
  "consent",
  "credit_intent",
  "risk_decision",
  "credit_passport_artifact"
];

function queryObservation(operationId, index) {
  const requestId = `request-query-${index}`;
  const correlationId = "correlation-preparation-workflow";
  const occurredAt = new Date(
    Date.parse(START) + (index === 0 ? 13_500 : 15_500)
  ).toISOString();
  const auditInput = { requestId, correlationId, occurredAt };
  return {
    operationId,
    requestId,
    correlationId,
    resourceType: index === 0 ? "subject" : "credit_intent",
    resourceId: index === 0 ? SUBJECT : INTENT_C,
    responseDurability: "not_persisted_query_authorization_only",
    occurredAt,
    authorizationAudits: [
      authorizationAudit(operationId, `query_${index}_1`, HUMAN, auditInput),
      authorizationAudit(operationId, `query_${index}_2`, HUMAN, auditInput)
    ]
  };
}

function projection(entityType, entityId, digit = "8") {
  return {
    entityType,
    entityId,
    entityHash: `0x${digit.repeat(64)}`,
    rootAggregateType: entityType,
    rootAggregateId: entityId,
    aggregateVersion: 1,
    sourceEventId: `event_projection_${entityId}`,
    sourceEvidenceHash: HASH,
    sourceFinality: "finalized"
  };
}

function resources(actorId, definitions) {
  return definitions.map(([resourceType, resourceId]) => ({
    resourceType,
    resourceId,
    resourceStatus: "active",
    resourceVersion: 1,
    bindingRelationship: resourceType === "credit_passport_artifact" &&
      actorId === CAPITAL_PARTNER ? "verifier" : "owner",
    bindingStatus: "active",
    bindingVersion: 1,
    actorRefHash: actorHash(actorId)
  }));
}

function protectedState({
  offerHash,
  termsHash,
  validUntil,
  stateHash
}) {
  const empty = () => ({ rowCount: 0, manifestHash: HASH });
  return {
    manifest: {
      catalogVersion: "m1_b_operational_offer_protected_state.v2",
      offer: {
        offerHash,
        termsHash,
        status: "offered",
        schemaVersion: "credit_offer.v2",
        creditIntentRefHash: hashId(
          "m1_b_operational_credit_intent_reference",
          { value: INTENT_C }
        ),
        subjectRefHash: hashId("m1_b_operational_subject_reference", {
          value: SUBJECT
        }),
        capitalPartnerRefHash: hashId(
          "m1_b_operational_capital_partner_reference",
          { value: PARTNER_ID }
        ),
        capitalPartnerOperatorRefHash: hashId(
          "m1_b_operational_actor_reference",
          { value: CAPITAL_PARTNER }
        ),
        validUntil,
        acceptedAt: null,
        acceptanceRefHash: null,
        closedAt: null
      },
      related: {
        acceptance: empty(),
        obligations: empty(),
        executions: empty(),
        repayments: empty(),
        ledgerTransactions: empty()
      }
    },
    manifestHash: stateHash
  };
}

function pairSnapshot(binding, observedAt) {
  const currentProof = {
    ...projection("credit_offer", binding.currentLineage.creditOfferId, "9"),
    aggregateVersion: binding.currentLineage.aggregateVersion
  };
  const expiredProof = projection("credit_offer", OFFER_C, "7");
  const currentState = protectedState({
    offerHash: binding.currentLineage.creditOfferHash,
    termsHash: binding.currentLineage.termsHash,
    validUntil: "2026-08-16T00:00:00.000Z",
    stateHash: OTHER_HASH
  });
  const expiredState = protectedState({
    offerHash: OTHER_HASH,
    termsHash: THIRD_HASH,
    validUntil: VALID_UNTIL,
    stateHash: THIRD_HASH
  });
  const project = (state, proof) => ({
    protectedStateHash: state.manifestHash,
    offerHash: state.manifest.offer.offerHash,
    termsHash: state.manifest.offer.termsHash,
    status: "offered",
    schemaVersion: "credit_offer.v2",
    validUntil: state.manifest.offer.validUntil,
    acceptedAt: null,
    acceptanceRefHash: null,
    closedAt: null,
    aggregateVersion: proof.aggregateVersion,
    projectionEntityHash: proof.entityHash,
    projectionSourceEventId: proof.sourceEventId,
    projectionEvidenceHash: proof.sourceEvidenceHash,
    sourceFinality: "finalized"
  });
  return {
    observedAt,
    databaseStartedAt: START,
    current: {
      state: currentState,
      projectionProof: currentProof,
      projection: project(currentState, currentProof)
    },
    expired: {
      state: expiredState,
      projectionProof: expiredProof,
      projection: project(expiredState, expiredProof)
    }
  };
}

function fixtureInput({
  validUntil = VALID_UNTIL,
  mutateAfter,
  mutatePreparation,
  mutateAuthor
} = {}) {
  const binding = createM1BExpiredOfferCriticalBinding(criticalReceipt(), {
    sha256: DIGEST
  });
  const preparationCommands = [
    "pilotCreateConsent",
    "pilotRequestCredit",
    "pilotEvaluateCreditApplication",
    "pilotCreateCreditPassportArtifact"
  ].map(commandProof);
  const authorRequestId = "request-expired-offer-2";
  const authorCorrelationId = "correlation-expired-offer-2";
  const authorAuditInput = {
    requestId: authorRequestId,
    correlationId: authorCorrelationId,
    resourceType: "credit_passport_artifact",
    resourceId: PASSPORT_C,
    occurredAt: CREATED_AT
  };
  const authorProof = {
    operationId: "pilotAuthorCapitalPartnerOffer",
    requestId: authorRequestId,
    correlationId: authorCorrelationId,
    resourceType: "credit_passport_artifact",
    resourceId: PASSPORT_C,
    authorizationAuditEventId: "authorization_author_1",
    authorizationDecisionId: "authorization_decision_author_1",
    authorizationDecision: "allow",
    authorizationAudits: [
      authorizationAudit(
        "pilotAuthorCapitalPartnerOffer",
        "author_1",
        CAPITAL_PARTNER,
        authorAuditInput
      ),
      authorizationAudit(
        "pilotAuthorCapitalPartnerOffer",
        "author_2",
        CAPITAL_PARTNER,
        authorAuditInput
      )
    ],
    commandHash: HASH,
    responseHash: inspectM1BResponseOnlyOperation({
      operationId: "pilotAuthorCapitalPartnerOffer",
      responseSchemaVersion: "tenant_capital_partner_offer_authored.v1",
      response: authorResponse({ validUntil })
    }).rawResponseHash,
    responseSchemaVersion: "tenant_capital_partner_offer_authored.v1",
    occurredAt: CREATED_AT,
    completedAt: "2026-08-15T00:00:35.500Z",
    eventManifest: [
      event("pilotAuthorCapitalPartnerOffer", 0, {
        eventId: "event_replace_preliminary_c",
        eventType: "credit_offer_status_changed",
        aggregateId: PRELIMINARY_C,
        aggregateVersion: 2,
        causationId: authorRequestId,
        correlationId: authorCorrelationId,
        payloadProjection: {
          creditOfferId: PRELIMINARY_C,
          previousStatus: "offered",
          nextStatus: "declined",
          replacementOfferId: OFFER_C,
          reasonCode: "capital_partner_offer_authored",
          sandboxOnly: true,
          productionFundsApproved: false
        }
      }),
      event("pilotAuthorCapitalPartnerOffer", 1, {
        eventId: "event_create_offer_c",
        eventType: "credit_offer_created",
        aggregateId: OFFER_C,
        aggregateVersion: 1,
        causationId: authorRequestId,
        correlationId: authorCorrelationId,
        payloadProjection: {
          creditOfferId: OFFER_C,
          creditOfferHash: OTHER_HASH,
          termsHash: THIRD_HASH,
          creditIntentId: INTENT_C,
          riskDecisionId: DECISION_C,
          status: "offered",
          validUntil,
          sandboxOnly: true,
          productionFundsApproved: false
        }
      })
    ]
  };
  const author = mutateAuthor
    ? mutateAuthor(structuredClone(authorProof))
    : authorProof;
  const inboxRequestId = "request-expired-offer-1";
  const inboxCorrelationId = "correlation-expired-offer-1";
  const inboxOccurredAt = "2026-08-15T00:00:30.000Z";
  const inboxAuditInput = {
    requestId: inboxRequestId,
    correlationId: inboxCorrelationId,
    occurredAt: "2026-08-15T00:00:29.000Z"
  };
  const inboxProof = {
    operationId: "pilotReadCapitalPartnerPassportInbox",
    requestId: inboxRequestId,
    correlationId: inboxCorrelationId,
    responseSchemaVersion: "tenant_capital_partner_passport_inbox_view.v1",
    responseHash: HASH,
    occurredAt: inboxOccurredAt,
    authorizationAudits: [
      authorizationAudit(
        "pilotReadCapitalPartnerPassportInbox",
        "inbox_1",
        CAPITAL_PARTNER,
        inboxAuditInput
      ),
      authorizationAudit(
        "pilotReadCapitalPartnerPassportInbox",
        "inbox_2",
        CAPITAL_PARTNER,
        { ...inboxAuditInput, occurredAt: inboxOccurredAt }
      )
    ]
  };
  let snapshotCount = 0;
  const dependencies = {
    authorizationResourceLocator: async (_client, input) => ({
      resourceType: input.operationId === "pilotAuthorCapitalPartnerOffer"
        ? "credit_passport_artifact"
        : "workspace",
      resourceId: input.operationId === "pilotAuthorCapitalPartnerOffer"
        ? PASSPORT_C
        : "workspace_local"
    }),
    queryProof: async () => inboxProof,
    commandProof: async () => author,
    preparationConsentId: async () => CONSENT_C,
    preparationLineage: async () => {
      const preparation = {
      row: {
        consentHash: HASH,
        intentHash: OTHER_HASH,
        decisionHash: THIRD_HASH,
        preliminaryOfferHash: HASH,
        preliminaryTermsHash: OTHER_HASH,
        passportArtifactHash: HASH,
        passportArtifactVersion: 1,
        passportControllerRefHash: OTHER_HASH,
        passportVerifierRefHash: THIRD_HASH,
        authoredOfferHash: OTHER_HASH,
        authoredTermsHash: THIRD_HASH
      },
      commandReceipts: preparationCommands,
      queryObservations: [
        queryObservation("pilotReadHumanSelf", 0),
        queryObservation("pilotReadCreditApplication", 1)
      ],
      projections: [
        projection("consent_record", CONSENT_C),
        projection("credit_intent", INTENT_C),
        projection("risk_decision", DECISION_C),
        projection("credit_offer", PRELIMINARY_C),
        projection("credit_passport_artifact", PASSPORT_C)
      ],
      humanResources: resources(HUMAN, [
        ["subject", SUBJECT],
        ["consent", CONSENT_C],
        ["credit_intent", INTENT_C],
        ["credit_passport_artifact", PASSPORT_C]
      ])
      };
      return mutatePreparation
        ? mutatePreparation(structuredClone(preparation))
        : preparation;
    },
    offerPairSnapshot: async () => {
      const snapshot = pairSnapshot(
        binding,
        snapshotCount++ === 0 ? BASELINE_AT : FINAL_AT
      );
      return snapshotCount === 2 && mutateAfter
        ? mutateAfter(structuredClone(snapshot))
        : snapshot;
    },
    waitForExpiry: async () => ({
      waitStartedAt: BASELINE_AT,
      expiredObservedAt: EXPIRED_AT,
      databaseStartedAt: START,
      waitSource: "postgresql_clock_timestamp",
      maximumWaitMs: 125_000
    }),
    actorResourceScope: async (_client, input) =>
      resources(input.actorId, input.resources),
    safeAuthentication: async (_client, input) => ({
      method: "siwe",
      acr: "urn:ipo.one:acr:wallet",
      amr: ["wallet", "siwe", "eip191_eoa_v1"],
      actorRefHash: actorHash(input.actorId),
      clientRefHash: HASH,
      coveredAuditEventIds: input.auditEventIds,
      auditEventCount: input.auditEventIds.length,
      coveredRequestIds: [`request-auth-${input.actorId}`],
      requestCount: 1,
      earliestAuthTime: START,
      latestAuthTime: START,
      activeCredentialBinding: true,
      activeMembershipBinding: true,
      credentialBindingCount: 1,
      invitationBoundCredentialRegistrationCount: 1,
      sessionMaterialIncluded: false,
      rawSignatureIncluded: false,
      walletAddressIncluded: false
    })
  };
  return {
    client: { query: async () => assert.fail("fixture used a production reader") },
    tenantId: TENANT,
    borrowerActorId: HUMAN,
    capitalPartnerActorId: CAPITAL_PARTNER,
    candidateReleaseId: SHA,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: START,
    capture: capture({ validUntil }),
    capitalPartnerCriticalBinding: binding,
    dependencies
  };
}

test("expired-Offer setup exposes the exact bounded Human and CP operator contract", () => {
  assert.deepEqual(
    M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE.map((entry) => entry[1]),
    [
      "pilotReadCapitalPartnerPassportInbox",
      "pilotAuthorCapitalPartnerOffer"
    ]
  );
  assert.deepEqual(M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION.operations, [
    "pilotCreateConsent",
    "pilotReadHumanSelf",
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication",
    "pilotCreateCreditPassportArtifact"
  ]);
  assert.equal(M1_B_EXPIRED_OFFER_SETUP_LIMITS.minimumValidityMs, 90_000);
  assert.equal(M1_B_EXPIRED_OFFER_SETUP_LIMITS.maximumValidityMs, 120_000);
});

test("critical binding closes over exact A/B lineages without embedding the receipt", () => {
  const binding = createM1BExpiredOfferCriticalBinding(criticalReceipt(), {
    sha256: DIGEST
  });
  assert.equal(binding.schemaVersion, "m1_b_expired_offer_critical_binding.v1");
  assert.equal(binding.currentLineage.status, "offered");
  assert.equal(binding.withdrawalLineage.status, "withdrawn");
  assert.equal(binding.subjectId, SUBJECT);
  assert.equal(JSON.stringify(binding).includes("displayName"), false);
});

test("response-only parser timestamps safe SIWE page results and rejects raw signatures", () => {
  const line = JSON.stringify({
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "expired_offer_setup",
    sequence: 1,
    requestId: "request-expired-offer-1",
    correlationId: "correlation-expired-offer-1",
    response: inboxResponse()
  });
  const parsed = parseM1BExpiredOfferSetupResponseLine(line, {
    sequence: 1,
    observedAt: "2026-08-15T00:00:30.000Z"
  });
  assert.equal(parsed.operationId, "pilotReadCapitalPartnerPassportInbox");
  assert.equal(parsed.capturedAt, "2026-08-15T00:00:30.000Z");
  assert.match(parsed.rawResponseHash, /^0x[0-9a-f]{64}$/);
  const projected = parseM1BExpiredOfferSetupResponseLine(JSON.stringify({
    ...JSON.parse(line),
    response: { ...inboxResponse(), email: "alice@example.com" }
  }), {
    sequence: 1,
    observedAt: "2026-08-15T00:00:30.000Z"
  });
  assert.equal(Object.hasOwn(projected.response, "email"), false);
  assert.equal(JSON.stringify(projected).includes("alice@example.com"), false);
  assert.throws(
    () => parseM1BExpiredOfferSetupResponseLine(JSON.stringify({
      ...JSON.parse(line),
      response: { ...inboxResponse(), rawSignature: `0x${"a".repeat(130)}` }
    }), { sequence: 1 }),
    (error) => error?.code === "acceptance_capture_sensitive_key"
  );
});

test("response-only capture strips the real Offer author displayName without losing raw reconciliation", () => {
  const rawAuthorResponse = {
    ...authorResponse(),
    capitalPartner: {
      capitalPartnerId: PARTNER_ID,
      displayName: "Synthetic Partner Private Label"
    }
  };
  const parsedInbox = parseM1BExpiredOfferSetupResponseLine(JSON.stringify({
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "expired_offer_setup",
    sequence: 1,
    requestId: "request-expired-offer-real-inbox",
    correlationId: "correlation-expired-offer-real-inbox",
    response: inboxResponse()
  }), {
    sequence: 1,
    observedAt: "2026-08-15T00:00:30.000Z"
  });
  const parsedAuthor = parseM1BExpiredOfferSetupResponseLine(JSON.stringify({
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "expired_offer_setup",
    sequence: 2,
    requestId: "request-expired-offer-real-author",
    correlationId: "correlation-expired-offer-real-author",
    response: rawAuthorResponse
  }), {
    sequence: 2,
    observedAt: "2026-08-15T00:00:36.000Z"
  });
  const projectedAuthorHash = inspectM1BResponseOnlyOperation({
    operationId: parsedAuthor.operationId,
    responseSchemaVersion: parsedAuthor.responseSchemaVersion,
    response: parsedAuthor.response
  }).rawResponseHash;

  assert.deepEqual(parsedAuthor.response.capitalPartner, {
    capitalPartnerId: PARTNER_ID
  });
  assert.equal(Object.hasOwn(parsedAuthor.response.capitalPartner, "displayName"), false);
  assert.equal(JSON.stringify(parsedAuthor).includes("Synthetic Partner Private Label"), false);
  assert.notEqual(parsedAuthor.rawResponseHash, projectedAuthorHash);
  assert.doesNotThrow(() => createM1BExpiredOfferSetupCapture({
    candidateReleaseId: SHA,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: START,
    preparationObservedAt: "2026-08-15T00:00:20.000Z",
    responses: [parsedInbox, parsedAuthor]
  }));
});

test("fixture seam produces one expired physical Offer C with A unchanged and zero effects", async () => {
  const receipt = await produceM1BExpiredOfferSetupFixtureReceiptForTest(
    fixtureInput()
  );
  assert.equal(receipt.schemaVersion, "m1_b_expired_offer_setup_receipt.v1");
  assert.equal(receipt.artifactId, "expired_offer_setup");
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.candidateReleaseId, SHA);
  assert.equal(receipt.sourceTreeHash, TREE);
  assert.equal(receipt.runtimeImageId, IMAGE);
  assert.equal(receipt.databaseStartedAt, START);
  assert.equal(receipt.lineage.lineageId, "C");
  assert.equal(receipt.lineage.subjectId, SUBJECT);
  assert.equal(receipt.lineage.distinctFromCriticalAAndB, true);
  assert.equal(receipt.offer.physicalStatus, "offered");
  assert.equal(receipt.expiration.validityMs, 105_000);
  assert.equal(receipt.expiration.physicalStatusAfter, "offered");
  assert.equal(receipt.currentOfferInvariant.unchanged, true);
  assert.equal(receipt.zeroDownstreamEffects.totalRowCount, 0);
  assert.equal(receipt.setupManifests.commands.entryCount, 5);
  assert.equal(receipt.setupManifests.queries.entryCount, 3);
  assert.equal(receipt.setupManifests.authorizationAudits.entryCount, 16);
  assert.equal(receipt.durability.fixtureUsed, true);
  assert.equal(receipt.safety.acceptanceCreated, false);
  assert.equal(receipt.safety.obligationCreated, false);
  assert.equal(receipt.safety.executionCreated, false);
  assert.equal(receipt.safety.repaymentCreated, false);
  assert.equal(receipt.safety.ledgerEffectCreated, false);
  assert.equal(receipt.redaction.containsSessionMaterial, false);
  assert.equal(receipt.redaction.containsRawSignature, false);
  assert.equal(
    receipt.captureBinding.inboxCapturedAt,
    "2026-08-15T00:00:30.000Z"
  );
  assert.equal(
    receipt.captureBinding.authorCapturedAt,
    "2026-08-15T00:00:36.000Z"
  );
  assert.equal(
    receipt.captureBinding.captureHash,
    hashM1BAcceptanceManifest(fixtureInput().capture)
  );
});

test("pure receipt validator recomputes manifests and rejects self-adjusted semantic tampering", async () => {
  const receipt = await produceM1BExpiredOfferSetupFixtureReceiptForTest(
    fixtureInput()
  );
  const options = {
    candidateReleaseId: SHA,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: START,
    capitalPartnerCriticalArtifact: {
      id: "capital_partner_critical",
      sha256: DIGEST
    },
    expectedFixtureUsed: true
  };
  assert.equal(validateM1BExpiredOfferSetupReceipt(receipt, options), receipt);

  const commandTamper = structuredClone(receipt);
  commandTamper.setupManifests.commands.entries[0].operationId =
    "pilotCreateHumanSubject";
  commandTamper.setupManifests.commands.manifestHash =
    hashM1BAcceptanceManifest(commandTamper.setupManifests.commands.entries);
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(commandTamper, options),
    (error) => error?.code === "expired_offer_receipt_manifest_invalid"
  );

  const expiryTamper = structuredClone(receipt);
  expiryTamper.expiration.physicalStatusAfter = "expired";
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(expiryTamper, options),
    (error) => error?.code === "expired_offer_receipt_expiration_invalid"
  );

  const eventIdTamper = structuredClone(receipt);
  eventIdTamper.offer.replacementEventId =
    eventIdTamper.setupManifests.events.entries[0].eventId;
  eventIdTamper.offer.creationEventId =
    eventIdTamper.setupManifests.events.entries[1].eventId;
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(eventIdTamper, options),
    (error) => error?.code === "expired_offer_receipt_event_invalid"
  );

  const validityTamper = structuredClone(receipt);
  validityTamper.expiration.validityMs += 1_000;
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(validityTamper, options),
    (error) => error?.code === "expired_offer_receipt_event_invalid"
  );

  const eventPayloadTamper = structuredClone(receipt);
  const creationEvent = eventPayloadTamper.setupManifests.events.entries
    .find(({ eventId }) => eventId === eventPayloadTamper.offer.creationEventId);
  creationEvent.payloadProjection.status = "declined";
  creationEvent.payloadHash = hashId(
    "event_payload",
    creationEvent.payloadProjection
  );
  creationEvent.evidencePayloadHash = creationEvent.payloadHash;
  eventPayloadTamper.setupManifests.events.manifestHash =
    hashM1BAcceptanceManifest(
      eventPayloadTamper.setupManifests.events.entries
    );
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(eventPayloadTamper, options),
    (error) => error?.code === "expired_offer_receipt_event_invalid"
  );

  const effectTamper = structuredClone(receipt);
  effectTamper.zeroDownstreamEffects.acceptance.rowCount = 1;
  effectTamper.zeroDownstreamEffects.totalRowCount = 1;
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(effectTamper, options),
    (error) => error?.code === "expired_offer_receipt_effects_invalid"
  );

  const chronologyTamper = structuredClone(receipt);
  const reorderedAt = "2026-08-15T00:00:29.500Z";
  chronologyTamper.setupManifests.commands.entries
    .find(({ operationId }) => operationId === "pilotAuthorCapitalPartnerOffer")
    .occurredAt = reorderedAt;
  chronologyTamper.setupManifests.authorizationAudits.entries
    .filter(({ operationId }) => operationId === "pilotAuthorCapitalPartnerOffer")
    .forEach((entry) => {
      entry.occurredAt = reorderedAt;
    });
  chronologyTamper.setupManifests.commands.manifestHash =
    hashM1BAcceptanceManifest(
      chronologyTamper.setupManifests.commands.entries
    );
  chronologyTamper.setupManifests.authorizationAudits.manifestHash =
    hashM1BAcceptanceManifest(
      chronologyTamper.setupManifests.authorizationAudits.entries
    );
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(chronologyTamper, options),
    (error) => error?.code === "expired_offer_receipt_chronology_invalid"
  );

  const auditTamper = structuredClone(receipt);
  auditTamper.authentication.human.coveredAuditEventIds.pop();
  auditTamper.authentication.human.auditEventCount -= 1;
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(auditTamper, options),
    (error) => error?.code === "expired_offer_receipt_authentication_invalid"
  );

  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(receipt, {
      ...options,
      capitalPartnerCriticalArtifact: {
        id: "capital_partner_critical",
        sha256: "e".repeat(64)
      }
    }),
    (error) => error?.code === "expired_offer_receipt_critical_binding_invalid"
  );
  assert.throws(
    () => validateM1BExpiredOfferSetupReceipt(receipt, {
      ...options,
      expectedFixtureUsed: false
    }),
    (error) => error?.code === "expired_offer_receipt_safety_invalid"
  );
});

test("setup rejects Offer C validity outside the exact 90-120 second DB window", async () => {
  await assert.rejects(
    produceM1BExpiredOfferSetupFixtureReceiptForTest(fixtureInput({
      validUntil: "2026-08-15T00:01:34.999Z"
    })),
    (error) => error?.code === "expired_offer_validity_window_invalid"
  );
});

test("setup rejects DB Passport or authored Offer linkage drift from the captured response", async () => {
  await assert.rejects(
    produceM1BExpiredOfferSetupFixtureReceiptForTest(fixtureInput({
      mutatePreparation(preparation) {
        preparation.row.passportArtifactHash = THIRD_HASH;
        return preparation;
      }
    })),
    (error) => error?.code === "expired_offer_lineage_invalid"
  );
  await assert.rejects(
    produceM1BExpiredOfferSetupFixtureReceiptForTest(fixtureInput({
      mutatePreparation(preparation) {
        preparation.row.authoredOfferHash = HASH;
        return preparation;
      }
    })),
    (error) => error?.code === "expired_offer_lineage_invalid"
  );
});

test("setup rejects a durable author proof reordered before the captured inbox", async () => {
  await assert.rejects(
    produceM1BExpiredOfferSetupFixtureReceiptForTest(fixtureInput({
      mutateAuthor(author) {
        author.occurredAt = "2026-08-15T00:00:29.500Z";
        author.authorizationAudits.forEach((audit) => {
          audit.occurredAt = author.occurredAt;
        });
        return author;
      }
    })),
    (error) => error?.code === "expired_offer_lineage_chronology_invalid"
  );
});

test("setup rejects any current Offer A mutation during the expiry wait", async () => {
  await assert.rejects(
    produceM1BExpiredOfferSetupFixtureReceiptForTest(fixtureInput({
      mutateAfter(snapshot) {
        snapshot.current.state.manifestHash = HASH;
        return snapshot;
      }
    })),
    (error) => error?.code === "expired_offer_state_changed"
  );
});

test("setup rejects downstream effects and production dependency injection", async () => {
  await assert.rejects(
    produceM1BExpiredOfferSetupFixtureReceiptForTest(fixtureInput({
      mutateAfter(snapshot) {
        snapshot.expired.state.manifest.related.obligations.rowCount = 1;
        return snapshot;
      }
    })),
    (error) => error?.code === "expired_offer_effects_invalid"
  );
  await assert.rejects(
    produceM1BExpiredOfferSetupReceipt(fixtureInput()),
    (error) => error?.code === "expired_offer_dependency_override_forbidden"
  );
});

test("capture rejects duplicate request/correlation identities and runtime drift", () => {
  const first = capturedEntry(1, inboxResponse());
  const second = capturedEntry(2, authorResponse());
  assert.throws(
    () => createM1BExpiredOfferSetupCapture({
      candidateReleaseId: SHA,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      databaseStartedAt: START,
      preparationObservedAt: "2026-08-15T00:00:20.000Z",
      responses: [{ ...first }, {
        ...second,
        requestId: first.requestId,
        rawResponseHash: second.rawResponseHash
      }]
    }),
    (error) => error?.code === "expired_offer_capture_invalid"
  );
});
