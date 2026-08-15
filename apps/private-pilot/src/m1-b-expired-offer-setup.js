import { hashId } from "../../../packages/domain/src/index.js";
import {
  hashM1BAcceptanceManifest,
  inspectM1BResponseOnlyOperation,
  readM1BActorResourceScope,
  readM1BAuthorizationResourceLocator,
  readM1BCommandLocator,
  readM1BCommandProof,
  readM1BDurablePreparationCommandProof,
  readM1BProjectionProof,
  readM1BQueryAuthorizationObservation,
  readM1BQueryProof,
  readM1BSafeSiweAuthentication
} from "./m1-b-human-capital-partner-acceptance.js";
import {
  readM1BOperationalOfferProtectedState
} from "./m1-b-operational-live-negative-acceptance.js";
import {
  withM1BAcceptanceTenantRead
} from "./m1-b-acceptance-postgres.js";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const NORMAL_RESPONSE_CHALLENGE =
  /^m1_b_normal_response_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN =
  "lima_exact_pilot_vm_system_clock";
const NORMAL_RESPONSE_MAX_OBSERVATION_MS = 17 * 60_000;
const MIN_VALIDITY_MS = 90_000;
const MAX_VALIDITY_MS = 120_000;
const MAX_EXPIRY_WAIT_MS = 125_000;
const POLL_INTERVAL_MS = 500;

const HUMAN_PREPARATION_COMMANDS = Object.freeze([
  Object.freeze([
    "pilotCreateConsent",
    "consent",
    "tenant_consent_created.v1"
  ]),
  Object.freeze([
    "pilotRequestCredit",
    "credit_intent",
    "tenant_credit_intent_created.v1"
  ]),
  Object.freeze([
    "pilotEvaluateCreditApplication",
    "risk_decision",
    "tenant_credit_application_evaluated.v2"
  ]),
  Object.freeze([
    "pilotCreateCreditPassportArtifact",
    "credit_passport_artifact",
    "tenant_credit_passport_artifact_created.v1"
  ])
]);

export const M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE = Object.freeze([
  Object.freeze([
    "capital_partner",
    "pilotReadCapitalPartnerPassportInbox",
    "tenant_capital_partner_passport_inbox_view.v1"
  ]),
  Object.freeze([
    "capital_partner",
    "pilotAuthorCapitalPartnerOffer",
    "tenant_capital_partner_offer_authored.v1"
  ])
]);

export const M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION = Object.freeze({
  actorRole: "human",
  operations: Object.freeze([
    "pilotCreateConsent",
    "pilotReadHumanSelf",
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotEvaluateCreditApplication",
    "pilotCreateCreditPassportArtifact"
  ]),
  requirement:
    "Use the same Human Subject, create one fresh Consent and credit application, evaluate it, and issue one distinct Passport to the same invited Capital Partner. Do not accept, execute, repay, or continue the resulting Offer."
});

export class M1BExpiredOfferSetupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BExpiredOfferSetupError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BExpiredOfferSetupError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  return plainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function iso(value, name = "time") {
  const date = value instanceof Date ? value : new Date(value);
  assert(
    Number.isFinite(date.getTime()),
    "expired_offer_time_invalid",
    `${name} is invalid`
  );
  return date.toISOString();
}

function actorRefHash(actorId) {
  return hashId("m1_b_acceptance_actor_reference", { actorId });
}

function operationalRefHash(kind, value) {
  assert(
    IDENTIFIER.test(value ?? ""),
    "expired_offer_lineage_invalid",
    `${kind} reference is invalid`
  );
  return hashId(`m1_b_operational_${kind}_reference`, { value });
}

function safeCount(value, name) {
  const count = Number(value);
  assert(
    Number.isSafeInteger(count) && count >= 0,
    "expired_offer_count_invalid",
    `${name} is invalid`
  );
  return count;
}

function manifest(values) {
  const entries = Object.freeze(values.map((value) => Object.freeze(value)));
  return Object.freeze({
    entries,
    entryCount: entries.length,
    manifestHash: hashM1BAcceptanceManifest(entries)
  });
}

function uniqueBy(values, key) {
  return [...new Map(values.map((value) => [value[key], value])).values()];
}

function assertZeroRelatedEffects(state, code) {
  const related = state?.manifest?.related;
  assert(
    related &&
      Object.values(related).every((entry) => (
        entry?.rowCount === 0 && HASH.test(entry?.manifestHash ?? "")
      )),
    code,
    "Expired Offer setup created a downstream economic effect"
  );
  return Object.freeze(Object.fromEntries(
    Object.entries(related).map(([key, entry]) => [key, Object.freeze({
      rowCount: safeCount(entry.rowCount, `${key} row count`),
      manifestHash: entry.manifestHash
    })])
  ));
}

function validateCriticalLineage(value, name, expectedStatus) {
  assert(
    exactKeys(value, [
      "consentId",
      "creditIntentId",
      "riskDecisionId",
      "passportArtifactId",
      "preliminaryOfferId",
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "aggregateVersion",
      "status"
    ]) &&
      [
        value.consentId,
        value.creditIntentId,
        value.riskDecisionId,
        value.passportArtifactId,
        value.preliminaryOfferId,
        value.creditOfferId
      ].every((entry) => IDENTIFIER.test(entry ?? "")) &&
      HASH.test(value.creditOfferHash ?? "") &&
      HASH.test(value.termsHash ?? "") &&
      Number.isSafeInteger(value.aggregateVersion) &&
      value.aggregateVersion >= 1 &&
      value.status === expectedStatus,
    "expired_offer_critical_binding_invalid",
    `${name} critical lineage binding is invalid`
  );
}

export function createM1BExpiredOfferCriticalBinding(
  capitalPartnerReceipt,
  { artifactId = "capital_partner_critical", sha256 }
) {
  const current = capitalPartnerReceipt?.currentLineage;
  const withdrawal = capitalPartnerReceipt?.withdrawalLineage;
  const currentPreparation = capitalPartnerReceipt?.preparation?.currentLineage;
  const withdrawalPreparation = capitalPartnerReceipt?.preparation?.withdrawalLineage;
  assert(
    capitalPartnerReceipt?.schemaVersion ===
      "m1_b_capital_partner_critical_receipt.v1" &&
      capitalPartnerReceipt.status === "passed" &&
      capitalPartnerReceipt.sourceRuntime === "local_exact_commit" &&
      capitalPartnerReceipt.durability?.fixtureUsed === false &&
      capitalPartnerReceipt.safety?.sandboxOnly === true &&
      capitalPartnerReceipt.safety.productionFundsApproved === false &&
      capitalPartnerReceipt.safety.fundsAuthority === false &&
      artifactId === "capital_partner_critical" &&
      SHA256.test(sha256 ?? "") &&
      IDENTIFIER.test(current?.subjectId ?? "") &&
      current.subjectId === withdrawal?.subjectId,
    "expired_offer_critical_binding_invalid",
    "Capital Partner critical receipt cannot bind the expired-Offer setup"
  );
  const line = (lineage, preparation) => Object.freeze({
    consentId: preparation.consentId,
    creditIntentId: preparation.creditIntentId,
    riskDecisionId: preparation.riskDecisionId,
    passportArtifactId: preparation.passportArtifactId,
    preliminaryOfferId: preparation.preliminaryOfferId,
    creditOfferId: lineage.authoredOffer.creditOfferId,
    creditOfferHash: lineage.authoredOffer.creditOfferHash,
    termsHash: lineage.authoredOffer.termsHash,
    aggregateVersion: lineage.authoredOffer.aggregateVersion,
    status: lineage.authoredOffer.status
  });
  const binding = Object.freeze({
    schemaVersion: "m1_b_expired_offer_critical_binding.v1",
    artifactId,
    sha256,
    candidateReleaseId: capitalPartnerReceipt.candidateReleaseId,
    databaseStartedAt: iso(capitalPartnerReceipt.databaseStartedAt),
    capturedAt: iso(capitalPartnerReceipt.capturedAt),
    subjectId: current.subjectId,
    borrowerActorRefHash: current.borrowerActorRefHash,
    capitalPartnerActorRefHash:
      capitalPartnerReceipt.profile.operatorActorRefHash,
    capitalPartnerId: capitalPartnerReceipt.profile.capitalPartnerId,
    currentLineage: line(current, currentPreparation),
    withdrawalLineage: line(withdrawal, withdrawalPreparation)
  });
  validateCriticalLineage(binding.currentLineage, "Current", "offered");
  validateCriticalLineage(binding.withdrawalLineage, "Withdrawal", "withdrawn");
  return binding;
}

function assertCriticalBinding(binding, {
  candidateReleaseId,
  databaseStartedAt,
  borrowerActorId,
  capitalPartnerActorId
}) {
  assert(
    exactKeys(binding, [
      "schemaVersion",
      "artifactId",
      "sha256",
      "candidateReleaseId",
      "databaseStartedAt",
      "capturedAt",
      "subjectId",
      "borrowerActorRefHash",
      "capitalPartnerActorRefHash",
      "capitalPartnerId",
      "currentLineage",
      "withdrawalLineage"
    ]) &&
      binding.schemaVersion === "m1_b_expired_offer_critical_binding.v1" &&
      binding.artifactId === "capital_partner_critical" &&
      SHA256.test(binding.sha256 ?? "") &&
      binding.candidateReleaseId === candidateReleaseId &&
      binding.databaseStartedAt === databaseStartedAt &&
      Date.parse(binding.capturedAt) > Date.parse(databaseStartedAt) &&
      IDENTIFIER.test(binding.subjectId ?? "") &&
      IDENTIFIER.test(binding.capitalPartnerId ?? "") &&
      binding.borrowerActorRefHash === actorRefHash(borrowerActorId) &&
      binding.capitalPartnerActorRefHash === actorRefHash(capitalPartnerActorId),
    "expired_offer_critical_binding_invalid",
    "Expired-Offer setup does not bind the exact Capital Partner critical receipt"
  );
  validateCriticalLineage(binding.currentLineage, "Current", "offered");
  validateCriticalLineage(binding.withdrawalLineage, "Withdrawal", "withdrawn");
  const ids = [binding.currentLineage, binding.withdrawalLineage]
    .flatMap((lineage) => [
      lineage.consentId,
      lineage.creditIntentId,
      lineage.riskDecisionId,
      lineage.passportArtifactId,
      lineage.preliminaryOfferId,
      lineage.creditOfferId
    ]);
  assert(
    new Set(ids).size === ids.length,
    "expired_offer_critical_binding_invalid",
    "Critical A/B lineages are not distinct"
  );
  return binding;
}

function assertCaptureEntry(entry, index) {
  const [actorRole, operationId, responseSchemaVersion] =
    M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE[index];
  assert(
    exactKeys(entry, [
      "sequence",
      "actorRole",
      "operationId",
      "requestId",
      "correlationId",
      "responseSchemaVersion",
      "armIssuedAt",
      "armClockDomain",
      "capturedAt",
      "rawResponseHash",
      "response"
    ]) &&
      entry.sequence === index + 1 &&
      entry.actorRole === actorRole &&
      entry.operationId === operationId &&
      entry.responseSchemaVersion === responseSchemaVersion &&
      REQUEST_IDENTIFIER.test(entry.requestId ?? "") &&
      REQUEST_IDENTIFIER.test(entry.correlationId ?? "") &&
      entry.armClockDomain ===
        M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN &&
      Number.isFinite(Date.parse(entry.armIssuedAt ?? "")) &&
      Number.isFinite(Date.parse(entry.capturedAt ?? "")) &&
      Date.parse(entry.armIssuedAt) <= Date.parse(entry.capturedAt) &&
      Date.parse(entry.capturedAt) <= Date.parse(entry.armIssuedAt) +
        NORMAL_RESPONSE_MAX_OBSERVATION_MS &&
      HASH.test(entry.rawResponseHash ?? "") &&
      plainObject(entry.response),
    "expired_offer_capture_invalid",
    `Expired-Offer response ${index + 1} is invalid`
  );
  const inspected = inspectM1BResponseOnlyOperation({
    operationId,
    responseSchemaVersion,
    response: entry.response
  });
  assert(
    JSON.stringify(inspected.response) === JSON.stringify(entry.response) &&
      entry.capturedAt === iso(entry.capturedAt),
    "expired_offer_capture_invalid",
    `Expired-Offer response ${index + 1} is not an allowlisted projection or has an invalid time`
  );
  return Object.freeze({ entry, inspected });
}

export function parseM1BExpiredOfferSetupResponseLine(line, {
  sequence,
  armChallenge,
  armIssuedAt,
  armClockDomain,
  observedAt = new Date()
}) {
  assert(
    Number.isSafeInteger(sequence) && sequence >= 1 && sequence <= 2 &&
      typeof line === "string" &&
      line.length >= 1 && Buffer.byteLength(line, "utf8") <= 256 * 1024,
    "expired_offer_response_line_invalid",
    "Expired-Offer response line is invalid"
  );
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    fail("expired_offer_response_line_invalid", "Response line is not valid JSON");
  }
  const [actorRole, operationId, responseSchemaVersion] =
    M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE[sequence - 1];
  const capturedAt = iso(observedAt);
  const expectedArmIssuedAt = iso(armIssuedAt);
  assert(
    exactKeys(value, [
      "schemaVersion",
      "flow",
      "sequence",
      "requestId",
      "correlationId",
      "armChallenge",
      "armIssuedAt",
      "armClockDomain",
      "response"
    ]) &&
      value.schemaVersion === "m1_b_acceptance_operator_response.v1" &&
      value.flow === "expired_offer_setup" &&
      value.sequence === sequence &&
      NORMAL_RESPONSE_CHALLENGE.test(armChallenge ?? "") &&
      value.armChallenge === armChallenge &&
      value.armIssuedAt === expectedArmIssuedAt &&
      value.armClockDomain === M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN &&
      armClockDomain === M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN &&
      Date.parse(expectedArmIssuedAt) <= Date.parse(capturedAt) &&
      Date.parse(capturedAt) <= Date.parse(expectedArmIssuedAt) +
        NORMAL_RESPONSE_MAX_OBSERVATION_MS &&
      REQUEST_IDENTIFIER.test(value.requestId ?? "") &&
      REQUEST_IDENTIFIER.test(value.correlationId ?? "") &&
      plainObject(value.response),
    "expired_offer_response_line_invalid",
    "Expired-Offer response envelope is invalid"
  );
  const inspected = inspectM1BResponseOnlyOperation({
    operationId,
    responseSchemaVersion,
    response: value.response
  });
  return Object.freeze({
    sequence,
    actorRole,
    operationId,
    requestId: value.requestId,
    correlationId: value.correlationId,
    responseSchemaVersion,
    armIssuedAt: expectedArmIssuedAt,
    armClockDomain: M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN,
    capturedAt,
    rawResponseHash: inspected.rawResponseHash,
    response: Object.freeze(structuredClone(inspected.response))
  });
}

export function createM1BExpiredOfferSetupCapture({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  preparationObservedAt,
  responses
}) {
  assert(
    SHA.test(candidateReleaseId ?? "") &&
      SHA.test(sourceTreeHash ?? "") &&
      IMAGE_ID.test(runtimeImageId ?? "") &&
      iso(databaseStartedAt) === databaseStartedAt &&
      iso(preparationObservedAt) === preparationObservedAt &&
      Array.isArray(responses) && responses.length === 2,
    "expired_offer_capture_invalid",
    "Expired-Offer capture runtime or response set is invalid"
  );
  const inspected = responses.map((entry, index) => assertCaptureEntry(entry, index));
  assert(
    Date.parse(databaseStartedAt) < Date.parse(preparationObservedAt) &&
      Date.parse(preparationObservedAt) < Date.parse(responses[0].armIssuedAt) &&
      Date.parse(responses[0].armIssuedAt) <=
        Date.parse(responses[0].capturedAt) &&
      Date.parse(responses[0].capturedAt) <=
        Date.parse(responses[1].armIssuedAt) &&
      Date.parse(responses[1].armIssuedAt) <=
        Date.parse(responses[1].capturedAt) &&
      new Set(responses.flatMap(({ requestId, correlationId }) => [
        requestId,
        correlationId
      ])).size === 4,
    "expired_offer_capture_invalid",
    "Expired-Offer capture chronology or request identities are invalid"
  );
  return Object.freeze({
    schemaVersion: "m1_b_expired_offer_setup_capture.v1",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    preparationObservedAt,
    capturedAt: responses[1].capturedAt,
    responses: Object.freeze(inspected.map(({ entry }) => Object.freeze({
      ...entry,
      response: Object.freeze(structuredClone(entry.response))
    })))
  });
}

function assertCapture(capture, expected) {
  assert(
    exactKeys(capture, [
      "schemaVersion",
      "candidateReleaseId",
      "sourceTreeHash",
      "runtimeImageId",
      "databaseStartedAt",
      "preparationObservedAt",
      "capturedAt",
      "responses"
    ]) &&
      capture.schemaVersion === "m1_b_expired_offer_setup_capture.v1" &&
      capture.candidateReleaseId === expected.candidateReleaseId &&
      capture.sourceTreeHash === expected.sourceTreeHash &&
      capture.runtimeImageId === expected.runtimeImageId &&
      capture.databaseStartedAt === expected.databaseStartedAt &&
      capture.capturedAt === capture.responses?.[1]?.capturedAt,
    "expired_offer_capture_invalid",
    "Expired-Offer capture is not bound to the exact runtime"
  );
  return createM1BExpiredOfferSetupCapture(capture);
}

async function readDatabaseClock(client, expectedDatabaseStartedAt) {
  const result = await client.query(
    `SELECT clock_timestamp() AS observed_at,
            pg_postmaster_start_time() AS database_started_at`
  );
  assert(
    result.rowCount === 1 &&
      iso(result.rows[0].database_started_at) === expectedDatabaseStartedAt,
    "expired_offer_database_restart_mismatch",
    "PostgreSQL restarted during expired-Offer setup"
  );
  return Object.freeze({
    observedAt: iso(result.rows[0].observed_at),
    databaseStartedAt: iso(result.rows[0].database_started_at)
  });
}

async function waitForDatabaseExpiry(client, {
  validUntil,
  databaseStartedAt
}) {
  const expiry = Date.parse(validUntil);
  const first = await readDatabaseClock(client, databaseStartedAt);
  const firstRemaining = expiry - Date.parse(first.observedAt);
  assert(
    firstRemaining > 0 && firstRemaining <= MAX_EXPIRY_WAIT_MS,
    "expired_offer_wait_window_invalid",
    "Expired-Offer producer did not begin inside the bounded pre-expiry window"
  );
  const wallDeadline = Date.now() + MAX_EXPIRY_WAIT_MS + 5_000;
  let latest = first;
  while (Date.parse(latest.observedAt) < expiry) {
    assert(
      Date.now() < wallDeadline,
      "expired_offer_wait_timeout",
      "PostgreSQL clock did not reach Offer expiry inside the bounded wait"
    );
    const remaining = expiry - Date.parse(latest.observedAt);
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(POLL_INTERVAL_MS, Math.max(25, remaining))
    ));
    latest = await readDatabaseClock(client, databaseStartedAt);
  }
  return Object.freeze({
    waitStartedAt: first.observedAt,
    expiredObservedAt: latest.observedAt,
    databaseStartedAt: latest.databaseStartedAt,
    waitSource: "postgresql_clock_timestamp",
    maximumWaitMs: MAX_EXPIRY_WAIT_MS
  });
}

function projectOfferState(state, projection) {
  const offer = state?.manifest?.offer;
  assert(
    state?.manifest?.catalogVersion ===
      "m1_b_operational_offer_protected_state.v2" &&
      HASH.test(state.manifestHash ?? "") &&
      offer?.schemaVersion === "credit_offer.v2" &&
      offer.status === "offered" &&
      HASH.test(offer.offerHash ?? "") &&
      HASH.test(offer.termsHash ?? "") &&
      Number.isSafeInteger(projection?.aggregateVersion) &&
      projection.aggregateVersion >= 1 &&
      HASH.test(projection.entityHash ?? "") &&
      projection.sourceFinality === "finalized",
    "expired_offer_state_invalid",
    "Offer state or projection is invalid"
  );
  return Object.freeze({
    protectedStateHash: state.manifestHash,
    offerHash: offer.offerHash,
    termsHash: offer.termsHash,
    status: offer.status,
    schemaVersion: offer.schemaVersion,
    validUntil: offer.validUntil,
    acceptedAt: offer.acceptedAt,
    acceptanceRefHash: offer.acceptanceRefHash,
    closedAt: offer.closedAt,
    aggregateVersion: projection.aggregateVersion,
    projectionEntityHash: projection.entityHash,
    projectionSourceEventId: projection.sourceEventId,
    projectionEvidenceHash: projection.sourceEvidenceHash,
    sourceFinality: projection.sourceFinality
  });
}

async function readOfferPairSnapshot(client, {
  tenantId,
  currentOfferId,
  expiredOfferId,
  databaseStartedAt
}) {
  const clock = await readDatabaseClock(client, databaseStartedAt);
  const currentState = await readM1BOperationalOfferProtectedState(client, {
    tenantId,
    creditOfferId: currentOfferId
  });
  const currentProjection = await readM1BProjectionProof(client, {
    tenantId,
    entityType: "credit_offer",
    entityId: currentOfferId
  });
  const expiredState = await readM1BOperationalOfferProtectedState(client, {
    tenantId,
    creditOfferId: expiredOfferId
  });
  const expiredProjection = await readM1BProjectionProof(client, {
    tenantId,
    entityType: "credit_offer",
    entityId: expiredOfferId
  });
  return Object.freeze({
    observedAt: clock.observedAt,
    databaseStartedAt: clock.databaseStartedAt,
    current: Object.freeze({
      state: currentState,
      projectionProof: currentProjection,
      projection: projectOfferState(currentState, currentProjection)
    }),
    expired: Object.freeze({
      state: expiredState,
      projectionProof: expiredProjection,
      projection: projectOfferState(expiredState, expiredProjection)
    })
  });
}

async function readPreparationLineage(client, {
  tenantId,
  borrowerActorId,
  capitalPartnerActorId,
  capitalPartnerId,
  subjectId,
  consentId,
  creditIntentId,
  riskDecisionId,
  preliminaryOfferId,
  passportArtifactId,
  authoredOfferId,
  windowStartedAt,
  preparationObservedAt
}) {
  const result = await client.query(
    `SELECT c.id AS consent_id, c.consent_hash, c.subject_id AS consent_subject_id,
            c.principal_id AS consent_principal_id, c.status AS consent_status,
            c.sandbox_only AS consent_sandbox_only,
            c.production_authority AS consent_production_authority,
            i.id AS credit_intent_id, i.intent_hash,
            i.subject_id AS intent_subject_id, i.principal_id AS intent_principal_id,
            i.authority_type, i.authority_ref, i.status AS intent_status,
            i.sandbox_only AS intent_sandbox_only,
            i.production_funds_requested,
            d.id AS risk_decision_id, d.decision_hash,
            d.credit_intent_id AS decision_credit_intent_id,
            d.subject_id AS decision_subject_id,
            d.consent_id AS decision_consent_id,
            d.sandbox_only AS decision_sandbox_only,
            d.production_authority AS decision_production_authority,
            o.id AS preliminary_offer_id, o.offer_hash AS preliminary_offer_hash,
            o.terms_hash AS preliminary_terms_hash,
            o.credit_intent_id AS preliminary_credit_intent_id,
            o.subject_id AS preliminary_subject_id,
            o.risk_decision_id AS preliminary_risk_decision_id,
            o.status AS preliminary_offer_status,
            o.schema_version AS preliminary_offer_schema_version,
            a.id AS passport_artifact_id, a.artifact_hash,
            a.version::int AS artifact_version,
            a.source_risk_decision_id, a.subject_id AS passport_subject_id,
            a.controller_actor_ref_hash, a.verifier_actor_ref_hash,
            a.status AS passport_status, a.purpose AS passport_purpose,
            a.online_verification_required, a.same_tenant_only,
            a.point_in_time, a.non_authorizing, a.sandbox_only AS passport_sandbox_only,
            a.production_authority AS passport_production_authority,
            a.pii_included, a.raw_transaction_data_included,
            a.score_authoritative, a.schema_version AS passport_schema_version,
            p.id AS capital_partner_id, p.operator_actor_id,
            p.status AS capital_partner_status, p.invitation_only,
            p.same_tenant_only AS capital_partner_same_tenant_only,
            p.sandbox_only AS capital_partner_sandbox_only,
            p.production_funds_authority,
            n.id AS authored_offer_id, n.offer_hash AS authored_offer_hash,
            n.terms_hash AS authored_terms_hash,
            n.credit_intent_id AS authored_credit_intent_id,
            n.subject_id AS authored_subject_id,
            n.risk_decision_id AS authored_risk_decision_id,
            n.capital_partner_id AS authored_capital_partner_id,
            n.capital_partner_operator_id AS authored_operator_id,
            n.credit_passport_artifact_id AS authored_passport_artifact_id,
            n.credit_passport_artifact_hash AS authored_passport_artifact_hash,
            n.credit_passport_artifact_version::int AS authored_passport_version,
            n.status AS authored_offer_status,
            n.schema_version AS authored_offer_schema_version
       FROM consent_records c
       JOIN credit_intents i
         ON i.tenant_id = c.tenant_id AND i.id = $4
       JOIN risk_decisions d
         ON d.tenant_id = c.tenant_id AND d.id = $5
       JOIN credit_offers o
         ON o.tenant_id = c.tenant_id AND o.id = $6
       JOIN credit_passport_artifacts a
         ON a.tenant_id = c.tenant_id AND a.id = $7
       JOIN capital_partner_profiles p
         ON p.tenant_id = c.tenant_id AND p.id = $8
       JOIN credit_offers n
         ON n.tenant_id = c.tenant_id AND n.id = $9
      WHERE c.tenant_id = $1 AND c.id = $2 AND c.subject_id = $3`,
    [
      tenantId,
      consentId,
      subjectId,
      creditIntentId,
      riskDecisionId,
      preliminaryOfferId,
      passportArtifactId,
      capitalPartnerId,
      authoredOfferId
    ]
  );
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row.consent_id === consentId &&
      row.consent_subject_id === subjectId &&
      row.consent_status === "active" &&
      row.consent_sandbox_only === true &&
      row.consent_production_authority === false &&
      HASH.test(row.consent_hash ?? "") &&
      row.credit_intent_id === creditIntentId &&
      row.intent_subject_id === subjectId &&
      row.intent_principal_id === row.consent_principal_id &&
      row.authority_type === "consent" && row.authority_ref === consentId &&
      row.intent_status === "decided" && row.intent_sandbox_only === true &&
      row.production_funds_requested === false &&
      HASH.test(row.intent_hash ?? "") &&
      row.risk_decision_id === riskDecisionId &&
      row.decision_credit_intent_id === creditIntentId &&
      row.decision_subject_id === subjectId &&
      row.decision_consent_id === consentId &&
      row.decision_sandbox_only === true &&
      row.decision_production_authority === false &&
      HASH.test(row.decision_hash ?? "") &&
      row.preliminary_offer_id === preliminaryOfferId &&
      row.preliminary_credit_intent_id === creditIntentId &&
      row.preliminary_subject_id === subjectId &&
      row.preliminary_risk_decision_id === riskDecisionId &&
      row.preliminary_offer_status === "declined" &&
      row.preliminary_offer_schema_version === "credit_offer.v1" &&
      HASH.test(row.preliminary_offer_hash ?? "") &&
      HASH.test(row.preliminary_terms_hash ?? "") &&
      row.passport_artifact_id === passportArtifactId &&
      HASH.test(row.artifact_hash ?? "") &&
      Number.isSafeInteger(row.artifact_version) && row.artifact_version >= 1 &&
      row.source_risk_decision_id === riskDecisionId &&
      row.passport_subject_id === subjectId &&
      HASH.test(row.controller_actor_ref_hash ?? "") &&
      HASH.test(row.verifier_actor_ref_hash ?? "") &&
      row.controller_actor_ref_hash !== row.verifier_actor_ref_hash &&
      row.passport_status === "active" &&
      row.passport_purpose === "private_credit_review" &&
      row.online_verification_required === true &&
      row.same_tenant_only === true && row.point_in_time === true &&
      row.non_authorizing === true && row.passport_sandbox_only === true &&
      row.passport_production_authority === false &&
      row.pii_included === false && row.raw_transaction_data_included === false &&
      row.score_authoritative === false &&
      row.passport_schema_version === "credit_passport_artifact.v1" &&
      row.capital_partner_id === capitalPartnerId &&
      row.operator_actor_id === capitalPartnerActorId &&
      row.capital_partner_status === "active" &&
      row.invitation_only === true && row.capital_partner_same_tenant_only === true &&
      row.capital_partner_sandbox_only === true &&
      row.production_funds_authority === false &&
      row.authored_offer_id === authoredOfferId &&
      HASH.test(row.authored_offer_hash ?? "") &&
      HASH.test(row.authored_terms_hash ?? "") &&
      row.authored_credit_intent_id === creditIntentId &&
      row.authored_subject_id === subjectId &&
      row.authored_risk_decision_id === riskDecisionId &&
      row.authored_capital_partner_id === capitalPartnerId &&
      row.authored_operator_id === capitalPartnerActorId &&
      row.authored_passport_artifact_id === passportArtifactId &&
      row.authored_passport_artifact_hash === row.artifact_hash &&
      row.authored_passport_version === row.artifact_version &&
      row.authored_offer_status === "offered" &&
      row.authored_offer_schema_version === "credit_offer.v2",
    "expired_offer_lineage_invalid",
    "Fresh expired-Offer Human/Passport lineage is invalid"
  );

  const ids = { consentId, creditIntentId, riskDecisionId, passportArtifactId };
  const commandReceipts = [];
  for (const [operationId, aggregateType, responseSchemaVersion] of
    HUMAN_PREPARATION_COMMANDS) {
    const aggregateId = {
      consent: ids.consentId,
      credit_intent: ids.creditIntentId,
      risk_decision: ids.riskDecisionId,
      credit_passport_artifact: ids.passportArtifactId
    }[aggregateType];
    const locator = await readM1BCommandLocator(client, {
      tenantId,
      actorId: borrowerActorId,
      operationId,
      aggregateType,
      aggregateId
    });
    commandReceipts.push(await readM1BDurablePreparationCommandProof(client, {
      tenantId,
      actorId: borrowerActorId,
      operationId,
      ...locator,
      responseSchemaVersion
    }));
  }
  assert(
    commandReceipts.every((receipt, index) => (
      receipt.operationId === HUMAN_PREPARATION_COMMANDS[index][0] &&
      Date.parse(receipt.occurredAt) > Date.parse(windowStartedAt) &&
      Date.parse(receipt.completedAt) <= Date.parse(preparationObservedAt) &&
      (index === 0 || Date.parse(receipt.occurredAt) >=
        Date.parse(commandReceipts[index - 1].completedAt))
    )),
    "expired_offer_lineage_chronology_invalid",
    "Fresh Human preparation commands are outside the exact post-critical window"
  );
  const [consentCommand, requestCommand, evaluateCommand] = commandReceipts;
  assert(
    requestCommand.correlationId === evaluateCommand.correlationId,
    "expired_offer_lineage_chronology_invalid",
    "Fresh request and evaluation do not share one workflow correlation"
  );
  const queryObservations = [
    await readM1BQueryAuthorizationObservation(client, {
      tenantId,
      actorId: borrowerActorId,
      operationId: "pilotReadHumanSelf",
      correlationId: requestCommand.correlationId,
      resourceType: "subject",
      resourceId: subjectId,
      notBefore: consentCommand.completedAt,
      notAfter: requestCommand.occurredAt
    }),
    await readM1BQueryAuthorizationObservation(client, {
      tenantId,
      actorId: borrowerActorId,
      operationId: "pilotReadCreditApplication",
      correlationId: requestCommand.correlationId,
      resourceType: "credit_intent",
      resourceId: creditIntentId,
      notBefore: requestCommand.completedAt,
      notAfter: evaluateCommand.occurredAt
    })
  ];
  const projections = [];
  for (const [entityType, entityId] of [
    ["consent_record", consentId],
    ["credit_intent", creditIntentId],
    ["risk_decision", riskDecisionId],
    ["credit_offer", preliminaryOfferId],
    ["credit_passport_artifact", passportArtifactId]
  ]) {
    projections.push(await readM1BProjectionProof(client, {
      tenantId,
      entityType,
      entityId
    }));
  }
  const humanResources = await readM1BActorResourceScope(client, {
    tenantId,
    actorId: borrowerActorId,
    resources: [
      ["subject", subjectId],
      ["consent", consentId],
      ["credit_intent", creditIntentId],
      ["credit_passport_artifact", passportArtifactId]
    ]
  });
  return Object.freeze({
    row: Object.freeze({
      consentHash: row.consent_hash,
      intentHash: row.intent_hash,
      decisionHash: row.decision_hash,
      preliminaryOfferHash: row.preliminary_offer_hash,
      preliminaryTermsHash: row.preliminary_terms_hash,
      passportArtifactHash: row.artifact_hash,
      passportArtifactVersion: row.artifact_version,
      passportControllerRefHash: row.controller_actor_ref_hash,
      passportVerifierRefHash: row.verifier_actor_ref_hash,
      authoredOfferHash: row.authored_offer_hash,
      authoredTermsHash: row.authored_terms_hash
    }),
    commandReceipts: Object.freeze(commandReceipts),
    queryObservations: Object.freeze(queryObservations),
    projections: Object.freeze(projections),
    humanResources
  });
}

async function readPreparationConsentId(client, {
  tenantId,
  subjectId,
  creditIntentId
}) {
  const result = await client.query(
    `SELECT authority_type, authority_ref
       FROM credit_intents
      WHERE tenant_id = $1 AND id = $2 AND subject_id = $3`,
    [tenantId, creditIntentId, subjectId]
  );
  assert(
    result.rowCount === 1 &&
      result.rows[0].authority_type === "consent" &&
      IDENTIFIER.test(result.rows[0].authority_ref ?? ""),
    "expired_offer_lineage_invalid",
    "Expired-Offer Credit Intent is not bound to one exact Consent"
  );
  return result.rows[0].authority_ref;
}

function auditEntries(proofs) {
  return uniqueBy(
    proofs.flatMap((proof) => proof.authorizationAudits ?? []),
    "eventId"
  ).map((entry) => Object.freeze({ ...entry }));
}

function projectionEntries(proofs) {
  return [...new Map(proofs.map((proof) => [
    `${proof.entityType}:${proof.entityId}:${proof.aggregateVersion}`,
    proof
  ])).values()].map((entry) => Object.freeze({ ...entry }));
}

function commandEntry(proof) {
  return Object.freeze({
    operationId: proof.operationId,
    requestId: proof.requestId,
    correlationId: proof.correlationId,
    resourceType: proof.resourceType,
    resourceId: proof.resourceId,
    authorizationAuditEventId: proof.authorizationAuditEventId,
    authorizationDecisionId: proof.authorizationDecisionId,
    commandHash: proof.commandHash,
    responseHash: proof.responseHash,
    responseSchemaVersion: proof.responseSchemaVersion,
    occurredAt: proof.occurredAt,
    completedAt: proof.completedAt,
    eventIds: Object.freeze(proof.eventManifest.map(({ eventId }) => eventId))
  });
}

function queryEntry(proof) {
  return Object.freeze({
    operationId: proof.operationId,
    requestId: proof.requestId,
    correlationId: proof.correlationId,
    responseSchemaVersion:
      proof.responseSchemaVersion ?? "authorization_observation_only",
    responseHash: proof.responseHash ?? null,
    responseDurability: proof.responseDurability ??
      "runtime_response_capture_db_reconciled",
    occurredAt: proof.occurredAt,
    authorizationAuditEventIds: Object.freeze(
      proof.authorizationAudits.map(({ eventId }) => eventId)
    )
  });
}

const RECEIPT_TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "artifactId",
  "status",
  "candidateReleaseId",
  "sourceTreeHash",
  "runtimeImageId",
  "sourceRuntime",
  "databaseStartedAt",
  "startedAt",
  "capturedAt",
  "postRestartVerification",
  "criticalReceiptBinding",
  "captureBinding",
  "authentication",
  "actorResourceBindings",
  "lineage",
  "offer",
  "expiration",
  "currentOfferInvariant",
  "setupManifests",
  "zeroDownstreamEffects",
  "durability",
  "safety",
  "redaction"
]);

const SAFE_FALSE_SENSITIVE_KEYS = new Set([
  "sessionmaterialincluded",
  "rawsignatureincluded",
  "walletaddressincluded",
  "containssecrets",
  "containsrawpii",
  "containssessionmaterial",
  "containsrawsignature",
  "containswalletaddress",
  "containsdatabasecredentials"
]);

const FORBIDDEN_RECEIPT_KEY_FRAGMENTS = Object.freeze([
  "cookie",
  "csrf",
  "token",
  "jwt",
  "privatekey",
  "seedphrase",
  "mnemonic",
  "databaseurl",
  "connectionstring",
  "password",
  "secret",
  "apikey",
  "requestheader",
  "requestbody",
  "selectedclaims",
  "disclosures",
  "issuer",
  "rawpii",
  "rawsignature",
  "sessionmaterial"
]);

const FORBIDDEN_RECEIPT_VALUES = Object.freeze([
  /^0x[0-9a-f]{40}$/i,
  /^0x[0-9a-f]{130}$/i,
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
  /-----BEGIN [A-Z0-9 ]+-----/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/i,
  /^(?:bearer|basic)\s+\S+/i
]);

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assertRedactedReceiptValue(value, depth = 0) {
  assert(
    depth <= 16,
    "expired_offer_receipt_redaction_invalid",
    "Expired-Offer receipt exceeds the closed redaction depth"
  );
  if (typeof value === "string") {
    assert(
      !FORBIDDEN_RECEIPT_VALUES.some((pattern) => pattern.test(value)),
      "expired_offer_receipt_redaction_invalid",
      "Expired-Offer receipt contains credential, wallet-address, or connection material"
    );
    return;
  }
  if (value === null || ["boolean", "number"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    assert(
      value.length <= 512,
      "expired_offer_receipt_redaction_invalid",
      "Expired-Offer receipt array exceeds its closed bound"
    );
    value.forEach((entry) => assertRedactedReceiptValue(entry, depth + 1));
    return;
  }
  assert(
    plainObject(value),
    "expired_offer_receipt_redaction_invalid",
    "Expired-Offer receipt contains a non-JSON value"
  );
  assert(
    Object.keys(value).length <= 256,
    "expired_offer_receipt_redaction_invalid",
    "Expired-Offer receipt object exceeds its closed bound"
  );
  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    assert(
      (SAFE_FALSE_SENSITIVE_KEYS.has(normalized) && nested === false) ||
        !FORBIDDEN_RECEIPT_KEY_FRAGMENTS.some((fragment) =>
          normalized.includes(fragment)
        ),
      "expired_offer_receipt_redaction_invalid",
      `Expired-Offer receipt contains forbidden field ${key}`
    );
    assertRedactedReceiptValue(nested, depth + 1);
  }
}

function assertReceiptManifest(value, name) {
  assert(
    exactKeys(value, ["entries", "entryCount", "manifestHash"]) &&
      Array.isArray(value.entries) &&
      value.entryCount === value.entries.length &&
      value.entries.length >= 1 && value.entries.length <= 128 &&
      HASH.test(value.manifestHash ?? "") &&
      value.manifestHash === hashM1BAcceptanceManifest(value.entries),
    "expired_offer_receipt_manifest_invalid",
    `${name} setup manifest is invalid`
  );
  return value.entries;
}

function assertReceiptAuthentication(value, actorHash, auditIds, name) {
  assert(
    exactKeys(value, [
      "method",
      "acr",
      "amr",
      "actorRefHash",
      "clientRefHash",
      "coveredAuditEventIds",
      "auditEventCount",
      "coveredRequestIds",
      "requestCount",
      "earliestAuthTime",
      "latestAuthTime",
      "activeCredentialBinding",
      "activeMembershipBinding",
      "credentialBindingCount",
      "invitationBoundCredentialRegistrationCount",
      "sessionMaterialIncluded",
      "rawSignatureIncluded",
      "walletAddressIncluded"
    ]) &&
      value.method === "siwe" &&
      value.acr === "urn:ipo.one:acr:wallet" &&
      Array.isArray(value.amr) && value.amr.length === 3 &&
      value.amr[0] === "wallet" && value.amr[1] === "siwe" &&
      new Set([
        "eip191_eoa_v1",
        "eip1271_eip191_v1",
        "eip6492_eip191_v1"
      ]).has(value.amr[2]) &&
      value.actorRefHash === actorHash &&
      HASH.test(value.clientRefHash ?? "") &&
      Array.isArray(value.coveredAuditEventIds) &&
      value.auditEventCount === value.coveredAuditEventIds.length &&
      new Set(value.coveredAuditEventIds).size === value.coveredAuditEventIds.length &&
      value.coveredAuditEventIds.every((id) => auditIds.has(id)) &&
      Array.isArray(value.coveredRequestIds) &&
      value.requestCount === value.coveredRequestIds.length &&
      new Set(value.coveredRequestIds).size === value.coveredRequestIds.length &&
      iso(value.earliestAuthTime) === value.earliestAuthTime &&
      iso(value.latestAuthTime) === value.latestAuthTime &&
      Date.parse(value.earliestAuthTime) <= Date.parse(value.latestAuthTime) &&
      value.activeCredentialBinding === true &&
      value.activeMembershipBinding === true &&
      value.credentialBindingCount === 1 &&
      value.invitationBoundCredentialRegistrationCount === 1 &&
      value.sessionMaterialIncluded === false &&
      value.rawSignatureIncluded === false &&
      value.walletAddressIncluded === false,
    "expired_offer_receipt_authentication_invalid",
    `${name} authentication proof is invalid`
  );
}

function assertReceiptResource(resource, {
  actorHash,
  resourceType,
  resourceId,
  relationship
}) {
  assert(
    exactKeys(resource, [
      "resourceType",
      "resourceId",
      "resourceStatus",
      "resourceVersion",
      "bindingRelationship",
      "bindingStatus",
      "bindingVersion",
      "actorRefHash"
    ]) &&
      resource.resourceType === resourceType &&
      resource.resourceId === resourceId &&
      resource.resourceStatus === "active" &&
      Number.isSafeInteger(resource.resourceVersion) &&
      resource.resourceVersion >= 1 &&
      resource.bindingRelationship === relationship &&
      resource.bindingStatus === "active" &&
      Number.isSafeInteger(resource.bindingVersion) &&
      resource.bindingVersion >= 1 &&
      resource.actorRefHash === actorHash,
    "expired_offer_receipt_resource_invalid",
    `Resource binding ${resourceType}/${resourceId} is invalid`
  );
}

export function validateM1BExpiredOfferSetupReceipt(receipt, {
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  capitalPartnerCriticalArtifact,
  expectedFixtureUsed = false
}) {
  assert(
    exactKeys(receipt, RECEIPT_TOP_LEVEL_KEYS) &&
      receipt.schemaVersion === "m1_b_expired_offer_setup_receipt.v1" &&
      receipt.artifactId === "expired_offer_setup" &&
      receipt.status === "passed" &&
      receipt.candidateReleaseId === candidateReleaseId &&
      receipt.sourceTreeHash === sourceTreeHash &&
      receipt.runtimeImageId === runtimeImageId &&
      receipt.sourceRuntime === "local_exact_commit" &&
      receipt.databaseStartedAt === databaseStartedAt &&
      SHA.test(candidateReleaseId ?? "") &&
      SHA.test(sourceTreeHash ?? "") &&
      IMAGE_ID.test(runtimeImageId ?? "") &&
      iso(databaseStartedAt) === databaseStartedAt &&
      iso(receipt.startedAt) === receipt.startedAt &&
      iso(receipt.capturedAt) === receipt.capturedAt &&
      Date.parse(receipt.startedAt) > Date.parse(databaseStartedAt) &&
      Date.parse(receipt.capturedAt) >= Date.parse(receipt.startedAt) &&
      receipt.postRestartVerification === true &&
      capitalPartnerCriticalArtifact?.id === "capital_partner_critical" &&
      SHA256.test(capitalPartnerCriticalArtifact?.sha256 ?? ""),
    "expired_offer_receipt_invalid",
    "Expired-Offer receipt does not match the exact runtime or artifact contract"
  );

  const binding = receipt.criticalReceiptBinding;
  assert(
    exactKeys(binding, [
      "schemaVersion",
      "artifactId",
      "sha256",
      "candidateReleaseId",
      "databaseStartedAt",
      "capturedAt",
      "subjectId",
      "borrowerActorRefHash",
      "capitalPartnerActorRefHash",
      "capitalPartnerId",
      "currentLineage",
      "withdrawalLineage"
    ]) &&
      binding.schemaVersion === "m1_b_expired_offer_critical_binding.v1" &&
      binding.artifactId === capitalPartnerCriticalArtifact.id &&
      binding.sha256 === capitalPartnerCriticalArtifact.sha256 &&
      binding.candidateReleaseId === candidateReleaseId &&
      binding.databaseStartedAt === databaseStartedAt &&
      iso(binding.capturedAt) === binding.capturedAt &&
      Date.parse(binding.capturedAt) < Date.parse(receipt.startedAt) &&
      IDENTIFIER.test(binding.subjectId ?? "") &&
      HASH.test(binding.borrowerActorRefHash ?? "") &&
      HASH.test(binding.capitalPartnerActorRefHash ?? "") &&
      IDENTIFIER.test(binding.capitalPartnerId ?? ""),
    "expired_offer_receipt_critical_binding_invalid",
    "Expired-Offer receipt critical artifact binding is invalid"
  );
  validateCriticalLineage(binding.currentLineage, "Current", "offered");
  validateCriticalLineage(binding.withdrawalLineage, "Withdrawal", "withdrawn");

  const captureBinding = receipt.captureBinding;
  assert(
    exactKeys(captureBinding, [
      "schemaVersion",
      "captureHash",
      "preparationObservedAt",
      "inboxArmIssuedAt",
      "inboxCapturedAt",
      "authorArmIssuedAt",
      "authorCapturedAt",
      "armClockDomain",
      "capturedAt",
      "responseCount",
      "responseOnly"
    ]) &&
      captureBinding.schemaVersion === "m1_b_expired_offer_setup_capture.v1" &&
      HASH.test(captureBinding.captureHash ?? "") &&
      iso(captureBinding.preparationObservedAt) ===
        captureBinding.preparationObservedAt &&
      iso(captureBinding.inboxArmIssuedAt) === captureBinding.inboxArmIssuedAt &&
      iso(captureBinding.inboxCapturedAt) === captureBinding.inboxCapturedAt &&
      iso(captureBinding.authorArmIssuedAt) === captureBinding.authorArmIssuedAt &&
      iso(captureBinding.authorCapturedAt) === captureBinding.authorCapturedAt &&
      captureBinding.armClockDomain ===
        M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN &&
      iso(captureBinding.capturedAt) === captureBinding.capturedAt &&
      Date.parse(binding.capturedAt) <
        Date.parse(captureBinding.preparationObservedAt) &&
      Date.parse(captureBinding.preparationObservedAt) <
        Date.parse(captureBinding.inboxArmIssuedAt) &&
      Date.parse(captureBinding.inboxArmIssuedAt) <=
        Date.parse(captureBinding.inboxCapturedAt) &&
      Date.parse(captureBinding.inboxCapturedAt) <=
        Date.parse(captureBinding.authorArmIssuedAt) &&
      Date.parse(captureBinding.authorArmIssuedAt) <=
        Date.parse(captureBinding.authorCapturedAt) &&
      captureBinding.authorCapturedAt === captureBinding.capturedAt &&
      Date.parse(captureBinding.capturedAt) <= Date.parse(receipt.startedAt) &&
      captureBinding.responseCount === 2 &&
      captureBinding.responseOnly === true,
    "expired_offer_receipt_capture_invalid",
    "Expired-Offer response-only capture binding is invalid"
  );

  const lineage = receipt.lineage;
  assert(
    exactKeys(lineage, [
      "lineageId",
      "subjectId",
      "consentId",
      "creditIntentId",
      "riskDecisionId",
      "preliminaryOfferId",
      "passportArtifactId",
      "creditOfferId",
      "sameHumanSubjectAsCriticalA",
      "sameCapitalPartnerAsCriticalA",
      "distinctFromCriticalAAndB",
      "retainedLineageHashes",
      "consent",
      "creditIntent",
      "riskDecision",
      "preliminaryOffer",
      "passport"
    ]) &&
      lineage.lineageId === "C" &&
      lineage.subjectId === binding.subjectId &&
      [
        lineage.consentId,
        lineage.creditIntentId,
        lineage.riskDecisionId,
        lineage.preliminaryOfferId,
        lineage.passportArtifactId,
        lineage.creditOfferId
      ].every((id) => IDENTIFIER.test(id ?? "")) &&
      lineage.sameHumanSubjectAsCriticalA === true &&
      lineage.sameCapitalPartnerAsCriticalA === true &&
      lineage.distinctFromCriticalAAndB === true,
    "expired_offer_receipt_lineage_invalid",
    "Expired-Offer receipt lineage C identity is invalid"
  );
  const priorIds = [binding.currentLineage, binding.withdrawalLineage]
    .flatMap((entry) => [
      entry.consentId,
      entry.creditIntentId,
      entry.riskDecisionId,
      entry.preliminaryOfferId,
      entry.passportArtifactId,
      entry.creditOfferId
    ]);
  const lineageIds = [
    lineage.consentId,
    lineage.creditIntentId,
    lineage.riskDecisionId,
    lineage.preliminaryOfferId,
    lineage.passportArtifactId,
    lineage.creditOfferId
  ];
  assert(
    new Set(lineageIds).size === lineageIds.length &&
      lineageIds.every((id) => !priorIds.includes(id)) &&
      exactKeys(lineage.retainedLineageHashes, [
        "consentHash",
        "intentHash",
        "decisionHash",
        "preliminaryOfferHash",
        "preliminaryTermsHash",
        "passportArtifactHash",
        "passportArtifactVersion",
        "passportControllerRefHash",
        "passportVerifierRefHash",
        "authoredOfferHash",
        "authoredTermsHash"
      ]) &&
      Object.entries(lineage.retainedLineageHashes)
        .filter(([key]) => key !== "passportArtifactVersion")
        .every(([, value]) => HASH.test(value ?? "")) &&
      Number.isSafeInteger(
        lineage.retainedLineageHashes.passportArtifactVersion
      ) && lineage.retainedLineageHashes.passportArtifactVersion >= 1,
    "expired_offer_receipt_lineage_invalid",
    "Expired-Offer receipt lineage C is not fresh or hash-complete"
  );

  const { consent, creditIntent, riskDecision, preliminaryOffer, passport } = lineage;
  assert(
    exactKeys(consent, [
      "consentId", "consentHash", "status", "sandboxOnly",
      "productionAuthority", "schemaVersion"
    ]) && consent.consentId === lineage.consentId &&
      consent.consentHash === lineage.retainedLineageHashes.consentHash &&
      consent.status === "active" && consent.sandboxOnly === true &&
      consent.productionAuthority === false &&
      consent.schemaVersion === "consent_record.v1" &&
    exactKeys(creditIntent, [
      "creditIntentId", "intentHash", "authorityType", "authorityRef",
      "status", "sandboxOnly", "productionFundsRequested", "schemaVersion"
    ]) && creditIntent.creditIntentId === lineage.creditIntentId &&
      creditIntent.intentHash === lineage.retainedLineageHashes.intentHash &&
      creditIntent.authorityType === "consent" &&
      creditIntent.authorityRef === lineage.consentId &&
      creditIntent.status === "decided" && creditIntent.sandboxOnly === true &&
      creditIntent.productionFundsRequested === false &&
      creditIntent.schemaVersion === "credit_intent.v1" &&
    exactKeys(riskDecision, [
      "riskDecisionId", "decisionHash", "consentId", "sandboxOnly",
      "productionAuthority"
    ]) && riskDecision.riskDecisionId === lineage.riskDecisionId &&
      riskDecision.decisionHash === lineage.retainedLineageHashes.decisionHash &&
      riskDecision.consentId === lineage.consentId &&
      riskDecision.sandboxOnly === true &&
      riskDecision.productionAuthority === false &&
    exactKeys(preliminaryOffer, [
      "creditOfferId", "creditOfferHash", "termsHash", "status",
      "replacementOfferId", "schemaVersion"
    ]) && preliminaryOffer.creditOfferId === lineage.preliminaryOfferId &&
      preliminaryOffer.creditOfferHash ===
        lineage.retainedLineageHashes.preliminaryOfferHash &&
      preliminaryOffer.termsHash ===
        lineage.retainedLineageHashes.preliminaryTermsHash &&
      preliminaryOffer.status === "declined" &&
      preliminaryOffer.replacementOfferId === lineage.creditOfferId &&
      preliminaryOffer.schemaVersion === "credit_offer.v1" &&
    exactKeys(passport, [
      "artifactId", "artifactHash", "artifactVersion", "status", "purpose",
      "controllerActorRefHash", "verifierActorRefHash",
      "verifierBindingRelationship", "sandboxOnly", "productionAuthority",
      "piiIncluded", "rawTransactionDataIncluded", "scoreAuthoritative",
      "schemaVersion"
    ]) && passport.artifactId === lineage.passportArtifactId &&
      passport.artifactHash === lineage.retainedLineageHashes.passportArtifactHash &&
      passport.artifactVersion ===
        lineage.retainedLineageHashes.passportArtifactVersion &&
      passport.controllerActorRefHash ===
        lineage.retainedLineageHashes.passportControllerRefHash &&
      passport.verifierActorRefHash ===
        lineage.retainedLineageHashes.passportVerifierRefHash &&
      passport.controllerActorRefHash !== passport.verifierActorRefHash &&
      passport.status === "active" &&
      passport.purpose === "private_credit_review" &&
      passport.verifierBindingRelationship === "verifier" &&
      passport.sandboxOnly === true && passport.productionAuthority === false &&
      passport.piiIncluded === false &&
      passport.rawTransactionDataIncluded === false &&
      passport.scoreAuthoritative === false &&
      passport.schemaVersion === "credit_passport_artifact.v1",
    "expired_offer_receipt_lineage_invalid",
    "Expired-Offer receipt lineage C semantics are invalid"
  );

  const offer = receipt.offer;
  assert(
    exactKeys(offer, [
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "schemaVersion",
      "physicalStatus",
      "aggregateVersion",
      "validUntil",
      "replacementEventId",
      "creationEventId",
      "sandboxOnly",
      "productionFundsApproved"
    ]) &&
      offer.creditOfferId === lineage.creditOfferId &&
      offer.creditOfferHash ===
        lineage.retainedLineageHashes.authoredOfferHash &&
      offer.termsHash === lineage.retainedLineageHashes.authoredTermsHash &&
      offer.schemaVersion === "credit_offer.v2" &&
      offer.physicalStatus === "offered" && offer.aggregateVersion === 1 &&
      iso(offer.validUntil) === offer.validUntil &&
      IDENTIFIER.test(offer.replacementEventId ?? "") &&
      IDENTIFIER.test(offer.creationEventId ?? "") &&
      offer.replacementEventId !== offer.creationEventId &&
      offer.sandboxOnly === true && offer.productionFundsApproved === false,
    "expired_offer_receipt_offer_invalid",
    "Expired-Offer receipt does not bind one physical offered v2 target"
  );

  const expiration = receipt.expiration;
  assert(
    exactKeys(expiration, [
      "clockSource",
      "validityMs",
      "baselineObservedAt",
      "waitStartedAt",
      "expiredObservedAt",
      "finalObservedAt",
      "physicalStatusBefore",
      "physicalStatusAfter",
      "protectedStateBeforeHash",
      "protectedStateAfterHash",
      "projectionBeforeHash",
      "projectionAfterHash",
      "databaseRestarted"
    ]) &&
      expiration.clockSource === "postgresql_clock_timestamp" &&
      Number.isSafeInteger(expiration.validityMs) &&
      expiration.validityMs >= MIN_VALIDITY_MS &&
      expiration.validityMs <= MAX_VALIDITY_MS &&
      iso(expiration.baselineObservedAt) === expiration.baselineObservedAt &&
      iso(expiration.waitStartedAt) === expiration.waitStartedAt &&
      iso(expiration.expiredObservedAt) === expiration.expiredObservedAt &&
      iso(expiration.finalObservedAt) === expiration.finalObservedAt &&
      expiration.baselineObservedAt === receipt.startedAt &&
      Date.parse(expiration.baselineObservedAt) <=
        Date.parse(expiration.waitStartedAt) &&
      Date.parse(expiration.waitStartedAt) < Date.parse(offer.validUntil) &&
      Date.parse(expiration.expiredObservedAt) >= Date.parse(offer.validUntil) &&
      Date.parse(expiration.finalObservedAt) >=
        Date.parse(expiration.expiredObservedAt) &&
      expiration.finalObservedAt === receipt.capturedAt &&
      expiration.physicalStatusBefore === "offered" &&
      expiration.physicalStatusAfter === "offered" &&
      HASH.test(expiration.protectedStateBeforeHash ?? "") &&
      expiration.protectedStateBeforeHash ===
        expiration.protectedStateAfterHash &&
      HASH.test(expiration.projectionBeforeHash ?? "") &&
      expiration.projectionBeforeHash === expiration.projectionAfterHash &&
      expiration.databaseRestarted === false,
    "expired_offer_receipt_expiration_invalid",
    "Expired-Offer receipt database-clock expiration proof is invalid"
  );

  const current = receipt.currentOfferInvariant;
  assert(
    exactKeys(current, [
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "aggregateVersion",
      "status",
      "protectedStateBeforeHash",
      "protectedStateAfterHash",
      "projectionBeforeHash",
      "projectionAfterHash",
      "unchanged"
    ]) &&
      current.creditOfferId === binding.currentLineage.creditOfferId &&
      current.creditOfferHash === binding.currentLineage.creditOfferHash &&
      current.termsHash === binding.currentLineage.termsHash &&
      current.aggregateVersion === binding.currentLineage.aggregateVersion &&
      current.status === "offered" &&
      HASH.test(current.protectedStateBeforeHash ?? "") &&
      current.protectedStateBeforeHash === current.protectedStateAfterHash &&
      HASH.test(current.projectionBeforeHash ?? "") &&
      current.projectionBeforeHash === current.projectionAfterHash &&
      current.unchanged === true,
    "expired_offer_receipt_current_offer_invalid",
    "Expired-Offer receipt does not preserve exact current Offer A"
  );

  assert(
    exactKeys(receipt.setupManifests, [
      "commands", "queries", "events", "authorizationAudits", "projections"
    ]),
    "expired_offer_receipt_manifest_invalid",
    "Expired-Offer setup manifest catalog is invalid"
  );
  const commands = assertReceiptManifest(receipt.setupManifests.commands, "Command");
  const queries = assertReceiptManifest(receipt.setupManifests.queries, "Query");
  const events = assertReceiptManifest(receipt.setupManifests.events, "Event");
  const audits = assertReceiptManifest(
    receipt.setupManifests.authorizationAudits,
    "Authorization audit"
  );
  const projections = assertReceiptManifest(
    receipt.setupManifests.projections,
    "Projection"
  );
  assert(
    commands.length === 5 &&
      JSON.stringify(commands.map(({ operationId }) => operationId)) ===
        JSON.stringify([
          "pilotCreateConsent",
          "pilotRequestCredit",
          "pilotEvaluateCreditApplication",
          "pilotCreateCreditPassportArtifact",
          "pilotAuthorCapitalPartnerOffer"
        ]) &&
      commands.every((entry) => (
        exactKeys(entry, [
          "operationId", "requestId", "correlationId", "resourceType",
          "resourceId", "authorizationAuditEventId",
          "authorizationDecisionId", "commandHash", "responseHash",
          "responseSchemaVersion", "occurredAt", "completedAt", "eventIds"
        ]) &&
        REQUEST_IDENTIFIER.test(entry.requestId ?? "") &&
        REQUEST_IDENTIFIER.test(entry.correlationId ?? "") &&
        IDENTIFIER.test(entry.resourceType ?? "") &&
        IDENTIFIER.test(entry.resourceId ?? "") &&
        HASH.test(entry.commandHash ?? "") && HASH.test(entry.responseHash ?? "") &&
        iso(entry.occurredAt) === entry.occurredAt &&
        iso(entry.completedAt) === entry.completedAt &&
        Date.parse(entry.occurredAt) <= Date.parse(entry.completedAt) &&
        Date.parse(entry.completedAt) <= Date.parse(receipt.startedAt) &&
        Array.isArray(entry.eventIds) && entry.eventIds.length >= 1
      )) &&
      queries.length === 3 &&
      JSON.stringify(queries.map(({ operationId }) => operationId)) ===
        JSON.stringify([
          "pilotReadHumanSelf",
          "pilotReadCreditApplication",
          "pilotReadCapitalPartnerPassportInbox"
        ]) &&
      queries.every((entry) => (
        exactKeys(entry, [
          "operationId", "requestId", "correlationId", "responseSchemaVersion",
          "responseHash", "responseDurability", "occurredAt",
          "authorizationAuditEventIds"
        ]) &&
        REQUEST_IDENTIFIER.test(entry.requestId ?? "") &&
        REQUEST_IDENTIFIER.test(entry.correlationId ?? "") &&
        (entry.responseHash === null || HASH.test(entry.responseHash ?? "")) &&
        iso(entry.occurredAt) === entry.occurredAt &&
        Date.parse(entry.occurredAt) <= Date.parse(receipt.startedAt) &&
        Array.isArray(entry.authorizationAuditEventIds) &&
        entry.authorizationAuditEventIds.length === 2
      )),
    "expired_offer_receipt_manifest_invalid",
    "Expired-Offer command or query manifest is incomplete"
  );
  const eventIds = new Set(events.map(({ eventId }) => eventId));
  const auditIds = new Set(audits.map(({ eventId }) => eventId));
  assert(
    events.length >= 6 && eventIds.size === events.length &&
      events.every((entry) => (
        IDENTIFIER.test(entry.eventId ?? "") &&
        IDENTIFIER.test(entry.eventType ?? "") &&
        IDENTIFIER.test(entry.aggregateType ?? "") &&
        IDENTIFIER.test(entry.aggregateId ?? "") &&
        Number.isSafeInteger(entry.aggregateVersion) && entry.aggregateVersion >= 1 &&
        HASH.test(entry.payloadHash ?? "") && HASH.test(entry.evidenceHash ?? "") &&
        entry.sourceFinality === "finalized" &&
        iso(entry.occurredAt) === entry.occurredAt &&
        Date.parse(entry.occurredAt) <= Date.parse(receipt.startedAt)
      )) &&
      commands.every((entry) => entry.eventIds.every((id) => eventIds.has(id))) &&
      eventIds.has(offer.replacementEventId) && eventIds.has(offer.creationEventId) &&
      audits.length === 16 && auditIds.size === audits.length &&
      audits.every((entry) => (
        exactKeys(entry, [
          "eventId", "operationId", "requestId", "correlationId",
          "resourceType", "resourceId", "authorizationDecision",
          "authorizationDecisionId", "actorRefHash", "policyVersion",
          "reasonCode", "occurredAt"
        ]) &&
        IDENTIFIER.test(entry.eventId ?? "") &&
        IDENTIFIER.test(entry.operationId ?? "") &&
        REQUEST_IDENTIFIER.test(entry.requestId ?? "") &&
        REQUEST_IDENTIFIER.test(entry.correlationId ?? "") &&
        IDENTIFIER.test(entry.resourceType ?? "") &&
        IDENTIFIER.test(entry.resourceId ?? "") &&
        IDENTIFIER.test(entry.authorizationDecisionId ?? "") &&
        IDENTIFIER.test(entry.policyVersion ?? "") &&
        entry.authorizationDecision === "allow" &&
        entry.reasonCode === "authorization_allowed" &&
        HASH.test(entry.actorRefHash ?? "") &&
        iso(entry.occurredAt) === entry.occurredAt &&
        Date.parse(entry.occurredAt) <= Date.parse(receipt.startedAt)
      )) &&
      projections.length === 7 &&
      new Set(projections.map((entry) =>
        `${entry.entityType}:${entry.entityId}`
      )).size === projections.length &&
      projections.every((entry) => (
        IDENTIFIER.test(entry.entityType ?? "") &&
        IDENTIFIER.test(entry.entityId ?? "") &&
        HASH.test(entry.entityHash ?? "") &&
        Number.isSafeInteger(entry.aggregateVersion) && entry.aggregateVersion >= 1 &&
        IDENTIFIER.test(entry.sourceEventId ?? "") &&
        HASH.test(entry.sourceEvidenceHash ?? "") &&
        entry.sourceFinality === "finalized"
      )),
    "expired_offer_receipt_manifest_invalid",
    "Expired-Offer Event, audit, or projection manifest is incomplete"
  );

  const auditsFor = (entry) => audits.filter((audit) => (
    audit.operationId === entry.operationId &&
    audit.requestId === entry.requestId &&
    audit.correlationId === entry.correlationId
  ));
  const commandAuditGroups = commands.map((entry, index) => {
    const group = auditsFor(entry);
    const primary = group.find(({ eventId }) =>
      eventId === entry.authorizationAuditEventId
    );
    const actorHash = index < 4
      ? binding.borrowerActorRefHash
      : binding.capitalPartnerActorRefHash;
    assert(
      group.length === 2 && primary !== undefined &&
        primary.authorizationDecisionId === entry.authorizationDecisionId &&
        primary.occurredAt === entry.occurredAt &&
        group.every((audit) => (
          audit.resourceType === entry.resourceType &&
          audit.resourceId === entry.resourceId &&
          audit.actorRefHash === actorHash &&
          Date.parse(audit.occurredAt) <= Date.parse(entry.occurredAt)
        )) &&
        entry.eventIds.every((eventId) => {
          const event = events.find((candidate) => candidate.eventId === eventId);
          return event?.causationId === entry.requestId &&
            event.correlationId === entry.correlationId;
        }),
      "expired_offer_receipt_manifest_invalid",
      `Expired-Offer command ${entry.operationId} is not linked to its exact audits and Events`
    );
    return group;
  });
  const queryAuditGroups = queries.map((entry, index) => {
    const group = auditsFor(entry);
    const actorHash = index < 2
      ? binding.borrowerActorRefHash
      : binding.capitalPartnerActorRefHash;
    assert(
      group.length === 2 && group.every((audit) =>
        audit.actorRefHash === actorHash
      ) &&
        new Set(entry.authorizationAuditEventIds).size === 2 &&
        entry.authorizationAuditEventIds.every((id) =>
          group.some(({ eventId }) => eventId === id)
        ) &&
        Math.max(...group.map(({ occurredAt }) => Date.parse(occurredAt))) ===
          Date.parse(entry.occurredAt),
      "expired_offer_receipt_manifest_invalid",
      `Expired-Offer query ${entry.operationId} is not linked to its exact audits`
    );
    return group;
  });
  const coveredProofAuditIds = new Set([
    ...commandAuditGroups.flat(),
    ...queryAuditGroups.flat()
  ].map(({ eventId }) => eventId));
  const [consentCommand, requestCommand, evaluateCommand,
    passportCommand, authorCommand] = commands;
  const [humanSelfQuery, creditApplicationQuery, inboxQuery] = queries;
  assert(
    queryAuditGroups[2].every(({ occurredAt }) =>
      Date.parse(occurredAt) >= Date.parse(captureBinding.inboxArmIssuedAt)
    ) &&
      Date.parse(inboxQuery.occurredAt) >=
        Date.parse(captureBinding.inboxArmIssuedAt) &&
      commandAuditGroups[4].every(({ occurredAt }) =>
        Date.parse(occurredAt) >= Date.parse(captureBinding.authorArmIssuedAt)
      ) &&
      Date.parse(authorCommand.occurredAt) >=
        Date.parse(captureBinding.authorArmIssuedAt) &&
      Date.parse(authorCommand.completedAt) >=
        Date.parse(captureBinding.authorArmIssuedAt) &&
      authorCommand.eventIds.every((eventId) => {
        const event = events.find((candidate) => candidate.eventId === eventId);
        return Date.parse(event?.occurredAt ?? "") >=
          Date.parse(captureBinding.authorArmIssuedAt);
      }),
    "expired_offer_receipt_chronology_invalid",
    "Expired-Offer PostgreSQL proof predates its normal-response arm"
  );
  const replacementEvent = events.find(({ eventId }) =>
    eventId === offer.replacementEventId
  );
  const creationEvent = events.find(({ eventId }) =>
    eventId === offer.creationEventId
  );
  const replacementPayload = replacementEvent?.payloadProjection;
  const creationPayload = creationEvent?.payloadProjection;
  assert(
    authorCommand.eventIds.length === 2 &&
      authorCommand.eventIds[0] === offer.replacementEventId &&
      authorCommand.eventIds[1] === offer.creationEventId &&
      replacementEvent?.sequence === 0 &&
      replacementEvent.eventType === "credit_offer_status_changed" &&
      replacementEvent.aggregateType === "credit_offer" &&
      replacementEvent.aggregateId === lineage.preliminaryOfferId &&
      replacementEvent.aggregateVersion === 2 &&
      replacementEvent.evidenceId === replacementEvent.eventId &&
      plainObject(replacementPayload) &&
      replacementEvent.payloadHash ===
        hashId("event_payload", replacementPayload) &&
      replacementEvent.evidencePayloadHash === replacementEvent.payloadHash &&
      replacementPayload.creditOfferId === lineage.preliminaryOfferId &&
      replacementPayload.previousStatus === "offered" &&
      replacementPayload.nextStatus === "declined" &&
      replacementPayload.replacementOfferId === offer.creditOfferId &&
      replacementPayload.reasonCode === "capital_partner_offer_authored" &&
      replacementPayload.sandboxOnly === true &&
      replacementPayload.productionFundsApproved === false &&
      creationEvent?.sequence === 1 &&
      creationEvent.eventType === "credit_offer_created" &&
      creationEvent.aggregateType === "credit_offer" &&
      creationEvent.aggregateId === offer.creditOfferId &&
      creationEvent.aggregateVersion === 1 &&
      creationEvent.evidenceId === creationEvent.eventId &&
      plainObject(creationPayload) &&
      creationEvent.payloadHash === hashId("event_payload", creationPayload) &&
      creationEvent.evidencePayloadHash === creationEvent.payloadHash &&
      creationPayload.creditOfferId === offer.creditOfferId &&
      creationPayload.creditOfferHash === offer.creditOfferHash &&
      creationPayload.termsHash === offer.termsHash &&
      creationPayload.creditIntentId === lineage.creditIntentId &&
      creationPayload.riskDecisionId === lineage.riskDecisionId &&
      creationPayload.status === "offered" &&
      creationPayload.validUntil === offer.validUntil &&
      creationPayload.sandboxOnly === true &&
      creationPayload.productionFundsApproved === false &&
      expiration.validityMs === Date.parse(offer.validUntil) -
        Date.parse(creationEvent.occurredAt),
    "expired_offer_receipt_event_invalid",
    "Expired-Offer receipt does not bind exact replacement and creation Events"
  );
  const inboxAuditTimes = queryAuditGroups[2]
    .map(({ occurredAt }) => Date.parse(occurredAt));
  const authorAuditTimes = commandAuditGroups[4]
    .map(({ occurredAt }) => Date.parse(occurredAt));
  assert(
    coveredProofAuditIds.size === auditIds.size &&
      [...auditIds].every((id) => coveredProofAuditIds.has(id)) &&
      Date.parse(consentCommand.completedAt) <=
        Date.parse(humanSelfQuery.occurredAt) &&
      Date.parse(humanSelfQuery.occurredAt) <=
        Date.parse(requestCommand.occurredAt) &&
      Date.parse(requestCommand.completedAt) <=
        Date.parse(creditApplicationQuery.occurredAt) &&
      Date.parse(creditApplicationQuery.occurredAt) <=
        Date.parse(evaluateCommand.occurredAt) &&
      Date.parse(evaluateCommand.completedAt) <=
        Date.parse(passportCommand.occurredAt) &&
      Date.parse(passportCommand.completedAt) <=
        Date.parse(captureBinding.preparationObservedAt) &&
      Date.parse(captureBinding.preparationObservedAt) <=
        Math.min(...inboxAuditTimes) &&
      Math.max(...inboxAuditTimes) === Date.parse(inboxQuery.occurredAt) &&
      inboxQuery.occurredAt === captureBinding.inboxCapturedAt &&
      Date.parse(captureBinding.inboxCapturedAt) <=
        Math.min(...authorAuditTimes) &&
      Math.max(...authorAuditTimes) <= Date.parse(authorCommand.occurredAt) &&
      Date.parse(authorCommand.occurredAt) <=
        Date.parse(authorCommand.completedAt) &&
      Date.parse(authorCommand.completedAt) <=
        Date.parse(captureBinding.authorCapturedAt) &&
      Date.parse(captureBinding.authorCapturedAt) <= Date.parse(receipt.startedAt),
    "expired_offer_receipt_chronology_invalid",
    "Expired-Offer receipt setup proofs are not in exact Human, inbox, author, baseline order"
  );

  assert(
    exactKeys(receipt.authentication, ["human", "capitalPartner"]),
    "expired_offer_receipt_authentication_invalid",
    "Expired-Offer authentication catalog is invalid"
  );
  assertReceiptAuthentication(
    receipt.authentication.human,
    binding.borrowerActorRefHash,
    auditIds,
    "Human"
  );
  assertReceiptAuthentication(
    receipt.authentication.capitalPartner,
    binding.capitalPartnerActorRefHash,
    auditIds,
    "Capital Partner"
  );
  const coveredAuditIds = new Set([
    ...receipt.authentication.human.coveredAuditEventIds,
    ...receipt.authentication.capitalPartner.coveredAuditEventIds
  ]);
  assert(
    coveredAuditIds.size === auditIds.size &&
      [...auditIds].every((id) => coveredAuditIds.has(id)),
    "expired_offer_receipt_authentication_invalid",
    "Expired-Offer SIWE proofs do not cover the exact setup audit manifest"
  );

  const resources = receipt.actorResourceBindings;
  assert(
    exactKeys(resources, ["human", "capitalPartner"]) &&
      Array.isArray(resources.human) && resources.human.length === 5 &&
      Array.isArray(resources.capitalPartner) &&
      resources.capitalPartner.length === 3,
    "expired_offer_receipt_resource_invalid",
    "Expired-Offer resource-binding catalog is invalid"
  );
  const byType = (values) => new Map(values.map((entry) => [
    entry.resourceType,
    entry
  ]));
  const humanResources = byType(resources.human);
  const partnerResources = byType(resources.capitalPartner);
  assert(humanResources.size === 5 && partnerResources.size === 3,
    "expired_offer_receipt_resource_invalid",
    "Expired-Offer resource bindings contain duplicates");
  for (const [resourceType, resourceId] of [
    ["subject", lineage.subjectId],
    ["consent", lineage.consentId],
    ["credit_intent", lineage.creditIntentId],
    ["credit_passport_artifact", lineage.passportArtifactId],
    ["credit_offer", lineage.creditOfferId]
  ]) {
    assertReceiptResource(humanResources.get(resourceType), {
      actorHash: binding.borrowerActorRefHash,
      resourceType,
      resourceId,
      relationship: "owner"
    });
  }
  for (const [resourceType, resourceId, relationship] of [
    ["capital_partner_profile", binding.capitalPartnerId, "owner"],
    ["credit_passport_artifact", lineage.passportArtifactId, "verifier"],
    ["credit_offer", lineage.creditOfferId, "owner"]
  ]) {
    assertReceiptResource(partnerResources.get(resourceType), {
      actorHash: binding.capitalPartnerActorRefHash,
      resourceType,
      resourceId,
      relationship
    });
  }

  const zero = receipt.zeroDownstreamEffects;
  assert(
    exactKeys(zero, [
      "acceptance",
      "obligations",
      "executions",
      "repayments",
      "ledgerTransactions",
      "totalRowCount"
    ]) &&
      zero.totalRowCount === 0 &&
      Object.entries(zero)
        .filter(([key]) => key !== "totalRowCount")
        .every(([, value]) => (
          exactKeys(value, ["rowCount", "manifestHash"]) &&
          value.rowCount === 0 && HASH.test(value.manifestHash ?? "")
        )),
    "expired_offer_receipt_effects_invalid",
    "Expired-Offer receipt contains a downstream economic effect"
  );
  assert(
    exactKeys(receipt.durability, [
      "canonicalPersistence",
      "rlsReadBack",
      "authorizationAuditImmutable",
      "tenantCommandExecutionsImmutable",
      "physicalOfferStatusPreservedAfterClockExpiry",
      "fixtureUsed"
    ]) &&
      receipt.durability.canonicalPersistence === "postgresql" &&
      receipt.durability.rlsReadBack === true &&
      receipt.durability.authorizationAuditImmutable === true &&
      receipt.durability.tenantCommandExecutionsImmutable === true &&
      receipt.durability.physicalOfferStatusPreservedAfterClockExpiry === true &&
      receipt.durability.fixtureUsed === expectedFixtureUsed &&
    exactKeys(receipt.safety, [
      "sandboxOnly",
      "productionFundsApproved",
      "productionFundsMoved",
      "fundsAuthority",
      "acceptanceCreated",
      "obligationCreated",
      "executionCreated",
      "repaymentCreated",
      "ledgerEffectCreated"
    ]) &&
      receipt.safety.sandboxOnly === true &&
      Object.entries(receipt.safety)
        .filter(([key]) => key !== "sandboxOnly")
        .every(([, value]) => value === false) &&
    exactKeys(receipt.redaction, [
      "containsSecrets",
      "containsRawPii",
      "containsSessionMaterial",
      "containsRawSignature",
      "containsWalletAddress",
      "containsDatabaseCredentials"
    ]) && Object.values(receipt.redaction).every((value) => value === false),
    "expired_offer_receipt_safety_invalid",
    "Expired-Offer receipt safety, durability, or redaction boundary is invalid"
  );
  assertRedactedReceiptValue(receipt);
  return receipt;
}

async function assembleM1BExpiredOfferSetupReceipt({
  client,
  readTenant,
  tenantId,
  borrowerActorId,
  capitalPartnerActorId,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  capture,
  capitalPartnerCriticalBinding,
  dependencies,
  fixtureUsed
}) {
  assert(
    ((client && typeof client.query === "function") ||
      typeof readTenant === "function") &&
      [tenantId, borrowerActorId, capitalPartnerActorId]
        .every((value) => IDENTIFIER.test(value ?? "")) &&
      borrowerActorId !== capitalPartnerActorId &&
      SHA.test(candidateReleaseId ?? "") &&
      SHA.test(sourceTreeHash ?? "") &&
      IMAGE_ID.test(runtimeImageId ?? "") &&
      iso(databaseStartedAt) === databaseStartedAt,
    "expired_offer_input_invalid",
    "Expired-Offer producer input is invalid"
  );
  const withRead = typeof readTenant === "function"
    ? readTenant
    : async (operation) => operation(client);
  const binding = assertCriticalBinding(capitalPartnerCriticalBinding, {
    candidateReleaseId,
    databaseStartedAt,
    borrowerActorId,
    capitalPartnerActorId
  });
  const safeCapture = assertCapture(capture, {
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt
  });
  assert(
    Date.parse(binding.capturedAt) < Date.parse(safeCapture.preparationObservedAt),
    "expired_offer_lineage_chronology_invalid",
    "Expired-Offer Human preparation did not begin after Capital Partner critical closure"
  );
  const readers = Object.freeze({
    authorizationResourceLocator: readM1BAuthorizationResourceLocator,
    queryProof: readM1BQueryProof,
    commandProof: readM1BCommandProof,
    preparationConsentId: readPreparationConsentId,
    preparationLineage: readPreparationLineage,
    offerPairSnapshot: readOfferPairSnapshot,
    waitForExpiry: waitForDatabaseExpiry,
    actorResourceScope: readM1BActorResourceScope,
    safeAuthentication: readM1BSafeSiweAuthentication,
    ...dependencies
  });
  const [inboxEntry, authorEntry] = safeCapture.responses;
  const inboxResponse = inspectM1BResponseOnlyOperation({
    operationId: inboxEntry.operationId,
    responseSchemaVersion: inboxEntry.responseSchemaVersion,
    response: inboxEntry.response
  }).response;
  const authorResponse = inspectM1BResponseOnlyOperation({
    operationId: authorEntry.operationId,
    responseSchemaVersion: authorEntry.responseSchemaVersion,
    response: authorEntry.response
  }).response;
  const authoredOffer = authorResponse.offer;
  assert(
    inboxResponse.serverTruth === true && inboxResponse.readOnly === true &&
      inboxResponse.fundsAuthority === false &&
      Array.isArray(inboxResponse.items) &&
      authoredOffer?.schemaVersion === "credit_offer.v2" &&
      authoredOffer.status === "offered" &&
      authoredOffer.sandboxOnly === true &&
      authoredOffer.productionFundsApproved === false &&
      authorResponse.fundsAuthority === false &&
      authoredOffer.capitalPartnerId === binding.capitalPartnerId &&
      authoredOffer.subjectId === binding.subjectId &&
      HASH.test(authoredOffer.creditOfferHash ?? "") &&
      HASH.test(authoredOffer.termsHash ?? "") &&
      IDENTIFIER.test(authoredOffer.creditOfferId ?? "") &&
      IDENTIFIER.test(authoredOffer.creditIntentId ?? "") &&
      IDENTIFIER.test(authoredOffer.riskDecisionId ?? "") &&
      IDENTIFIER.test(authoredOffer.creditPassportArtifactId ?? "") &&
      Number.isFinite(Date.parse(authoredOffer.validUntil ?? "")),
    "expired_offer_capture_lineage_invalid",
    "Captured Capital Partner response is not one safe offered v2 lineage"
  );
  const inboxMatches = inboxResponse.items.filter((item) => (
    item.resource?.resourceId === authoredOffer.creditPassportArtifactId &&
    item.reviewContext?.creditIntentId === authoredOffer.creditIntentId &&
    item.reviewContext?.artifactHash === authoredOffer.creditPassportArtifactHash &&
    item.reviewContext?.artifactVersion === authoredOffer.creditPassportArtifactVersion
  ));
  assert(
    inboxMatches.length === 1,
    "expired_offer_capture_lineage_invalid",
    "Captured Offer is not bound to one exact current Passport inbox item"
  );

  const inboxResource = await withRead((databaseClient) =>
    readers.authorizationResourceLocator(databaseClient, {
      tenantId,
      actorId: capitalPartnerActorId,
      operationId: inboxEntry.operationId,
      requestId: inboxEntry.requestId,
      correlationId: inboxEntry.correlationId
    })
  );
  const inboxProof = await withRead((databaseClient) =>
    readers.queryProof(databaseClient, {
      tenantId,
      actorId: capitalPartnerActorId,
      operationId: inboxEntry.operationId,
      requestId: inboxEntry.requestId,
      correlationId: inboxEntry.correlationId,
      ...inboxResource,
      responseSchemaVersion: inboxEntry.responseSchemaVersion,
      response: inboxEntry.response,
      capturedAt: inboxEntry.capturedAt
    })
  );
  const authorResource = await withRead((databaseClient) =>
    readers.authorizationResourceLocator(databaseClient, {
      tenantId,
      actorId: capitalPartnerActorId,
      operationId: authorEntry.operationId,
      requestId: authorEntry.requestId,
      correlationId: authorEntry.correlationId
    })
  );
  const authorProof = await withRead((databaseClient) =>
    readers.commandProof(databaseClient, {
      tenantId,
      actorId: capitalPartnerActorId,
      operationId: authorEntry.operationId,
      requestId: authorEntry.requestId,
      correlationId: authorEntry.correlationId,
      ...authorResource,
      responseSchemaVersion: authorEntry.responseSchemaVersion,
      safeResponse: authorResponse,
      capturedRawResponseHash: authorEntry.rawResponseHash,
      capturedAt: authorEntry.capturedAt
    })
  );
  const [replacementEvent, createdEvent] = authorProof.eventManifest;
  assert(
    authorProof.eventManifest.length === 2 &&
      authorProof.resourceType === "credit_passport_artifact" &&
      authorProof.resourceId === authoredOffer.creditPassportArtifactId &&
      replacementEvent.sequence === 0 &&
      replacementEvent.eventType === "credit_offer_status_changed" &&
      replacementEvent.aggregateType === "credit_offer" &&
      replacementEvent.aggregateVersion === 2 &&
      replacementEvent.payloadProjection?.creditOfferId ===
        replacementEvent.aggregateId &&
      replacementEvent.payloadProjection?.previousStatus === "offered" &&
      replacementEvent.payloadProjection?.nextStatus === "declined" &&
      replacementEvent.payloadProjection?.replacementOfferId ===
        authoredOffer.creditOfferId &&
      replacementEvent.payloadProjection?.reasonCode ===
        "capital_partner_offer_authored" &&
      replacementEvent.payloadProjection?.sandboxOnly === true &&
      replacementEvent.payloadProjection?.productionFundsApproved === false &&
      createdEvent.sequence === 1 &&
      createdEvent.eventType === "credit_offer_created" &&
      createdEvent.aggregateType === "credit_offer" &&
      createdEvent.aggregateId === authoredOffer.creditOfferId &&
      createdEvent.aggregateVersion === 1 &&
      createdEvent.payloadProjection?.creditOfferId === authoredOffer.creditOfferId &&
      createdEvent.payloadProjection?.creditOfferHash ===
        authoredOffer.creditOfferHash &&
      createdEvent.payloadProjection?.termsHash === authoredOffer.termsHash &&
      createdEvent.payloadProjection?.creditIntentId ===
        authoredOffer.creditIntentId &&
      createdEvent.payloadProjection?.riskDecisionId ===
        authoredOffer.riskDecisionId &&
      createdEvent.payloadProjection?.status === "offered" &&
      createdEvent.payloadProjection?.validUntil === authoredOffer.validUntil &&
      createdEvent.payloadProjection?.sandboxOnly === true &&
      createdEvent.payloadProjection?.productionFundsApproved === false,
    "expired_offer_author_manifest_invalid",
    "Expired-Offer author command does not bind exact replacement and creation Events"
  );
  const preliminaryOfferId = replacementEvent.payloadProjection.creditOfferId;
  const consentId = await withRead((databaseClient) =>
    readers.preparationConsentId(databaseClient, {
      tenantId,
      subjectId: authoredOffer.subjectId,
      creditIntentId: authoredOffer.creditIntentId
    })
  );
  const preparation = await withRead((databaseClient) =>
    readers.preparationLineage(databaseClient, {
      tenantId,
      borrowerActorId,
      capitalPartnerActorId,
      capitalPartnerId: binding.capitalPartnerId,
      subjectId: authoredOffer.subjectId,
      consentId,
      creditIntentId: authoredOffer.creditIntentId,
      riskDecisionId: authoredOffer.riskDecisionId,
      preliminaryOfferId,
      passportArtifactId: authoredOffer.creditPassportArtifactId,
      authoredOfferId: authoredOffer.creditOfferId,
      windowStartedAt: binding.capturedAt,
      preparationObservedAt: safeCapture.preparationObservedAt
    })
  );
  assert(
    preparation.row.passportArtifactHash ===
      authoredOffer.creditPassportArtifactHash &&
      preparation.row.passportArtifactVersion ===
        authoredOffer.creditPassportArtifactVersion &&
      preparation.row.authoredOfferHash === authoredOffer.creditOfferHash &&
      preparation.row.authoredTermsHash === authoredOffer.termsHash,
    "expired_offer_lineage_invalid",
    "DB Passport and authored Offer C do not match the captured Capital Partner response"
  );
  const lastPreparationCommand = preparation.commandReceipts.at(-1);
  const inboxAuditTimes = inboxProof.authorizationAudits
    .map(({ occurredAt }) => Date.parse(occurredAt));
  const authorAuditTimes = authorProof.authorizationAudits
    .map(({ occurredAt }) => Date.parse(occurredAt));
  const primaryAuthorAudit = authorProof.authorizationAudits.find(({ eventId }) =>
    eventId === authorProof.authorizationAuditEventId
  );
  assert(
    lastPreparationCommand?.operationId === "pilotCreateCreditPassportArtifact" &&
      inboxAuditTimes.length === 2 && inboxAuditTimes.every(Number.isFinite) &&
      authorAuditTimes.length === 2 && authorAuditTimes.every(Number.isFinite) &&
      primaryAuthorAudit?.authorizationDecisionId ===
        authorProof.authorizationDecisionId &&
      Date.parse(lastPreparationCommand.completedAt) <=
        Date.parse(safeCapture.preparationObservedAt) &&
      Date.parse(safeCapture.preparationObservedAt) <=
        Math.min(...inboxAuditTimes) &&
      Math.min(...inboxAuditTimes) >= Date.parse(inboxEntry.armIssuedAt) &&
      Math.max(...inboxAuditTimes) <= Date.parse(inboxProof.occurredAt) &&
      inboxProof.occurredAt === inboxEntry.capturedAt &&
      Date.parse(inboxEntry.capturedAt) <= Math.min(...authorAuditTimes) &&
      Math.min(...authorAuditTimes) >= Date.parse(authorEntry.armIssuedAt) &&
      Math.max(...authorAuditTimes) <= Date.parse(authorProof.occurredAt) &&
      primaryAuthorAudit.occurredAt === authorProof.occurredAt &&
      Date.parse(authorProof.occurredAt) <= Date.parse(authorProof.completedAt) &&
      Date.parse(authorProof.completedAt) <= Date.parse(authorEntry.capturedAt) &&
      authorProof.eventManifest.every(({ occurredAt }) =>
        Date.parse(occurredAt) >= Date.parse(authorEntry.armIssuedAt)
      ),
    "expired_offer_lineage_chronology_invalid",
    "Expired-Offer durable Human, inbox, author, and capture proofs are out of order"
  );
  const lineageIds = [
    consentId,
    authoredOffer.creditIntentId,
    authoredOffer.riskDecisionId,
    authoredOffer.creditPassportArtifactId,
    preliminaryOfferId,
    authoredOffer.creditOfferId
  ];
  const previousIds = [binding.currentLineage, binding.withdrawalLineage]
    .flatMap((lineage) => [
      lineage.consentId,
      lineage.creditIntentId,
      lineage.riskDecisionId,
      lineage.passportArtifactId,
      lineage.preliminaryOfferId,
      lineage.creditOfferId
    ]);
  assert(
    new Set(lineageIds).size === lineageIds.length &&
      lineageIds.every((id) => !previousIds.includes(id)),
    "expired_offer_lineage_not_fresh",
    "Expired-Offer lineage C is not distinct from critical lineages A and B"
  );
  const validityMs = Date.parse(authoredOffer.validUntil) -
    Date.parse(createdEvent.occurredAt);
  assert(
    Number.isSafeInteger(validityMs) &&
      validityMs >= MIN_VALIDITY_MS && validityMs <= MAX_VALIDITY_MS,
    "expired_offer_validity_window_invalid",
    "Expired-Offer validity must be 90-120 seconds from the PostgreSQL Event clock"
  );

  const snapshotInput = {
    tenantId,
    currentOfferId: binding.currentLineage.creditOfferId,
    expiredOfferId: authoredOffer.creditOfferId,
    databaseStartedAt
  };
  const before = await withRead((databaseClient) =>
    readers.offerPairSnapshot(databaseClient, snapshotInput)
  );
  assert(
    before.databaseStartedAt === databaseStartedAt &&
      Date.parse(authorEntry.capturedAt) <= Date.parse(before.observedAt) &&
      Date.parse(before.observedAt) < Date.parse(authoredOffer.validUntil),
    "expired_offer_baseline_invalid",
    "Expired-Offer baseline was not captured before PostgreSQL expiry"
  );
  const currentBefore = before.current.projection;
  const expiredBefore = before.expired.projection;
  const expiredOfferManifest = before.expired.state.manifest.offer;
  assert(
    currentBefore.offerHash === binding.currentLineage.creditOfferHash &&
      currentBefore.termsHash === binding.currentLineage.termsHash &&
      currentBefore.aggregateVersion === binding.currentLineage.aggregateVersion &&
      currentBefore.status === "offered" &&
      expiredBefore.offerHash === authoredOffer.creditOfferHash &&
      expiredBefore.termsHash === authoredOffer.termsHash &&
      expiredBefore.aggregateVersion === 1 &&
      expiredBefore.status === "offered" &&
      expiredBefore.validUntil === iso(authoredOffer.validUntil) &&
      expiredBefore.acceptedAt === null &&
      expiredBefore.acceptanceRefHash === null &&
      expiredBefore.closedAt === null &&
      expiredOfferManifest.subjectRefHash ===
        operationalRefHash("subject", authoredOffer.subjectId) &&
      expiredOfferManifest.creditIntentRefHash ===
        operationalRefHash("credit_intent", authoredOffer.creditIntentId) &&
      expiredOfferManifest.capitalPartnerRefHash ===
        operationalRefHash("capital_partner", binding.capitalPartnerId) &&
      expiredOfferManifest.capitalPartnerOperatorRefHash ===
        operationalRefHash("actor", capitalPartnerActorId),
    "expired_offer_baseline_invalid",
    "Baseline does not match exact current A and unaccepted C Offers"
  );
  const currentRelated = assertZeroRelatedEffects(
    before.current.state,
    "expired_offer_current_state_invalid"
  );
  assertZeroRelatedEffects(
    before.expired.state,
    "expired_offer_baseline_invalid"
  );
  const capitalPartnerResources = await withRead((databaseClient) =>
    readers.actorResourceScope(databaseClient, {
      tenantId,
      actorId: capitalPartnerActorId,
      resources: [
        ["capital_partner_profile", binding.capitalPartnerId],
        ["credit_passport_artifact", authoredOffer.creditPassportArtifactId],
        ["credit_offer", authoredOffer.creditOfferId]
      ]
    })
  );
  const borrowerOfferResource = await withRead((databaseClient) =>
    readers.actorResourceScope(databaseClient, {
      tenantId,
      actorId: borrowerActorId,
      resources: [["credit_offer", authoredOffer.creditOfferId]]
    })
  );
  const humanResourceSet = [...preparation.humanResources, ...borrowerOfferResource];
  const capitalPartnerRelationships = new Map(
    capitalPartnerResources.map((resource) => [
      resource.resourceType,
      resource.bindingRelationship
    ])
  );
  assert(
    humanResourceSet.length === 5 &&
      humanResourceSet.every((resource) => (
        resource.actorRefHash === binding.borrowerActorRefHash &&
        resource.bindingRelationship === "owner"
      )) &&
      capitalPartnerResources.length === 3 &&
      capitalPartnerResources.every((resource) => (
        resource.actorRefHash === binding.capitalPartnerActorRefHash
      )) &&
      capitalPartnerRelationships.get("capital_partner_profile") === "owner" &&
      capitalPartnerRelationships.get("credit_passport_artifact") === "verifier" &&
      capitalPartnerRelationships.get("credit_offer") === "owner",
    "expired_offer_resource_binding_invalid",
    "Expired-Offer setup does not preserve exact Human-owner and Capital Partner owner/verifier bindings"
  );
  const humanAuditIds = auditEntries([
    ...preparation.commandReceipts,
    ...preparation.queryObservations
  ]).map(({ eventId }) => eventId);
  const capitalPartnerAuditIds = auditEntries([
    inboxProof,
    authorProof
  ]).map(({ eventId }) => eventId);
  const humanAuthentication = await withRead((databaseClient) =>
    readers.safeAuthentication(databaseClient, {
      tenantId,
      actorId: borrowerActorId,
      auditEventIds: humanAuditIds,
      databaseStartedAt
    })
  );
  const capitalPartnerAuthentication = await withRead((databaseClient) =>
    readers.safeAuthentication(databaseClient, {
      tenantId,
      actorId: capitalPartnerActorId,
      auditEventIds: capitalPartnerAuditIds,
      databaseStartedAt
    })
  );
  assert(
    humanAuthentication.actorRefHash === binding.borrowerActorRefHash &&
      capitalPartnerAuthentication.actorRefHash ===
        binding.capitalPartnerActorRefHash &&
      humanAuthentication.method === "siwe" &&
      capitalPartnerAuthentication.method === "siwe" &&
      humanAuthentication.amr?.[0] === "wallet" &&
      humanAuthentication.amr?.[1] === "siwe" &&
      capitalPartnerAuthentication.amr?.[0] === "wallet" &&
      capitalPartnerAuthentication.amr?.[1] === "siwe",
    "expired_offer_authentication_invalid",
    "Expired-Offer setup does not bind real invited-wallet SIWE actors"
  );
  const wait = await withRead((databaseClient) =>
    readers.waitForExpiry(databaseClient, {
      validUntil: authoredOffer.validUntil,
      databaseStartedAt
    })
  );
  const after = await withRead((databaseClient) =>
    readers.offerPairSnapshot(databaseClient, snapshotInput)
  );
  assert(
    wait.databaseStartedAt === databaseStartedAt &&
      after.databaseStartedAt === databaseStartedAt &&
      Date.parse(wait.expiredObservedAt) >= Date.parse(authoredOffer.validUntil) &&
      Date.parse(after.observedAt) >= Date.parse(wait.expiredObservedAt),
    "expired_offer_expiry_invalid",
    "Expired-Offer final observation does not use the retained PostgreSQL clock"
  );
  const currentAfter = after.current.projection;
  const expiredAfter = after.expired.projection;
  const zeroEffects = assertZeroRelatedEffects(
    after.expired.state,
    "expired_offer_effects_invalid"
  );
  assert(
    before.current.state.manifestHash === after.current.state.manifestHash &&
      hashM1BAcceptanceManifest(currentBefore) ===
        hashM1BAcceptanceManifest(currentAfter) &&
      before.expired.state.manifestHash === after.expired.state.manifestHash &&
      hashM1BAcceptanceManifest(expiredBefore) ===
        hashM1BAcceptanceManifest(expiredAfter) &&
      hashM1BAcceptanceManifest(currentRelated) ===
        hashM1BAcceptanceManifest(assertZeroRelatedEffects(
          after.current.state,
          "expired_offer_current_state_invalid"
        )) &&
      expiredAfter.status === "offered" &&
      expiredAfter.aggregateVersion === 1 &&
      expiredAfter.validUntil === iso(authoredOffer.validUntil) &&
      expiredAfter.acceptedAt === null &&
      expiredAfter.acceptanceRefHash === null &&
      expiredAfter.closedAt === null,
    "expired_offer_state_changed",
    "Current Offer A or expired physical Offer C changed during the expiry wait"
  );

  const commandProofs = [...preparation.commandReceipts, authorProof];
  const queryProofs = [...preparation.queryObservations, inboxProof];
  const events = uniqueBy(
    commandProofs.flatMap(({ eventManifest }) => eventManifest),
    "eventId"
  );
  const audits = auditEntries([...commandProofs, ...queryProofs]);
  const projections = projectionEntries([
    ...preparation.projections,
    before.current.projectionProof,
    before.expired.projectionProof,
    after.current.projectionProof,
    after.expired.projectionProof
  ]);
  const commandManifest = manifest(commandProofs.map(commandEntry));
  const queryManifest = manifest(queryProofs.map(queryEntry));
  const eventManifest = manifest(events);
  const auditManifest = manifest(audits);
  const projectionManifest = manifest(projections);
  const capturedAt = iso(after.observedAt);
  const receipt = Object.freeze({
    schemaVersion: "m1_b_expired_offer_setup_receipt.v1",
    artifactId: "expired_offer_setup",
    status: "passed",
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    sourceRuntime: "local_exact_commit",
    databaseStartedAt,
    startedAt: iso(before.observedAt),
    capturedAt,
    postRestartVerification: true,
    criticalReceiptBinding: Object.freeze(structuredClone(binding)),
    captureBinding: Object.freeze({
      schemaVersion: safeCapture.schemaVersion,
      captureHash: hashM1BAcceptanceManifest(safeCapture),
      preparationObservedAt: safeCapture.preparationObservedAt,
      inboxArmIssuedAt: safeCapture.responses[0].armIssuedAt,
      inboxCapturedAt: safeCapture.responses[0].capturedAt,
      authorArmIssuedAt: safeCapture.responses[1].armIssuedAt,
      authorCapturedAt: safeCapture.responses[1].capturedAt,
      armClockDomain: M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN,
      capturedAt: safeCapture.capturedAt,
      responseCount: safeCapture.responses.length,
      responseOnly: true
    }),
    authentication: Object.freeze({
      human: humanAuthentication,
      capitalPartner: capitalPartnerAuthentication
    }),
    actorResourceBindings: Object.freeze({
      human: Object.freeze(humanResourceSet),
      capitalPartner: capitalPartnerResources
    }),
    lineage: Object.freeze({
      lineageId: "C",
      subjectId: authoredOffer.subjectId,
      consentId,
      creditIntentId: authoredOffer.creditIntentId,
      riskDecisionId: authoredOffer.riskDecisionId,
      preliminaryOfferId,
      passportArtifactId: authoredOffer.creditPassportArtifactId,
      creditOfferId: authoredOffer.creditOfferId,
      sameHumanSubjectAsCriticalA: true,
      sameCapitalPartnerAsCriticalA: true,
      distinctFromCriticalAAndB: true,
      retainedLineageHashes: preparation.row,
      consent: Object.freeze({
        consentId,
        consentHash: preparation.row.consentHash,
        status: "active",
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: "consent_record.v1"
      }),
      creditIntent: Object.freeze({
        creditIntentId: authoredOffer.creditIntentId,
        intentHash: preparation.row.intentHash,
        authorityType: "consent",
        authorityRef: consentId,
        status: "decided",
        sandboxOnly: true,
        productionFundsRequested: false,
        schemaVersion: "credit_intent.v1"
      }),
      riskDecision: Object.freeze({
        riskDecisionId: authoredOffer.riskDecisionId,
        decisionHash: preparation.row.decisionHash,
        consentId,
        sandboxOnly: true,
        productionAuthority: false
      }),
      preliminaryOffer: Object.freeze({
        creditOfferId: preliminaryOfferId,
        creditOfferHash: preparation.row.preliminaryOfferHash,
        termsHash: preparation.row.preliminaryTermsHash,
        status: "declined",
        replacementOfferId: authoredOffer.creditOfferId,
        schemaVersion: "credit_offer.v1"
      }),
      passport: Object.freeze({
        artifactId: authoredOffer.creditPassportArtifactId,
        artifactHash: preparation.row.passportArtifactHash,
        artifactVersion: preparation.row.passportArtifactVersion,
        controllerActorRefHash: preparation.row.passportControllerRefHash,
        verifierActorRefHash: preparation.row.passportVerifierRefHash,
        status: "active",
        purpose: "private_credit_review",
        verifierBindingRelationship: "verifier",
        sandboxOnly: true,
        productionAuthority: false,
        piiIncluded: false,
        rawTransactionDataIncluded: false,
        scoreAuthoritative: false,
        schemaVersion: "credit_passport_artifact.v1"
      })
    }),
    offer: Object.freeze({
      creditOfferId: authoredOffer.creditOfferId,
      creditOfferHash: authoredOffer.creditOfferHash,
      termsHash: authoredOffer.termsHash,
      schemaVersion: "credit_offer.v2",
      physicalStatus: "offered",
      aggregateVersion: expiredAfter.aggregateVersion,
      validUntil: expiredAfter.validUntil,
      replacementEventId: replacementEvent.eventId,
      creationEventId: createdEvent.eventId,
      sandboxOnly: true,
      productionFundsApproved: false
    }),
    expiration: Object.freeze({
      clockSource: "postgresql_clock_timestamp",
      validityMs,
      baselineObservedAt: iso(before.observedAt),
      waitStartedAt: iso(wait.waitStartedAt),
      expiredObservedAt: iso(wait.expiredObservedAt),
      finalObservedAt: capturedAt,
      physicalStatusBefore: expiredBefore.status,
      physicalStatusAfter: expiredAfter.status,
      protectedStateBeforeHash: before.expired.state.manifestHash,
      protectedStateAfterHash: after.expired.state.manifestHash,
      projectionBeforeHash: hashM1BAcceptanceManifest(expiredBefore),
      projectionAfterHash: hashM1BAcceptanceManifest(expiredAfter),
      databaseRestarted: false
    }),
    currentOfferInvariant: Object.freeze({
      creditOfferId: binding.currentLineage.creditOfferId,
      creditOfferHash: currentAfter.offerHash,
      termsHash: currentAfter.termsHash,
      aggregateVersion: currentAfter.aggregateVersion,
      status: currentAfter.status,
      protectedStateBeforeHash: before.current.state.manifestHash,
      protectedStateAfterHash: after.current.state.manifestHash,
      projectionBeforeHash: hashM1BAcceptanceManifest(currentBefore),
      projectionAfterHash: hashM1BAcceptanceManifest(currentAfter),
      unchanged: true
    }),
    setupManifests: Object.freeze({
      commands: commandManifest,
      queries: queryManifest,
      events: eventManifest,
      authorizationAudits: auditManifest,
      projections: projectionManifest
    }),
    zeroDownstreamEffects: Object.freeze({
      ...zeroEffects,
      totalRowCount: Object.values(zeroEffects)
        .reduce((total, entry) => total + entry.rowCount, 0)
    }),
    durability: Object.freeze({
      canonicalPersistence: "postgresql",
      rlsReadBack: true,
      authorizationAuditImmutable: true,
      tenantCommandExecutionsImmutable: true,
      physicalOfferStatusPreservedAfterClockExpiry: true,
      fixtureUsed
    }),
    safety: Object.freeze({
      sandboxOnly: true,
      productionFundsApproved: false,
      productionFundsMoved: false,
      fundsAuthority: false,
      acceptanceCreated: false,
      obligationCreated: false,
      executionCreated: false,
      repaymentCreated: false,
      ledgerEffectCreated: false
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
  validateM1BExpiredOfferSetupReceipt(receipt, {
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId,
    databaseStartedAt,
    capitalPartnerCriticalArtifact: {
      id: binding.artifactId,
      sha256: binding.sha256
    },
    expectedFixtureUsed: fixtureUsed
  });
  return receipt;
}

export async function produceM1BExpiredOfferSetupReceipt(input) {
  assert(
    !Object.hasOwn(input ?? {}, "dependencies") &&
      !Object.hasOwn(input ?? {}, "client") &&
      !Object.hasOwn(input ?? {}, "readTenant") &&
      input?.pool && typeof input.pool.connect === "function" &&
      plainObject(input.tenantContext),
    "expired_offer_dependency_override_forbidden",
    "Production expired-Offer Evidence requires the app-role pool and cannot override trusted readers or clock wait"
  );
  return assembleM1BExpiredOfferSetupReceipt({
    ...input,
    readTenant: (operation) => withM1BAcceptanceTenantRead(
      input.pool,
      input.tenantContext,
      operation
    ),
    dependencies: {},
    fixtureUsed: false
  });
}

export async function produceM1BExpiredOfferSetupFixtureReceiptForTest(input) {
  return assembleM1BExpiredOfferSetupReceipt({
    ...input,
    dependencies: input.dependencies ?? {},
    fixtureUsed: true
  });
}

export const M1_B_EXPIRED_OFFER_SETUP_LIMITS = Object.freeze({
  minimumValidityMs: MIN_VALIDITY_MS,
  maximumValidityMs: MAX_VALIDITY_MS,
  maximumExpiryWaitMs: MAX_EXPIRY_WAIT_MS
});
