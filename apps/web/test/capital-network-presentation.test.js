import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CAPITAL_NETWORK_PRESENTATION_VERSION,
  createCapitalNetworkPresentation
} from "../src/capital-network-presentation.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const providerView = structuredClone(
  fixtures.validResults.find(
    ({ operationId }) => operationId === "pilotReadProviderIntent"
  ).response
);
const acknowledgement = structuredClone(
  fixtures.validResults.find(
    ({ operationId }) => operationId === "pilotAcknowledgeProviderIntent"
  ).response
);
const catalogOperationIds = [
  "pilotReadProviderIntent",
  "pilotAcknowledgeProviderIntent"
];

function presentation(overrides = {}) {
  return createCapitalNetworkPresentation({
    catalogOperationIds,
    providerView: null,
    acknowledgement: null,
    ...overrides
  });
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("empty Provider workspace is closed, no-funds and catalog-derived", () => {
  const result = presentation();
  assert.equal(result.schemaVersion, CAPITAL_NETWORK_PRESENTATION_VERSION);
  assert.equal(result.status, "empty");
  assert.equal(result.availability.read, true);
  assert.equal(result.availability.acknowledge, true);
  assert.equal(result.facility, null);
  assert.equal(result.productionFundsMoved, false);
  assert.equal(result.withdrawable, false);
  assert.equal(result.disabledCapabilities.includes("provider_funding"), true);
  assert.equal(result.disabledCapabilities.includes("tvl"), true);
  assert.equal(deeplyFrozen(result), true);
});

test("assigned Provider intent becomes a server-derived no-funds exposure", () => {
  const result = presentation({ providerView });
  assert.equal(result.status, "assigned");
  assert.equal(result.mandate.providerId, providerView.providerId);
  assert.equal(result.mandate.fundingAuthority, false);
  assert.equal(result.facility.sourceAmountMinor, "12000");
  assert.equal(result.facility.simulatedAmount, true);
  assert.equal(result.facility.deployedCapital, false);
  assert.equal(result.allocation.allocationReceiptRef, providerView.transferIntentHash);
  assert.equal(result.reconciliation.status, "pending_provider_acknowledgement");
  assert.equal(result.reconciliation.settlement, false);
  assert.equal(result.earningsSimulation.rateBasisPoints, "125");
  assert.equal(result.earningsSimulation.earningsMinor, "150");
  assert.equal(result.earningsSimulation.approved, false);
  assert.equal(result.earningsSimulation.pricingPolicy, false);
});

test("acknowledgement and callback status produce matching no-funds receipts", () => {
  const acknowledged = presentation({
    providerView: { ...providerView, status: "acknowledged" },
    acknowledgement
  });
  assert.equal(acknowledged.status, "acknowledged");
  assert.equal(
    acknowledged.reconciliation.receiptId,
    acknowledgement.acknowledgementId
  );
  assert.equal(
    acknowledged.reconciliation.status,
    "acknowledgement_recorded"
  );
  assert.equal(acknowledged.reconciliation.duplicateCanonicalStateAllowed, false);

  const reconciled = presentation({
    providerView: { ...providerView, status: "callback_completed" },
    acknowledgement: null
  });
  assert.equal(reconciled.status, "reconciled");
  assert.equal(
    reconciled.reconciliation.status,
    "signed_callback_processed"
  );
  assert.equal(reconciled.reconciliation.receiptRef, providerView.deliveryHash);
  assert.equal(reconciled.reconciliation.settlement, false);
});

test("presentation fails closed on unsafe flags, mismatches and unknown fields", () => {
  assert.equal(presentation({
    providerView: { ...providerView, productionFundsMoved: true }
  }), null);
  assert.equal(presentation({
    providerView: { ...providerView, tvlMinor: "12000" }
  }), null);
  assert.equal(presentation({
    providerView: { ...providerView, status: "acknowledged" },
    acknowledgement: { ...acknowledgement, providerId: "provider_other" }
  }), null);
  assert.equal(presentation({
    providerView,
    acknowledgement
  }), null);
  assert.equal(createCapitalNetworkPresentation({
    catalogOperationIds,
    providerView,
    acknowledgement: null,
    actorId: "actor_client_supplied"
  }), null);
});
