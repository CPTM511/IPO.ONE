import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyntheticIdentityGateway
} from "../src/local-synthetic-identity-provider.js";

test("synthetic identity Gateway prepares Human credit and persists identity after Consent", async () => {
  const calls = [];
  const syntheticIdentity = {
    async ensure(input) {
      calls.push({ kind: "identity", input });
    }
  };
  const gateway = {
    async execute(command) {
      calls.push({ kind: "gateway", operationId: command.operationId });
      return {
        response: {
          subjectId: "subject_human_00000001",
          consent: { consentId: "consent_human_00000001" }
        }
      };
    }
  };
  const wrapped = createSyntheticIdentityGateway({
    gateway,
    syntheticIdentity
  });
  const authenticationContext = {
    actorId: "actor_human_00000001",
    actorType: "human",
    tenantId: "tenant_human_00000001"
  };

  await wrapped.execute({
    operationId: "pilotRequestCredit",
    authenticationContext,
    resource: {
      resourceType: "subject",
      resourceId: "subject_human_00000001"
    },
    payload: { authorityId: "consent_human_00000001" }
  });
  assert.deepEqual(calls.map(({ kind }) => kind), ["identity", "gateway"]);

  calls.length = 0;
  await wrapped.execute({
    operationId: "pilotCreateConsent",
    authenticationContext,
    resource: {
      resourceType: "subject",
      resourceId: "subject_human_00000001"
    },
    payload: {}
  });
  assert.deepEqual(calls.map(({ kind }) => kind), ["gateway", "identity"]);
  assert.equal(calls[1].input.consentId, "consent_human_00000001");

  calls.length = 0;
  await wrapped.execute({
    operationId: "pilotCreateConsent",
    authenticationContext: {
      ...authenticationContext,
      actorType: "agent"
    },
    resource: {
      resourceType: "subject",
      resourceId: "subject_agent_00000001"
    },
    payload: {}
  });
  assert.deepEqual(calls.map(({ kind }) => kind), ["gateway"]);
});

test("synthetic identity Gateway rejects incomplete composition", () => {
  assert.throws(
    () => createSyntheticIdentityGateway({ gateway: {}, syntheticIdentity: {} }),
    /Synthetic identity Gateway configuration is invalid/
  );
});
