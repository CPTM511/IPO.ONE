import { hashId } from "../../../packages/domain/src/index.js";
import {
  assertM1BResponseOnlyCapture,
  hashM1BAcceptanceManifest,
  readM1BActorResourceScope,
  readM1BAuthorizationResourceLocator,
  readM1BCommandLocator,
  readM1BCommandProof,
  readM1BDurablePreparationCommandProof,
  readM1BDurableEvent,
  readM1BHumanEconomicReadBack,
  readM1BProjectionProof,
  readM1BProjectionSourceEventId,
  readM1BQueryAuthorizationObservation,
  readM1BQueryProof,
  readM1BRetainedCommandProof,
  readM1BSafeSiweAuthentication
} from "./m1-b-human-capital-partner-acceptance.js";

const SHA = /^[0-9a-f]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const NORMAL_RESPONSE_CLOCK_DOMAIN = "lima_exact_pilot_vm_system_clock";
const HUMAN_ORIGIN_COMMANDS = Object.freeze([
  ["pilotCreateHumanSubject", "subject", "tenant_human_subject_created.v1"],
  ["pilotCreateConsent", "consent", "tenant_consent_created.v1"],
  ["pilotRequestCredit", "credit_intent", "tenant_credit_intent_created.v1"],
  ["pilotEvaluateCreditApplication", "risk_decision", "tenant_credit_application_evaluated.v2"]
]);
const HUMAN_OPERATIONS = Object.freeze([
  ["pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2", false],
  ["pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1", true],
  ["pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1", true],
  ["pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1", true],
  ["pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1", false]
]);
const CAPITAL_PARTNER_PREPARATION_COMMANDS = Object.freeze([
  ["pilotCreateConsent", "consent", "tenant_consent_created.v1"],
  ["pilotRequestCredit", "credit_intent", "tenant_credit_intent_created.v1"],
  ["pilotEvaluateCreditApplication", "risk_decision", "tenant_credit_application_evaluated.v2"],
  ["pilotCreateCreditPassportArtifact", "credit_passport_artifact", "tenant_credit_passport_artifact_created.v1"]
]);

export class M1BHumanCapitalPartnerProducerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BHumanCapitalPartnerProducerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BHumanCapitalPartnerProducerError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  assert(
    Number.isFinite(date.getTime()),
    "human_capital_partner_time_invalid",
    "Human/Capital Partner acceptance time is invalid"
  );
  return date.toISOString();
}

function uniqueBy(values, key) {
  return [...new Map(values.map((value) => [value[key], value])).values()];
}

function normalResponseChronology(entries, proofs, databaseStartedAt) {
  assert(
    Array.isArray(entries) && Array.isArray(proofs) &&
      entries.length === proofs.length && entries.length >= 1,
    "normal_response_chronology_invalid",
    "Normal-response entries and PostgreSQL proofs do not align"
  );
  const databaseStart = iso(databaseStartedAt);
  return Object.freeze(entries.map((entry, index) => {
    const proof = proofs[index];
    const armIssuedAt = iso(entry?.armIssuedAt);
    const capturedAt = iso(entry?.capturedAt);
    const priorCapturedAt = index === 0
      ? databaseStart
      : iso(entries[index - 1]?.capturedAt);
    const authorizationAudits = proof?.authorizationAudits;
    const proofTimes = [
      proof?.occurredAt,
      ...((Array.isArray(authorizationAudits) ? authorizationAudits : [])
        .map(({ occurredAt }) => occurredAt)),
      ...(proof?.completedAt ? [proof.completedAt] : []),
      ...(proof?.capturedAt ? [proof.capturedAt] : []),
      ...((Array.isArray(proof?.eventManifest) ? proof.eventManifest : [])
        .map(({ occurredAt }) => occurredAt))
    ];
    assert(
      entry?.armClockDomain === NORMAL_RESPONSE_CLOCK_DOMAIN &&
        proof?.operationId === entry.operationId &&
        proof?.requestId === entry.requestId &&
        proof?.correlationId === entry.correlationId &&
        authorizationAudits?.length === 2 &&
        Date.parse(armIssuedAt) >= Date.parse(databaseStart) &&
        Date.parse(armIssuedAt) >= Date.parse(priorCapturedAt) &&
        Date.parse(capturedAt) >= Date.parse(armIssuedAt) &&
        (proof?.completedAt
          ? proof?.capturedAt === capturedAt
          : proof?.occurredAt === capturedAt) &&
        proofTimes.length >= 3 && proofTimes.every((value) => (
          Number.isFinite(Date.parse(value ?? "")) &&
          Date.parse(value) >= Date.parse(armIssuedAt) &&
          Date.parse(value) <= Date.parse(capturedAt)
        )),
      "normal_response_chronology_invalid",
      `Normal-response PostgreSQL proof is outside its armed capture for ${entry?.operationId}`
    );
    return Object.freeze({
      sequence: entry.sequence,
      actorRole: entry.actorRole,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      armIssuedAt,
      armClockDomain: NORMAL_RESPONSE_CLOCK_DOMAIN,
      capturedAt
    });
  }));
}

function riskFeatureSnapshotCore(snapshot) {
  const {
    riskFeatureSnapshotId: _riskFeatureSnapshotId,
    featureSnapshotHash: _featureSnapshotHash,
    schemaVersion: _schemaVersion,
    ...core
  } = snapshot;
  return core;
}

async function humanOrigin(client, {
  tenantId,
  actorId,
  subjectId,
  consentId,
  creditIntentId,
  riskDecisionId,
  creditOfferId
}) {
  const result = await client.query(
    `SELECT s.id AS subject_id, s.subject_type::text, s.status AS subject_status,
            s.primary_principal_id, s.prototype_only, s.schema_version AS subject_schema_version,
            c.id AS consent_id, c.consent_hash, c.subject_id AS consent_subject_id,
            c.principal_id AS consent_principal_id, c.status AS consent_status,
            c.sandbox_only AS consent_sandbox_only,
            c.production_authority AS consent_production_authority,
            i.id AS credit_intent_id, i.intent_hash, i.subject_id AS intent_subject_id,
            i.principal_id AS intent_principal_id, i.authority_type,
            i.authority_ref, i.status AS intent_status,
            i.sandbox_only AS intent_sandbox_only,
            i.production_funds_requested,
            d.id AS risk_decision_id, d.decision_hash,
            d.risk_feature_snapshot_id, d.feature_snapshot_hash,
            d.risk_feature_snapshot, d.decision_passport_id,
            d.decision_passport_hash, d.decision_passport,
            d.consent_id AS decision_consent_id,
            d.sandbox_only AS decision_sandbox_only,
            d.production_authority AS decision_production_authority,
            o.id AS credit_offer_id, o.offer_hash, o.terms_hash,
            o.schema_version AS offer_schema_version
       FROM subjects s
       JOIN consent_records c ON c.tenant_id = s.tenant_id AND c.id = $3
       JOIN credit_intents i ON i.tenant_id = s.tenant_id AND i.id = $4
       JOIN risk_decisions d ON d.tenant_id = s.tenant_id AND d.id = $5
       JOIN credit_offers o ON o.tenant_id = s.tenant_id AND o.id = $6
      WHERE s.tenant_id = $1 AND s.id = $2`,
    [tenantId, subjectId, consentId, creditIntentId, riskDecisionId, creditOfferId]
  );
  assert(
    result.rowCount === 1,
    "human_origin_missing",
    "The retained Human origin lineage is missing"
  );
  const row = result.rows[0];
  const snapshot = row.risk_feature_snapshot;
  const passport = row.decision_passport;
  assert(
    row.subject_id === subjectId &&
      row.subject_type === "human" &&
      row.prototype_only === true &&
      row.consent_subject_id === subjectId &&
      row.consent_principal_id === row.primary_principal_id &&
      row.consent_status === "active" &&
      row.consent_sandbox_only === true &&
      row.consent_production_authority === false &&
      row.intent_subject_id === subjectId &&
      row.intent_principal_id === row.primary_principal_id &&
      row.authority_type === "consent" &&
      row.authority_ref === consentId &&
      row.intent_status === "decided" &&
      row.intent_sandbox_only === true &&
      row.production_funds_requested === false &&
      row.decision_consent_id === consentId &&
      row.decision_sandbox_only === true &&
      row.decision_production_authority === false &&
      HASH.test(row.decision_hash ?? "") &&
      HASH.test(row.feature_snapshot_hash ?? "") &&
      snapshot?.schemaVersion === "risk_feature_snapshot.v1" &&
      snapshot.riskFeatureSnapshotId === row.risk_feature_snapshot_id &&
      snapshot.featureSnapshotHash === row.feature_snapshot_hash &&
      hashId("risk_feature_snapshot", riskFeatureSnapshotCore(snapshot)) ===
        row.feature_snapshot_hash &&
      passport?.schemaVersion === "risk_decision_passport.v1" &&
      passport.riskDecisionPassportId === row.decision_passport_id &&
      passport.decisionPassportHash === row.decision_passport_hash &&
      passport.riskDecisionId === riskDecisionId &&
      passport.decisionHash === row.decision_hash &&
      passport.featureSnapshotHash === row.feature_snapshot_hash &&
      HASH.test(row.offer_hash ?? "") &&
      HASH.test(row.terms_hash ?? "") &&
      new Set(["credit_offer.v1", "credit_offer.v2"]).has(row.offer_schema_version),
    "human_origin_integrity_invalid",
    "The retained Human origin lineage is inconsistent"
  );
  const identitySource = snapshot.sourceEvidence?.find(({ role }) =>
    role === "human_identity_reference"
  );
  assert(
    identitySource?.entityType === "human_identity_reference" &&
      HASH.test(identitySource.entityIdHash ?? "") &&
      Number.isSafeInteger(identitySource.aggregateVersion) &&
      identitySource.aggregateVersion >= 1 &&
      HASH.test(identitySource.entityHash ?? "") &&
      HASH.test(identitySource.evidenceHash ?? "") &&
      identitySource.sourceFinality === "finalized",
    "human_identity_source_invalid",
    "The Decision does not bind one usable Human identity-reference source"
  );
  const identity = await client.query(
    `SELECT id, identity_reference_hash, reference_evidence_hash,
            subject_id, principal_id, consent_id, consent_hash,
            status, synthetic_only, production_verified, schema_version
       FROM human_identity_references
      WHERE tenant_id = $1 AND subject_id = $2 AND principal_id = $3
        AND consent_id = $4 AND status = 'active'`,
    [tenantId, subjectId, row.primary_principal_id, consentId]
  );
  const matchingIdentityRows = identity.rows.filter((candidate) => (
    hashId("risk_source_entity", {
      entityType: "human_identity_reference",
      entityId: candidate.id
    }) === identitySource.entityIdHash
  ));
  const identityRow = matchingIdentityRows[0];
  assert(
    matchingIdentityRows.length === 1 &&
      identityRow.subject_id === subjectId &&
      identityRow.principal_id === row.primary_principal_id &&
      identityRow.consent_id === consentId &&
      identityRow.consent_hash === row.consent_hash &&
      identityRow.identity_reference_hash === identitySource.entityHash &&
      identityRow.reference_evidence_hash === identitySource.evidenceHash &&
      identityRow.status === "active" &&
      identityRow.synthetic_only === true &&
      identityRow.production_verified === false &&
      identityRow.schema_version === "human_identity_reference.v1",
    "human_identity_source_invalid",
    "The Human identity-reference table does not match Decision source Evidence"
  );
  const identityProjection = await readM1BProjectionProof(client, {
    tenantId,
    entityType: "human_identity_reference",
    entityId: identityRow.id
  });
  assert(
    identityProjection.entityHash === identityRow.identity_reference_hash &&
      identityProjection.aggregateVersion === identitySource.aggregateVersion &&
      identityProjection.sourceEvidenceHash === identitySource.evidenceHash,
    "human_identity_source_invalid",
    "The Human identity-reference projection does not match Decision source Evidence"
  );
  const commandTargets = [
    ["subject", subjectId],
    ["consent", consentId],
    ["credit_intent", creditIntentId],
    ["risk_decision", riskDecisionId]
  ];
  const commandReceipts = [];
  for (const [index, [operationId, aggregateType, responseSchemaVersion]] of
    HUMAN_ORIGIN_COMMANDS.entries()) {
    const [, aggregateId] = commandTargets[index];
    const locator = await readM1BCommandLocator(client, {
      tenantId,
      actorId,
      operationId,
      aggregateType,
      aggregateId
    });
    commandReceipts.push(await readM1BRetainedCommandProof(client, {
      tenantId,
      actorId,
      operationId,
      ...locator,
      responseSchemaVersion
    }));
  }
  return Object.freeze({
    row,
    identityRow,
    identityProjection,
    identitySource,
    commandReceipts: Object.freeze(commandReceipts)
  });
}

function evidenceProjection(item) {
  return {
    eventId: item.eventId,
    evidenceHash: item.evidenceHash,
    eventType: item.eventType,
    aggregateType: item.aggregateType,
    aggregateId: item.aggregateId,
    aggregateVersion: item.aggregateVersion,
    payloadHash: item.payloadHash,
    sourceFinality: item.sourceFinality
  };
}

async function readHumanEvidenceCount(client, { tenantId, obligationId }) {
  const result = await client.query(
    `SELECT count(*)::int AS count
       FROM evidence_envelopes
      WHERE tenant_id = $1 AND obligation_id = $2`,
    [tenantId, obligationId]
  );
  return result.rows[0]?.count;
}

async function assembleM1BHumanCriticalReceipt({
  client,
  tenantId,
  actorId,
  candidateReleaseId,
  databaseStartedAt,
  capture,
  dependencies,
  fixtureUsed
}) {
  assert(
    SHA.test(candidateReleaseId ?? "") &&
      IDENTIFIER.test(tenantId ?? "") &&
      IDENTIFIER.test(actorId ?? "") &&
      Number.isFinite(Date.parse(databaseStartedAt ?? "")),
    "human_producer_input_invalid",
    "Human producer release, tenant, actor, or restart identity is invalid"
  );
  const safeCapture = assertM1BResponseOnlyCapture(capture, { role: "human" });
  const readers = Object.freeze({
    origin: humanOrigin,
    authorizationResourceLocator: readM1BAuthorizationResourceLocator,
    queryProof: readM1BQueryProof,
    commandProof: readM1BCommandProof,
    projectionSourceEventId: readM1BProjectionSourceEventId,
    projectionProof: readM1BProjectionProof,
    economicReadBack: readM1BHumanEconomicReadBack,
    durableEvent: readM1BDurableEvent,
    evidenceCount: readHumanEvidenceCount,
    actorResourceScope: readM1BActorResourceScope,
    preparation: readCapitalPartnerPreparation,
    safeAuthentication: readM1BSafeSiweAuthentication,
    ...dependencies
  });
  assert(
    safeCapture.candidateReleaseId === candidateReleaseId &&
      safeCapture.databaseStartedAt === databaseStartedAt,
    "human_capture_runtime_mismatch",
    "Human capture does not match the exact post-restart candidate"
  );
  const responseByOperation = new Map(
    safeCapture.responses.map((entry) => [entry.operationId, entry])
  );
  const recoveryEntry = responseByOperation.get("pilotReadWorkspaceResume");
  const recoveryReview = recoveryEntry.response.humanOfferReview;
  const acceptedEntry = responseByOperation.get("pilotAcceptCreditOffer");
  const executionEntry = responseByOperation.get("pilotExecuteSandboxObligation");
  const repaymentEntry = responseByOperation.get("pilotPostSandboxRepayment");
  const evidenceEntry = responseByOperation.get("pilotReadOwnObligationEvidence");
  assert(
    recoveryReview?.serverTruth === true &&
      recoveryReview.schemaVersion === "human_offer_review_recovery.v1" &&
      new Set(["credit_offer.v1", "credit_offer.v2"])
        .has(recoveryReview.offerSchemaVersion) &&
      recoveryReview.offer?.status === "offered" &&
      acceptedEntry.response.acceptance?.creditOfferId ===
        recoveryReview.offer.creditOfferId &&
      acceptedEntry.response.acceptance?.creditOfferHash ===
        recoveryReview.offer.creditOfferHash &&
      acceptedEntry.response.acceptance?.termsHash === recoveryReview.offer.termsHash &&
      executionEntry.response.obligation?.obligationId ===
        acceptedEntry.response.obligation?.obligationId &&
      repaymentEntry.response.obligation?.obligationId ===
        acceptedEntry.response.obligation?.obligationId &&
      evidenceEntry.response.obligationId === acceptedEntry.response.obligation?.obligationId &&
      evidenceEntry.response.hasMore === false &&
      evidenceEntry.response.nextCursor == null,
    "human_capture_linkage_invalid",
    "Human response capture does not form one recovered full-payoff lineage"
  );
  const identifiers = Object.freeze({
    subjectId: recoveryReview.subjectId,
    consentId: recoveryReview.consentId,
    creditIntentId: recoveryReview.creditIntentId,
    riskDecisionId: recoveryReview.riskDecisionId,
    creditOfferId: recoveryReview.offer.creditOfferId,
    creditOfferHash: recoveryReview.offer.creditOfferHash,
    termsHash: recoveryReview.offer.termsHash,
    offerSchemaVersion: recoveryReview.offerSchemaVersion,
    offerAggregateVersion: recoveryReview.offerAggregateVersion,
    creditOfferAcceptanceId: acceptedEntry.response.acceptance.creditOfferAcceptanceId,
    obligationId: acceptedEntry.response.obligation.obligationId,
    sandboxExecutionReceiptId:
      executionEntry.response.executionReceipt.sandboxExecutionReceiptId,
    executionReceiptHash: executionEntry.response.executionReceipt.receiptHash,
    principalLedgerTransactionId: executionEntry.response.principalLedgerTransactionId,
    repaymentId: repaymentEntry.response.repayment.repaymentId,
    repaymentHash: repaymentEntry.response.repayment.repaymentHash
  });
  Object.values(identifiers).forEach((value) => assert(
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) ||
      (typeof value === "string" && value.length > 0),
    "human_capture_linkage_invalid",
    "Human response capture contains an invalid linkage value"
  ));
  const origin = await readers.origin(client, {
    tenantId,
    actorId,
    ...identifiers
  });
  assert(
    origin.commandReceipts.every(({ completedAt }) => (
      Date.parse(completedAt) < Date.parse(databaseStartedAt)
    )),
    "human_origin_not_retained",
    "Human origin commands must predate the exact candidate restart"
  );
  const linkedIdentifiers = Object.freeze({
    ...identifiers,
    identityReferenceId: origin.identityRow.id
  });
  const operations = [];
  for (const [index, [operationId, responseSchemaVersion, command]] of
    HUMAN_OPERATIONS.entries()) {
    const entry = safeCapture.responses[index];
    const resource = await readers.authorizationResourceLocator(client, {
      tenantId,
      actorId,
      operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId
    });
    if (command) {
      const proof = await readers.commandProof(client, {
        tenantId,
        actorId,
        operationId,
        requestId: entry.requestId,
        correlationId: entry.correlationId,
        ...resource,
        responseSchemaVersion,
        safeResponse: entry.response,
        capturedRawResponseHash: entry.rawResponseHash,
        capturedAt: entry.capturedAt
      });
      operations.push(Object.freeze({
        sequence: index + 1,
        operationId,
        requestId: entry.requestId,
        correlationId: entry.correlationId,
        responseSchemaVersion,
        authorizationAuditEventId: proof.authorizationAuditEventId,
        authorizationDecisionId: proof.authorizationDecisionId,
        occurredAt: proof.occurredAt,
        queryProof: null,
        commandReceipt: proof
      }));
    } else {
      const proof = await readers.queryProof(client, {
        tenantId,
        actorId,
        operationId,
        requestId: entry.requestId,
        correlationId: entry.correlationId,
        ...resource,
        responseSchemaVersion,
        response: entry.response,
        capturedAt: entry.capturedAt
      });
      operations.push(Object.freeze({
        sequence: index + 1,
        operationId,
        requestId: entry.requestId,
        correlationId: entry.correlationId,
        responseSchemaVersion,
        authorizationAuditEventId: null,
        authorizationDecisionId: null,
        occurredAt: proof.occurredAt,
        queryProof: proof,
        commandReceipt: null
      }));
    }
  }
  const historicOfferEventId = await readers.projectionSourceEventId(client, {
    tenantId,
    entityType: "credit_offer",
    entityId: linkedIdentifiers.creditOfferId,
    aggregateVersion: linkedIdentifiers.offerAggregateVersion
  });
  const recoveryOfferProjection = await readers.projectionProof(client, {
    tenantId,
    entityType: "credit_offer",
    entityId: linkedIdentifiers.creditOfferId,
    sourceEventId: historicOfferEventId
  });
  const [acceptedOfferProjection, obligationProjection] = await Promise.all([
    readers.projectionProof(client, {
      tenantId,
      entityType: "credit_offer",
      entityId: linkedIdentifiers.creditOfferId
    }),
    readers.projectionProof(client, {
      tenantId,
      entityType: "obligation",
      entityId: linkedIdentifiers.obligationId
    })
  ]);
  const economicReadBack = await readers.economicReadBack(client, {
    actorId,
    obligationId: linkedIdentifiers.obligationId,
    subjectId: linkedIdentifiers.subjectId,
    sandboxExecutionReceiptId: linkedIdentifiers.sandboxExecutionReceiptId,
    repaymentId: linkedIdentifiers.repaymentId,
    principalLedgerTransactionId: linkedIdentifiers.principalLedgerTransactionId,
    repaymentLedgerTransactionId: repaymentEntry.response.repayment.ledgerTransactionId
  });
  const evidenceIds = evidenceEntry.response.items.map(({ evidenceId }) => evidenceId);
  assert(
    evidenceIds.length >= 1 &&
      evidenceIds.length <= 50 &&
      new Set(evidenceIds).size === evidenceIds.length,
    "human_evidence_manifest_invalid",
    "Human Evidence response must be one complete bounded page"
  );
  const evidenceEvents = [];
  for (const eventId of evidenceIds) {
    evidenceEvents.push(await readers.durableEvent(client, { tenantId, eventId }));
  }
  const evidenceCount = await readers.evidenceCount(client, {
    tenantId,
    obligationId: linkedIdentifiers.obligationId
  });
  assert(
    evidenceCount === evidenceEvents.length &&
      evidenceEntry.response.items.every((item, index) => {
        const event = evidenceEvents[index];
        return item.evidenceId === event.eventId &&
          item.evidenceHash === event.evidenceHash &&
          item.eventType === event.eventType &&
          item.aggregateType === event.aggregateType &&
          item.aggregateId === event.aggregateId &&
          item.aggregateVersion === event.aggregateVersion &&
          item.payloadHash === event.payloadHash &&
          item.sourceFinality === event.sourceFinality;
      }),
    "human_evidence_manifest_invalid",
    "Human Evidence response does not match the complete durable obligation manifest"
  );
  const identityEvent = await readers.durableEvent(client, {
    tenantId,
    eventId: origin.identityProjection.sourceEventId
  });
  const allEvents = uniqueBy([
    ...origin.commandReceipts.flatMap(({ eventManifest }) => eventManifest),
    identityEvent,
    ...operations.filter(({ commandReceipt }) => commandReceipt)
      .flatMap(({ commandReceipt }) => commandReceipt.eventManifest),
    ...evidenceEvents
  ], "eventId");
  const resources = await readers.actorResourceScope(client, {
    tenantId,
    actorId,
    resources: [
      ["subject", linkedIdentifiers.subjectId],
      ["consent", linkedIdentifiers.consentId],
      ["credit_intent", linkedIdentifiers.creditIntentId],
      ["credit_offer", linkedIdentifiers.creditOfferId],
      ["obligation", linkedIdentifiers.obligationId],
      ["evidence", linkedIdentifiers.obligationId]
    ]
  });
  const auditEventIds = operations.flatMap((operation) =>
    (operation.commandReceipt?.authorizationAudits ??
      operation.queryProof?.authorizationAudits ?? []).map(({ eventId }) => eventId)
  );
  const authentication = await readers.safeAuthentication(client, {
    tenantId,
    actorId,
    auditEventIds,
    databaseStartedAt
  });
  assert(
    authentication.amr[2] === "eip191_eoa_v1",
    "human_eoa_authentication_required",
    "Human acceptance requires the invited EOA SIWE credential"
  );
  const evidenceManifest = evidenceEvents.map(evidenceProjection);
  const evidenceHash = hashM1BAcceptanceManifest(evidenceManifest);
  const responseChronology = normalResponseChronology(
    safeCapture.responses,
    operations.map((operation) =>
      operation.commandReceipt ?? operation.queryProof
    ),
    databaseStartedAt
  );
  const capturedAt = iso(safeCapture.capturedAt);
  return Object.freeze({
    schemaVersion: "m1_b_human_critical_receipt.v1",
    candidateReleaseId,
    sourceRuntime: "local_exact_commit",
    capturedAt,
    databaseStartedAt,
    postRestartVerification: true,
    role: "human",
    status: "passed",
    authentication,
    actorScope: Object.freeze({
      actorRefHash: authentication.actorRefHash,
      invitationOnly: authentication.invitationBoundCredentialRegistrationCount === 1,
      sameTenantOnly: true,
      resources
    }),
    originLineage: Object.freeze({
      provenance: "retained_postgresql_lineage",
      sourceRelation: "preexisting_state_revalidated_by_exact_candidate",
      createdUnderExactCandidate: false,
      postRestartProjectionReadBack: true,
      subjectId: linkedIdentifiers.subjectId,
      consentId: linkedIdentifiers.consentId,
      identityReferenceId: linkedIdentifiers.identityReferenceId,
      creditIntentId: linkedIdentifiers.creditIntentId,
      riskDecisionId: linkedIdentifiers.riskDecisionId,
      creditOfferId: linkedIdentifiers.creditOfferId,
      commandReceipts: origin.commandReceipts,
      identityReferenceProof: Object.freeze({
        identityReferenceId: origin.identityRow.id,
        identityReferenceHash: origin.identityRow.identity_reference_hash,
        referenceEvidenceHash: origin.identityRow.reference_evidence_hash,
        aggregateVersion: origin.identityProjection.aggregateVersion,
        projectionProof: origin.identityProjection,
        decisionBinding: Object.freeze({
          riskDecisionId: linkedIdentifiers.riskDecisionId,
          decisionHash: origin.row.decision_hash,
          riskFeatureSnapshotId: origin.row.risk_feature_snapshot_id,
          featureSnapshotHash: origin.row.feature_snapshot_hash,
          computedFeatureSnapshotHash: hashId(
            "risk_feature_snapshot",
            riskFeatureSnapshotCore(origin.row.risk_feature_snapshot)
          ),
          riskDecisionPassportId: origin.row.decision_passport_id,
          decisionPassportHash: origin.row.decision_passport_hash,
          sourceEvidence: Object.freeze({
            role: origin.identitySource.role,
            entityType: origin.identitySource.entityType,
            entityIdHash: origin.identitySource.entityIdHash,
            aggregateVersion: origin.identitySource.aggregateVersion,
            entityHash: origin.identitySource.entityHash,
            evidenceHash: origin.identitySource.evidenceHash,
            sourceFinality: origin.identitySource.sourceFinality
          })
        })
      })
    }),
    linkage: linkedIdentifiers,
    normalResponseChronology: responseChronology,
    recovery: Object.freeze({
      operationId: "pilotReadWorkspaceResume",
      requestId: recoveryEntry.requestId,
      correlationId: recoveryEntry.correlationId,
      responseSchemaVersion: recoveryEntry.responseSchemaVersion,
      recoverySchemaVersion: recoveryReview.schemaVersion,
      creditOfferId: linkedIdentifiers.creditOfferId,
      creditOfferHash: linkedIdentifiers.creditOfferHash,
      termsHash: linkedIdentifiers.termsHash,
      offerSchemaVersion: linkedIdentifiers.offerSchemaVersion,
      offerAggregateVersion: linkedIdentifiers.offerAggregateVersion,
      serverTruth: true,
      queryProof: operations[0].queryProof,
      offerProjectionProof: recoveryOfferProjection
    }),
    operations: Object.freeze(operations),
    durability: Object.freeze({
      canonicalPersistence: "postgresql",
      rlsReadBack: true,
      authorizationAuditImmutable: true,
      tenantCommandExecutionsImmutable: true,
      fixtureUsed,
      events: Object.freeze(allEvents),
      projectionReadBack: Object.freeze([
        origin.identityProjection,
        recoveryOfferProjection,
        acceptedOfferProjection,
        obligationProjection
      ]),
      evidenceCompleteness: Object.freeze({
        responseSchemaVersion: evidenceEntry.responseSchemaVersion,
        responseProvenance: "runtime_response_capture_db_reconciled",
        pageCount: 1,
        finalHasMore: false,
        orderedEvidenceIds: Object.freeze(evidenceIds),
        orderedEvidenceHash: evidenceHash,
        databaseEvidenceCount: evidenceEvents.length,
        databaseEvidenceManifestHash: evidenceHash
      }),
      economicReadBack
    }),
    safety: Object.freeze({
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      fundsAuthority: false
    }),
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      containsRawSignature: false,
      containsWalletAddress: false,
      containsDatabaseCredentials: false
    })
  });
}

export async function produceM1BHumanCriticalReceipt(input) {
  assert(
    !Object.hasOwn(input ?? {}, "dependencies"),
    "human_dependency_override_forbidden",
    "Production Human Evidence cannot override trusted readers"
  );
  return assembleM1BHumanCriticalReceipt({
    ...input,
    dependencies: {},
    fixtureUsed: false
  });
}

export async function produceM1BHumanFixtureReceiptForTest(input) {
  return assembleM1BHumanCriticalReceipt({
    ...input,
    dependencies: input.dependencies ?? {},
    fixtureUsed: true
  });
}

async function readCapitalPartnerProfile(client, {
  tenantId,
  actorId,
  capitalPartnerId
}) {
  const result = await client.query(
    `SELECT p.id, p.operator_actor_id, p.status, p.invitation_only,
            p.same_tenant_only, p.sandbox_only, p.production_funds_authority,
            p.schema_version, r.status AS resource_status,
            r.version::int AS resource_version,
            b.status AS binding_status, b.version::int AS binding_version,
            b.relationship AS binding_relationship
       FROM capital_partner_profiles p
       JOIN authorization_resources r
         ON r.tenant_id = p.tenant_id
        AND r.resource_type = 'capital_partner_profile' AND r.resource_id = p.id
       JOIN authorization_resource_bindings b
         ON b.tenant_id = r.tenant_id
        AND b.resource_type = r.resource_type AND b.resource_id = r.resource_id
        AND b.actor_id = $3 AND b.relationship = 'owner'
      WHERE p.tenant_id = $1 AND p.id = $2 AND p.operator_actor_id = $3`,
    [tenantId, capitalPartnerId, actorId]
  );
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row.id === capitalPartnerId &&
      row.operator_actor_id === actorId &&
      row.status === "active" &&
      row.invitation_only === true &&
      row.same_tenant_only === true &&
      row.sandbox_only === true &&
      row.production_funds_authority === false &&
      row.schema_version === "capital_partner_profile.v1" &&
      row.resource_status === "active" &&
      Number.isSafeInteger(row.resource_version) && row.resource_version >= 1 &&
      row.binding_status === "active" &&
      Number.isSafeInteger(row.binding_version) && row.binding_version >= 1 &&
      row.binding_relationship === "owner",
    "capital_partner_profile_invalid",
    "Capital Partner profile is not the exact active owner-bound sandbox profile"
  );
  return row;
}

async function readCapitalPartnerPassport(client, {
  tenantId,
  actorId,
  artifactId,
  inboxQueryProof
}) {
  const result = await client.query(
    `SELECT a.id, a.artifact_hash, a.version::int AS artifact_version,
            d.credit_intent_id, a.purpose, a.status,
            a.verifier_actor_ref_hash,
            jsonb_array_length(a.selected_claims)::int AS claim_count,
            a.issued_at, a.expires_at,
            a.online_verification_required, a.same_tenant_only,
            a.point_in_time, a.non_authorizing, a.sandbox_only,
            a.production_authority, a.pii_included,
            a.raw_transaction_data_included, a.score_authoritative,
            a.schema_version, r.status AS resource_status,
            r.version::int AS resource_version,
            b.status AS binding_status, b.version::int AS binding_version,
            b.relationship AS binding_relationship
       FROM credit_passport_artifacts a
       JOIN risk_decisions d
         ON d.tenant_id = a.tenant_id AND d.id = a.source_risk_decision_id
       JOIN authorization_resources r
         ON r.tenant_id = a.tenant_id
        AND r.resource_type = 'credit_passport_artifact' AND r.resource_id = a.id
       JOIN authorization_resource_bindings b
         ON b.tenant_id = r.tenant_id
        AND b.resource_type = r.resource_type AND b.resource_id = r.resource_id
        AND b.actor_id = $3 AND b.relationship = 'verifier'
      WHERE a.tenant_id = $1 AND a.id = $2`,
    [tenantId, artifactId, actorId]
  );
  const row = result.rows[0];
  const inboxItem = inboxQueryProof.responseProjection.items.find((item) => (
    item.artifactId === artifactId
  ));
  assert(
    result.rowCount === 1 &&
      HASH.test(row.artifact_hash ?? "") &&
      Number.isSafeInteger(row.artifact_version) && row.artifact_version >= 1 &&
      IDENTIFIER.test(row.credit_intent_id ?? "") &&
      row.purpose === "private_credit_review" &&
      row.status === "active" &&
      HASH.test(row.verifier_actor_ref_hash ?? "") &&
      Number.isSafeInteger(row.claim_count) && row.claim_count >= 1 &&
      row.online_verification_required === true &&
      row.same_tenant_only === true &&
      row.point_in_time === true &&
      row.non_authorizing === true &&
      row.sandbox_only === true &&
      row.production_authority === false &&
      row.pii_included === false &&
      row.raw_transaction_data_included === false &&
      row.score_authoritative === false &&
      row.schema_version === "credit_passport_artifact.v1" &&
      row.resource_status === "active" &&
      Number.isSafeInteger(row.resource_version) && row.resource_version >= 1 &&
      row.binding_status === "active" &&
      Number.isSafeInteger(row.binding_version) && row.binding_version >= 1 &&
      row.binding_relationship === "verifier" &&
      inboxItem?.artifactHash === row.artifact_hash &&
      inboxItem.artifactVersion === row.artifact_version &&
      inboxItem.creditIntentId === row.credit_intent_id &&
      inboxItem.claimCount === row.claim_count &&
      inboxItem.purpose === row.purpose &&
      inboxItem.issuedAt === iso(row.issued_at) &&
      inboxItem.expiresAt === iso(row.expires_at) &&
      Date.parse(inboxItem.issuedAt) <= Date.parse(inboxQueryProof.occurredAt) &&
      Date.parse(inboxQueryProof.occurredAt) < Date.parse(inboxItem.expiresAt),
    "capital_partner_passport_invalid",
    "Capital Partner Passport is not the exact current verifier-bound inbox artifact"
  );
  return Object.freeze({
    artifactId: row.id,
    artifactHash: row.artifact_hash,
    artifactVersion: row.artifact_version,
    creditIntentId: row.credit_intent_id,
    purpose: row.purpose,
    status: row.status,
    resourceStatus: row.resource_status,
    resourceVersion: row.resource_version,
    bindingStatus: row.binding_status,
    bindingVersion: row.binding_version,
    bindingRelationship: row.binding_relationship,
    bindingActorRefHash: hashId("m1_b_acceptance_actor_reference", { actorId }),
    verifierActorRefHash: row.verifier_actor_ref_hash,
    claimCount: row.claim_count,
    onlineVerificationRequired: true,
    sameTenantOnly: true,
    pointInTime: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionAuthority: false,
    piiIncluded: false,
    rawTransactionDataIncluded: false,
    scoreAuthoritative: false,
    inboxQueryProof
  });
}

async function readCapitalPartnerOffer(client, {
  tenantId,
  creditOfferId,
  expectedSchemaVersion,
  expectedStatus,
  expectedCreditIntentId,
  expectedSubjectId,
  expectedRiskDecisionId,
  expectedCapitalPartnerId = null,
  expectedPassportId = null
}) {
  const result = await client.query(
    `SELECT id, offer_hash, terms_hash, credit_intent_id, subject_id,
            risk_decision_id, status, schema_version, capital_partner_id,
            credit_passport_artifact_id
       FROM credit_offers
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, creditOfferId]
  );
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      HASH.test(row.offer_hash ?? "") && HASH.test(row.terms_hash ?? "") &&
      row.credit_intent_id === expectedCreditIntentId &&
      row.subject_id === expectedSubjectId &&
      row.risk_decision_id === expectedRiskDecisionId &&
      row.status === expectedStatus && row.schema_version === expectedSchemaVersion &&
      row.capital_partner_id === expectedCapitalPartnerId &&
      row.credit_passport_artifact_id === expectedPassportId,
    "capital_partner_offer_invalid",
    `Capital Partner Offer ${creditOfferId} does not match its exact lineage`
  );
  const projection = await readM1BProjectionProof(client, {
    tenantId,
    entityType: "credit_offer",
    entityId: creditOfferId
  });
  return Object.freeze({
    offer: Object.freeze({
      creditOfferId: row.id,
      creditOfferHash: row.offer_hash,
      termsHash: row.terms_hash,
      schemaVersion: row.schema_version,
      aggregateVersion: projection.aggregateVersion,
      status: row.status
    }),
    projection
  });
}

async function readCapitalPartnerPreparationConsent(client, {
  tenantId,
  subjectId,
  creditIntentId
}) {
  const intent = await client.query(
    `SELECT authority_type, authority_ref
       FROM credit_intents
      WHERE tenant_id = $1 AND id = $2 AND subject_id = $3`,
    [tenantId, creditIntentId, subjectId]
  );
  assert(
    intent.rowCount === 1 &&
      intent.rows[0].authority_type === "consent" &&
      IDENTIFIER.test(intent.rows[0].authority_ref ?? ""),
    "capital_partner_preparation_intent_invalid",
    "Capital Partner preparation Intent is not bound to one exact Consent"
  );
  return intent.rows[0].authority_ref;
}

async function readCapitalPartnerPreparation(client, {
  readers,
  tenantId,
  actorId,
  subjectId,
  creditIntentId,
  riskDecisionId,
  preliminaryOfferId,
  passportArtifactId,
  windowStartedAt,
  observedAt
}) {
  const windowStart = iso(windowStartedAt);
  const observationTime = iso(observedAt);
  assert(
    Date.parse(windowStart) < Date.parse(observationTime),
    "capital_partner_preparation_window_invalid",
    "Capital Partner preparation window is invalid"
  );
  const consentId = await readers.preparationConsent(client, {
    tenantId,
    subjectId,
    creditIntentId
  });
  const origin = await readers.preparationOrigin(client, {
    tenantId,
    actorId,
    subjectId,
    consentId,
    creditIntentId,
    riskDecisionId,
    creditOfferId: preliminaryOfferId
  });
  assert(
    origin.row.offer_schema_version === "credit_offer.v1",
    "capital_partner_preparation_offer_invalid",
    "Capital Partner preparation must create one preliminary v1 Offer"
  );
  const retainedSubjectCommand = origin.commandReceipts[0];
  const preparationCommands = [];
  for (const retained of origin.commandReceipts.slice(1)) {
    preparationCommands.push(await readers.preparationCommandProof(client, {
      tenantId,
      actorId,
      operationId: retained.operationId,
      requestId: retained.requestId,
      correlationId: retained.correlationId,
      resourceType: retained.resourceType,
      resourceId: retained.resourceId,
      responseSchemaVersion: retained.responseSchemaVersion
    }));
  }
  const passportLocator = await readers.commandLocator(client, {
    tenantId,
    actorId,
    operationId: "pilotCreateCreditPassportArtifact",
    aggregateType: "credit_passport_artifact",
    aggregateId: passportArtifactId
  });
  const passportCommand = await readers.preparationCommandProof(client, {
    tenantId,
    actorId,
    operationId: "pilotCreateCreditPassportArtifact",
    ...passportLocator,
    responseSchemaVersion: "tenant_credit_passport_artifact_created.v1"
  });
  preparationCommands.push(passportCommand);
  assert(
    retainedSubjectCommand.operationId === "pilotCreateHumanSubject" &&
      preparationCommands.length === CAPITAL_PARTNER_PREPARATION_COMMANDS.length &&
      preparationCommands.every((command, index) => (
        command.operationId === CAPITAL_PARTNER_PREPARATION_COMMANDS[index][0] &&
        command.responseSchemaVersion === CAPITAL_PARTNER_PREPARATION_COMMANDS[index][2] &&
        command.responseProvenance === "durable_postgresql_response_recovery" &&
        command.capturedResponseHashVerified === false &&
        Date.parse(command.occurredAt) > Date.parse(windowStart) &&
        Date.parse(command.completedAt) <= Date.parse(observationTime) &&
        (index === 0 || Date.parse(command.occurredAt) >=
          Date.parse(preparationCommands[index - 1].completedAt))
      )),
    "capital_partner_preparation_command_invalid",
    "Capital Partner preparation commands are not the exact post-anchor Human sequence"
  );
  const [consentCommand, requestCommand, evaluateCommand] = preparationCommands;
  const workflowCorrelationId = requestCommand.correlationId;
  assert(
    evaluateCommand.correlationId === workflowCorrelationId,
    "capital_partner_preparation_workflow_invalid",
    "Human request and evaluation do not share one workflow correlation"
  );
  const [selfObservation, applicationObservation] = await Promise.all([
    readers.queryAuthorizationObservation(client, {
      tenantId,
      actorId,
      operationId: "pilotReadHumanSelf",
      correlationId: workflowCorrelationId,
      resourceType: "subject",
      resourceId: subjectId,
      notBefore: consentCommand.completedAt,
      notAfter: requestCommand.occurredAt
    }),
    readers.queryAuthorizationObservation(client, {
      tenantId,
      actorId,
      operationId: "pilotReadCreditApplication",
      correlationId: workflowCorrelationId,
      resourceType: "credit_intent",
      resourceId: creditIntentId,
      notBefore: requestCommand.completedAt,
      notAfter: evaluateCommand.occurredAt
    })
  ]);
  const passportResponse = passportCommand.responseProjection;
  assert(
    passportResponse?.schemaVersion === "tenant_credit_passport_artifact_created.v1" &&
      passportResponse.replaced === false &&
      passportResponse.artifact?.creditPassportArtifactId === passportArtifactId &&
      passportResponse.artifact.sourceRiskDecisionId === riskDecisionId &&
      passportResponse.artifact.subjectId === subjectId &&
      passportResponse.artifact.status === "active" &&
      passportResponse.artifact.purpose === "private_credit_review" &&
      passportResponse.artifact.sandboxOnly === true &&
      passportResponse.artifact.productionAuthority === false &&
      passportResponse.artifact.piiIncluded === false &&
      passportResponse.artifact.rawTransactionDataIncluded === false &&
      passportResponse.artifact.scoreAuthoritative === false,
    "capital_partner_preparation_passport_invalid",
    "Capital Partner preparation Passport response is not the exact safe artifact"
  );
  const preliminaryOfferSourceEventId = await readers.projectionSourceEventId(client, {
    tenantId,
    entityType: "credit_offer",
    entityId: preliminaryOfferId,
    aggregateVersion: 1
  });
  const [consentProjection, intentProjection, decisionProjection,
    preliminaryOfferProjection, passportProjection, resourceScopes] = await Promise.all([
    readers.projectionProof(client, {
      tenantId,
      entityType: "consent_record",
      entityId: consentId
    }),
    readers.projectionProof(client, {
      tenantId,
      entityType: "credit_intent",
      entityId: creditIntentId
    }),
    readers.projectionProof(client, {
      tenantId,
      entityType: "risk_decision",
      entityId: riskDecisionId
    }),
    readers.projectionProof(client, {
      tenantId,
      entityType: "credit_offer",
      entityId: preliminaryOfferId,
      sourceEventId: preliminaryOfferSourceEventId
    }),
    readers.projectionProof(client, {
      tenantId,
      entityType: "credit_passport_artifact",
      entityId: passportArtifactId
    }),
    readers.actorResourceScope(client, {
      tenantId,
      actorId,
      resources: [
        ["subject", subjectId],
        ["consent", consentId],
        ["credit_intent", creditIntentId],
        ["credit_passport_artifact", passportArtifactId]
      ]
    })
  ]);
  const [identityEvent, preliminaryOfferEvent] = await Promise.all([
    readers.durableEvent(client, {
      tenantId,
      eventId: origin.identityProjection.sourceEventId
    }),
    readers.durableEvent(client, {
      tenantId,
      eventId: preliminaryOfferSourceEventId
    })
  ]);
  const events = uniqueBy([
    identityEvent,
    preliminaryOfferEvent,
    ...preparationCommands.flatMap(({ eventManifest }) => eventManifest)
  ], "eventId");
  return Object.freeze({
    schemaVersion: "m1_b_capital_partner_lineage_preparation.v1",
    provenance: "normal_human_ui_durable_postgresql_reconciliation",
    windowStartedAt: windowStart,
    observedAt: observationTime,
    subjectId,
    consentId,
    identityReferenceId: origin.identityRow.id,
    creditIntentId,
    riskDecisionId,
    preliminaryOfferId,
    passportArtifactId,
    retainedSubjectCommand,
    commandReceipts: Object.freeze(preparationCommands),
    queryAuthorizationObservations: Object.freeze([
      selfObservation,
      applicationObservation
    ]),
    identityReferenceProof: Object.freeze({
      identityReferenceId: origin.identityRow.id,
      identityReferenceHash: origin.identityRow.identity_reference_hash,
      referenceEvidenceHash: origin.identityRow.reference_evidence_hash,
      projectionProof: origin.identityProjection
    }),
    resourceScopes,
    projectionReadBack: Object.freeze([
      origin.identityProjection,
      consentProjection,
      intentProjection,
      decisionProjection,
      preliminaryOfferProjection,
      passportProjection
    ]),
    events: Object.freeze(events),
    responseBoundary: Object.freeze({
      rawResponsesPersisted: false,
      passportSelectedClaimsPersisted: false,
      passportDisclosuresPersisted: false,
      passportIssuerPersisted: false,
      durableResponseHashesRecomputed: true
    })
  });
}

function capitalPartnerRecovery(entry, queryProof, offer, projection) {
  const review = entry.response.humanOfferReview;
  assert(
    review?.serverTruth === true &&
      review.schemaVersion === "human_offer_review_recovery.v1" &&
      review.offerSchemaVersion === "credit_offer.v2" &&
      review.offerAggregateVersion === offer.aggregateVersion &&
      review.offer?.creditOfferId === offer.creditOfferId &&
      review.offer.creditOfferHash === offer.creditOfferHash &&
      review.offer.termsHash === offer.termsHash &&
      review.offer.status === "offered",
    "capital_partner_recovery_invalid",
    "Borrower workspace did not recover the exact current Capital Partner Offer"
  );
  return Object.freeze({
    operationId: "pilotReadWorkspaceResume",
    requestId: entry.requestId,
    correlationId: entry.correlationId,
    responseSchemaVersion: entry.responseSchemaVersion,
    creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    offerSchemaVersion: offer.schemaVersion,
    offerAggregateVersion: offer.aggregateVersion,
    serverTruth: true,
    queryProof,
    offerProjectionProof: projection
  });
}

async function assembleM1BCapitalPartnerCriticalReceipt({
  client,
  tenantId,
  capitalPartnerActorId,
  borrowerActorId,
  candidateReleaseId,
  databaseStartedAt,
  capture,
  denialProofs,
  humanReceiptBinding,
  preparationMarkers,
  dependencies,
  fixtureUsed
}) {
  assert(
    SHA.test(candidateReleaseId ?? "") &&
      [tenantId, capitalPartnerActorId, borrowerActorId].every((value) =>
        IDENTIFIER.test(value ?? "")
      ) &&
      capitalPartnerActorId !== borrowerActorId &&
      Number.isFinite(Date.parse(databaseStartedAt ?? "")),
    "capital_partner_producer_input_invalid",
    "Capital Partner producer release, tenant, actors, or restart identity is invalid"
  );
  const safeCapture = assertM1BResponseOnlyCapture(capture, {
    role: "capital_partner"
  });
  const readers = Object.freeze({
    authorizationResourceLocator: readM1BAuthorizationResourceLocator,
    queryProof: readM1BQueryProof,
    commandProof: readM1BCommandProof,
    profile: readCapitalPartnerProfile,
    passport: readCapitalPartnerPassport,
    offer: readCapitalPartnerOffer,
    projectionSourceEventId: readM1BProjectionSourceEventId,
    projectionProof: readM1BProjectionProof,
    durableEvent: readM1BDurableEvent,
    preparationConsent: readCapitalPartnerPreparationConsent,
    preparationOrigin: humanOrigin,
    commandLocator: readM1BCommandLocator,
    preparationCommandProof: readM1BDurablePreparationCommandProof,
    queryAuthorizationObservation: readM1BQueryAuthorizationObservation,
    actorResourceScope: readM1BActorResourceScope,
    safeAuthentication: readM1BSafeSiweAuthentication,
    ...dependencies
  });
  assert(
    safeCapture.candidateReleaseId === candidateReleaseId &&
      safeCapture.databaseStartedAt === databaseStartedAt &&
      Array.isArray(denialProofs) && denialProofs.length === 2 &&
      humanReceiptBinding?.schemaVersion ===
        "m1_b_human_critical_receipt_binding.v1" &&
      humanReceiptBinding.candidateReleaseId === candidateReleaseId &&
      HASH.test(humanReceiptBinding.receiptHash ?? "") &&
      IDENTIFIER.test(humanReceiptBinding.subjectId ?? "") &&
      HASH.test(humanReceiptBinding.actorRefHash ?? "") &&
      Number.isFinite(Date.parse(humanReceiptBinding.capturedAt ?? "")) &&
      preparationMarkers?.schemaVersion ===
        "m1_b_capital_partner_preparation_markers.v1" &&
      Number.isFinite(Date.parse(preparationMarkers.currentObservedAt ?? "")) &&
      Number.isFinite(Date.parse(preparationMarkers.withdrawalObservedAt ?? "")),
    "capital_partner_capture_runtime_mismatch",
    "Capital Partner capture or denial boundary does not match the exact candidate"
  );
  const entries = safeCapture.responses;
  const [selfEntry, inboxAEntry, authorAEntry, denialAEntry, recoveryAEntry,
    inboxBEntry, authorBEntry, withdrawBEntry, denialBEntry, finalRecoveryEntry] = entries;
  assert(
    Date.parse(humanReceiptBinding.capturedAt) <
      Date.parse(preparationMarkers.currentObservedAt) &&
      Date.parse(preparationMarkers.currentObservedAt) <
        Date.parse(selfEntry.capturedAt) &&
      Date.parse(recoveryAEntry.capturedAt) <
        Date.parse(preparationMarkers.withdrawalObservedAt) &&
      Date.parse(preparationMarkers.withdrawalObservedAt) <
        Date.parse(inboxBEntry.capturedAt),
    "capital_partner_preparation_timeline_invalid",
    "Capital Partner A/B preparation markers do not bracket the exact response sequence"
  );
  const denialEntries = [denialAEntry, denialBEntry];
  denialProofs.forEach((proof, index) => {
    const entry = denialEntries[index];
    assert(
      proof.requestId === entry.requestId &&
        proof.correlationId === entry.correlationId &&
        proof.outwardResponse.capturedAt === entry.capturedAt &&
        proof.outwardResponse.requestProjectionHash ===
          entry.requestProjectionHash &&
        JSON.stringify(proof.outwardResponse.requestProjection) ===
          JSON.stringify(entry.requestProjection) &&
        hashM1BAcceptanceManifest(entry.response) === proof.outwardResponse.responseHash &&
        JSON.stringify(entry.response) ===
          JSON.stringify(proof.outwardResponse.responseProjection),
      "capital_partner_denial_capture_mismatch",
      "Capital Partner denial boundary is not the captured fail-closed response"
    );
  });

  const queryProofFor = async (entry, actorId) => {
    const resource = await readers.authorizationResourceLocator(client, {
      tenantId,
      actorId,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId
    });
    return readers.queryProof(client, {
      tenantId,
      actorId,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      ...resource,
      responseSchemaVersion: entry.responseSchemaVersion,
      response: entry.response,
      capturedAt: entry.capturedAt
    });
  };
  const commandProofFor = async (entry) => {
    const resource = await readers.authorizationResourceLocator(client, {
      tenantId,
      actorId: capitalPartnerActorId,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId
    });
    return readers.commandProof(client, {
      tenantId,
      actorId: capitalPartnerActorId,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      ...resource,
      responseSchemaVersion: entry.responseSchemaVersion,
      safeResponse: entry.response,
      capturedRawResponseHash: entry.rawResponseHash,
      capturedAt: entry.capturedAt
    });
  };

  const [selfProof, inboxAProof, authorAProof, recoveryAProof, inboxBProof,
    authorBProof, withdrawBProof, finalRecoveryProof] = await Promise.all([
    queryProofFor(selfEntry, capitalPartnerActorId),
    queryProofFor(inboxAEntry, capitalPartnerActorId),
    commandProofFor(authorAEntry),
    queryProofFor(recoveryAEntry, borrowerActorId),
    queryProofFor(inboxBEntry, capitalPartnerActorId),
    commandProofFor(authorBEntry),
    commandProofFor(withdrawBEntry),
    queryProofFor(finalRecoveryEntry, borrowerActorId)
  ]);
  const capitalPartnerId = selfEntry.response.profile?.capitalPartnerId;
  assert(
    selfEntry.response.resource?.resourceType === "capital_partner_profile" &&
      selfEntry.response.resource.resourceId === capitalPartnerId,
    "capital_partner_profile_invalid",
    "Capital Partner self response does not bind its profile resource"
  );
  const profileRow = await readers.profile(client, {
    tenantId,
    actorId: capitalPartnerActorId,
    capitalPartnerId
  });
  const authoredA = authorAEntry.response.offer;
  const authoredB = authorBEntry.response.offer;
  assert(
    authoredA?.subjectId === authoredB?.subjectId &&
      authoredA.creditIntentId !== authoredB.creditIntentId &&
      authoredA.creditPassportArtifactId !== authoredB.creditPassportArtifactId &&
      authoredA.creditOfferId !== authoredB.creditOfferId &&
      authoredA.capitalPartnerId === capitalPartnerId &&
      authoredB.capitalPartnerId === capitalPartnerId &&
      withdrawBEntry.response.offer?.creditOfferId === authoredB.creditOfferId &&
      withdrawBEntry.response.offer.status === "withdrawn",
    "capital_partner_lineage_invalid",
    "Capital Partner A/B lineages are not distinct Offers for the same borrower Subject"
  );
  const [passportA, passportB] = await Promise.all([
    readers.passport(client, {
      tenantId,
      actorId: capitalPartnerActorId,
      artifactId: authoredA.creditPassportArtifactId,
      inboxQueryProof: inboxAProof
    }),
    readers.passport(client, {
      tenantId,
      actorId: capitalPartnerActorId,
      artifactId: authoredB.creditPassportArtifactId,
      inboxQueryProof: inboxBProof
    })
  ]);
  assert(
    passportA.creditIntentId === authoredA.creditIntentId &&
      passportB.creditIntentId === authoredB.creditIntentId &&
      authorAProof.resourceType === "credit_passport_artifact" &&
      authorAProof.resourceId === passportA.artifactId &&
      authorBProof.resourceType === "credit_passport_artifact" &&
      authorBProof.resourceId === passportB.artifactId,
    "capital_partner_passport_lineage_invalid",
    "Capital Partner author commands do not bind their exact Passport artifacts"
  );
  const replacementA = authorAProof.eventManifest[0];
  const createdA = authorAProof.eventManifest[1];
  const replacementB = authorBProof.eventManifest[0];
  const createdB = authorBProof.eventManifest[1];
  const withdrawalB = withdrawBProof.eventManifest[0];
  assert(
    authorAProof.eventManifest.length === 2 &&
      replacementA.eventType === "credit_offer_status_changed" &&
      createdA.eventType === "credit_offer_created" &&
      authorBProof.eventManifest.length === 2 &&
      replacementB.eventType === "credit_offer_status_changed" &&
      createdB.eventType === "credit_offer_created" &&
      withdrawBProof.eventManifest.length === 1 &&
      withdrawalB.eventType === "credit_offer_status_changed",
    "capital_partner_command_manifest_invalid",
    "Capital Partner author/replace/withdraw command manifests are incomplete"
  );
  const preliminaryAId = replacementA.payloadProjection.creditOfferId;
  const preliminaryBId = replacementB.payloadProjection.creditOfferId;
  assert(
    replacementA.payloadProjection.replacementOfferId === authoredA.creditOfferId &&
      replacementB.payloadProjection.replacementOfferId === authoredB.creditOfferId &&
      withdrawalB.payloadProjection.creditOfferId === authoredB.creditOfferId &&
      preliminaryAId !== preliminaryBId,
    "capital_partner_replacement_invalid",
    "Capital Partner replacement events do not bind distinct preliminary Offers"
  );
  const [currentPreparation, withdrawalPreparation] = await Promise.all([
    readers.preparation(client, {
      readers,
      tenantId,
      actorId: borrowerActorId,
      subjectId: authoredA.subjectId,
      creditIntentId: passportA.creditIntentId,
      riskDecisionId: authoredA.riskDecisionId,
      preliminaryOfferId: preliminaryAId,
      passportArtifactId: passportA.artifactId,
      windowStartedAt: humanReceiptBinding.capturedAt,
      observedAt: preparationMarkers.currentObservedAt
    }),
    readers.preparation(client, {
      readers,
      tenantId,
      actorId: borrowerActorId,
      subjectId: authoredB.subjectId,
      creditIntentId: passportB.creditIntentId,
      riskDecisionId: authoredB.riskDecisionId,
      preliminaryOfferId: preliminaryBId,
      passportArtifactId: passportB.artifactId,
      windowStartedAt: recoveryAEntry.capturedAt,
      observedAt: preparationMarkers.withdrawalObservedAt
    })
  ]);
  assert(
    humanReceiptBinding.subjectId === authoredA.subjectId &&
      humanReceiptBinding.actorRefHash === hashId(
        "m1_b_acceptance_actor_reference",
        { actorId: borrowerActorId }
      ) &&
      currentPreparation.subjectId === withdrawalPreparation.subjectId &&
      currentPreparation.subjectId === humanReceiptBinding.subjectId &&
      currentPreparation.consentId !== withdrawalPreparation.consentId &&
      currentPreparation.creditIntentId !== withdrawalPreparation.creditIntentId &&
      currentPreparation.riskDecisionId !== withdrawalPreparation.riskDecisionId &&
      currentPreparation.preliminaryOfferId !==
        withdrawalPreparation.preliminaryOfferId &&
      currentPreparation.passportArtifactId !==
        withdrawalPreparation.passportArtifactId,
    "capital_partner_preparation_lineage_invalid",
    "Capital Partner preparation does not prove two fresh same-Subject lineages"
  );
  const [preliminaryAFinal, authoredAFinal, preliminaryBFinal, authoredBFinal] =
    await Promise.all([
      readers.offer(client, {
        tenantId,
        creditOfferId: preliminaryAId,
        expectedSchemaVersion: "credit_offer.v1",
        expectedStatus: "declined",
        expectedCreditIntentId: passportA.creditIntentId,
        expectedSubjectId: authoredA.subjectId,
        expectedRiskDecisionId: authoredA.riskDecisionId
      }),
      readers.offer(client, {
        tenantId,
        creditOfferId: authoredA.creditOfferId,
        expectedSchemaVersion: "credit_offer.v2",
        expectedStatus: "offered",
        expectedCreditIntentId: passportA.creditIntentId,
        expectedSubjectId: authoredA.subjectId,
        expectedRiskDecisionId: authoredA.riskDecisionId,
        expectedCapitalPartnerId: capitalPartnerId,
        expectedPassportId: passportA.artifactId
      }),
      readers.offer(client, {
        tenantId,
        creditOfferId: preliminaryBId,
        expectedSchemaVersion: "credit_offer.v1",
        expectedStatus: "declined",
        expectedCreditIntentId: passportB.creditIntentId,
        expectedSubjectId: authoredB.subjectId,
        expectedRiskDecisionId: authoredB.riskDecisionId
      }),
      readers.offer(client, {
        tenantId,
        creditOfferId: authoredB.creditOfferId,
        expectedSchemaVersion: "credit_offer.v2",
        expectedStatus: "withdrawn",
        expectedCreditIntentId: passportB.creditIntentId,
        expectedSubjectId: authoredB.subjectId,
        expectedRiskDecisionId: authoredB.riskDecisionId,
        expectedCapitalPartnerId: capitalPartnerId,
        expectedPassportId: passportB.artifactId
      })
    ]);
  const [preliminaryAOfferedEventId, preliminaryBOfferedEventId] = await Promise.all([
    readers.projectionSourceEventId(client, {
      tenantId,
      entityType: "credit_offer",
      entityId: preliminaryAId,
      aggregateVersion: 1
    }),
    readers.projectionSourceEventId(client, {
      tenantId,
      entityType: "credit_offer",
      entityId: preliminaryBId,
      aggregateVersion: 1
    })
  ]);
  const [preliminaryAOfferedProjection, preliminaryBOfferedProjection,
    preliminaryAOriginEvent, preliminaryBOriginEvent] = await Promise.all([
    readers.projectionProof(client, {
      tenantId,
      entityType: "credit_offer",
      entityId: preliminaryAId,
      sourceEventId: preliminaryAOfferedEventId
    }),
    readers.projectionProof(client, {
      tenantId,
      entityType: "credit_offer",
      entityId: preliminaryBId,
      sourceEventId: preliminaryBOfferedEventId
    }),
    readers.durableEvent(client, { tenantId, eventId: preliminaryAOfferedEventId }),
    readers.durableEvent(client, { tenantId, eventId: preliminaryBOfferedEventId })
  ]);
  assert(
    preliminaryAFinal.projection.sourceEventId === replacementA.eventId &&
      authoredAFinal.projection.sourceEventId === createdA.eventId &&
      preliminaryBFinal.projection.sourceEventId === replacementB.eventId &&
      authoredBFinal.projection.sourceEventId === withdrawalB.eventId &&
      denialProofs[0].creditOfferId === preliminaryAId &&
      denialProofs[1].creditOfferId === authoredB.creditOfferId,
    "capital_partner_projection_lineage_invalid",
    "Capital Partner Offer projections do not match replace/current/withdraw heads"
  );
  const recoveryA = capitalPartnerRecovery(
    recoveryAEntry,
    recoveryAProof,
    authoredAFinal.offer,
    authoredAFinal.projection
  );
  const finalRecovery = capitalPartnerRecovery(
    finalRecoveryEntry,
    finalRecoveryProof,
    authoredAFinal.offer,
    authoredAFinal.projection
  );
  const commandReceipts = Object.freeze([authorAProof, authorBProof, withdrawBProof]);
  const events = Object.freeze(uniqueBy([
    preliminaryAOriginEvent,
    preliminaryBOriginEvent,
    ...commandReceipts.flatMap(({ eventManifest }) => eventManifest)
  ], "eventId"));
  const cpAuditEventIds = [selfProof, inboxAProof, authorAProof, inboxBProof,
    authorBProof, withdrawBProof].flatMap((proof) =>
    proof.authorizationAudits.map(({ eventId }) => eventId)
  );
  const borrowerAuditEventIds = [
    ...[currentPreparation, withdrawalPreparation].flatMap((preparation) => [
      ...preparation.commandReceipts.flatMap(({ authorizationAudits }) =>
        authorizationAudits.map(({ eventId }) => eventId)
      ),
      ...preparation.queryAuthorizationObservations.flatMap(
        ({ authorizationAudits }) =>
          authorizationAudits.map(({ eventId }) => eventId)
      )
    ]),
    ...recoveryAProof.authorizationAudits.map(({ eventId }) => eventId),
    denialProofs[0].authorizationAudit.eventId,
    denialProofs[1].authorizationAudit.eventId,
    ...finalRecoveryProof.authorizationAudits.map(({ eventId }) => eventId)
  ];
  const [capitalPartnerAuthentication, borrowerAuthentication] = await Promise.all([
    readers.safeAuthentication(client, {
      tenantId,
      actorId: capitalPartnerActorId,
      auditEventIds: cpAuditEventIds,
      databaseStartedAt
    }),
    readers.safeAuthentication(client, {
      tenantId,
      actorId: borrowerActorId,
      auditEventIds: borrowerAuditEventIds,
      databaseStartedAt
    })
  ]);
  assert(
    borrowerAuthentication.amr[2] === "eip191_eoa_v1",
    "capital_partner_borrower_eoa_required",
    "Capital Partner borrower denial/recovery proof requires the invited EOA"
  );
  const responseChronology = normalResponseChronology(
    entries.filter((entry) => entry.armIssuedAt !== undefined),
    [
      selfProof,
      inboxAProof,
      authorAProof,
      recoveryAProof,
      inboxBProof,
      authorBProof,
      withdrawBProof,
      finalRecoveryProof
    ],
    databaseStartedAt
  );
  return Object.freeze({
    schemaVersion: "m1_b_capital_partner_critical_receipt.v1",
    candidateReleaseId,
    sourceRuntime: "local_exact_commit",
    capturedAt: iso(safeCapture.capturedAt),
    databaseStartedAt,
    postRestartVerification: true,
    role: "capital_partner",
    status: "passed",
    authentication: Object.freeze({
      capitalPartner: capitalPartnerAuthentication,
      borrower: borrowerAuthentication
    }),
    normalResponseChronology: responseChronology,
    profile: Object.freeze({
      capitalPartnerId,
      operatorActorRefHash: hashId("m1_b_acceptance_actor_reference", {
        actorId: capitalPartnerActorId
      }),
      invitationOnly: true,
      sameTenantOnly: true,
      sandboxOnly: true,
      productionFundsAuthority: false,
      resourceStatus: profileRow.resource_status,
      resourceVersion: profileRow.resource_version,
      bindingStatus: profileRow.binding_status,
      bindingVersion: profileRow.binding_version,
      bindingRelationship: profileRow.binding_relationship,
      selfQueryProof: selfProof
    }),
    preparation: Object.freeze({
      schemaVersion: "m1_b_capital_partner_preparation.v1",
      humanReceiptBinding: Object.freeze({
        schemaVersion: humanReceiptBinding.schemaVersion,
        candidateReleaseId: humanReceiptBinding.candidateReleaseId,
        receiptHash: humanReceiptBinding.receiptHash,
        capturedAt: iso(humanReceiptBinding.capturedAt),
        subjectId: humanReceiptBinding.subjectId,
        actorRefHash: humanReceiptBinding.actorRefHash
      }),
      currentLineage: currentPreparation,
      withdrawalLineage: withdrawalPreparation
    }),
    currentLineage: Object.freeze({
      subjectId: authoredA.subjectId,
      borrowerActorRefHash: hashId("m1_b_acceptance_actor_reference", {
        actorId: borrowerActorId
      }),
      riskDecisionId: authoredA.riskDecisionId,
      passport: passportA,
      preliminaryOffer: preliminaryAFinal.offer,
      authoredOffer: authoredAFinal.offer,
      replacement: Object.freeze({
        eventId: replacementA.eventId,
        previousStatus: "offered",
        nextStatus: "declined",
        replacementOfferId: authoredA.creditOfferId,
        reasonCode: "capital_partner_offer_authored",
        eventPayloadProjection: replacementA.payloadProjection,
        offeredProjectionProof: preliminaryAOfferedProjection,
        declinedProjectionProof: preliminaryAFinal.projection
      }),
      staleOfferDenial: denialProofs[0],
      borrowerRecovery: recoveryA
    }),
    withdrawalLineage: Object.freeze({
      subjectId: authoredB.subjectId,
      borrowerActorRefHash: hashId("m1_b_acceptance_actor_reference", {
        actorId: borrowerActorId
      }),
      riskDecisionId: authoredB.riskDecisionId,
      passport: passportB,
      preliminaryOffer: preliminaryBFinal.offer,
      authoredOffer: authoredBFinal.offer,
      replacement: Object.freeze({
        eventId: replacementB.eventId,
        previousStatus: "offered",
        nextStatus: "declined",
        replacementOfferId: authoredB.creditOfferId,
        reasonCode: "capital_partner_offer_authored",
        eventPayloadProjection: replacementB.payloadProjection,
        offeredProjectionProof: preliminaryBOfferedProjection,
        declinedProjectionProof: preliminaryBFinal.projection
      }),
      withdrawal: Object.freeze({
        operationId: "pilotTransitionCapitalPartnerOffer",
        requestId: withdrawBEntry.requestId,
        correlationId: withdrawBEntry.correlationId,
        responseSchemaVersion: withdrawBEntry.responseSchemaVersion,
        eventId: withdrawalB.eventId,
        previousStatus: "offered",
        nextStatus: "withdrawn",
        eventPayloadProjection: withdrawalB.payloadProjection,
        authorizationAuditEventId: withdrawBProof.authorizationAuditEventId,
        withdrawnProjectionProof: authoredBFinal.projection
      }),
      withdrawnOfferDenial: denialProofs[1],
      borrowerRecovery: finalRecovery
    }),
    durability: Object.freeze({
      canonicalPersistence: "postgresql",
      rlsReadBack: true,
      authorizationAuditImmutable: true,
      tenantCommandExecutionsImmutable: true,
      fixtureUsed,
      commandReceipts,
      events,
      projectionReadBack: Object.freeze([
        preliminaryAFinal.projection,
        authoredAFinal.projection,
        preliminaryBFinal.projection,
        authoredBFinal.projection
      ])
    }),
    safety: Object.freeze({
      sandboxOnly: true,
      productionFundsApproved: false,
      fundsAuthority: false
    }),
    redaction: Object.freeze({
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      containsRawSignature: false,
      containsWalletAddress: false,
      containsDatabaseCredentials: false
    })
  });
}

export async function produceM1BCapitalPartnerCriticalReceipt(input) {
  assert(
    !Object.hasOwn(input ?? {}, "dependencies"),
    "capital_partner_dependency_override_forbidden",
    "Production Capital Partner Evidence cannot override trusted readers"
  );
  return assembleM1BCapitalPartnerCriticalReceipt({
    ...input,
    dependencies: {},
    fixtureUsed: false
  });
}

export async function produceM1BCapitalPartnerFixtureReceiptForTest(input) {
  return assembleM1BCapitalPartnerCriticalReceipt({
    ...input,
    dependencies: input.dependencies ?? {},
    fixtureUsed: true
  });
}
