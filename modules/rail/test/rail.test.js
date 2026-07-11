import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainError,
  SettlementFinality,
  SettlementOutcome,
  TransferDirection,
  hashId
} from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import {
  RailService,
  SandboxRailAdapter,
  inspectSandboxRailAdapter,
  runSandboxRailAdapterConformance
} from "../src/index.js";

const ASSET = { assetId: "asset:demo-usd", scale: 2 };
const PROVIDER_ACCOUNT = "eip155:8453:0x3333333333333333333333333333333333333333";
const FIXED_NOW = new Date("2026-07-11T00:00:00.000Z");

function createFixture({ quoteTtlMs = 300_000 } = {}) {
  const state = {
    authorizationActive: true,
    spendRequest: {
      spendRequestId: "spend_rail_1",
      subjectId: "subject_1",
      mandateId: "mandate_1",
      providerId: "provider_1",
      assetId: ASSET.assetId,
      amountMinor: "10000",
      purposeCode: "compute",
      status: "approved"
    },
    provider: {
      providerId: "provider_1",
      settlementAccountIdRef: PROVIDER_ACCOUNT,
      status: "allowlisted"
    }
  };
  const eventStore = new EventStore();
  const policyDecisionService = {
    getSpendRequest: () => structuredClone(state.spendRequest),
    getProvider: () => structuredClone(state.provider)
  };
  const authorizationService = {
    assertAuthorized: () => {
      if (!state.authorizationActive) {
        throw new DomainError("mandate_not_active", "test mandate was revoked");
      }
      return { mandateId: "mandate_1" };
    }
  };
  const adapter = new SandboxRailAdapter({ sourceAssets: [ASSET], quoteTtlMs });
  const createService = () =>
    new RailService({ eventStore, policyDecisionService, authorizationService, adapters: [adapter] });
  return { adapter, authorizationService, createService, eventStore, policyDecisionService, rail: createService(), state };
}

async function createIntent(rail, overrides = {}) {
  return rail.createProviderSpendIntent({
    spendRequestId: "spend_rail_1",
    sourceAccountRefHash: hashId("test_source_account", "source_1"),
    direction: TransferDirection.NATIVE,
    idempotencyKey: "intent-command-1",
    now: FIXED_NOW,
    ...overrides
  });
}

async function authorizeIntent(rail) {
  let intent = await createIntent(rail);
  intent = await rail.quoteTransfer({
    transferIntentId: intent.transferIntentId,
    idempotencyKey: "quote-command-1",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
  return rail.authorizeTransfer({
    transferIntentId: intent.transferIntentId,
    actorRef: "principal_1",
    idempotencyKey: "authorize-command-1",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
}

async function submitIntent(rail) {
  const intent = await authorizeIntent(rail);
  return rail.submitTransfer({
    transferIntentId: intent.transferIntentId,
    idempotencyKey: "submit-command-1",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
}

test("rail aggregate settles through explicit finality and rebuilds from append-only events", async () => {
  const fixture = createFixture();
  let intent = await submitIntent(fixture.rail);
  intent = await fixture.rail.simulateSettlement({
    transferIntentId: intent.transferIntentId,
    providerEventId: "provider-pending-1",
    outcome: SettlementOutcome.SUCCEEDED,
    finality: SettlementFinality.PENDING,
    idempotencyKey: "receipt-command-pending-1",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
  assert.equal(intent.status, "pending");
  assert.equal(intent.version, 5);

  intent = await fixture.rail.simulateSettlement({
    transferIntentId: intent.transferIntentId,
    providerEventId: "provider-final-1",
    outcome: SettlementOutcome.SUCCEEDED,
    finality: SettlementFinality.FINALIZED,
    idempotencyKey: "receipt-command-final-1",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
  const rebuilt = await fixture.createService().getTransferIntent(intent.transferIntentId);

  assert.equal(intent.status, "settled");
  assert.equal(intent.productionFundsMoved, false);
  assert.equal(intent.settlementReceipts.length, 2);
  assert.deepEqual(rebuilt, intent);
  assert.deepEqual(await fixture.rail.getReplayProof(intent.transferIntentId), {
    transferIntentId: intent.transferIntentId,
    eventCount: 6,
    evidenceEnvelopeCount: 6,
    latestVersion: 6,
    resultingStatus: "settled",
    contiguousEvents: true,
    contiguousEvidence: true,
    payloadHashesValid: true,
    evidenceHashesValid: true,
    envelopeHashesValid: true,
    eventEnvelopeLinksValid: true,
    replayable: true,
    schemaVersion: "rail_replay_proof.v1"
  });
});

test("rail commands are idempotent and reject conflicting keys and stale versions", async () => {
  const fixture = createFixture();
  const { eventStore, rail } = fixture;
  const intent = await createIntent(rail);
  const replay = await createIntent(rail);
  assert.equal(replay.transferIntentId, intent.transferIntentId);
  assert.equal(eventStore.listCreditEvents().filter((event) => event.eventType === "transfer_intent_created").length, 1);
  fixture.state.spendRequest.status = "settled";
  assert.equal((await createIntent(fixture.rail)).transferIntentId, intent.transferIntentId);

  await assert.rejects(
    () =>
      createIntent(rail, {
        sourceAccountRefHash: hashId("test_source_account", "different-source")
      }),
    /rail_idempotency_conflict/
  );

  const quoted = await rail.quoteTransfer({
    transferIntentId: intent.transferIntentId,
    idempotencyKey: "quote-command-1",
    expectedVersion: 1,
    now: FIXED_NOW
  });
  const quoteReplay = await rail.quoteTransfer({
    transferIntentId: intent.transferIntentId,
    idempotencyKey: "quote-command-1",
    expectedVersion: 1,
    now: FIXED_NOW
  });
  assert.equal(quoteReplay.version, quoted.version);
  await assert.rejects(
    () =>
      rail.authorizeTransfer({
        transferIntentId: intent.transferIntentId,
        actorRef: "principal_1",
        idempotencyKey: "authorize-stale",
        expectedVersion: 1,
        now: FIXED_NOW
      }),
    /stale_transfer_version/
  );
});

test("in-memory repository serializes competing writes to one transfer version", async () => {
  const fixture = createFixture();
  const intent = await createIntent(fixture.rail);
  const competingService = fixture.createService();
  const results = await Promise.allSettled(
    [fixture.rail, competingService].map((service, index) =>
      service.quoteTransfer({
        transferIntentId: intent.transferIntentId,
        idempotencyKey: `quote-race-${index}`,
        expectedVersion: intent.version,
        now: FIXED_NOW
      })
    )
  );

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /stale_transfer_version/);
  assert.equal((await fixture.rail.getTransferIntent(intent.transferIntentId)).version, 2);
});

test("rail rechecks policy and live mandate immediately before submission", async () => {
  const fixture = createFixture();
  const authorized = await authorizeIntent(fixture.rail);
  fixture.state.authorizationActive = false;
  await assert.rejects(
    () =>
      fixture.rail.submitTransfer({
        transferIntentId: authorized.transferIntentId,
        idempotencyKey: "submit-after-revoke",
        expectedVersion: authorized.version,
        now: FIXED_NOW
      }),
    /mandate_not_active/
  );
  assert.equal((await fixture.rail.getTransferIntent(authorized.transferIntentId)).version, authorized.version);

  const rejectedFixture = createFixture();
  rejectedFixture.state.spendRequest.status = "rejected";
  await assert.rejects(() => createIntent(rejectedFixture.rail), /rail_policy_decision_not_approved/);
  assert.equal(rejectedFixture.eventStore.listCreditEvents().length, 0);
});

test("expired quotes and terminal transfer mutations fail closed", async () => {
  const { rail } = createFixture({ quoteTtlMs: 1_000 });
  let intent = await createIntent(rail);
  intent = await rail.quoteTransfer({
    transferIntentId: intent.transferIntentId,
    idempotencyKey: "quote-command-1",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
  const expiredAt = new Date(FIXED_NOW.getTime() + 1_000);
  await assert.rejects(
    () =>
      rail.authorizeTransfer({
        transferIntentId: intent.transferIntentId,
        actorRef: "principal_1",
        idempotencyKey: "authorize-expired",
        expectedVersion: intent.version,
        now: expiredAt
      }),
    /transfer_quote_expired/
  );
  const expired = await rail.expireTransfer({
    transferIntentId: intent.transferIntentId,
    actorRef: "system:quote-expirer",
    reason: "quote_window_elapsed",
    idempotencyKey: "expire-command-1",
    expectedVersion: intent.version,
    now: expiredAt
  });
  assert.equal(expired.status, "expired");
  await assert.rejects(
    () =>
      rail.submitTransfer({
        transferIntentId: expired.transferIntentId,
        idempotencyKey: "submit-expired",
        expectedVersion: expired.version,
        now: expiredAt
      }),
    /cannot transition/
  );
});

test("finalized settlement can only reverse through new immutable evidence", async () => {
  const { rail } = createFixture();
  let intent = await submitIntent(rail);
  intent = await rail.simulateSettlement({
    transferIntentId: intent.transferIntentId,
    providerEventId: "provider-final-1",
    outcome: SettlementOutcome.SUCCEEDED,
    finality: SettlementFinality.FINALIZED,
    idempotencyKey: "receipt-final",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
  const settledVersion = intent.version;
  intent = await rail.simulateSettlement({
    transferIntentId: intent.transferIntentId,
    providerEventId: "provider-reversal-1",
    outcome: SettlementOutcome.REVERSED,
    finality: SettlementFinality.FINALIZED,
    idempotencyKey: "receipt-reversal",
    expectedVersion: intent.version,
    now: FIXED_NOW
  });
  assert.equal(intent.status, "reversed");
  assert.equal(intent.version, settledVersion + 1);
  assert.equal(intent.settlementReceipts.length, 2);
  assert.equal((await rail.listSettlementReceipts()).length, 2);
});

test("sandbox adapter boundary rejects production claims, raw account data, and incomplete adapters", async () => {
  assert.throws(() => inspectSandboxRailAdapter({ getDescriptor() {} }), /must implement createQuote/);
  const { rail } = createFixture();
  await assert.rejects(
    () =>
      createIntent(rail, {
        bankAccountNumber: "123456789"
      }),
    /raw_pii_prohibited/
  );
  assert.equal(rail.getConformance(rail.defaultRailId).executablePluginLoaded, false);
  const report = runSandboxRailAdapterConformance(new SandboxRailAdapter({ sourceAssets: [ASSET] }));
  assert.equal(report.deterministicQuote, true);
  assert.equal(report.deterministicSubmission, true);
  assert.equal(report.productionFundsMoved, false);
});
