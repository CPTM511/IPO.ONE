import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainError,
  DEMO_HASH_ALGORITHM,
  DEMO_HASH_DOMAIN,
  LockboxStatus,
  LockboxTransitions,
  ObligationStatus,
  ObligationTransitions,
  assertCAIP10,
  assertNoRawPiiReference,
  assertPositiveMinorUnits,
  assertTransition,
  createObligationHash,
  createSubjectHash,
  hashId
} from "../src/index.js";

test("demo domain ids are deterministic and explicitly non-production", () => {
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
  assert.equal(DEMO_HASH_ALGORITHM, "sha3-256");
  assert.equal(DEMO_HASH_DOMAIN, "IPO_ONE_DEMO_V1");
});

test("canonical hashes survive JSON transport semantics", () => {
  const withUndefined = { status: "created", optional: undefined, values: ["one", undefined] };
  const transported = JSON.parse(JSON.stringify(withUndefined));

  assert.equal(hashId("portable_payload", withUndefined), hashId("portable_payload", transported));
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

test("minor-unit parsing rejects values wide enough to exhaust sandbox resources", () => {
  assert.equal(assertPositiveMinorUnits("9".repeat(78)), BigInt("9".repeat(78)));
  assert.throws(() => assertPositiveMinorUnits("9".repeat(79)), /supported|unsigned integer/);
  assert.throws(() => assertPositiveMinorUnits(10n ** 78n), /supported decimal width/);
  assert.throws(() => assertPositiveMinorUnits("0001"), /unsigned integer/);
});
