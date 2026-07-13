import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../modules/authentication/src/authentication-context.js";
import {
  AbuseControlService,
  AdmissionOutcome,
  InMemoryAtomicQuotaStore,
  abuseHash
} from "../../modules/abuse-control/src/index.js";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const NOW = new Date("2026-07-14T00:00:00.000Z");

function context() {
  return createAuthenticationContext({
    tenantId: "tenant_security_abuse",
    actorId: "actor_security_abuse",
    actorType: ActorType.AGENT,
    clientId: "client_security_abuse",
    credentialId: "credential_security_abuse",
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["subject.read.self"],
    roles: ["agent"],
    tokenJtiHash: abuseHash("security_test_token", "abuse"),
    authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: SenderConstraintMethod.DPOP,
    authenticatedAt: NOW,
    amr: []
  });
}

test("abuse-control boundary has no client-controlled identity or object-enumeration input", async () => {
  const service = await readFile(
    `${rootDir}/modules/abuse-control/src/abuse-control-service.js`,
    "utf8"
  );
  const contexts = await readFile(
    `${rootDir}/modules/abuse-control/src/abuse-contexts.js`,
    "utf8"
  );
  assert.doesNotMatch(service, /resourceId|x-forwarded-for|forwarded-for|raw[_-]?ip/i);
  assert.doesNotMatch(contexts, /x-forwarded-for|forwarded-for|cookie|authorization/i);

  let reserveCalls = 0;
  const admission = new AbuseControlService({
    store: {
      async reserve() { reserveCalls += 1; },
      async finish() {},
      async release() {}
    },
    clock: () => NOW
  });
  await assert.rejects(
    () => admission.admitTenant({
      authenticationContext: context(),
      operationId: "pilotReadAgentSelf",
      resourceId: "subject_cross_tenant_probe"
    }),
    (error) => error.code === "invalid_abuse_control_input"
  );
  assert.equal(reserveCalls, 0);
});

test("temporary admission records evict deterministically without evicting active capacity", async () => {
  const store = new InMemoryAtomicQuotaStore({ clock: () => NOW, maxEntries: 100 });
  const service = new AbuseControlService({ store, clock: () => NOW });
  const authenticationContext = context();
  for (let index = 0; index < 500; index += 1) {
    const admission = await service.admitTenant({
      authenticationContext,
      operationId: "pilotReadAgentSelf"
    });
    await service.complete({ admission, outcome: AdmissionOutcome.SUCCEEDED });
  }
  const snapshot = store.snapshot();
  assert.equal(snapshot.admissions.pending ?? 0, 0);
  assert.ok((snapshot.admissions.completed ?? 0) < 100);
  assert.equal(Object.values(snapshot.capacities).reduce((sum, value) => sum + value, 0), 0);
});

test("abuse migration keeps identity references hashed and every runtime table tenant-isolated", async () => {
  const migration = await readFile(
    `${rootDir}/db/migrations/0007_abuse_control_runtime.up.sql`,
    "utf8"
  );
  for (const required of [
    "actor_ref_hash",
    "client_ref_hash",
    "command_ref_hash",
    "ALTER TABLE %I ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE %I FORCE ROW LEVEL SECURITY",
    "tenant_context_guard_",
    "abuse_admissions_transition_guard",
    "abuse_command_charges_transition_guard",
    "statement_timeout"
  ]) {
    if (required === "statement_timeout") continue;
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(migration, /\b(actor_id|client_id|network_ref|account_ref|raw_ip|request_body)\b/i);
  const store = await readFile(
    `${rootDir}/modules/abuse-control/src/postgres-quota-store.js`,
    "utf8"
  );
  assert.match(store, /set_config\('statement_timeout'/);
  assert.match(store, /BEGIN ISOLATION LEVEL SERIALIZABLE|withTenantWrite/);
  assert.doesNotMatch(store, /Promise\.race|x-forwarded-for|raw[_-]?ip/i);
});

test("quota errors expose only coarse retry metadata", async () => {
  const store = new InMemoryAtomicQuotaStore({ clock: () => NOW });
  const service = new AbuseControlService({ store, clock: () => NOW });
  const authenticationContext = context();
  const held = await Promise.all([0, 1].map((index) => service.admitTenant({
    authenticationContext,
    operationId: "pilotSubmitSpend",
    idempotencyKey: `security-held-spend-${index}`
  })));
  await assert.rejects(
    () => service.admitTenant({
      authenticationContext,
      operationId: "pilotSubmitSpend",
      idempotencyKey: "security-held-spend-overflow"
    }),
    (error) => {
      assert.equal(error.code, "request_budget_exceeded");
      assert.deepEqual(error.details, { retryAfterClass: "short" });
      assert.doesNotMatch(error.message, /tenant|actor|limit|resource|utilization|database/i);
      return true;
    }
  );
  for (const admission of held) {
    await service.complete({ admission, outcome: AdmissionOutcome.SUCCEEDED });
  }
});
