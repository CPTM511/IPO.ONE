import assert from "node:assert/strict";
import test from "node:test";
import {
  readCreditRegistryEvidenceQueryHandler
} from "../src/credit-registry-evidence-handlers.js";

const HASH = (character) => `0x${character.repeat(64)}`;
const AUTHORIZATION_HASH = HASH("1");

function observation() {
  return {
    chainId: "eip155:84532",
    providerSlot: "primary",
    contractAddress: "0x1111111111111111111111111111111111111111",
    authorizationHash: AUTHORIZATION_HASH,
    accountReferenceHash: HASH("2"),
    subjectAccountHash: HASH("3"),
    acceptedOfferHash: HASH("4"),
    policyHash: HASH("5"),
    providerScopeHash: HASH("6"),
    finalCreditStateHash: HASH("7"),
    finalObligationProofHash: HASH("8"),
    validUntil: "2026-07-28T13:11:00.000Z",
    finalStatus: "closed",
    finalVersion: 3,
    registryPaused: true,
    authorizationActive: false,
    transactions: [
      ["publication", "9", "44734389", "a"],
      ["proof_update", "a", "44734583", "b"],
      ["close", "b", "44734585", "c"],
      ["pause", "c", "44734587", "d"]
    ].map(([kind, transaction, blockNumber, block]) => ({
      kind,
      transactionHash: HASH(transaction),
      blockNumber,
      blockHash: HASH(block),
      transactionIndex: "0",
      eventOrdinal: "0",
      observationStatus: "finalized",
      confirmations: 10
    })),
    safeBlock: { number: "44735888", hash: HASH("d") },
    finalizedBlock: { number: "44735458", hash: HASH("e") },
    finalityProofHash: HASH("e"),
    observedAt: "2026-07-28T12:06:50.311Z",
    readOnly: true,
    liveTestnetObservation: true,
    rawAccountPersisted: false,
    rawProviderPayloadPersisted: false,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "credit_registry_live_observation.v1",
    observationHash: HASH("f")
  };
}

function input(value = observation()) {
  return {
    client: {
      async query(sql, params) {
        assert.match(sql, /credit_registry_chain_observations/);
        assert.deepEqual(params, [AUTHORIZATION_HASH]);
        return {
          rowCount: 1,
          rows: [{
            observation: value,
            recorded_at: new Date("2026-07-28T12:07:00.000Z")
          }]
        };
      }
    },
    authorizationDecision: {
      resourceType: "credit_registry_evidence",
      resourceId: AUTHORIZATION_HASH
    },
    payload: {},
    now: new Date("2026-07-28T12:08:00.000Z")
  };
}

test("Registry Evidence query returns one bounded redacted no-funds view", async () => {
  const response = await readCreditRegistryEvidenceQueryHandler().execute(
    input()
  );
  assert.equal(response.authorizationHash, AUTHORIZATION_HASH);
  assert.equal(response.transactions.length, 4);
  assert.equal(response.transactions[0].kind, "publication");
  assert.equal(response.transactions[3].kind, "pause");
  assert.equal(response.readOnly, true);
  assert.equal(response.syntheticOnly, true);
  assert.equal(response.authorizing, false);
  assert.equal(response.productionFundsMoved, false);
  assert.equal(response.fundsAuthority, false);
  assert.equal(response.rawAccountIncluded, false);
  assert.equal(response.rawProviderPayloadIncluded, false);
  assert.equal(
    response.schemaVersion,
    "tenant_credit_registry_evidence_view.v1"
  );
  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes("accountReferenceHash"), false);
  assert.equal(serialized.includes("subjectAccountHash"), false);
  assert.equal(serialized.includes("acceptedOfferHash"), false);
  assert.equal(serialized.includes("policyHash"), false);
  assert.equal(serialized.includes("providerScopeHash"), false);
});

test("Registry Evidence query fails closed on malformed input or drift", async () => {
  const handler = readCreditRegistryEvidenceQueryHandler();
  await assert.rejects(
    handler.execute({ ...input(), payload: { authorizationHash: AUTHORIZATION_HASH } }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  await assert.rejects(
    handler.execute({
      ...input(),
      authorizationDecision: {
        resourceType: "evidence",
        resourceId: AUTHORIZATION_HASH
      }
    }),
    (error) => error.code === "tenant_resource_unavailable"
  );
  const drifted = observation();
  drifted.productionFundsMoved = true;
  await assert.rejects(
    handler.execute(input(drifted)),
    (error) => error.code === "tenant_resource_unavailable"
  );
});
