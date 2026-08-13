import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createLocalAgentApplicationInput,
  createLocalAgentRuntimeInput,
  persistLocalAgentContinuationReceipt
} from "../src/agent-reference-workflows.js";

const manifest = Object.freeze({
  mandateHash: `0x${"a".repeat(64)}`,
  authority: Object.freeze({
    assetIds: Object.freeze([
      "urn:ipo-one:sandbox-asset:usd-cent"
    ]),
    perActionLimitMinor: "25000",
    aggregateLimitMinor: "100000"
  })
});

test("reference Agent application remains bounded by the smallest approved limit", () => {
  const input = createLocalAgentApplicationInput(manifest);

  assert.equal(
    input.creditRequest.assetId,
    "urn:ipo-one:sandbox-asset:usd-cent"
  );
  assert.equal(input.creditRequest.requestedPrincipalMinor, "10000");
  assert.equal(input.creditRequest.purposeCode, "compute");
  assert.equal(input.workflowId, `local-agent-application-${"a".repeat(24)}`);
  assert.equal(Object.hasOwn(input, "credential"), false);
  assert.equal(Object.hasOwn(input, "tenantId"), false);
});

test("reference Agent runtime binds acceptance and repayment to the exact Offer", () => {
  const offerReceipt = Object.freeze({
    offer: Object.freeze({
      creditOfferHash: `0x${"b".repeat(64)}`,
      approvedPrincipalMinor: "7500"
    })
  });
  const input = createLocalAgentRuntimeInput(manifest, offerReceipt);

  assert.equal(input.offerReceipt, offerReceipt);
  assert.equal(input.repayment.amountMinor, "7500");
  assert.equal(input.repayment.sourceCode, "synthetic_revenue");
  assert.equal(
    input.acknowledgementHash,
    hashId(
      "agent_offer_acknowledgement",
      `${manifest.mandateHash}:${offerReceipt.offer.creditOfferHash}`
    )
  );
  assert.equal(input.workflowId, `local-agent-obligation-${"a".repeat(24)}`);
  assert.equal(Object.hasOwn(input, "privateKey"), false);
  assert.equal(Object.hasOwn(input, "fundsAuthority"), false);
});

test("reference Agent persists one exact continuation without changing the Offer receipt", async () => {
  const receipt = Object.freeze({
    status: "offer_ready",
    correlationId: "correlation-agent-application-0001",
    offer: Object.freeze({
      creditOfferId: "offer_agent_application_0001",
      creditOfferHash: `0x${"b".repeat(64)}`
    })
  });
  const calls = [];
  const result = await persistLocalAgentContinuationReceipt({
    receipt,
    session: {
      client: {
        async persistContinuationReceipt(input) {
          calls.push(input);
          return { response: { status: "offer_persisted" } };
        }
      }
    }
  });

  assert.equal(result.response.status, "offer_persisted");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receipt, receipt);
  assert.equal(calls[0].creditOfferId, receipt.offer.creditOfferId);
  assert.equal(
    calls[0].idempotencyKey,
    `reference-agent-continuation-${receipt.offer.creditOfferHash}`
  );
  assert.equal(calls[0].correlationId, receipt.correlationId);
  assert.equal(
    calls[0].requestId,
    `request-reference-agent-persist-${"b".repeat(24)}`
  );
});

test("reference Agent rejects a malformed continuation before any command", async () => {
  let called = false;
  await assert.rejects(
    () => persistLocalAgentContinuationReceipt({
      receipt: { status: "offer_ready", offer: {} },
      session: {
        client: {
          async persistContinuationReceipt() {
            called = true;
          }
        }
      }
    }),
    /not eligible for durable continuation/
  );
  assert.equal(called, false);
});
