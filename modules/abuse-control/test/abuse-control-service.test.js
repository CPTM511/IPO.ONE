import assert from "node:assert/strict";
import test from "node:test";
import { createProblemDetails } from "../../../packages/api-contract/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../authentication/src/index.js";
import { createAuthenticationContext } from "../../authentication/src/authentication-context.js";
import {
  AbuseControlService,
  AdmissionDisposition,
  AdmissionOutcome,
  InMemoryAtomicQuotaStore,
  abuseHash,
  createTrustedAccountContext,
  createTrustedNetworkContext
} from "../src/index.js";

const START = new Date("2026-07-14T00:00:00.000Z");

function createClock() {
  let now = START.getTime();
  return {
    clock: () => new Date(now),
    advance: (milliseconds) => { now += milliseconds; },
    rewind: (milliseconds) => { now -= milliseconds; }
  };
}

function authenticationContext({
  tenantId = "tenant_abuse_test",
  actorId = "actor_abuse_agent",
  clientId = `client_${actorId}`,
  actorType = ActorType.AGENT
} = {}) {
  return createAuthenticationContext({
    tenantId,
    actorId,
    actorType,
    clientId,
    credentialId: `credential_${actorId}`,
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: ["credit.request"],
    roles: [actorType],
    tokenJtiHash: abuseHash("test_token", { tenantId, actorId }),
    authenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: SenderConstraintMethod.DPOP,
    authenticatedAt: START,
    amr: []
  });
}

function harness({ faultInjector, maxEntries } = {}) {
  const time = createClock();
  const store = new InMemoryAtomicQuotaStore({
    clock: time.clock,
    faultInjector,
    ...(maxEntries === undefined ? {} : { maxEntries })
  });
  return {
    ...time,
    store,
    service: new AbuseControlService({ store, clock: time.clock })
  };
}

async function complete(service, admission, outcome = AdmissionOutcome.SUCCEEDED) {
  await service.complete({ admission, outcome });
}

test("tenant admission derives identity only from trusted Authentication Context", async () => {
  const state = harness();
  const context = authenticationContext();
  const admission = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotReadAgentSelf"
  });
  assert.equal(admission.tenantId, context.tenantId);
  assert.equal(admission.operationId, "pilotReadAgentSelf");
  assert.equal(Object.isFrozen(admission), true);
  assert.equal(state.service.assertAdmission(admission, {
    authenticationContext: context,
    operationId: "pilotReadAgentSelf"
  }), admission);
  assert.throws(
    () => state.service.assertAdmission({ ...admission }),
    (error) => error.code === "request_admission_required"
  );
  assert.throws(
    () => state.service.assertAdmission(admission, { authenticationContext: authenticationContext({ actorId: "actor_other" }) }),
    (error) => error.code === "request_admission_mismatch"
  );
  await complete(state.service, admission);

  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: { ...context },
      operationId: "pilotReadAgentSelf"
    }),
    (error) => error.code === "authentication_context_required"
  );
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotReadAgentSelf",
      tenantId: "tenant_attacker"
    }),
    (error) => error.code === "invalid_abuse_control_input"
  );
});

test("two service instances sharing one store cannot exceed atomic concurrency", async () => {
  const state = harness();
  const context = authenticationContext();
  const secondService = new AbuseControlService({ store: state.store, clock: state.clock });
  const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
    (index % 2 === 0 ? state.service : secondService).admitTenant({
      authenticationContext: context,
      operationId: "pilotSubmitSpend",
      idempotencyKey: `atomic-spend-${String(index).padStart(4, "0")}`
    })
  ));
  const admitted = attempts.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const denied = attempts.filter((item) => item.status === "rejected").map((item) => item.reason);
  assert.equal(admitted.length, 2);
  assert.equal(denied.length, 18);
  assert.equal(denied.every((error) => error.code === "request_budget_exceeded"), true);
  await Promise.all(admitted.map((admission) => complete(state.service, admission)));
});

test("economic rate, retry, byte, queue, and export policies fail closed", async () => {
  const state = harness();
  const context = authenticationContext();
  for (let index = 0; index < 30; index += 1) {
    const admission = await state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotRequestCredit",
      idempotencyKey: `credit-rate-${String(index).padStart(4, "0")}`
    });
    await complete(state.service, admission);
  }
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotRequestCredit",
      idempotencyKey: "credit-rate-over-limit"
    }),
    (error) => error.code === "request_budget_exceeded" && error.details.retryAfterClass === "short"
  );
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotSubmitSpend",
      idempotencyKey: "automatic-retry-prohibited",
      retryAttempt: 1
    }),
    (error) => error.code === "automatic_retry_prohibited" && error.details.retryAfterClass === "manual"
  );
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotSubmitSpend",
      idempotencyKey: "oversized-command-payload",
      requestMetrics: { commandBytes: 1024 * 1024 + 1 }
    }),
    (error) => error.code === "request_budget_exceeded" && error.details.retryAfterClass === "manual"
  );
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotReadAgentSelf",
      requestMetrics: { queueUnits: 1 }
    }),
    (error) => error.code === "request_budget_exceeded"
  );
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotExportAudit",
      idempotencyKey: "oversized-audit-export",
      requestMetrics: { exportRows: 10_001 }
    }),
    (error) => error.code === "request_budget_exceeded"
  );
});

test("client budgets aggregate distinct Actors without trusting caller identity fields", async () => {
  const state = harness();
  const contexts = Array.from({ length: 3 }, (_, index) => authenticationContext({
    actorId: `actor_shared_client_${index}`,
    clientId: "client_shared_economic"
  }));
  const operations = [
    "pilotRequestCredit",
    "pilotSubmitSpend",
    "pilotCaptureRevenue",
    "pilotAutoRepay"
  ];
  for (let index = 0; index < 60; index += 1) {
    const admission = await state.service.admitTenant({
      authenticationContext: contexts[index % contexts.length],
      operationId: operations[index % operations.length],
      idempotencyKey: `shared-client-economic-${String(index).padStart(4, "0")}`
    });
    await complete(state.service, admission);
  }
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: contexts[0],
      operationId: "pilotRequestCredit",
      idempotencyKey: "shared-client-economic-overflow"
    }),
    (error) => error.code === "request_budget_exceeded"
  );
});

test("persistent resource reservations survive success, roll back on failure, and release explicitly", async () => {
  const state = harness();
  const context = authenticationContext();
  const successful = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotRequestCredit",
    idempotencyKey: "resource-success-0001",
    resourceDeltas: { open_obligations: 1_000 }
  });
  await complete(state.service, successful);
  await assert.rejects(
    () => state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotRequestCredit",
      idempotencyKey: "resource-capacity-overflow",
      resourceDeltas: { open_obligations: 1 }
    }),
    (error) => error.code === "request_budget_exceeded"
  );
  await state.service.releaseTenantResources({
    authenticationContext: context,
    resourceCounts: { open_obligations: 1_000 }
  });

  const failed = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotRequestCredit",
    idempotencyKey: "resource-failure-0001",
    resourceDeltas: { open_obligations: 1_000 }
  });
  await complete(state.service, failed, AdmissionOutcome.FAILED);
  const replacement = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotRequestCredit",
    idempotencyKey: "resource-after-rollback",
    resourceDeltas: { open_obligations: 1_000 }
  });
  await complete(state.service, replacement);
});

test("idempotent commands cannot execute twice or duplicate economic resource charge", async () => {
  const state = harness();
  const context = authenticationContext();
  const input = {
    authenticationContext: context,
    operationId: "pilotSubmitSpend",
    idempotencyKey: "same-economic-command-0001",
    resourceDeltas: { open_obligations: 1 }
  };
  const first = await state.service.admitTenant(input);
  await assert.rejects(
    () => state.service.admitTenant(input),
    (error) => error.code === "idempotency_in_progress"
  );
  let executions = 0;
  const firstResult = await state.service.executeAdmitted({
    admission: first,
    execute: async () => ({ obligationId: `obligation_${++executions}` })
  });
  assert.equal(firstResult.replayed, false);
  await assert.rejects(
    () => state.service.executeAdmitted({
      admission: first,
      execute: async () => ({ obligationId: `obligation_${++executions}` })
    }),
    (error) => error.code === "request_admission_consumed"
  );
  const replay = await state.service.admitTenant(input);
  assert.equal(replay.disposition, AdmissionDisposition.REPLAY);
  const replayResult = await state.service.executeAdmitted({
    admission: replay,
    execute: async () => { throw new Error("must not execute"); },
    loadReplay: async () => firstResult.value
  });
  assert.equal(replayResult.replayed, true);
  assert.deepEqual(replayResult.value, firstResult.value);
  assert.equal(executions, 1);
  assert.equal(state.store.snapshot().capacities.open_obligations, 1);
});

test("one admission capability can invoke at most one concurrent handler", async () => {
  const state = harness();
  const admission = await state.service.admitTenant({
    authenticationContext: authenticationContext(),
    operationId: "pilotReadAgentSelf"
  });
  let executions = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const invoke = () => state.service.executeAdmitted({
    admission,
    execute: async () => {
      executions += 1;
      await blocked;
      return "ok";
    }
  });
  const first = invoke();
  const second = invoke();
  release();
  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((item) => item.status === "rejected")[0].reason.code,
    "request_admission_consumed"
  );
  assert.equal(executions, 1);
});

test("admission pressure is resource-blind and never reaches object resolution", async () => {
  const state = harness();
  const context = authenticationContext();
  const held = await Promise.all([0, 1].map((index) => state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotSubmitSpend",
    idempotencyKey: `held-spend-${index}-0000`
  })));
  let resolutions = 0;
  const gateway = async (resourceId) => {
    const admission = await state.service.admitTenant({
      authenticationContext: context,
      operationId: "pilotSubmitSpend",
      idempotencyKey: `pressured-${resourceId}`
    });
    resolutions += 1;
    return admission;
  };
  const errors = [];
  for (const resourceId of ["subject_valid_other_tenant", "subject_missing_other_tenant"]) {
    try {
      await gateway(resourceId);
    } catch (error) {
      errors.push(createProblemDetails(error, { requestId: "resource-blind-request" }));
    }
  }
  assert.equal(resolutions, 0);
  assert.deepEqual(errors[0], errors[1]);
  await Promise.all(held.map((admission) => complete(state.service, admission)));
});

test("credential and discovery limits use only server-created hashed contexts", async () => {
  const state = harness();
  const networkContext = createTrustedNetworkContext({
    networkRefHash: abuseHash("test_network", "network-a"),
    source: "local_test"
  });
  const accountContext = createTrustedAccountContext({
    accountRefHash: abuseHash("test_account", "account-a"),
    source: "local_test"
  });
  for (let index = 0; index < 10; index += 1) {
    const admission = await state.service.admitCredentialAttempt({ networkContext, accountContext });
    await complete(state.service, admission);
  }
  await assert.rejects(
    () => state.service.admitCredentialAttempt({ networkContext, accountContext }),
    (error) => error.code === "request_budget_exceeded"
  );
  await assert.rejects(
    () => state.service.admitCredentialAttempt({
      networkContext: { ...networkContext },
      accountContext
    }),
    (error) => error.code === "trusted_network_context_required"
  );

  const networkOnlyState = harness();
  const sharedNetwork = createTrustedNetworkContext({
    networkRefHash: abuseHash("test_network", "network-shared-credential"),
    source: "verified_proxy"
  });
  for (let index = 0; index < 10; index += 1) {
    const distinctAccount = createTrustedAccountContext({
      accountRefHash: abuseHash("test_account", `account-distinct-${index}`),
      source: "normalized_login_identifier"
    });
    const admission = await networkOnlyState.service.admitCredentialAttempt({
      networkContext: sharedNetwork,
      accountContext: distinctAccount
    });
    await complete(networkOnlyState.service, admission);
  }
  await assert.rejects(
    () => networkOnlyState.service.admitCredentialAttempt({
      networkContext: sharedNetwork,
      accountContext: createTrustedAccountContext({
        accountRefHash: abuseHash("test_account", "account-distinct-overflow"),
        source: "normalized_login_identifier"
      })
    }),
    (error) => error.code === "request_budget_exceeded"
  );

  const discoveryNetwork = createTrustedNetworkContext({
    networkRefHash: abuseHash("test_network", "network-discovery"),
    source: "direct_socket"
  });
  const discoveries = [];
  for (let index = 0; index < 30; index += 1) {
    const admission = await state.service.admitDiscovery({ networkContext: discoveryNetwork });
    discoveries.push(admission);
    await complete(state.service, admission);
  }
  await assert.rejects(
    () => state.service.admitDiscovery({ networkContext: discoveryNetwork }),
    (error) => error.code === "request_budget_exceeded"
  );
  assert.equal(discoveries.every((item) => !Object.hasOwn(item, "networkRefHash")), true);
});

test("store failure, lease expiry, and backward clock movement remain fail-closed", async () => {
  const unavailable = harness({ faultInjector: (stage) => {
    if (stage === "reserve") throw new Error("private datastore topology");
  } });
  await assert.rejects(
    () => unavailable.service.admitTenant({
      authenticationContext: authenticationContext(),
      operationId: "pilotReadAgentSelf"
    }),
    (error) =>
      error.code === "request_admission_unavailable" &&
      error.message.includes("topology") === false &&
      error.details.retryAfterClass === "long"
  );

  const state = harness();
  const context = authenticationContext();
  const expired = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotReadAgentSelf"
  });
  state.advance(20_000);
  assert.throws(
    () => state.service.assertAdmission(expired),
    (error) => error.code === "request_admission_expired"
  );
  state.rewind(10_000);
  const next = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotReadAgentSelf"
  });
  assert.ok(new Date(next.issuedAt) >= new Date(expired.issuedAt));
  await complete(state.service, next);
});

test("aggregate telemetry has fixed low-cardinality dimensions only", async () => {
  const state = harness();
  const context = authenticationContext({
    tenantId: "tenant_secret_customer",
    actorId: "actor_secret_customer",
    clientId: "client_secret_customer"
  });
  const admission = await state.service.admitTenant({
    authenticationContext: context,
    operationId: "pilotReadAgentSelf"
  });
  await complete(state.service, admission);
  const serialized = JSON.stringify(state.service.telemetry.snapshot());
  for (const prohibited of [context.tenantId, context.actorId, context.clientId, context.credentialId, "0x"]) {
    assert.equal(serialized.includes(prohibited), false);
  }
  assert.match(serialized, /"surface":"tenant"/);
  assert.match(serialized, /"quotaClass":"read"/);
});

test("in-memory service-wide reservations are atomic across tenants", async () => {
  const time = createClock();
  const store = new InMemoryAtomicQuotaStore({ clock: time.clock });
  const request = (tenantId, index) => ({
    admissionId: `admission_global_${tenantId}_${index}`,
    tenantId,
    operationId: "testGlobal",
    quotaClass: "mutation",
    policyVersion: "abuse_001.v1",
    rateReservations: [{
      keyHash: abuseHash("global_test_rate", "same"),
      dimension: "service",
      windowMs: 60_000,
      limit: 3,
      units: 1,
      commandScoped: false,
      partition: "service"
    }],
    capacityReservations: [{
      keyHash: abuseHash("global_test_capacity", "same"),
      kind: "concurrency_service",
      limit: 100,
      units: 1,
      release: "always",
      commandScoped: false,
      partition: "service"
    }],
    leaseMs: 1_000
  });
  const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    store.reserve(request(index % 2 === 0 ? "tenant_global_a" : "tenant_global_b", index))
  ));
  assert.equal(results.filter((item) => item.admitted).length, 3);
  assert.equal(results.filter((item) => !item.admitted && item.reason === "rate").length, 7);
});

test("quota-store contract rejects unknown, negative, and duplicate reservations", async () => {
  const store = new InMemoryAtomicQuotaStore({ clock: () => START });
  const base = {
    admissionId: "admission_store_contract_001",
    tenantId: "tenant_store_contract",
    operationId: "testStoreContract",
    quotaClass: "mutation",
    policyVersion: "abuse_001.v1",
    rateReservations: [{
      keyHash: abuseHash("store_contract_rate", "actor"),
      dimension: "actor",
      windowMs: 60_000,
      limit: 10,
      units: 1,
      commandScoped: false,
      partition: "tenant"
    }],
    capacityReservations: [{
      keyHash: abuseHash("store_contract_capacity", "actor"),
      kind: "concurrency_actor",
      limit: 2,
      units: 1,
      release: "always",
      commandScoped: false,
      partition: "tenant"
    }],
    leaseMs: 1_000
  };
  await assert.rejects(
    () => store.reserve({ ...base, callerLimit: 1_000_000 }),
    (error) => error.code === "invalid_abuse_control_input"
  );
  await assert.rejects(
    () => store.reserve({
      ...base,
      rateReservations: [{ ...base.rateReservations[0], units: -1 }]
    }),
    (error) => error.code === "invalid_abuse_control_input"
  );
  await assert.rejects(
    () => store.reserve({
      ...base,
      rateReservations: [base.rateReservations[0], { ...base.rateReservations[0] }]
    }),
    (error) => error.code === "invalid_abuse_control_input"
  );
});
