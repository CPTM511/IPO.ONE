import {
  DomainError,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";

export const TENANT_COMMAND_PAUSE_SCHEMA_VERSION =
  "tenant_command_pause.v1";

const REASON_CODES = new Set([
  "incident_containment",
  "manual_local_safety_pause",
  "reconciliation_integrity"
]);

function invalid(code, message) {
  throw new DomainError(code, message);
}

function assertRepository(repository) {
  if (
    !repository ||
    typeof repository.withTenantWrite !== "function" ||
    typeof repository.findCommandInTransaction !== "function" ||
    typeof repository.appendCommandBatchInTransaction !== "function" ||
    !repository.tenantContext?.tenantId ||
    !repository.tenantContext?.actorId
  ) {
    invalid(
      "invalid_tenant_command_pause_store",
      "a Tenant-scoped Event Repository is required"
    );
  }
  return repository;
}

function assertIdempotencyKey(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/.test(value)
  ) {
    invalid(
      "invalid_tenant_command_pause",
      "idempotencyKey is invalid"
    );
  }
  return value;
}

export class PostgresTenantCommandPauseStore {
  constructor({ eventRepository, clock = () => new Date() }) {
    this.eventRepository = assertRepository(eventRepository);
    if (typeof clock !== "function") {
      invalid("invalid_tenant_command_pause_store", "clock must be a function");
    }
    this.clock = clock;
  }

  async pause({ reasonCode, idempotencyKey }) {
    if (!REASON_CODES.has(reasonCode)) {
      invalid(
        "invalid_tenant_command_pause",
        "reasonCode is not an approved closed value"
      );
    }
    const checkedIdempotencyKey = assertIdempotencyKey(idempotencyKey);
    const aggregateId = "tenant_command_pause_global";
    const actorRefHash = hashId("tenant_command_pause.actor", {
      actorId: this.eventRepository.tenantContext.actorId
    });
    const commandHash = hashId("tenant_command_pause.command", {
      aggregateId,
      reasonCode,
      actorRefHash
    });
    return this.eventRepository.withTenantWrite(async (client) => {
      const replay = await this.eventRepository.findCommandInTransaction(client, {
        idempotencyKey: checkedIdempotencyKey,
        commandHash,
        expectedAggregateType: "tenant_command_pause",
        expectedAggregateId: aggregateId,
        lock: true
      });
      if (replay) return { ...replay.response, replayed: true };
      const existing = await client.query(
        "SELECT id FROM tenant_command_pauses WHERE id = $1",
        [aggregateId]
      );
      if (existing.rowCount > 0) {
        invalid(
          "tenant_commands_already_paused",
          "Tenant commands are already paused"
        );
      }
      const pausedAt = this.clock().toISOString();
      const pauseCore = {
        tenantRefHash: hashId("tenant_command_pause.tenant", {
          tenantId: this.eventRepository.tenantContext.tenantId
        }),
        scope: "all_commands",
        reasonCode,
        actorRefHash,
        pausedAt,
        queriesAllowed: true,
        backgroundEvidenceAllowed: true,
        commandExecutionAllowed: false,
        unpauseAvailable: false,
        authorizing: false,
        fundsAuthority: false,
        economicStateMutation: false,
        productionAuthority: false,
        sandboxOnly: true
      };
      const pauseHash = hashId("tenant_command_pause", pauseCore);
      const pause = {
        tenantCommandPauseId: aggregateId,
        pauseHash,
        ...pauseCore,
        schemaVersion: TENANT_COMMAND_PAUSE_SCHEMA_VERSION
      };
      const event = createCreditEvent({
        eventType: "tenant_commands_paused",
        payload: {
          tenantCommandPauseId: aggregateId,
          pauseHash,
          tenantRefHash: pause.tenantRefHash,
          scope: pause.scope,
          reasonCode,
          actorRefHash,
          pausedAt,
          queriesAllowed: true,
          backgroundEvidenceAllowed: true,
          commandExecutionAllowed: false,
          unpauseAvailable: false,
          authorizing: false,
          fundsAuthority: false,
          economicStateMutation: false,
          productionAuthority: false,
          sandboxOnly: true
        },
        now: new Date(pausedAt)
      });
      const response = {
        tenantCommandPause: pause,
        schemaVersion: "tenant_command_pause_result.v1"
      };
      const committed = await this.eventRepository.appendCommandBatchInTransaction(
        client,
        {
          aggregateType: "tenant_command_pause",
          aggregateId,
          idempotencyKey: checkedIdempotencyKey,
          commandHash,
          events: [{
            aggregateType: "tenant_command_pause",
            aggregateId,
            expectedVersion: 0,
            event
          }],
          response,
          applyProjection: async ({
            client: projectionClient,
            committed: committedEvents
          }) => {
            await projectionClient.query(
              `INSERT INTO tenant_command_pauses(
                 id, pause_hash, tenant_ref_hash, scope, reason_code,
                 actor_ref_hash, paused_at, source_event_id,
                 pause_evidence_hash, queries_allowed,
                 background_evidence_allowed, command_execution_allowed,
                 unpause_available, authorizing, funds_authority,
                 economic_state_mutation, production_authority, sandbox_only,
                 pause, schema_version
               ) VALUES (
                 $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
               )`,
              [
                pause.tenantCommandPauseId,
                pause.pauseHash,
                pause.tenantRefHash,
                pause.scope,
                pause.reasonCode,
                pause.actorRefHash,
                pause.pausedAt,
                committedEvents[0].event.eventId,
                committedEvents[0].evidence.evidenceHash,
                pause.queriesAllowed,
                pause.backgroundEvidenceAllowed,
                pause.commandExecutionAllowed,
                pause.unpauseAvailable,
                pause.authorizing,
                pause.fundsAuthority,
                pause.economicStateMutation,
                pause.productionAuthority,
                pause.sandboxOnly,
                JSON.stringify(pause),
                pause.schemaVersion
              ]
            );
          }
        }
      );
      return { ...committed.response, replayed: committed.replayed };
    });
  }
}

export async function assertTenantCommandsNotPaused(client) {
  if (!client || typeof client.query !== "function") {
    invalid(
      "invalid_tenant_command_pause_store",
      "Tenant command pause check requires a transaction client"
    );
  }
  const result = await client.query(
    `SELECT pause_hash, reason_code, paused_at
       FROM tenant_command_pauses
      WHERE id = 'tenant_command_pause_global'
      LIMIT 1`
  );
  if (result.rowCount > 0) {
    throw new DomainError(
      "tenant_commands_paused",
      "Tenant command execution is paused; queries and Evidence processing remain available",
      {
        pauseHash: result.rows[0].pause_hash,
        reasonCode: result.rows[0].reason_code,
        pausedAt: result.rows[0].paused_at
      }
    );
  }
}
