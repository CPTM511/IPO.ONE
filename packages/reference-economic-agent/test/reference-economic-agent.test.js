import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createReferenceEconomicAgent } from "../src/index.js";

function ports() {
  const calls = [];
  const creditProvider = {
    async authenticate(input) {
      calls.push("credit.authenticate");
      return { authenticatedSubject: "subject_reference_001", input };
    },
    async discoverCapabilities() {
      calls.push("credit.discover");
      return { provider: "replaceable-credit-provider" };
    },
    async requestCredit() {
      calls.push("credit.request");
      return { offerId: "offer_reference_001" };
    },
    async readOffer() {
      calls.push("credit.readOffer");
      return {
        offerId: "offer_reference_001",
        offerHash: `0x${"1".repeat(64)}`,
        termsHash: `0x${"2".repeat(64)}`
      };
    },
    async acceptOffer() {
      calls.push("credit.acceptOffer");
      return { facilityId: "facility_reference_001" };
    },
    async readFacility() {
      calls.push("credit.readFacility");
      return {
        facilityId: "facility_reference_001",
        authorizationVersion: "authorization_reference.v1"
      };
    },
    async repay() {
      calls.push("credit.repay");
      return { outstandingPrincipalMinor: "0" };
    },
    async readEvidence() {
      calls.push("credit.readEvidence");
      return { count: 1 };
    },
    async readPerformance() {
      calls.push("credit.readPerformance");
      return { creditState: "REPAID" };
    }
  };
  const executionVenue = {
    async discoverCapabilities() {
      calls.push("venue.discover");
      return { provider: "replaceable-execution-venue" };
    },
    async bindAccount() {
      calls.push("venue.bindAccount");
      return { bindingId: "binding_reference_001" };
    },
    async readAccount() {
      calls.push("venue.readAccount");
      return { bindingId: "binding_reference_001" };
    },
    async prepareExecution(input) {
      const role = input.executionIntent.kind;
      calls.push(`venue.prepare.${role}`);
      return {
        preparedExecutionId: `prepared_reference_${role}`,
        preparedExecutionHash:
          role === "open" ? `0x${"3".repeat(64)}` : `0x${"4".repeat(64)}`
      };
    },
    async submitExecution(input) {
      const role = input.preparedExecutionId.endsWith("open") ? "open" : "close";
      calls.push(`venue.submit.${role}`);
      return { executionId: `execution_reference_${role}` };
    },
    async readExecution() {
      calls.push("venue.readExecution");
      return { status: "CONFIRMED" };
    },
    async reconcile() {
      calls.push("venue.reconcile");
      return {
        reconciliationId: "reconciliation_reference_001",
        reconciliationHash: `0x${"5".repeat(64)}`
      };
    }
  };
  return { calls, creditProvider, executionVenue };
}

test("independent Agent uses only replaceable CreditProvider and ExecutionVenue ports", async () => {
  const harness = ports();
  const agent = createReferenceEconomicAgent({
    economicAgentWallet: "economic_agent_wallet_reference_001",
    creditProvider: harness.creditProvider,
    executionVenue: harness.executionVenue
  });
  const result = await agent.run({
    requestedPrincipalMinor: "1000",
    runId: "reference_agent_portability_001"
  });
  assert.equal(result.performance.creditState, "REPAID");
  assert.deepEqual(harness.calls, [
    "credit.authenticate",
    "credit.discover",
    "venue.discover",
    "credit.request",
    "credit.readOffer",
    "credit.acceptOffer",
    "credit.readFacility",
    "venue.bindAccount",
    "venue.readAccount",
    "venue.prepare.open",
    "venue.submit.open",
    "venue.readExecution",
    "venue.prepare.close",
    "venue.submit.close",
    "venue.reconcile",
    "credit.repay",
    "credit.readEvidence",
    "credit.readPerformance"
  ]);
});

test("reference Agent source imports no IPO.ONE domain, database, signer, or server implementation", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  for (const forbidden of [
    "packages/domain",
    "modules/",
    "tenant-command-gateway",
    "database",
    "privateKey",
    "venueApiSigner",
    "capitalController"
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
