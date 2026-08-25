import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  verifyM2BDualRiskRecoveryIncident,
  verifyM2BDualRiskSnapshot
} from "./m2b-dual-risk-recovery.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,255}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_m2b_dual_risk_repository_input", `${name} is invalid`);
  }
  return value;
}

function parse(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function map(row) {
  if (!row) return undefined;
  const snapshot = parse(row.snapshot_record);
  const incident = parse(row.incident_record);
  verifyM2BDualRiskSnapshot(snapshot);
  verifyM2BDualRiskRecoveryIncident(incident);
  return { snapshot, incident };
}

export class PostgresM2BDualRiskRepository {
  #events;

  constructor({ eventRepository, ...unknown } = {}) {
    if (Object.keys(unknown).length !== 0 || !eventRepository ||
      typeof eventRepository.withTenantRead !== "function" ||
      typeof eventRepository.withTenantWrite !== "function") {
      fail("invalid_m2b_dual_risk_repository", "Tenant PostgreSQL event repository required");
    }
    this.#events = eventRepository;
  }

  async open({ snapshot, incident, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0 || typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 || idempotencyKey.length > 512) {
      fail("invalid_m2b_dual_risk_repository_input", "closed incident and idempotency key required");
    }
    verifyM2BDualRiskSnapshot(snapshot);
    verifyM2BDualRiskRecoveryIncident(incident);
    if (incident.snapshotHash !== snapshot.snapshotHash ||
      incident.compositionId !== snapshot.compositionId ||
      incident.compositionHash !== snapshot.compositionHash ||
      incident.version !== 1 || incident.state !== "OPEN") {
      fail("m2b_dual_risk_incident_binding_denied", "incident does not bind the exact snapshot");
    }
    const idempotencyKeyHash = hashId("m2b_dual_risk_incident_idempotency", {
      idempotencyKey
    });
    return this.#events.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`m2b_dual_risk_incident:${idempotencyKeyHash}`]
      );
      const replay = await client.query(
        `SELECT incident_hash, snapshot_record, incident_record
           FROM agent_dual_risk_incidents
          WHERE idempotency_key_hash = $1 FOR UPDATE`,
        [idempotencyKeyHash]
      );
      if (replay.rowCount === 1) {
        if (replay.rows[0].incident_hash !== incident.incidentHash) {
          fail("m2b_dual_risk_idempotency_conflict", "idempotency key already binds another incident");
        }
        return { ...map(replay.rows[0]), replayed: true };
      }
      const transitionCore = {
        incidentId: incident.dualRiskIncidentId,
        incidentHash: incident.incidentHash,
        sequence: 1,
        previousState: null,
        nextState: "OPEN",
        currentStage: incident.currentStage,
        changedAt: incident.openedAt,
        externalWriteAuthorized: false,
        externalNonceAllocated: false,
        signatureCreated: false,
        networkCalled: false,
        schemaVersion: "m2b_dual_risk_incident_transition.v1"
      };
      const transitionHash = hashId("m2b_dual_risk_incident_transition", transitionCore);
      await client.query(
        `INSERT INTO agent_dual_risk_incidents(
           id, incident_hash, idempotency_key_hash, composition_id,
           composition_hash, snapshot_hash, subject_id, principal_id,
           obligation_id, trading_facility_id, combined_risk_state, state,
           current_stage, version, opened_at, snapshot_record, incident_record,
           protective_authority_can_expand_risk, external_write_authorized,
           external_nonce_allocated, signature_created, network_called,
           production_authority, real_funds_authority, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'OPEN',$12,1,$13,$14::JSONB,
           $15::JSONB,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,$16
         )`,
        [
          incident.dualRiskIncidentId, incident.incidentHash, idempotencyKeyHash,
          incident.compositionId, incident.compositionHash, incident.snapshotHash,
          incident.subjectId, incident.principalId, incident.obligationId,
          incident.tradingFacilityId, incident.combinedRiskState,
          incident.currentStage, incident.openedAt, JSON.stringify(snapshot),
          JSON.stringify(incident), incident.schemaVersion
        ]
      );
      await client.query(
        `INSERT INTO agent_dual_risk_incident_transitions(
           id, incident_id, incident_hash, sequence, previous_state, next_state,
           current_stage, transition_hash, changed_at, external_write_authorized,
           external_nonce_allocated, signature_created, network_called,
           schema_version
         ) VALUES ($1,$2,$3,1,NULL,'OPEN',$4,$5,$6,FALSE,FALSE,FALSE,FALSE,$7)`,
        [
          `m2b_dual_risk_incident_transition_${transitionHash.slice(2)}`,
          incident.dualRiskIncidentId, incident.incidentHash,
          incident.currentStage, transitionHash, incident.openedAt,
          transitionCore.schemaVersion
        ]
      );
      return { snapshot, incident, replayed: false };
    });
  }

  async findById(incidentId) {
    const checkedId = identifier("incidentId", incidentId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT snapshot_record, incident_record FROM agent_dual_risk_incidents WHERE id = $1",
        [checkedId]
      );
      return map(result.rows[0]);
    });
  }

  async findLatestByFacility(tradingFacilityId) {
    const checkedId = identifier("tradingFacilityId", tradingFacilityId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT snapshot_record, incident_record FROM agent_dual_risk_incidents
          WHERE trading_facility_id = $1 ORDER BY opened_at DESC, id DESC LIMIT 1`,
        [checkedId]
      );
      return map(result.rows[0]);
    });
  }
}
