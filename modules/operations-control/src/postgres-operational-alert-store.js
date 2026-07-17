import {
  DomainError,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import { assertDualNativeLifecycleSyntheticResult } from "./dual-native-synthetic.js";
import { evaluateOperationalSignals } from "./operations-alerts.js";
import { OPERATIONAL_ALERT_POLICY_VERSION } from "./operations-policy.js";
import {
  assertOperationalSignal,
  signalFromSyntheticLifecycleResult
} from "./operations-signals.js";
import { createPrivatePilotOperationalSourceBoundary } from "./operations-source-boundary.js";

export const OPERATIONAL_ALERT_STATE_SCHEMA_VERSION = "operational_alert_state.v1";
export const OPERATIONAL_ALERT_OCCURRENCE_SCHEMA_VERSION = "operational_alert_occurrence.v1";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const MAX_SIGNALS = 1_000;
const MAX_EVIDENCE_REFS = 32;
const STATUS_FILTERS = new Set(["open", "acknowledged", "resolved"]);

function invalid(code, message) {
  throw new DomainError(code, message);
}

function json(value) {
  return JSON.stringify(value);
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function safeInteger(value, name) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    invalid("invalid_operational_alert_state", `${name} is not a safe integer`);
  }
  return normalized;
}

function assertRepository(repository) {
  if (
    !repository || typeof repository !== "object" ||
    typeof repository.withTenantWrite !== "function" ||
    typeof repository.withTenantRead !== "function" ||
    typeof repository.appendCommandBatchInTransaction !== "function" ||
    !repository.tenantContext || typeof repository.tenantContext.tenantId !== "string" ||
    typeof repository.tenantContext.actorId !== "string"
  ) invalid("invalid_operational_store_config", "a Tenant-scoped Event Repository is required");
  return repository;
}

function assertIdempotencyKey(value) {
  if (
    typeof value !== "string" || value.length < 8 || value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/.test(value)
  ) invalid("invalid_operational_store_input", "idempotencyKey is invalid");
  return value;
}

function immutableAlertIdentity(state) {
  return {
    alertId: state.alertId,
    alertFingerprint: state.alertFingerprint,
    alertType: state.alertType,
    signalType: state.signalType,
    severity: state.severity,
    route: state.route,
    ownerRole: state.ownerRole,
    readinessEffect: state.readinessEffect,
    runbookRef: state.runbookRef,
    actionCodes: state.actionCodes,
    scopeRefHash: state.scopeRefHash,
    deliveryStatus: state.deliveryStatus,
    requiresNamedOwner: state.requiresNamedOwner,
    automaticActionTaken: state.automaticActionTaken,
    productionReleaseAuthority: state.productionReleaseAuthority,
    environment: state.environment,
    sandboxOnly: state.sandboxOnly,
    productionFundsMoved: state.productionFundsMoved,
    policyVersion: state.policyVersion
  };
}

function identitiesMatch(left, right) {
  return hashId("operations_control.alert_immutable_identity", immutableAlertIdentity(left)) ===
    hashId("operations_control.alert_immutable_identity", immutableAlertIdentity(right));
}

function mapAlertRow(row) {
  if (!row) return undefined;
  return {
    alertId: row.id,
    alertFingerprint: row.alert_fingerprint,
    alertType: row.alert_type,
    signalType: row.signal_type,
    severity: row.severity,
    route: row.route,
    ownerRole: row.owner_role,
    readinessEffect: row.readiness_effect,
    runbookRef: row.runbook_ref,
    actionCodes: row.action_codes,
    scopeRefHash: row.scope_ref_hash,
    occurrenceCount: safeInteger(row.occurrence_count, "occurrenceCount"),
    firstObservedAt: timestamp(row.first_observed_at),
    lastObservedAt: timestamp(row.last_observed_at),
    evidenceRefHashes: row.evidence_ref_hashes,
    evidenceTruncated: row.evidence_truncated,
    status: row.status,
    ...(row.acknowledged_at
      ? {
          acknowledgedAt: timestamp(row.acknowledged_at),
          acknowledgedByRefHash: row.acknowledged_by_ref_hash
        }
      : {}),
    ...(row.resolved_at
      ? {
          resolvedAt: timestamp(row.resolved_at),
          resolvedByRefHash: row.resolved_by_ref_hash,
          resolutionCode: row.resolution_code
        }
      : {}),
    deliveryStatus: row.delivery_status,
    requiresNamedOwner: row.requires_named_owner,
    automaticActionTaken: row.automatic_action_taken,
    productionReleaseAuthority: row.production_release_authority,
    environment: row.environment,
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    policyVersion: row.policy_version,
    version: safeInteger(row.version, "version"),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    schemaVersion: row.schema_version
  };
}

function mapSyntheticRow(row) {
  return {
    syntheticRunId: row.id,
    tenantRefHash: row.tenant_ref_hash,
    checkIdHash: row.check_id_hash,
    release: row.release,
    status: row.status,
    completedStages: row.completed_stages,
    evidenceRefs: row.evidence_refs,
    ...(row.reconciliation_summary_hash
      ? { reconciliationSummaryHash: row.reconciliation_summary_hash }
      : {}),
    ...(row.failure_stage
      ? { failureStage: row.failure_stage, failureCode: row.failure_code }
      : {}),
    resultHash: row.result_hash,
    startedAt: timestamp(row.started_at),
    completedAt: timestamp(row.completed_at),
    observedAt: timestamp(row.completed_at),
    nonAuthorizing: row.non_authorizing,
    sandboxOnly: row.sandbox_only,
    productionFundsMoved: row.production_funds_moved,
    credentialsIncluded: row.credentials_included,
    publicEndpointEnabled: row.public_endpoint_enabled,
    notificationDelivered: row.notification_delivered,
    policyVersion: row.policy_version,
    schemaVersion: row.schema_version
  };
}

function normalizedSignals(input) {
  if (!Array.isArray(input) || input.length > MAX_SIGNALS) {
    invalid("invalid_operational_store_input", `signals must contain at most ${MAX_SIGNALS} entries`);
  }
  const bySource = new Map();
  for (const candidate of input) {
    const signal = assertOperationalSignal(candidate);
    const existing = bySource.get(signal.sourceRefHash);
    if (existing && hashId("operations_control.signal_identity", existing) !==
      hashId("operations_control.signal_identity", signal)) {
      invalid(
        "operational_signal_identity_conflict",
        "one source reference cannot identify different operational signals"
      );
    }
    bySource.set(signal.sourceRefHash, signal);
  }
  return [...bySource.values()].sort((left, right) =>
    left.sourceRefHash.localeCompare(right.sourceRefHash)
  );
}

function alertStateFromCandidate(candidate, { existing, signals, occurredAt }) {
  const refs = signals.map((signal) => ({
    sourceRefHash: signal.sourceRefHash,
    observedAt: signal.observedAt
  }));
  const firstObservedAt = refs.reduce(
    (minimum, item) => item.observedAt < minimum ? item.observedAt : minimum,
    existing?.firstObservedAt ?? candidate.firstObservedAt
  );
  const lastObservedAt = refs.reduce(
    (maximum, item) => item.observedAt > maximum ? item.observedAt : maximum,
    existing?.lastObservedAt ?? candidate.lastObservedAt
  );
  return {
    ...immutableAlertIdentity(candidate),
    occurrenceCount: (existing?.occurrenceCount ?? 0) + signals.length,
    firstObservedAt,
    lastObservedAt,
    evidenceRefHashes: [],
    evidenceTruncated: (existing?.evidenceTruncated ?? false),
    status: existing?.status ?? "open",
    ...(existing?.acknowledgedAt
      ? {
          acknowledgedAt: existing.acknowledgedAt,
          acknowledgedByRefHash: existing.acknowledgedByRefHash
        }
      : {}),
    ...(existing?.resolvedAt
      ? {
          resolvedAt: existing.resolvedAt,
          resolvedByRefHash: existing.resolvedByRefHash,
          resolutionCode: existing.resolutionCode
        }
      : {}),
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? occurredAt,
    updatedAt: existing?.updatedAt && existing.updatedAt > occurredAt
      ? existing.updatedAt
      : occurredAt,
    schemaVersion: OPERATIONAL_ALERT_STATE_SCHEMA_VERSION
  };
}

async function planAlertUpdates(client, signals, occurredAt) {
  const candidates = evaluateOperationalSignals(signals);
  if (candidates.length === 0) return [];
  const sourceHashes = signals.map(({ sourceRefHash }) => sourceRefHash);
  const occurrenceResult = await client.query(
    `SELECT source_ref_hash, alert_id
       FROM operational_alert_occurrences
      WHERE source_ref_hash = ANY($1::text[])`,
    [sourceHashes]
  );
  const occurrenceBySource = new Map(
    occurrenceResult.rows.map((row) => [row.source_ref_hash, row.alert_id])
  );
  const plans = [];
  for (const candidate of candidates) {
    const groupSignals = signals.filter((signal) =>
      signal.signalType === candidate.signalType && signal.scopeRefHash === candidate.scopeRefHash
    );
    for (const signal of groupSignals) {
      const boundAlertId = occurrenceBySource.get(signal.sourceRefHash);
      if (boundAlertId && boundAlertId !== candidate.alertId) {
        invalid(
          "operational_signal_identity_conflict",
          "an operational source reference is already bound to another alert"
        );
      }
    }
    const newSignals = groupSignals.filter(({ sourceRefHash }) => !occurrenceBySource.has(sourceRefHash));
    if (newSignals.length === 0) continue;
    const alertResult = await client.query(
      `SELECT * FROM operational_alerts WHERE id = $1 FOR UPDATE`,
      [candidate.alertId]
    );
    const existing = mapAlertRow(alertResult.rows[0]);
    if (existing && !identitiesMatch(existing, candidate)) {
      invalid("operational_alert_identity_conflict", "operational alert policy identity changed");
    }
    const state = alertStateFromCandidate(candidate, { existing, signals: newSignals, occurredAt });
    const existingRefs = existing
      ? await client.query(
          `SELECT source_ref_hash, observed_at
             FROM operational_alert_occurrences
            WHERE alert_id = $1
            ORDER BY observed_at DESC, source_ref_hash DESC
            LIMIT $2`,
          [candidate.alertId, MAX_EVIDENCE_REFS]
        )
      : { rows: [] };
    const mergedRefs = [
      ...existingRefs.rows.map((row) => ({
        sourceRefHash: row.source_ref_hash,
        observedAt: timestamp(row.observed_at)
      })),
      ...newSignals.map((signal) => ({
        sourceRefHash: signal.sourceRefHash,
        observedAt: signal.observedAt
      }))
    ].sort((left, right) =>
      left.observedAt.localeCompare(right.observedAt) ||
      left.sourceRefHash.localeCompare(right.sourceRefHash)
    );
    state.evidenceRefHashes = mergedRefs.slice(-MAX_EVIDENCE_REFS).map(({ sourceRefHash }) => sourceRefHash);
    state.evidenceTruncated = state.evidenceTruncated || state.occurrenceCount > MAX_EVIDENCE_REFS;
    plans.push({ candidate, existing, newSignals, state });
  }
  return plans;
}

async function applyAlertPlan(client, plan, evidenceEventId) {
  const { state, existing, newSignals } = plan;
  if (!existing) {
    await client.query(
      `INSERT INTO operational_alerts(
         id, alert_fingerprint, alert_type, signal_type, severity, route,
         owner_role, readiness_effect, runbook_ref, action_codes, scope_ref_hash,
         occurrence_count, first_observed_at, last_observed_at,
         evidence_ref_hashes, evidence_truncated, status,
         delivery_status, requires_named_owner, automatic_action_taken,
         production_release_authority, environment, sandbox_only,
         production_funds_moved, policy_version, version, created_at, updated_at,
         schema_version
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20,
         $21, $22, $23,
         $24, $25, $26, $27, $28,
         $29
       )`,
      [
        state.alertId, state.alertFingerprint, state.alertType, state.signalType,
        state.severity, state.route, state.ownerRole, state.readinessEffect,
        state.runbookRef, json(state.actionCodes), state.scopeRefHash,
        state.occurrenceCount, state.firstObservedAt, state.lastObservedAt,
        json(state.evidenceRefHashes), state.evidenceTruncated, state.status,
        state.deliveryStatus, state.requiresNamedOwner, state.automaticActionTaken,
        state.productionReleaseAuthority, state.environment, state.sandboxOnly,
        state.productionFundsMoved, state.policyVersion, state.version,
        state.createdAt, state.updatedAt, state.schemaVersion
      ]
    );
  } else {
    await client.query(
      `UPDATE operational_alerts
          SET occurrence_count = $2,
              first_observed_at = $3,
              last_observed_at = $4,
              evidence_ref_hashes = $5,
              evidence_truncated = $6,
              version = $7,
              updated_at = $8
        WHERE id = $1`,
      [
        state.alertId, state.occurrenceCount, state.firstObservedAt,
        state.lastObservedAt, json(state.evidenceRefHashes), state.evidenceTruncated,
        state.version, state.updatedAt
      ]
    );
  }
  for (const signal of newSignals) {
    await client.query(
      `INSERT INTO operational_alert_occurrences(
         source_ref_hash, alert_id, source_system, source_event_type,
         observed_at, evidence_event_id, policy_version, schema_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        signal.sourceRefHash, state.alertId, signal.sourceSystem,
        signal.sourceEventType, signal.observedAt, evidenceEventId,
        OPERATIONAL_ALERT_POLICY_VERSION, OPERATIONAL_ALERT_OCCURRENCE_SCHEMA_VERSION
      ]
    );
  }
}

function alertEvent(plan, now, actorRefHash) {
  return createCreditEvent({
    eventType: "operational_alert_observed",
    payload: {
      alertId: plan.state.alertId,
      alertFingerprint: plan.state.alertFingerprint,
      signalType: plan.state.signalType,
      scopeRefHash: plan.state.scopeRefHash,
      occurrenceCount: plan.state.occurrenceCount,
      newOccurrenceCount: plan.newSignals.length,
      firstObservedAt: plan.state.firstObservedAt,
      lastObservedAt: plan.state.lastObservedAt,
      stateHash: hashId("operations_control.operational_alert_state", plan.state),
      actorRefHash,
      automaticActionTaken: false,
      productionReleaseAuthority: false,
      policyVersion: OPERATIONAL_ALERT_POLICY_VERSION
    },
    now
  });
}

function insertSyntheticRun(client, result, evidenceEventId) {
  return client.query(
    `INSERT INTO operational_synthetic_runs(
       id, tenant_ref_hash, check_id_hash, release, status, completed_stages,
       evidence_refs, reconciliation_summary_hash, failure_stage, failure_code,
       result_hash, evidence_event_id, started_at, completed_at,
       non_authorizing, sandbox_only, production_funds_moved,
       credentials_included, public_endpoint_enabled, notification_delivered,
       policy_version, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20,
       $21, $22
     )`,
    [
      result.syntheticRunId, result.tenantRefHash, result.checkIdHash,
      result.release, result.status, json(result.completedStages),
      json(result.evidenceRefs), result.reconciliationSummaryHash ?? null,
      result.failureStage ?? null, result.failureCode ?? null, result.resultHash,
      evidenceEventId, result.startedAt, result.completedAt, result.nonAuthorizing,
      result.sandboxOnly, result.productionFundsMoved, result.credentialsIncluded,
      result.publicEndpointEnabled, result.notificationDelivered,
      result.policyVersion, result.schemaVersion
    ]
  );
}

export function operationalTenantRefHash(tenantId) {
  if (typeof tenantId !== "string" || tenantId.length < 3 || tenantId.length > 128) {
    invalid("invalid_operational_tenant_reference", "tenantId is invalid");
  }
  return hashId("operations_control.tenant_reference", { tenantId });
}

export class PostgresOperationalAlertStore {
  constructor({ eventRepository, clock = () => new Date() }) {
    this.eventRepository = assertRepository(eventRepository);
    if (typeof clock !== "function") {
      invalid("invalid_operational_store_config", "clock must be a function");
    }
    this.clock = clock;
    this.tenantRefHash = operationalTenantRefHash(eventRepository.tenantContext.tenantId);
    this.actorRefHash = hashId("operations_control.actor_reference", {
      actorId: eventRepository.tenantContext.actorId
    });
  }

  async ingestSignals({ signals, idempotencyKey }) {
    const normalized = normalizedSignals(signals);
    assertIdempotencyKey(idempotencyKey);
    const commandHash = hashId("operations_control.ingest_signals_command", { signals: normalized });
    const aggregateId = `operational_ingestion_${hashId(
      "operations_control.ingestion_id",
      { idempotencyKey }
    ).slice(2)}`;
    return this.eventRepository.withTenantWrite(async (client) => {
      const replay = await this.eventRepository.findCommandInTransaction(client, {
        idempotencyKey,
        commandHash,
        expectedAggregateType: "operational_signal_ingestion",
        expectedAggregateId: aggregateId,
        lock: true
      });
      if (replay) return { ...replay.response, replayed: true };
      const now = this.clock();
      const occurredAt = now.toISOString();
      const plans = await planAlertUpdates(client, normalized, occurredAt);
      const stateHashes = plans.map(({ state }) =>
        hashId("operations_control.operational_alert_state", state)
      );
      const batchEvent = createCreditEvent({
        eventType: "operational_signals_ingested",
        payload: {
          signalCount: normalized.length,
          updatedAlertCount: plans.length,
          newOccurrenceCount: plans.reduce((sum, plan) => sum + plan.newSignals.length, 0),
          alertStateHashes: stateHashes,
          actorRefHash: this.actorRefHash,
          automaticActionTaken: false,
          productionReleaseAuthority: false,
          policyVersion: OPERATIONAL_ALERT_POLICY_VERSION
        },
        now
      });
      const alertEvents = plans.map((plan) => alertEvent(plan, now, this.actorRefHash));
      const response = {
        signalCount: normalized.length,
        updatedAlertCount: plans.length,
        newOccurrenceCount: plans.reduce((sum, plan) => sum + plan.newSignals.length, 0),
        alertStates: plans.map(({ state }) => state),
        policyVersion: OPERATIONAL_ALERT_POLICY_VERSION,
        schemaVersion: "operational_signal_ingestion_result.v1"
      };
      const committed = await this.eventRepository.appendCommandBatchInTransaction(client, {
        aggregateType: "operational_signal_ingestion",
        aggregateId,
        idempotencyKey,
        commandHash,
        events: [
          {
            aggregateType: "operational_signal_ingestion",
            aggregateId,
            expectedVersion: 0,
            event: batchEvent
          },
          ...plans.map((plan, index) => ({
            aggregateType: "operational_alert",
            aggregateId: plan.state.alertId,
            expectedVersion: plan.existing?.version ?? 0,
            event: alertEvents[index]
          }))
        ],
        response,
        applyProjection: async ({ client: projectionClient, committed: committedEvents }) => {
          for (let index = 0; index < plans.length; index += 1) {
            await applyAlertPlan(projectionClient, plans[index], committedEvents[index + 1].event.eventId);
          }
        }
      });
      return { ...committed.response, replayed: committed.replayed };
    });
  }

  async recordSyntheticResult({ result, idempotencyKey }) {
    const synthetic = assertDualNativeLifecycleSyntheticResult(result);
    assertIdempotencyKey(idempotencyKey);
    if (synthetic.tenantRefHash !== this.tenantRefHash) {
      invalid(
        "operational_synthetic_tenant_mismatch",
        "synthetic result does not belong to the active Tenant context"
      );
    }
    const commandHash = hashId("operations_control.record_synthetic_result_command", synthetic);
    return this.eventRepository.withTenantWrite(async (client) => {
      const replay = await this.eventRepository.findCommandInTransaction(client, {
        idempotencyKey,
        commandHash,
        expectedAggregateType: "operational_synthetic_run",
        expectedAggregateId: synthetic.syntheticRunId,
        lock: true
      });
      if (replay) return { ...replay.response, replayed: true };
      const existingResult = await client.query(
        `SELECT * FROM operational_synthetic_runs WHERE result_hash = $1`,
        [synthetic.resultHash]
      );
      if (existingResult.rowCount > 0) {
        invalid(
          "operational_synthetic_idempotency_required",
          "an existing synthetic result must be replayed with its original idempotency key"
        );
      }
      const signal = signalFromSyntheticLifecycleResult(synthetic, {
        boundary: createPrivatePilotOperationalSourceBoundary()
      });
      const plans = signal ? await planAlertUpdates(client, [signal], synthetic.completedAt) : [];
      const event = createCreditEvent({
        eventType: "dual_native_lifecycle_synthetic_recorded",
        payload: {
          syntheticRunId: synthetic.syntheticRunId,
          tenantRefHash: synthetic.tenantRefHash,
          checkIdHash: synthetic.checkIdHash,
          release: synthetic.release,
          status: synthetic.status,
          completedStages: synthetic.completedStages,
          resultHash: synthetic.resultHash,
          ...(synthetic.reconciliationSummaryHash
            ? { reconciliationSummaryHash: synthetic.reconciliationSummaryHash }
            : { failureStage: synthetic.failureStage, failureCode: synthetic.failureCode }),
          actorRefHash: this.actorRefHash,
          nonAuthorizing: true,
          productionFundsMoved: false,
          notificationDelivered: false,
          policyVersion: synthetic.policyVersion
        },
        now: new Date(synthetic.completedAt)
      });
      const alertEvents = plans.map((plan) =>
        alertEvent(plan, new Date(synthetic.completedAt), this.actorRefHash)
      );
      const response = {
        syntheticResult: synthetic,
        alertStates: plans.map(({ state }) => state),
        schemaVersion: "operational_synthetic_recording_result.v1"
      };
      const committed = await this.eventRepository.appendCommandBatchInTransaction(client, {
        aggregateType: "operational_synthetic_run",
        aggregateId: synthetic.syntheticRunId,
        idempotencyKey,
        commandHash,
        events: [
          {
            aggregateType: "operational_synthetic_run",
            aggregateId: synthetic.syntheticRunId,
            expectedVersion: 0,
            event
          },
          ...plans.map((plan, index) => ({
            aggregateType: "operational_alert",
            aggregateId: plan.state.alertId,
            expectedVersion: plan.existing?.version ?? 0,
            event: alertEvents[index]
          }))
        ],
        response,
        applyProjection: async ({ client: projectionClient, committed: committedEvents }) => {
          await insertSyntheticRun(projectionClient, synthetic, committedEvents[0].event.eventId);
          for (let index = 0; index < plans.length; index += 1) {
            await applyAlertPlan(projectionClient, plans[index], committedEvents[index + 1].event.eventId);
          }
        }
      });
      return { ...committed.response, replayed: committed.replayed };
    });
  }

  async listAlertStates({ status } = {}) {
    if (status !== undefined && !STATUS_FILTERS.has(status)) {
      invalid("invalid_operational_store_input", "status filter is invalid");
    }
    const result = await this.eventRepository.withTenantRead((client) => client.query(
      `SELECT * FROM operational_alerts
       ${status === undefined ? "" : "WHERE status = $1"}
       ORDER BY last_observed_at DESC, id`,
      status === undefined ? [] : [status]
    ));
    return result.rows.map(mapAlertRow);
  }

  async listSyntheticRuns() {
    const result = await this.eventRepository.withTenantRead((client) => client.query(
      `SELECT * FROM operational_synthetic_runs ORDER BY completed_at DESC, id`
    ));
    return result.rows.map(mapSyntheticRow);
  }
}
