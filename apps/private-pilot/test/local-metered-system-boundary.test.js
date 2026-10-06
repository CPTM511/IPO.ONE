import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceHasher } from "../../../modules/authentication/src/index.js";
import { createLocalPilotIdentities } from "../src/local-pilot-identities.js";
import { createLocalMeteredSystemBoundary } from "../src/local-metered-system-boundary.js";

test("metered worker resolves its current durable enrollment and rejects binding drift", async () => {
  const identity = createLocalPilotIdentities().identities.meteredUsageWorker;
  const referenceHasher = createReferenceHasher(Buffer.alloc(32, 7));
  const context = identity.createContext();
  const stored = { ...identity.credential, credentialId: "credential_durable_metered", version: 2,
    senderConstraint: { method: "dpop", thumbprint: referenceHasher.hash("sender.constraint",
      referenceHasher.hash("local.metered-usage-worker", identity.actorId)) } };
  let current = stored;
  let reads = 0;
  const boundary = createLocalMeteredSystemBoundary({ identity, referenceHasher,
    credentialRegistry: { async findBySubject(input) {
      reads += 1;
      assert.equal(input.clientId, identity.clientId);
      assert.equal(input.tenantId, context.tenantId);
      return current;
    } } });
  assert.equal((await boundary.createContext()).credentialId, stored.credentialId);
  assert.equal((await boundary.createContext()).credentialVersion, 2);
  for (const change of [{status:"revoked"},{actorId:"actor_other"},{tenantId:"tenant_other"},
    {clientId:"client_other"},{allowedCapabilities:[...stored.allowedCapabilities,"credit.request"]},
    {senderConstraint:{method:"dpop",thumbprint:"wrong"}}]) {
    current = {...stored,...change};
    await assert.rejects(()=>boundary.createContext(),{code:"local_metered_worker_binding_rejected"});
  }
  assert.equal(reads, 8);
});
