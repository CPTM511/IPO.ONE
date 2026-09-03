import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceHasher } from "../../../modules/authentication/src/index.js";
import { assertAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";
import { createHostedMeteredSystemBoundary } from "../src/hosted-synthetic-metered-provider.js";

test("hosted Metered Resource uses one non-exportable in-process System Worker credential", async () => {
  let delegated;
  const boundary = createHostedMeteredSystemBoundary({
    credentialRegistry: {
      async assertActive(credentialId) {
        delegated = credentialId;
        return { credentialId };
      }
    },
    referenceHasher: createReferenceHasher(Buffer.alloc(32, 9)),
    tenantId: "tenant_hosted_metered",
    systemActorId: "actor_hosted_metered_worker",
    systemClientId: "client_hosted_metered_worker",
    policyVersion: "security_001.v1",
    clock: () => new Date("2026-09-03T12:00:00.000Z")
  });
  const context = assertAuthenticationContext(boundary.createContext());
  assert.equal(context.actorType, "system_worker");
  assert.equal(context.roles[0], "system_worker");
  assert.equal(context.capabilities.includes("worker.metered_usage.admit"), true);
  const active = await boundary.credentialRegistry.assertActive(context.credentialId);
  assert.equal(active.actorId, context.actorId);
  assert.equal(active.clientId, context.clientId);
  assert.equal(active.allowedCapabilities.includes("worker.metered_usage.admit"), true);
  assert.equal(Object.hasOwn(active, "privateKey"), false);
  assert.equal(Object.hasOwn(active, "accessToken"), false);
  const external = await boundary.credentialRegistry.assertActive("credential_external_agent");
  assert.equal(external.credentialId, "credential_external_agent");
  assert.equal(delegated, "credential_external_agent");
});

