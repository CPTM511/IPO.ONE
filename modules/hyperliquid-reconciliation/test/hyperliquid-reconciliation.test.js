import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  HyperliquidReconciliationObservationKind,
  HyperliquidReconciliationStatus,
  HyperliquidTestnetReconciliationService,
  HyperliquidVenueOrderStatus,
  InMemoryHyperliquidReconciliationRepository,
  ScriptedHyperliquidVenueObservationAdapter,
  SimulatedHyperliquidReconciliationCommandGuard,
  SimulatedHyperliquidReconciliationKernelResolver,
  createSimulatedHyperliquidVenueObservation
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../../schemas/v2/hyperliquid-testnet-reconciliation-record.schema.json",
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

const NOW = new Date("2026-07-25T06:00:00.000Z").getTime();
const FACILITY_ID = "trading_facility_tc303";
const FACILITY_HASH = hashId("tc303_facility", { id: FACILITY_ID });
const ORDER_INTENT_ID = "trading_order_intent_tc303";
const ORDER_INTENT_HASH = hashId("tc303_order_intent", {
  id: ORDER_INTENT_ID
});
const EXECUTION_ID = "trading_execution_tc303";
const EXECUTION_HASH = hashId("tc303_execution", { id: EXECUTION_ID });
const ACTION_HASH = hashId("tc303_action", { id: EXECUTION_ID });
const CLOID = "0x30303030303030303030303030303030";

function kernelSnapshot(overrides = {}) {
  return {
    executionId: EXECUTION_ID,
    executionHash: EXECUTION_HASH,
    executionNonceState: "CONFIRMED",
    nonce: NOW,
    actionKind: "order",
    actionHash: ACTION_HASH,
    cloid: CLOID,
    facilityId: FACILITY_ID,
    facilityHash: FACILITY_HASH,
    facilityStateHash: hashId("tc303_facility_state", {
      id: FACILITY_ID
    }),
    facilityVersion: 9,
    orderIntentId: ORDER_INTENT_ID,
    orderIntentHash: ORDER_INTENT_HASH,
    orderIntentStateHash: hashId("tc303_order_state", {
      id: ORDER_INTENT_ID
    }),
    orderIntentVersion: 2,
    subjectId: "subject_tc303",
    obligationId: "obligation_tc303",
    accountBindingHash: hashId("tc303_account_binding", {
      id: FACILITY_ID
    }),
    signerReferenceHash: hashId("tc303_signer_reference", {
      id: FACILITY_ID
    }),
    requestedSize: "0.01",
    requestedNotionalMinor: "2500",
    canonicalLedgerStateHash: hashId("tc303_canonical_ledger", {
      transactionCount: 7
    }),
    ledgerTransactionCount: 7,
    riskSnapshotHash: hashId("tc303_risk_snapshot", {
      state: "NORMAL"
    }),
    riskState: "NORMAL",
    simulationOnly: true,
    externalOrderSubmitted: false,
    canonicalLedger: true,
    secondLedgerCreated: false,
    capturedAt: new Date(NOW).toISOString(),
    schemaVersion:
      "hyperliquid_testnet_reconciliation_kernel_snapshot.v1",
    ...overrides
  };
}

function observation(
  snapshot,
  {
    venueStatus,
    cumulativeFilledSize,
    cumulativeFillNotionalMinor,
    kind = HyperliquidReconciliationObservationKind.NORMALIZED_STATE,
    freshness = "FRESH",
    complete = true,
    reasonCode = "venue_observation",
    ordinal = venueStatus
  }
) {
  return createSimulatedHyperliquidVenueObservation(
    {
      executionHash: snapshot.executionHash,
      facilityHash: snapshot.facilityHash,
      actionHash: snapshot.actionHash,
      cloid: snapshot.cloid,
      kind,
      venueStatus,
      cumulativeFilledSize,
      cumulativeFillNotionalMinor,
      venueOrderReferenceHash:
        kind ===
        HyperliquidReconciliationObservationKind.NORMALIZED_STATE
          ? hashId("tc303_venue_order", { ordinal })
          : null,
      orderStateHash: hashId("tc303_venue_order_state", { ordinal }),
      positionStateHash: hashId("tc303_position_state", { ordinal }),
      accountStateHash: hashId("tc303_account_state", { ordinal }),
      freshness,
      complete,
      reasonCode
    },
    { clock: () => NOW }
  );
}

function harness({
  snapshot = kernelSnapshot(),
  snapshots = [snapshot],
  steps,
  repository = new InMemoryHyperliquidReconciliationRepository(),
  maxPollAttempts = 3,
  circuitBreakerFailureThreshold = 2
} = {}) {
  const adapter = new ScriptedHyperliquidVenueObservationAdapter({
    steps:
      steps ??
      [
        observation(snapshot, {
          venueStatus: HyperliquidVenueOrderStatus.FILLED,
          cumulativeFilledSize: snapshot.requestedSize,
          cumulativeFillNotionalMinor: snapshot.requestedNotionalMinor
        })
      ]
  });
  const resolver =
    new SimulatedHyperliquidReconciliationKernelResolver({ snapshots });
  const service = new HyperliquidTestnetReconciliationService({
    repository,
    commandGuard:
      new SimulatedHyperliquidReconciliationCommandGuard(),
    kernelResolver: resolver,
    observationAdapter: adapter,
    maxPollAttempts,
    circuitBreakerFailureThreshold,
    clock: () => NOW
  });
  return { adapter, repository, resolver, service };
}

function request(snapshot = kernelSnapshot(), suffix = "default") {
  return {
    executionId: snapshot.executionId,
    executionHash: snapshot.executionHash,
    idempotencyKey: `tc303-reconciliation-${suffix}`
  };
}

test("normal execution reconciles once through command, Evidence, outbox, and inbox", async () => {
  const snapshot = kernelSnapshot();
  const { service, repository, adapter } = harness({ snapshot });
  const record = await service.reconcile(request(snapshot, "normal"));
  assert.equal(record.status, HyperliquidReconciliationStatus.RECONCILED);
  assert.equal(record.outcome, "confirmed");
  assert.equal(record.reconciledOrderState, "FILLED");
  assert.equal(record.cumulativeFilledSize, "0.01");
  assert.equal(record.cumulativeFillNotionalMinor, "2500");
  assert.equal(record.latestEconomicDeltaNotionalMinor, "2500");
  assert.equal(record.processedObservationCount, 1);
  assert.equal(record.reconciled, true);
  assert.equal(record.ledgerMutationCreated, false);
  assert.equal(record.facilityMutationCreated, false);
  assert.equal(record.secondLedgerCreated, false);
  assert.equal(record.externalSystemQueried, false);
  assert.equal(record.externalOrderSubmitted, false);
  assert.equal(validate(record), true, JSON.stringify(validate.errors));
  assert.equal(adapter.callCount, 1);

  const durable = repository.exportSnapshot();
  assert.equal(durable.records.length, 1);
  assert.equal(durable.events[0][1].length, 2);
  assert.equal(durable.evidences[0][1].length, 2);
  assert.equal(durable.outbox.length, 2);
  assert.equal(durable.inbox.length, 1);
});

test("duplicate partial fill and cancel race apply cumulative economics exactly once", async () => {
  const snapshot = kernelSnapshot({
    executionNonceState: "UNKNOWN",
    riskSnapshotHash: hashId("tc303_risk_snapshot", {
      state: "REDUCE_ONLY"
    }),
    riskState: "REDUCE_ONLY"
  });
  const partial = observation(snapshot, {
    venueStatus: HyperliquidVenueOrderStatus.PARTIALLY_FILLED,
    cumulativeFilledSize: "0.004",
    cumulativeFillNotionalMinor: "1000",
    ordinal: "partial"
  });
  const canceled = observation(snapshot, {
    venueStatus: HyperliquidVenueOrderStatus.CANCELED,
    cumulativeFilledSize: "0.004",
    cumulativeFillNotionalMinor: "1000",
    ordinal: "canceled"
  });
  const { service, repository, adapter } = harness({
    snapshot,
    steps: [partial, partial, canceled],
    maxPollAttempts: 3
  });
  const record = await service.reconcile(
    request(snapshot, "partial-cancel-race")
  );
  assert.equal(record.status, HyperliquidReconciliationStatus.RECONCILED);
  assert.equal(record.outcome, "canceled");
  assert.equal(record.executionNonceState, "UNKNOWN");
  assert.equal(record.cumulativeFilledSize, "0.004");
  assert.equal(record.cumulativeFillNotionalMinor, "1000");
  assert.equal(record.latestEconomicDeltaNotionalMinor, "0");
  assert.equal(record.processedObservationCount, 2);
  assert.equal(record.newRiskBlocked, true);
  assert.equal(adapter.callCount, 3);
  const durable = repository.exportSnapshot();
  assert.equal(durable.events[0][1].length, 3);
  assert.equal(durable.inbox.length, 2);
});

test("UNKNOWN survives restart and later fresh Evidence resolves without nonce rewrite or resend", async () => {
  const snapshot = kernelSnapshot({ executionNonceState: "UNKNOWN" });
  const firstRepository =
    new InMemoryHyperliquidReconciliationRepository();
  const first = harness({
    snapshot,
    repository: firstRepository,
    steps: [{ errorCode: "simulated_adapter_timeout" }],
    maxPollAttempts: 1,
    circuitBreakerFailureThreshold: 3
  });
  const input = request(snapshot, "restart-recovery");
  const unknown = await first.service.reconcile(input);
  assert.equal(unknown.status, HyperliquidReconciliationStatus.UNKNOWN);
  assert.equal(unknown.outcome, "unknown");
  assert.equal(unknown.reconciled, false);
  assert.equal(unknown.newRiskBlocked, true);
  assert.equal(unknown.executionNonceState, "UNKNOWN");
  assert.equal(first.adapter.callCount, 1);

  const restartedRepository =
    new InMemoryHyperliquidReconciliationRepository(
      firstRepository.exportSnapshot()
    );
  const filled = observation(snapshot, {
    venueStatus: HyperliquidVenueOrderStatus.FILLED,
    cumulativeFilledSize: "0.01",
    cumulativeFillNotionalMinor: "2500",
    ordinal: "recovered-fill"
  });
  const restarted = harness({
    snapshot,
    repository: restartedRepository,
    steps: [filled],
    maxPollAttempts: 1,
    circuitBreakerFailureThreshold: 3
  });
  const recovered = await restarted.service.reconcile(input);
  assert.equal(recovered.status, HyperliquidReconciliationStatus.RECONCILED);
  assert.equal(recovered.executionNonceState, "UNKNOWN");
  assert.equal(recovered.nonce, unknown.nonce);
  assert.equal(recovered.reconciliationHash, unknown.reconciliationHash);
  assert.equal(recovered.cumulativeFillNotionalMinor, "2500");
  assert.equal(restarted.adapter.callCount, 1);
  assert.equal(
    (await restartedRepository.history(recovered.reconciliationId)).length,
    4
  );
});

test("adapter outage is bounded, opens the circuit, and manual safe-stop is terminal", async () => {
  const snapshot = kernelSnapshot({ executionNonceState: "UNKNOWN" });
  const { service, adapter, repository } = harness({
    snapshot,
    steps: [
      { errorCode: "simulated_adapter_outage" },
      { errorCode: "simulated_adapter_outage" },
      { errorCode: "simulated_adapter_outage" }
    ],
    maxPollAttempts: 5,
    circuitBreakerFailureThreshold: 2
  });
  const unknown = await service.reconcile(
    request(snapshot, "circuit-breaker")
  );
  assert.equal(unknown.status, HyperliquidReconciliationStatus.UNKNOWN);
  assert.equal(unknown.adapterFailureCount, 2);
  assert.equal(unknown.circuitBreakerOpen, true);
  assert.equal(unknown.newRiskBlocked, true);
  assert.equal(adapter.callCount, 2);

  const stopped = await service.safeStop({
    reconciliationId: unknown.reconciliationId,
    idempotencyKey: "tc303-safe-stop-circuit-0001",
    reasonCode: "founder_manual_safe_stop"
  });
  assert.equal(
    stopped.status,
    HyperliquidReconciliationStatus.SAFE_STOPPED
  );
  assert.equal(stopped.manualSafeStop, true);
  assert.equal(stopped.circuitBreakerOpen, true);
  assert.equal(stopped.reconciled, false);
  assert.equal(validate(stopped), true, JSON.stringify(validate.errors));
  const replay = await service.safeStop({
    reconciliationId: unknown.reconciliationId,
    idempotencyKey: "tc303-safe-stop-circuit-0001",
    reasonCode: "founder_manual_safe_stop"
  });
  assert.deepEqual(replay, stopped);
  assert.equal(
    (await repository.history(stopped.reconciliationId)).length,
    4
  );
});

test("Ledger, Facility, and less-restrictive risk drift become immutable incident Evidence", async () => {
  const initial = kernelSnapshot({
    riskSnapshotHash: hashId("tc303_risk_snapshot", {
      state: "REDUCE_ONLY"
    }),
    riskState: "REDUCE_ONLY"
  });
  const drifted = {
    ...initial,
    canonicalLedgerStateHash: hashId("tc303_canonical_ledger", {
      transactionCount: 8
    }),
    ledgerTransactionCount: 8,
    riskSnapshotHash: hashId("tc303_risk_snapshot", {
      state: "NORMAL"
    }),
    riskState: "NORMAL"
  };
  const filled = observation(initial, {
    venueStatus: HyperliquidVenueOrderStatus.FILLED,
    cumulativeFilledSize: "0.01",
    cumulativeFillNotionalMinor: "2500",
    ordinal: "drift"
  });
  const { service } = harness({
    snapshot: initial,
    snapshots: [initial, drifted],
    steps: [filled]
  });
  const record = await service.reconcile(request(initial, "drift"));
  assert.equal(record.status, HyperliquidReconciliationStatus.INCIDENT);
  assert.equal(record.circuitBreakerOpen, true);
  assert.equal(record.reconciled, false);
  assert.deepEqual(record.incidentReasonCodes, [
    "canonical_ledger_changed"
  ]);
  assert.equal(record.canonicalLedgerStateHash, initial.canonicalLedgerStateHash);
  assert.equal(record.ledgerMutationCreated, false);
});

test("regressing or overfilled cumulative cursors fail closed as incidents", async () => {
  const snapshot = kernelSnapshot();
  const partial = observation(snapshot, {
    venueStatus: HyperliquidVenueOrderStatus.PARTIALLY_FILLED,
    cumulativeFilledSize: "0.004",
    cumulativeFillNotionalMinor: "1000",
    ordinal: "cursor-partial"
  });
  const regressed = observation(snapshot, {
    venueStatus: HyperliquidVenueOrderStatus.PARTIALLY_FILLED,
    cumulativeFilledSize: "0.003",
    cumulativeFillNotionalMinor: "750",
    ordinal: "cursor-regressed"
  });
  const { service } = harness({
    snapshot,
    steps: [partial, regressed]
  });
  const record = await service.reconcile(
    request(snapshot, "cursor-regression")
  );
  assert.equal(record.status, HyperliquidReconciliationStatus.INCIDENT);
  assert.equal(record.cumulativeFillNotionalMinor, "1000");
  assert.equal(record.latestEconomicDeltaNotionalMinor, "0");
  assert.deepEqual(record.incidentReasonCodes, [
    "cumulative_fill_regressed"
  ]);
});

test("protected simulation E2E covers normal, reduce-only, flatten cancel, and recovery", async () => {
  const scenarios = [
    {
      name: "normal",
      snapshot: kernelSnapshot(),
      status: HyperliquidVenueOrderStatus.FILLED,
      size: "0.01",
      notional: "2500",
      expectedOutcome: "confirmed"
    },
    {
      name: "reduce-only",
      snapshot: kernelSnapshot({
        executionId: "trading_execution_tc303_reduce",
        executionHash: hashId("tc303_execution", { id: "reduce" }),
        actionKind: "reduceOnlyOrder",
        actionHash: hashId("tc303_action", { id: "reduce" }),
        cloid: "0x31313131313131313131313131313131",
        riskSnapshotHash: hashId("tc303_risk_snapshot", {
          state: "REDUCE_ONLY"
        }),
        riskState: "REDUCE_ONLY"
      }),
      status: HyperliquidVenueOrderStatus.FILLED,
      size: "0.01",
      notional: "2500",
      expectedOutcome: "confirmed"
    },
    {
      name: "flatten-cancel",
      snapshot: kernelSnapshot({
        executionId: "trading_execution_tc303_flatten_cancel",
        executionHash: hashId("tc303_execution", {
          id: "flatten-cancel"
        }),
        actionKind: "cancelByCloid",
        actionHash: hashId("tc303_action", { id: "flatten-cancel" }),
        requestedSize: "0",
        requestedNotionalMinor: "0",
        riskSnapshotHash: hashId("tc303_risk_snapshot", {
          state: "FLATTEN"
        }),
        riskState: "FLATTEN"
      }),
      status: HyperliquidVenueOrderStatus.CANCELED,
      size: "0",
      notional: "0",
      expectedOutcome: "canceled"
    },
    {
      name: "unknown-recovery",
      snapshot: kernelSnapshot({
        executionId: "trading_execution_tc303_recovery",
        executionHash: hashId("tc303_execution", { id: "recovery" }),
        executionNonceState: "UNKNOWN",
        actionHash: hashId("tc303_action", { id: "recovery" }),
        cloid: "0x32323232323232323232323232323232"
      }),
      status: HyperliquidVenueOrderStatus.FILLED,
      size: "0.01",
      notional: "2500",
      expectedOutcome: "confirmed"
    }
  ];

  for (const scenario of scenarios) {
    const { service } = harness({
      snapshot: scenario.snapshot,
      steps: [
        observation(scenario.snapshot, {
          venueStatus: scenario.status,
          cumulativeFilledSize: scenario.size,
          cumulativeFillNotionalMinor: scenario.notional,
          ordinal: scenario.name
        })
      ]
    });
    const record = await service.reconcile(
      request(scenario.snapshot, `e2e-${scenario.name}`)
    );
    assert.equal(record.status, HyperliquidReconciliationStatus.RECONCILED);
    assert.equal(record.outcome, scenario.expectedOutcome);
    assert.equal(record.externalSystemQueried, false);
    assert.equal(record.externalOrderSubmitted, false);
    assert.equal(record.liveSignerApproved, false);
    assert.equal(record.apiWalletApproved, false);
    assert.equal(record.mainnetAuthority, false);
    assert.equal(record.fundsAuthority, false);
  }
});

test("open configuration, live-capable ports, and unbounded poll policy are denied", () => {
  const snapshot = kernelSnapshot();
  const repository = new InMemoryHyperliquidReconciliationRepository();
  const commandGuard =
    new SimulatedHyperliquidReconciliationCommandGuard();
  const kernelResolver =
    new SimulatedHyperliquidReconciliationKernelResolver({
      snapshots: [snapshot]
    });
  const observationAdapter =
    new ScriptedHyperliquidVenueObservationAdapter({
      steps: [
        observation(snapshot, {
          venueStatus: HyperliquidVenueOrderStatus.FILLED,
          cumulativeFilledSize: "0.01",
          cumulativeFillNotionalMinor: "2500"
        })
      ]
    });
  for (const options of [
    {
      repository,
      commandGuard,
      kernelResolver,
      observationAdapter,
      maxPollAttempts: 6
    },
    {
      repository,
      commandGuard,
      kernelResolver,
      observationAdapter: {
        ...observationAdapter,
        profile: {
          ...observationAdapter.profile,
          networkAvailable: true
        }
      }
    },
    {
      repository,
      commandGuard,
      kernelResolver,
      observationAdapter,
      endpoint: "https://api.hyperliquid.xyz"
    }
  ]) {
    assert.throws(
      () => new HyperliquidTestnetReconciliationService(options)
    );
  }
});
