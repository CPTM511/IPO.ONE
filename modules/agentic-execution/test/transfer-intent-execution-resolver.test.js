import assert from "node:assert/strict";
import test from "node:test";
import { createAccountHash, hashId } from "../../../packages/domain/src/index.js";
import {
  createLocalTransferIntentTargetPolicy,
  describeTransferIntentExecutionResolver,
  resolveTransferIntentExecution
} from "../src/index.js";

const NOW = new Date("2026-08-11T05:00:00.000Z");
const ACCOUNT_HASH = createAccountHash(
  "eip155:84532:0x1111111111111111111111111111111111111111"
);
const DESTINATION_REF = "provider:settlement:compute-fixture";
const DESTINATION_HASH = createAccountHash(DESTINATION_REF);
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
const PROVIDER_ID = "provider_compute_fixture";
const GRANT = Object.freeze({
  grantId: "delegated_wallet_grant_resolver",
  grantHash: hashId("grant", "resolver"),
  subjectId: "subject_resolver",
  mandateId: "mandate_resolver",
  providerId: PROVIDER_ID,
  spendPolicyId: "spend_policy_resolver",
  accountBindingId: "account_binding_resolver",
  assetIds: [ASSET_ID],
  chainIds: ["eip155:84532"]
});
const TARGET_POLICY = createLocalTransferIntentTargetPolicy({
  providerId: PROVIDER_ID,
  chainId: "eip155:84532",
  now: NOW
});

function row(overrides = {}) {
  return {
    id: "transfer_intent_resolver",
    transfer_intent_hash: hashId("transfer_intent", "resolver"),
    subject_id: GRANT.subjectId,
    mandate_id: GRANT.mandateId,
    policy_decision_ref: "spend_request_resolver",
    provider_id: PROVIDER_ID,
    purpose_code: "provider_inventory",
    rail_id: "rail_sandbox_internal",
    direction: "outbound",
    source_asset_id: ASSET_ID,
    source_amount_minor: "2500",
    destination_asset_id: ASSET_ID,
    source_account_ref_hash: ACCOUNT_HASH,
    destination_account_ref_hash: DESTINATION_HASH,
    status: "authorized",
    aggregate_version: 3,
    sandbox_only: true,
    production_funds_moved: false,
    spend_policy_id: GRANT.spendPolicyId,
    spend_asset_id: ASSET_ID,
    spend_amount_minor: "2500",
    spend_purpose_code: "provider_inventory",
    spend_status: "approved",
    settlement_account_ref: DESTINATION_REF,
    bound_account_hash: ACCOUNT_HASH,
    binding_status: "active",
    binding_schema_version: "account_binding.v3",
    ...overrides
  };
}

function client(value, rowCount = 1) {
  return {
    async query(statement, values) {
      assert.match(statement, /FROM transfer_intents/);
      assert.deepEqual(values, ["transfer_intent_resolver", GRANT.accountBindingId]);
      return { rowCount, rows: rowCount === 1 ? [value] : [] };
    }
  };
}

test("TransferIntent resolver constructs one exact server-owned payload and ExpectedEffects", async () => {
  const result = await resolveTransferIntentExecution({
    client: client(row()),
    transferIntentId: "transfer_intent_resolver",
    grant: GRANT,
    targetPolicy: TARGET_POLICY,
    now: NOW
  });

  assert.equal(result.browserAuthoredPayload, false);
  assert.equal(result.transferIntentVersion, 3);
  assert.equal(result.resolvedAction.targetAddress, TARGET_POLICY.targetAddress);
  assert.match(result.resolvedAction.calldata, /^0x[0-9a-f]+$/);
  assert.equal(result.expectedEffects.assetDeltas[0].deltaMinor, "-2500");
  assert.equal(result.expectedEffects.assetDeltas[1].deltaMinor, "2500");
  assert.equal(result.expectedEffects.allowanceDeltas.length, 0);
  assert.equal(result.productionAuthority, false);
  assert.equal(describeTransferIntentExecutionResolver().callerRawPayloadAccepted, false);
});

test("TransferIntent resolver fails closed for canonical identity, amount, destination and binding drift", async () => {
  for (const drift of [
    { subject_id: "subject_other" },
    { spend_amount_minor: "2501" },
    { destination_account_ref_hash: hashId("destination", "wrong") },
    { binding_status: "revoked" },
    { status: "prepared" }
  ]) {
    await assert.rejects(
      resolveTransferIntentExecution({
        client: client(row(drift)),
        transferIntentId: "transfer_intent_resolver",
        grant: GRANT,
        targetPolicy: TARGET_POLICY,
        now: NOW
      }),
      { code: "transfer_intent_execution_context_mismatch" }
    );
  }
});
