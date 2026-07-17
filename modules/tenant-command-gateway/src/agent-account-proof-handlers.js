import { randomBytes } from "node:crypto";
import {
  CreditEventType,
  DomainError,
  SubjectType,
  activateAgentSubjectFromAccountProof,
  consumeAgentAccountChallenge,
  createAgentAccountChallenge,
  createAgentAccountProofAttempt,
  createCreditEvent,
  createVerifiedAgentAccountBinding,
  expireAgentAccountChallenge,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmAccountProofAdapter,
  X_LAYER_TESTNET_PROFILE,
  normalizeEvmCaip10
} from "../../chain-adapter/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PURPOSES = new Set(["primary", "revenue", "repayment", "treasury", "execution"]);

function assertClosedPayload(payload, requiredKeys) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== requiredKeys.length ||
    requiredKeys.some((key) => !Object.hasOwn(payload, key))
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Agent account proof payload is invalid");
  }
}

function boundedString(name, value, { minimum = 1, maximum = 2048, pattern } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    throw new DomainError("invalid_tenant_command_payload", `${name} is invalid`);
  }
  return value;
}

function normalizeCreateChallengePayload(payload) {
  assertClosedPayload(payload, ["accountId", "purpose"]);
  const purpose = boundedString("purpose", payload.purpose, { maximum: 32 });
  if (!PURPOSES.has(purpose)) {
    throw new DomainError("invalid_tenant_command_payload", "purpose is invalid");
  }
  return {
    accountId: boundedString("accountId", payload.accountId, { maximum: 160 }),
    purpose
  };
}

function normalizeSubmitProofPayload(payload) {
  assertClosedPayload(payload, ["challengeId", "accountId", "signature"]);
  return {
    challengeId: boundedString("challengeId", payload.challengeId, {
      maximum: 128,
      pattern: /^agent_account_challenge_[0-9a-f-]{36}$/
    }),
    accountId: boundedString("accountId", payload.accountId, { maximum: 160 }),
    signature: boundedString("signature", payload.signature, {
      minimum: 132,
      maximum: 132,
      pattern: /^0x[0-9a-fA-F]{130}$/
    })
  };
}

function createDefaultAdapters() {
  return [BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE].map(
    (profile) => new EvmAccountProofAdapter({ profile })
  );
}

function adapterMap(adapters) {
  const list = adapters ?? createDefaultAdapters();
  if (!Array.isArray(list) || list.length !== 2) {
    throw new DomainError("invalid_account_proof_configuration", "exactly two approved test-chain proof adapters are required");
  }
  const map = new Map(list.map((adapter) => [adapter.descriptor().chainId, adapter]));
  if (!map.has("eip155:84532") || !map.has("eip155:1952") || map.size !== 2) {
    throw new DomainError("invalid_account_proof_configuration", "approved Base Sepolia and X Layer proof adapters are required");
  }
  return map;
}

function challengeResponse(challenge, prepared) {
  return {
    challengeId: challenge.challengeId,
    subjectId: challenge.subjectId,
    chainId: challenge.chainId,
    accountHash: challenge.accountHash,
    purpose: challenge.purpose,
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
    oneUse: true,
    schemaVersion: "tenant_agent_account_challenge_created.v1"
  };
}

async function requireSubjectBindings({ directory, subjectId, now }) {
  const bindings = await directory.listActiveResourceBindings({
    resourceType: "subject",
    resourceId: subjectId,
    now
  });
  const controller = bindings.find(
    (binding) => binding.relationship === "controller" && binding.actorType === ActorType.HUMAN
  );
  const agent = bindings.find(
    (binding) => binding.relationship === "subject" && binding.actorType === ActorType.AGENT
  );
  if (!controller || !agent || agent.controllerActorId !== controller.actorId) {
    throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
  }
  return { controller, agent };
}

export function createAgentAccountChallengeCommandHandler({ proofAdapters } = {}) {
  const adapters = adapterMap(proofAdapters);
  return Object.freeze({
    operationId: "pilotCreateAgentAccountChallenge",
    kind: "command",
    async plan({
      client,
      coreRepository,
      directory,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeCreateChallengePayload(payload);
      if (authorizationDecision.resourceType !== "subject") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const subject = subjectState?.value;
      if (!subject || subject.subjectType !== SubjectType.AGENT || subject.status !== "pending") {
        throw new DomainError("agent_subject_not_pending", "account proof requires the exact pending Agent Subject");
      }
      const { controller, agent } = await requireSubjectBindings({ directory, subjectId: subject.subjectId, now });
      if (controller.actorId !== authenticationContext.actorId) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const pendingChallenge = await coreRepository.findPendingAgentAccountChallengeForSubjectInTransaction(
        client,
        subject.subjectId,
        { lock: true }
      );
      let expiredChallenge;
      let expirationEvent;
      let expiredChallengeState;
      if (pendingChallenge) {
        expiredChallengeState = await coreRepository.getProjectionStateInTransaction(
          client,
          CoreProjectionType.AGENT_ACCOUNT_CHALLENGE,
          pendingChallenge.challengeId,
          { lock: true }
        );
        if (!expiredChallengeState || expiredChallengeState.value.status !== "pending") {
          throw new DomainError("projection_integrity_mismatch", "pending Agent account challenge projection is unavailable");
        }
        expiredChallenge = expireAgentAccountChallenge(expiredChallengeState.value, { expiredAt: now });
        expirationEvent = createCreditEvent({
          eventType: CreditEventType.AGENT_ACCOUNT_CHALLENGE_EXPIRED,
          subjectId: subject.subjectId,
          chainId: expiredChallenge.chainId,
          payload: {
            challengeId: expiredChallenge.challengeId,
            subjectId: subject.subjectId,
            subjectHash: subject.subjectHash,
            accountHash: expiredChallenge.accountHash,
            chainId: expiredChallenge.chainId,
            purpose: expiredChallenge.purpose,
            typedDataHash: expiredChallenge.typedDataHash,
            actorHash: expiredChallenge.controllerActorHash,
            reasonCode: "challenge_ttl_elapsed",
            causationId: requestId,
            correlationId
          },
          now
        });
      }
      const chainId = input.accountId.split(":").slice(0, 2).join(":");
      const adapter = adapters.get(chainId);
      if (!adapter) {
        throw new DomainError("unsupported_account_proof_chain", "account proof chain is not an approved test profile");
      }
      const normalized = normalizeEvmCaip10(input.accountId, chainId);
      const issuedAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
      const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
      const nonce = `0x${randomBytes(32).toString("hex")}`;
      const typedDataInput = {
        chainId,
        tenantHash: hashId("tenant", authenticationContext.tenantId),
        subjectHash: subject.subjectHash,
        accountHash: normalized.accountHash,
        purpose: input.purpose,
        nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        protocolVersion: "1.1"
      };
      const prepared = adapter.createTypedData(typedDataInput);
      const challenge = createAgentAccountChallenge({
        subject,
        ...typedDataInput,
        controllerActorHash: hashId("actor", controller.actorId),
        agentActorHash: hashId("actor", agent.actorId),
        typedDataHash: prepared.typedDataHash
      });
      const event = createCreditEvent({
        eventType: CreditEventType.AGENT_ACCOUNT_CHALLENGE_CREATED,
        subjectId: subject.subjectId,
        chainId,
        payload: {
          challengeId: challenge.challengeId,
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          accountHash: challenge.accountHash,
          chainId,
          purpose: challenge.purpose,
          typedDataHash: challenge.typedDataHash,
          expiresAt: challenge.expiresAt,
          actorHash: challenge.controllerActorHash,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "agent_account_challenge",
        aggregateId: challenge.challengeId,
        events: [
          ...(expirationEvent ? [{
            aggregateType: "agent_account_challenge",
            aggregateId: expiredChallenge.challengeId,
            expectedVersion: expiredChallengeState.aggregateVersion,
            event: expirationEvent
          }] : []),
          {
          aggregateType: "agent_account_challenge",
          aggregateId: challenge.challengeId,
          expectedVersion: 0,
          event
          }
        ],
        writes: [
          ...(expirationEvent ? [{
            type: CoreProjectionType.AGENT_ACCOUNT_CHALLENGE,
            value: expiredChallenge,
            eventId: expirationEvent.eventId
          }] : []),
          {
          type: CoreProjectionType.AGENT_ACCOUNT_CHALLENGE,
          value: challenge,
          eventId: event.eventId
          }
        ],
        response: challengeResponse(challenge, prepared)
      };
    }
  });
}

export function submitAgentAccountProofCommandHandler({ proofAdapters } = {}) {
  const adapters = adapterMap(proofAdapters);
  return Object.freeze({
    operationId: "pilotSubmitAgentAccountProof",
    kind: "command",
    async plan({
      client,
      coreRepository,
      directory,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeSubmitProofPayload(payload);
      if (authorizationDecision.resourceType !== "subject") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const subject = subjectState?.value;
      if (!subject || subject.subjectType !== SubjectType.AGENT || subject.status !== "pending") {
        throw new DomainError("agent_subject_not_pending", "account proof requires the exact pending Agent Subject");
      }
      const { agent } = await requireSubjectBindings({ directory, subjectId: subject.subjectId, now });
      if (agent.actorId !== authenticationContext.actorId) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const challengeState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.AGENT_ACCOUNT_CHALLENGE,
        input.challengeId,
        { lock: true }
      );
      const challenge = challengeState?.value;
      if (
        !challenge ||
        challenge.subjectId !== subject.subjectId ||
        challenge.subjectHash !== subject.subjectHash ||
        challenge.tenantHash !== hashId("tenant", authenticationContext.tenantId) ||
        challenge.agentActorHash !== hashId("actor", authenticationContext.actorId)
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const adapter = adapters.get(challenge.chainId);
      if (!adapter) {
        throw new DomainError("unsupported_account_proof_chain", "account proof chain is not an approved test profile");
      }
      const verified = await adapter.verify({
        accountId: input.accountId,
        signature: input.signature,
        challenge,
        now
      });
      const existingBinding = await coreRepository.findAccountBindingByHashInTransaction(
        client,
        verified.accountHash,
        { lock: true }
      );
      if (existingBinding) {
        throw new DomainError("account_already_bound", "CAIP-10 account is already bound");
      }
      const consumedChallenge = consumeAgentAccountChallenge(challenge, { consumedAt: now });
      const proofAttempt = createAgentAccountProofAttempt({
        challenge: consumedChallenge,
        proofHash: verified.proofHash,
        verificationMethod: verified.verificationMethod,
        attemptedAt: now
      });
      const binding = createVerifiedAgentAccountBinding({
        challenge: consumedChallenge,
        accountId: verified.accountId,
        proofHash: verified.proofHash,
        verificationMethod: verified.verificationMethod,
        boundAt: now
      });
      const activatedSubject = activateAgentSubjectFromAccountProof(subject, { activatedAt: now });
      const proofEvent = createCreditEvent({
        eventType: CreditEventType.AGENT_ACCOUNT_PROOF_VERIFIED,
        subjectId: subject.subjectId,
        chainId: challenge.chainId,
        payload: {
          challengeId: challenge.challengeId,
          proofAttemptId: proofAttempt.proofAttemptId,
          accountBindingId: binding.accountBindingId,
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          accountHash: binding.accountHash,
          chainId: binding.chainId,
          purpose: binding.purpose,
          proofHash: binding.proofHash,
          verificationMethod: binding.verificationMethod,
          actorHash: challenge.agentActorHash,
          causationId: requestId,
          correlationId
        },
        now
      });
      const subjectEvent = createCreditEvent({
        eventType: CreditEventType.SUBJECT_STATUS_CHANGED,
        subjectId: subject.subjectId,
        payload: {
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          previousStatus: subject.status,
          nextStatus: activatedSubject.status,
          reasonCode: "verified_agent_account_binding",
          actorHash: challenge.agentActorHash,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "agent_account_challenge",
        aggregateId: challenge.challengeId,
        events: [
          {
            aggregateType: "agent_account_challenge",
            aggregateId: challenge.challengeId,
            expectedVersion: challengeState.aggregateVersion,
            event: proofEvent
          },
          {
            aggregateType: "subject",
            aggregateId: subject.subjectId,
            expectedVersion: subjectState.aggregateVersion,
            event: subjectEvent
          }
        ],
        writes: [
          { type: CoreProjectionType.AGENT_ACCOUNT_CHALLENGE, value: consumedChallenge, eventId: proofEvent.eventId },
          { type: CoreProjectionType.AGENT_ACCOUNT_PROOF_ATTEMPT, value: proofAttempt, eventId: proofEvent.eventId },
          { type: CoreProjectionType.ACCOUNT_BINDING, value: binding, eventId: proofEvent.eventId },
          { type: CoreProjectionType.SUBJECT, value: activatedSubject, eventId: subjectEvent.eventId }
        ],
        response: {
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          status: activatedSubject.status,
          accountBinding: {
            accountBindingId: binding.accountBindingId,
            accountHash: binding.accountHash,
            chainId: binding.chainId,
            purpose: binding.purpose,
            proofHash: binding.proofHash,
            verificationMethod: binding.verificationMethod,
            status: binding.status,
            boundAt: binding.boundAt,
            protocolVersion: binding.protocolVersion
          },
          challengeConsumed: true,
          productionAuthority: false,
          schemaVersion: "tenant_agent_account_proof_verified.v1"
        }
      };
    }
  });
}

export function readAgentAccountBindingQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadAgentAccountBinding",
    kind: "query",
    async execute({ client, coreRepository, authorizationDecision }) {
      if (authorizationDecision.resourceType !== "subject") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const subject = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: false }
      );
      if (!subject || subject.subjectType !== SubjectType.AGENT) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const binding = await coreRepository.findActiveAccountBindingForSubjectInTransaction(
        client,
        subject.subjectId
      );
      return {
        subjectId: subject.subjectId,
        subjectHash: subject.subjectHash,
        subjectStatus: subject.status,
        accountBinding: binding
          ? {
              accountBindingId: binding.accountBindingId,
              accountHash: binding.accountHash,
              chainId: binding.chainId,
              purpose: binding.purpose,
              proofHash: binding.proofHash,
              verificationMethod: binding.verificationMethod,
              status: binding.status,
              boundAt: binding.boundAt,
              protocolVersion: binding.protocolVersion
            }
          : null,
        schemaVersion: "tenant_agent_account_binding_view.v1"
      };
    }
  });
}

export function createAgentAccountProofHandlers(options) {
  return Object.freeze([
    createAgentAccountChallengeCommandHandler(options),
    submitAgentAccountProofCommandHandler(options),
    readAgentAccountBindingQueryHandler()
  ]);
}
