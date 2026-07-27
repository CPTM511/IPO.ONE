import { randomBytes } from "node:crypto";
import {
  CreditEventType,
  DomainError,
  SubjectType,
  TRADING_REAL_CREDIT_PROFILE_SCHEMA_VERSION,
  createCreditEvent,
  createOperationalId,
  createRealTradingAccountBindingChallenge,
  finalizeRealTradingEvidenceSnapshot,
  hashId,
  importRealTradingHistory,
  realTradingCreditProfileView
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import {
  HYPERLIQUID_TESTNET_ENVIRONMENT,
  HyperliquidBindingProofVerifier,
  HyperliquidTestnetInfoAdapter,
  normalizeHyperliquidAddress
} from "../../hyperliquid-info/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const OWNER_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const CURRENT_SNAPSHOT_FILL_WINDOW_MS = 24 * 60 * 60 * 1_000;
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1_000;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

function unavailable() {
  throw new DomainError(
    "tenant_resource_unavailable",
    "The requested resource is not available."
  );
}

function exactPayload(payload, keys) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype
  ) unavailable();
  const actual = Object.keys(payload).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) unavailable();
  return payload;
}

function normalizeEmptyPayload(payload) {
  exactPayload(payload, []);
}

function challengePayload(payload) {
  exactPayload(payload, [
    "environment",
    "masterAccountAddress",
    "subaccountAddress"
  ]);
  if (payload.environment !== HYPERLIQUID_TESTNET_ENVIRONMENT) unavailable();
  const master = normalizeHyperliquidAddress(payload.masterAccountAddress);
  const subaccount = normalizeHyperliquidAddress(payload.subaccountAddress);
  if (master.addressHash === subaccount.addressHash) unavailable();
  return { master, subaccount };
}

function importPayload(payload) {
  exactPayload(payload, [
    "masterAccountAddress",
    "signature",
    "subaccountAddress"
  ]);
  if (typeof payload.signature !== "string" || !SIGNATURE.test(payload.signature)) {
    unavailable();
  }
  const master = normalizeHyperliquidAddress(payload.masterAccountAddress);
  const subaccount = normalizeHyperliquidAddress(payload.subaccountAddress);
  if (master.addressHash === subaccount.addressHash) unavailable();
  return { master, signature: payload.signature, subaccount };
}

async function requireRelationship(directory, {
  actorId,
  resourceType,
  resourceId,
  now
}) {
  const bindings = await directory.listActiveResourceBindings({
    resourceType,
    resourceId,
    now
  });
  const binding = bindings.find(
    (candidate) =>
      candidate.actorId === actorId &&
      OWNER_RELATIONSHIPS.has(candidate.relationship)
  );
  if (!binding) unavailable();
  return { binding, bindings };
}

async function loadState(client, coreRepository, profileId, { lock }) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.TRADING_CREDIT_PROFILE,
    profileId,
    { lock }
  );
  if (
    !state ||
    state.value.tradingCreditProfileId !== profileId ||
    state.value.schemaVersion !==
      TRADING_REAL_CREDIT_PROFILE_SCHEMA_VERSION ||
    state.value.sandboxOnly !== true ||
    state.value.syntheticOnly !== false ||
    state.value.testnetOnly !== true ||
    state.value.realFunds !== false ||
    state.value.productionAuthority !== false ||
    state.value.fundsAuthority !== false
  ) unavailable();
  return state;
}

function eventFor({ eventType, profile, requestId, correlationId, now }) {
  return createCreditEvent({
    eventType,
    subjectId: profile.subjectId,
    payload: {
      tradingCreditProfileId: profile.tradingCreditProfileId,
      principalId: profile.principalId,
      subjectType: profile.subjectType,
      operatorType: profile.operatorType,
      accountReferenceHash: profile.accountReferenceHash,
      bindingEpoch: profile.bindingEpoch,
      stage: profile.stage,
      profileVersion: profile.version,
      ...(profile.bindingChallenge
        ? {
            bindingChallengeHash: profile.bindingChallenge.challengeHash,
            bindingTypedDataHash: profile.bindingChallenge.typedDataHash
          }
        : {}),
      ...(profile.accountBinding
        ? {
            accountBindingHash: profile.accountBinding.accountBindingHash,
            relationshipHash: profile.accountBinding.relationshipHash
          }
        : {}),
      ...(profile.historyImport
        ? {
            historyHash: profile.historyImport.historyHash,
            historyManifestHash: profile.historyImport.historyManifestHash,
            dataQuality: profile.historyImport.dataQuality
          }
        : {}),
      ...(profile.evidenceSnapshot
        ? {
            evidenceSnapshotHash: profile.evidenceSnapshot.snapshotHash,
            scorecardHash: profile.factorScorecard.scorecardHash,
            factorCount: profile.factorScorecard.factors.length,
            pointInTime: true,
            authorizing: false
          }
        : {}),
      ...(profile.priorEvidenceInvalidation
        ? {
            priorEvidenceInvalidation: profile.priorEvidenceInvalidation
          }
        : {}),
      sandboxOnly: true,
      syntheticOnly: false,
      testnetOnly: true,
      realFunds: false,
      productionAuthority: false,
      fundsAuthority: false,
      creditApproval: false,
      universalScoreAvailable: false,
      externalSystemQueried: profile.externalSystemQueried,
      rawSignaturePersisted: false,
      rawTransactionsPersisted: false,
      causationId: requestId,
      correlationId
    },
    now
  });
}

function checkedDependencies({
  hyperliquidInfoAdapter,
  hyperliquidBindingProofVerifier
} = {}) {
  const infoAdapter =
    hyperliquidInfoAdapter ?? new HyperliquidTestnetInfoAdapter();
  const proofVerifier =
    hyperliquidBindingProofVerifier ?? new HyperliquidBindingProofVerifier();
  if (
    typeof infoAdapter.verifyMasterSubaccountBinding !== "function" ||
    typeof infoAdapter.readFillHistory !== "function" ||
    typeof infoAdapter.readAccountSnapshot !== "function" ||
    typeof proofVerifier.createTypedData !== "function" ||
    typeof proofVerifier.verify !== "function"
  ) {
    throw new DomainError(
      "invalid_trading_evidence_dependency",
      "Trading Evidence requires the fixed Testnet Info and binding-proof adapters"
    );
  }
  return Object.freeze({ infoAdapter, proofVerifier });
}

export function createTradingAccountBindingChallengeHandler(dependencies) {
  const { proofVerifier } = checkedDependencies(dependencies);
  return Object.freeze({
    operationId: "tradingCreateAccountBindingChallenge",
    kind: "command",
    preflight({ payload }) {
      challengePayload(payload);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      const { master, subaccount } = challengePayload(payload);
      if (authorizationDecision.resourceType !== "subject") unavailable();
      const subjectId = authorizationDecision.resourceId;
      const { bindings } = await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: "subject",
        resourceId: subjectId,
        now
      });
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        subjectId,
        { lock: true }
      );
      if (!subjectState || subjectState.value.subjectId !== subjectId) unavailable();
      const subject = subjectState.value;
      if (
        (subject.subjectType === SubjectType.HUMAN &&
          authenticationContext.actorType !== ActorType.HUMAN) ||
        (subject.subjectType === SubjectType.AGENT &&
          ![ActorType.HUMAN, ActorType.AGENT].includes(
            authenticationContext.actorType
          ))
      ) unavailable();
      const principalState =
        await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.PRINCIPAL,
          subject.primaryPrincipalId,
          { lock: false }
        );
      if (!principalState) unavailable();
      const existing = await client.query(
        "SELECT id FROM trading_credit_profiles WHERE subject_id = $1 LIMIT 1 FOR UPDATE",
        [subjectId]
      );
      let existingState;
      if (existing.rowCount === 1) {
        existingState = await loadState(
          client,
          coreRepository,
          existing.rows[0].id,
          { lock: true }
        );
        if (existingState.value.stage !== "finalized") unavailable();
        await requireRelationship(directory, {
          actorId: authenticationContext.actorId,
          resourceType: "trading_credit_profile",
          resourceId: existingState.value.tradingCreditProfileId,
          now
        });
      }

      const issuedAtMs = Math.floor(now.getTime() / 1_000) * 1_000;
      const issuedAt = new Date(issuedAtMs).toISOString();
      const expiresAt = new Date(
        issuedAtMs + CHALLENGE_LIFETIME_MS
      ).toISOString();
      const challengeId = createOperationalId("trading_binding_challenge");
      const nonceHash = hashId(
        "trading_binding_challenge_nonce",
        `0x${randomBytes(32).toString("hex")}`
      );
      const typedDataInput = {
        tenantHash: hashId("tenant", authenticationContext.tenantId),
        subjectHash: hashId("subject", subject.subjectId),
        principalHash: hashId(
          "principal",
          principalState.value.principalId
        ),
        masterAddressHash: master.addressHash,
        subaccountAddressHash: subaccount.addressHash,
        nonceHash,
        challengeId,
        environment: HYPERLIQUID_TESTNET_ENVIRONMENT,
        infoProfileId: "hyperliquid_testnet_info.v1",
        bindingEpoch: existingState
          ? existingState.value.bindingEpoch + 1
          : 1,
        issuedAt,
        expiresAt
      };
      const prepared = proofVerifier.createTypedData(typedDataInput);
      const bindingDescriptor = {
        challengeId,
        challengeHash: hashId("trading_binding_challenge", {
          ...typedDataInput,
          typedDataHash: prepared.typedDataHash
        }),
        nonceHash,
        typedDataHash: prepared.typedDataHash,
        masterAddressHash: master.addressHash,
        subaccountAddressHash: subaccount.addressHash,
        chainId: prepared.chainId,
        environment: prepared.environment,
        infoProfileId: typedDataInput.infoProfileId,
        issuedAt,
        expiresAt
      };
      const profile = createRealTradingAccountBindingChallenge({
        tenantId: authenticationContext.tenantId,
        subject,
        principal: principalState.value,
        requestedByActorId: authenticationContext.actorId,
        bindingDescriptor,
        ...(existingState
          ? { existingProfile: existingState.value }
          : {}),
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_ACCOUNT_BINDING_CHALLENGE_CREATED,
        profile,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_credit_profile",
        aggregateId: profile.tradingCreditProfileId,
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: profile.tradingCreditProfileId,
          expectedVersion: existingState?.aggregateVersion ?? 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: profile,
          eventId: event.eventId
        }],
        response: {
          profile: realTradingCreditProfileView(profile),
          bindingRequest: {
            typedData: prepared.typedData,
            typedDataHash: prepared.typedDataHash,
            chainId: prepared.chainId,
            environment: prepared.environment,
            expiresAt,
            reusableSignature: false,
            schemaVersion: prepared.schemaVersion
          },
          schemaVersion:
            "tenant_trading_account_binding_challenge_created.v2"
        },
        ...(existingState
          ? {}
          : {
              authorizationResource: {
                resourceType: "trading_credit_profile",
                resourceId: profile.tradingCreditProfileId,
                actorBindings: bindings
                  .filter(({ relationship }) =>
                    OWNER_RELATIONSHIPS.has(relationship)
                  )
                  .map((binding) => ({
                    actorId: binding.actorId,
                    actorType: binding.actorType,
                    relationship: binding.relationship,
                    ...(binding.controllerActorId
                      ? { controllerActorId: binding.controllerActorId }
                      : {})
                  }))
              }
            })
      };
    }
  });
}

export function importTradingHistoryHandler(dependencies) {
  const { infoAdapter, proofVerifier } = checkedDependencies(dependencies);
  return Object.freeze({
    operationId: "tradingImportHyperliquidHistory",
    kind: "command",
    preflight({ payload }) {
      importPayload(payload);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      const { master, signature, subaccount } = importPayload(payload);
      if (authorizationDecision.resourceType !== "trading_credit_profile") {
        unavailable();
      }
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadState(
        client,
        coreRepository,
        authorizationDecision.resourceId,
        { lock: true }
      );
      if (
        state.value.stage !== "challenge_pending" ||
        state.value.bindingChallenge.masterAddressHash !== master.addressHash ||
        state.value.bindingChallenge.subaccountAddressHash !==
          subaccount.addressHash
      ) unavailable();

      // Ownership is verified before any external query. Only proof and response
      // hashes plus aggregates enter durable state; the raw signature and fills
      // remain process-local and are discarded after this transaction.
      const bindingProof = await proofVerifier.verify({
        masterAccountAddress: master.address,
        signature,
        challenge: state.value.bindingChallenge,
        now
      });
      const relationship = await infoAdapter.verifyMasterSubaccountBinding({
        masterAccountAddress: master.address,
        subaccountAddress: subaccount.address
      });
      const historyWindowEndMs = now.getTime();
      const history = await infoAdapter.readFillHistory({
        accountAddress: subaccount.address,
        fillWindowStartMs: Math.max(
          0,
          historyWindowEndMs - HISTORY_WINDOW_MS
        ),
        fillWindowEndMs: historyWindowEndMs
      });
      const currentSnapshotResult = await infoAdapter.readAccountSnapshot({
        accountAddress: subaccount.address,
        accountRole: "subaccount",
        fillWindowStartMs: Math.max(
          0,
          historyWindowEndMs - CURRENT_SNAPSHOT_FILL_WINDOW_MS
        ),
        fillWindowEndMs: historyWindowEndMs
      });
      const profile = importRealTradingHistory({
        profile: state.value,
        requestedByActorId: authenticationContext.actorId,
        bindingProof,
        relationship,
        history,
        currentSnapshot: currentSnapshotResult.snapshot,
        challengeEventId: state.sourceEventId,
        challengeEvidenceHash: state.sourceEvidenceHash,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_HYPERLIQUID_HISTORY_IMPORTED,
        profile,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_credit_profile",
        aggregateId: profile.tradingCreditProfileId,
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: profile.tradingCreditProfileId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: profile,
          eventId: event.eventId
        }],
        response: {
          profile: realTradingCreditProfileView(profile),
          schemaVersion: "tenant_trading_history_imported.v2"
        },
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "active",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function finalizeTradingEvidenceSnapshotHandler(dependencies) {
  checkedDependencies(dependencies);
  return Object.freeze({
    operationId: "tradingFinalizeEvidenceSnapshot",
    kind: "command",
    preflight({ payload }) {
      normalizeEmptyPayload(payload);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      normalizeEmptyPayload(payload);
      if (authorizationDecision.resourceType !== "trading_credit_profile") {
        unavailable();
      }
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadState(
        client,
        coreRepository,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const profile = finalizeRealTradingEvidenceSnapshot({
        profile: state.value,
        sourceProjectionHash: state.entityHash,
        historyImportEventId: state.sourceEventId,
        historyImportEvidenceHash: state.sourceEvidenceHash,
        sourceFinality: state.sourceFinality,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_EVIDENCE_SNAPSHOT_FINALIZED,
        profile,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_credit_profile",
        aggregateId: profile.tradingCreditProfileId,
        events: [{
          aggregateType: "trading_credit_profile",
          aggregateId: profile.tradingCreditProfileId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CREDIT_PROFILE,
          value: profile,
          eventId: event.eventId
        }],
        response: {
          profile: realTradingCreditProfileView(profile),
          schemaVersion:
            "tenant_trading_evidence_snapshot_finalized.v2"
        },
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "active",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function readTradingCreditProfileHandler(dependencies) {
  checkedDependencies(dependencies);
  return Object.freeze({
    operationId: "tradingReadCreditProfile",
    kind: "query",
    async execute({
      client,
      coreRepository,
      directory,
      authenticationContext,
      resource,
      payload,
      now
    }) {
      normalizeEmptyPayload(payload);
      if (resource?.resourceType !== "trading_credit_profile") unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const state = await loadState(client, coreRepository, resource.resourceId, {
        lock: false
      });
      return {
        profile: realTradingCreditProfileView(state.value),
        schemaVersion: "tenant_trading_credit_profile_view.v2"
      };
    }
  });
}

export function createTradingCapitalEvidenceHandlers(dependencies) {
  checkedDependencies(dependencies);
  return Object.freeze([
    createTradingAccountBindingChallengeHandler(dependencies),
    importTradingHistoryHandler(dependencies),
    finalizeTradingEvidenceSnapshotHandler(dependencies),
    readTradingCreditProfileHandler(dependencies)
  ]);
}
