import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { verifyM2BSecuredFacilityComposition } from "./m2b-secured-facility-composition.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,255}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_m2b_composition_repository_input", `${name} is invalid`);
  }
  return value;
}

function mapComposition(row) {
  if (!row) return undefined;
  const composition = typeof row.composition_record === "string"
    ? JSON.parse(row.composition_record)
    : row.composition_record;
  verifyM2BSecuredFacilityComposition(composition);
  return composition;
}

export class PostgresM2BCompositionRepository {
  #events;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 || !eventRepository ||
      typeof eventRepository.withTenantRead !== "function" ||
      typeof eventRepository.withTenantWrite !== "function"
    ) {
      fail("invalid_m2b_composition_repository", "Tenant PostgreSQL event repository required");
    }
    this.#events = eventRepository;
  }

  async prepare({ composition, idempotencyKey, ...unknown }) {
    if (Object.keys(unknown).length !== 0 || typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 || idempotencyKey.length > 512) {
      fail("invalid_m2b_composition_repository_input", "closed composition and idempotency key required");
    }
    verifyM2BSecuredFacilityComposition(composition);
    if (composition.state !== "PREPARED" || composition.version !== 1) {
      fail("m2b_composition_prewrite_only", "only immutable PREPARED composition is accepted");
    }
    const idempotencyKeyHash = hashId("m2b_hyperliquid_composition_idempotency", {
      idempotencyKey
    });
    return this.#events.withTenantWrite(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`m2b_hyperliquid_composition:${idempotencyKeyHash}`]
      );
      const replay = await client.query(
        `SELECT composition_hash, composition_record
           FROM agent_hyperliquid_compositions
          WHERE idempotency_key_hash = $1 FOR UPDATE`,
        [idempotencyKeyHash]
      );
      if (replay.rowCount === 1) {
        if (replay.rows[0].composition_hash !== composition.compositionHash) {
          fail("m2b_composition_idempotency_conflict", "idempotency key already binds another composition");
        }
        return { composition: mapComposition(replay.rows[0]), replayed: true };
      }
      const transitionCore = {
        compositionId: composition.m2bHyperliquidCompositionId,
        compositionHash: composition.compositionHash,
        sequence: 1,
        previousState: null,
        nextState: "PREPARED",
        changedAt: composition.preparedAt,
        externalNonceAllocated: false,
        signatureCreated: false,
        networkCalled: false,
        retryAllowed: false,
        schemaVersion: "m2b_hyperliquid_composition_transition.v1"
      };
      const transitionHash = hashId("m2b_hyperliquid_composition_transition", transitionCore);
      await client.query(
        `INSERT INTO agent_hyperliquid_compositions(
           id, composition_hash, idempotency_key_hash,
           agent_secured_facility_authorization_id,
           agent_secured_facility_authorization_hash,
           agent_secured_facility_authorization_version,
           hypercore_intent_id, hypercore_intent_hash, subject_id, principal_id,
           obligation_id, trading_facility_id, facility_hash,
           policy_constraint_hash, payload_hash, signer_reference_hash,
           state, version, prepared_at, expires_at, composition_record,
           external_nonce_allocated, signature_created, network_called,
           retry_allowed, withdrawal_authority, transfer_authority,
           leverage_change_authority, mainnet_authority, production_authority,
           real_funds_authority, schema_version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
           'PREPARED',1,$17,$18,$19::JSONB,FALSE,FALSE,FALSE,FALSE,FALSE,
           FALSE,FALSE,FALSE,FALSE,FALSE,$20
         )`,
        [
          composition.m2bHyperliquidCompositionId, composition.compositionHash,
          idempotencyKeyHash, composition.agentSecuredFacilityAuthorizationId,
          composition.agentSecuredFacilityAuthorizationHash,
          composition.agentSecuredFacilityAuthorizationVersion,
          composition.hypercoreIntentId, composition.hypercoreIntentHash,
          composition.subjectId, composition.principalId, composition.obligationId,
          composition.tradingFacilityId, composition.facilityHash,
          composition.policyConstraintHash, composition.payloadHash,
          composition.signerReferenceHash, composition.preparedAt,
          composition.expiresAt, JSON.stringify(composition), composition.schemaVersion
        ]
      );
      await client.query(
        `INSERT INTO agent_hyperliquid_composition_transitions(
           id, composition_id, composition_hash, sequence, previous_state,
           next_state, transition_hash, changed_at, external_nonce_allocated,
           signature_created, network_called, retry_allowed, schema_version
         ) VALUES ($1,$2,$3,1,NULL,'PREPARED',$4,$5,FALSE,FALSE,FALSE,FALSE,$6)`,
        [
          `m2b_hyperliquid_composition_transition_${transitionHash.slice(2)}`,
          composition.m2bHyperliquidCompositionId, composition.compositionHash,
          transitionHash, composition.preparedAt, transitionCore.schemaVersion
        ]
      );
      return { composition, replayed: false };
    });
  }

  async findById(compositionId) {
    const checkedId = identifier("compositionId", compositionId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        "SELECT composition_record FROM agent_hyperliquid_compositions WHERE id = $1",
        [checkedId]
      );
      return mapComposition(result.rows[0]);
    });
  }

  async findByFacility(tradingFacilityId) {
    const checkedId = identifier("tradingFacilityId", tradingFacilityId);
    return this.#events.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT composition_record FROM agent_hyperliquid_compositions
          WHERE trading_facility_id = $1 ORDER BY prepared_at DESC, id DESC LIMIT 1`,
        [checkedId]
      );
      return mapComposition(result.rows[0]);
    });
  }
}
