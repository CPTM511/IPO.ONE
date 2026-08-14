import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { assertTenantProtocolRequest } from "../../../packages/api-contract/src/tenant-protocol.js";
import { hashId } from "../../../packages/domain/src/index.js";
import { AUTHORIZATION_POLICY_VERSION } from "../../../modules/authorization/src/index.js";
import { createTenantSecurityContext } from "../../../modules/persistence/src/index.js";
import {
  hashM1BAcceptanceManifest,
  projectM1BSafeResponse
} from "./m1-b-human-capital-partner-acceptance.js";
import {
  createM1BAcceptanceAppPool,
  M1_B_ACCEPTANCE_SECRET_MOUNT,
  withM1BAcceptanceTenantRead
} from "./m1-b-acceptance-postgres.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,511}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const MAX_LINE_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024;
const LIVE_CASES = new Set([
  "human:expired_offer",
  "human:unauthorized_subject",
  "authorization:cross_role_private_read"
]);
const LIVE_CASE_EXPECTATIONS = Object.freeze({
  "human:expired_offer": Object.freeze({
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    expectedReasonCode: "live_policy_rejected",
    command: true
  }),
  "human:unauthorized_subject": Object.freeze({
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    expectedReasonCode: "resource_access_denied",
    command: true
  }),
  "authorization:cross_role_private_read": Object.freeze({
    operationId: "pilotReadOwnObligation",
    resourceType: "obligation",
    expectedReasonCode: "actor_capability_rejected",
    command: false
  })
});

function assert(condition, code, message) {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function sha256Json(value) {
  return `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function liveCase(group, id) {
  const caseKey = `${group}:${id}`;
  const expectation = LIVE_CASE_EXPECTATIONS[caseKey];
  assert(
    expectation && LIVE_CASES.has(caseKey),
    "operational_live_negative_case_invalid",
    "Live negative case is not in the exact closed registry"
  );
  return Object.freeze({
    definition: Object.freeze({ group, id }),
    expectation
  });
}

function credentialFreeDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    assert(
      false,
      "operational_live_negative_database_invalid",
      "Live negative database endpoint is invalid"
    );
  }
  assert(
    new Set(["postgres:", "postgresql:"]).has(parsed.protocol) &&
      parsed.username === "" && parsed.password === "" &&
      parsed.hostname.length > 0 && parsed.pathname.length > 1,
    "operational_live_negative_database_invalid",
    "Live negative database endpoint must be credential-free"
  );
  return parsed.toString();
}

function candidateContext({ candidateReleaseId, sourceTreeHash, runtimeImageId }) {
  assert(
    SHA.test(candidateReleaseId ?? "") &&
      SHA.test(sourceTreeHash ?? "") &&
      IMAGE_ID.test(runtimeImageId ?? ""),
    "operational_live_negative_candidate_invalid",
    "Exact candidate SHA, tree, and runtime image are required"
  );
  return Object.freeze({ candidateReleaseId, sourceTreeHash, runtimeImageId });
}

class LiveNegativeOperatorNdjson {
  constructor(input, errorOutput) {
    assert(
      input && typeof input.on === "function" &&
        errorOutput && typeof errorOutput.write === "function",
      "operational_live_negative_operator_invalid",
      "Bounded operator input and prompt output are required"
    );
    this.lines = createInterface({
      input,
      crlfDelay: Infinity,
      terminal: false,
      historySize: 0
    })[Symbol.asyncIterator]();
    this.errorOutput = errorOutput;
    this.totalBytes = 0;
  }

  prompt(value) {
    this.errorOutput.write(`${JSON.stringify(value)}\n`);
  }

  async nextLine() {
    const next = await this.lines.next();
    assert(
      next.done !== true,
      "operational_live_negative_operator_ended",
      "Operator input ended before the live denial was captured"
    );
    const bytes = Buffer.byteLength(next.value, "utf8");
    this.totalBytes += bytes;
    assert(
      bytes > 0 && bytes <= MAX_LINE_BYTES && this.totalBytes <= MAX_INPUT_BYTES,
      "operational_live_negative_operator_too_large",
      "Operator input exceeds the bounded live-negative limit"
    );
    return next.value;
  }
}

function iso(value, name) {
  assert(
    typeof value === "string" || value instanceof Date,
    "operational_live_negative_timestamp_invalid",
    `${name} is missing`
  );
  const timestamp = new Date(value);
  assert(
    Number.isFinite(timestamp.getTime()),
    "operational_live_negative_timestamp_invalid",
    `${name} is invalid`
  );
  return timestamp.toISOString();
}

function safeCount(value, name) {
  const count = Number(value);
  assert(
    Number.isSafeInteger(count) && count >= 0,
    "operational_live_negative_state_invalid",
    `${name} is invalid`
  );
  return count;
}

function requestToken(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function normalizedRow(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizedRow);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizedRow(nested)])
    );
  }
  return value;
}

async function manifestRows(client, text, values, project, name) {
  const result = await client.query(text, values);
  const rows = result.rows.map((row) => normalizedRow(project(row)));
  assert(
    rows.every((row) => row && typeof row === "object" && !Array.isArray(row)),
    "operational_live_negative_state_invalid",
    `${name} projection is invalid`
  );
  return Object.freeze({
    rowCount: result.rowCount,
    manifestHash: hashM1BAcceptanceManifest(rows)
  });
}

function refHash(kind, value) {
  assert(
    IDENTIFIER.test(value ?? ""),
    "operational_live_negative_state_invalid",
    `${kind} reference is invalid`
  );
  return hashId(`m1_b_operational_${kind}_reference`, { value });
}

function assertLiveCaseTargetState(definition, attempt, state, capturedAt) {
  const caseKey = `${definition.group}:${definition.id}`;
  const manifest = state?.manifest;
  if (attempt.resourceType === "credit_offer") {
    const offer = manifest?.offer;
    const related = manifest?.related;
    const targetIsExact = offer?.creditOfferRefHash ===
      refHash("credit_offer", attempt.resourceId);
    const noEconomicEffects = related && Object.values(related).every(
      (entry) => entry?.rowCount === 0 && HASH.test(entry?.manifestHash ?? "")
    );
    const validUntil = Date.parse(offer?.validUntil ?? "");
    assert(
      manifest?.catalogVersion === "m1_b_operational_offer_protected_state.v2" &&
        targetIsExact && offer.status === "offered" &&
        noEconomicEffects && Number.isFinite(validUntil) &&
        (caseKey === "human:expired_offer"
          ? validUntil <= Date.parse(capturedAt)
          : validUntil > Date.parse(capturedAt)),
      "operational_live_negative_case_state_invalid",
      "Live denied Offer does not satisfy its exact unaccepted case boundary"
    );
    return;
  }
  assert(
    caseKey === "authorization:cross_role_private_read" &&
      manifest?.catalogVersion ===
        "m1_b_operational_obligation_protected_state.v2" &&
      manifest.obligationRefHash === refHash("obligation", attempt.resourceId),
    "operational_live_negative_case_state_invalid",
    "Cross-role denial does not bind the exact protected Obligation"
  );
}

export function deriveM1BOperationalRepositoryIdempotencyKey({
  tenantId,
  actorId,
  clientId,
  operationId,
  idempotencyKey
}) {
  for (const value of [tenantId, actorId, clientId, operationId]) {
    assert(
      IDENTIFIER.test(value ?? ""),
      "operational_live_negative_attempt_invalid",
      "Command attempt identity is invalid"
    );
  }
  assert(
    REQUEST_IDENTIFIER.test(idempotencyKey ?? ""),
    "operational_live_negative_attempt_invalid",
    "Command idempotency key is invalid"
  );
  const clientIdempotencyHash = hashId("tenant_command_client_idempotency", {
    tenantId,
    actorId,
    clientId,
    operationId,
    idempotencyKey
  });
  return hashId("tenant_command_repository_idempotency", {
    tenantId,
    actorId,
    clientId,
    operationId,
    clientIdempotencyHash
  });
}

export async function readM1BOperationalLiveClientId(client, {
  tenantId,
  actorId,
  authentication
}) {
  const auditEventIds = authentication?.coveredAuditEventIds;
  assert(
    IDENTIFIER.test(tenantId ?? "") &&
    IDENTIFIER.test(actorId ?? "") &&
    Array.isArray(auditEventIds) && auditEventIds.length >= 2 &&
    auditEventIds.every((id) => IDENTIFIER.test(id ?? "")) &&
    HASH.test(authentication.clientRefHash ?? ""),
    "operational_live_negative_client_invalid",
    "Critical SIWE client binding is invalid"
  );
  const result = await client.query(
    `SELECT a.id AS audit_event_id, min(s.client_id) AS client_id,
            count(s.*)::int AS session_match_count
       FROM authorization_audit_events a
       JOIN authentication_sessions s
         ON s.tenant_id = a.tenant_id AND s.actor_id = a.actor_id
        AND s.token_jti_ref_hash = a.token_jti_hash
      WHERE a.tenant_id = $1 AND a.actor_id = $2
        AND a.id = ANY($3::text[])
      GROUP BY a.id
      ORDER BY a.id`,
    [tenantId, actorId, auditEventIds]
  );
  const clientIds = new Set(result.rows.map(({ client_id: clientId }) => clientId));
  const clientId = result.rows[0]?.client_id;
  assert(
    result.rowCount === auditEventIds.length &&
    result.rows.every(({ session_match_count: count }) => Number(count) === 1) &&
    clientIds.size === 1 &&
    IDENTIFIER.test(clientId ?? "") &&
    hashId("m1_b_acceptance_client_reference", { clientId }) ===
      authentication.clientRefHash,
    "operational_live_negative_client_invalid",
    "Live negative does not bind the exact critical SIWE client"
  );
  return clientId;
}

export async function readM1BOperationalOfferProtectedState(client, {
  tenantId,
  creditOfferId
}) {
  const offer = await client.query(
    `SELECT id, offer_hash, terms_hash, disclosure_ref, status, schema_version,
            credit_intent_id, subject_id, valid_until, accepted_at,
            acceptance_id, capital_partner_id, capital_partner_operator_id,
            superseding_offer_id, closed_at, sandbox_only,
            production_funds_approved
       FROM credit_offers
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, creditOfferId]
  );
  assert(
    offer.rowCount === 1 &&
    HASH.test(offer.rows[0].offer_hash ?? "") &&
    HASH.test(offer.rows[0].terms_hash ?? "") &&
    IDENTIFIER.test(offer.rows[0].disclosure_ref ?? "") &&
    offer.rows[0].sandbox_only === true &&
    offer.rows[0].production_funds_approved === false,
    "operational_live_negative_state_invalid",
    "Exact protected Offer is unavailable"
  );
  const row = offer.rows[0];
  const offerProjection = Object.freeze({
    creditOfferRefHash: refHash("credit_offer", row.id),
    offerHash: row.offer_hash,
    termsHash: row.terms_hash,
    disclosureRef: row.disclosure_ref,
    status: row.status,
    schemaVersion: row.schema_version,
    creditIntentRefHash: refHash("credit_intent", row.credit_intent_id),
    subjectRefHash: refHash("subject", row.subject_id),
    validUntil: iso(row.valid_until, "Offer validUntil"),
    acceptedAt: row.accepted_at === null ? null : iso(row.accepted_at, "Offer acceptedAt"),
    acceptanceRefHash: row.acceptance_id === null
      ? null
      : refHash("acceptance", row.acceptance_id),
    capitalPartnerRefHash: row.capital_partner_id === null
      ? null
      : refHash("capital_partner", row.capital_partner_id),
    capitalPartnerOperatorRefHash: row.capital_partner_operator_id === null
      ? null
      : refHash("actor", row.capital_partner_operator_id),
    supersedingOfferRefHash: row.superseding_offer_id === null
      ? null
      : refHash("credit_offer", row.superseding_offer_id),
    closedAt: row.closed_at === null ? null : iso(row.closed_at, "Offer closedAt"),
    sandboxOnly: true,
    productionFundsApproved: false
  });
  const values = [tenantId, creditOfferId];
  const related = Object.freeze({
    acceptance: await manifestRows(
      client,
      `SELECT id, acceptance_hash, credit_offer_hash, terms_hash, accepted_at,
              sandbox_only, production_authority, schema_version
         FROM credit_offer_acceptances
        WHERE tenant_id = $1 AND credit_offer_id = $2 ORDER BY id`,
      values,
      (entry) => ({
        acceptanceRefHash: refHash("acceptance", entry.id),
        acceptanceHash: entry.acceptance_hash,
        creditOfferHash: entry.credit_offer_hash,
        termsHash: entry.terms_hash,
        acceptedAt: iso(entry.accepted_at, "acceptance acceptedAt"),
        sandboxOnly: entry.sandbox_only,
        productionAuthority: entry.production_authority,
        schemaVersion: entry.schema_version
      }),
      "Offer acceptance"
    ),
    obligations: await manifestRows(
      client,
      `SELECT id, obligation_hash, status, schema_version, amount_minor,
              outstanding_minor, repaid_amount_minor, accrued_fees_minor,
              accrued_interest_minor, outstanding_interest_minor,
              outstanding_fees_minor, credit_offer_id, acceptance_id,
              sandbox_execution_receipt_id, due_at, created_at
         FROM obligations
        WHERE tenant_id = $1 AND credit_offer_id = $2 ORDER BY id`,
      values,
      (entry) => ({
        obligationRefHash: refHash("obligation", entry.id),
        obligationHash: entry.obligation_hash,
        status: entry.status,
        schemaVersion: entry.schema_version,
        amountMinor: String(entry.amount_minor),
        outstandingMinor: String(entry.outstanding_minor),
        repaidAmountMinor: String(entry.repaid_amount_minor),
        accruedFeesMinor: String(entry.accrued_fees_minor),
        accruedInterestMinor: String(entry.accrued_interest_minor),
        outstandingInterestMinor: String(entry.outstanding_interest_minor),
        outstandingFeesMinor: String(entry.outstanding_fees_minor),
        creditOfferRefHash: refHash("credit_offer", entry.credit_offer_id),
        acceptanceRefHash: refHash("acceptance", entry.acceptance_id),
        executionReceiptRefHash: entry.sandbox_execution_receipt_id === null
          ? null
          : refHash("execution_receipt", entry.sandbox_execution_receipt_id),
        dueAt: iso(entry.due_at, "obligation dueAt"),
        createdAt: iso(entry.created_at, "obligation createdAt")
      }),
      "Offer obligations"
    ),
    executions: await manifestRows(
      client,
      `SELECT r.id, r.receipt_hash, r.obligation_id, r.amount_minor,
              r.executed_at, r.sandbox_only, r.production_funds_moved,
              r.withdrawable, r.schema_version
         FROM sandbox_execution_receipts r
         JOIN obligations o ON o.tenant_id = r.tenant_id AND o.id = r.obligation_id
        WHERE r.tenant_id = $1 AND o.credit_offer_id = $2 ORDER BY r.id`,
      values,
      (entry) => ({
        receiptRefHash: refHash("execution_receipt", entry.id),
        receiptHash: entry.receipt_hash,
        obligationRefHash: refHash("obligation", entry.obligation_id),
        amountMinor: String(entry.amount_minor),
        executedAt: iso(entry.executed_at, "execution executedAt"),
        sandboxOnly: entry.sandbox_only,
        productionFundsMoved: entry.production_funds_moved,
        withdrawable: entry.withdrawable,
        schemaVersion: entry.schema_version
      }),
      "Offer executions"
    ),
    repayments: await manifestRows(
      client,
      `SELECT r.id, r.obligation_id, r.amount_minor, r.asset_id, r.occurred_at
         FROM repayment_events r
         JOIN obligations o ON o.tenant_id = r.tenant_id AND o.id = r.obligation_id
        WHERE r.tenant_id = $1 AND o.credit_offer_id = $2 ORDER BY r.id`,
      values,
      (entry) => ({
        repaymentRefHash: refHash("repayment", entry.id),
        obligationRefHash: refHash("obligation", entry.obligation_id),
        amountMinor: String(entry.amount_minor),
        assetId: entry.asset_id,
        occurredAt: iso(entry.occurred_at, "repayment occurredAt")
      }),
      "Offer repayments"
    ),
    ledgerTransactions: await manifestRows(
      client,
      `SELECT t.transaction_hash, t.transaction_type, t.asset_id,
              t.reference_type, t.reference_id, t.metadata_hash,
              t.debit_total_minor, t.credit_total_minor, t.entry_count, t.posted_at
         FROM ledger_transactions t
        WHERE t.tenant_id = $1 AND (
          (t.reference_type = 'obligation' AND t.reference_id IN (
            SELECT id FROM obligations WHERE tenant_id = $1 AND credit_offer_id = $2
          )) OR
          (t.reference_type = 'repayment' AND t.reference_id IN (
            SELECT r.id FROM repayment_events r JOIN obligations o
              ON o.tenant_id = r.tenant_id AND o.id = r.obligation_id
             WHERE r.tenant_id = $1 AND o.credit_offer_id = $2
          ))) ORDER BY t.id`,
      values,
      (entry) => ({
        transactionHash: entry.transaction_hash,
        transactionType: entry.transaction_type,
        assetId: entry.asset_id,
        referenceType: entry.reference_type,
        referenceIdHash: refHash(entry.reference_type, entry.reference_id),
        metadataHash: entry.metadata_hash,
        debitTotalMinor: String(entry.debit_total_minor),
        creditTotalMinor: String(entry.credit_total_minor),
        entryCount: Number(entry.entry_count),
        postedAt: iso(entry.posted_at, "ledger postedAt")
      }),
      "Offer ledger transactions"
    )
  });
  assert(
    related.acceptance.rowCount <= 1 &&
    related.obligations.rowCount <= 1 &&
    related.executions.rowCount <= 1,
    "operational_live_negative_state_invalid",
    "Offer protected state cardinality is invalid"
  );
  const manifest = Object.freeze({
    catalogVersion: "m1_b_operational_offer_protected_state.v2",
    offer: offerProjection,
    related
  });
  return Object.freeze({
    manifest,
    manifestHash: hashM1BAcceptanceManifest(manifest)
  });
}

export async function readM1BOperationalObligationProtectedState(client, {
  tenantId,
  obligationId
}) {
  const obligation = await client.query(
    `SELECT id, obligation_hash, status, schema_version, amount_minor,
            outstanding_minor, repaid_amount_minor, accrued_fees_minor,
            accrued_interest_minor, outstanding_interest_minor,
            outstanding_fees_minor, credit_offer_id, acceptance_id,
            sandbox_execution_receipt_id, due_at, created_at
       FROM obligations WHERE tenant_id = $1 AND id = $2`,
    [tenantId, obligationId]
  );
  assert(
    obligation.rowCount === 1 && HASH.test(obligation.rows[0].obligation_hash ?? ""),
    "operational_live_negative_state_invalid",
    "Exact protected Obligation is unavailable"
  );
  const row = obligation.rows[0];
  const manifest = Object.freeze({
    catalogVersion: "m1_b_operational_obligation_protected_state.v2",
    obligationRefHash: refHash("obligation", row.id),
    obligationHash: row.obligation_hash,
    status: row.status,
    schemaVersion: row.schema_version,
    amountMinor: String(row.amount_minor),
    outstandingMinor: String(row.outstanding_minor),
    repaidAmountMinor: String(row.repaid_amount_minor),
    accruedFeesMinor: String(row.accrued_fees_minor),
    accruedInterestMinor: String(row.accrued_interest_minor),
    outstandingInterestMinor: String(row.outstanding_interest_minor),
    outstandingFeesMinor: String(row.outstanding_fees_minor),
    creditOfferRefHash: refHash("credit_offer", row.credit_offer_id),
    acceptanceRefHash: refHash("acceptance", row.acceptance_id),
    executionReceiptRefHash: row.sandbox_execution_receipt_id === null
      ? null
      : refHash("execution_receipt", row.sandbox_execution_receipt_id),
    dueAt: iso(row.due_at, "obligation dueAt"),
    createdAt: iso(row.created_at, "obligation createdAt"),
    repaymentRows: await manifestRows(
      client,
      `SELECT id, amount_minor, asset_id, occurred_at
         FROM repayment_events
        WHERE tenant_id = $1 AND obligation_id = $2 ORDER BY id`,
      [tenantId, obligationId],
      (entry) => ({
        repaymentRefHash: refHash("repayment", entry.id),
        amountMinor: String(entry.amount_minor),
        assetId: entry.asset_id,
        occurredAt: iso(entry.occurred_at, "repayment occurredAt")
      }),
      "Obligation repayments"
    )
  });
  return Object.freeze({
    manifest,
    manifestHash: hashM1BAcceptanceManifest(manifest)
  });
}

export async function readM1BOperationalLiveAttemptEffects(client, {
  tenantId,
  actorId,
  clientId,
  operationId,
  idempotencyKey = null
}) {
  if (idempotencyKey === null) {
    return Object.freeze({
      repositoryIdempotencyKeyHash: null,
      commandIdempotencyCount: 0,
      commandEventCount: 0,
      executionCount: 0,
      businessEventCount: 0
    });
  }
  const repositoryIdempotencyKey = deriveM1BOperationalRepositoryIdempotencyKey({
    tenantId,
    actorId,
    clientId,
    operationId,
    idempotencyKey
  });
  const result = await client.query(
    `SELECT
       (SELECT count(*) FROM command_idempotency
         WHERE tenant_id = $1 AND idempotency_key = $2) AS command_idempotency_count,
       (SELECT count(*) FROM command_events
         WHERE tenant_id = $1 AND idempotency_key = $2) AS command_event_count,
       (SELECT count(*) FROM tenant_command_executions
         WHERE tenant_id = $1 AND idempotency_key = $2) AS execution_count,
       (SELECT count(*) FROM domain_events d JOIN command_events c
          ON c.tenant_id = d.tenant_id AND c.event_id = d.id
         WHERE c.tenant_id = $1 AND c.idempotency_key = $2) AS business_event_count`,
    [tenantId, repositoryIdempotencyKey]
  );
  assert(
    result.rowCount === 1,
    "operational_live_negative_effects_invalid",
    "Live command-effect counters are unavailable"
  );
  return Object.freeze({
    repositoryIdempotencyKeyHash: repositoryIdempotencyKey,
    commandIdempotencyCount: safeCount(
      result.rows[0].command_idempotency_count,
      "command idempotency count"
    ),
    commandEventCount: safeCount(result.rows[0].command_event_count, "command event count"),
    executionCount: safeCount(result.rows[0].execution_count, "execution count"),
    businessEventCount: safeCount(result.rows[0].business_event_count, "business event count")
  });
}

export async function readM1BOperationalLiveDenialAudit(client, {
  tenantId,
  actorId,
  operationId,
  resourceType,
  resourceId,
  requestId,
  correlationId,
  expectedReasonCode
}) {
  const result = await client.query(
    `SELECT id, occurred_at, request_id, correlation_id, operation_id,
            resource_type, resource_id, authorization_decision,
            authorization_decision_id, policy_version, reason_code
       FROM authorization_audit_events
      WHERE tenant_id = $1 AND actor_id = $2 AND operation_id = $3
        AND request_id = $4 AND correlation_id = $5
        AND resource_type = $6 AND resource_id = $7
        AND authorization_decision = 'deny'`,
    [tenantId, actorId, operationId, requestId, correlationId, resourceType, resourceId]
  );
  assert(
    result.rowCount === 1 &&
    result.rows[0].authorization_decision === "deny" &&
    result.rows[0].authorization_decision_id === null &&
    result.rows[0].reason_code === expectedReasonCode &&
    IDENTIFIER.test(result.rows[0].id ?? "") &&
    IDENTIFIER.test(result.rows[0].policy_version ?? ""),
    "operational_live_negative_audit_invalid",
    "Exact durable live denial audit is unavailable"
  );
  return Object.freeze({
    eventId: result.rows[0].id,
    occurredAt: iso(result.rows[0].occurred_at, "denial occurredAt"),
    requestId,
    correlationId,
    operationId,
    resourceType,
    resourceRefHash: refHash(resourceType, resourceId),
    authorizationDecision: "deny",
    authorizationDecisionId: null,
    policyVersion: result.rows[0].policy_version,
    reasonCode: result.rows[0].reason_code
  });
}

export function createM1BOperationalLiveNegativeBrowserExpression({
  group,
  id,
  operationId,
  resourceType,
  resourceId,
  expectedOfferHash = null,
  expectedTermsHash = null,
  disclosureRef = null,
  requestId,
  correlationId,
  idempotencyKey = null
}) {
  const caseKey = `${group}:${id}`;
  const offerCommand = operationId === "pilotAcceptCreditOffer";
  assert(
    LIVE_CASES.has(caseKey) &&
    IDENTIFIER.test(operationId ?? "") &&
    IDENTIFIER.test(resourceType ?? "") &&
    IDENTIFIER.test(resourceId ?? "") &&
    REQUEST_IDENTIFIER.test(requestId ?? "") &&
    REQUEST_IDENTIFIER.test(correlationId ?? "") &&
    (idempotencyKey === null || REQUEST_IDENTIFIER.test(idempotencyKey)),
    "operational_live_negative_request_invalid",
    "Live negative browser request is invalid"
  );
  assert(
    offerCommand
      ? HASH.test(expectedOfferHash ?? "") &&
        HASH.test(expectedTermsHash ?? "") &&
        IDENTIFIER.test(disclosureRef ?? "") &&
        REQUEST_IDENTIFIER.test(idempotencyKey ?? "")
      : operationId === "pilotReadOwnObligation" &&
        expectedOfferHash === null && expectedTermsHash === null &&
        disclosureRef === null && idempotencyKey === null,
    "operational_live_negative_request_invalid",
    "Live negative business binding is invalid"
  );
  const request = {
    operationId,
    resource: { resourceType, resourceId },
    payload: {},
    requestId,
    correlationId,
    ...(idempotencyKey === null ? {} : { idempotencyKey }),
    schemaVersion: "tenant_protocol_request.v1"
  };
  const envelope = {
    schemaVersion: "m1_b_operational_live_negative_response.v2",
    group,
    id,
    requestId,
    correlationId
  };
  if (!offerCommand) {
    return `(async()=>{const c=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;if(!/^[A-Za-z0-9_-]{32,128}$/.test(c??""))throw new Error("Fresh exact-role SIWE session required");const q=${JSON.stringify(request)};const r=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{accept:"application/json, application/problem+json","content-type":"application/json","x-csrf-token":c,"x-request-id":q.requestId},body:JSON.stringify(q)});const b=await r.json();if(r.status!==404||b?.schemaVersion!=="problem_details.v1"||b?.code!=="authorization_denied"||b?.requestId!==q.requestId)throw new Error("Operation did not fail closed");const e={...${JSON.stringify(envelope)},requestProjection:q,response:b};console.log(JSON.stringify(e));return e;})()`;
  }
  const confirmationInput = {
    schemaVersion: "m1_b_operational_offer_denial_confirmation_request.v1",
    operationId,
    resourceId,
    expectedOfferHash,
    expectedTermsHash,
    disclosureRef,
    requestId
  };
  return `(async()=>{const c=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;if(!/^[A-Za-z0-9_-]{32,128}$/.test(c??""))throw new Error("Fresh exact-role SIWE session required");const f=globalThis.__ipoOneM1BOperationalOfferDenialConfirmation;if(typeof f!=="function")throw new Error("Local wallet confirmation bridge unavailable");const i=${JSON.stringify(confirmationInput)};const a=await f(i);const h=async v=>{const d=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return "0x"+[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};const k=await h(JSON.stringify({acknowledgementVersion:"human_credit_offer_acknowledgement.v1",creditOfferHash:i.expectedOfferHash,termsHash:i.expectedTermsHash,disclosureRef:i.disclosureRef,actionConfirmationMethod:a.confirmationMethod,actionConfirmationHash:a.confirmationHash,actionConfirmationMessageHash:a.messageHash,sandboxOnly:true,productionFundsAuthority:false}));const q={...${JSON.stringify(request)},payload:{expectedOfferHash:i.expectedOfferHash,expectedTermsHash:i.expectedTermsHash,acknowledgementHash:k,actionConfirmation:a}};const r=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{accept:"application/json, application/problem+json","content-type":"application/json","x-csrf-token":c,"x-request-id":q.requestId},body:JSON.stringify(q)});const b=await r.json();if(r.status!==404||b?.schemaVersion!=="problem_details.v1"||b?.code!=="authorization_denied"||b?.requestId!==q.requestId)throw new Error("Operation did not fail closed");const e={...${JSON.stringify(envelope)},requestProjection:q,response:b};console.log(JSON.stringify(e));return e;})()`;
}

export function parseM1BOperationalLiveNegativeResponseLine(line, {
  group,
  id,
  requestId,
  correlationId,
  resourceType,
  resourceId,
  expectedOfferHash = null,
  expectedTermsHash = null,
  disclosureRef = null,
  idempotencyKey = null,
  observedAt = new Date()
}) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    assert(false, "operational_live_negative_response_invalid", "Live negative response is invalid JSON");
  }
  assert(
    exactKeys(value, [
      "schemaVersion", "group", "id", "requestId", "correlationId",
      "requestProjection", "response"
    ]) &&
    value.schemaVersion === "m1_b_operational_live_negative_response.v2" &&
    value.group === group && value.id === id &&
    value.requestId === requestId && value.correlationId === correlationId,
    "operational_live_negative_response_invalid",
    "Live negative response envelope is invalid"
  );
  try {
    assertTenantProtocolRequest(value.requestProjection);
  } catch {
    assert(
      false,
      "operational_live_negative_response_invalid",
      "Live negative request projection violates the protocol contract"
    );
  }
  const expectedOperation = id === "cross_role_private_read"
    ? "pilotReadOwnObligation"
    : "pilotAcceptCreditOffer";
  const request = value.requestProjection;
  const confirmation = request.payload?.actionConfirmation;
  const offerCommand = expectedOperation === "pilotAcceptCreditOffer";
  const expectedActionPayloadHash = offerCommand
    ? sha256Json({
        expectedOfferHash,
        expectedTermsHash,
        disclosureRef,
        sandboxOnly: true,
        productionFundsAuthority: false
      })
    : null;
  const expectedAcknowledgementHash = offerCommand
    ? sha256Json({
        acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
        creditOfferHash: expectedOfferHash,
        termsHash: expectedTermsHash,
        disclosureRef,
        actionConfirmationMethod: confirmation?.confirmationMethod,
        actionConfirmationHash: confirmation?.confirmationHash,
        actionConfirmationMessageHash: confirmation?.messageHash,
        sandboxOnly: true,
        productionFundsAuthority: false
      })
    : null;
  assert(
    request.operationId === expectedOperation &&
      request.requestId === requestId &&
      request.correlationId === correlationId &&
      request.resource?.resourceType === resourceType &&
      request.resource.resourceId === resourceId &&
      (offerCommand
        ? request.idempotencyKey === idempotencyKey &&
          request.payload.expectedOfferHash === expectedOfferHash &&
          request.payload.expectedTermsHash === expectedTermsHash &&
          request.payload.acknowledgementHash === expectedAcknowledgementHash &&
          confirmation?.actionType === "accept_offer" &&
          confirmation.resourceId === resourceId &&
          confirmation.resourceHash === expectedOfferHash &&
          confirmation.payloadHash === expectedActionPayloadHash &&
          confirmation.requestId === requestId &&
          confirmation.confirmationMethod === "wallet_personal_sign" &&
          confirmation.rawSignaturePersisted === false &&
          confirmation.blockchainTransactionSubmitted === false
        : !Object.hasOwn(request, "idempotencyKey") &&
          exactKeys(request.payload, [])),
    "operational_live_negative_response_invalid",
    "Live negative request is not bound to its exact role and wallet authority"
  );
  const responseProjection = projectM1BSafeResponse(
    expectedOperation,
    "problem_details.v1",
    value.response
  );
  assert(
    responseProjection.status === 404 &&
    responseProjection.code === "authorization_denied" &&
    responseProjection.requestId === requestId,
    "operational_live_negative_response_invalid",
    "Live negative response is not fail-closed"
  );
  return Object.freeze({
    capturedAt: iso(observedAt, "response observedAt"),
    requestProjection: Object.freeze(structuredClone(value.requestProjection)),
    requestProjectionHash: hashM1BAcceptanceManifest(value.requestProjection),
    responseProjection,
    responseHash: hashM1BAcceptanceManifest(responseProjection)
  });
}

async function captureLiveDenialBoundaryCore({
  caseDefinition,
  attempt,
  databaseStartedAt,
  readTarget,
  readAttempt,
  performDenial
}, dependencies) {
  const { definition, expectation } = liveCase(
    caseDefinition?.group,
    caseDefinition?.id
  );
  const readOfferState = dependencies.readOfferState ??
    readM1BOperationalOfferProtectedState;
  const readObligationState = dependencies.readObligationState ??
    readM1BOperationalObligationProtectedState;
  const readEffects = dependencies.readEffects ??
    readM1BOperationalLiveAttemptEffects;
  const readAudit = dependencies.readAudit ?? readM1BOperationalLiveDenialAudit;
  const restartAt = iso(databaseStartedAt, "databaseStartedAt");
  assert(
    attempt?.group === definition.group && attempt?.id === definition.id &&
    attempt?.operationId === expectation.operationId &&
    attempt?.resourceType === expectation.resourceType &&
    IDENTIFIER.test(attempt?.tenantId ?? "") &&
    IDENTIFIER.test(attempt?.actorId ?? "") &&
    IDENTIFIER.test(attempt?.clientId ?? "") &&
    IDENTIFIER.test(attempt?.resourceId ?? "") &&
    REQUEST_IDENTIFIER.test(attempt?.requestId ?? "") &&
    REQUEST_IDENTIFIER.test(attempt?.correlationId ?? "") &&
    (expectation.command
      ? REQUEST_IDENTIFIER.test(attempt?.idempotencyKey ?? "")
      : attempt?.idempotencyKey === null) &&
    typeof readTarget === "function" &&
    typeof readAttempt === "function" &&
    typeof performDenial === "function",
    "operational_live_negative_boundary_invalid",
    "Live denial boundary input is invalid"
  );
  const baseline = await readTarget(async (client) => ({
    capturedAt: iso((await client.query("SELECT clock_timestamp() AS captured_at")).rows[0].captured_at, "baseline capturedAt"),
    state: attempt.resourceType === "credit_offer"
      ? await readOfferState(client, attempt)
      : await readObligationState(client, attempt)
  }));
  const baselineEffects = await readAttempt((client) =>
    readEffects(client, attempt)
  );
  const expectedRepositoryKey = expectation.command
    ? deriveM1BOperationalRepositoryIdempotencyKey(attempt)
    : null;
  assertLiveCaseTargetState(
    definition,
    attempt,
    baseline.state,
    baseline.capturedAt
  );
  assert(
    baselineEffects.repositoryIdempotencyKeyHash === expectedRepositoryKey &&
    Object.entries(baselineEffects)
      .filter(([key]) => key.endsWith("Count"))
      .every(([, count]) => count === 0),
    "operational_live_negative_boundary_invalid",
    "Live negative attempt already has command effects"
  );
  const outward = await performDenial(
    Object.freeze({ ...attempt }),
    baseline.state
  );
  const verification = await readTarget(async (client) => ({
    capturedAt: iso((await client.query("SELECT clock_timestamp() AS captured_at")).rows[0].captured_at, "verification capturedAt"),
    state: attempt.resourceType === "credit_offer"
      ? await readOfferState(client, attempt)
      : await readObligationState(client, attempt)
  }));
  const final = await readAttempt(async (client) => ({
    effects: await readEffects(client, attempt),
    audit: await readAudit(client, {
      ...attempt,
      expectedReasonCode: expectation.expectedReasonCode
    })
  }));
  const authorizationAudit = Object.freeze({
    eventId: final.audit.eventId,
    requestId: final.audit.requestId,
    correlationId: final.audit.correlationId,
    operationId: final.audit.operationId,
    authorizationDecision: final.audit.authorizationDecision,
    reasonCode: final.audit.reasonCode,
    occurredAt: final.audit.occurredAt
  });
  assert(
    baseline.state.manifestHash === verification.state.manifestHash &&
    IDENTIFIER.test(baseline.state.manifest?.catalogVersion ?? "") &&
    outward?.requestProjection?.operationId === attempt.operationId &&
    outward.requestProjection?.resource?.resourceType === attempt.resourceType &&
    outward.requestProjection?.resource?.resourceId === attempt.resourceId &&
    outward.requestProjection?.requestId === attempt.requestId &&
    outward.requestProjection?.correlationId === attempt.correlationId &&
    outward.requestProjectionHash ===
      hashM1BAcceptanceManifest(outward.requestProjection) &&
    outward.responseProjection?.requestId === attempt.requestId &&
    outward.responseProjection?.status === 404 &&
    outward.responseProjection?.code === "authorization_denied" &&
    outward.responseHash ===
      hashM1BAcceptanceManifest(outward.responseProjection) &&
    (!expectation.command || (
      outward.requestProjection.idempotencyKey === attempt.idempotencyKey &&
      outward.requestProjection.payload?.expectedOfferHash ===
        baseline.state.manifest.offer?.offerHash &&
      outward.requestProjection.payload?.expectedTermsHash ===
        baseline.state.manifest.offer?.termsHash
    )) &&
    Object.entries(final.effects)
      .filter(([key]) => key.endsWith("Count"))
      .every(([, count]) => count === 0) &&
    final.effects.repositoryIdempotencyKeyHash === expectedRepositoryKey &&
    final.audit.requestId === attempt.requestId &&
    final.audit.correlationId === attempt.correlationId &&
    final.audit.operationId === attempt.operationId &&
    final.audit.authorizationDecision === "deny" &&
    final.audit.reasonCode === expectation.expectedReasonCode &&
    Date.parse(restartAt) <= Date.parse(baseline.capturedAt) &&
    Date.parse(baseline.capturedAt) <= Date.parse(final.audit.occurredAt) &&
    Date.parse(final.audit.occurredAt) <= Date.parse(outward.capturedAt) &&
    Date.parse(outward.capturedAt) <= Date.parse(verification.capturedAt),
    "operational_live_negative_boundary_invalid",
    "Live denial changed protected state or broke chronology"
  );
  const observation = Object.freeze({
    schemaVersion: "m1_b_negative_live_observation.v2",
    group: definition.group,
    id: definition.id,
    capturedAt: verification.capturedAt,
    databaseStartedAt: restartAt,
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    outwardStatus: outward.responseProjection.status,
    outwardCode: outward.responseProjection.code,
    outwardBody: outward.responseProjection,
    authorizationAudit,
    authorizationAuditSetHash: hashM1BAcceptanceManifest([authorizationAudit]),
    protectedStateCatalogVersion: baseline.state.manifest.catalogVersion,
    protectedStateBeforeHash: baseline.state.manifestHash,
    protectedStateAfterHash: verification.state.manifestHash,
    databaseProof: "main_post_restart_application_role",
    additionalEffectCount: 0,
    nonEnumerating: true,
    duplicateSemantics: null
  });
  return Object.freeze({
    observation,
    attemptEvidence: Object.freeze({
      requestProjection: outward.requestProjection,
      requestProjectionHash: outward.requestProjectionHash,
      outwardResponse: outward.responseProjection,
      outwardResponseHash: outward.responseHash,
      authorizationAudit,
      protectedStateCatalogVersion: baseline.state.manifest.catalogVersion,
      protectedStateBeforeHash: baseline.state.manifestHash,
      protectedStateAfterHash: verification.state.manifestHash,
      baselineEffects,
      finalEffects: final.effects,
      baselineCapturedAt: baseline.capturedAt,
      auditOccurredAt: final.audit.occurredAt,
      outwardCapturedAt: outward.capturedAt,
      verificationCapturedAt: verification.capturedAt
    })
  });
}

export async function captureM1BOperationalLiveDenialBoundary({
  group,
  id,
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  supportingArtifacts,
  tenantId,
  actorId,
  authentication,
  databaseStartedAt,
  databaseUrl,
  secretPath = M1_B_ACCEPTANCE_SECRET_MOUNT,
  resourceType,
  resourceId,
  input = process.stdin,
  errorOutput = process.stderr,
  ...forbidden
}) {
  assert(
    Object.keys(forbidden).length === 0,
    "operational_live_negative_dependency_override_forbidden",
    "Production live-negative capture does not accept callbacks or reader overrides"
  );
  const { definition, expectation } = liveCase(group, id);
  const candidate = candidateContext({
    candidateReleaseId,
    sourceTreeHash,
    runtimeImageId
  });
  const restartAt = iso(databaseStartedAt, "databaseStartedAt");
  assert(
    IDENTIFIER.test(tenantId ?? "") &&
      IDENTIFIER.test(actorId ?? "") &&
      resourceType === expectation.resourceType &&
      IDENTIFIER.test(resourceId ?? "") &&
      secretPath === M1_B_ACCEPTANCE_SECRET_MOUNT,
    "operational_live_negative_boundary_invalid",
    "Production live-negative target or database secret mount is invalid"
  );
  const operator = new LiveNegativeOperatorNdjson(input, errorOutput);
  const pool = await createM1BAcceptanceAppPool({
    databaseUrl: credentialFreeDatabaseUrl(databaseUrl),
    secretPath,
    applicationName: "ipo-one-m1-b-live-negative",
    max: 1
  });
  try {
    const securityContext = createTenantSecurityContext({
      tenantId,
      actorId,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      source: "local_test"
    });
    const readTenant = (operation) => withM1BAcceptanceTenantRead(
      pool,
      securityContext,
      operation
    );
    const runtimeBinding = await readTenant(async (client) => {
      const start = await client.query(
        "SELECT pg_postmaster_start_time() AS database_started_at"
      );
      assert(
        start.rowCount === 1 &&
          iso(start.rows[0].database_started_at, "databaseStartedAt") === restartAt,
        "operational_live_negative_restart_mismatch",
        "Live negative database does not match the sole exact restart"
      );
      return Object.freeze({
        databaseStartedAt: restartAt,
        clientId: await readM1BOperationalLiveClientId(client, {
          tenantId,
          actorId,
          authentication
        })
      });
    });
    const attempt = createM1BOperationalLiveAttempt({
      tenantId,
      actorId,
      clientId: runtimeBinding.clientId,
      group,
      id,
      operationId: expectation.operationId,
      resourceType,
      resourceId,
      command: expectation.command
    });
    const capture = await captureLiveDenialBoundaryCore({
      caseDefinition: definition,
      attempt,
      databaseStartedAt: restartAt,
      readTarget: readTenant,
      readAttempt: readTenant,
      async performDenial(_attempt, baselineState) {
        const offer = baselineState.manifest?.offer;
        const browserExpression = createM1BOperationalLiveNegativeBrowserExpression({
          group,
          id,
          operationId: expectation.operationId,
          resourceType,
          resourceId,
          expectedOfferHash: expectation.command ? offer?.offerHash : null,
          expectedTermsHash: expectation.command ? offer?.termsHash : null,
          disclosureRef: expectation.command ? offer?.disclosureRef : null,
          requestId: attempt.requestId,
          correlationId: attempt.correlationId,
          idempotencyKey: attempt.idempotencyKey
        });
        operator.prompt({
          schemaVersion: "m1_b_operational_live_negative_prompt.v2",
          kind: "live_denial_response_ready",
          group,
          id,
          operationId: expectation.operationId,
          resourceType,
          browserExpression
        });
        return parseM1BOperationalLiveNegativeResponseLine(
          await operator.nextLine(),
          {
            group,
            id,
            requestId: attempt.requestId,
            correlationId: attempt.correlationId,
            resourceType,
            resourceId,
            expectedOfferHash: expectation.command ? offer?.offerHash : null,
            expectedTermsHash: expectation.command ? offer?.termsHash : null,
            disclosureRef: expectation.command ? offer?.disclosureRef : null,
            idempotencyKey: attempt.idempotencyKey,
            observedAt: new Date()
          }
        );
      }
    }, {});
    assert(
      Array.isArray(supportingArtifacts),
      "operational_live_negative_artifacts_invalid",
      "Live negative supporting artifacts are required"
    );
    const attemptReceipt = Object.freeze({
      schemaVersion: "m1_b_operational_live_attempt_receipt.v2",
      fixtureUsed: false,
      productionEvidenceEligible: true,
      ...candidate,
      group,
      id,
      databaseStartedAt: restartAt,
      capturedAt: capture.observation.capturedAt,
      supportingArtifacts: Object.freeze(
        supportingArtifacts.map((entry) => Object.freeze({ ...entry }))
      ),
      ...capture.attemptEvidence
    });
    return Object.freeze({ attemptReceipt, observation: capture.observation });
  } finally {
    await pool.end();
  }
}

export async function captureM1BOperationalLiveDenialBoundaryForTest(
  input,
  dependencies
) {
  const capture = await captureLiveDenialBoundaryCore(input, dependencies);
  return Object.freeze({
    fixtureUsed: true,
    productionEvidenceEligible: false,
    observation: Object.freeze({
      ...capture.observation,
      fixtureUsed: true,
      productionEvidenceEligible: false
    }),
    attemptEvidence: Object.freeze({
      ...capture.attemptEvidence,
      fixtureUsed: true,
      productionEvidenceEligible: false
    })
  });
}

export function createM1BOperationalLiveAttempt({
  tenantId,
  actorId,
  clientId,
  group,
  id,
  operationId,
  resourceType,
  resourceId,
  command
}) {
  return Object.freeze({
    tenantId,
    actorId,
    clientId,
    group,
    id,
    operationId,
    resourceType,
    resourceId,
    requestId: requestToken(`request_m1b_${id}`),
    correlationId: requestToken(`correlation_m1b_${id}`),
    idempotencyKey: command ? requestToken(`idempotency_m1b_${id}`) : null
  });
}
