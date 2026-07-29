import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LocalStackError,
  parseLocalStack,
  validateLocalStack
} from "../src/index.js";

const stackText = await readFile(
  new URL("../../../deploy/local/stack.v1.json", import.meta.url),
  "utf8"
);
const stack = parseLocalStack(stackText);

function changed(change) {
  const value = structuredClone(stack);
  change(value);
  return value;
}

test("LOCAL-STACK-001 fixes a persistent synthetic loopback stack", () => {
  assert.equal(stack.profile, "local_no_funds");
  assert.equal(stack.database.majorVersion, 17);
  assert.equal(stack.database.macHostPublished, false);
  assert.equal(
    stack.virtualization.portForwarding,
    "lima_hostagent_loopback_only"
  );
  assert.equal(stack.pilot.hostBinding, "127.0.0.1");
  assert.equal(stack.pilot.processLocalCanonicalStateAllowed, false);
  assert.equal(stack.worker.shape, "separate_container");
  assert.equal(stack.worker.signerEnabled, false);
  assert.equal(Object.values(stack.authority).every((value) => value === false), true);
});

test("LOCAL-STACK-001 rejects network, funds, signer, and cloud authority", () => {
  for (const value of [
    changed((candidate) => { candidate.launchBlocked = false; }),
    changed((candidate) => { candidate.database.macHostPublished = true; }),
    changed((candidate) => { candidate.pilot.hostBinding = "0.0.0.0"; }),
    changed((candidate) => { candidate.pilot.syntheticDataOnly = false; }),
    changed((candidate) => { candidate.worker.signerEnabled = true; }),
    changed((candidate) => { candidate.authority.remoteAccessEnabled = true; }),
    changed((candidate) => { candidate.authority.realFundsEnabled = true; }),
    changed((candidate) => { candidate.authority.testnetWritesEnabled = true; }),
    changed((candidate) => { candidate.authority.cloudMutationEnabled = true; })
  ]) {
    assert.throws(
      () => validateLocalStack(value),
      (error) => error instanceof LocalStackError && error.issues.length > 0
    );
  }
});

test("LOCAL-STACK-001 rejects persistence, runtime, image, and acceptance drift", () => {
  for (const value of [
    changed((candidate) => { candidate.database.image = "postgres:17"; }),
    changed((candidate) => { candidate.database.persistentVolume = false; }),
    changed((candidate) => { candidate.virtualization.portForwarding = "public"; }),
    changed((candidate) => { candidate.database.ownerRuntimeUse = "always"; }),
    changed((candidate) => { candidate.pilot.nodeVersion = "26.0.0"; }),
    changed((candidate) => { candidate.pilot.processLocalCanonicalStateAllowed = true; }),
    changed((candidate) => { candidate.worker.leaseAndIdempotencyRequired = false; }),
    changed((candidate) => { candidate.acceptance.restartRecovery = false; }),
    changed((candidate) => { candidate.endpoint = "https://example.invalid"; })
  ]) {
    assert.throws(
      () => validateLocalStack(value),
      (error) => error instanceof LocalStackError && error.issues.length > 0
    );
  }
});

test("LOCAL-STACK-001 requires canonical JSON", () => {
  assert.throws(
    () => parseLocalStack(JSON.stringify(stack)),
    (error) => error instanceof LocalStackError
  );
});
