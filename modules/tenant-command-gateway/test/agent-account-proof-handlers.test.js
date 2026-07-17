import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ActorType } from "../../authentication/src/index.js";
import { BASE_SEPOLIA_PROFILE, EvmAccountProofAdapter } from "../../chain-adapter/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  createAgentAccountChallengeCommandHandler,
  readAgentAccountBindingQueryHandler,
  submitAgentAccountProofCommandHandler
} from "../src/index.js";

const NOW = new Date("2026-07-16T04:00:00.000Z");
const HUMAN_ACTOR_ID = "actor_controller_identity_test";
const AGENT_ACTOR_ID = "actor_agent_identity_test";
const SUBJECT = {
  subjectId: "subject_agent_identity_test",
  subjectHash: `0x${"aa".repeat(32)}`,
  subjectType: "agent",
  displayName: "Identity Test Agent",
  primaryPrincipalId: "principal_identity_test",
  linkedAccountIds: [],
  status: "pending",
  riskTier: "unrated",
  prototypeOnly: false,
  createdAt: "2026-07-16T03:00:00.000Z",
  updatedAt: "2026-07-16T03:00:00.000Z",
  schemaVersion: "subject.v1"
};

function bindings() {
  return [
    {
      actorId: HUMAN_ACTOR_ID,
      actorType: ActorType.HUMAN,
      relationship: "controller",
      version: 1
    },
    {
      actorId: AGENT_ACTOR_ID,
      actorType: ActorType.AGENT,
      relationship: "subject",
      controllerActorId: HUMAN_ACTOR_ID,
      version: 1
    }
  ];
}

test("controller challenge and Agent proof converge on one atomic active AccountBinding plan", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const accountId = `${BASE_SEPOLIA_PROFILE.chainId}:${account.address}`;
  const directory = { listActiveResourceBindings: async () => bindings() };
  const proofAdapters = [
    new EvmAccountProofAdapter({ profile: BASE_SEPOLIA_PROFILE }),
    new EvmAccountProofAdapter({
      profile: (await import("../../chain-adapter/src/index.js")).X_LAYER_TESTNET_PROFILE
    })
  ];
  const challengePlan = await createAgentAccountChallengeCommandHandler({ proofAdapters }).plan({
    client: {},
    coreRepository: {
      findPendingAgentAccountChallengeForSubjectInTransaction: async () => undefined,
      getProjectionStateInTransaction: async (_client, type) => {
        assert.equal(type, CoreProjectionType.SUBJECT);
        return { value: SUBJECT, aggregateVersion: 1 };
      }
    },
    directory,
    payload: { accountId, purpose: "primary" },
    authenticationContext: { tenantId: "tenant_identity_test", actorId: HUMAN_ACTOR_ID },
    authorizationDecision: { resourceType: "subject", resourceId: SUBJECT.subjectId },
    now: NOW,
    requestId: "request_identity_challenge",
    correlationId: "correlation_identity"
  });

  assert.equal(challengePlan.response.chainId, BASE_SEPOLIA_PROFILE.chainId);
  assert.equal(challengePlan.response.oneUse, true);
  assert.equal(challengePlan.response.typedData.domain.chainId, 84532);
  const challenge = challengePlan.writes[0].value;
  const adapter = proofAdapters[0];
  const signature = await account.signTypedData(adapter.createTypedData(challenge).typedData);

  const proofPlan = await submitAgentAccountProofCommandHandler({ proofAdapters }).plan({
    client: {},
    coreRepository: {
      getProjectionStateInTransaction: async (_client, type, id) => {
        if (type === CoreProjectionType.SUBJECT && id === SUBJECT.subjectId) {
          return { value: SUBJECT, aggregateVersion: 1 };
        }
        if (type === CoreProjectionType.AGENT_ACCOUNT_CHALLENGE && id === challenge.challengeId) {
          return { value: challenge, aggregateVersion: 1 };
        }
        return undefined;
      },
      findAccountBindingByHashInTransaction: async () => undefined
    },
    directory,
    payload: { challengeId: challenge.challengeId, accountId, signature },
    authenticationContext: { tenantId: "tenant_identity_test", actorId: AGENT_ACTOR_ID },
    authorizationDecision: { resourceType: "subject", resourceId: SUBJECT.subjectId },
    now: new Date(NOW.getTime() + 60_000),
    requestId: "request_identity_proof",
    correlationId: "correlation_identity"
  });

  assert.equal(proofPlan.response.status, "active");
  assert.equal(proofPlan.response.challengeConsumed, true);
  assert.equal(proofPlan.response.productionAuthority, false);
  assert.deepEqual(
    proofPlan.writes.map((write) => write.type),
    [
      CoreProjectionType.AGENT_ACCOUNT_CHALLENGE,
      CoreProjectionType.AGENT_ACCOUNT_PROOF_ATTEMPT,
      CoreProjectionType.ACCOUNT_BINDING,
      CoreProjectionType.SUBJECT
    ]
  );
  assert.equal(proofPlan.writes[0].value.status, "consumed");
  assert.equal(proofPlan.writes[2].value.accountIdRef, accountId.toLowerCase());
  assert.equal(proofPlan.writes[3].value.status, "active");
  const durableEventJson = JSON.stringify(proofPlan.events);
  assert.equal(durableEventJson.includes(signature), false);
  assert.equal(durableEventJson.includes(account.address.toLowerCase()), false);
});

test("challenge issuance rejects an active challenge and atomically expires an elapsed challenge before retry", async () => {
  const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
  const accountId = `${BASE_SEPOLIA_PROFILE.chainId}:${account.address}`;
  const directory = { listActiveResourceBindings: async () => bindings() };
  const proofAdapters = [
    new EvmAccountProofAdapter({ profile: BASE_SEPOLIA_PROFILE }),
    new EvmAccountProofAdapter({
      profile: (await import("../../chain-adapter/src/index.js")).X_LAYER_TESTNET_PROFILE
    })
  ];
  const handler = createAgentAccountChallengeCommandHandler({ proofAdapters });
  const baseInput = {
    client: {},
    directory,
    payload: { accountId, purpose: "primary" },
    authenticationContext: { tenantId: "tenant_identity_test", actorId: HUMAN_ACTOR_ID },
    authorizationDecision: { resourceType: "subject", resourceId: SUBJECT.subjectId },
    requestId: "request_identity_challenge_retry",
    correlationId: "correlation_identity_retry"
  };
  const initialPlan = await handler.plan({
    ...baseInput,
    coreRepository: {
      findPendingAgentAccountChallengeForSubjectInTransaction: async () => undefined,
      getProjectionStateInTransaction: async () => ({ value: SUBJECT, aggregateVersion: 1 })
    },
    now: NOW
  });
  const initialChallenge = initialPlan.writes[0].value;
  const repositoryWithPending = {
    findPendingAgentAccountChallengeForSubjectInTransaction: async () => initialChallenge,
    getProjectionStateInTransaction: async (_client, type) => type === CoreProjectionType.SUBJECT
      ? { value: SUBJECT, aggregateVersion: 1 }
      : { value: initialChallenge, aggregateVersion: 1 }
  };

  await assert.rejects(
    handler.plan({
      ...baseInput,
      coreRepository: repositoryWithPending,
      now: new Date(NOW.getTime() + 60_000)
    }),
    (error) => error.code === "account_proof_challenge_pending"
  );

  const replacementPlan = await handler.plan({
    ...baseInput,
    coreRepository: repositoryWithPending,
    now: new Date(NOW.getTime() + 6 * 60_000)
  });
  assert.deepEqual(
    replacementPlan.events.map(({ event }) => event.eventType),
    ["agent_account_challenge_expired", "agent_account_challenge_created"]
  );
  assert.equal(replacementPlan.writes[0].value.challengeId, initialChallenge.challengeId);
  assert.equal(replacementPlan.writes[0].value.status, "expired");
  assert.equal(replacementPlan.writes[1].value.status, "pending");
  assert.notEqual(replacementPlan.writes[1].value.challengeId, initialChallenge.challengeId);
});

test("Agent account binding read view redacts the durable CAIP-10 account reference", async () => {
  const response = await readAgentAccountBindingQueryHandler().execute({
    client: {},
    coreRepository: {
      getProjectionInTransaction: async () => ({ ...SUBJECT, status: "active" }),
      findActiveAccountBindingForSubjectInTransaction: async () => ({
        accountBindingId: "account_binding_identity_test",
        accountIdRef: "eip155:84532:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        accountHash: `0x${"11".repeat(32)}`,
        chainId: "eip155:84532",
        purpose: "primary",
        proofHash: `0x${"22".repeat(32)}`,
        verificationMethod: "eip712_eoa_v1",
        status: "active",
        boundAt: NOW.toISOString(),
        protocolVersion: "1.1"
      })
    },
    authorizationDecision: { resourceType: "subject", resourceId: SUBJECT.subjectId }
  });

  assert.equal(response.accountBinding.accountHash, `0x${"11".repeat(32)}`);
  assert.equal(Object.hasOwn(response.accountBinding, "accountIdRef"), false);
  assert.equal(JSON.stringify(response).includes("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"), false);
});
