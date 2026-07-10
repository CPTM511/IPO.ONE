import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainError,
  LockboxStatus,
  LockboxTransitions,
  ObligationStatus,
  ObligationTransitions,
  assertCAIP10,
  assertNoRawPiiReference,
  assertTransition,
  createObligationHash,
  createSubjectHash
} from "../src/index.js";

test("domain ids are deterministic and bytes32-like", () => {
  const first = createSubjectHash({ subjectType: "agent", displayName: "alpha" });
  const second = createSubjectHash({ displayName: "alpha", subjectType: "agent" });

  assert.equal(first, second);
  assert.match(first, /^0x[a-f0-9]{64}$/);

  const obligationId = createObligationHash({
    subjectId: first,
    principalId: "principal_1",
    nonce: "n-1",
    amountMinor: "100"
  });
  assert.match(obligationId, /^0x[a-f0-9]{64}$/);
});

test("CAIP-10 validator accepts multi-chain account references", () => {
  assert.doesNotThrow(() => assertCAIP10("eip155:8453:0x1111111111111111111111111111111111111111"));
  assert.throws(() => assertCAIP10("0x1111111111111111111111111111111111111111"), DomainError);
});

test("invalid state transitions are rejected", () => {
  assert.doesNotThrow(() =>
    assertTransition("lockbox", LockboxTransitions, LockboxStatus.CREATED, LockboxStatus.ACTIVE)
  );
  assert.throws(
    () => assertTransition("obligation", ObligationTransitions, ObligationStatus.CREATED, ObligationStatus.FULLY_REPAID),
    /cannot transition/
  );
});

test("raw PII and secrets are rejected from metadata", () => {
  assert.throws(() => assertNoRawPiiReference({ profile: { passportNumber: "NOPE" } }), DomainError);
  assert.throws(() => assertNoRawPiiReference({ credentials: { seedPhrase: "NOPE" } }), DomainError);
  assert.doesNotThrow(() => assertNoRawPiiReference({ metadataRef: "encrypted://vault/ref" }));
});
