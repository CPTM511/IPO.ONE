import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ActorType } from "../../authentication/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmExecutionAccountProofAdapter,
  X_LAYER_TESTNET_PROFILE
} from "../../chain-adapter/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  prepareExecutionAccountBindingHandler,
  readExecutionAccountBindingsHandler,
  submitExecutionAccountBindingHandler
} from "../src/index.js";

const NOW = new Date("2026-08-11T04:00:00.000Z");
const ACTOR_ID = "actor_human_execution_binding";
const SUBJECT = Object.freeze({
  subjectId: "subject_human_execution_binding",
  subjectHash: `0x${"aa".repeat(32)}`,
  subjectType: "human",
  primaryPrincipalId: "principal_human_execution_binding",
  status: "active",
  schemaVersion: "subject.v1"
});
const ADAPTERS = [
  new EvmExecutionAccountProofAdapter({ profile: BASE_SEPOLIA_PROFILE }),
  new EvmExecutionAccountProofAdapter({ profile: X_LAYER_TESTNET_PROFILE })
];

function context(coreRepository, payload, now = NOW) {
  return {
    client: {},
    coreRepository,
    payload,
    authenticationContext: {
      tenantId: "tenant_execution_binding",
      actorId: ACTOR_ID,
      actorType: ActorType.HUMAN
    },
    authorizationDecision: { resourceType: "subject", resourceId: SUBJECT.subjectId },
    now,
    requestId: "request_execution_binding_0001",
    correlationId: "correlation_execution_binding_0001"
  };
}

test("Human execution AccountBinding is one atomic proof plan and never mutates authentication identity", async () => {
  const account = privateKeyToAccount(`0x${"41".repeat(32)}`);
  const accountId = `${BASE_SEPOLIA_PROFILE.chainId}:${account.address}`;
  const challengePlan = await prepareExecutionAccountBindingHandler({
    executionProofAdapters: ADAPTERS
  }).plan(context({
    findPendingExecutionAccountBindingChallengeForSubjectInTransaction: async () => undefined,
    getProjectionStateInTransaction: async (_client, type) => {
      assert.equal(type, CoreProjectionType.SUBJECT);
      return { value: SUBJECT, aggregateVersion: 4 };
    }
  }, { accountId }));

  assert.equal(challengePlan.response.createsAuthenticationSession, false);
  assert.equal(challengePlan.response.createsExecutionAuthority, false);
  assert.deepEqual(challengePlan.writes.map(({ type }) => type), [
    CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE
  ]);
  const durable = challengePlan.writes[0].value;
  const signature = await account.signTypedData(ADAPTERS[0].createTypedData(durable).typedData);

  const proofPlan = await submitExecutionAccountBindingHandler({
    executionProofAdapters: ADAPTERS
  }).plan(context({
    getProjectionStateInTransaction: async (_client, type, id) => {
      if (type === CoreProjectionType.SUBJECT && id === SUBJECT.subjectId) {
        return { value: SUBJECT, aggregateVersion: 4 };
      }
      if (type === CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE && id === durable.challengeId) {
        return { value: durable, aggregateVersion: 1 };
      }
      return undefined;
    },
    findAccountBindingByHashInTransaction: async () => undefined
  }, { challengeId: durable.challengeId, accountId, signature }, new Date(NOW.getTime() + 30_000)));

  assert.equal(proofPlan.response.authenticationSessionChanged, false);
  assert.equal(proofPlan.response.executionAuthorityGranted, false);
  assert.equal(proofPlan.response.accountBinding.bindingKind, "execution");
  assert.deepEqual(proofPlan.writes.map(({ type }) => type), [
    CoreProjectionType.EXECUTION_ACCOUNT_BINDING_CHALLENGE,
    CoreProjectionType.EXECUTION_ACCOUNT_BINDING_PROOF_ATTEMPT,
    CoreProjectionType.ACCOUNT_BINDING
  ]);
  assert.equal(proofPlan.writes.some(({ type }) => type === CoreProjectionType.SUBJECT), false);
  assert.equal(JSON.stringify(proofPlan).includes(signature), false);
  assert.equal(JSON.stringify(proofPlan.response).includes(account.address.toLowerCase()), false);
});

test("execution AccountBinding read is Subject-bound, hash-only and non-authorizing", async () => {
  const response = await readExecutionAccountBindingsHandler().execute({
    client: {},
    coreRepository: {
      getProjectionStateInTransaction: async () => ({ value: SUBJECT, aggregateVersion: 4 }),
      listExecutionAccountBindingsForSubjectInTransaction: async () => [{
        accountBindingId: "account_binding_execution_read",
        subjectId: SUBJECT.subjectId,
        accountIdRef: "eip155:84532:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        accountHash: `0x${"11".repeat(32)}`,
        chainId: "eip155:84532",
        purpose: "execution",
        bindingKind: "execution",
        proofHash: `0x${"22".repeat(32)}`,
        verificationMethod: "eip712_eoa_v1",
        status: "active",
        boundAt: NOW.toISOString(),
        protocolVersion: "1.2"
      }]
    },
    authorizationDecision: { resourceType: "subject", resourceId: SUBJECT.subjectId }
  });

  assert.equal(response.authenticationSessionChanged, false);
  assert.equal(response.executionAuthorityGranted, false);
  assert.equal(response.accounts.length, 1);
  assert.equal(Object.hasOwn(response.accounts[0], "accountIdRef"), false);
  assert.equal(JSON.stringify(response).includes("abcdefabcdefabcdefabcdefabcdefabcdefabcd"), false);
});
