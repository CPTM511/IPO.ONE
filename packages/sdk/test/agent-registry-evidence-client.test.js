import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IpoOneAgentRegistryEvidenceClient,
  readAgentCreditRegistryEvidence
} from "../src/index.js";

const HASH = (character) => `0x${character.repeat(64)}`;
const AUTHORIZATION_HASH = HASH("1");
const handoffs = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

function manifest() {
  return structuredClone(
    handoffs.valid.find((fixture) => fixture.status === "ready")
  );
}

function response() {
  return {
    chainId: "eip155:84532",
    contractAddress: "0x1111111111111111111111111111111111111111",
    authorizationHash: AUTHORIZATION_HASH,
    observationHash: HASH("4"),
    finalityProofHash: HASH("5"),
    finalCreditStateHash: HASH("6"),
    finalObligationProofHash: HASH("7"),
    finalStatus: "closed",
    finalVersion: 3,
    registryPaused: true,
    authorizationActive: false,
    transactions: [
      ["publication", "8"],
      ["proof_update", "9"],
      ["close", "a"],
      ["pause", "b"]
    ].map(([kind, character]) => ({
      kind,
      transactionHash: HASH(character),
      blockNumber: "44734587",
      blockHash: HASH(character),
      observationStatus: "finalized",
      confirmations: 10,
      schemaVersion: "credit_registry_transaction_evidence_summary.v1"
    })),
    safeBlock: { number: "44735888", hash: HASH("c") },
    finalizedBlock: { number: "44735458", hash: HASH("d") },
    observedAt: "2026-07-28T12:06:50.311Z",
    recordedAt: "2026-07-28T12:07:00.000Z",
    asOf: "2026-07-28T12:08:00.000Z",
    readOnly: true,
    liveTestnetObservation: true,
    syntheticOnly: true,
    authorizing: false,
    productionFundsMoved: false,
    fundsAuthority: false,
    rawAccountIncluded: false,
    rawProviderPayloadIncluded: false,
    schemaVersion: "tenant_credit_registry_evidence_view.v1"
  };
}

function executeRecorder() {
  const requests = [];
  return {
    requests,
    async execute(request) {
      requests.push(request);
      return {
        operationId: "pilotReadCreditRegistryEvidence",
        replayed: false,
        response: response(),
        schemaVersion: "tenant_protocol_result.v1"
      };
    }
  };
}

test("Agent Registry Evidence client emits one exact read-only query", async () => {
  const recorder = executeRecorder();
  const client = new IpoOneAgentRegistryEvidenceClient({
    execute: recorder.execute,
    manifest: manifest(),
    transportProfile: "local_in_process"
  });
  const result = await client.readCreditRegistryEvidence({
    authorizationHash: AUTHORIZATION_HASH,
    requestId: "request-registry-evidence-001",
    correlationId: "correlation-registry-evidence-001"
  });
  assert.equal(result.authorizationHash, AUTHORIZATION_HASH);
  assert.equal(result.authorizing, false);
  assert.deepEqual(recorder.requests, [{
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotReadCreditRegistryEvidence",
    payload: {},
    resource: {
      resourceType: "credit_registry_evidence",
      resourceId: AUTHORIZATION_HASH
    },
    requestId: "request-registry-evidence-001",
    correlationId: "correlation-registry-evidence-001"
  }]);
});

test("functional Registry Evidence read rejects drift", async () => {
  await assert.rejects(
    readAgentCreditRegistryEvidence({
      execute: async () => ({
        operationId: "pilotReadCreditRegistryEvidence",
        replayed: false,
        response: { ...response(), authorizing: true },
        schemaVersion: "tenant_protocol_result.v1"
      }),
      manifest: manifest(),
      transportProfile: "local_in_process",
      authorizationHash: AUTHORIZATION_HASH,
      requestId: "request-registry-evidence-002",
      correlationId: "correlation-registry-evidence-002"
    }),
    (error) => error.code === "agent_registry_evidence_response_drift"
  );
});
