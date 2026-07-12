import assert from "node:assert/strict";
import test from "node:test";
import { MandateCapability } from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { MandateService } from "../src/index.js";

const NOW = new Date("2026-07-10T00:00:00.000Z");

function createActiveMandate(service, overrides = {}) {
  const mandate = service.createMandate({
    principalId: "principal_1",
    subjectId: "subject_1",
    capabilities: [MandateCapability.REQUEST_CREDIT, MandateCapability.PROVIDER_SPEND],
    allowedProviderIds: ["provider_1"],
    allowedCategories: ["compute"],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: "100",
    aggregateLimitMinor: "200",
    validFrom: NOW.toISOString(),
    expiresAt: "2027-07-10T00:00:00.000Z",
    nonce: "mandate-1",
    termsRef: "ipfs://demo-mandate-terms",
    now: NOW,
    ...overrides
  });
  return service.activateMandate(mandate.mandateId, { actorId: "principal_1", now: NOW });
}

test("mandate authorizes scoped spend and reserves utilization idempotently", () => {
  const store = new EventStore();
  const service = new MandateService({ eventStore: store });
  const mandate = createActiveMandate(service);
  const input = {
    mandateId: mandate.mandateId,
    reservationId: "spend_1",
    subjectId: "subject_1",
    capability: MandateCapability.PROVIDER_SPEND,
    providerId: "provider_1",
    category: "compute",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "75",
    now: NOW
  };

  const first = service.reserveUtilization(input);
  const replay = service.reserveUtilization(input);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(service.getMandate(mandate.mandateId).utilizedMinor, "75");
  assert.throws(() => service.reserveUtilization({ ...input, amountMinor: "76" }), /mandate_reservation_conflict/);
  assert.equal(
    store.listCreditEvents({ subjectId: "subject_1" }).filter((event) => event.eventType === "mandate_utilization_reserved").length,
    1
  );
});

test("mandate fails closed for scope, aggregate limit, revocation, and expiry", () => {
  const service = new MandateService({ eventStore: new EventStore() });
  const mandate = createActiveMandate(service);
  const base = {
    mandateId: mandate.mandateId,
    subjectId: "subject_1",
    capability: MandateCapability.PROVIDER_SPEND,
    providerId: "provider_1",
    category: "compute",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "100",
    now: NOW
  };

  assert.throws(() => service.assertAuthorized({ ...base, providerId: "provider_2" }), /mandate_provider_denied/);
  service.reserveUtilization({ ...base, reservationId: "spend_1" });
  service.reserveUtilization({ ...base, reservationId: "spend_2" });
  assert.throws(
    () => service.reserveUtilization({ ...base, reservationId: "spend_3", amountMinor: "1" }),
    /mandate_aggregate_limit_exceeded/
  );
  service.revokeMandate({ mandateId: mandate.mandateId, actorId: "principal_1", reason: "agent retired", now: NOW });
  assert.throws(() => service.assertAuthorized(base), /mandate_not_active/);

  const expiring = createActiveMandate(service, {
    nonce: "mandate-2",
    expiresAt: "2026-07-11T00:00:00.000Z"
  });
  assert.throws(
    () => service.assertAuthorized({ ...base, mandateId: expiring.mandateId, now: new Date("2026-07-12T00:00:00.000Z") }),
    /mandate_not_active/
  );
  assert.equal(service.getMandate(expiring.mandateId).status, "expired");
});

test("mandate release is bounded and idempotent", () => {
  const service = new MandateService({ eventStore: new EventStore() });
  const mandate = createActiveMandate(service);
  service.reserveUtilization({
    mandateId: mandate.mandateId,
    reservationId: "spend_1",
    subjectId: "subject_1",
    capability: MandateCapability.PROVIDER_SPEND,
    providerId: "provider_1",
    category: "compute",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    amountMinor: "75",
    now: NOW
  });
  const release = {
    mandateId: mandate.mandateId,
    reservationId: "spend_1",
    releaseId: "refund_1",
    amountMinor: "25",
    reason: "provider refund",
    now: NOW
  };

  assert.equal(service.releaseUtilization(release).replayed, false);
  assert.equal(service.releaseUtilization(release).replayed, true);
  assert.equal(service.getMandate(mandate.mandateId).utilizedMinor, "50");
  assert.throws(() => service.releaseUtilization({ ...release, releaseId: "refund_2", amountMinor: "51" }), /release_exceeds/);
});
