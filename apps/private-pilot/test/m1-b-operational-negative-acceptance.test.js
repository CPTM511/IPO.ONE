import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  M1_B_OPERATIONAL_NEGATIVE_CASES,
  M1BOperationalNegativeAcceptanceError,
  assertCompleteM1BOperationalNegativeProofSet,
  assertM1BOperationalProtectedStateManifestPair,
  assertM1BOperationalNegativeProofIdentifiersUnique,
  assertM1BOperationalNegativeSafeValue,
  captureM1BOperationalLiveNegativeProof,
  captureM1BExactRuntimeSignedOutPrivateRead,
  createM1BOperationalExactSourceNegativeProof,
  createM1BOperationalExactSourceRunFromTap,
  deriveM1BReplacedStaleOfferNegativeProofFromCritical,
  encodeM1BOperationalNegativeCaseDiagnostic,
  encodeM1BOperationalTrustedRegressionTapDiagnostics,
  getM1BOperationalNegativeCaseDefinition,
  parseM1BOperationalNodeTestTap,
  pendingM1BOperationalLiveNegativeCases,
  runM1BOperationalExactSourceNegativeCase,
  runM1BTrustedDisposablePostgresNegativeCase,
  runM1BTrustedProductRegressionNegativeCase
} from "../src/m1-b-operational-negative-acceptance.js";

const CANDIDATE = "a".repeat(40);
const TREE = "b".repeat(40);
const IMAGE = `sha256:${"c".repeat(64)}`;
const DATABASE_STARTED_AT = "2026-08-15T00:00:00.000Z";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const POSTGRES_PROTECTED_TABLES = Object.freeze([
  "command_idempotency",
  "command_events",
  "tenant_command_executions",
  "mandates",
  "authorization_resources",
  "authorization_resource_bindings",
  "domain_events",
  "credit_events",
  "evidence_envelopes",
  "projection_registry",
  "projection_snapshots",
  "credit_offers",
  "credit_offer_acceptances",
  "obligations",
  "obligation_installments",
  "ledger_accounts",
  "ledger_transactions",
  "ledger_entries",
  "sandbox_execution_receipts",
  "repayment_events",
  "lockboxes",
  "credit_lines"
]);

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function manifestHash(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function protectedStateManifest() {
  return Object.fromEntries(POSTGRES_PROTECTED_TABLES.map((table, index) => [
    table,
    {
      rowCount: index + 1,
      manifestHash: `0x${(index + 1).toString(16).padStart(64, "0")}`
    }
  ]));
}
const DATABASE_AVAILABLE = (() => {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    return /(^|[_-])test($|[_-])/.test(parsed.pathname.replace(/^\//, ""));
  } catch {
    return false;
  }
})();
const EXACT_RUNTIME_AVAILABLE = [
  "IPO_ONE_M1_B_NEGATIVE_ORIGIN",
  "IPO_ONE_M1_B_RELEASE_SHA",
  "IPO_ONE_M1_B_SOURCE_TREE_HASH",
  "IPO_ONE_M1_B_PILOT_IMAGE_ID",
  "IPO_ONE_M1_B_DATABASE_STARTED_AT",
  "DATABASE_URL"
].every((name) => typeof process.env[name] === "string" && process.env[name] !== "");

function exactCase(group, id, operation) {
  test(
    `M1-B operational negative ${group}:${id}`,
    { skip: !DATABASE_AVAILABLE && getM1BOperationalNegativeCaseDefinition(group, id)
      .sourceMode === "exact_source_disposable_postgres"
      ? "disposable PostgreSQL test database is required"
      : false },
    operation
  );
}

for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS) {
  if (definition.sourceMode !== "exact_source_disposable_postgres") continue;
  exactCase(definition.group, definition.id, async (t) => {
    const observation = await runM1BTrustedDisposablePostgresNegativeCase({
      group: definition.group,
      id: definition.id
    });
    for (const diagnostic of
      encodeM1BOperationalTrustedRegressionTapDiagnostics(observation)) {
      t.diagnostic(diagnostic);
    }
    t.diagnostic(encodeM1BOperationalNegativeCaseDiagnostic(observation));
  });
}

test("M1-B operational negative human:changed_version", async (t) => {
  const observation = await runM1BTrustedProductRegressionNegativeCase({
    group: "human",
    id: "changed_version"
  });
  for (const diagnostic of
    encodeM1BOperationalTrustedRegressionTapDiagnostics(observation)) {
    t.diagnostic(diagnostic);
  }
  t.diagnostic(encodeM1BOperationalNegativeCaseDiagnostic(observation));
});

test(
  "M1-B operational negative authorization:signed_out_private_read",
  { skip: EXACT_RUNTIME_AVAILABLE
    ? false
    : "exact post-restart candidate container environment is required" },
  async (t) => {
    const observation = await captureM1BExactRuntimeSignedOutPrivateRead({
      candidateReleaseId: process.env.IPO_ONE_M1_B_RELEASE_SHA,
      sourceTreeHash: process.env.IPO_ONE_M1_B_SOURCE_TREE_HASH,
      runtimeImageId: process.env.IPO_ONE_M1_B_PILOT_IMAGE_ID,
      databaseStartedAt: process.env.IPO_ONE_M1_B_DATABASE_STARTED_AT,
      origin: process.env.IPO_ONE_M1_B_NEGATIVE_ORIGIN,
      databaseUrl: process.env.DATABASE_URL
    });
    t.diagnostic(encodeM1BOperationalNegativeCaseDiagnostic(observation));
  }
);

test("negative registry is an ordered closed 16-case contract with the callable source partition", () => {
  assert.deepEqual(M1_B_OPERATIONAL_NEGATIVE_CASES, {
    human: [
      "expired_offer",
      "replaced_stale_offer",
      "duplicate_acceptance",
      "unauthorized_subject",
      "wrong_tenant",
      "changed_version",
      "invalid_acceptance_binding"
    ],
    agent: [
      "wrong_provider",
      "wrong_provider_category",
      "stale_mandate",
      "revoked_mandate",
      "out_of_scope_facility",
      "replay_invalid_execution"
    ],
    authorization: [
      "signed_out_private_read",
      "cross_role_private_read",
      "wrong_tenant_private_read"
    ]
  });
  assert.equal(M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.length, 16);
  assert.equal(
    M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
      ({ group, id }) =>
        group === "authorization" && id === "cross_role_private_read"
    ).operationId,
    "pilotReadOwnObligation"
  );
  assert.deepEqual(
    Object.fromEntries([
      "live_post_restart",
      "exact_source_disposable_postgres",
      "exact_source_ui_binding",
      "exact_source_transport"
    ].map((mode) => [mode, M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
      ({ sourceMode }) => sourceMode === mode
    ).length])),
    {
      live_post_restart: 4,
      exact_source_disposable_postgres: 10,
      exact_source_ui_binding: 1,
      exact_source_transport: 1
    }
  );
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS) {
    assert.equal(definition.schemaVersion, "m1_b_negative_case_definition.v2");
    assert.match(definition.caseDefinitionHash, /^0x[0-9a-f]{64}$/);
    if (definition.sourceMode === "live_post_restart") {
      assert.equal(definition.testCommand, null);
      assert.deepEqual(definition.sourcePaths, []);
    } else {
      assert.match(
        definition.testCommand,
        /^node --test --test-reporter=tap --test-name-pattern /
      );
      assert.equal(definition.sourcePaths.length >= 4, true);
    }
  }
  assert.equal(
    getM1BOperationalNegativeCaseDefinition("human", "duplicate_acceptance")
      .sourceMode,
    "exact_source_disposable_postgres"
  );
  assert.equal(
    getM1BOperationalNegativeCaseDefinition("human", "changed_version")
      .sourceMode,
    "exact_source_ui_binding"
  );
});

test("TAP parser requires one exact unskipped Node test and preserves bounded bytes", () => {
  const name = "one exact negative";
  const tap = Buffer.from([
    "TAP version 13",
    `# Subtest: ${name}`,
    `ok 1 - ${name}`,
    "1..1",
    "# tests 1",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
    "# duration_ms 1",
    ""
  ].join("\n"));
  const parsed = parseM1BOperationalNodeTestTap(tap, {
    expectedTestName: name
  });
  assert.equal(parsed.parser, "node_test_tap_v13");
  assert.equal(parsed.exactPassCount, 1);
  assert.match(parsed.tapSha256, /^[0-9a-f]{64}$/);

  const skipped = Buffer.from(tap.toString("utf8").replace(
    `ok 1 - ${name}`,
    `ok 1 - ${name} # SKIP unavailable`
  ));
  assert.throws(
    () => parseM1BOperationalNodeTestTap(skipped, { expectedTestName: name }),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_tap_case_not_passed"
  );
  assert.throws(
    () => parseM1BOperationalNodeTestTap(Buffer.from("not TAP"), {
      expectedTestName: name
    }),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_tap_invalid"
  );
});

test("safe projection rejects credentials, session material, wallet addresses, and PII", () => {
  assert.equal(assertM1BOperationalNegativeSafeValue({
    status: 403,
    code: "authorization_denied",
    requestId: "request_safe_negative_0001"
  }), true);
  for (const unsafe of [
    { sessionMaterial: "opaque" },
    { cookie: "opaque" },
    { detail: `wallet 0x${"1".repeat(40)}` },
    { detail: "person@example.com" },
    { privateKey: "opaque" }
  ]) {
    assert.throws(
      () => assertM1BOperationalNegativeSafeValue(unsafe),
      (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
        error.code === "operational_negative_sensitive"
    );
  }
});

test("protected PostgreSQL manifests reject equal counts when one safe entity hash changes", () => {
  const before = protectedStateManifest();
  const beforeHash = manifestHash(before);
  assert.equal(assertM1BOperationalProtectedStateManifestPair({
    protectedStateBefore: before,
    protectedStateAfter: structuredClone(before),
    protectedStateBeforeHash: beforeHash,
    protectedStateAfterHash: beforeHash
  }), true);

  const changed = structuredClone(before);
  changed.obligations.manifestHash = `0x${"f".repeat(64)}`;
  assert.equal(changed.obligations.rowCount, before.obligations.rowCount);
  assert.throws(
    () => assertM1BOperationalProtectedStateManifestPair({
      protectedStateBefore: before,
      protectedStateAfter: changed,
      protectedStateBeforeHash: beforeHash,
      protectedStateAfterHash: manifestHash(changed)
    }),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_protected_state_manifest_invalid"
  );
});

test("changed-version exact-source runner reparses actual TAP bytes and never claims runtime snapshots", async () => {
  const run = await runM1BOperationalExactSourceNegativeCase({
    group: "human",
    id: "changed_version",
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE
  });
  assert.equal(Buffer.isBuffer(run.tapBytes), true);
  assert.equal(run.exitCode, 0);
  assert.equal(run.tapParser, "node_test_tap_v13");
  assert.equal(Buffer.isBuffer(run.trustedRegressionTapBytes), true);
  assert.match(run.trustedRegressionTapBytes.toString("utf8"), /^TAP version 13\n/);
  const proof = createM1BOperationalExactSourceNegativeProof(run);
  assert.equal(proof.proofKind, "exact_source_regression_assertion");
  assert.equal(proof.outwardStatus, null);
  assert.equal(proof.outwardResponseHash, null);
  assert.equal(proof.protectedStateBeforeHash, null);
  assert.equal(proof.protectedStateAfterHash, null);
  assert.equal(proof.regressionAssertions.responseBytesCaptured, false);
  assert.equal(proof.regressionAssertions.databaseSnapshotHashesCaptured, false);
  assert.match(proof.sourceEvidence.tapSha256, /^[0-9a-f]{64}$/);
  assert.equal(proof.sourceEvidence.sourceFiles.length, 4);
  const externalRun = await createM1BOperationalExactSourceRunFromTap({
    definition: run.definition,
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    tapBytes: run.tapBytes,
    exitCode: run.exitCode,
    sourceFiles: run.sourceFiles
  });
  assert.equal(
    createM1BOperationalExactSourceNegativeProof(externalRun).caseDefinitionHash,
    proof.caseDefinitionHash
  );
});

test("producer-shaped PostgreSQL proof is reconstructed from the exact inner diagnostic, not marker text", async () => {
  const definition = getM1BOperationalNegativeCaseDefinition(
    "authorization",
    "wrong_tenant_private_read"
  );
  const runId = "0123456789";
  const requestId = `request-cross-tenant-${runId}`;
  const correlationId = `correlation-cross-tenant-${runId}`;
  const state = protectedStateManifest();
  const stateHash = manifestHash(state);
  const audit = {
    eventId: "audit_wrong_tenant_private_read_0001",
    requestId,
    correlationId,
    operationId: definition.operationId,
    authorizationDecision: "deny",
    reasonCode: "resource_access_denied"
  };
  const outwardBody = {
    type: "about:blank",
    title: "The requested operation is not available.",
    status: 403,
    code: "authorization_denied",
    requestId
  };
  const postgresDiagnostic = {
    schemaVersion: "m1_b_postgres_negative_case_diagnostic.v2",
    group: definition.group,
    id: definition.id,
    capturedAt: "2026-08-15T00:00:01.000Z",
    requestId,
    correlationId,
    outwardStatus: 403,
    outwardCode: "authorization_denied",
    outwardBody,
    outwardResponseHash: manifestHash(outwardBody),
    authorizationAuditEventId: audit.eventId,
    authorizationDecision: "deny",
    authorizationReasonCode: audit.reasonCode,
    authorizationAuditRows: 1,
    authorizationAuditEvents: [audit],
    authorizationAuditSetHash: manifestHash([audit]),
    protectedStateBefore: state,
    protectedStateAfter: structuredClone(state),
    protectedStateBeforeHash: stateHash,
    protectedStateAfterHash: stateHash,
    additionalEffectCount: 0,
    duplicateSemantics: null,
    databaseProof: "disposable_postgres_owner_readback"
  };
  const regressionName =
    "cross-Tenant object reads fail closed and commit only bounded denial audit";
  const innerTap = (includeDiagnostic) => Buffer.from([
    "TAP version 13",
    `# Subtest: ${regressionName}`,
    "# tenantTwoAgent.getSelf",
    "# authorization_decision, reason_code",
    "# resource_access_denied",
    ...(includeDiagnostic ? [
      `# M1_B_POSTGRES_NEGATIVE_CASE_DIAGNOSTIC_V2=${Buffer.from(
        canonicalJson(postgresDiagnostic)
      ).toString("base64url")}`
    ] : []),
    `ok 1 - ${regressionName}`,
    "1..1",
    "# tests 1",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
    "# duration_ms 1",
    ""
  ].join("\n"));
  const observationFor = (trustedTap) => {
    const trustedTapSha256 = sha256(trustedTap);
    const databaseReadback = {
      schemaVersion: "m1_b_negative_database_readback.v2",
      outwardResponseHash: postgresDiagnostic.outwardResponseHash,
      authorizationAuditRows: 1,
      authorizationAuditEvents: [audit],
      authorizationAuditSetHash: postgresDiagnostic.authorizationAuditSetHash,
      protectedStateBefore: state,
      protectedStateAfter: structuredClone(state),
      protectedStateBeforeHash: stateHash,
      protectedStateAfterHash: stateHash
    };
    return {
      schemaVersion: "m1_b_negative_source_observation.v2",
      group: definition.group,
      id: definition.id,
      sourceMode: definition.sourceMode,
      capturedAt: postgresDiagnostic.capturedAt,
      requestId,
      correlationId,
      outwardStatus: 403,
      outwardCode: "authorization_denied",
      outwardBody,
      authorizationAuditEventId: audit.eventId,
      authorizationDecision: "deny",
      authorizationReasonCode: audit.reasonCode,
      protectedStateBeforeHash: stateHash,
      protectedStateAfterHash: stateHash,
      databaseProof: "disposable_postgres_owner_readback",
      additionalEffectCount: 0,
      nonEnumerating: true,
      duplicateSemantics: null,
      producerVerified: true,
      regressionAssertions: {
        schemaVersion: "m1_b_negative_regression_assertions.v2",
        assertedOutwardStatus: 403,
        assertedOutwardCode: "authorization_denied",
        protectedStateEqualityAsserted: true,
        additionalEffectCountAsserted: 0,
        responseBytesCaptured: false,
        databaseSnapshotHashesCaptured: true,
        actualDatabaseReadback: true,
        databaseReadback,
        sourceAssertionHash: manifestHash({
          schemaVersion: "m1_b_negative_source_assertion.v2",
          caseDefinitionHash: definition.caseDefinitionHash,
          trustedTapSha256,
          runId,
          postgresCaseDiagnostic: postgresDiagnostic
        }),
        compositeConfirmationRegression: false
      },
      trustedRegression: {
        testName: regressionName,
        tapSha256: trustedTapSha256,
        parser: "node_test_tap_v13",
        exitCode: 0,
        assertionMarkersHash: manifestHash([
          "tenantTwoAgent.getSelf",
          "authorization_decision, reason_code",
          "resource_access_denied"
        ])
      }
    };
  };
  const outerTapFor = (trustedTap, observation) => {
    const chunkSize = 768;
    const chunkCount = Math.ceil(trustedTap.length / chunkSize);
    const chunks = Array.from({ length: chunkCount }, (_, index) => (
      `# M1_B_OPERATIONAL_NEGATIVE_TRUSTED_TAP_CHUNK_V2=${sha256(trustedTap)}:${index}:${chunkCount}:${trustedTap.subarray(
        index * chunkSize,
        Math.min((index + 1) * chunkSize, trustedTap.length)
      ).toString("base64url")}`
    ));
    return Buffer.from([
      "TAP version 13",
      `# Subtest: ${definition.subtestName}`,
      ...chunks,
      `# ${encodeM1BOperationalNegativeCaseDiagnostic(observation)}`,
      `ok 1 - ${definition.subtestName}`,
      "1..1",
      "# tests 1",
      "# suites 0",
      "# pass 1",
      "# fail 0",
      "# cancelled 0",
      "# skipped 0",
      "# todo 0",
      "# duration_ms 1",
      ""
    ].join("\n"));
  };
  const sourceFiles = await Promise.all(definition.sourcePaths.map(
    async (path) => ({
      path,
      sha256: sha256(await readFile(resolve(ROOT, path)))
    })
  ));
  const trustedTap = innerTap(true);
  const observation = observationFor(trustedTap);
  const run = await createM1BOperationalExactSourceRunFromTap({
    definition,
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    tapBytes: outerTapFor(trustedTap, observation),
    exitCode: 0,
    sourceFiles
  });
  const proof = createM1BOperationalExactSourceNegativeProof(run);
  assert.equal(proof.proofKind, "exact_source_postgres_observation");
  assert.equal(proof.outwardStatus, 403);
  assert.equal(proof.databaseProof, "disposable_postgres_owner_readback");
  assert.equal(proof.regressionAssertions.databaseSnapshotHashesCaptured, true);
  assert.deepEqual(proof.sourceEvidence.supportingArtifacts, []);

  const markerOnlyTap = innerTap(false);
  const markerOnlyObservation = observationFor(markerOnlyTap);
  await assert.rejects(
    createM1BOperationalExactSourceRunFromTap({
      definition,
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      tapBytes: outerTapFor(markerOnlyTap, markerOnlyObservation),
      exitCode: 0,
      sourceFiles
    }),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_trusted_tap_invalid"
  );
});

test("critical Capital Partner parser derives only the known post-restart stale-Offer denial", () => {
  const capturedAt = "2026-08-15T00:00:01.000Z";
  const stateHash = `0x${"d".repeat(64)}`;
  const proof = deriveM1BReplacedStaleOfferNegativeProofFromCritical({
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: DATABASE_STARTED_AT,
    criticalArtifact: { id: "capital_partner_critical", sha256: "e".repeat(64) },
    criticalDocument: {
      schemaVersion: "m1_b_capital_partner_critical_receipt.v1",
      candidateReleaseId: CANDIDATE,
      databaseStartedAt: DATABASE_STARTED_AT,
      currentLineage: {
        staleOfferDenial: {
          verificationCapturedAt: capturedAt,
          requestId: "request_m1b_replaced_offer_0001",
          correlationId: "correlation_m1b_replaced_offer_0001",
          outwardResponse: {
            responseProjection: {
              status: 403,
              code: "authorization_denied",
              requestId: "request_m1b_replaced_offer_0001",
              schemaVersion: "problem_details.v1"
            }
          },
          authorizationAudit: {
            eventId: "audit_m1b_replaced_offer_0001",
            operationId: "pilotAcceptCreditOffer",
            requestId: "request_m1b_replaced_offer_0001",
            correlationId: "correlation_m1b_replaced_offer_0001",
            authorizationDecision: "deny",
            reasonCode: "credit_offer_state",
            occurredAt: "2026-08-15T00:00:00.500Z"
          },
          protectedStateCatalogVersion: "m1_b_cp_denial_protected_state.v1",
          protectedStateBeforeHash: stateHash,
          protectedStateAfterHash: stateHash,
          businessMutationCount: 0
        }
      }
    }
  });
  assert.equal(proof.proofKind, "runtime_observation");
  assert.equal(proof.sourceMode, "live_post_restart");
  assert.equal(proof.outwardStatus, 403);
  assert.equal(proof.additionalEffectCount, 0);
  assert.equal(proof.protectedStateBeforeHash, proof.protectedStateAfterHash);
  assert.equal(proof.regressionAssertions, null);
  assert.deepEqual(proof.sourceEvidence.supportingArtifacts, [{
    id: "capital_partner_critical",
    sha256: "e".repeat(64)
  }]);
});

test("raw or fixture observations cannot mint a production live proof", async () => {
  const module = await import("../src/m1-b-operational-negative-acceptance.js");
  assert.equal(module.createM1BOperationalLiveNegativeProof, undefined);
  await assert.rejects(
    captureM1BOperationalLiveNegativeProof({
      group: "human",
      id: "unauthorized_subject",
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      supportingArtifacts: [
        { id: "human_critical", sha256: "1".repeat(64) },
        { id: "agent_foreign_offer_setup", sha256: "2".repeat(64) }
      ],
      observation: {
        fixtureUsed: true,
        productionEvidenceEligible: false
      }
    }),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_live_capture_invalid"
  );
});

test("proof identifiers are unique where runtime or exact-source audits apply", () => {
  const proof = (suffix, audit = null) => ({
    requestId: `request_negative_unique_${suffix}`,
    correlationId: `correlation_negative_unique_${suffix}`,
    authorizationAuditEventId: audit
  });
  assert.equal(assertM1BOperationalNegativeProofIdentifiersUnique([
    proof("a", "audit_negative_unique_a"),
    proof("b", null)
  ]), true);
  assert.throws(
    () => assertM1BOperationalNegativeProofIdentifiersUnique([
      proof("a", "audit_negative_unique_a"),
      proof("a", "audit_negative_unique_b")
    ]),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_identifier_reused"
  );
});

test("closure validator requires the exact 16-case same-candidate set", () => {
  const proofs = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.map(
    (definition, index) => ({
      group: definition.group,
      id: definition.id,
      sourceMode: definition.sourceMode,
      caseDefinitionHash: definition.caseDefinitionHash,
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      requestId: `request_negative_complete_${index}`,
      correlationId: `correlation_negative_complete_${index}`,
      authorizationAuditEventId: null,
      producerVerified: true
    })
  );
  assert.equal(assertCompleteM1BOperationalNegativeProofSet(proofs), true);
  assert.throws(
    () => assertCompleteM1BOperationalNegativeProofSet(proofs.slice(1)),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_proof_set_incomplete"
  );
});

test("unimplemented exact-runtime live producers remain explicitly pending", () => {
  assert.deepEqual(pendingM1BOperationalLiveNegativeCases([]), [
    "human:expired_offer",
    "human:replaced_stale_offer",
    "human:unauthorized_subject",
    "authorization:cross_role_private_read"
  ]);
  assert.deepEqual(pendingM1BOperationalLiveNegativeCases([{
    group: "human",
    id: "replaced_stale_offer"
  }]), [
    "human:expired_offer",
    "human:unauthorized_subject",
    "authorization:cross_role_private_read"
  ]);
});

test("exact-runtime signed-out producer rejects non-candidate context before network or database access", async () => {
  await assert.rejects(
    captureM1BExactRuntimeSignedOutPrivateRead({
      candidateReleaseId: "not-a-sha",
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      databaseStartedAt: DATABASE_STARTED_AT,
      origin: "http://127.0.0.1:18887/",
      databaseUrl: "postgresql://invalid/test"
    }),
    (error) => error instanceof M1BOperationalNegativeAcceptanceError &&
      error.code === "operational_negative_candidate_invalid"
  );
});
