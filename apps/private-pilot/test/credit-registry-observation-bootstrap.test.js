import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  bootstrapLocalCreditRegistryObservation
} from "../src/credit-registry-observation-bootstrap.js";
import {
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";

const ARTIFACT_URL = new URL(
  "../../../artifacts/testnet/eip155-84532-chain-001e-read-20260728-001-credit-registry-observation.json",
  import.meta.url
);
const ARTIFACT_PATH = fileURLToPath(ARTIFACT_URL);
const TENANT_CONTEXT = createTenantSecurityContext({
  tenantId: "tenant_ipo_one_local_pilot",
  actorId: "actor_risk_operations_pilot",
  policyVersion: "security_001.v1",
  source: "local_test"
});

function fakePool() {
  const queries = [];
  const client = {
    async query(text, values) {
      queries.push({ text, values });
      if (text.includes("SELECT id") &&
          text.includes("credit_registry_chain_observations")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };
  return {
    queries,
    pool: {
      async connect() {
        return client;
      }
    }
  };
}

test("reviewed CHAIN-001E artifact bootstraps one redacted replay-safe observation", async () => {
  const database = fakePool();
  const result = await bootstrapLocalCreditRegistryObservation({
    artifactPath: ARTIFACT_PATH,
    pool: database.pool,
    tenantContext: TENANT_CONTEXT,
    clock: () => new Date("2026-07-28T13:00:00.000Z")
  });

  assert.equal(result.schemaVersion, "local_credit_registry_observation_bootstrap.v1");
  assert.equal(result.authorizationHash, "0x218a06527a138313936e9a199104dfbabe73f1f1d16e7e5c8189a0ff2edca088");
  assert.equal(result.observationHash, "0x1954e6182034e12f71d0551f7b2a698b1f44bcf5dc46102ac8a05a62115be94f");
  assert.equal(result.finalStatus, "closed");
  assert.equal(result.registryPaused, true);
  assert.equal(result.authorizationActive, false);
  assert.equal(result.readOnly, true);
  assert.equal(result.authorizing, false);
  assert.equal(result.productionFundsMoved, false);
  assert.equal(result.signerUsed, false);
  assert.equal("accountReferenceHash" in result, false);
  assert.equal("subjectAccountHash" in result, false);
  assert.ok(database.queries.some(({ text }) =>
    text.includes("INSERT INTO credit_registry_chain_observations")));
  assert.ok(database.queries.some(({ text }) =>
    text.includes("INSERT INTO credit_registry_chain_outbox_messages")));
});

test("local Registry Evidence bootstrap rejects receipt drift and paths outside reviewed artifacts", async () => {
  const source = JSON.parse(await readFile(ARTIFACT_URL, "utf8"));
  source.transactionBroadcast = true;
  const database = fakePool();
  await assert.rejects(
    bootstrapLocalCreditRegistryObservation({
      artifactPath: ARTIFACT_PATH,
      pool: database.pool,
      tenantContext: TENANT_CONTEXT,
      readFileImpl: async () => JSON.stringify(source)
    }),
    (error) =>
      error.code === "invalid_local_credit_registry_observation_artifact"
  );
  await assert.rejects(
    bootstrapLocalCreditRegistryObservation({
      artifactPath: "/private/tmp/eip155-84532-chain-001e-read-invalid-credit-registry-observation.json",
      pool: database.pool,
      tenantContext: TENANT_CONTEXT
    }),
    (error) =>
      error.code === "invalid_local_credit_registry_observation_artifact"
  );
});
