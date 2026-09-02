import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OBLIGATION_PORTFOLIO_PRESENTATION_VERSION,
  createObligationPortfolioPresentation
} from "../src/obligation-portfolio-presentation.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const owned = structuredClone(fixtures.validResults.find(
  ({ operationId }) => operationId === "pilotReadOwnObligation"
).response);
const evidenceFixture = structuredClone(fixtures.validResults.find(
  ({ operationId }) => operationId === "pilotReadOwnObligationEvidence"
).response);

function evidenceFor(view = owned) {
  const evidence = structuredClone(evidenceFixture);
  evidence.obligationId = view.obligation.obligationId;
  evidence.asOf = new Date(new Date(view.asOf).getTime() + 1_000).toISOString();
  evidence.items.forEach((item) => {
    item.obligationId = view.obligation.obligationId;
    item.aggregateId = view.obligation.obligationId;
  });
  return evidence;
}

function input(extra = {}) {
  return {
    view: structuredClone(owned),
    relationship: "owner",
    entryMode: "human",
    evidence: evidenceFor(),
    ...extra
  };
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("portfolio detail reconciles schedule amounts and exposes one shared kernel", () => {
  const result = createObligationPortfolioPresentation(input());
  assert.equal(result.schemaVersion, OBLIGATION_PORTFOLIO_PRESENTATION_VERSION);
  assert.equal(result.kernel, "obligation.v2");
  assert.equal(result.authority.label, "Human Consent");
  assert.equal(result.amounts.outstandingTotalMinor, "10000");
  assert.equal(result.schedule[0].scheduledMinor, "10000");
  assert.equal(result.schedule[0].outstandingMinor, "10000");
  assert.equal(result.executionRail.profile, "signed_local_sandbox");
  assert.equal(result.executionRail.productionFundsMoved, false);
  assert.equal(result.stateVersion.loadedEvidenceAggregateVersion, 1);
  assert.equal(result.browserLedger, false);
  assert.equal(deeplyFrozen(result), true);
});

test("Human and Agent entry labels do not fork obligation state", () => {
  const agentView = structuredClone(owned);
  agentView.obligation.authorityType = "mandate";
  agentView.obligation.authorityId = "mandate_agent_fixture";
  const agent = createObligationPortfolioPresentation(input({
    view: agentView,
    relationship: "controller",
    entryMode: "agent",
    evidence: evidenceFor(agentView)
  }));
  const human = createObligationPortfolioPresentation(input());
  assert.equal(agent.authority.label, "Agent Mandate");
  assert.equal(agent.kernel, human.kernel);
  assert.deepEqual(agent.amounts, human.amounts);
  assert.deepEqual(agent.schedule, human.schedule);
  assert.equal(agent.authority.presentationOnly, true);
});

test("history marks correction, resolution and invalidated observations explicitly", () => {
  const evidence = evidenceFor();
  const source = structuredClone(evidence.items[0]);
  evidence.items = [
    { ...source, evidenceId: "event_projection_repaired", eventType: "projection_repaired" },
    {
      ...source,
      evidenceId: "event_obligation_restructured",
      eventType: "obligation_restructured",
      aggregateVersion: 2
    },
    {
      ...source,
      evidenceId: "event_observation_invalidated",
      eventType: "chain_observation_recorded",
      aggregateVersion: 3,
      sourceFinality: "invalidated"
    }
  ];
  const result = createObligationPortfolioPresentation(input({ evidence }));
  assert.deepEqual(
    result.history.items.map(({ historyKind }) => historyKind),
    ["explicit_correction", "explicit_resolution", "invalidated_observation"]
  );
  assert.equal(result.history.appendOnly, true);
  assert.equal(result.history.correctionsAreExplicit, true);
});

test("Principal portfolio keeps a redacted Metered Usage receipt in the shared Evidence history", () => {
  const evidence = evidenceFor();
  const source = structuredClone(evidence.items[0]);
  evidence.items = [{
    ...source,
    evidenceId: "event_metered_usage_admitted",
    eventType: "metered_usage_admitted",
    meteredUsage: {
      usageEvidenceId: "usage_metered_web_001",
      usageEvidenceHash: `0x${"1".repeat(64)}`,
      correctionOfUsageEvidenceId: null,
      meteredUsageAdmissionId: "metered_usage_admission_web_001",
      admissionHash: `0x${"2".repeat(64)}`,
      providerId: "provider_metered_web_001",
      resourceClass: "inference_tokens",
      measurementUnit: "token",
      quantity: "250",
      chargeMinor: "500",
      chargeDeltaMinor: "500",
      assetId: "iso4217:USD",
      policyHash: `0x${"3".repeat(64)}`,
      ledgerTransactionId: "ledger_transaction_metered_web_001",
      finality: "finalized",
      reconciliation: "reconciled",
      nextAction: "review_metered_usage_receipt",
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "metered_usage_evidence_summary.v1"
    }
  }];
  const result = createObligationPortfolioPresentation(input({ evidence }));
  assert.equal(result.history.items[0].meteredUsage.quantity, "250");
  assert.equal(result.history.items[0].meteredUsage.chargeMinor, "500");
  assert.equal(result.history.items[0].meteredUsage.nextAction, "review_metered_usage_receipt");
  assert.equal(result.history.items[0].meteredUsage.productionFundsMoved, false);
});

test("unqueried Evidence remains explicit and does not invent history", () => {
  const result = createObligationPortfolioPresentation(input({ evidence: null }));
  assert.equal(result.history.queried, false);
  assert.deepEqual(result.history.items, []);
  assert.equal(result.stateVersion.loadedEvidenceAggregateVersion, null);
});

test("portfolio detail fails closed on amount, authority, Evidence and output drift", () => {
  const unsafe = input();
  unsafe.view.productionFundsMoved = true;
  assert.equal(createObligationPortfolioPresentation(unsafe), null);

  const mismatchedEvidence = evidenceFor();
  mismatchedEvidence.obligationId = "obligation_other";
  assert.equal(createObligationPortfolioPresentation(input({
    evidence: mismatchedEvidence
  })), null);

  const regressed = input();
  regressed.view.obligation.outstandingPrincipalMinor = "9000";
  assert.equal(createObligationPortfolioPresentation(regressed), null);

  const unknown = input();
  unknown.actorId = "attacker";
  assert.equal(createObligationPortfolioPresentation(unknown), null);
});
