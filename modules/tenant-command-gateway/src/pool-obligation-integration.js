import {
  CreditEventType,
  DomainError,
  createCreditEvent,
  createInitialPoolObligationProjection,
  createPoolObligationBinding,
  createPoolObligationEffectPlan,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository,
  PostgresEventRepository
} from "../../persistence/src/index.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function assertServiceContext(tenantContext) {
  if (
    !tenantContext || typeof tenantContext !== "object" ||
    typeof tenantContext.tenantId !== "string" ||
    typeof tenantContext.actorId !== "string" ||
    typeof tenantContext.policyVersion !== "string"
  ) fail("invalid_pool_obligation_service", "a Tenant-scoped service context is required");
  return tenantContext;
}

function existingResult(command) {
  if (!command) return undefined;
  if (!command.response || command.replayed !== true) {
    fail("pool_obligation_command_incomplete", "Pool Obligation command outcome is not complete");
  }
  return Object.freeze({ ...command.response, replayed: true });
}

async function projection(coreRepository, client, type, id, { lock = true } = {}) {
  const state = await coreRepository.getProjectionStateInTransaction(client, type, id, { lock });
  if (!state?.value) fail("pool_obligation_resource_unavailable", "required canonical resource is unavailable");
  return state;
}

function bindingResponse(binding, projectionValue) {
  return Object.freeze({
    poolObligationBindingId: binding.poolObligationBindingId,
    bindingHash: binding.bindingHash,
    obligationId: binding.obligationId,
    subjectId: binding.subjectId,
    principalId: binding.principalId,
    accountBindingId: binding.accountBindingId,
    chainId: binding.chainId,
    contractAddress: binding.contractAddress,
    marketId: binding.marketId,
    projectionHash: projectionValue.projectionHash,
    entryMode: binding.entryMode,
    selfPrincipal: true,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "pool_obligation_binding_result.v1"
  });
}

export class PoolObligationIntegrationService {
  constructor({ pool, tenantContext, clock = () => new Date() } = {}) {
    if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") {
      fail("invalid_pool_obligation_service", "a pg-compatible pool is required");
    }
    if (typeof clock !== "function") fail("invalid_pool_obligation_service", "clock must be a function");
    this.eventRepository = new PostgresEventRepository({
      pool,
      tenantContext: assertServiceContext(tenantContext),
      sourceSystem: "ipo.one.pool-obligation-integration.v1",
      transactionRetries: 3
    });
    this.coreRepository = new PostgresCoreRepository({ pool, eventRepository: this.eventRepository });
    this.clock = clock;
  }

  async bindPosition({ subjectId, principalId, accountBindingId, obligationId, descriptor }) {
    const commandCore = { subjectId, principalId, accountBindingId, obligationId, descriptor };
    const commandHash = hashId("pool_obligation_binding_command", commandCore);
    const idempotencyKey = `pool-obligation-binding:${obligationId}`;
    return this.eventRepository.withTenantWrite(async (client) => {
      const replay = existingResult(await this.eventRepository.findCommandInTransaction(client, {
        idempotencyKey,
        commandHash,
        expectedAggregateType: "pool_obligation_binding",
        lock: true
      }));
      if (replay) return replay;

      const subjectState = await projection(this.coreRepository, client, CoreProjectionType.SUBJECT, subjectId);
      const principalState = await projection(this.coreRepository, client, CoreProjectionType.PRINCIPAL, principalId);
      const accountBindingState = await projection(
        this.coreRepository, client, CoreProjectionType.ACCOUNT_BINDING, accountBindingId
      );
      const obligationState = await projection(this.coreRepository, client, CoreProjectionType.OBLIGATION, obligationId);
      const now = this.clock();
      const binding = createPoolObligationBinding({
        subject: subjectState.value,
        principal: principalState.value,
        accountBinding: accountBindingState.value,
        obligation: obligationState.value,
        descriptor,
        now
      });
      const initialProjection = createInitialPoolObligationProjection(binding, { now });
      const response = bindingResponse(binding, initialProjection);
      const bindingEvent = createCreditEvent({
        eventType: CreditEventType.POOL_OBLIGATION_BOUND,
        subjectId,
        obligationId,
        chainId: descriptor.chainId,
        payload: {
          poolObligationBindingId: binding.poolObligationBindingId,
          bindingHash: binding.bindingHash,
          subjectId,
          principalId,
          accountBindingId,
          accountHash: binding.accountHash,
          obligationId,
          obligationHash: binding.obligationHash,
          chainId: binding.chainId,
          contractAddress: binding.contractAddress,
          marketId: binding.marketId,
          positionAccountHash: binding.positionAccountHash,
          entryMode: binding.entryMode,
          selfPrincipal: true,
          syntheticOnly: true,
          productionFundsMoved: false
        },
        now
      });
      const obligationEvent = createCreditEvent({
        eventType: CreditEventType.POOL_OBLIGATION_BOUND,
        subjectId,
        obligationId,
        chainId: descriptor.chainId,
        payload: {
          poolObligationBindingId: binding.poolObligationBindingId,
          bindingHash: binding.bindingHash,
          obligationId,
          obligationHash: binding.obligationHash,
          canonicalObligationRemainsAuthoritative: true,
          syntheticOnly: true,
          productionFundsMoved: false
        },
        now
      });
      const obligation = {
        ...obligationState.value,
        poolObligationBindingId: binding.poolObligationBindingId,
        updatedAt: now.toISOString()
      };
      const committed = await this.coreRepository.commitCommandInTransaction(client, {
        aggregateType: "pool_obligation_binding",
        aggregateId: binding.poolObligationBindingId,
        idempotencyKey,
        commandHash,
        events: [
          {
            aggregateType: "pool_obligation_binding",
            aggregateId: binding.poolObligationBindingId,
            expectedVersion: 0,
            event: bindingEvent
          },
          {
            aggregateType: "obligation",
            aggregateId: obligationId,
            expectedVersion: obligationState.aggregateVersion,
            event: obligationEvent
          }
        ],
        writes: [
          { type: CoreProjectionType.POOL_OBLIGATION_BINDING, value: binding, eventId: bindingEvent.eventId },
          { type: CoreProjectionType.POOL_OBLIGATION_PROJECTION, value: initialProjection, eventId: bindingEvent.eventId },
          { type: CoreProjectionType.OBLIGATION, value: obligation, eventId: obligationEvent.eventId }
        ],
        response
      });
      return Object.freeze({ ...committed.response, replayed: committed.replayed });
    });
  }

  async importFinalizedEffect({ poolObligationBindingId, effectHash }) {
    const commandHash = hashId("pool_obligation_effect_import_command", {
      poolObligationBindingId,
      effectHash
    });
    const idempotencyKey = `pool-obligation-effect:${effectHash}`;
    return this.eventRepository.withTenantWrite(async (client) => {
      const replay = existingResult(await this.eventRepository.findCommandInTransaction(client, {
        idempotencyKey,
        commandHash,
        expectedAggregateType: "obligation",
        lock: true
      }));
      if (replay) return replay;

      const bindingState = await projection(
        this.coreRepository,
        client,
        CoreProjectionType.POOL_OBLIGATION_BINDING,
        poolObligationBindingId
      );
      const binding = bindingState.value;
      const subjectState = await projection(
        this.coreRepository, client, CoreProjectionType.SUBJECT, binding.subjectId
      );
      const principalState = await projection(
        this.coreRepository, client, CoreProjectionType.PRINCIPAL, binding.principalId
      );
      const accountBindingState = await projection(
        this.coreRepository, client, CoreProjectionType.ACCOUNT_BINDING, binding.accountBindingId
      );
      const obligationState = await projection(
        this.coreRepository, client, CoreProjectionType.OBLIGATION, binding.obligationId
      );
      const projectionState = await projection(
        this.coreRepository,
        client,
        CoreProjectionType.POOL_OBLIGATION_PROJECTION,
        `pool_obligation_projection_${binding.bindingHash.slice(2)}`
      );
      const reproduced = createPoolObligationBinding({
        subject: subjectState.value,
        principal: principalState.value,
        accountBinding: accountBindingState.value,
        obligation: obligationState.value,
        descriptor: {
          chainId: binding.chainId,
          contractAddress: binding.contractAddress,
          marketId: binding.marketId,
          abiVersion: binding.abiVersion
        },
        existingBinding: binding,
        now: new Date(binding.boundAt)
      });
      if (reproduced.bindingHash !== binding.bindingHash || binding.status !== "active") {
        fail("pool_obligation_binding_stale", "Pool Obligation binding is no longer exact and active");
      }

      const source = await client.query(
        `SELECT e.event_key, e.observation_hash, e.effect_hash, e.state_hash,
                e.projection, e.recorded_at, o.normalized_observation
           FROM pool_chain_finalized_effects e
           JOIN pool_chain_observations o
             ON o.tenant_id = e.tenant_id
            AND o.observation_hash = e.observation_hash
          WHERE e.effect_hash = $1
          FOR UPDATE OF e`,
        [effectHash]
      );
      if (source.rowCount !== 1) {
        fail("pool_effect_unavailable", "finalized Pool effect and observation are unavailable");
      }
      const row = source.rows[0];
      const observation = row.normalized_observation;
      const effect = {
        eventKey: row.event_key,
        observationHash: row.observation_hash,
        projectionHash: row.projection.snapshotHash,
        stateHash: row.state_hash,
        eventType: observation.eventType,
        recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
        effectHash: row.effect_hash,
        projection: row.projection,
        schemaVersion: "pool_finalized_effect.v1"
      };
      const plan = createPoolObligationEffectPlan({
        binding,
        obligation: obligationState.value,
        observation,
        effect,
        previousProjection: projectionState.value,
        now: this.clock()
      });
      const response = Object.freeze({
        poolObligationBindingId,
        obligationId: binding.obligationId,
        effectHash,
        effectReceiptId: plan.receipt.poolObligationEffectReceiptId,
        projectionVersion: plan.projection.projectionVersion,
        projectionHash: plan.projection.projectionHash,
        ledgerTransactionIds: plan.receipt.ledgerTransactionIds,
        creditStateCandidate: plan.receipt.creditStateCandidate,
        creditStateAuthorizing: false,
        automaticLimitChange: false,
        finality: "finalized",
        syntheticOnly: true,
        productionFundsMoved: false,
        schemaVersion: "pool_obligation_effect_import_result.v1"
      });
      const writes = [];
      if (plan.ledgerTransactions.length > 0) {
        for (const account of Object.values(plan.accounts)) {
          writes.push({ type: CoreProjectionType.LEDGER_ACCOUNT, value: account, eventId: plan.event.eventId });
        }
      }
      if (plan.executionReceipt) {
        writes.push({
          type: CoreProjectionType.POOL_EXECUTION_RECEIPT,
          value: plan.executionReceipt,
          eventId: plan.event.eventId
        });
      }
      for (const transaction of plan.ledgerTransactions) {
        writes.push({ type: CoreProjectionType.LEDGER_TRANSACTION, value: transaction, eventId: plan.event.eventId });
      }
      writes.push(
        { type: CoreProjectionType.POOL_OBLIGATION_PROJECTION, value: plan.projection, eventId: plan.event.eventId },
        { type: CoreProjectionType.POOL_OBLIGATION_EFFECT_RECEIPT, value: plan.receipt, eventId: plan.event.eventId }
      );
      if (plan.obligation) {
        writes.push({ type: CoreProjectionType.OBLIGATION, value: plan.obligation, eventId: plan.event.eventId });
      }
      const committed = await this.coreRepository.commitCommandInTransaction(client, {
        aggregateType: "obligation",
        aggregateId: binding.obligationId,
        idempotencyKey,
        commandHash,
        events: [{
          aggregateType: "obligation",
          aggregateId: binding.obligationId,
          expectedVersion: obligationState.aggregateVersion,
          event: plan.event
        }],
        writes,
        response
      });
      return Object.freeze({ ...committed.response, replayed: committed.replayed });
    });
  }
}
