import {
  DomainError,
  assertNoRawPiiReference,
  createCreditEvent,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  createCoreProjectionHash
} from "./postgres-core-repository.js";
import { PostgresEventRepository } from "./postgres-event-repository.js";

const SUPPORTED_PROJECTION_TYPES = new Set(Object.values(CoreProjectionType));
const MAX_DETAIL_BYTES = 4096;

function clone(value) {
  return structuredClone(value);
}

function assertString(name, value, maxLength = 500) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new DomainError("invalid_reconciliation_input", `${name} must be a non-empty bounded string`, { name });
  }
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function json(value) {
  return JSON.stringify(value);
}

function boundedDetails(details) {
  const normalized = JSON.parse(JSON.stringify(details ?? {}));
  const encoded = json(normalized);
  if (Buffer.byteLength(encoded) <= MAX_DETAIL_BYTES) return normalized;
  return {
    truncated: true,
    originalByteLength: Buffer.byteLength(encoded),
    detailHash: hashId("reconciliation_details", normalized)
  };
}

function mapRun(row) {
  if (!row) return undefined;
  return {
    reconciliationRunId: row.id,
    scope: row.scope,
    initiatedBy: row.initiated_by,
    release: row.release,
    status: row.status,
    checkCount: row.check_count,
    discrepancyCount: row.discrepancy_count,
    criticalCount: row.critical_count,
    summary: row.summary,
    evidenceEventId: row.evidence_event_id ?? undefined,
    startedAt: timestamp(row.started_at),
    completedAt: row.completed_at ? timestamp(row.completed_at) : undefined,
    schemaVersion: "reconciliation_run.v1"
  };
}

function mapDiscrepancy(row) {
  return {
    reconciliationDiscrepancyId: row.id,
    runId: row.run_id,
    checkCode: row.check_code,
    severity: row.severity,
    entityType: row.entity_type,
    entityId: row.entity_id,
    expectedHash: row.expected_hash ?? undefined,
    actualHash: row.actual_hash ?? undefined,
    details: row.details,
    evidenceEventId: row.evidence_event_id,
    status: row.status,
    detectedAt: timestamp(row.detected_at),
    resolvedAt: row.resolved_at ? timestamp(row.resolved_at) : undefined,
    resolutionEventId: row.resolution_event_id ?? undefined,
    schemaVersion: "reconciliation_discrepancy.v1"
  };
}

export class PostgresReconciliationService {
  constructor({
    pool,
    eventRepository,
    coreRepository,
    release = "local",
    maxDiscrepancies = 100,
    maxEntities = 10_000,
    clock = () => new Date()
  } = {}) {
    if (!pool || typeof pool.query !== "function") {
      throw new DomainError("postgres_pool_required", "PostgresReconciliationService requires a pg-compatible pool");
    }
    assertString("release", release, 200);
    if (!Number.isSafeInteger(maxDiscrepancies) || maxDiscrepancies < 2 || maxDiscrepancies > 100) {
      throw new DomainError("invalid_reconciliation_limit", "maxDiscrepancies must be an integer from 2 through 100");
    }
    if (!Number.isSafeInteger(maxEntities) || maxEntities < 100 || maxEntities > 100_000) {
      throw new DomainError("invalid_reconciliation_limit", "maxEntities must be an integer from 100 through 100000");
    }
    this.pool = pool;
    this.eventRepository = eventRepository ?? new PostgresEventRepository({ pool });
    this.coreRepository = coreRepository ?? new PostgresCoreRepository({ pool, eventRepository: this.eventRepository });
    this.release = release;
    this.maxDiscrepancies = maxDiscrepancies;
    this.maxEntities = maxEntities;
    this.clock = clock;
  }

  async run({ scope = "full", initiatedBy = "system:reconciliation", idempotencyKey } = {}) {
    if (scope !== "full") {
      throw new DomainError("unsupported_reconciliation_scope", "only the full reconciliation scope is supported", { scope });
    }
    assertString("initiatedBy", initiatedBy, 200);
    assertNoRawPiiReference({ initiatedBy }, "reconciliation");
    const runId = createOperationalId("reconciliation_run");
    const commandKey = idempotencyKey ?? `reconciliation:${runId}`;
    assertString("idempotencyKey", commandKey, 300);
    const commandHash = hashId("reconciliation_command", {
      scope,
      initiatedBy,
      release: this.release
    });
    const replay = await this.eventRepository.findCommand({ idempotencyKey: commandKey, commandHash });
    if (replay) return { ...clone(replay.response), replayed: true };
    const startedAt = this.clock();
    const discrepancies = [];
    let truncatedCount = 0;
    let checkCount = 0;

    const add = ({ checkCode, severity = "critical", entityType, entityId, expectedHash, actualHash, details }) => {
      if (discrepancies.length >= this.maxDiscrepancies - 1) {
        truncatedCount += 1;
        return;
      }
      discrepancies.push({
        reconciliationDiscrepancyId: hashId("reconciliation_discrepancy_id", {
          runId,
          index: discrepancies.length,
          checkCode,
          entityType,
          entityId
        }),
        checkCode,
        severity,
        entityType,
        entityId,
        expectedHash,
        actualHash,
        details: boundedDetails(details),
        detectedAt: startedAt.toISOString()
      });
    };

    checkCount += 1;
    await this.#checkStreamHeads(add);
    checkCount += 1;
    await this.#checkEventCompanions(add);
    checkCount += 1;
    await this.#checkCommandIntegrity(add);
    checkCount += 1;
    await this.#checkProjectionCoverage(add);
    checkCount += 1;
    await this.#checkProjectionHashes(add);
    checkCount += 1;
    await this.#checkLedger(add);
    checkCount += 1;
    await this.#checkLockboxes(add);
    checkCount += 1;
    await this.#checkMandates(add);
    checkCount += 1;
    await this.#checkObligations(add);
    checkCount += 1;
    await this.#checkCreditExposure(add);

    if (truncatedCount > 0) {
      discrepancies.push({
        reconciliationDiscrepancyId: hashId("reconciliation_discrepancy_id", {
          runId,
          checkCode: "reconciliation_result_truncated"
        }),
        checkCode: "reconciliation_result_truncated",
        severity: "critical",
        entityType: "reconciliation_run",
        entityId: runId,
        details: { omittedDiscrepancyCount: truncatedCount, maxDiscrepancies: this.maxDiscrepancies },
        detectedAt: startedAt.toISOString()
      });
    }

    const completedAt = this.clock();
    const criticalCount = discrepancies.filter(({ severity }) => severity === "critical").length;
    const status = discrepancies.length === 0 ? "passed" : "failed";
    const summary = {
      runId,
      scope,
      status,
      checkCount,
      discrepancyCount: discrepancies.length,
      criticalCount,
      truncated: truncatedCount > 0,
      release: this.release,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      schemaVersion: "reconciliation_summary.v1"
    };
    const runEvent = createCreditEvent({
      eventType: "reconciliation_completed",
      payload: {
        runId,
        scope,
        status,
        checkCount,
        discrepancyCount: discrepancies.length,
        criticalCount,
        release: this.release,
        actorId: initiatedBy
      },
      now: completedAt
    });
    const discrepancyEvents = discrepancies.map((discrepancy) =>
      createCreditEvent({
        eventType: "reconciliation_discrepancy_detected",
        payload: {
          runId,
          discrepancyId: discrepancy.reconciliationDiscrepancyId,
          checkCode: discrepancy.checkCode,
          severity: discrepancy.severity,
          entityType: discrepancy.entityType,
          entityId: discrepancy.entityId,
          expectedHash: discrepancy.expectedHash,
          actualHash: discrepancy.actualHash,
          detailsHash: hashId("reconciliation_details", discrepancy.details),
          actorId: initiatedBy
        },
        now: completedAt
      })
    );
    const events = [runEvent, ...discrepancyEvents].map((event, index) => ({
      aggregateType: "reconciliation_run",
      aggregateId: runId,
      expectedVersion: index,
      event
    }));
    const committed = await this.eventRepository.appendCommandBatch({
      aggregateType: "reconciliation_run",
      aggregateId: runId,
      idempotencyKey: commandKey,
      commandHash,
      events,
      response: summary,
      applyProjection: async ({ client, committed: committedEvents }) => {
        await client.query(
          `INSERT INTO reconciliation_runs(
             id, scope, initiated_by, release, status, check_count,
             discrepancy_count, critical_count, summary, evidence_event_id,
             started_at, completed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            runId,
            scope,
            initiatedBy,
            this.release,
            status,
            checkCount,
            discrepancies.length,
            criticalCount,
            json(summary),
            committedEvents[0].event.eventId,
            startedAt.toISOString(),
            completedAt.toISOString()
          ]
        );
        for (let index = 0; index < discrepancies.length; index += 1) {
          const discrepancy = discrepancies[index];
          await client.query(
            `INSERT INTO reconciliation_discrepancies(
               id, run_id, check_code, severity, entity_type, entity_id,
               expected_hash, actual_hash, details, evidence_event_id,
               status, detected_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', $11)`,
            [
              discrepancy.reconciliationDiscrepancyId,
              runId,
              discrepancy.checkCode,
              discrepancy.severity,
              discrepancy.entityType,
              discrepancy.entityId,
              discrepancy.expectedHash ?? null,
              discrepancy.actualHash ?? null,
              json(discrepancy.details),
              committedEvents[index + 1].event.eventId,
              discrepancy.detectedAt
            ]
          );
        }
      }
    });
    return { ...summary, replayed: committed.replayed };
  }

  async getRun(runId) {
    assertString("runId", runId, 300);
    const [runResult, discrepancyResult] = await Promise.all([
      this.pool.query("SELECT * FROM reconciliation_runs WHERE id = $1", [runId]),
      this.pool.query(
        "SELECT * FROM reconciliation_discrepancies WHERE run_id = $1 ORDER BY detected_at, id",
        [runId]
      )
    ]);
    const run = mapRun(runResult.rows[0]);
    return run ? { ...run, discrepancies: discrepancyResult.rows.map(mapDiscrepancy) } : undefined;
  }

  async planProjectionReplay({ entityType, entityId, requestedBy, reason, dryRun = true }) {
    if (!SUPPORTED_PROJECTION_TYPES.has(entityType)) {
      throw new DomainError("unsupported_projection_type", "projection type is not supported", { entityType });
    }
    assertString("entityId", entityId, 300);
    assertString("requestedBy", requestedBy, 200);
    assertString("reason", reason, 500);
    assertNoRawPiiReference({ requestedBy, reason }, "projectionReplay");
    if (dryRun !== true) {
      throw new DomainError(
        "projection_repair_approval_required",
        "projection replay planning is dry-run only; use the approval-gated repair operation"
      );
    }
    const [proof, snapshot] = await Promise.all([
      this.coreRepository.verifyProjection(entityType, entityId),
      this.coreRepository.getLatestProjectionSnapshot(entityType, entityId)
    ]);
    const requestedAt = this.clock();
    const jobId = createOperationalId("projection_replay_job");
    const planKey = `projection-replay-plan:${jobId}`;
    const requestHash = hashId("projection_replay_request", {
      entityType,
      entityId,
      requestedBy,
      reason,
      dryRun: true
    });
    const result = {
      replayJobId: jobId,
      entityType,
      entityId,
      dryRun: true,
      status: "planned",
      snapshotAvailable: snapshot !== undefined,
      wouldRepair: snapshot !== undefined && !proof.matches,
      expectedHash: proof.expectedHash,
      observedHash: proof.actualHash,
      schemaVersion: "projection_replay_plan.v1"
    };
    await this.pool.query(
      `INSERT INTO projection_replay_jobs(
         id, idempotency_key, request_hash, entity_type, entity_id, requested_by, reason, dry_run, status,
         source_snapshot_id, source_hash, observed_hash, result, requested_at, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'planned', $8, $9, $10, $11, $12, $12)`,
      [
        jobId,
        planKey,
        requestHash,
        entityType,
        entityId,
        requestedBy,
        reason,
        snapshot?.projectionSnapshotId ?? null,
        proof.expectedHash ?? null,
        proof.actualHash ?? null,
        json(result),
        requestedAt.toISOString()
      ]
    );
    return result;
  }

  async repairProjection({ entityType, entityId, approvedBy, reason, idempotencyKey }) {
    if (!SUPPORTED_PROJECTION_TYPES.has(entityType)) {
      throw new DomainError("unsupported_projection_type", "projection type is not supported", { entityType });
    }
    assertString("entityId", entityId, 300);
    assertString("approvedBy", approvedBy, 200);
    assertString("reason", reason, 500);
    assertString("idempotencyKey", idempotencyKey, 300);
    assertNoRawPiiReference({ reason }, "projectionRepair");
    const requestHash = hashId("projection_repair_request", {
      entityType,
      entityId,
      approvedBy,
      reason
    });
    const [proof, snapshot] = await Promise.all([
      this.coreRepository.verifyProjection(entityType, entityId),
      this.coreRepository.getLatestProjectionSnapshot(entityType, entityId)
    ]);
    if (!snapshot) {
      throw new DomainError("projection_snapshot_not_found", "projection repair requires an immutable snapshot", {
        entityType,
        entityId
      });
    }

    const requestedAt = this.clock();
    const jobId = createOperationalId("projection_replay_job");
    const inserted = await this.pool.query(
      `INSERT INTO projection_replay_jobs(
         id, idempotency_key, request_hash, entity_type, entity_id, requested_by,
         reason, dry_run, status, source_snapshot_id, source_hash, observed_hash,
         result, requested_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'awaiting_approval', $8, $9, $10, $11, $12)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        jobId,
        idempotencyKey,
        requestHash,
        entityType,
        entityId,
        approvedBy,
        reason,
        snapshot.projectionSnapshotId,
        proof.expectedHash ?? null,
        proof.actualHash ?? null,
        json({ approvedBy, approvalRecorded: true, repairCommitted: false }),
        requestedAt.toISOString()
      ]
    );
    let replayJobId = jobId;
    if (inserted.rowCount === 0) {
      const existing = await this.pool.query(
        "SELECT id, request_hash, status, result FROM projection_replay_jobs WHERE idempotency_key = $1",
        [idempotencyKey]
      );
      const row = existing.rows[0];
      if (!row || row.request_hash !== requestHash) {
        throw new DomainError("projection_repair_idempotency_conflict", "repair key was reused with different input", {
          idempotencyKey
        });
      }
      replayJobId = row.id;
      if (row.status === "completed") return clone(row.result);
    }

    try {
      const repair = await this.coreRepository.repairProjection({
        entityType,
        entityId,
        approvedBy,
        reason,
        idempotencyKey,
        now: this.clock()
      });
      const completedAt = this.clock();
      const result = {
        replayJobId,
        entityType,
        entityId,
        status: "completed",
        repaired: true,
        repairEventId: repair.response.repairEventId,
        sourceSnapshotId: snapshot.projectionSnapshotId,
        replayed: repair.replayed,
        schemaVersion: "projection_repair_result.v1"
      };
      await this.pool.query(
        `UPDATE projection_replay_jobs
            SET status = 'completed', repair_event_id = $2, result = $3, completed_at = $4
          WHERE id = $1`,
        [replayJobId, repair.response.repairEventId, json(result), completedAt.toISOString()]
      );
      return result;
    } catch (error) {
      await this.pool.query(
        `UPDATE projection_replay_jobs
            SET status = 'failed',
                result = $2,
                completed_at = $3
          WHERE id = $1`,
        [
          replayJobId,
          json({ errorCode: error instanceof DomainError ? error.code : "projection_repair_failed" }),
          this.clock().toISOString()
        ]
      );
      throw error;
    }
  }

  async #checkStreamHeads(add) {
    const result = await this.pool.query(`
      WITH event_versions AS (
        SELECT aggregate_type, aggregate_id, MAX(aggregate_version)::bigint AS event_version
          FROM domain_events
         GROUP BY aggregate_type, aggregate_id
      )
      SELECT
        COALESCE(h.aggregate_type, e.aggregate_type) AS aggregate_type,
        COALESCE(h.aggregate_id, e.aggregate_id) AS aggregate_id,
        h.current_version::bigint AS head_version,
        e.event_version
      FROM aggregate_stream_heads h
      FULL OUTER JOIN event_versions e
        ON e.aggregate_type = h.aggregate_type AND e.aggregate_id = h.aggregate_id
      WHERE h.current_version IS NULL
         OR e.event_version IS NULL
         OR h.current_version <> e.event_version
      ORDER BY 1, 2
      LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "stream_head_mismatch",
        entityType: row.aggregate_type,
        entityId: row.aggregate_id,
        details: { headVersion: row.head_version, eventVersion: row.event_version }
      });
    }
  }

  async #checkEventCompanions(add) {
    const result = await this.pool.query(`
      SELECT d.id AS event_id,
             COUNT(DISTINCT e.id)::int AS evidence_count,
             COUNT(DISTINCT c.id)::int AS credit_event_count,
             COUNT(DISTINCT o.id)::int AS outbox_count,
             COUNT(DISTINCT ce.event_id)::int AS command_event_count
        FROM domain_events d
        LEFT JOIN evidence_envelopes e ON e.id = d.id
        LEFT JOIN credit_events c ON c.id = d.id
        LEFT JOIN outbox_messages o ON o.event_id = d.id
        LEFT JOIN command_events ce ON ce.event_id = d.id
       GROUP BY d.id
      HAVING COUNT(DISTINCT e.id) <> 1
          OR COUNT(DISTINCT c.id) <> 1
          OR COUNT(DISTINCT o.id) <> 1
          OR COUNT(DISTINCT ce.event_id) <> 1
       ORDER BY d.id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "event_companion_mismatch",
        entityType: "domain_event",
        entityId: row.event_id,
        details: {
          evidenceCount: row.evidence_count,
          creditEventCount: row.credit_event_count,
          outboxCount: row.outbox_count,
          commandEventCount: row.command_event_count
        }
      });
    }
  }

  async #checkCommandIntegrity(add) {
    const mismatchedLinks = await this.pool.query(`
      SELECT ce.event_id, ce.aggregate_type AS linked_type, ce.aggregate_id AS linked_id,
             ce.aggregate_version AS linked_version, d.aggregate_type, d.aggregate_id, d.aggregate_version
        FROM command_events ce
        JOIN domain_events d ON d.id = ce.event_id
       WHERE ce.aggregate_type <> d.aggregate_type
          OR ce.aggregate_id <> d.aggregate_id
          OR ce.aggregate_version <> d.aggregate_version
       ORDER BY ce.event_id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of mismatchedLinks.rows) {
      add({
        checkCode: "command_event_link_mismatch",
        entityType: "domain_event",
        entityId: row.event_id,
        details: {
          linked: [row.linked_type, row.linked_id, row.linked_version],
          stored: [row.aggregate_type, row.aggregate_id, row.aggregate_version]
        }
      });
    }

    const commands = await this.pool.query(`
      SELECT idempotency_key, response_json, response_hash
        FROM command_idempotency
       WHERE status = 'completed'
       ORDER BY idempotency_key
       LIMIT $1
    `, [this.maxEntities + 1]);
    if (commands.rows.length > this.maxEntities) {
      add({
        checkCode: "reconciliation_scan_limit_reached",
        entityType: "command_set",
        entityId: "completed_commands",
        details: { maxEntities: this.maxEntities }
      });
    }
    for (const row of commands.rows.slice(0, this.maxEntities)) {
      if (row.response_hash === "legacy:unverified") {
        add({
          checkCode: "legacy_command_response_unverified",
          severity: "warning",
          entityType: "command",
          entityId: row.idempotency_key,
          details: { migrationState: "legacy_unverified" }
        });
        continue;
      }
      const actualHash = hashId("command_response", row.response_json);
      if (actualHash !== row.response_hash) {
        add({
          checkCode: "command_response_hash_mismatch",
          entityType: "command",
          entityId: row.idempotency_key,
          expectedHash: row.response_hash,
          actualHash,
          details: {}
        });
      }
    }
  }

  async #checkProjectionCoverage(add) {
    const result = await this.pool.query(`
      WITH entities(entity_type, entity_id) AS (
        SELECT 'principal', id FROM principals
        UNION ALL SELECT 'subject', id FROM subjects
        UNION ALL SELECT 'account_binding', id FROM account_bindings
        UNION ALL SELECT 'mandate', id FROM mandates
        UNION ALL SELECT 'mandate_reservation', id FROM mandate_reservations
        UNION ALL SELECT 'mandate_release', id FROM mandate_releases
        UNION ALL SELECT 'provider', id FROM providers
        UNION ALL SELECT 'spend_policy', id FROM spend_policies
        UNION ALL SELECT 'spend_request', id FROM spend_requests
        UNION ALL SELECT 'ledger_account', id FROM ledger_accounts
        UNION ALL SELECT 'ledger_transaction', id FROM ledger_transactions
        UNION ALL SELECT 'lockbox', id FROM lockboxes
        UNION ALL SELECT 'obligation', id FROM obligations
        UNION ALL SELECT 'repayment', id FROM repayment_events
        UNION ALL SELECT 'credit_line', id FROM credit_lines
        UNION ALL SELECT 'risk_decision', id FROM risk_decisions
        UNION ALL SELECT 'admin_action', id FROM admin_actions
      )
      SELECT
        COALESCE(e.entity_type, r.entity_type) AS entity_type,
        COALESCE(e.entity_id, r.entity_id) AS entity_id,
        (e.entity_id IS NOT NULL) AS projection_exists,
        (r.entity_id IS NOT NULL) AS registry_exists,
        EXISTS (
          SELECT 1 FROM projection_snapshots s
           WHERE s.entity_type = COALESCE(e.entity_type, r.entity_type)
             AND s.entity_id = COALESCE(e.entity_id, r.entity_id)
        ) AS snapshot_exists
      FROM entities e
      FULL OUTER JOIN projection_registry r
        ON r.entity_type = e.entity_type AND r.entity_id = e.entity_id
      WHERE e.entity_id IS NULL
         OR r.entity_id IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM projection_snapshots s
            WHERE s.entity_type = COALESCE(e.entity_type, r.entity_type)
              AND s.entity_id = COALESCE(e.entity_id, r.entity_id)
         )
      ORDER BY 1, 2
      LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "projection_coverage_mismatch",
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: {
          projectionExists: row.projection_exists,
          registryExists: row.registry_exists,
          snapshotExists: row.snapshot_exists
        }
      });
    }
  }

  async #checkProjectionHashes(add) {
    const result = await this.pool.query(
      "SELECT entity_type, entity_id FROM projection_registry ORDER BY entity_type, entity_id LIMIT $1",
      [this.maxEntities + 1]
    );
    if (result.rows.length > this.maxEntities) {
      add({
        checkCode: "reconciliation_scan_limit_reached",
        entityType: "projection_set",
        entityId: "projection_registry",
        details: { maxEntities: this.maxEntities }
      });
    }
    for (const row of result.rows.slice(0, this.maxEntities)) {
      if (!SUPPORTED_PROJECTION_TYPES.has(row.entity_type)) continue;
      const proof = await this.coreRepository.verifyProjection(row.entity_type, row.entity_id);
      if (!proof.matches) {
        add({
          checkCode: "projection_hash_mismatch",
          entityType: row.entity_type,
          entityId: row.entity_id,
          expectedHash: proof.expectedHash,
          actualHash: proof.actualHash,
          details: {
            projectionExists: proof.exists,
            registryExists: proof.registered,
            snapshotExists: proof.snapshotted,
            snapshotPayloadHash: proof.snapshotPayloadHash
          }
        });
      }
    }
  }

  async #checkLedger(add) {
    const result = await this.pool.query(`
      SELECT lt.id,
             lt.entry_count,
             COUNT(le.id)::int AS actual_entry_count,
             lt.debit_total_minor::text AS declared_debits,
             lt.credit_total_minor::text AS declared_credits,
             COALESCE(SUM(le.amount_minor) FILTER (WHERE le.direction = 'debit'), 0)::text AS actual_debits,
             COALESCE(SUM(le.amount_minor) FILTER (WHERE le.direction = 'credit'), 0)::text AS actual_credits,
             COUNT(*) FILTER (WHERE la.asset_id <> lt.asset_id)::int AS asset_mismatches
        FROM ledger_transactions lt
        LEFT JOIN ledger_entries le ON le.transaction_id = lt.id
        LEFT JOIN ledger_accounts la ON la.id = le.account_id
       GROUP BY lt.id
      HAVING lt.entry_count <> COUNT(le.id)
          OR lt.debit_total_minor <> COALESCE(SUM(le.amount_minor) FILTER (WHERE le.direction = 'debit'), 0)
          OR lt.credit_total_minor <> COALESCE(SUM(le.amount_minor) FILTER (WHERE le.direction = 'credit'), 0)
          OR COALESCE(SUM(le.amount_minor) FILTER (WHERE le.direction = 'debit'), 0)
             <> COALESCE(SUM(le.amount_minor) FILTER (WHERE le.direction = 'credit'), 0)
          OR COUNT(*) FILTER (WHERE la.asset_id <> lt.asset_id) > 0
       ORDER BY lt.id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "ledger_transaction_mismatch",
        entityType: "ledger_transaction",
        entityId: row.id,
        details: {
          declaredEntryCount: row.entry_count,
          actualEntryCount: row.actual_entry_count,
          declaredDebits: row.declared_debits,
          declaredCredits: row.declared_credits,
          actualDebits: row.actual_debits,
          actualCredits: row.actual_credits,
          assetMismatches: row.asset_mismatches
        }
      });
    }
  }

  async #checkLockboxes(add) {
    const result = await this.pool.query(`
      SELECT l.id,
             COALESCE(SUM(CASE
               WHEN e.direction = 'debit' THEN e.amount_minor
               WHEN e.direction = 'credit' THEN -e.amount_minor
               ELSE 0
             END), 0)::text AS balance_minor
        FROM lockboxes l
        LEFT JOIN ledger_entries e ON e.account_id = l.ledger_account_id
       GROUP BY l.id
      HAVING COALESCE(SUM(CASE
               WHEN e.direction = 'debit' THEN e.amount_minor
               WHEN e.direction = 'credit' THEN -e.amount_minor
               ELSE 0
             END), 0) < 0
       ORDER BY l.id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "lockbox_negative_balance",
        entityType: "lockbox",
        entityId: row.id,
        details: { balanceMinor: row.balance_minor }
      });
    }
  }

  async #checkMandates(add) {
    const result = await this.pool.query(`
      SELECT m.id,
             m.utilized_minor::text AS utilized_minor,
             COALESCE(SUM(r.amount_minor - r.released_minor), 0)::text AS reserved_minor
        FROM mandates m
        LEFT JOIN mandate_reservations r ON r.mandate_id = m.id
       GROUP BY m.id
      HAVING m.utilized_minor <> COALESCE(SUM(r.amount_minor - r.released_minor), 0)
       ORDER BY m.id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "mandate_utilization_mismatch",
        entityType: "mandate",
        entityId: row.id,
        details: { utilizedMinor: row.utilized_minor, reservedMinor: row.reserved_minor }
      });
    }
  }

  async #checkObligations(add) {
    const stateResult = await this.pool.query(`
      SELECT id, status, amount_minor::text, outstanding_minor::text,
             repaid_amount_minor::text, accrued_fees_minor::text
        FROM obligations
       WHERE amount_minor <> outstanding_minor + repaid_amount_minor
          OR outstanding_minor < 0
          OR repaid_amount_minor < 0
          OR (status = 'fully_repaid' AND outstanding_minor <> 0)
          OR (status IN ('active', 'partially_repaid', 'overdue', 'defaulted') AND outstanding_minor <= 0)
       ORDER BY id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of stateResult.rows) {
      add({
        checkCode: "obligation_state_mismatch",
        entityType: "obligation",
        entityId: row.id,
        details: {
          status: row.status,
          principalAmountMinor: row.amount_minor,
          outstandingMinor: row.outstanding_minor,
          repaidMinor: row.repaid_amount_minor,
          accruedFeesMinor: row.accrued_fees_minor
        }
      });
    }

    const repaymentResult = await this.pool.query(`
      SELECT o.id, o.repaid_amount_minor::text AS obligation_repaid_minor,
             COALESCE(SUM(r.amount_minor), 0)::text AS repayment_event_minor
        FROM obligations o
        LEFT JOIN repayment_events r ON r.obligation_id = o.id
       GROUP BY o.id
      HAVING o.repaid_amount_minor <> COALESCE(SUM(r.amount_minor), 0)
       ORDER BY o.id
       LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of repaymentResult.rows) {
      add({
        checkCode: "obligation_repayment_mismatch",
        entityType: "obligation",
        entityId: row.id,
        details: {
          obligationRepaidMinor: row.obligation_repaid_minor,
          repaymentEventMinor: row.repayment_event_minor
        }
      });
    }
  }

  async #checkCreditExposure(add) {
    const result = await this.pool.query(`
      WITH exposure AS (
        SELECT o.subject_id, o.asset_id, SUM(o.outstanding_minor) AS outstanding_minor
          FROM obligations o
          JOIN subjects s ON s.id = o.subject_id AND s.subject_type = 'agent'
         WHERE o.status IN ('created', 'active', 'partially_repaid', 'overdue', 'defaulted')
         GROUP BY o.subject_id, o.asset_id
      )
      SELECT
        COALESCE(c.id, e.subject_id || ':' || e.asset_id) AS entity_id,
        COALESCE(c.subject_id, e.subject_id) AS subject_id,
        COALESCE(c.asset_id, e.asset_id) AS asset_id,
        COALESCE(c.utilized_minor, 0)::text AS utilized_minor,
        COALESCE(e.outstanding_minor, 0)::text AS outstanding_minor
      FROM credit_lines c
      JOIN subjects s ON s.id = c.subject_id AND s.subject_type = 'agent'
      FULL OUTER JOIN exposure e ON e.subject_id = c.subject_id AND e.asset_id = c.asset_id
      WHERE COALESCE(c.utilized_minor, 0) <> COALESCE(e.outstanding_minor, 0)
      ORDER BY 1
      LIMIT $1
    `, [this.maxDiscrepancies]);
    for (const row of result.rows) {
      add({
        checkCode: "credit_exposure_mismatch",
        entityType: "credit_line",
        entityId: row.entity_id,
        details: {
          subjectId: row.subject_id,
          assetId: row.asset_id,
          utilizedMinor: row.utilized_minor,
          outstandingMinor: row.outstanding_minor
        }
      });
    }
  }
}
