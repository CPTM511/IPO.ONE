import {
  abuseError,
  assertAbuseIdentifier,
  assertPositiveInteger
} from "./abuse-utils.js";
import {
  assertQuotaStoreRelease,
  assertQuotaStoreRequest
} from "./quota-store-contract.js";
import { ABUSE_POLICY_VERSION } from "./abuse-constants.js";

const COMMAND_RETENTION_MS = 24 * 60 * 60_000;
const STATEMENT_TIMEOUT_MS = 2_000;
const trustedAdmissionLocks = new WeakSet();
const admissionLockFacts = new WeakMap();

function asDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function toNumber(value, name) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw abuseError("quota_store_corrupt", `${name} is invalid`);
  }
  return normalized;
}

export class PostgresQuotaStore {
  constructor({ eventRepository, statementTimeoutMs = STATEMENT_TIMEOUT_MS }) {
    if (
      !eventRepository ||
      typeof eventRepository.withTenantWrite !== "function" ||
      typeof eventRepository.withTenantRead !== "function" ||
      !eventRepository.tenantContext
    ) {
      throw abuseError("invalid_abuse_store_config", "PostgreSQL quota store requires a tenant repository");
    }
    assertPositiveInteger("statementTimeoutMs", statementTimeoutMs, { maximum: 10_000 });
    this.eventRepository = eventRepository;
    this.tenantId = eventRepository.tenantContext.tenantId;
    this.statementTimeoutMs = statementTimeoutMs;
  }

  async reserve(request) {
    this.#assertRequest(request);
    return this.eventRepository.withTenantWrite(async (client) => {
      await this.#configureTransaction(client);
      const now = await this.#databaseNow(client);
      await this.#cleanupExpired(client, now);
      await client.query(
        "DELETE FROM abuse_rate_buckets WHERE tenant_id = $1 AND expires_at <= $2",
        [this.tenantId, now]
      );
      await client.query(
        `DELETE FROM abuse_command_charges
          WHERE tenant_id = $1 AND expires_at <= $2 AND status <> 'pending'`,
        [this.tenantId, now]
      );
      await client.query(
        `DELETE FROM abuse_admissions admission
          WHERE admission.tenant_id = $1
            AND admission.state <> 'pending'
            AND admission.completed_at <= $2::timestamptz - INTERVAL '24 hours'
            AND NOT EXISTS (
              SELECT 1 FROM abuse_command_charges charge
               WHERE charge.tenant_id = admission.tenant_id
                 AND charge.active_admission_id = admission.id
            )`,
        [this.tenantId, now]
      );

      let charge;
      if (request.commandRefHash) {
        const result = await client.query(
          `SELECT status, active_admission_id, expires_at
             FROM abuse_command_charges
            WHERE tenant_id = $1 AND command_ref_hash = $2
            FOR UPDATE`,
          [this.tenantId, request.commandRefHash]
        );
        charge = result.rows[0];
      }
      const replayed = charge?.status === "succeeded" && asDate(charge.expires_at) > now;
      const pending = charge?.status === "pending" && asDate(charge.expires_at) > now;
      const rates = request.rateReservations.filter((item) => !item.commandScoped || !replayed);

      for (const reservation of rates) {
        const windowStartedAt = new Date(
          Math.floor(now.getTime() / reservation.windowMs) * reservation.windowMs
        );
        const expiresAt = new Date(windowStartedAt.getTime() + reservation.windowMs);
        const result = await client.query(
          `INSERT INTO abuse_rate_buckets(
             tenant_id, key_hash, dimension, quota_class, window_started_at,
             window_ms, used_count, limit_count, expires_at, updated_at,
             version, schema_version
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, 'abuse_rate_bucket.v1')
           ON CONFLICT (tenant_id, key_hash) DO UPDATE SET
             window_started_at = EXCLUDED.window_started_at,
             window_ms = EXCLUDED.window_ms,
             used_count = CASE
               WHEN abuse_rate_buckets.window_started_at = EXCLUDED.window_started_at
                 THEN abuse_rate_buckets.used_count + EXCLUDED.used_count
               ELSE EXCLUDED.used_count
             END,
             limit_count = CASE
               WHEN abuse_rate_buckets.window_started_at = EXCLUDED.window_started_at
                 THEN LEAST(abuse_rate_buckets.limit_count, EXCLUDED.limit_count)
               ELSE EXCLUDED.limit_count
             END,
             expires_at = EXCLUDED.expires_at,
             updated_at = EXCLUDED.updated_at,
             version = abuse_rate_buckets.version + 1
           WHERE abuse_rate_buckets.dimension = EXCLUDED.dimension
             AND abuse_rate_buckets.quota_class = EXCLUDED.quota_class
             AND (
               CASE
                 WHEN abuse_rate_buckets.window_started_at = EXCLUDED.window_started_at
                   THEN abuse_rate_buckets.used_count + EXCLUDED.used_count
                 ELSE EXCLUDED.used_count
               END
             ) <= (
               CASE
                 WHEN abuse_rate_buckets.window_started_at = EXCLUDED.window_started_at
                   THEN LEAST(abuse_rate_buckets.limit_count, EXCLUDED.limit_count)
                 ELSE EXCLUDED.limit_count
               END
             )
           RETURNING used_count`,
          [
            this.tenantId,
            reservation.keyHash,
            reservation.dimension,
            request.quotaClass,
            windowStartedAt,
            reservation.windowMs,
            reservation.units,
            reservation.limit,
            expiresAt,
            now
          ]
        );
        if (result.rowCount === 0) return { admitted: false, reason: "rate" };
      }
      if (pending) return { admitted: false, reason: "idempotency" };

      const capacities = request.capacityReservations.filter((item) => !item.commandScoped || !replayed);
      await client.query("SAVEPOINT abuse_capacity_reservation");
      for (const reservation of capacities) {
        const result = await client.query(
          `INSERT INTO abuse_capacity_buckets(
             tenant_id, key_hash, kind, used_count, limit_count,
             updated_at, version, schema_version
           ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'abuse_capacity_bucket.v1')
           ON CONFLICT (tenant_id, key_hash) DO UPDATE SET
             used_count = abuse_capacity_buckets.used_count + EXCLUDED.used_count,
             limit_count = LEAST(abuse_capacity_buckets.limit_count, EXCLUDED.limit_count),
             updated_at = EXCLUDED.updated_at,
             version = abuse_capacity_buckets.version + 1
           WHERE abuse_capacity_buckets.kind = EXCLUDED.kind
             AND abuse_capacity_buckets.used_count + EXCLUDED.used_count
                 <= LEAST(abuse_capacity_buckets.limit_count, EXCLUDED.limit_count)
           RETURNING used_count`,
          [
            this.tenantId,
            reservation.keyHash,
            reservation.kind,
            reservation.units,
            reservation.limit,
            now
          ]
        );
        if (result.rowCount === 0) {
          await client.query("ROLLBACK TO SAVEPOINT abuse_capacity_reservation");
          return { admitted: false, reason: "capacity" };
        }
      }

      const expiresAt = new Date(now.getTime() + request.leaseMs);
      await client.query(
        `INSERT INTO abuse_admissions(
           id, tenant_id, actor_ref_hash, client_ref_hash, operation_id,
           quota_class, command_ref_hash, state, outcome, replayed,
           rate_reservations, capacity_reservations, policy_version,
           issued_at, expires_at, completed_at, version, schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, 'pending', NULL, $8,
           $9::jsonb, $10::jsonb, $11, $12, $13, NULL, 1,
           'abuse_admission_record.v1'
         )`,
        [
          request.admissionId,
          this.tenantId,
          request.actorRefHash,
          request.clientRefHash,
          request.operationId,
          request.quotaClass,
          request.commandRefHash ?? null,
          replayed,
          JSON.stringify(rates),
          JSON.stringify(capacities),
          request.policyVersion,
          now,
          expiresAt
        ]
      );
      if (request.commandRefHash && !replayed) {
        const chargeExpiresAt = new Date(now.getTime() + COMMAND_RETENTION_MS);
        if (charge) {
          await client.query(
            `UPDATE abuse_command_charges
                SET status = 'pending', active_admission_id = $3,
                    expires_at = $4, updated_at = $5, version = version + 1
              WHERE tenant_id = $1 AND command_ref_hash = $2`,
            [this.tenantId, request.commandRefHash, request.admissionId, chargeExpiresAt, now]
          );
        } else {
          await client.query(
            `INSERT INTO abuse_command_charges(
               tenant_id, command_ref_hash, operation_id, status,
               active_admission_id, expires_at, updated_at, version, schema_version
             ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, 1, 'abuse_command_charge.v1')`,
            [
              this.tenantId,
              request.commandRefHash,
              request.operationId,
              request.admissionId,
              chargeExpiresAt,
              now
            ]
          );
        }
      }
      await client.query("RELEASE SAVEPOINT abuse_capacity_reservation");
      return {
        admitted: true,
        replayed,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      };
    });
  }

  async finish({ admissionId, tenantId, outcome }) {
    assertAbuseIdentifier("admissionId", admissionId);
    if (tenantId !== this.tenantId || !new Set(["succeeded", "failed"]).has(outcome)) {
      throw abuseError("invalid_abuse_control_input", "admission completion is invalid");
    }
    return this.eventRepository.withTenantWrite(async (client) => {
      await this.#configureTransaction(client);
      const now = await this.#databaseNow(client);
      await this.#cleanupExpired(client, now, admissionId);
      const admission = await this.#selectAdmissionForUpdate(client, admissionId);
      if (admission.state !== "pending") return { state: admission.state };
      const expired = asDate(admission.expires_at) <= now;
      return this.#completeLockedAdmission(
        client,
        admission,
        expired ? "expired" : outcome,
        now,
        !expired && outcome === "succeeded"
      );
    });
  }

  async lockAdmissionInTransaction({
    client,
    admissionId,
    tenantId,
    operationId,
    replayed
  }) {
    if (!client || typeof client.query !== "function") {
      throw abuseError("invalid_abuse_store_config", "an active PostgreSQL transaction client is required");
    }
    assertAbuseIdentifier("admissionId", admissionId);
    assertAbuseIdentifier("operationId", operationId);
    if (tenantId !== this.tenantId || typeof replayed !== "boolean") {
      throw abuseError("invalid_abuse_control_input", "admission transaction lock is invalid");
    }
    await this.#configureTransaction(client);
    const now = await this.#databaseNow(client);
    const admission = await this.#selectAdmissionForUpdate(client, admissionId);
    if (
      admission.state !== "pending" ||
      admission.operation_id !== operationId ||
      admission.policy_version !== ABUSE_POLICY_VERSION ||
      admission.replayed !== replayed
    ) {
      throw abuseError("request_admission_consumed", "request admission is unavailable");
    }
    if (asDate(admission.expires_at) <= now) {
      throw abuseError("request_admission_expired", "request admission has expired");
    }
    const lock = Object.freeze({
      admissionId,
      tenantId,
      operationId,
      replayed,
      lockedAt: now.toISOString()
    });
    trustedAdmissionLocks.add(lock);
    admissionLockFacts.set(lock, { client, completed: false });
    return lock;
  }

  async finishAdmissionInTransaction({ client, lock, outcome, retainPersistentResources = outcome === "succeeded" }) {
    if (!new Set(["succeeded", "failed"]).has(outcome)) {
      throw abuseError("invalid_abuse_control_input", "admission completion is invalid");
    }
    if (typeof retainPersistentResources !== "boolean" || (outcome !== "succeeded" && retainPersistentResources)) {
      throw abuseError("invalid_abuse_control_input", "persistent resource completion is invalid");
    }
    const facts = lock && trustedAdmissionLocks.has(lock) ? admissionLockFacts.get(lock) : undefined;
    if (!facts || facts.client !== client || facts.completed) {
      throw abuseError("request_admission_mismatch", "admission transaction lock is invalid");
    }
    const admission = await this.#selectAdmissionForUpdate(client, lock.admissionId);
    if (
      admission.state !== "pending" ||
      admission.operation_id !== lock.operationId ||
      admission.replayed !== lock.replayed
    ) {
      throw abuseError("request_admission_consumed", "request admission is unavailable");
    }
    const now = await this.#databaseNow(client);
    const result = await this.#completeLockedAdmission(
      client,
      admission,
      outcome,
      now,
      retainPersistentResources
    );
    facts.completed = true;
    return result;
  }

  async release({ tenantId, reservations }) {
    assertQuotaStoreRelease({ tenantId, reservations }, { tenantId: this.tenantId });
    return this.eventRepository.withTenantWrite(async (client) => {
      await this.#configureTransaction(client);
      const now = await this.#databaseNow(client);
      for (const reservation of reservations) {
        const result = await client.query(
          `SELECT kind, used_count FROM abuse_capacity_buckets
            WHERE tenant_id = $1 AND key_hash = $2
            FOR UPDATE`,
          [this.tenantId, reservation.keyHash]
        );
        const current = result.rows[0];
        if (
          !current ||
          current.kind !== reservation.kind ||
          toNumber(current.used_count, "used_count") < reservation.units
        ) {
          throw abuseError("resource_counter_underflow", "resource counter release is invalid");
        }
      }
      for (const reservation of reservations) {
        await this.#decrementCapacity(client, reservation, now);
      }
    });
  }

  async snapshot() {
    return this.eventRepository.withTenantRead(async (client) => {
      const rates = await client.query(
        `SELECT dimension, count(*)::int AS count
           FROM abuse_rate_buckets WHERE tenant_id = $1 GROUP BY dimension ORDER BY dimension`,
        [this.tenantId]
      );
      const capacities = await client.query(
        `SELECT kind, sum(used_count)::bigint AS used
           FROM abuse_capacity_buckets WHERE tenant_id = $1 GROUP BY kind ORDER BY kind`,
        [this.tenantId]
      );
      const admissions = await client.query(
        `SELECT state, count(*)::int AS count
           FROM abuse_admissions WHERE tenant_id = $1 GROUP BY state ORDER BY state`,
        [this.tenantId]
      );
      const charges = await client.query(
        `SELECT status, count(*)::int AS count
           FROM abuse_command_charges WHERE tenant_id = $1 GROUP BY status ORDER BY status`,
        [this.tenantId]
      );
      return {
        rates: Object.fromEntries(rates.rows.map((row) => [row.dimension, row.count])),
        capacities: Object.fromEntries(capacities.rows.map((row) => [row.kind, Number(row.used)])),
        admissions: Object.fromEntries(admissions.rows.map((row) => [row.state, row.count])),
        charges: Object.fromEntries(charges.rows.map((row) => [row.status, row.count]))
      };
    });
  }

  async #cleanupExpired(client, now, excludedAdmissionId) {
    const result = await client.query(
      `SELECT * FROM abuse_admissions
        WHERE tenant_id = $1 AND state = 'pending' AND expires_at <= $2
          AND ($3::text IS NULL OR id <> $3)
        ORDER BY expires_at, id
        LIMIT 100
        FOR UPDATE`,
      [this.tenantId, now, excludedAdmissionId ?? null]
    );
    for (const admission of result.rows) {
      await this.#releaseAdmissionCapacities(client, admission, "expired", now);
      await client.query(
        `UPDATE abuse_admissions
            SET state = 'expired', outcome = 'expired', completed_at = $3,
                version = version + 1
          WHERE tenant_id = $1 AND id = $2`,
        [this.tenantId, admission.id, now]
      );
      if (admission.command_ref_hash && !admission.replayed) {
        await client.query(
          `UPDATE abuse_command_charges
              SET status = 'failed', updated_at = $4, expires_at = $5,
                  version = version + 1
            WHERE tenant_id = $1 AND command_ref_hash = $2
              AND active_admission_id = $3 AND status = 'pending'`,
          [
            this.tenantId,
            admission.command_ref_hash,
            admission.id,
            now,
            new Date(now.getTime() + COMMAND_RETENTION_MS)
          ]
        );
      }
    }
  }

  async #selectAdmissionForUpdate(client, admissionId) {
    const result = await client.query(
      `SELECT * FROM abuse_admissions
        WHERE tenant_id = $1 AND id = $2
        FOR UPDATE`,
      [this.tenantId, admissionId]
    );
    const admission = result.rows[0];
    if (!admission) throw abuseError("admission_not_found", "request admission is not available");
    return admission;
  }

  async #completeLockedAdmission(client, admission, outcome, now, retainPersistentResources = false) {
    const expired = outcome === "expired";
    await this.#releaseAdmissionCapacities(
      client,
      admission,
      retainPersistentResources ? outcome : "failed",
      now
    );
    await client.query(
      `UPDATE abuse_admissions
          SET state = $3, outcome = $4, completed_at = $5, version = version + 1
        WHERE tenant_id = $1 AND id = $2`,
      [
        this.tenantId,
        admission.id,
        expired ? "expired" : "completed",
        outcome,
        now
      ]
    );
    if (admission.command_ref_hash && !admission.replayed) {
      await client.query(
        `UPDATE abuse_command_charges
            SET status = $4, expires_at = $5, updated_at = $5, version = version + 1
          WHERE tenant_id = $1 AND command_ref_hash = $2
            AND active_admission_id = $3 AND status = 'pending'`,
        [
          this.tenantId,
          admission.command_ref_hash,
          admission.id,
          outcome === "succeeded" ? "succeeded" : "failed",
          new Date(now.getTime() + COMMAND_RETENTION_MS)
        ]
      );
    }
    return { state: expired ? "expired" : "completed" };
  }

  async #releaseAdmissionCapacities(client, admission, outcome, now) {
    const reservations = Array.isArray(admission.capacity_reservations)
      ? admission.capacity_reservations
      : JSON.parse(admission.capacity_reservations);
    for (const reservation of reservations) {
      if (reservation.release === "always" || (outcome !== "succeeded" && reservation.release === "on_failure")) {
        await this.#decrementCapacity(client, reservation, now);
      }
    }
  }

  async #decrementCapacity(client, reservation, now) {
    const result = await client.query(
      `UPDATE abuse_capacity_buckets
          SET used_count = used_count - $3, updated_at = $4, version = version + 1
        WHERE tenant_id = $1 AND key_hash = $2 AND used_count >= $3
        RETURNING used_count`,
      [this.tenantId, reservation.keyHash, reservation.units, now]
    );
    if (result.rowCount === 0) {
      throw abuseError("quota_store_corrupt", "capacity reservation is unavailable");
    }
    if (toNumber(result.rows[0].used_count, "used_count") === 0) {
      await client.query(
        "DELETE FROM abuse_capacity_buckets WHERE tenant_id = $1 AND key_hash = $2",
        [this.tenantId, reservation.keyHash]
      );
    }
  }

  async #configureTransaction(client) {
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      `${this.statementTimeoutMs}ms`
    ]);
  }

  async #databaseNow(client) {
    const result = await client.query("SELECT clock_timestamp() AS now");
    const now = asDate(result.rows[0]?.now);
    if (!Number.isFinite(now.getTime())) throw abuseError("quota_store_clock_invalid", "database clock is invalid");
    return now;
  }

  #assertRequest(request) {
    assertQuotaStoreRequest(request, {
      tenantId: this.tenantId,
      requireActorClient: true
    });
  }
}
