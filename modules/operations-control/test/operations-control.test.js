import test from "node:test";
import assert from "node:assert/strict";
import {
  PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY,
  OperationalSignalType,
  PostgresOperationalAlertStore,
  assertOperationalAlertPolicy,
  assertOperationalSignal,
  createPrivatePilotOperationalSourceBoundary,
  evaluateOperationalSignals,
  signalFromAbuseTelemetry,
  signalFromCreditEvent,
  signalFromEvidenceEnvelope
} from "../src/index.js";

const at = "2026-07-17T08:00:00.000Z";
const boundary = createPrivatePilotOperationalSourceBoundary();
const source = { boundary };

function creditEvent(eventType, overrides = {}) {
  return {
    eventId: `credit_event_${eventType}_secret_subject_42`,
    eventType,
    subjectId: "agent_subject_secret_42",
    obligationId: "obligation_secret_42",
    payload: {},
    occurredAt: at,
    schemaVersion: "event.v1",
    ...overrides
  };
}

test("policy covers every signal and cannot authorize actions, funds, or release", () => {
  assert.equal(assertOperationalAlertPolicy(PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY), PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY);
  assert.deepEqual(
    new Set(PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY.rules.map(({ signalType }) => signalType)),
    new Set(Object.values(OperationalSignalType))
  );
  assert.deepEqual(PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY.safetyBoundary, {
    automaticActionsEnabled: false,
    realFundsActionsEnabled: false,
    productionReleaseAuthority: false
  });
  assert.throws(
    () => assertOperationalAlertPolicy({
      ...structuredClone(PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY),
      safetyBoundary: {
        ...PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY.safetyBoundary,
        automaticActionsEnabled: true
      }
    }),
    { name: "DomainError", code: "invalid_operational_alert_policy" }
  );
});

test("authoritative credit events map only to reviewed operational signals", () => {
  const reconciliation = signalFromCreditEvent(creditEvent("reconciliation_completed", {
    payload: { status: "failed", runId: "run_secret_1" }
  }), source);
  const defaulted = signalFromCreditEvent(creditEvent("servicing_advanced", {
    payload: { nextClassification: "defaulted", obligationId: "obligation_secret_42" }
  }), source);
  const writtenOff = signalFromCreditEvent(creditEvent("obligation_written_off"), source);
  const breakGlass = signalFromCreditEvent(creditEvent("break_glass_incident_activated", {
    payload: { breakGlassIncidentId: "incident_secret_1" }
  }), source);

  assert.equal(reconciliation.signalType, OperationalSignalType.RECONCILIATION_FAILED);
  assert.equal(defaulted.signalType, OperationalSignalType.SERVICING_DEFAULTED);
  assert.equal(writtenOff.signalType, OperationalSignalType.SERVICING_WRITTEN_OFF);
  assert.equal(breakGlass.signalType, OperationalSignalType.BREAK_GLASS_ACTIVATED);
  assert.equal(signalFromCreditEvent(creditEvent("repayment_posted")), undefined);
  for (const signal of [reconciliation, defaulted, writtenOff, breakGlass]) {
    assertOperationalSignal(signal);
    assert.match(signal.sourceRefHash, /^0x[0-9a-f]{64}$/);
    assert.match(signal.scopeRefHash, /^0x[0-9a-f]{64}$/);
  }
});

test("chain Evidence and admission telemetry map safely", () => {
  const chain = signalFromEvidenceEnvelope({
    eventId: "evidence_secret_payment_1",
    eventType: "payment_chain_invalidated",
    aggregateId: "payment_secret_1",
    obligationId: "obligation_secret_1",
    payload: { observationStatus: "invalidated", rawAccount: "must_not_escape" },
    occurredAt: at,
    schemaVersion: "evidence_event.v2"
  }, source);
  const admission = signalFromAbuseTelemetry({
    surface: "tenant",
    quotaClass: "read",
    outcome: "denied",
    reason: "unavailable",
    count: 3
  }, { observedAt: at, windowId: "window_secret_1", boundary });
  assert.equal(chain.signalType, OperationalSignalType.CHAIN_PAYMENT_INVALIDATED);
  assert.equal(admission.signalType, OperationalSignalType.ADMISSION_CONTROL_UNAVAILABLE);
  assert.equal(signalFromAbuseTelemetry({
    surface: "tenant",
    quotaClass: "read",
    outcome: "failed",
    reason: "unavailable",
    count: 1
  }, { observedAt: at, windowId: "window_finish_failure", boundary }).signalType,
  OperationalSignalType.ADMISSION_CONTROL_UNAVAILABLE);
  assert.equal(signalFromAbuseTelemetry({
    surface: "tenant",
    quotaClass: "read",
    outcome: "completed",
    reason: "none",
    count: 1
  }, { observedAt: at, windowId: "window_ok", boundary }), undefined);
});

test("evaluation deduplicates exact occurrences and groups repeated scoped signals", () => {
  const first = signalFromCreditEvent(creditEvent("servicing_advanced", {
    eventId: "credit_event_default_1",
    payload: { nextClassification: "defaulted" }
  }), source);
  const second = signalFromCreditEvent(creditEvent("servicing_advanced", {
    eventId: "credit_event_default_2",
    occurredAt: "2026-07-17T08:05:00.000Z",
    payload: { nextClassification: "defaulted" }
  }), source);
  const alerts = evaluateOperationalSignals([first, first, second]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].occurrenceCount, 2);
  assert.equal(alerts[0].firstObservedAt, at);
  assert.equal(alerts[0].lastObservedAt, "2026-07-17T08:05:00.000Z");
  assert.equal(alerts[0].route, "risk_queue");
  assert.equal(alerts[0].deliveryStatus, "unconfigured");
  assert.equal(alerts[0].requiresNamedOwner, true);
  assert.equal(alerts[0].automaticActionTaken, false);
  assert.equal(alerts[0].productionReleaseAuthority, false);
  assert.equal(Object.isFrozen(alerts), true);
  assert.equal(Object.isFrozen(alerts[0].actionCodes), true);
});

test("grouped alert Evidence stays bounded while occurrence count remains exact", () => {
  const signals = Array.from({ length: 40 }, (_, index) => signalFromCreditEvent(
    creditEvent("servicing_advanced", {
      eventId: `credit_event_default_${index}`,
      occurredAt: `2026-07-17T08:${String(index).padStart(2, "0")}:00.000Z`,
      payload: { nextClassification: "defaulted" }
    }), source
  ));
  const [alert] = evaluateOperationalSignals(signals);
  assert.equal(alert.occurrenceCount, 40);
  assert.equal(alert.evidenceRefHashes.length, 32);
  assert.equal(alert.evidenceTruncated, true);
});

test("alert output excludes raw identifiers, payloads, PII, and execution authority", () => {
  const signal = signalFromEvidenceEnvelope({
    eventId: "evidence_private_1",
    eventType: "payment_chain_invalidated",
    aggregateId: "payment_private_1",
    obligationId: "obligation_private_1",
    payload: {
      observationStatus: "invalidated",
      email: "borrower@example.invalid",
      accountId: "eip155:84532:0xprivate"
    },
    occurredAt: at,
    schemaVersion: "evidence_event.v2"
  }, source);
  const serialized = JSON.stringify(evaluateOperationalSignals([signal]));
  for (const prohibited of [
    "evidence_private_1",
    "payment_private_1",
    "obligation_private_1",
    "borrower@example.invalid",
    "0xprivate",
    "payload"
  ]) assert.equal(serialized.includes(prohibited), false);
  assert.equal(serialized.includes('"automaticActionTaken":false'), true);
  assert.equal(serialized.includes('"productionFundsMoved":false'), true);
});

test("closed signal shapes and bounded batches fail closed", () => {
  const valid = signalFromCreditEvent(creditEvent("reconciliation_completed", {
    payload: { status: "failed" }
  }), source);
  assert.throws(
    () => assertOperationalSignal({ ...valid, tenantId: "tenant_private" }),
    { name: "DomainError", code: "invalid_operational_signal" }
  );
  assert.throws(
    () => evaluateOperationalSignals(new Array(1_001).fill(valid)),
    { name: "DomainError", code: "invalid_operational_alert_input" }
  );
  assert.throws(
    () => signalFromCreditEvent(creditEvent("reconciliation_completed", {
      payload: { status: "failed" }
    })),
    { name: "DomainError", code: "invalid_operational_signal" }
  );
  assert.throws(
    () => signalFromCreditEvent(creditEvent("reconciliation_completed", {
      payload: { status: "failed" }
    }), {
      boundary: {
        environment: "closed-pilot",
        mode: "no-real-funds",
        sandboxOnly: true,
        productionFundsMoved: false,
        schemaVersion: "operational_source_boundary.v1"
      }
    }),
    { name: "DomainError", code: "invalid_operational_signal" }
  );
});

test("durable store rejects free-text or email-shaped idempotency before database access", async () => {
  const store = new PostgresOperationalAlertStore({
    eventRepository: {
      tenantContext: { tenantId: "tenant_ops_unit", actorId: "actor_ops_unit" },
      withTenantRead: async () => assert.fail("database read must not be reached"),
      withTenantWrite: async () => assert.fail("database write must not be reached"),
      appendCommandBatchInTransaction: async () => assert.fail("append must not be reached")
    }
  });
  await assert.rejects(
    () => store.ingestSignals({ signals: [], idempotencyKey: "ops@example.invalid" }),
    { name: "DomainError", code: "invalid_operational_store_input" }
  );
});
