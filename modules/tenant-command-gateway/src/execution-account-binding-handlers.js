import { randomBytes } from "node:crypto";
import {
  CreditEventType,
  DomainError,
  createCreditEvent,
  createExecutionAccountBindingChallenge,
  createExecutionAccountBindingProofAttempt,
  createVerifiedExecutionAccountBinding,
  consumeExecutionAccountBindingChallenge,
  expireExecutionAccountBindingChallenge,
  hashId,
  revokeExecutionAccountBinding
} from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmExecutionAccountProofAdapter,
  X_LAYER_TESTNET_PROFILE,
  normalizeEvmCaip10
} from "../../chain-adapter/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

export const EXECUTION_ACCOUNT_BINDING_OPERATION_IDS = Object.freeze([
  "walletPrepareAccountBinding",
  "walletSubmitAccountBinding",
  "walletReadAccountBindings",
  "walletRevokeAccountBinding"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function closed(payload, keys) {
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(payload, key))
  ) fail("invalid_tenant_command_payload", "execution AccountBinding payload is invalid");
  return structuredClone(payload);
}

function identifier(name, value, maximum = 256) {
  if (typeof value !== "string" || value.length > maximum || !ID.test(value)) {
    fail("invalid_tenant_command_payload", `${name} is invalid`);
  }
  return value;
}

function normalizePrepare(payload) {
  const value = closed(payload, ["accountId"]);
  identifier("accountId", value.accountId, 160);
  return value;
}

function normalizeSubmit(payload) {
  const value = closed(payload, ["challengeId", "accountId", "signature"]);
  if (!/^execution_account_binding_challenge_[0-9a-f-]{36}$/.test(value.challengeId ?? "")) {
    fail("invalid_tenant_command_payload", "challengeId is invalid");
  }
  identifier("accountId", value.accountId, 160);
  if (
    typeof value.signature !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2}){65,4096}$/.test(value.signature)
  ) fail("invalid_tenant_command_payload", "signature is invalid");
  return value;
}

function normalizeRevoke(payload) {
  const value = closed(payload, ["accountBindingId"]);
  identifier("accountBindingId", value.accountBindingId);
  return value;
}

function adapterMap(adapters) {
  const list = adapters ?? [BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE].map(
    (profile) => new EvmExecutionAccountProofAdapter({ profile })
  );
  if (!Array.isArray(list) || list.length !== 2) {
    fail("invalid_account_proof_configuration", "exactly two execution proof adapters are required");
  }
  const map = new Map(list.map((adapter) => [adapter.descriptor().chainId, adapter]));
  if (!map.has("eip155:84532") || !map.has("eip155:1952") || map.size !== 2) {
    fail("invalid_account_proof_configuration", "approved test-chain execution proof adapters are required");
  }
  return map;
}

function challengeView(challenge, prepared) {
  return {
    challengeId: challenge.challengeId,
    subjectId: challenge.subjectId,
    chainId: challenge.chainId,
    accountHash: challenge.accountHash,
    purpose: "execution",
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    protocolVersion: challenge.protocolVersion,
    typedDataHash: challenge.typedDataHash,
    typedData: {
      domain: prepared.typedData.domain,
      types: prepared.typedData.types,
      primaryType: prepared.typedData.primaryType,
      message: {
        ...prepared.typedData.message,
        issuedAt: prepared.typedData.message.issuedAt.toString(),
        expiresAt: prepared.typedData.message.expiresAt.toString()
      }
    },
    createsAuthenticationSession: false,
    createsExecutionAuthority: false,
    oneUse: true,
    schemaVersion: "tenant_execution_account_binding_challenge_created.v1"
  };
}

function bindingView(binding) {
  return {
    accountBindingId: binding.accountBindingId,
    subjectId: binding.subjectId,
    accountHash: binding.accountHash,
    chainId: binding.chainId,
    purpose: binding.purpose,
    bindingKind: binding.bindingKind,
    proofHash: binding.proofHash,
    verificationMethod: binding.verificationMethod,
    status: binding.status,
    boundAt: binding.boundAt,
    ...(binding.revokedAt ? { revokedAt: binding.revokedAt } : {}),
    protocolVersion: binding.protocolVersion,
    createsAuthenticationSession: false,
    createsExecutionAuthority: false
  };
}

async function activeSubjectState({ client, coreRepository, authorizationDecision, lock }) {
  if (authorizationDecision.resourceType !== "subject") {
    fail("tenant_resource_unavailable", "The requested resource is not available.");
  }
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.SUBJECT,
    authorizationDecision.resourceId,
    { lock }
  );
  if (!state?.value || !new Set(["human", "agent"]).has(state.value.subjectType) || state.value.status !== "active") {
    fail("execution_account_binding_subject_unavailable", "an active Human or Agent Subject is required");
  }
  return state;
}

export function prepareExecutionAccountBindingHandler({ executionProofAdapters } = {}) {
  const adapters = adapterMap(executionProofAdapters);
  return Object.freeze({
    operationId: "walletPrepareAccountBinding",
    kind: "command",
    preflight: ({ payload }) => normalizePrepare(payload),
    async plan(context) {
      const { client, coreRepository, authenticationContext, authorizationDecision, now, requestId, correlationId } = context;
      const input = normalizePrepare(context.payload);
      const subjectState = await activeSubjectState({ client, coreRepository, authorizationDecision, lock: true });
      const subject = subjectState.value;
      const pending = await coreRepository.findPendingExecutionAccountBindingChallengeForSubjectInTransaction(
        client,
        subject.subjectId,
        { lock: true }
      );
      let expired;
      let expiredState;
      let expiredEvent;
      if (pending) {
        expiredState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE,
          pending.challengeId,
          { lock: true }
        );
        if (!expiredState || expiredState.value.status !== "pending") {
          fail("projection_integrity_mismatch", "pending execution AccountBinding challenge is unavailable");
        }
        expired = expireExecutionAccountBindingChallenge(expiredState.value, { expiredAt: now });
        expiredEvent = createCreditEvent({
          eventType: CreditEventType.EXECUTION_ACCOUNT_BINDING_CHALLENGE_EXPIRED,
          subjectId: subject.subjectId,
          chainId: expired.chainId,
          payload: {
            challengeId: expired.challengeId,
            accountHash: expired.accountHash,
            reasonCode: "challenge_ttl_elapsed",
            actorHash: expired.controllerActorHash,
            causationId: requestId,
            correlationId
          },
          now
        });
      }
      const chainId = input.accountId.split(":").slice(0, 2).join(":");
      const adapter = adapters.get(chainId);
      if (!adapter) fail("unsupported_account_proof_chain", "selected network is not approved");
      const account = normalizeEvmCaip10(input.accountId, chainId);
      const issuedAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
      const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
      const challengeInput = {
        chainId,
        tenantHash: hashId("tenant", authenticationContext.tenantId),
        subjectHash: subject.subjectHash,
        controllerActorHash: hashId("actor", authenticationContext.actorId),
        actorType: authenticationContext.actorType,
        accountHash: account.accountHash,
        purpose: "execution",
        nonce: `0x${randomBytes(32).toString("hex")}`,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        protocolVersion: "1.2"
      };
      const prepared = adapter.createTypedData(challengeInput);
      const challenge = createExecutionAccountBindingChallenge({
        subject,
        ...challengeInput,
        typedDataHash: prepared.typedDataHash
      });
      const event = createCreditEvent({
        eventType: CreditEventType.EXECUTION_ACCOUNT_BINDING_CHALLENGE_CREATED,
        subjectId: subject.subjectId,
        chainId,
        payload: {
          challengeId: challenge.challengeId,
          subjectHash: subject.subjectHash,
          accountHash: challenge.accountHash,
          purpose: "execution",
          typedDataHash: challenge.typedDataHash,
          expiresAt: challenge.expiresAt,
          actorHash: challenge.controllerActorHash,
          createsAuthenticationSession: false,
          createsExecutionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "execution_account_binding_challenge",
        aggregateId: challenge.challengeId,
        events: [
          ...(expiredEvent ? [{
            aggregateType: "execution_account_binding_challenge",
            aggregateId: expired.challengeId,
            expectedVersion: expiredState.aggregateVersion,
            event: expiredEvent
          }] : []),
          {
            aggregateType: "execution_account_binding_challenge",
            aggregateId: challenge.challengeId,
            expectedVersion: 0,
            event
          }
        ],
        writes: [
          ...(expiredEvent ? [{
            type: CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE,
            value: expired,
            eventId: expiredEvent.eventId
          }] : []),
          {
            type: CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE,
            value: challenge,
            eventId: event.eventId
          }
        ],
        response: challengeView(challenge, prepared)
      };
    }
  });
}

export function submitExecutionAccountBindingHandler({ executionProofAdapters } = {}) {
  const adapters = adapterMap(executionProofAdapters);
  return Object.freeze({
    operationId: "walletSubmitAccountBinding",
    kind: "command",
    preflight: ({ payload }) => normalizeSubmit(payload),
    async plan(context) {
      const { client, coreRepository, authenticationContext, authorizationDecision, now, requestId, correlationId } = context;
      const input = normalizeSubmit(context.payload);
      const subject = (await activeSubjectState({ client, coreRepository, authorizationDecision, lock: true })).value;
      const challengeState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE,
        input.challengeId,
        { lock: true }
      );
      const challenge = challengeState?.value;
      if (
        !challenge || challenge.subjectId !== subject.subjectId ||
        challenge.subjectHash !== subject.subjectHash ||
        challenge.tenantHash !== hashId("tenant", authenticationContext.tenantId) ||
        challenge.controllerActorHash !== hashId("actor", authenticationContext.actorId) ||
        challenge.actorType !== authenticationContext.actorType
      ) fail("tenant_resource_unavailable", "The requested resource is not available.");
      const adapter = adapters.get(challenge.chainId);
      if (!adapter) fail("unsupported_account_proof_chain", "selected network is not approved");
      const verified = await adapter.verify({
        accountId: input.accountId,
        signature: input.signature,
        challenge,
        now
      });
      const existing = await coreRepository.findAccountBindingByHashInTransaction(
        client,
        verified.accountHash,
        { lock: true }
      );
      if (existing) fail("account_already_bound", "CAIP-10 account is already bound");
      const consumed = consumeExecutionAccountBindingChallenge(challenge, { consumedAt: now });
      const attempt = createExecutionAccountBindingProofAttempt({
        challenge: consumed,
        proofHash: verified.proofHash,
        verificationMethod: verified.verificationMethod,
        attemptedAt: now
      });
      const binding = createVerifiedExecutionAccountBinding({
        challenge: consumed,
        accountId: verified.accountId,
        proofHash: verified.proofHash,
        verificationMethod: verified.verificationMethod,
        boundAt: now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.EXECUTION_ACCOUNT_BINDING_VERIFIED,
        subjectId: subject.subjectId,
        chainId: binding.chainId,
        payload: {
          challengeId: challenge.challengeId,
          proofAttemptId: attempt.proofAttemptId,
          accountBindingId: binding.accountBindingId,
          accountHash: binding.accountHash,
          purpose: binding.purpose,
          proofHash: binding.proofHash,
          verificationMethod: binding.verificationMethod,
          actorHash: binding.controllerActorHash,
          createsAuthenticationSession: false,
          createsExecutionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "execution_account_binding_challenge",
        aggregateId: challenge.challengeId,
        events: [{
          aggregateType: "execution_account_binding_challenge",
          aggregateId: challenge.challengeId,
          expectedVersion: challengeState.aggregateVersion,
          event
        }],
        writes: [
          { type: CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE, value: consumed, eventId: event.eventId },
          { type: CoreProjectionType.EXECUTION_ACCOUNT_BINDING_PROOF_ATTEMPT, value: attempt, eventId: event.eventId },
          { type: CoreProjectionType.ACCOUNT_BINDING, value: binding, eventId: event.eventId }
        ],
        response: {
          subjectId: subject.subjectId,
          accountBinding: bindingView(binding),
          challengeConsumed: true,
          authenticationSessionChanged: false,
          executionAuthorityGranted: false,
          productionAuthority: false,
          schemaVersion: "tenant_execution_account_binding_verified.v1"
        }
      };
    }
  });
}

export function readExecutionAccountBindingsHandler() {
  return Object.freeze({
    operationId: "walletReadAccountBindings",
    kind: "query",
    preflight: ({ payload }) => closed(payload, []),
    async execute({ client, coreRepository, authorizationDecision }) {
      const subject = (await activeSubjectState({
        client,
        coreRepository,
        authorizationDecision,
        lock: false
      })).value;
      const bindings = await coreRepository.listExecutionAccountBindingsForSubjectInTransaction(
        client,
        subject.subjectId
      );
      return {
        subjectId: subject.subjectId,
        accounts: bindings.map(bindingView),
        authenticationSessionChanged: false,
        executionAuthorityGranted: false,
        schemaVersion: "tenant_execution_account_bindings_view.v1"
      };
    }
  });
}

export function revokeExecutionAccountBindingHandler() {
  return Object.freeze({
    operationId: "walletRevokeAccountBinding",
    kind: "command",
    preflight: ({ payload }) => normalizeRevoke(payload),
    async plan(context) {
      const { client, coreRepository, authenticationContext, authorizationDecision, now, requestId, correlationId } = context;
      const subject = (await activeSubjectState({ client, coreRepository, authorizationDecision, lock: true })).value;
      const input = normalizeRevoke(context.payload);
      const bindingState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.ACCOUNT_BINDING,
        input.accountBindingId,
        { lock: true }
      );
      if (
        !bindingState?.value ||
        bindingState.value.subjectId !== subject.subjectId ||
        bindingState.value.schemaVersion !== "account_binding.v3"
      ) fail("tenant_resource_unavailable", "The requested resource is not available.");
      const binding = revokeExecutionAccountBinding(bindingState.value, { revokedAt: now });
      const event = createCreditEvent({
        eventType: CreditEventType.EXECUTION_ACCOUNT_BINDING_REVOKED,
        subjectId: subject.subjectId,
        chainId: binding.chainId,
        payload: {
          accountBindingId: binding.accountBindingId,
          accountHash: binding.accountHash,
          reasonCode: "actor_request",
          actorHash: hashId("actor", authenticationContext.actorId),
          authenticationSessionChanged: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "account_binding",
        aggregateId: binding.accountBindingId,
        events: [{
          aggregateType: "account_binding",
          aggregateId: binding.accountBindingId,
          expectedVersion: bindingState.aggregateVersion,
          event
        }],
        writes: [{ type: CoreProjectionType.ACCOUNT_BINDING, value: binding, eventId: event.eventId }],
        response: {
          subjectId: subject.subjectId,
          accountBinding: bindingView(binding),
          authenticationSessionChanged: false,
          executionAuthorityGranted: false,
          schemaVersion: "tenant_execution_account_binding_revoked.v1"
        }
      };
    }
  });
}

export function createExecutionAccountBindingHandlers(options) {
  return Object.freeze([
    prepareExecutionAccountBindingHandler(options),
    submitExecutionAccountBindingHandler(options),
    readExecutionAccountBindingsHandler(),
    revokeExecutionAccountBindingHandler()
  ]);
}
