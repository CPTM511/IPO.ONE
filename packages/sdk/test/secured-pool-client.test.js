import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IpoOneSecuredPoolClient } from "../src/secured-pool-client.js";

const fixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/secured-pool-workspace.v1.fixtures.json", import.meta.url),
  "utf8"
));

test("Secured Pool SDK exposes only Agent read and exact action review", async () => {
  const requests = [];
  const client = new IpoOneSecuredPoolClient({
    transportProfile: "local_in_process",
    async execute(request) {
      requests.push(request);
      return fixtures.validResults.find(({ operationId }) => operationId === request.operationId);
    }
  });
  assert.deepEqual(client.listOperations(), [
    "pilotReadOwnSecuredPool",
    "pilotReviewSecuredPoolAction"
  ]);
  const result = await client.executeOperation(fixtures.validRequests[1]);
  assert.equal(result.response.submittable, false);
  assert.equal(result.response.transactionState, "not_submitted");
  assert.equal(requests.length, 1);
});

test("Secured Pool SDK fails closed on privileged or malformed requests", async () => {
  const client = new IpoOneSecuredPoolClient({
    transportProfile: "local_in_process",
    async execute() { throw new Error("must not execute"); }
  });
  await assert.rejects(
    () => client.executeOperation(fixtures.validRequests[2]),
    (error) => error.code === "secured_pool_sdk_scope_denied"
  );
  await assert.rejects(
    () => client.executeOperation(fixtures.invalidRequests[0]),
    (error) => error.code === "invalid_secured_pool_sdk_request"
  );
});
