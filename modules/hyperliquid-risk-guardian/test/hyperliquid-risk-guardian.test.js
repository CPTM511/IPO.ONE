import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  TradingFacilityRiskState,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  HyperliquidExecutionActionKind,
  HyperliquidTestnetExecutionGateway,
  InMemoryHyperliquidExecutionRepository,
  SimulatedHyperliquidExchangeTransport,
  SimulatedIsolatedHyperliquidSigner
} from "../../hyperliquid-execution/src/index.js";
import {
  HYPERLIQUID_TESTNET_RISK_POLICY_VERSION,
  HyperliquidExternalWriteState,
  HyperliquidProtectiveActionKind,
  HyperliquidProtectiveControlStatus,
  HyperliquidRiskFreshness,
  HyperliquidTestnetRiskGuardian,
  InMemoryHyperliquidRiskGuardianRepository,
  SimulatedHyperliquidProtectiveExecutor,
  createHyperliquidProtectiveControlDraft,
  createHyperliquidRiskGuardianPolicyEvaluator,
  createHyperliquidTestnetRiskSnapshot,
  createHyperliquidTestnetVenueState,
  evaluateHyperliquidExecutionRiskAdmission
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../../schemas/v2/hyperliquid-testnet-protective-control.schema.json",
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

const NOW = new Date("2026-07-25T03:00:00.000Z").getTime();
const FACILITY_ID = "trading_facility_tc302";
const FACILITY_HASH = hashId("tc302_facility", { id: FACILITY_ID });
const POLICY_HASH = hashId("tc302_simulation_policy", {
  version: HYPERLIQUID_TESTNET_RISK_POLICY_VERSION
});
const BASE_OPEN_ORDERS = Object.freeze([
  Object.freeze({
    assetIndex: 1,
    orderId: 101,
    cloid: "0x11111111111111111111111111111111",
    riskIncreasing: true
  }),
  Object.freeze({
    assetIndex: 2,
    orderId: 202,
    cloid: null,
    riskIncreasing: false
  })
]);
const BASE_POSITIONS = Object.freeze([
  Object.freeze({
    assetIndex: 1,
    side: "long",
    size: "0.01",
    protectiveLimitPx: "2500"
  }),
  Object.freeze({
    assetIndex: 2,
    side: "short",
    size: "0.2",
    protectiveLimitPx: "42.5"
  })
]);

function venue({
  observedAtMs = NOW,
  maximumAgeMs = 60_000,
  openOrders = BASE_OPEN_ORDERS,
  positions = BASE_POSITIONS,
  clock = () => NOW
} = {}) {
  return createHyperliquidTestnetVenueState(
    {
      facilityId: FACILITY_ID,
      facilityHash: FACILITY_HASH,
      sourceInfoSnapshotHash: hashId("tc302_source_info", {
        observedAtMs,
        openOrders,
        positions
      }),
      observedAtMs,
      maximumAgeMs,
      openOrders,
      positions,
      simulationFixtureOnly: true,
      productionPolicyApproved: false
    },
    { clock }
  );
}

function risk(
  venueState,
  evaluatedRiskState,
  {
    riskIncreasingKillSwitchOpen = true,
    externalWriteState = HyperliquidExternalWriteState.RECONCILED,
    clock = () => NOW
  } = {}
) {
  return createHyperliquidTestnetRiskSnapshot(
    {
      facilityId: FACILITY_ID,
      facilityHash: FACILITY_HASH,
      facilityVersion: 7,
      venueState,
      evaluatedRiskState,
      riskPolicyVersion: HYPERLIQUID_TESTNET_RISK_POLICY_VERSION,
      riskPolicyHash: POLICY_HASH,
      reasonCodes: [
        `simulation_fixture_${evaluatedRiskState.toLowerCase()}`
      ],
      riskIncreasingKillSwitchOpen,
      externalWriteState,
      simulationFixtureOnly: true,
      productionPolicyApproved: false
    },
    { clock }
  );
}

function normalizedExecutionActions() {
  return {
    [HyperliquidExecutionActionKind.ORDER]: {
      assetIndex: 1,
      side: "buy",
      limitPx: "2500",
      size: "0.01",
      timeInForce: "Gtc",
      reduceOnly: false,
      cloid: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    [HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER]: {
      assetIndex: 1,
      side: "sell",
      limitPx: "2499",
      size: "0.01",
      timeInForce: "Ioc",
      reduceOnly: true,
      cloid: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    [HyperliquidExecutionActionKind.CANCEL]: {
      assetIndex: 1,
      orderId: 101
    },
    [HyperliquidExecutionActionKind.CANCEL_BY_CLOID]: {
      assetIndex: 1,
      cloid: "0x11111111111111111111111111111111"
    },
    [HyperliquidExecutionActionKind.MODIFY]: {
      orderId: 101,
      replacement: {
        assetIndex: 1,
        side: "sell",
        limitPx: "2499",
        size: "0.005",
        timeInForce: "Ioc",
        reduceOnly: true,
        cloid: "0xcccccccccccccccccccccccccccccccc"
      }
    }
  };
}

test("TC-302 state/action matrix admits no risk increase in REDUCE_ONLY or FLATTEN", () => {
  const stateExpectations = {
    NORMAL: {
      order: true,
      reduceOnlyOrder: true,
      cancel: true,
      cancelByCloid: true,
      modify: true
    },
    WARNING: {
      order: true,
      reduceOnlyOrder: true,
      cancel: true,
      cancelByCloid: true,
      modify: true
    },
    REDUCE_ONLY: {
      order: false,
      reduceOnlyOrder: true,
      cancel: true,
      cancelByCloid: true,
      modify: true
    },
    FLATTEN: {
      order: false,
      reduceOnlyOrder: true,
      cancel: true,
      cancelByCloid: true,
      modify: false
    },
    SETTLEMENT: {
      order: false,
      reduceOnlyOrder: false,
      cancel: false,
      cancelByCloid: false,
      modify: false
    }
  };
  const actions = normalizedExecutionActions();
  const currentVenue = venue();
  for (const [state, expected] of Object.entries(stateExpectations)) {
    const snapshot = risk(currentVenue, state);
    for (const [actionKind, approved] of Object.entries(expected)) {
      const result = evaluateHyperliquidExecutionRiskAdmission({
        riskSnapshot: snapshot,
        actionKind,
        action: actions[actionKind]
      });
      assert.equal(result.approved, approved, `${state}/${actionKind}`);
      assert.equal(result.effectiveRiskState, state);
      assert.equal(result.simulationOnly, true);
    }
  }

  const nonReducingModify = structuredClone(actions.modify);
  nonReducingModify.replacement.reduceOnly = false;
  assert.equal(
    evaluateHyperliquidExecutionRiskAdmission({
      riskSnapshot: risk(
        currentVenue,
        TradingFacilityRiskState.REDUCE_ONLY
      ),
      actionKind: HyperliquidExecutionActionKind.MODIFY,
      action: nonReducingModify
    }).approved,
    false
  );
});

test("stale, future/unknown, kill-switch, and unknown-write inputs fail closed", () => {
  const cases = [
    {
      venueState: venue({ observedAtMs: NOW - 60_001 }),
      options: {},
      reason: "venue_snapshot_stale",
      freshness: HyperliquidRiskFreshness.STALE
    },
    {
      venueState: venue({ observedAtMs: NOW + 1 }),
      options: {},
      reason: "venue_snapshot_unknown",
      freshness: HyperliquidRiskFreshness.UNKNOWN
    },
    {
      venueState: venue(),
      options: { riskIncreasingKillSwitchOpen: false },
      reason: "risk_increasing_kill_switch_closed",
      freshness: HyperliquidRiskFreshness.FRESH
    },
    {
      venueState: venue(),
      options: {
        externalWriteState: HyperliquidExternalWriteState.UNKNOWN
      },
      reason: "external_write_outcome_unknown",
      freshness: HyperliquidRiskFreshness.FRESH
    }
  ];
  for (const entry of cases) {
    const snapshot = risk(
      entry.venueState,
      TradingFacilityRiskState.NORMAL,
      entry.options
    );
    assert.equal(
      snapshot.effectiveRiskState,
      TradingFacilityRiskState.REDUCE_ONLY
    );
    assert.equal(snapshot.freshness, entry.freshness);
    assert.ok(snapshot.reasonCodes.includes(entry.reason));
    assert.equal(
      evaluateHyperliquidExecutionRiskAdmission({
        riskSnapshot: snapshot,
        actionKind: HyperliquidExecutionActionKind.ORDER,
        action: normalizedExecutionActions().order
      }).approved,
      false
    );
  }
  const originallyFresh = risk(
    venue(),
    TradingFacilityRiskState.NORMAL
  );
  const agedAdmission = evaluateHyperliquidExecutionRiskAdmission({
    riskSnapshot: originallyFresh,
    actionKind: HyperliquidExecutionActionKind.ORDER,
    action: normalizedExecutionActions().order,
    serverNowMs: NOW + 60_001
  });
  assert.equal(agedAdmission.effectiveRiskState, "REDUCE_ONLY");
  assert.equal(agedAdmission.approved, false);
});

test("WARNING creates evidence while REDUCE_ONLY cancels only risk-increasing fresh orders", () => {
  const currentVenue = venue();
  const warningDraft = createHyperliquidProtectiveControlDraft({
    riskSnapshot: risk(
      currentVenue,
      TradingFacilityRiskState.WARNING
    ),
    venueState: currentVenue,
    idempotencyKey: "tc302-warning-notification"
  });
  assert.deepEqual(
    warningDraft.actions.map(({ kind }) => kind),
    [HyperliquidProtectiveActionKind.WARNING_NOTIFICATION]
  );
  assert.equal(warningDraft.actions[0].withdrawalAuthority, false);

  const reduceOnlyDraft = createHyperliquidProtectiveControlDraft({
    riskSnapshot: risk(
      currentVenue,
      TradingFacilityRiskState.REDUCE_ONLY
    ),
    venueState: currentVenue,
    idempotencyKey: "tc302-reduce-only-cancel"
  });
  assert.deepEqual(
    reduceOnlyDraft.actions.map(({ orderId }) => orderId),
    [101]
  );
  assert.equal(
    reduceOnlyDraft.actions.every(
      ({ kind }) => kind === HyperliquidProtectiveActionKind.CANCEL
    ),
    true
  );

  const staleVenue = venue({ observedAtMs: NOW - 60_001 });
  const staleDraft = createHyperliquidProtectiveControlDraft({
    riskSnapshot: risk(
      staleVenue,
      TradingFacilityRiskState.NORMAL
    ),
    venueState: staleVenue,
    idempotencyKey: "tc302-stale-cancel-all"
  });
  assert.deepEqual(
    staleDraft.actions.map(({ orderId }) => orderId),
    [101, 202]
  );
});

test("FLATTEN cancels before bounded reduce-only closes and verifies post-action state", async () => {
  const currentVenue = venue();
  const currentRisk = risk(
    currentVenue,
    TradingFacilityRiskState.FLATTEN
  );
  const repository = new InMemoryHyperliquidRiskGuardianRepository();
  const executor = new SimulatedHyperliquidProtectiveExecutor({
    venueState: currentVenue,
    clock: () => NOW
  });
  const guardian = new HyperliquidTestnetRiskGuardian({
    repository,
    executor,
    clock: () => NOW
  });
  const input = {
    riskSnapshot: currentRisk,
    venueState: currentVenue,
    idempotencyKey: "tc302-flatten-idempotent"
  };
  const [left, right] = await Promise.all([
    guardian.enforce(input),
    guardian.enforce(input)
  ]);
  assert.deepEqual(right, left);
  assert.equal(left.status, HyperliquidProtectiveControlStatus.VERIFIED);
  assert.equal(left.targetRiskState, TradingFacilityRiskState.FLATTEN);
  assert.deepEqual(
    left.actions.map(({ kind }) => kind),
    ["cancel", "cancel", "reduceOnlyClose", "reduceOnlyClose"]
  );
  assert.equal(
    left.actions
      .filter(({ kind }) => kind === "reduceOnlyClose")
      .every(({ reduceOnly }) => reduceOnly === true),
    true
  );
  assert.equal(left.verification.openOrderCount, 0);
  assert.equal(left.verification.positionCount, 0);
  assert.equal(left.verification.automaticRecovery, false);
  assert.equal(executor.executionCount, 4);
  assert.equal(validate(left), true, JSON.stringify(validate.errors));
  assert.deepEqual(
    (await repository.transitionHistory(left.controlId)).map(
      ({ nextStatus }) => nextStatus
    ),
    ["PLANNED", "EXECUTING", "VERIFIED"]
  );

  const restarted = new InMemoryHyperliquidRiskGuardianRepository(
    repository.exportSnapshot()
  );
  const replayExecutor = new SimulatedHyperliquidProtectiveExecutor({
    venueState: currentVenue,
    clock: () => NOW
  });
  const replayed = await new HyperliquidTestnetRiskGuardian({
    repository: restarted,
    executor: replayExecutor,
    clock: () => NOW
  }).enforce(input);
  assert.deepEqual(replayed, left);
  assert.equal(replayExecutor.executionCount, 0);

  const corruptedSnapshot = structuredClone(repository.exportSnapshot());
  corruptedSnapshot.records[0].actions[0].orderId += 1;
  assert.throws(
    () => new InMemoryHyperliquidRiskGuardianRepository(corruptedSnapshot),
    (error) => error.code === "invalid_hyperliquid_protective_action"
  );
});

test("rejection is INCOMPLETE, interruption is UNKNOWN, and neither path auto-recovers", async () => {
  const currentVenue = venue({
    openOrders: [BASE_OPEN_ORDERS[0]],
    positions: [BASE_POSITIONS[0]]
  });
  const currentRisk = risk(
    currentVenue,
    TradingFacilityRiskState.FLATTEN
  );
  const run = async (executor, suffix) => {
    const repository = new InMemoryHyperliquidRiskGuardianRepository();
    return new HyperliquidTestnetRiskGuardian({
      repository,
      executor,
      clock: () => NOW
    }).enforce({
      riskSnapshot: currentRisk,
      venueState: currentVenue,
      idempotencyKey: `tc302-failure-${suffix}`
    });
  };
  const incomplete = await run(
    new SimulatedHyperliquidProtectiveExecutor({
      venueState: currentVenue,
      clock: () => NOW,
      dispositions: ["confirmed", "rejected"]
    }),
    "rejected"
  );
  assert.equal(
    incomplete.status,
    HyperliquidProtectiveControlStatus.INCOMPLETE
  );
  assert.equal(incomplete.verification.positionCount, 1);
  assert.equal(incomplete.automaticRecovery, false);

  const unknown = await run(
    new SimulatedHyperliquidProtectiveExecutor({
      venueState: currentVenue,
      clock: () => NOW,
      throwAtOrdinal: 1
    }),
    "interrupted"
  );
  assert.equal(unknown.status, HyperliquidProtectiveControlStatus.UNKNOWN);
  assert.equal(unknown.actionResults[0].disposition, "unknown");
  assert.equal(unknown.verification.outcome, "UNKNOWN");
  assert.equal(unknown.automaticRecovery, false);
});

test("TC-301 gateway consumes the Guardian policy and reserves no nonce for denied new risk", async () => {
  const currentVenue = venue();
  const currentRisk = risk(
    currentVenue,
    TradingFacilityRiskState.REDUCE_ONLY
  );
  const repository = new InMemoryHyperliquidExecutionRepository();
  const policyEvaluator = createHyperliquidRiskGuardianPolicyEvaluator({
    snapshotProvider: {
      async getRiskSnapshot() {
        return currentRisk;
      }
    },
    clock: () => NOW
  });
  const gateway = new HyperliquidTestnetExecutionGateway({
    repository,
    bindingResolver: {
      async resolve({ facilityId, facilityHash }) {
        return {
          facilityId,
          facilityHash,
          accountBindingHash: hashId("tc302_account_binding", {
            facilityId
          }),
          signerReferenceHash: hashId("tc302_signer_reference", {
            facilityId
          }),
          simulationOnly: true,
          liveSignerAvailable: false,
          apiWalletApproved: false,
          keyExportable: false
        };
      }
    },
    policyEvaluator,
    signer: new SimulatedIsolatedHyperliquidSigner(),
    transport: new SimulatedHyperliquidExchangeTransport(),
    clock: () => NOW
  });
  const base = {
    facilityId: FACILITY_ID,
    facilityHash: FACILITY_HASH,
    facilityVersion: 7,
    orderIntentId: "trading_order_intent_tc302",
    orderIntentHash: hashId("tc302_order_intent", { id: 1 }),
    orderIntentVersion: 1
  };
  await assert.rejects(
    () =>
      gateway.execute({
        ...base,
        idempotencyKey: "tc302-denied-risk-increase",
        action: {
          kind: HyperliquidExecutionActionKind.ORDER,
          assetIndex: 1,
          side: "buy",
          limitPx: "2500",
          size: "0.01",
          timeInForce: "Gtc"
        }
      }),
    (error) => error.code === "hyperliquid_execution_policy_denied"
  );
  assert.equal(repository.exportSnapshot().records.length, 0);

  const protective = await gateway.execute({
    ...base,
    idempotencyKey: "tc302-proven-reduce-only",
    action: {
      kind: HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER,
      assetIndex: 1,
      side: "sell",
      limitPx: "2499",
      size: "0.01",
      timeInForce: "Ioc"
    }
  });
  assert.equal(protective.nonceState, "CONFIRMED");
  assert.equal(protective.action.reduceOnly, true);
  assert.equal(protective.externalOrderSubmitted, false);
});

test("liquidation-buffer scenarios are simulation fixtures, not production thresholds", () => {
  const fixtureState = (liquidationBufferBps) => {
    if (liquidationBufferBps <= 100) return TradingFacilityRiskState.FLATTEN;
    if (liquidationBufferBps <= 300) {
      return TradingFacilityRiskState.REDUCE_ONLY;
    }
    if (liquidationBufferBps <= 600) return TradingFacilityRiskState.WARNING;
    return TradingFacilityRiskState.NORMAL;
  };
  const scenarios = [
    [1000, "NORMAL"],
    [600, "WARNING"],
    [300, "REDUCE_ONLY"],
    [100, "FLATTEN"]
  ];
  const currentVenue = venue();
  for (const [liquidationBufferBps, expected] of scenarios) {
    const snapshot = risk(
      currentVenue,
      fixtureState(liquidationBufferBps)
    );
    assert.equal(snapshot.effectiveRiskState, expected);
    assert.equal(snapshot.simulationFixtureOnly, true);
    assert.equal(snapshot.productionPolicyApproved, false);
    assert.equal(snapshot.authorizingProductionRisk, false);
  }
});

test("Risk Guardian exposes no arbitrary order, withdrawal, transfer, or account-administration path", async () => {
  const currentVenue = venue();
  const executor = new SimulatedHyperliquidProtectiveExecutor({
    venueState: currentVenue,
    clock: () => NOW
  });
  assert.equal(executor.profile.arbitraryOrderMethodAvailable, false);
  assert.equal(executor.profile.withdrawalMethodAvailable, false);
  assert.equal(executor.profile.transferMethodAvailable, false);
  assert.equal(executor.profile.accountAdministrationMethodAvailable, false);
  assert.equal(executor.profile.liveSignerAvailable, false);
  assert.equal(executor.profile.apiWalletApproved, false);
  assert.equal("withdraw" in executor, false);
  assert.equal("transfer" in executor, false);
  assert.equal("order" in executor, false);
  await assert.rejects(
    () => executor.execute({ kind: "withdraw3" }),
    (error) => error.code === "hyperliquid_protective_action_denied"
  );
});
