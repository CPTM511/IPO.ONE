import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HYPERLIQUID_TESTNET_EXCHANGE_PROFILE,
  HyperliquidExecutionActionKind,
  HyperliquidExecutionNonceState,
  HyperliquidTestnetExecutionGateway,
  InMemoryHyperliquidExecutionRepository,
  PostgresHyperliquidExecutionRepository,
  SimulatedHyperliquidExchangeTransport,
  SimulatedIsolatedHyperliquidSigner
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../../schemas/v2/hyperliquid-testnet-execution-record.schema.json",
      import.meta.url
    ),
    "utf8"
  )
);
const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
})
  .addFormat("date-time", {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  })
  .compile(schema);

const NOW = 1_753_440_000_000;
const FACILITY_ID = "trading_facility_tc301";
const FACILITY_HASH = hashId("test_facility", { id: FACILITY_ID });
const ORDER_INTENT_ID = "trading_order_intent_tc301";
const ORDER_INTENT_HASH = hashId("test_order_intent", {
  id: ORDER_INTENT_ID
});
const ACCOUNT_BINDING_HASH = hashId("test_account_binding", {
  id: FACILITY_ID
});
const SIGNER_REFERENCE_HASH = hashId("test_simulated_signer_reference", {
  id: FACILITY_ID
});

const BASE = Object.freeze({
  facilityId: FACILITY_ID,
  facilityHash: FACILITY_HASH,
  facilityVersion: 7,
  orderIntentId: ORDER_INTENT_ID,
  orderIntentHash: ORDER_INTENT_HASH,
  orderIntentVersion: 1
});

const ACTIONS = Object.freeze([
  Object.freeze({
    kind: HyperliquidExecutionActionKind.ORDER,
    assetIndex: 1,
    side: "buy",
    limitPx: "2500.25",
    size: "0.01",
    timeInForce: "Gtc"
  }),
  Object.freeze({
    kind: HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER,
    assetIndex: 1,
    side: "sell",
    limitPx: "2499.75",
    size: "0.01",
    timeInForce: "Ioc"
  }),
  Object.freeze({
    kind: HyperliquidExecutionActionKind.CANCEL,
    assetIndex: 1,
    orderId: 123456
  }),
  Object.freeze({
    kind: HyperliquidExecutionActionKind.CANCEL_BY_CLOID,
    assetIndex: 1,
    cloid: "0x11111111111111111111111111111111"
  }),
  Object.freeze({
    kind: HyperliquidExecutionActionKind.MODIFY,
    orderId: 123456,
    replacement: Object.freeze({
      assetIndex: 1,
      side: "sell",
      limitPx: "2501",
      size: "0.005",
      timeInForce: "Alo",
      reduceOnly: true
    })
  })
]);

function bindingResolver(overrides = {}) {
  return {
    async resolve({ facilityId, facilityHash }) {
      return {
        facilityId,
        facilityHash,
        accountBindingHash: ACCOUNT_BINDING_HASH,
        signerReferenceHash: SIGNER_REFERENCE_HASH,
        simulationOnly: true,
        liveSignerAvailable: false,
        apiWalletApproved: false,
        keyExportable: false,
        ...overrides
      };
    }
  };
}

function policyEvaluator(overrides = {}) {
  return {
    async evaluate(input) {
      return {
        approved: true,
        policyDecisionHash: hashId("test_execution_policy_decision", input),
        actionKind: input.actionKind,
        serverReduceOnlyProven:
          input.actionKind ===
          HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER,
        killSwitchOpen: true,
        simulationOnly: true,
        ...overrides
      };
    }
  };
}

function harness({
  repository = new InMemoryHyperliquidExecutionRepository(),
  transport = new SimulatedHyperliquidExchangeTransport(),
  signer = new SimulatedIsolatedHyperliquidSigner(),
  binding = bindingResolver(),
  policy = policyEvaluator(),
  clock = () => NOW
} = {}) {
  return {
    repository,
    transport,
    signer,
    gateway: new HyperliquidTestnetExecutionGateway({
      repository,
      bindingResolver: binding,
      policyEvaluator: policy,
      signer,
      transport,
      clock
    })
  };
}

function request(action, suffix) {
  return {
    ...BASE,
    idempotencyKey: `tc301-idempotency-${suffix}`,
    action
  };
}

test("TC-301 profile is source-fixed, Testnet-only, and network-disabled", () => {
  assert.deepEqual(HYPERLIQUID_TESTNET_EXCHANGE_PROFILE, {
    profileId: "hyperliquid_testnet_exchange_simulation.v1",
    environment: "hyperliquid_testnet",
    origin: "https://api.hyperliquid-testnet.xyz",
    path: "/exchange",
    endpoint: "https://api.hyperliquid-testnet.xyz/exchange",
    method: "POST",
    expiresAfterMs: 30000,
    simulationOnly: true,
    liveTransportApproved: false,
    liveSignerApproved: false,
    apiWalletProvisioningApproved: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "hyperliquid_testnet_exchange_profile.v1"
  });
  for (const options of [
    {},
    { origin: "https://api.hyperliquid.xyz" },
    { fetchImpl: fetch },
    { privateKey: "not-a-key" }
  ]) {
    assert.throws(
      () => new HyperliquidTestnetExecutionGateway(options),
      (error) => error.code === "hyperliquid_execution_runtime_unavailable" ||
        error.code === "invalid_hyperliquid_execution_configuration"
    );
  }
});

test("all five typed allowlisted actions complete only as reconciled simulations", async () => {
  const { gateway, transport, repository } = harness();
  for (const [index, action] of ACTIONS.entries()) {
    const record = await gateway.execute(request(action, `allow-${index}`));
    assert.equal(record.nonceState, HyperliquidExecutionNonceState.CONFIRMED);
    assert.equal(record.outcome, "simulated_confirmed");
    assert.equal(record.actionKind, action.kind);
    assert.equal(record.simulationOnly, true);
    assert.equal(record.externalSystemQueried, false);
    assert.equal(record.externalOrderSubmitted, false);
    assert.equal(record.reconciled, true);
    assert.equal(record.keyExportable, false);
    assert.equal(record.withdrawalAuthority, false);
    assert.equal(record.transferAuthority, false);
    assert.equal(record.accountAdministrationAuthority, false);
    assert.equal(record.mainnetAuthority, false);
    assert.equal(record.fundsAuthority, false);
    assert.equal(validate(record), true, JSON.stringify(validate.errors));
    assert.deepEqual(
      (await repository.transitionHistory(record.executionId)).map(
        ({ state, nextState }) => state ?? nextState
      ),
      ["RESERVED", "SUBMITTED", "CONFIRMED"]
    );
  }
  assert.equal(transport.submissionHashes.length, ACTIONS.length);
});

test("denylist and raw/open action shapes fail before nonce reservation", async () => {
  const denied = [
    "withdraw3",
    "usdSend",
    "spotSend",
    "sendAsset",
    "usdClassTransfer",
    "vaultTransfer",
    "approveAgent",
    "approveBuilderFee",
    "updateLeverage",
    "updateIsolatedMargin",
    "scheduleCancel",
    "twapOrder",
    "twapCancel",
    "vaultDeposit",
    "vaultWithdraw",
    "tokenDelegate",
    "cDeposit",
    "cWithdraw",
    "registerReferrer",
    "reserveRequestWeight",
    "noop",
    "unknown"
  ];
  for (const kind of denied) {
    const repository = new InMemoryHyperliquidExecutionRepository();
    const { gateway } = harness({ repository });
    await assert.rejects(
      gateway.execute(
        request({ kind, destination: "0x2222222222222222222222222222222222222222" }, kind)
      ),
      (error) => error.code === "hyperliquid_execution_action_denied"
    );
    assert.equal(repository.exportSnapshot().records.length, 0);
  }

  for (const [index, action] of [
    { ...ACTIONS[0], rawAction: {} },
    { ...ACTIONS[0], reduceOnly: true },
    { ...ACTIONS[2], url: "https://api.hyperliquid.xyz/exchange" },
    { ...ACTIONS[2], orderId: 0 },
    { ...ACTIONS[3], cloid: "0x1" },
    {
      ...ACTIONS[4],
      replacement: { ...ACTIONS[4].replacement, destination: "external" }
    }
  ].entries()) {
    const repository = new InMemoryHyperliquidExecutionRepository();
    await assert.rejects(
      harness({ repository }).gateway.execute(
        request(action, `closed-${index}`)
      )
    );
    assert.equal(repository.exportSnapshot().records.length, 0);
  }
});

test("server binding, reduce-only proof, and kill switch fail closed", async () => {
  await assert.rejects(
    harness({
      binding: bindingResolver({ liveSignerAvailable: true })
    }).gateway.execute(request(ACTIONS[0], "live-signer")),
    (error) => error.code === "hyperliquid_execution_binding_unavailable"
  );
  await assert.rejects(
    harness({
      policy: policyEvaluator({ killSwitchOpen: false })
    }).gateway.execute(request(ACTIONS[0], "kill-switch")),
    (error) => error.code === "hyperliquid_execution_policy_denied"
  );
  await assert.rejects(
    harness({
      policy: policyEvaluator({ serverReduceOnlyProven: false })
    }).gateway.execute(request(ACTIONS[1], "unproven-reduce-only")),
    (error) => error.code === "hyperliquid_execution_reduce_only_unproven"
  );
});

test("concurrent reservations are unique and monotonic per signer", async () => {
  const repository = new InMemoryHyperliquidExecutionRepository();
  const { gateway } = harness({ repository });
  const records = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      gateway.execute(request(ACTIONS[0], `concurrent-${index}`))
    )
  );
  const nonces = records.map(({ nonce }) => nonce).sort((a, b) => a - b);
  assert.equal(new Set(nonces).size, 100);
  assert.deepEqual(
    nonces,
    Array.from({ length: 100 }, (_, index) => NOW + index)
  );
});

test("PostgreSQL nonce reservation serializes one signer before reading durable state", async () => {
  const queries = [];
  const client = {
    async query(sql, parameters = []) {
      queries.push({ sql, parameters });
      if (sql.includes("FROM trading_testnet_execution_records")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("INSERT INTO trading_execution_nonce_heads")) {
        return { rowCount: 1, rows: [{ last_nonce: NOW }] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const repository = new PostgresHyperliquidExecutionRepository({
    eventRepository: {
      async withTenantWrite(operation) {
        return operation(client);
      },
      async withTenantRead(operation) {
        return operation(client);
      }
    }
  });
  const draft = {
    requestHash: hashId("test_execution_request", BASE),
    facilityId: FACILITY_ID,
    facilityHash: FACILITY_HASH,
    orderIntentId: ORDER_INTENT_ID,
    orderIntentHash: ORDER_INTENT_HASH,
    accountBindingHash: ACCOUNT_BINDING_HASH,
    signerReferenceHash: SIGNER_REFERENCE_HASH,
    idempotencyKeyHash: hashId("test_execution_idempotency", BASE),
    policyDecisionHash: hashId("test_execution_policy", BASE),
    actionKind: HyperliquidExecutionActionKind.ORDER,
    actionHash: hashId("test_execution_action", ACTIONS[0]),
    action: ACTIONS[0],
    cloid: "0x11111111111111111111111111111111"
  };

  await repository.reserve(draft, {
    nowMs: NOW,
    expiresAfter: NOW + HYPERLIQUID_TESTNET_EXCHANGE_PROFILE.expiresAfterMs
  });

  assert.match(queries[0].sql, /pg_advisory_xact_lock/);
  assert.deepEqual(queries[0].parameters, [
    `hyperliquid_execution_nonce:${SIGNER_REFERENCE_HASH}`
  ]);
  assert.match(queries[1].sql, /FROM trading_testnet_execution_records/);
  assert.match(queries[2].sql, /INSERT INTO trading_execution_nonce_heads/);
});

test("idempotent replay returns one result and conflicting reuse is denied", async () => {
  const { gateway, transport } = harness();
  const input = request(ACTIONS[0], "replay");
  const first = await gateway.execute(input);
  const replay = await gateway.execute(input);
  assert.deepEqual(replay, first);
  assert.equal(transport.submissionHashes.length, 1);
  await assert.rejects(
    gateway.execute({ ...input, action: ACTIONS[2] }),
    (error) => error.code === "hyperliquid_execution_idempotency_conflict"
  );
  assert.equal(transport.submissionHashes.length, 1);
});

test("UNKNOWN is terminal, persists across restart, and is never retried", async () => {
  const repository = new InMemoryHyperliquidExecutionRepository();
  const firstTransport = new SimulatedHyperliquidExchangeTransport({
    disposition: "unknown"
  });
  const firstHarness = harness({
    repository,
    transport: firstTransport
  });
  const input = request(ACTIONS[0], "unknown");
  const first = await firstHarness.gateway.execute(input);
  assert.equal(first.nonceState, HyperliquidExecutionNonceState.UNKNOWN);
  assert.equal(first.outcome, "simulated_unknown");
  assert.equal(firstTransport.submissionHashes.length, 1);

  const restartedRepository = new InMemoryHyperliquidExecutionRepository(
    repository.exportSnapshot()
  );
  const restartedTransport = new SimulatedHyperliquidExchangeTransport();
  const restarted = harness({
    repository: restartedRepository,
    transport: restartedTransport
  });
  const replay = await restarted.gateway.execute(input);
  assert.deepEqual(replay, first);
  assert.equal(restartedTransport.submissionHashes.length, 0);

  const next = await restarted.gateway.execute(
    request(ACTIONS[0], "after-restart")
  );
  assert.equal(next.nonce, first.nonce + 1);
});

test("signer failure consumes the nonce and persists a local rejection", async () => {
  const repository = new InMemoryHyperliquidExecutionRepository();
  const signer = new SimulatedIsolatedHyperliquidSigner();
  signer.sign = async () => {
    throw new Error("simulated signer outage");
  };
  const { gateway, transport } = harness({ repository, signer });
  const input = request(ACTIONS[0], "signer-outage");
  await assert.rejects(gateway.execute(input), /simulated signer outage/);
  const idempotencyKeyHash = hashId("hyperliquid_execution_idempotency", {
    idempotencyKey: input.idempotencyKey
  });
  const record = await repository.findByIdempotencyHash(idempotencyKeyHash);
  assert.equal(record.nonceState, HyperliquidExecutionNonceState.REJECTED);
  assert.equal(record.submittedAt, null);
  assert.equal(transport.submissionHashes.length, 0);
  assert.equal(validate(record), true, JSON.stringify(validate.errors));

  const replay = await gateway.execute(input);
  assert.deepEqual(replay, record);
  assert.equal(transport.submissionHashes.length, 0);
});

test("transport exceptions become terminal UNKNOWN without a retry", async () => {
  const transport = new SimulatedHyperliquidExchangeTransport();
  transport.submit = async () => {
    throw new Error("ambiguous simulated timeout");
  };
  const { gateway } = harness({ transport });
  const record = await gateway.execute(
    request(ACTIONS[0], "transport-timeout")
  );
  assert.equal(record.nonceState, HyperliquidExecutionNonceState.UNKNOWN);
  assert.equal(record.outcome, "simulated_unknown");
  assert.equal(validate(record), true, JSON.stringify(validate.errors));
});

test("durable records contain no raw signature, key, address, or response", async () => {
  const repository = new InMemoryHyperliquidExecutionRepository();
  const { gateway } = harness({ repository });
  await gateway.execute(request(ACTIONS[0], "secret-review"));
  const snapshot = repository.exportSnapshot();
  const durable = JSON.stringify(snapshot);
  const keys = [];
  function collectKeys(value) {
    if (Array.isArray(value)) {
      value.forEach(collectKeys);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested);
    }
  }
  collectKeys(snapshot);
  for (const forbidden of [
    "signature",
    "privateKey",
    "seed",
    "mnemonic",
    "rawResponse"
  ]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
  assert.equal(
    durable.includes("0x2222222222222222222222222222222222222222"),
    false
  );
  const source = await readFile(
    new URL("../src/index.js", import.meta.url),
    "utf8"
  );
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(/process\.env/.test(source), false);
  assert.equal(/console\./.test(source), false);
});
