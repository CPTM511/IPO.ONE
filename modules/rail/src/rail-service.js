import {
  CreditEventType,
  DomainError,
  FinalityStatus,
  MandateCapability,
  ProviderStatus,
  SettlementFinality,
  SettlementOutcome,
  SpendRequestStatus,
  TransferDirection,
  TransferIntentStatus,
  TransferIntentTransitions,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertTransition,
  createAccountHash,
  createCreditEvent,
  createTransferIntent,
  hashId
} from "../../../packages/domain/src/index.js";
import { EventStoreEventRepository } from "./event-store-event-repository.js";
import { runSandboxRailAdapterConformance } from "./sandbox-rail-adapter.js";

const RAIL_EVENT_TYPES = new Set([
  CreditEventType.TRANSFER_INTENT_CREATED,
  CreditEventType.TRANSFER_QUOTED,
  CreditEventType.TRANSFER_AUTHORIZED,
  CreditEventType.TRANSFER_SUBMITTED,
  CreditEventType.TRANSFER_EXPIRED,
  CreditEventType.SETTLEMENT_RECEIPT_RECORDED
]);

function clone(value) {
  return structuredClone(value);
}

function statusForReceipt(receipt) {
  if (receipt.outcome === SettlementOutcome.FAILED) return TransferIntentStatus.FAILED;
  if (receipt.outcome === SettlementOutcome.REVERSED) return TransferIntentStatus.REVERSED;
  return receipt.finality === SettlementFinality.FINALIZED
    ? TransferIntentStatus.SETTLED
    : TransferIntentStatus.PENDING;
}

function sourceFinalityForReceipt(receipt) {
  return {
    [SettlementFinality.PENDING]: FinalityStatus.PENDING,
    [SettlementFinality.CONFIRMED]: FinalityStatus.CONFIRMED,
    [SettlementFinality.FINALIZED]: FinalityStatus.FINALIZED
  }[receipt.finality];
}

export class RailService {
  constructor({ eventStore, eventRepository, policyDecisionService, authorizationService, adapters }) {
    if ((!eventStore && !eventRepository) || !policyDecisionService || !authorizationService) {
      throw new DomainError(
        "rail_dependency_missing",
        "Rail Service requires an event repository, policy-decision service, and authorization service"
      );
    }
    if (!Array.isArray(adapters) || adapters.length === 0) {
      throw new DomainError("rail_adapter_missing", "Rail Service requires at least one sandbox adapter");
    }
    this.eventRepository = eventRepository ?? new EventStoreEventRepository({ eventStore });
    this.policyDecisionService = policyDecisionService;
    this.authorizationService = authorizationService;
    this.adapters = new Map();
    this.conformance = new Map();
    for (const adapter of adapters) {
      const report = runSandboxRailAdapterConformance(adapter);
      if (this.adapters.has(report.railId)) {
        throw new DomainError("duplicate_rail_adapter", "rail adapter ids must be unique", { railId: report.railId });
      }
      this.adapters.set(report.railId, adapter);
      this.conformance.set(report.railId, report);
    }
  }

  get defaultRailId() {
    return this.adapters.keys().next().value;
  }

  listRails() {
    return [...this.adapters.values()].map((adapter) => adapter.getDescriptor());
  }

  getConformance(railId) {
    return clone(this.#requireConformance(railId));
  }

  getProviderSettlementAccountRefHash(spendRequestId) {
    const decision = this.policyDecisionService.getSpendRequest(spendRequestId);
    const provider = this.policyDecisionService.getProvider(decision.providerId);
    return createAccountHash(provider.settlementAccountIdRef);
  }

  async createProviderSpendIntent(input) {
    const {
      spendRequestId,
      railId = this.defaultRailId,
      direction = TransferDirection.NATIVE,
      sourceAccountRefHash,
      destinationAsset,
      scale = 2,
      idempotencyKey,
      now = new Date()
    } = input;
    assertNoRawPiiReference(input, "railCommand");
    for (const name of ["spendRequestId", "railId", "sourceAccountRefHash", "idempotencyKey"]) {
      const value = { spendRequestId, railId, sourceAccountRefHash, idempotencyKey }[name];
      assertNonEmptyString(name, value);
    }
    const spendRequest = this.policyDecisionService.getSpendRequest(spendRequestId);
    const provider = this.policyDecisionService.getProvider(spendRequest.providerId);
    this.#requireAdapter(railId);
    const intent = createTransferIntent({
      subjectId: spendRequest.subjectId,
      mandateId: spendRequest.mandateId,
      policyDecisionRef: spendRequest.spendRequestId,
      providerId: spendRequest.providerId,
      purposeCode: spendRequest.purposeCode,
      railId,
      direction,
      sourceMoney: { assetId: spendRequest.assetId, amountMinor: spendRequest.amountMinor, scale },
      destinationAsset: destinationAsset ?? { assetId: spendRequest.assetId, scale },
      sourceAccountRefHash,
      destinationAccountRefHash: createAccountHash(provider.settlementAccountIdRef),
      idempotencyKey,
      now
    });
    const commandHash = hashId("rail_command", { command: "create", requestHash: intent.requestHash });
    const replay = await this.#findCommandReplay(idempotencyKey, commandHash);
    if (replay) return this.getTransferIntent(replay.payload.transferIntentId);
    if (spendRequest.status !== SpendRequestStatus.APPROVED) {
      throw new DomainError("rail_policy_decision_not_approved", "transfer intent requires an approved spend decision", {
        spendRequestId,
        status: spendRequest.status
      });
    }
    if (provider.status !== ProviderStatus.ALLOWLISTED) {
      throw new DomainError("rail_provider_not_allowlisted", "transfer destination provider is not allowlisted");
    }
    const persisted = await this.#append({
      eventType: CreditEventType.TRANSFER_INTENT_CREATED,
      intent,
      idempotencyKey,
      commandHash,
      payload: { intent },
      now
    });
    return this.getTransferIntent(persisted.payload.transferIntentId);
  }

  async quoteTransfer({ transferIntentId, idempotencyKey, expectedVersion, now = new Date() }) {
    const commandHash = hashId("rail_command", { command: "quote", transferIntentId });
    const replay = await this.#findCommandReplay(idempotencyKey, commandHash);
    if (replay) return this.getTransferIntent(replay.payload.transferIntentId);
    const intent = await this.getTransferIntent(transferIntentId);
    this.#assertExpectedVersion(intent, expectedVersion);
    assertTransition("transfer_intent", TransferIntentTransitions, intent.status, TransferIntentStatus.QUOTED);
    const quote = this.#requireAdapter(intent.railId).createQuote({ transferIntent: intent, idempotencyKey, now });
    const persisted = await this.#append({
      eventType: CreditEventType.TRANSFER_QUOTED,
      intent,
      idempotencyKey,
      commandHash,
      payload: { quote, resultingStatus: TransferIntentStatus.QUOTED },
      now
    });
    return this.getTransferIntent(persisted.payload.transferIntentId);
  }

  async authorizeTransfer({ transferIntentId, actorRef, idempotencyKey, expectedVersion, now = new Date() }) {
    assertNonEmptyString("actorRef", actorRef);
    const commandHash = hashId("rail_command", { command: "authorize", transferIntentId, actorRef });
    const replay = await this.#findCommandReplay(idempotencyKey, commandHash);
    if (replay) return this.getTransferIntent(replay.payload.transferIntentId);
    const intent = await this.getTransferIntent(transferIntentId);
    this.#assertExpectedVersion(intent, expectedVersion);
    assertTransition("transfer_intent", TransferIntentTransitions, intent.status, TransferIntentStatus.AUTHORIZED);
    this.#assertQuoteCurrent(intent, now);
    this.#assertLivePolicyAndMandate(intent, now);
    const authorization = {
      mandateId: intent.mandateId,
      policyDecisionRef: intent.policyDecisionRef,
      actorRef,
      authorizedAt: now.toISOString()
    };
    const persisted = await this.#append({
      eventType: CreditEventType.TRANSFER_AUTHORIZED,
      intent,
      idempotencyKey,
      commandHash,
      actorRef,
      payload: { authorization, resultingStatus: TransferIntentStatus.AUTHORIZED },
      now
    });
    return this.getTransferIntent(persisted.payload.transferIntentId);
  }

  async submitTransfer({ transferIntentId, idempotencyKey, expectedVersion, now = new Date() }) {
    const commandHash = hashId("rail_command", { command: "submit", transferIntentId });
    const replay = await this.#findCommandReplay(idempotencyKey, commandHash);
    if (replay) return this.getTransferIntent(replay.payload.transferIntentId);
    const intent = await this.getTransferIntent(transferIntentId);
    this.#assertExpectedVersion(intent, expectedVersion);
    assertTransition("transfer_intent", TransferIntentTransitions, intent.status, TransferIntentStatus.SUBMITTED);
    this.#assertQuoteCurrent(intent, now);
    this.#assertLivePolicyAndMandate(intent, now);
    const submission = this.#requireAdapter(intent.railId).submit({ transferIntent: intent, idempotencyKey, now });
    if (submission.productionFundsMoved !== false || submission.sandboxOnly !== true) {
      throw new DomainError("unsafe_sandbox_submission", "sandbox adapter returned an unsafe transfer claim");
    }
    const persisted = await this.#append({
      eventType: CreditEventType.TRANSFER_SUBMITTED,
      intent,
      idempotencyKey,
      commandHash,
      payload: { submission, resultingStatus: TransferIntentStatus.SUBMITTED },
      now
    });
    return this.getTransferIntent(persisted.payload.transferIntentId);
  }

  async simulateSettlement({
    transferIntentId,
    providerEventId,
    outcome = SettlementOutcome.SUCCEEDED,
    finality = SettlementFinality.FINALIZED,
    idempotencyKey,
    expectedVersion,
    now = new Date()
  }) {
    assertNonEmptyString("providerEventId", providerEventId);
    const commandHash = hashId("rail_command", {
      command: "settlement_receipt",
      transferIntentId,
      providerEventId,
      outcome,
      finality
    });
    const replay = await this.#findCommandReplay(idempotencyKey, commandHash);
    if (replay) return this.getTransferIntent(replay.payload.transferIntentId);
    const intent = await this.getTransferIntent(transferIntentId);
    this.#assertExpectedVersion(intent, expectedVersion);
    const receipt = this.#requireAdapter(intent.railId).createReceipt({
      transferIntent: intent,
      railReferenceHash: intent.submission?.railReferenceHash,
      providerEventId,
      outcome,
      finality,
      idempotencyKey,
      now
    });
    const duplicateProviderEvent = (await this.listSettlementReceipts()).find(
      (candidate) => candidate.providerEventIdHash === receipt.providerEventIdHash
    );
    if (duplicateProviderEvent) {
      throw new DomainError("provider_event_conflict", "provider event id was already recorded under another command", {
        providerEventIdHash: receipt.providerEventIdHash
      });
    }
    const resultingStatus = statusForReceipt(receipt);
    assertTransition("transfer_intent", TransferIntentTransitions, intent.status, resultingStatus);
    const persisted = await this.#append({
      eventType: CreditEventType.SETTLEMENT_RECEIPT_RECORDED,
      intent,
      idempotencyKey,
      commandHash,
      payload: { receipt, resultingStatus },
      finalityStatus: sourceFinalityForReceipt(receipt),
      now
    });
    return this.getTransferIntent(persisted.payload.transferIntentId);
  }

  async expireTransfer({ transferIntentId, actorRef, reason, idempotencyKey, expectedVersion, now = new Date() }) {
    for (const [name, value] of Object.entries({ actorRef, reason })) assertNonEmptyString(name, value);
    const commandHash = hashId("rail_command", { command: "expire", transferIntentId, actorRef, reason });
    const replay = await this.#findCommandReplay(idempotencyKey, commandHash);
    if (replay) return this.getTransferIntent(replay.payload.transferIntentId);
    const intent = await this.getTransferIntent(transferIntentId);
    this.#assertExpectedVersion(intent, expectedVersion);
    if (!intent.quote || new Date(now) < new Date(intent.quote.expiresAt)) {
      throw new DomainError("quote_not_expired", "transfer can only expire after its quote validity window");
    }
    assertTransition("transfer_intent", TransferIntentTransitions, intent.status, TransferIntentStatus.EXPIRED);
    const persisted = await this.#append({
      eventType: CreditEventType.TRANSFER_EXPIRED,
      intent,
      idempotencyKey,
      commandHash,
      actorRef,
      payload: { reason, resultingStatus: TransferIntentStatus.EXPIRED },
      now
    });
    return this.getTransferIntent(persisted.payload.transferIntentId);
  }

  async getTransferIntent(transferIntentId) {
    assertNonEmptyString("transferIntentId", transferIntentId);
    const events = await this.#eventsForIntent(transferIntentId);
    if (events.length === 0) {
      throw new DomainError("transfer_intent_not_found", "transfer intent not found", { transferIntentId });
    }
    return this.#reduce(events);
  }

  async findTransferIntentByPolicyDecision(policyDecisionRef) {
    return (await this.listTransferIntents()).find((intent) => intent.policyDecisionRef === policyDecisionRef);
  }

  async listTransferIntents(filter = {}) {
    const ids = new Set(
      (await this.#railEvents())
        .filter((event) => event.eventType === CreditEventType.TRANSFER_INTENT_CREATED)
        .map((event) => event.payload.transferIntentId)
    );
    const intents = await Promise.all([...ids].map((transferIntentId) => this.getTransferIntent(transferIntentId)));
    return intents.filter((intent) =>
      Object.entries(filter).every(([key, value]) => value === undefined || intent[key] === value)
    );
  }

  async listSettlementReceipts(filter = {}) {
    return (await this.#railEvents())
      .filter((event) => event.eventType === CreditEventType.SETTLEMENT_RECEIPT_RECORDED)
      .map((event) => clone(event.payload.receipt))
      .filter((receipt) => Object.entries(filter).every(([key, value]) => value === undefined || receipt[key] === value));
  }

  async getReplayProof(transferIntentId) {
    const events = await this.#eventsForIntent(transferIntentId);
    const intent = this.#reduce(events);
    const envelopes = (await this.eventRepository.listEvidence({
      aggregateType: "transfer_intent",
      aggregateId: transferIntentId
    }))
      .sort((left, right) => left.aggregateVersion - right.aggregateVersion);
    const contiguousEvents = events.every((event, index) => event.payload.intentVersion === index + 1);
    const contiguousEvidence = envelopes.every((envelope, index) => envelope.aggregateVersion === index + 1);
    const payloadHashesValid = events.every((event) => event.payloadHash === hashId("event_payload", event.payload));
    const evidenceHashesValid = envelopes.every(
      (envelope) => envelope.payloadHash === hashId("evidence_payload", envelope.payload)
    );
    const envelopeHashesValid = envelopes.every((envelope) => {
      const { evidenceId, evidenceHash, payload, schemaVersion, ...evidenceCore } = envelope;
      return evidenceHash === hashId("evidence_envelope", evidenceCore);
    });
    const eventEnvelopeLinksValid = events.every(
      (event, index) =>
        envelopes[index]?.eventId === event.eventId &&
        envelopes[index]?.eventType === event.eventType &&
        envelopes[index]?.aggregateVersion === event.payload.intentVersion
    );
    return {
      transferIntentId,
      eventCount: events.length,
      evidenceEnvelopeCount: envelopes.length,
      latestVersion: intent.version,
      resultingStatus: intent.status,
      contiguousEvents,
      contiguousEvidence,
      payloadHashesValid,
      evidenceHashesValid,
      envelopeHashesValid,
      eventEnvelopeLinksValid,
      replayable:
        events.length === envelopes.length &&
        contiguousEvents &&
        contiguousEvidence &&
        payloadHashesValid &&
        evidenceHashesValid &&
        envelopeHashesValid &&
        eventEnvelopeLinksValid,
      schemaVersion: "rail_replay_proof.v1"
    };
  }

  #assertLivePolicyAndMandate(intent, now) {
    const decision = this.policyDecisionService.getSpendRequest(intent.policyDecisionRef);
    const provider = this.policyDecisionService.getProvider(intent.providerId);
    if (
      decision.status !== SpendRequestStatus.APPROVED ||
      provider.status !== ProviderStatus.ALLOWLISTED ||
      decision.subjectId !== intent.subjectId ||
      decision.mandateId !== intent.mandateId ||
      decision.providerId !== intent.providerId ||
      decision.assetId !== intent.sourceMoney.assetId ||
      decision.amountMinor !== intent.sourceMoney.amountMinor ||
      decision.purposeCode !== intent.purposeCode ||
      createAccountHash(provider.settlementAccountIdRef) !== intent.destinationAccountRefHash
    ) {
      throw new DomainError("rail_policy_decision_mismatch", "current policy decision does not match the transfer intent");
    }
    this.authorizationService.assertAuthorized({
      mandateId: intent.mandateId,
      subjectId: intent.subjectId,
      capability: MandateCapability.PROVIDER_SPEND,
      providerId: intent.providerId,
      category: intent.purposeCode,
      assetId: intent.sourceMoney.assetId,
      amountMinor: intent.sourceMoney.amountMinor,
      enforceAggregateLimit: false,
      now
    });
  }

  #assertQuoteCurrent(intent, now) {
    if (!intent.quote) throw new DomainError("transfer_quote_missing", "transfer intent has no accepted quote");
    if (new Date(now) >= new Date(intent.quote.expiresAt)) {
      throw new DomainError("transfer_quote_expired", "transfer quote has expired", {
        transferIntentId: intent.transferIntentId,
        expiresAt: intent.quote.expiresAt
      });
    }
  }

  #assertExpectedVersion(intent, expectedVersion) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new DomainError("expected_version_required", "expectedVersion must be a positive safe integer");
    }
    if (intent.version !== expectedVersion) {
      throw new DomainError("stale_transfer_version", "transfer intent changed since it was read", {
        transferIntentId: intent.transferIntentId,
        expectedVersion,
        actualVersion: intent.version
      });
    }
  }

  async #append({ eventType, intent, idempotencyKey, commandHash, actorRef, payload, finalityStatus, now }) {
    assertNonEmptyString("idempotencyKey", idempotencyKey);
    const intentVersion = eventType === CreditEventType.TRANSFER_INTENT_CREATED ? 1 : intent.version + 1;
    const event = createCreditEvent({
      eventType,
      subjectId: intent.subjectId,
      finalityStatus,
      payload: {
        transferIntentId: intent.transferIntentId,
        intentVersion,
        idempotencyKey,
        commandHash,
        actorId: actorRef ?? "system:rail-sandbox",
        ...payload
      },
      now
    });
    try {
      const result = await this.eventRepository.appendCommand({
        aggregateType: "transfer_intent",
        aggregateId: intent.transferIntentId,
        expectedVersion: intentVersion - 1,
        idempotencyKey,
        commandHash,
        event
      });
      return result.event;
    } catch (error) {
      if (error?.code === "event_idempotency_conflict") {
        throw new DomainError(
          "rail_idempotency_conflict",
          "rail command idempotency key was reused with different input",
          { idempotencyKey }
        );
      }
      if (error?.code === "stale_aggregate_version") {
        throw new DomainError("stale_transfer_version", "transfer intent changed since it was read", {
          transferIntentId: intent.transferIntentId,
          expectedVersion: intentVersion - 1,
          actualVersion: error.details?.actualVersion
        });
      }
      throw error;
    }
  }

  async #findCommandReplay(idempotencyKey, commandHash) {
    assertNonEmptyString("idempotencyKey", idempotencyKey);
    try {
      return (await this.eventRepository.findCommand({ idempotencyKey, commandHash }))?.event;
    } catch (error) {
      if (error?.code === "event_idempotency_conflict") {
        throw new DomainError("rail_idempotency_conflict", "rail command idempotency key was reused with different input", {
          idempotencyKey
        });
      }
      throw error;
    }
  }

  async #eventsForIntent(transferIntentId) {
    return (await this.eventRepository.listEvents({
      aggregateType: "transfer_intent",
      aggregateId: transferIntentId
    }))
      .filter((event) => RAIL_EVENT_TYPES.has(event.eventType))
      .sort((left, right) => left.payload.intentVersion - right.payload.intentVersion);
  }

  async #railEvents() {
    return (await this.eventRepository.listEvents({ aggregateType: "transfer_intent" })).filter((event) =>
      RAIL_EVENT_TYPES.has(event.eventType)
    );
  }

  #reduce(events) {
    const first = events[0];
    if (first.eventType !== CreditEventType.TRANSFER_INTENT_CREATED || first.payload.intentVersion !== 1) {
      throw new DomainError("invalid_transfer_stream", "transfer event stream must begin at version one");
    }
    const intent = clone(first.payload.intent);
    for (const event of events.slice(1)) {
      if (event.payload.intentVersion !== intent.version + 1) {
        throw new DomainError("transfer_event_version_gap", "transfer event versions must be contiguous", {
          transferIntentId: intent.transferIntentId,
          expectedVersion: intent.version + 1,
          actualVersion: event.payload.intentVersion
        });
      }
      const nextStatus = event.payload.resultingStatus;
      assertTransition("transfer_intent_replay", TransferIntentTransitions, intent.status, nextStatus);
      if (event.eventType === CreditEventType.TRANSFER_QUOTED) intent.quote = clone(event.payload.quote);
      if (event.eventType === CreditEventType.TRANSFER_AUTHORIZED) intent.authorization = clone(event.payload.authorization);
      if (event.eventType === CreditEventType.TRANSFER_SUBMITTED) intent.submission = clone(event.payload.submission);
      if (event.eventType === CreditEventType.SETTLEMENT_RECEIPT_RECORDED) {
        intent.settlementReceipts.push(clone(event.payload.receipt));
      }
      intent.status = nextStatus;
      intent.version = event.payload.intentVersion;
      intent.updatedAt = event.occurredAt;
    }
    return clone(intent);
  }

  #requireAdapter(railId) {
    const adapter = this.adapters.get(railId);
    if (!adapter) throw new DomainError("rail_not_found", "rail adapter not found", { railId });
    return adapter;
  }

  #requireConformance(railId) {
    const report = this.conformance.get(railId);
    if (!report) throw new DomainError("rail_not_found", "rail adapter not found", { railId });
    return report;
  }
}
