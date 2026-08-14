import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertM1BEvidenceRootMatchesRepository,
  verifyM1BCriticalArtifactContents,
  verifyM1BArtifactFiles,
  verifyM1BCurrentGitSource
} from "../../../scripts/m1-b-acceptance-evidence-files.mjs";
import {
  M1_B_RISK_MFA_LIVE_OPERATION_IDS,
  M1_B_RISK_MFA_OPERATION_IDS,
  M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
  M1_B_RISK_MFA_PROTECTED_STATE_TABLES,
  M1BAcceptanceEvidenceError
} from "../../release-governance/src/m1-b-acceptance-evidence.js";
import { ActorType } from "../../../modules/authentication/src/index.js";
import { AuthorizationPolicyRegistry } from "../../../modules/authorization/src/index.js";
import { hashId } from "../../domain/src/index.js";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);
const CANDIDATE_ACTIVITY_TIME = "2026-08-13T11:31:00.000Z";
const RETAINED_ORIGIN_TIME = "2026-08-12T10:00:00.000Z";

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function projectionHash(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function durableEvent({
  sequence,
  eventId,
  eventType,
  aggregateType,
  aggregateId,
  aggregateVersion,
  requestId,
  correlationId,
  digit = "1",
  payloadProjection,
  occurredAt = CANDIDATE_ACTIVITY_TIME
}) {
  const payloadHash = payloadProjection
    ? hashId("event_payload", payloadProjection)
    : `0x${digit.repeat(64)}`;
  return {
    sequence,
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    aggregateVersion,
    payloadHash,
    ...(payloadProjection === undefined ? {} : { payloadProjection }),
    evidenceId: eventId,
    evidenceHash: `0x${String((Number(digit) + 4) % 10).repeat(64)}`,
    evidencePayloadHash: payloadHash,
    sourceFinality: "finalized",
    causationId: requestId,
    correlationId,
    occurredAt
  };
}

function commandReceipt({
  operationId,
  requestId,
  correlationId,
  resourceType,
  resourceId,
  suffix,
  events,
  digit = "1",
  actorRefHash = `0x${"1".repeat(64)}`,
  occurredAt = CANDIDATE_ACTIVITY_TIME,
  responseSchemaVersion = `tenant_${operationId}.v1`,
  responseProjection = { schemaVersion: responseSchemaVersion }
}) {
  return {
    operationId,
    requestId,
    correlationId,
    resourceType,
    resourceId,
    authorizationAuditEventId: `auth_event_${suffix}_2`,
    authorizationDecisionId: `auth_decision_${suffix}_2`,
    authorizationDecision: "allow",
    actorRefHash,
    policyVersion: "security_001.v1",
    authorizationReasonCode: "authorization_allowed",
    authorizationAudits: [1, 2].map((index) => ({
      eventId: `auth_event_${suffix}_${index}`,
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      authorizationDecision: "allow",
      authorizationDecisionId: `auth_decision_${suffix}_${index}`,
      actorRefHash,
      policyVersion: "security_001.v1",
      reasonCode: "authorization_allowed",
      occurredAt
    })),
    commandHash: `0x${digit.repeat(64)}`,
    responseHash: `0x${String((Number(digit) + 3) % 10).repeat(64)}`,
    responseSchemaVersion,
    responseProjection,
    capturedResponseHashVerified: true,
    capturedAt: occurredAt,
    businessEventId: events[0].eventId,
    occurredAt,
    completedAt: occurredAt,
    eventManifest: events
  };
}

function queryProof({
  operationId,
  requestId,
  correlationId,
  responseSchemaVersion,
  resourceType = "workspace",
  resourceId = "workspace_local",
  suffix,
  responseProjection,
  actorRefHash = `0x${"1".repeat(64)}`,
  occurredAt = CANDIDATE_ACTIVITY_TIME
}) {
  return {
    operationId,
    requestId,
    correlationId,
    responseSchemaVersion,
    responseProvenance: "runtime_response_capture_db_reconciled",
    responseProjection,
    responseHash: projectionHash(responseProjection),
    occurredAt,
    authorizationAudits: [1, 2].map((index) => ({
      eventId: `auth_event_${suffix}_${index}`,
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      authorizationDecision: "allow",
      authorizationDecisionId: `auth_decision_${suffix}_${index}`,
      actorRefHash,
      policyVersion: "security_001.v1",
      reasonCode: "authorization_allowed",
      occurredAt
    }))
  };
}

function safeSiweAuthentication({
  actorRefHash,
  requestIds,
  auditEventIds,
  verificationMethod = "eip191_eoa_v1",
  occurredAt = CANDIDATE_ACTIVITY_TIME
}) {
  return {
    method: "siwe",
    acr: "urn:ipo.one:acr:wallet",
    amr: ["wallet", "siwe", verificationMethod],
    actorRefHash,
    clientRefHash: `0x${"6".repeat(64)}`,
    coveredAuditEventIds: [...auditEventIds].sort(),
    auditEventCount: auditEventIds.length,
    coveredRequestIds: [...requestIds].sort(),
    requestCount: requestIds.length,
    earliestAuthTime: occurredAt,
    latestAuthTime: occurredAt,
    activeCredentialBinding: true,
    activeMembershipBinding: true,
    credentialBindingCount: 1,
    invitationBoundCredentialRegistrationCount: 1,
    sessionMaterialIncluded: false,
    rawSignatureIncluded: false,
    walletAddressIncluded: false
  };
}

function projectionProof({
  entityType,
  entityId,
  entityHash,
  aggregateVersion,
  sourceEvent
}) {
  return {
    entityType,
    entityId,
    entityHash,
    rootAggregateType: sourceEvent.aggregateType,
    rootAggregateId: sourceEvent.aggregateId,
    aggregateVersion,
    sourceEventId: sourceEvent.eventId,
    sourceEvidenceHash: sourceEvent.evidenceHash,
    sourceFinality: sourceEvent.sourceFinality
  };
}

function denialProof({
  offerId,
  suffix,
  occurredAt = CANDIDATE_ACTIVITY_TIME,
  actorRefHash = `0x${"1".repeat(64)}`
}) {
  const withdrawn = suffix === "withdrawn";
  const protectedState = {
    catalogVersion: "m1_b_cp_denial_protected_state.v1",
    creditOffer: {
      creditOfferId: offerId,
      creditOfferHash: `0x${(withdrawn ? "1" : "b").repeat(64)}`,
      termsHash: `0x${(withdrawn ? "2" : "c").repeat(64)}`,
      disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
      status: withdrawn ? "withdrawn" : "declined",
      schemaVersion: withdrawn ? "credit_offer.v2" : "credit_offer.v1",
      projectionEntityHash: `0x${"5".repeat(64)}`,
      projectionAggregateVersion: 2,
      projectionSourceEventId: withdrawn
        ? "event_cp_withdrawal"
        : "event_cp_replacement",
      authorizationResourceStatus: withdrawn ? "closed" : "active",
      authorizationResourceVersion: withdrawn ? 2 : 1
    },
    deniedCommand: {
      requestId: `request-cp-denial-${suffix}`,
      correlationId: `correlation-cp-denial-${suffix}`,
      clientIdRefHash: `0x${"6".repeat(64)}`,
      idempotencyKeyHash: hashId("m1_b_denial_idempotency", {
        idempotencyKey: `idempotency-cp-denial-${suffix}`
      }),
      repositoryIdempotencyKeyHash: `0x${"5".repeat(64)}`,
      authorizationAllowCount: 0,
      commandIdempotencyCount: 0,
      commandEventCount: 0,
      tenantCommandExecutionCount: 0,
      businessDomainEventCount: 0,
      businessEvidenceEnvelopeCount: 0
    },
    relatedRowCounts: {
      creditOfferRowCount: 1,
      projectionRegistryCount: 1,
      projectionSnapshotCount: 2,
      domainEventCount: 2,
      evidenceEnvelopeCount: 2,
      creditOfferAcceptanceCount: 0,
      obligationCount: 0,
      sandboxExecutionReceiptCount: 0,
      repaymentEventCount: 0,
      ledgerTransactionCount: 0,
      ledgerEntryCount: 0
    }
  };
  const protectedStateHash = projectionHash(protectedState);
  const responseProjection = {
    status: 404,
    code: "authorization_denied",
    requestId: `request-cp-denial-${suffix}`,
    schemaVersion: "problem_details.v1"
  };
  const actionPayloadHash = `0x${createHash("sha256").update(JSON.stringify({
    expectedOfferHash: protectedState.creditOffer.creditOfferHash,
    expectedTermsHash: protectedState.creditOffer.termsHash,
    disclosureRef: protectedState.creditOffer.disclosureRef,
    sandboxOnly: true,
    productionFundsAuthority: false
  })).digest("hex")}`;
  const confirmationHash = `0x${"9".repeat(64)}`;
  const messageHash = `0x${"a".repeat(64)}`;
  const acknowledgementHash = `0x${createHash("sha256").update(JSON.stringify({
    acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
    creditOfferHash: protectedState.creditOffer.creditOfferHash,
    termsHash: protectedState.creditOffer.termsHash,
    disclosureRef: protectedState.creditOffer.disclosureRef,
    actionConfirmationMethod: "wallet_personal_sign",
    actionConfirmationHash: confirmationHash,
    actionConfirmationMessageHash: messageHash,
    sandboxOnly: true,
    productionFundsAuthority: false
  })).digest("hex")}`;
  const requestProjection = {
    operationId: "pilotAcceptCreditOffer",
    resource: { resourceType: "credit_offer", resourceId: offerId },
    payload: {
      expectedOfferHash: protectedState.creditOffer.creditOfferHash,
      expectedTermsHash: protectedState.creditOffer.termsHash,
      acknowledgementHash,
      actionConfirmation: {
        actionType: "accept_offer",
        resourceId: offerId,
        resourceHash: protectedState.creditOffer.creditOfferHash,
        payloadHash: actionPayloadHash,
        requestId: `request-cp-denial-${suffix}`,
        requestNonce: `human_action_confirmation_01234567-89ab-4def-8123-456789abc${withdrawn ? "dea" : "deb"}`,
        requestedAt: occurredAt,
        confirmedAt: occurredAt,
        expiresAt: new Date(Date.parse(occurredAt) + 300_000).toISOString(),
        confirmationMethod: "wallet_personal_sign",
        confirmationHash,
        messageHash,
        rawSignaturePersisted: false,
        blockchainTransactionSubmitted: false,
        schemaVersion: "economic_action_confirmation_result.v1"
      }
    },
    requestId: `request-cp-denial-${suffix}`,
    correlationId: `correlation-cp-denial-${suffix}`,
    idempotencyKey: `idempotency-cp-denial-${suffix}`,
    schemaVersion: "tenant_protocol_request.v1"
  };
  return {
    operationId: "pilotAcceptCreditOffer",
    creditOfferId: offerId,
    requestId: `request-cp-denial-${suffix}`,
    correlationId: `correlation-cp-denial-${suffix}`,
    outwardErrorCode: "authorization_denied",
    outwardResponse: {
      responseSchemaVersion: "problem_details.v1",
      requestProjection,
      requestProjectionHash: projectionHash(requestProjection),
      responseProjection,
      responseHash: projectionHash(responseProjection),
      capturedAt: occurredAt
    },
    authorizationAudit: {
      eventId: `auth_event_cp_denial_${suffix}`,
      operationId: "pilotAcceptCreditOffer",
      requestId: `request-cp-denial-${suffix}`,
      correlationId: `correlation-cp-denial-${suffix}`,
      resourceType: "credit_offer",
      resourceId: offerId,
      authorizationDecision: "deny",
      authorizationDecisionId: null,
      actorRefHash,
      policyVersion: "security_001.v1",
      reasonCode: "live_policy_rejected",
      occurredAt
    },
    protectedStateCatalogVersion: "m1_b_cp_denial_protected_state.v1",
    baselineCapturedAt: occurredAt,
    verificationCapturedAt: occurredAt,
    protectedStateBefore: structuredClone(protectedState),
    protectedStateAfter: structuredClone(protectedState),
    protectedStateBeforeHash: protectedStateHash,
    protectedStateAfterHash: protectedStateHash,
    businessMutationCount: 0
  };
}

function artifact(path, content) {
  return {
    id: "artifact_test",
    relativePath: path,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function issue(fragment) {
  return (error) =>
    error instanceof M1BAcceptanceEvidenceError &&
    error.issues.some((entry) => entry.includes(fragment));
}

const riskPolicyByOperationId = new Map(
  new AuthorizationPolicyRegistry().list().map((policy) => [
    policy.operationId,
    policy
  ])
);

function riskAuthorizationRegression() {
  const operationIds = M1_B_RISK_MFA_OPERATION_IDS;
  const denials = operationIds.map((operationId) => ({
    operationId,
    actorType: riskPolicyByOperationId.get(operationId)
      .requiresRecentMfaActorTypes.includes(ActorType.RISK_OPERATOR)
      ? ActorType.RISK_OPERATOR
      : ActorType.OPERATIONS_OPERATOR,
    authorizationDecision: "deny",
    reasonCode: "actor_capability_rejected",
    additionalEffectCount: 0
  }));
  const allowCount = 0;
  return {
    provenance: "exact_source_authorization_service",
    testName:
      "SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy",
    testCommand:
      "node --test --test-name-pattern 'SIWE-only Risk and Operations sessions fail closed for every recent-MFA policy' modules/authorization/test/authorization-service.test.js",
    testOutputSha256: "7".repeat(64),
    sourceFiles: [
      "apps/private-pilot/src/m1-b-risk-mfa-boundary-acceptance.js",
      "apps/private-pilot/src/m1-b-acceptance-postgres.js",
      "scripts/local-risk-mfa-boundary-acceptance.mjs",
      "modules/authorization/src/authorization-policy.js",
      "modules/authorization/src/authorization-service.js",
      "modules/authorization/test/authorization-service.test.js"
    ].map((path) => ({
      path,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
    })),
    operationIds,
    denials,
    allowCount,
    resultSha256: createHash("sha256").update(JSON.stringify({
      operationIds,
      denials,
      allowCount
    })).digest("hex"),
    passed: true
  };
}

test("artifact verifier opens and hashes a contained regular file", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-"));
  const content = Buffer.from("durable receipt\n");
  await mkdir(join(root, "receipts"));
  await writeFile(join(root, "receipts", "runtime.json"), content);
  assert.equal(
    await verifyM1BArtifactFiles(
      [artifact("receipts/runtime.json", content)],
      { evidenceRoot: root }
    ),
    true
  );
});

test("artifact verifier rejects missing and tampered files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-tamper-"));
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("missing.json", "expected")],
      { evidenceRoot: root }
    ),
    issue("does not exist")
  );
  await writeFile(join(root, "tampered.json"), "actual");
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("tampered.json", "expected")],
      { evidenceRoot: root }
    ),
    issue("SHA-256")
  );
});

test("artifact verifier rejects symlink files and symlink roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-link-"));
  const outside = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-outside-"));
  await writeFile(join(outside, "receipt.json"), "outside");
  await symlink(join(outside, "receipt.json"), join(root, "receipt.json"));
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("receipt.json", "outside")],
      { evidenceRoot: root }
    ),
    issue("symbolic-link")
  );
  const rootLink = `${root}-link`;
  await symlink(root, rootLink);
  await assert.rejects(
    verifyM1BArtifactFiles([], { evidenceRoot: rootLink }),
    issue("Evidence root")
  );
});

test("CLI root guard binds Evidence paths to the exact Git/source repository root", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-repository-"));
  const otherRoot = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-other-root-"));
  assert.equal(
    await assertM1BEvidenceRootMatchesRepository(repositoryRoot, {
      repositoryRoot
    }),
    await realpath(repositoryRoot)
  );
  await assert.rejects(
    assertM1BEvidenceRootMatchesRepository(otherRoot, { repositoryRoot }),
    issue("exact repository root")
  );
});

test("Git verifier binds HEAD, tree, and tracked cleanliness", () => {
  const evidence = { source: { commitSha: SHA, treeSha: TREE } };
  const cleanGit = (args) => {
    if (args[0] === "status") return "";
    return args[1] === "HEAD" ? SHA : TREE;
  };
  assert.equal(
    verifyM1BCurrentGitSource(evidence, SHA, {
      root: "/repo",
      git: cleanGit
    }),
    true
  );
  assert.throws(
    () => verifyM1BCurrentGitSource(
      { source: { commitSha: SHA, treeSha: "c".repeat(40) } },
      SHA,
      { root: "/repo", git: cleanGit }
    ),
    issue("treeSha")
  );
  assert.throws(
    () => verifyM1BCurrentGitSource(evidence, SHA, {
      root: "/repo",
      git: (args) => args[0] === "status" ? " M tracked.js" : cleanGit(args)
    }),
    issue("not clean")
  );
});

test("critical artifact verifier binds runtime identity and both Agent phases", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-critical-"));
  const linkage = {
    candidateReleaseId: SHA,
    candidateMarker: `m1b.agent.${SHA}`,
    accountHash: `0x${"1".repeat(64)}`,
    subjectId: "subject_candidate",
    mandateId: "mandate_candidate",
    creditIntentId: "credit_intent_candidate",
    creditOfferId: "credit_offer_candidate",
    obligationId: "obligation_candidate",
    facilityId: "facility_candidate",
    creditLineId: "credit_line_candidate"
  };
  const acceptanceLinkage = {
    ...linkage,
    candidateReleaseId: linkage.candidateReleaseId,
    candidateMarker: linkage.candidateMarker
  };
  const beforeTime = "2026-08-13T11:00:00.000Z";
  const afterTime = "2026-08-13T11:30:00.000Z";
  const humanOperationTimes = [
    "2026-08-13T11:30:10.000Z",
    "2026-08-13T11:30:20.000Z",
    "2026-08-13T11:30:30.000Z",
    "2026-08-13T11:30:40.000Z",
    "2026-08-13T11:30:50.000Z"
  ];
  const humanActorId = "actor_human_borrower_pilot";
  const humanActorRefHash = hashId("m1_b_acceptance_actor_reference", {
    actorId: humanActorId
  });
  const humanOriginSpecs = [
    ["pilotCreateHumanSubject", "subject", "subject", "subject_human_candidate", [
      ["event_human_origin_principal", "principal_created", "principal", "principal_human_candidate", 1],
      ["event_human_origin_subject", "subject_created", "subject", "subject_human_candidate", 1]
    ]],
    ["pilotCreateConsent", "consent", "subject", "subject_human_candidate", [
      ["event_human_origin_consent", "consent_recorded", "consent", "consent_human_candidate", 1]
    ]],
    ["pilotRequestCredit", "intent", "subject", "subject_human_candidate", [
      ["event_human_origin_intent", "credit_intent_created", "credit_intent", "credit_intent_human_candidate", 1]
    ]],
    ["pilotEvaluateCreditApplication", "decision", "credit_intent", "credit_intent_human_candidate", [
      ["event_human_origin_intent_decided", "credit_intent_status_changed", "credit_intent", "credit_intent_human_candidate", 2],
      ["event_human_origin_decision", "risk_decision_created", "risk_decision", "risk_decision_human_candidate", 1],
      ["event_human_origin_offer", "credit_offer_created", "credit_offer", "credit_offer_human_current", 1]
    ]]
  ];
  const humanOriginCommands = humanOriginSpecs.map(([
    operationId,
    suffix,
    resourceType,
    resourceId,
    eventSpecs
  ], commandIndex) => {
    const requestId = `request-human-origin-${suffix}`;
    const correlationId = "correlation-human-origin";
    const events = eventSpecs.map(([
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion
    ], sequence) => durableEvent({
      sequence,
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion,
      requestId,
      correlationId,
      digit: String(commandIndex + sequence + 1),
      occurredAt: RETAINED_ORIGIN_TIME
    }));
    return commandReceipt({
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      suffix: `human_origin_${suffix}`,
      events,
      digit: String(commandIndex + 1),
      actorRefHash: humanActorRefHash,
      occurredAt: RETAINED_ORIGIN_TIME
    });
  });
  const identityEvent = durableEvent({
    sequence: 0,
    eventId: "event_human_identity_reference",
    eventType: "identity_reference_recorded",
    aggregateType: "human_identity_reference",
    aggregateId: "identity_reference_human_candidate",
    aggregateVersion: 1,
    requestId: null,
    correlationId: "subject_human_candidate",
    digit: "7",
    occurredAt: RETAINED_ORIGIN_TIME
  });
  const humanActionConfirmation = (actionType, requestId, digit, confirmedAt) => ({
    actionType,
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: `0x${digit.repeat(64)}`,
    messageHash: `0x${String((Number(digit) + 1) % 10).repeat(64)}`,
    resourceHash: `0x${String((Number(digit) + 2) % 10).repeat(64)}`,
    payloadHash: `0x${String((Number(digit) + 3) % 10).repeat(64)}`,
    requestId,
    confirmedAt,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  });
  const acceptanceRequestId = "request-human-operation-2";
  const executionRequestId = "request-human-operation-3";
  const repaymentRequestId = "request-human-operation-4";
  const acceptanceAction = humanActionConfirmation(
    "accept_offer",
    acceptanceRequestId,
    "1",
    humanOperationTimes[1]
  );
  const executionAction = humanActionConfirmation(
    "execute_obligation",
    executionRequestId,
    "2",
    humanOperationTimes[2]
  );
  const repaymentAction = humanActionConfirmation(
    "post_repayment",
    repaymentRequestId,
    "3",
    humanOperationTimes[3]
  );
  const humanCriticalPayloadByEventId = {
    event_human_acceptance: {
      creditOfferAcceptanceId: "credit_offer_acceptance_human_candidate",
      acceptanceHash: `0x${"1".repeat(64)}`,
      creditOfferId: "credit_offer_human_current",
      creditOfferHash: `0x${"2".repeat(64)}`,
      termsHash: `0x${"3".repeat(64)}`,
      acknowledgementHash: `0x${"4".repeat(64)}`,
      authorityType: "consent",
      authorityRef: "consent_human_candidate",
      actorHash: `0x${"5".repeat(64)}`,
      actionConfirmation: acceptanceAction,
      sandboxOnly: true,
      productionAuthority: false,
      causationId: acceptanceRequestId,
      correlationId: "correlation-human-lifecycle"
    },
    event_human_accept: {
      creditOfferId: "credit_offer_human_current",
      creditOfferAcceptanceId: "credit_offer_acceptance_human_candidate",
      previousStatus: "offered",
      nextStatus: "accepted",
      actorHash: `0x${"5".repeat(64)}`,
      actionConfirmation: acceptanceAction,
      causationId: acceptanceRequestId,
      correlationId: "correlation-human-lifecycle"
    },
    event_human_obligation: {
      obligationId: "obligation_human_candidate",
      obligationHash: `0x${"6".repeat(64)}`,
      creditIntentId: "credit_intent_human_candidate",
      riskDecisionId: "risk_decision_human_candidate",
      creditOfferId: "credit_offer_human_current",
      creditOfferAcceptanceId: "credit_offer_acceptance_human_candidate",
      authorityType: "consent",
      authorityRef: "consent_human_candidate",
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      originalPrincipalMinor: "1000000",
      scheduleHash: `0x${"7".repeat(64)}`,
      executionStatus: "pending",
      sandboxOnly: true,
      productionFundsMoved: false,
      actorHash: `0x${"5".repeat(64)}`,
      actionConfirmation: acceptanceAction,
      causationId: acceptanceRequestId,
      correlationId: "correlation-human-lifecycle"
    },
    event_human_execution_ledger: {
      ledgerTransactionId: "ledger_transaction_human_candidate",
      transactionHash: `0x${"8".repeat(64)}`,
      transactionType: "sandbox_credit_execution",
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      debitTotalMinor: "1000000",
      creditTotalMinor: "1000000",
      entryCount: 2,
      actorId: humanActorId,
      causationId: executionRequestId,
      correlationId: "correlation-human-lifecycle",
      sandboxOnly: true,
      productionFundsMoved: false
    },
    event_human_execution: {
      obligationId: "obligation_human_candidate",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_candidate",
      receiptHash: `0x${"4".repeat(64)}`,
      principalLedgerTransactionId: "ledger_transaction_human_candidate",
      previousStatus: "created",
      nextStatus: "active",
      previousExecutionStatus: "pending",
      nextExecutionStatus: "executed",
      actorId: humanActorId,
      causationId: executionRequestId,
      correlationId: "correlation-human-lifecycle",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      actionConfirmation: executionAction
    },
    event_human_repayment_ledger: {
      ledgerTransactionId: "ledger_transaction_human_repayment",
      transactionHash: `0x${"9".repeat(64)}`,
      transactionType: "sandbox_repayment",
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      debitTotalMinor: "1000000",
      creditTotalMinor: "1000000",
      entryCount: 2,
      actorId: humanActorId,
      causationId: repaymentRequestId,
      correlationId: "correlation-human-lifecycle",
      sandboxOnly: true,
      productionFundsMoved: false
    },
    event_human_repayment: {
      repaymentId: "repayment_human_candidate",
      repaymentHash: `0x${"5".repeat(64)}`,
      obligationId: "obligation_human_candidate",
      requestedMinor: "1000000",
      appliedMinor: "1000000",
      appliedFeeMinor: "0",
      appliedInterestMinor: "0",
      appliedPrincipalMinor: "1000000",
      surplusMinor: "0",
      previousStatus: "active",
      nextStatus: "fully_repaid",
      actorId: humanActorId,
      causationId: repaymentRequestId,
      correlationId: "correlation-human-lifecycle",
      sandboxOnly: true,
      productionFundsMoved: false,
      actionConfirmation: repaymentAction
    }
  };
  const humanCommandResponseByOperationId = {
    pilotAcceptCreditOffer: {
      creditOfferAcceptanceId: "credit_offer_acceptance_human_candidate",
      acceptanceHash: `0x${"1".repeat(64)}`,
      creditOfferId: "credit_offer_human_current",
      creditOfferHash: `0x${"2".repeat(64)}`,
      termsHash: `0x${"3".repeat(64)}`,
      creditIntentId: "credit_intent_human_candidate",
      riskDecisionId: "risk_decision_human_candidate",
      subjectId: "subject_human_candidate",
      obligationId: "obligation_human_candidate",
      obligationHash: `0x${"6".repeat(64)}`,
      obligationStatus: "created",
      executionStatus: "pending",
      offerStatus: "accepted",
      sandboxOnly: true,
      productionAuthority: false,
      productionFundsMoved: false,
      withdrawable: false,
      fundsAuthority: false,
      schemaVersion: "tenant_credit_offer_accepted.v1"
    },
    pilotExecuteSandboxObligation: {
      obligationId: "obligation_human_candidate",
      obligationHash: `0x${"6".repeat(64)}`,
      obligationStatus: "active",
      executionStatus: "executed",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_candidate",
      executionReceiptHash: `0x${"4".repeat(64)}`,
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      amountMinor: "1000000",
      principalLedgerTransactionId: "ledger_transaction_human_candidate",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_obligation_executed.v1"
    },
    pilotPostSandboxRepayment: {
      obligationId: "obligation_human_candidate",
      obligationHash: `0x${"6".repeat(64)}`,
      obligationStatus: "fully_repaid",
      repaymentId: "repayment_human_candidate",
      repaymentHash: `0x${"5".repeat(64)}`,
      ledgerTransactionId: "ledger_transaction_human_repayment",
      interestLedgerTransactionId: null,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_repayment_posted.v1"
    }
  };
  const humanLifecycleSpecs = [
    ["pilotAcceptCreditOffer", "credit_offer", "credit_offer_human_current", [
      ["event_human_acceptance", "credit_offer_acceptance_recorded", "credit_offer_acceptance", "credit_offer_acceptance_human_candidate", 1],
      ["event_human_accept", "credit_offer_accepted", "credit_offer", "credit_offer_human_current", 2],
      ["event_human_obligation", "obligation_created", "obligation", "obligation_human_candidate", 1]
    ]],
    ["pilotExecuteSandboxObligation", "obligation", "obligation_human_candidate", [
      ["event_human_accounts", "ledger_account_opened", "obligation", "obligation_human_candidate", 2],
      ["event_human_execution_ledger", "ledger_transaction_posted", "obligation", "obligation_human_candidate", 3],
      ["event_human_execution", "obligation_sandbox_executed", "obligation", "obligation_human_candidate", 4]
    ]],
    ["pilotPostSandboxRepayment", "obligation", "obligation_human_candidate", [
      ["event_human_repayment_ledger", "ledger_transaction_posted", "obligation", "obligation_human_candidate", 5],
      ["event_human_repayment", "repayment_posted", "obligation", "obligation_human_candidate", 6]
    ]]
  ];
  const humanLifecycleCommands = humanLifecycleSpecs.map(([
    operationId,
    resourceType,
    resourceId,
    eventSpecs
  ], commandIndex) => {
    const sequence = commandIndex + 2;
    const requestId = `request-human-operation-${sequence}`;
    const correlationId = "correlation-human-lifecycle";
    const events = eventSpecs.map(([
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion
    ], eventSequence) => durableEvent({
      sequence: eventSequence,
      eventId,
      eventType,
      aggregateType,
      aggregateId,
      aggregateVersion,
      requestId,
      correlationId,
      digit: String(commandIndex + eventSequence + 1),
      payloadProjection: humanCriticalPayloadByEventId[eventId],
      occurredAt: humanOperationTimes[sequence - 1]
    }));
    return commandReceipt({
      operationId,
      requestId,
      correlationId,
      resourceType,
      resourceId,
      suffix: `human_${sequence}`,
      events,
      digit: String(commandIndex + 5),
      responseSchemaVersion: humanCommandResponseByOperationId[operationId].schemaVersion,
      responseProjection: humanCommandResponseByOperationId[operationId],
      actorRefHash: humanActorRefHash,
      occurredAt: humanOperationTimes[sequence - 1]
    });
  });
  const humanEvents = [
    ...humanOriginCommands.flatMap(({ eventManifest }) => eventManifest),
    identityEvent,
    ...humanLifecycleCommands.flatMap(({ eventManifest }) => eventManifest)
  ];
  const humanEvent = (eventId) => humanEvents.find((event) => event.eventId === eventId);
  const humanOfferRecoveryProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_human_current",
    entityHash: `0x${"2".repeat(64)}`,
    aggregateVersion: 1,
    sourceEvent: humanEvent("event_human_origin_offer")
  });
  const humanIdentityProjection = projectionProof({
    entityType: "human_identity_reference",
    entityId: "identity_reference_human_candidate",
    entityHash: `0x${"6".repeat(64)}`,
    aggregateVersion: 1,
    sourceEvent: identityEvent
  });
  const cpOperationTimes = [
    "2026-08-13T11:34:00.000Z",
    "2026-08-13T11:34:10.000Z",
    "2026-08-13T11:34:20.000Z",
    "2026-08-13T11:34:30.000Z",
    "2026-08-13T11:34:40.000Z",
    "2026-08-13T11:36:00.000Z",
    "2026-08-13T11:36:10.000Z",
    "2026-08-13T11:36:20.000Z",
    "2026-08-13T11:36:30.000Z",
    "2026-08-13T11:36:40.000Z"
  ];
  const cpCurrentReplacementPayload = {
    creditOfferId: "credit_offer_cp_preliminary",
    previousStatus: "offered",
    nextStatus: "declined",
    replacementOfferId: "credit_offer_cp_current",
    reasonCode: "capital_partner_offer_authored",
    sandboxOnly: true,
    productionFundsApproved: false,
    causationId: "request-cp-command-current-0",
    correlationId: "correlation-cp-current"
  };
  const cpCurrentCreatedPayload = {
    creditOfferId: "credit_offer_cp_current",
    creditOfferHash: `0x${"d".repeat(64)}`,
    termsHash: `0x${"e".repeat(64)}`,
    creditIntentId: "credit_intent_cp_current",
    riskDecisionId: "risk_decision_cp_current",
    capitalPartnerRefHash: `0x${"1".repeat(64)}`,
    operatorRefHash: `0x${"2".repeat(64)}`,
    creditPassportArtifactHash: `0x${"a".repeat(64)}`,
    passportVerificationHash: `0x${"3".repeat(64)}`,
    underwritingSnapshotHash: `0x${"4".repeat(64)}`,
    status: "offered",
    validUntil: "2026-08-14T11:31:00.000Z",
    sandboxOnly: true,
    productionFundsApproved: false,
    causationId: "request-cp-command-current-0",
    correlationId: "correlation-cp-current"
  };
  const cpWithdrawalReplacementPayload = {
    creditOfferId: "credit_offer_cp_withdrawal_preliminary",
    previousStatus: "offered",
    nextStatus: "declined",
    replacementOfferId: "credit_offer_cp_withdrawn",
    reasonCode: "capital_partner_offer_authored",
    sandboxOnly: true,
    productionFundsApproved: false,
    causationId: "request-cp-command-withdrawal-1",
    correlationId: "correlation-cp-withdrawal"
  };
  const cpWithdrawalCreatedPayload = {
    creditOfferId: "credit_offer_cp_withdrawn",
    creditOfferHash: `0x${"1".repeat(64)}`,
    termsHash: `0x${"2".repeat(64)}`,
    creditIntentId: "credit_intent_cp_withdrawal",
    riskDecisionId: "risk_decision_cp_withdrawal",
    capitalPartnerRefHash: `0x${"1".repeat(64)}`,
    operatorRefHash: `0x${"2".repeat(64)}`,
    creditPassportArtifactHash: `0x${"f".repeat(64)}`,
    passportVerificationHash: `0x${"5".repeat(64)}`,
    underwritingSnapshotHash: `0x${"6".repeat(64)}`,
    status: "offered",
    validUntil: "2026-08-14T11:31:00.000Z",
    sandboxOnly: true,
    productionFundsApproved: false,
    causationId: "request-cp-command-withdrawal-1",
    correlationId: "correlation-cp-withdrawal"
  };
  const cpWithdrawalPayload = {
    creditOfferId: "credit_offer_cp_withdrawn",
    previousStatus: "offered",
    nextStatus: "withdrawn",
    capitalPartnerRefHash: `0x${"1".repeat(64)}`,
    operatorRefHash: `0x${"2".repeat(64)}`,
    sandboxOnly: true,
    productionFundsApproved: false,
    causationId: "request-cp-command-withdrawal-2",
    correlationId: "correlation-cp-withdrawal"
  };
  const cpPreliminaryCreatedEvent = durableEvent({
    sequence: 0,
    eventId: "event_cp_preliminary_created",
    eventType: "credit_offer_created",
    aggregateType: "credit_offer",
    aggregateId: "credit_offer_cp_preliminary",
    aggregateVersion: 1,
    requestId: "request-cp-preliminary-origin",
    correlationId: "correlation-cp-current",
    digit: "1"
  });
  const cpCurrentRequestId = "request-cp-command-current-0";
  const cpCurrentCorrelationId = "correlation-cp-current";
  const cpCurrentEvents = [
    durableEvent({
      sequence: 0,
      eventId: "event_cp_replacement",
      eventType: "credit_offer_status_changed",
      aggregateType: "credit_offer",
      aggregateId: "credit_offer_cp_preliminary",
      aggregateVersion: 2,
      requestId: cpCurrentRequestId,
      correlationId: cpCurrentCorrelationId,
      digit: "2",
      payloadProjection: cpCurrentReplacementPayload,
      occurredAt: cpOperationTimes[2]
    }),
    durableEvent({
      sequence: 1,
      eventId: "event_cp_current_created",
      eventType: "credit_offer_created",
      aggregateType: "credit_offer",
      aggregateId: "credit_offer_cp_current",
      aggregateVersion: 1,
      requestId: cpCurrentRequestId,
      correlationId: cpCurrentCorrelationId,
      digit: "3",
      payloadProjection: cpCurrentCreatedPayload,
      occurredAt: cpOperationTimes[2]
    })
  ];
  const cpWithdrawalAuthorRequestId = "request-cp-command-withdrawal-1";
  const cpWithdrawalCorrelationId = "correlation-cp-withdrawal";
  const cpWithdrawalPreliminaryCreatedEvent = durableEvent({
    sequence: 0,
    eventId: "event_cp_withdrawal_preliminary_created",
    eventType: "credit_offer_created",
    aggregateType: "credit_offer",
    aggregateId: "credit_offer_cp_withdrawal_preliminary",
    aggregateVersion: 1,
    requestId: "request-cp-withdrawal-preliminary-origin",
    correlationId: cpWithdrawalCorrelationId,
    digit: "4"
  });
  const cpWithdrawalReplacementEvent = durableEvent({
    sequence: 0,
    eventId: "event_cp_withdrawal_replacement",
    eventType: "credit_offer_status_changed",
    aggregateType: "credit_offer",
    aggregateId: "credit_offer_cp_withdrawal_preliminary",
    aggregateVersion: 2,
    requestId: cpWithdrawalAuthorRequestId,
    correlationId: cpWithdrawalCorrelationId,
    digit: "5",
    payloadProjection: cpWithdrawalReplacementPayload,
    occurredAt: cpOperationTimes[6]
  });
  const cpWithdrawalCreatedEvent = durableEvent({
    sequence: 1,
    eventId: "event_cp_withdrawn_created",
    eventType: "credit_offer_created",
    aggregateType: "credit_offer",
    aggregateId: "credit_offer_cp_withdrawn",
    aggregateVersion: 1,
    requestId: cpWithdrawalAuthorRequestId,
    correlationId: cpWithdrawalCorrelationId,
    digit: "6",
    payloadProjection: cpWithdrawalCreatedPayload,
    occurredAt: cpOperationTimes[6]
  });
  const cpWithdrawalRequestId = "request-cp-command-withdrawal-2";
  const cpWithdrawalEvent = durableEvent({
    sequence: 0,
    eventId: "event_cp_withdrawal",
    eventType: "credit_offer_status_changed",
    aggregateType: "credit_offer",
    aggregateId: "credit_offer_cp_withdrawn",
    aggregateVersion: 2,
    requestId: cpWithdrawalRequestId,
    correlationId: cpWithdrawalCorrelationId,
    digit: "5",
    payloadProjection: cpWithdrawalPayload,
    occurredAt: cpOperationTimes[7]
  });
  const cpCommandReceipts = [
    commandReceipt({
      operationId: "pilotAuthorCapitalPartnerOffer",
      requestId: cpCurrentRequestId,
      correlationId: cpCurrentCorrelationId,
      resourceType: "credit_passport_artifact",
      resourceId: "credit_passport_cp_current",
      suffix: "cp_command_current_0",
      events: cpCurrentEvents,
      digit: "3",
      actorRefHash: `0x${"2".repeat(64)}`,
      responseSchemaVersion: "tenant_capital_partner_offer_authored.v1",
      responseProjection: {
        creditOfferId: "credit_offer_cp_current",
        creditOfferHash: `0x${"d".repeat(64)}`,
        termsHash: `0x${"e".repeat(64)}`,
        creditIntentId: "credit_intent_cp_current",
        subjectId: "subject_human_candidate",
        riskDecisionId: "risk_decision_cp_current",
        capitalPartnerId: "capital_partner_candidate",
        creditPassportArtifactId: "credit_passport_cp_current",
        creditPassportArtifactHash: `0x${"a".repeat(64)}`,
        creditPassportArtifactVersion: 1,
        status: "offered",
        offerSchemaVersion: "credit_offer.v2",
        sandboxOnly: true,
        productionFundsApproved: false,
        responseCapitalPartnerId: "capital_partner_candidate",
        fundsAuthority: false,
        schemaVersion: "tenant_capital_partner_offer_authored.v1"
      },
      occurredAt: cpOperationTimes[2]
    }),
    commandReceipt({
      operationId: "pilotAuthorCapitalPartnerOffer",
      requestId: cpWithdrawalAuthorRequestId,
      correlationId: cpWithdrawalCorrelationId,
      resourceType: "credit_passport_artifact",
      resourceId: "credit_passport_cp_withdrawal",
      suffix: "cp_command_withdrawal_1",
      events: [cpWithdrawalReplacementEvent, cpWithdrawalCreatedEvent],
      digit: "4",
      actorRefHash: `0x${"2".repeat(64)}`,
      responseSchemaVersion: "tenant_capital_partner_offer_authored.v1",
      responseProjection: {
        creditOfferId: "credit_offer_cp_withdrawn",
        creditOfferHash: `0x${"1".repeat(64)}`,
        termsHash: `0x${"2".repeat(64)}`,
        creditIntentId: "credit_intent_cp_withdrawal",
        subjectId: "subject_human_candidate",
        riskDecisionId: "risk_decision_cp_withdrawal",
        capitalPartnerId: "capital_partner_candidate",
        creditPassportArtifactId: "credit_passport_cp_withdrawal",
        creditPassportArtifactHash: `0x${"f".repeat(64)}`,
        creditPassportArtifactVersion: 1,
        status: "offered",
        offerSchemaVersion: "credit_offer.v2",
        sandboxOnly: true,
        productionFundsApproved: false,
        responseCapitalPartnerId: "capital_partner_candidate",
        fundsAuthority: false,
        schemaVersion: "tenant_capital_partner_offer_authored.v1"
      },
      occurredAt: cpOperationTimes[6]
    }),
    commandReceipt({
      operationId: "pilotTransitionCapitalPartnerOffer",
      requestId: cpWithdrawalRequestId,
      correlationId: cpWithdrawalCorrelationId,
      resourceType: "credit_offer",
      resourceId: "credit_offer_cp_withdrawn",
      suffix: "cp_command_withdrawal_2",
      events: [cpWithdrawalEvent],
      digit: "5",
      actorRefHash: `0x${"2".repeat(64)}`,
      responseSchemaVersion: "tenant_capital_partner_offer_transitioned.v1",
      responseProjection: {
        creditOfferId: "credit_offer_cp_withdrawn",
        creditOfferHash: `0x${"1".repeat(64)}`,
        termsHash: `0x${"2".repeat(64)}`,
        creditIntentId: "credit_intent_cp_withdrawal",
        subjectId: "subject_human_candidate",
        riskDecisionId: "risk_decision_cp_withdrawal",
        capitalPartnerId: "capital_partner_candidate",
        status: "withdrawn",
        offerSchemaVersion: "credit_offer.v2",
        closedAt: cpOperationTimes[7],
        sandboxOnly: true,
        productionFundsApproved: false,
        schemaVersion: "tenant_capital_partner_offer_transitioned.v1"
      },
      occurredAt: cpOperationTimes[7]
    })
  ];
  const cpEvents = [
    cpPreliminaryCreatedEvent,
    cpWithdrawalPreliminaryCreatedEvent,
    ...cpCommandReceipts.flatMap(({ eventManifest }) => eventManifest)
  ];
  const cpEvent = (eventId) => cpEvents.find((event) => event.eventId === eventId);
  const cpPreliminaryOfferedProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_cp_preliminary",
    entityHash: `0x${"b".repeat(64)}`,
    aggregateVersion: 1,
    sourceEvent: cpPreliminaryCreatedEvent
  });
  const cpPreliminaryDeclinedProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_cp_preliminary",
    entityHash: `0x${"6".repeat(64)}`,
    aggregateVersion: 2,
    sourceEvent: cpEvent("event_cp_replacement")
  });
  const cpCurrentProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_cp_current",
    entityHash: `0x${"d".repeat(64)}`,
    aggregateVersion: 1,
    sourceEvent: cpEvent("event_cp_current_created")
  });
  const cpWithdrawnProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_cp_withdrawn",
    entityHash: `0x${"7".repeat(64)}`,
    aggregateVersion: 2,
    sourceEvent: cpWithdrawalEvent
  });
  const cpWithdrawalPreliminaryOfferedProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_cp_withdrawal_preliminary",
    entityHash: `0x${"8".repeat(64)}`,
    aggregateVersion: 1,
    sourceEvent: cpWithdrawalPreliminaryCreatedEvent
  });
  const cpWithdrawalPreliminaryDeclinedProjection = projectionProof({
    entityType: "credit_offer",
    entityId: "credit_offer_cp_withdrawal_preliminary",
    entityHash: `0x${"9".repeat(64)}`,
    aggregateVersion: 2,
    sourceEvent: cpWithdrawalReplacementEvent
  });
  const humanWorkspaceResponseProjection = {
    workspaceKind: "human_borrower",
    humanOfferReview: {
      subjectId: "subject_human_candidate",
      consentId: "consent_human_candidate",
      creditIntentId: "credit_intent_human_candidate",
      riskDecisionId: "risk_decision_human_candidate",
      creditOfferId: "credit_offer_human_current",
      creditOfferHash: `0x${"2".repeat(64)}`,
      termsHash: `0x${"3".repeat(64)}`,
      offerSchemaVersion: "credit_offer.v1",
      offerAggregateVersion: 1,
      offerStatus: "offered",
      recoverySchemaVersion: "human_offer_review_recovery.v1",
      serverTruth: true
    },
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v2"
  };
  const cpCurrentWorkspaceResponseProjection = {
    workspaceKind: "human_borrower",
    humanOfferReview: {
      subjectId: "subject_human_candidate",
      consentId: "consent_cp_current",
      creditIntentId: "credit_intent_cp_current",
      riskDecisionId: "risk_decision_cp_current",
      creditOfferId: "credit_offer_cp_current",
      creditOfferHash: `0x${"d".repeat(64)}`,
      termsHash: `0x${"e".repeat(64)}`,
      offerSchemaVersion: "credit_offer.v2",
      offerAggregateVersion: 1,
      offerStatus: "offered",
      recoverySchemaVersion: "human_offer_review_recovery.v1",
      serverTruth: true
    },
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v2"
  };
  const humanEvidenceIds = [
    "event_human_acceptance",
    "event_human_accept",
    "event_human_obligation",
    "event_human_accounts",
    "event_human_execution_ledger",
    "event_human_execution",
    "event_human_repayment_ledger",
    "event_human_repayment"
  ];
  const humanEvidenceManifestHash = projectionHash(humanEvidenceIds.map((eventId) => {
    const event = humanEvent(eventId);
    return {
      eventId: event.eventId,
      evidenceHash: event.evidenceHash,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      payloadHash: event.payloadHash,
      sourceFinality: event.sourceFinality
    };
  }));
  const humanLedgerEntries = ({
    prefix,
    occurredAt,
    debitAccountType,
    creditAccountType
  }) => {
    const assetId = "eip155:84532/erc20:0x0000000000000000000000000000000000000001";
    const normalSide = {
      principal_receivable: "debit",
      sandbox_funding_source: "credit",
      repayment_clearing: "debit"
    };
    const accountRefHash = (accountType) => {
      const digest = hashId("sandbox_ledger_account", {
        ownerType: "obligation",
        ownerId: "obligation_human_candidate",
        assetId,
        accountType
      });
      return hashId("m1_b_ledger_account_reference", {
        ledgerAccountId: `ledger_account_${digest.slice(2)}`
      });
    };
    return [
    {
      sequence: 0,
      ledgerEntryId: `ledger_entry_${prefix}_debit`,
      ledgerAccountRefHash: accountRefHash(debitAccountType),
      accountOwnerType: "obligation",
      accountOwnerRefHash: hashId("m1_b_ledger_account_owner_reference", {
        ownerType: "obligation",
        ownerId: "obligation_human_candidate"
      }),
      accountAssetId: assetId,
      accountType: debitAccountType,
      accountNormalSide: normalSide[debitAccountType],
      accountStatus: "active",
      canonicalAccountVerified: true,
      direction: "debit",
      amountMinor: "1000000",
      postedAt: occurredAt,
      schemaVersion: "ledger_entry.v1"
    },
    {
      sequence: 1,
      ledgerEntryId: `ledger_entry_${prefix}_credit`,
      ledgerAccountRefHash: accountRefHash(creditAccountType),
      accountOwnerType: "obligation",
      accountOwnerRefHash: hashId("m1_b_ledger_account_owner_reference", {
        ownerType: "obligation",
        ownerId: "obligation_human_candidate"
      }),
      accountAssetId: assetId,
      accountType: creditAccountType,
      accountNormalSide: normalSide[creditAccountType],
      accountStatus: "active",
      canonicalAccountVerified: true,
      direction: "credit",
      amountMinor: "1000000",
      postedAt: occurredAt,
      schemaVersion: "ledger_entry.v1"
    }
  ];
  };
  const humanPrincipalLedgerEntries = humanLedgerEntries({
    prefix: "human_principal",
    occurredAt: humanOperationTimes[2],
    debitAccountType: "principal_receivable",
    creditAccountType: "sandbox_funding_source"
  });
  const humanRepaymentLedgerEntries = humanLedgerEntries({
    prefix: "human_repayment",
    occurredAt: humanOperationTimes[3],
    debitAccountType: "repayment_clearing",
    creditAccountType: "principal_receivable"
  });
  const humanLedgerTransaction = ({
    ledgerTransactionId,
    transactionHash,
    transactionType,
    referenceType,
    referenceId,
    metadataHash,
    postedAt,
    entries
  }) => ({
    ledgerTransactionId,
    transactionHash,
    transactionType,
    assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
    referenceType,
    referenceId,
    metadataHash,
    canonicalSourceVerified: true,
    idempotencyKeyIncluded: false,
    metadataIncluded: false,
    debitTotalMinor: "1000000",
    creditTotalMinor: "1000000",
    entryCount: 2,
    postedAt,
    schemaVersion: "ledger_transaction.v1",
    entriesManifestHash: projectionHash(entries),
    entries
  });
  const humanEconomicReadBack = {
    schemaVersion: "m1_b_human_economic_read_back.v1",
    obligationId: "obligation_human_candidate",
    repaymentRowCount: 1,
    repaymentPostedEventCount: 1,
    obligation: {
      obligationHash: `0x${"6".repeat(64)}`,
      subjectId: "subject_human_candidate",
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      originalPrincipalMinor: "1000000",
      outstandingPrincipalMinor: "0",
      repaidPrincipalMinor: "1000000",
      accruedInterestMinor: "0",
      outstandingInterestMinor: "0",
      accruedFeesMinor: "0",
      outstandingFeesMinor: "0",
      totalRepaidMinor: "1000000",
      installmentCount: 1,
      scheduleVersion: "obligation_schedule.v1",
      scheduleHash: `0x${"7".repeat(64)}`,
      scheduleSequence: 1,
      executionStatus: "executed",
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_candidate",
      executedAt: humanOperationTimes[2],
      status: "fully_repaid",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "obligation.v2"
    },
    installmentSummary: {
      installmentCount: 1,
      paidInstallmentCount: 1,
      scheduledPrincipalMinor: "1000000",
      scheduledInterestMinor: "0",
      scheduledFeeMinor: "0",
      paidPrincipalMinor: "1000000",
      paidInterestMinor: "0",
      paidFeeMinor: "0",
      paidTotalMinor: "1000000",
      currentStateManifestHash: projectionHash([{
        installmentNumber: 1,
        scheduledPrincipalMinor: "1000000",
        paidPrincipalMinor: "1000000",
        status: "paid"
      }]),
      allPaid: true,
      installmentIdsIncluded: false
    },
    executionReceipt: {
      sandboxExecutionReceiptId: "sandbox_execution_receipt_human_candidate",
      receiptHash: `0x${"4".repeat(64)}`,
      obligationId: "obligation_human_candidate",
      subjectId: "subject_human_candidate",
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      amountMinor: "1000000",
      adapterId: "signed_non_redeemable",
      adapterVersion: "signed_non_redeemable.v1",
      adapterKeyId: `0x${"5".repeat(64)}`,
      adapterMessageHash: `0x${"6".repeat(64)}`,
      adapterIssuedAt: humanOperationTimes[2],
      executedAt: humanOperationTimes[2],
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "sandbox_execution_receipt.v1"
    },
    repayment: {
      repaymentId: "repayment_human_candidate",
      repaymentHash: `0x${"5".repeat(64)}`,
      obligationId: "obligation_human_candidate",
      subjectId: "subject_human_candidate",
      assetId: "eip155:84532/erc20:0x0000000000000000000000000000000000000001",
      requestedMinor: "1000000",
      appliedMinor: "1000000",
      appliedFeeMinor: "0",
      appliedInterestMinor: "0",
      appliedPrincipalMinor: "1000000",
      surplusMinor: "0",
      remainingPrincipalMinor: "0",
      remainingInterestMinor: "0",
      remainingFeesMinor: "0",
      sourceCode: "synthetic_wallet",
      actorHash: hashId("actor", humanActorId),
      accruedInterestMinor: "0",
      accrualDays: 0,
      ledgerTransactionId: "ledger_transaction_human_repayment",
      interestLedgerTransactionId: null,
      occurredAt: humanOperationTimes[3],
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "repayment.v2"
    },
    principalLedgerTransaction: humanLedgerTransaction({
      ledgerTransactionId: "ledger_transaction_human_candidate",
      transactionHash: `0x${"8".repeat(64)}`,
      transactionType: "sandbox_credit_execution",
      referenceType: "sandbox_execution_receipt",
      referenceId: "sandbox_execution_receipt_human_candidate",
      metadataHash: hashId("ledger_metadata", {
        obligationId: "obligation_human_candidate",
        receiptHash: `0x${"4".repeat(64)}`,
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false
      }),
      postedAt: humanOperationTimes[2],
      entries: humanPrincipalLedgerEntries
    }),
    repaymentLedgerTransaction: humanLedgerTransaction({
      ledgerTransactionId: "ledger_transaction_human_repayment",
      transactionHash: `0x${"9".repeat(64)}`,
      transactionType: "sandbox_repayment",
      referenceType: "repayment",
      referenceId: "repayment_human_candidate",
      metadataHash: hashId("ledger_metadata", {
        repaymentHash: `0x${"5".repeat(64)}`,
        sourceCode: "synthetic_wallet",
        appliedFeeMinor: "0",
        appliedInterestMinor: "0",
        appliedPrincipalMinor: "1000000",
        surplusMinor: "0",
        sandboxOnly: true,
        productionFundsMoved: false
      }),
      postedAt: humanOperationTimes[3],
      entries: humanRepaymentLedgerEntries
    }),
    interestLedgerTransaction: null
  };
  const cpSelfResponseProjection = {
    capitalPartnerId: "capital_partner_candidate",
    resourceType: "capital_partner_profile",
    resourceId: "capital_partner_candidate",
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_self_view.v1"
  };
  const cpInboxResponseProjection = ({
    artifactId,
    artifactHash,
    creditIntentId
  }) => ({
    items: [{
      artifactId,
      artifactHash,
      artifactVersion: 1,
      creditIntentId,
      claimCount: 3,
      purpose: "private_credit_review",
      issuedAt: CANDIDATE_ACTIVITY_TIME,
      expiresAt: "2026-08-14T11:31:00.000Z"
    }],
    count: 1,
    hasMore: false,
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
  });
  const cpPreparationLineage = ({
    suffix,
    consentId,
    identityReferenceId,
    creditIntentId,
    riskDecisionId,
    preliminaryOfferId,
    passportArtifactId,
    times,
    windowStartedAt,
    observedAt
  }) => {
    const subjectId = "subject_human_candidate";
    const correlationId = `correlation-cp-preparation-${suffix}`;
    const commandSpecs = [
      {
        operationId: "pilotCreateConsent",
        requestId: `request-cp-preparation-${suffix}-consent`,
        resourceType: "subject",
        resourceId: subjectId,
        responseSchemaVersion: "tenant_consent_created.v1",
        responseProjection: {
          subjectId,
          consent: {
            consentId,
            consentHash: `0x${"1".repeat(64)}`,
            termsHash: `0x${"2".repeat(64)}`,
            dataUsageHash: `0x${"3".repeat(64)}`,
            subjectId,
            principalId: "principal_human_candidate",
            status: "active",
            expiresAt: "2026-11-13T11:30:00.000Z",
            sandboxOnly: true,
            productionAuthority: false,
            schemaVersion: "consent_record.v1"
          },
          schemaVersion: "tenant_consent_created.v1"
        },
        events: [["consent_recorded", "consent", consentId, 1]]
      },
      {
        operationId: "pilotRequestCredit",
        requestId: `request-cp-preparation-${suffix}-request`,
        resourceType: "subject",
        resourceId: subjectId,
        responseSchemaVersion: "tenant_credit_intent_created.v1",
        responseProjection: {
          creditIntent: {
            creditIntentId,
            creditIntentHash: `0x${"4".repeat(64)}`,
            subjectId,
            principalId: "principal_human_candidate",
            authorityType: "consent",
            authorityRef: consentId,
            status: "pending",
            sandboxOnly: true,
            productionFundsRequested: false,
            schemaVersion: "credit_intent.v1"
          },
          schemaVersion: "tenant_credit_intent_created.v1"
        },
        events: [["credit_intent_created", "credit_intent", creditIntentId, 1]]
      },
      {
        operationId: "pilotEvaluateCreditApplication",
        requestId: `request-cp-preparation-${suffix}-evaluate`,
        resourceType: "credit_intent",
        resourceId: creditIntentId,
        responseSchemaVersion: "tenant_credit_application_evaluated.v2",
        responseProjection: {
          creditIntent: {
            creditIntentId,
            creditIntentHash: `0x${"4".repeat(64)}`,
            subjectId,
            status: "decided",
            schemaVersion: "credit_intent.v1"
          },
          decision: {
            riskDecisionId,
            decisionHash: `0x${"5".repeat(64)}`,
            creditIntentId,
            status: "approved",
            featureSnapshotHash: `0x${"6".repeat(64)}`,
            decisionPassportHash: `0x${"7".repeat(64)}`,
            sandboxOnly: true,
            productionAuthority: false,
            schemaVersion: "risk_decision.v3"
          },
          offer: {
            creditOfferId: preliminaryOfferId,
            creditOfferHash: `0x${"8".repeat(64)}`,
            termsHash: `0x${"9".repeat(64)}`,
            creditIntentId,
            subjectId,
            riskDecisionId,
            status: "offered",
            validUntil: "2026-08-14T11:30:00.000Z",
            sandboxOnly: true,
            productionFundsApproved: false,
            schemaVersion: "credit_offer.v1"
          },
          schemaVersion: "tenant_credit_application_evaluated.v2"
        },
        events: [
          ["credit_intent_status_changed", "credit_intent", creditIntentId, 2],
          ["risk_decision_created", "risk_decision", riskDecisionId, 1],
          ["credit_offer_created", "credit_offer", preliminaryOfferId, 1]
        ]
      },
      {
        operationId: "pilotCreateCreditPassportArtifact",
        requestId: `request-cp-preparation-${suffix}-passport`,
        resourceType: "subject",
        resourceId: subjectId,
        responseSchemaVersion: "tenant_credit_passport_artifact_created.v1",
        responseProjection: {
          artifact: {
            creditPassportArtifactId: passportArtifactId,
            artifactHash: suffix === "current"
              ? `0x${"a".repeat(64)}`
              : `0x${"f".repeat(64)}`,
            version: 1,
            sourceRiskDecisionId: riskDecisionId,
            sourceDecisionHash: `0x${"5".repeat(64)}`,
            sourceDecisionPassportHash: `0x${"7".repeat(64)}`,
            sourceFeatureSnapshotHash: `0x${"6".repeat(64)}`,
            subjectId,
            purpose: "private_credit_review",
            claimManifestHash: `0x${"b".repeat(64)}`,
            issuedAt: times[5],
            expiresAt: "2026-08-14T11:30:00.000Z",
            status: "active",
            onlineVerificationRequired: true,
            sameTenantOnly: true,
            pointInTime: true,
            nonAuthorizing: true,
            sandboxOnly: true,
            productionAuthority: false,
            piiIncluded: false,
            rawTransactionDataIncluded: false,
            scoreAuthoritative: false,
            schemaVersion: "credit_passport_artifact.v1"
          },
          replaced: false,
          schemaVersion: "tenant_credit_passport_artifact_created.v1"
        },
        events: [[
          "credit_passport_artifact_issued",
          "credit_passport_artifact",
          passportArtifactId,
          1
        ]]
      }
    ];
    const commandTimes = [times[0], times[2], times[4], times[5]];
    const commandReceipts = commandSpecs.map((spec, commandIndex) => {
      const events = spec.events.map(([
        eventType,
        aggregateType,
        aggregateId,
        aggregateVersion
      ], sequence) => durableEvent({
        sequence,
        eventId: `event-cp-preparation-${suffix}-${commandIndex}-${sequence}`,
        eventType,
        aggregateType,
        aggregateId,
        aggregateVersion,
        requestId: spec.requestId,
        correlationId,
        digit: String((commandIndex + sequence + 1) % 10),
        occurredAt: commandTimes[commandIndex]
      }));
      return {
        ...commandReceipt({
          operationId: spec.operationId,
          requestId: spec.requestId,
          correlationId,
          resourceType: spec.resourceType,
          resourceId: spec.resourceId,
          suffix: `cp_preparation_${suffix}_${commandIndex}`,
          events,
          digit: String(commandIndex + 1),
          actorRefHash: humanActorRefHash,
          occurredAt: commandTimes[commandIndex],
          responseSchemaVersion: spec.responseSchemaVersion,
          responseProjection: spec.responseProjection
        }),
        capturedResponseHashVerified: false,
        responseProvenance: "durable_postgresql_response_recovery"
      };
    });
    const queryAuthorizationObservations = [
      [
        "pilotReadHumanSelf",
        `request-cp-preparation-${suffix}-self`,
        "subject",
        subjectId,
        times[1]
      ],
      [
        "pilotReadCreditApplication",
        `request-cp-preparation-${suffix}-application`,
        "credit_intent",
        creditIntentId,
        times[3]
      ]
    ].map(([operationId, requestId, resourceType, resourceId, occurredAt], index) => {
      const proof = queryProof({
        operationId,
        requestId,
        correlationId,
        responseSchemaVersion: `tenant_cp_preparation_query_${index}.v1`,
        resourceType,
        resourceId,
        suffix: `cp_preparation_${suffix}_query_${index}`,
        responseProjection: { schemaVersion: `tenant_cp_preparation_query_${index}.v1` },
        actorRefHash: humanActorRefHash,
        occurredAt
      });
      return {
        operationId,
        requestId,
        correlationId,
        resourceType,
        resourceId,
        responseDurability: "not_persisted_query_authorization_only",
        occurredAt,
        authorizationAudits: proof.authorizationAudits
      };
    });
    const identityReferenceEvent = durableEvent({
      sequence: 0,
      eventId: `event-cp-preparation-${suffix}-identity`,
      eventType: "identity_reference_recorded",
      aggregateType: "human_identity_reference",
      aggregateId: identityReferenceId,
      aggregateVersion: 1,
      requestId: commandSpecs[0].requestId,
      correlationId,
      digit: "7",
      occurredAt: times[0]
    });
    const events = [
      identityReferenceEvent,
      ...commandReceipts.flatMap(({ eventManifest }) => eventManifest)
    ];
    const eventFor = (entityType, entityId) => events.find((event) => (
      event.aggregateType === entityType && event.aggregateId === entityId
    ));
    const projections = [
      projectionProof({
        entityType: "human_identity_reference",
        entityId: identityReferenceId,
        entityHash: `0x${"c".repeat(64)}`,
        aggregateVersion: 1,
        sourceEvent: identityReferenceEvent
      }),
      projectionProof({
        entityType: "consent_record",
        entityId: consentId,
        entityHash: `0x${"1".repeat(64)}`,
        aggregateVersion: 1,
        sourceEvent: eventFor("consent", consentId)
      }),
      projectionProof({
        entityType: "credit_intent",
        entityId: creditIntentId,
        entityHash: `0x${"4".repeat(64)}`,
        aggregateVersion: 2,
        sourceEvent: commandReceipts[2].eventManifest[0]
      }),
      projectionProof({
        entityType: "risk_decision",
        entityId: riskDecisionId,
        entityHash: `0x${"5".repeat(64)}`,
        aggregateVersion: 1,
        sourceEvent: eventFor("risk_decision", riskDecisionId)
      }),
      projectionProof({
        entityType: "credit_offer",
        entityId: preliminaryOfferId,
        entityHash: `0x${"8".repeat(64)}`,
        aggregateVersion: 1,
        sourceEvent: eventFor("credit_offer", preliminaryOfferId)
      }),
      projectionProof({
        entityType: "credit_passport_artifact",
        entityId: passportArtifactId,
        entityHash: suffix === "current"
          ? `0x${"a".repeat(64)}`
          : `0x${"f".repeat(64)}`,
        aggregateVersion: 1,
        sourceEvent: eventFor("credit_passport_artifact", passportArtifactId)
      })
    ];
    return {
      schemaVersion: "m1_b_capital_partner_lineage_preparation.v1",
      provenance: "normal_human_ui_durable_postgresql_reconciliation",
      windowStartedAt,
      observedAt,
      subjectId,
      consentId,
      identityReferenceId,
      creditIntentId,
      riskDecisionId,
      preliminaryOfferId,
      passportArtifactId,
      retainedSubjectCommand: humanOriginCommands[0],
      commandReceipts,
      queryAuthorizationObservations,
      identityReferenceProof: {
        identityReferenceId,
        identityReferenceHash: `0x${"c".repeat(64)}`,
        referenceEvidenceHash: identityReferenceEvent.evidenceHash,
        projectionProof: projections[0]
      },
      resourceScopes: [
        ["subject", subjectId],
        ["consent", consentId],
        ["credit_intent", creditIntentId],
        ["credit_passport_artifact", passportArtifactId]
      ].map(([resourceType, resourceId]) => ({
        resourceType,
        resourceId,
        resourceStatus: "active",
        resourceVersion: 1,
        bindingRelationship: "owner",
        bindingStatus: "active",
        bindingVersion: 1,
        actorRefHash: humanActorRefHash
      })),
      projectionReadBack: projections,
      events,
      responseBoundary: {
        rawResponsesPersisted: false,
        passportSelectedClaimsPersisted: false,
        passportDisclosuresPersisted: false,
        passportIssuerPersisted: false,
        durableResponseHashesRecomputed: true
      }
    };
  };
  const cpCurrentPreparation = cpPreparationLineage({
    suffix: "current",
    consentId: "consent_cp_current",
    identityReferenceId: "identity_reference_cp_current",
    creditIntentId: "credit_intent_cp_current",
    riskDecisionId: "risk_decision_cp_current",
    preliminaryOfferId: "credit_offer_cp_preliminary",
    passportArtifactId: "credit_passport_cp_current",
    times: [
      "2026-08-13T11:32:20.000Z",
      "2026-08-13T11:32:30.000Z",
      "2026-08-13T11:32:40.000Z",
      "2026-08-13T11:32:50.000Z",
      "2026-08-13T11:33:00.000Z",
      "2026-08-13T11:33:10.000Z"
    ],
    windowStartedAt: "2026-08-13T11:32:00.000Z",
    observedAt: "2026-08-13T11:33:20.000Z"
  });
  const cpWithdrawalPreparation = cpPreparationLineage({
    suffix: "withdrawal",
    consentId: "consent_cp_withdrawal",
    identityReferenceId: "identity_reference_cp_withdrawal",
    creditIntentId: "credit_intent_cp_withdrawal",
    riskDecisionId: "risk_decision_cp_withdrawal",
    preliminaryOfferId: "credit_offer_cp_withdrawal_preliminary",
    passportArtifactId: "credit_passport_cp_withdrawal",
    times: [
      "2026-08-13T11:34:50.000Z",
      "2026-08-13T11:35:00.000Z",
      "2026-08-13T11:35:10.000Z",
      "2026-08-13T11:35:20.000Z",
      "2026-08-13T11:35:30.000Z",
      "2026-08-13T11:35:40.000Z"
    ],
    windowStartedAt: cpOperationTimes[4],
    observedAt: "2026-08-13T11:35:50.000Z"
  });
  const releaseIdentityDocument = {
    schemaVersion: "m1_b_local_release_identity.v1",
    releaseId: SHA,
    imageRevision: SHA,
    pilotRevision: SHA,
    workerRevision: SHA,
    postgresBacked: true,
    fixtureHost: false
  };
  const releaseIdentityArtifactSha256 = createHash("sha256")
    .update(`${JSON.stringify(releaseIdentityDocument)}\n`)
    .digest("hex");
  const documents = {
    release_identity: releaseIdentityDocument,
    before: {
      schemaVersion: "local_agent_reference_acceptance.v1",
      status: "passed",
      acceptanceMode: "before_restart_executed",
      acceptancePhase: "before_restart",
      ...acceptanceLinkage,
      databaseStartedAt: beforeTime,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    application: {
      schemaVersion: "agent_credit_offer_workflow_receipt.v1",
      status: "offer_ready",
      transportProfile: "mcp_stdio_local",
      subjectId: linkage.subjectId,
      mandateId: linkage.mandateId,
      creditIntent: { creditIntentId: linkage.creditIntentId },
      offer: { creditOfferId: linkage.creditOfferId },
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsApproved: false,
      fundsAuthority: false,
      credentialsIncluded: false,
      publicEndpointEnabled: false,
      remoteMcpEnabled: false,
      steps: [
        ["ipo_one_read_self", "pilotReadAgentSelf", "tenant_agent_subject_view.v2"],
        ["ipo_one_request_credit", "pilotRequestCredit", "tenant_credit_intent_created.v1"],
        ["ipo_one_read_credit_application", "pilotReadCreditApplication", "tenant_credit_application_view.v2"],
        ["ipo_one_evaluate_credit_application", "pilotEvaluateCreditApplication", "tenant_credit_application_evaluated.v2"]
      ].map(([tool, operationId, responseSchemaVersion], index) => ({
        sequence: index + 1,
        tool,
        operationId,
        requestId: `request-application-${index + 1}`,
        replayed: false,
        responseSchemaVersion
      }))
    },
    runtime: {
      schemaVersion: "local_agent_mcp_transport_receipt.v1",
      status: "evidence_read",
      transportProfile: "mcp_stdio_local",
      registryVersion: "agent_mcp_registry.v2",
      obligationId: linkage.obligationId,
      providerTarget: {
        providerId: "provider_gateway_compute",
        providerCategory: "compute"
      },
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      fundsAuthority: false,
      credentialsIncluded: false,
      remoteMcpEnabled: false,
      steps: [
        ["pilotAcceptCreditOffer", "ipo_one_accept_credit_offer", "tenant_credit_offer_accepted.v1"],
        ["pilotExecuteSandboxObligation", "ipo_one_execute_sandbox_obligation", "tenant_sandbox_obligation_executed.v1"],
        ["pilotPostSandboxRepayment", "ipo_one_post_sandbox_repayment", "tenant_sandbox_repayment_posted.v1"],
        ["pilotReadOwnObligationEvidence", "ipo_one_read_obligation_evidence", "tenant_owned_obligation_evidence_view.v1"]
      ].map(([operationId, tool, responseSchemaVersion], index) => ({
        sequence: index + 1,
        operationId,
        tool,
        requestId: `request-runtime-${index + 1}`,
        replayed: false,
        responseSchemaVersion
      }))
    },
    after: {
      schemaVersion: "local_agent_reference_acceptance.v1",
      status: "passed",
      acceptanceMode: "after_restart_recovered",
      acceptancePhase: "after_restart",
      ...acceptanceLinkage,
      databaseStartedAt: afterTime,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    recovery: {
      schemaVersion: "local_agent_reference_recovery_receipt.v1",
      status: "recovered",
      subjectId: linkage.subjectId,
      mandateId: linkage.mandateId,
      creditIntentId: linkage.creditIntentId,
      creditOfferId: linkage.creditOfferId,
      obligationId: linkage.obligationId,
      facilityId: linkage.facilityId,
      creditLineId: linkage.creditLineId,
      serverTruth: true,
      canonicalLifecycleReadOnly: true,
      lifecycleMutationPerformed: false,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    human: {
      schemaVersion: "m1_b_human_critical_receipt.v1",
      candidateReleaseId: SHA,
      sourceRuntime: "local_exact_commit",
      capturedAt: "2026-08-13T11:32:00.000Z",
      databaseStartedAt: afterTime,
      postRestartVerification: true,
      role: "human",
      status: "passed",
      authentication: safeSiweAuthentication({
        actorRefHash: humanActorRefHash,
        requestIds: [
          "request-human-operation-2",
          "request-human-operation-3",
          "request-human-operation-4",
          "request-human-operation-5",
          "request-human-recovery"
        ],
        auditEventIds: [
          "auth_event_human_2_1",
          "auth_event_human_2_2",
          "auth_event_human_3_1",
          "auth_event_human_3_2",
          "auth_event_human_4_1",
          "auth_event_human_4_2",
          "auth_event_human_evidence_1",
          "auth_event_human_evidence_2",
          "auth_event_human_recovery_1",
          "auth_event_human_recovery_2"
        ],
        occurredAt: humanOperationTimes[0]
      }),
      actorScope: {
        actorRefHash: humanActorRefHash,
        invitationOnly: true,
        sameTenantOnly: true,
        resources: [
          ["subject", "subject_human_candidate"],
          ["consent", "consent_human_candidate"],
          ["credit_intent", "credit_intent_human_candidate"],
          ["credit_offer", "credit_offer_human_current"],
          ["obligation", "obligation_human_candidate"],
          ["evidence", "obligation_human_candidate"]
        ].map(([resourceType, resourceId]) => ({
          resourceType,
          resourceId,
          resourceStatus: "active",
          resourceVersion: 1,
          bindingRelationship: "owner",
          bindingStatus: "active",
          bindingVersion: 1,
          actorRefHash: humanActorRefHash
        }))
      },
      originLineage: {
        provenance: "retained_postgresql_lineage",
        sourceRelation: "preexisting_state_revalidated_by_exact_candidate",
        createdUnderExactCandidate: false,
        postRestartProjectionReadBack: true,
        subjectId: "subject_human_candidate",
        consentId: "consent_human_candidate",
        identityReferenceId: "identity_reference_human_candidate",
        creditIntentId: "credit_intent_human_candidate",
        riskDecisionId: "risk_decision_human_candidate",
        creditOfferId: "credit_offer_human_current",
        commandReceipts: humanOriginCommands,
        identityReferenceProof: {
          identityReferenceId: "identity_reference_human_candidate",
          identityReferenceHash: `0x${"6".repeat(64)}`,
          referenceEvidenceHash: `0x${"7".repeat(64)}`,
          aggregateVersion: 1,
          projectionProof: humanIdentityProjection,
          decisionBinding: {
            riskDecisionId: "risk_decision_human_candidate",
            decisionHash: `0x${"8".repeat(64)}`,
            riskFeatureSnapshotId: "risk_feature_snapshot_human_candidate",
            featureSnapshotHash: `0x${"9".repeat(64)}`,
            computedFeatureSnapshotHash: `0x${"9".repeat(64)}`,
            riskDecisionPassportId: "risk_decision_passport_human_candidate",
            decisionPassportHash: `0x${"a".repeat(64)}`,
            sourceEvidence: {
              role: "human_identity_reference",
              entityType: "human_identity_reference",
              entityIdHash: hashId("risk_source_entity", {
                entityType: "human_identity_reference",
                entityId: "identity_reference_human_candidate"
              }),
              aggregateVersion: 1,
              entityHash: `0x${"6".repeat(64)}`,
              evidenceHash: humanIdentityProjection.sourceEvidenceHash,
              sourceFinality: "finalized"
            }
          }
        }
      },
      linkage: {
        subjectId: "subject_human_candidate",
        consentId: "consent_human_candidate",
        identityReferenceId: "identity_reference_human_candidate",
        creditIntentId: "credit_intent_human_candidate",
        riskDecisionId: "risk_decision_human_candidate",
        creditOfferId: "credit_offer_human_current",
        creditOfferHash: `0x${"2".repeat(64)}`,
        termsHash: `0x${"3".repeat(64)}`,
        offerSchemaVersion: "credit_offer.v1",
        offerAggregateVersion: 1,
        creditOfferAcceptanceId: "credit_offer_acceptance_human_candidate",
        obligationId: "obligation_human_candidate",
        sandboxExecutionReceiptId: "sandbox_execution_receipt_human_candidate",
        executionReceiptHash: `0x${"4".repeat(64)}`,
        principalLedgerTransactionId: "ledger_transaction_human_candidate",
        repaymentId: "repayment_human_candidate",
        repaymentHash: `0x${"5".repeat(64)}`
      },
      recovery: {
        operationId: "pilotReadWorkspaceResume",
        requestId: "request-human-recovery",
        correlationId: "correlation-human-recovery",
        responseSchemaVersion: "tenant_workspace_resume_view.v2",
        recoverySchemaVersion: "human_offer_review_recovery.v1",
        creditOfferId: "credit_offer_human_current",
        creditOfferHash: `0x${"2".repeat(64)}`,
        termsHash: `0x${"3".repeat(64)}`,
        offerSchemaVersion: "credit_offer.v1",
        offerAggregateVersion: 1,
        serverTruth: true,
        queryProof: queryProof({
          operationId: "pilotReadWorkspaceResume",
          requestId: "request-human-recovery",
          correlationId: "correlation-human-recovery",
          responseSchemaVersion: "tenant_workspace_resume_view.v2",
          resourceType: "workspace",
          resourceId: "workspace_human",
          suffix: "human_recovery",
          responseProjection: humanWorkspaceResponseProjection,
          actorRefHash: humanActorRefHash,
          occurredAt: humanOperationTimes[0]
        }),
        offerProjectionProof: humanOfferRecoveryProjection
      },
      operations: [
        ["pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2", false],
        ["pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1", true],
        ["pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1", true],
        ["pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1", true],
        ["pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1", false]
      ].map(([operationId, responseSchemaVersion, command], index) => {
        const requestId = index === 0
          ? "request-human-recovery"
          : `request-human-operation-${index + 1}`;
        const correlationId = index === 0
          ? "correlation-human-recovery"
          : "correlation-human-lifecycle";
        const commandProof = command ? humanLifecycleCommands[index - 1] : null;
        const query = command ? null : queryProof({
          operationId,
          requestId,
          correlationId,
          responseSchemaVersion,
          resourceType: index === 0 ? "workspace" : "evidence",
          resourceId: index === 0 ? "workspace_human" : "obligation_human_candidate",
          suffix: index === 0 ? "human_recovery" : "human_evidence",
          responseProjection: index === 0
            ? humanWorkspaceResponseProjection
            : {
                obligationId: "obligation_human_candidate",
                orderedEvidenceIds: humanEvidenceIds,
                hasMore: false,
                nextCursor: null,
                schemaVersion: "tenant_owned_obligation_evidence_view.v1"
              },
          actorRefHash: humanActorRefHash,
          occurredAt: humanOperationTimes[index]
        });
        return {
          sequence: index + 1,
          operationId,
          requestId,
          correlationId,
          responseSchemaVersion,
          authorizationAuditEventId: commandProof?.authorizationAuditEventId ?? null,
          authorizationDecisionId: commandProof?.authorizationDecisionId ?? null,
          occurredAt: humanOperationTimes[index],
          queryProof: query,
          commandReceipt: commandProof
        };
      }),
      durability: {
        canonicalPersistence: "postgresql",
        rlsReadBack: true,
        authorizationAuditImmutable: true,
        tenantCommandExecutionsImmutable: true,
        fixtureUsed: false,
        events: humanEvents,
        projectionReadBack: [
          humanIdentityProjection,
          humanOfferRecoveryProjection,
          projectionProof({
            entityType: "credit_offer",
            entityId: "credit_offer_human_current",
            entityHash: `0x${"b".repeat(64)}`,
            aggregateVersion: 2,
            sourceEvent: humanEvent("event_human_accept")
          }),
          projectionProof({
            entityType: "obligation",
            entityId: "obligation_human_candidate",
            entityHash: `0x${"c".repeat(64)}`,
            aggregateVersion: 6,
            sourceEvent: humanEvent("event_human_repayment")
          })
        ],
        evidenceCompleteness: {
          responseSchemaVersion: "tenant_owned_obligation_evidence_view.v1",
          responseProvenance: "runtime_response_capture_db_reconciled",
          pageCount: 1,
          finalHasMore: false,
          orderedEvidenceIds: humanEvidenceIds,
          orderedEvidenceHash: humanEvidenceManifestHash,
          databaseEvidenceCount: 8,
          databaseEvidenceManifestHash: humanEvidenceManifestHash
        },
        economicReadBack: humanEconomicReadBack
      },
      safety: {
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        fundsAuthority: false
      },
      redaction: {
        containsSecrets: false,
        containsRawPii: false,
        containsSessionMaterial: false,
        containsRawSignature: false,
        containsWalletAddress: false,
        containsDatabaseCredentials: false
      }
    },
    capital_partner: {
      schemaVersion: "m1_b_capital_partner_critical_receipt.v1",
      candidateReleaseId: SHA,
      sourceRuntime: "local_exact_commit",
      capturedAt: "2026-08-13T11:37:00.000Z",
      databaseStartedAt: afterTime,
      postRestartVerification: true,
      role: "capital_partner",
      status: "passed",
      authentication: {
        capitalPartner: safeSiweAuthentication({
          actorRefHash: `0x${"2".repeat(64)}`,
          requestIds: [
            "request-cp-command-current-0",
            "request-cp-command-withdrawal-1",
            "request-cp-command-withdrawal-2",
            "request-cp-inbox-current",
            "request-cp-inbox-withdrawal",
            "request-cp-self"
          ],
          auditEventIds: [
            "auth_event_cp_command_current_0_1",
            "auth_event_cp_command_current_0_2",
            "auth_event_cp_command_withdrawal_1_1",
            "auth_event_cp_command_withdrawal_1_2",
            "auth_event_cp_command_withdrawal_2_1",
            "auth_event_cp_command_withdrawal_2_2",
            "auth_event_cp_inbox_current_1",
            "auth_event_cp_inbox_current_2",
            "auth_event_cp_inbox_withdrawal_1",
            "auth_event_cp_inbox_withdrawal_2",
            "auth_event_cp_self_1",
            "auth_event_cp_self_2"
          ],
          occurredAt: cpOperationTimes[0]
        }),
        borrower: safeSiweAuthentication({
          actorRefHash: humanActorRefHash,
          requestIds: [
            ...cpCurrentPreparation.commandReceipts.map(({ requestId }) => requestId),
            ...cpCurrentPreparation.queryAuthorizationObservations.map(
              ({ requestId }) => requestId
            ),
            ...cpWithdrawalPreparation.commandReceipts.map(({ requestId }) => requestId),
            ...cpWithdrawalPreparation.queryAuthorizationObservations.map(
              ({ requestId }) => requestId
            ),
            "request-cp-borrower-recovery",
            "request-cp-denial-stale",
            "request-cp-denial-withdrawn",
            "request-cp-withdrawal-recovery"
          ],
          auditEventIds: [
            ...cpCurrentPreparation.commandReceipts.flatMap(
              ({ authorizationAudits }) => authorizationAudits.map(({ eventId }) => eventId)
            ),
            ...cpCurrentPreparation.queryAuthorizationObservations.flatMap(
              ({ authorizationAudits }) => authorizationAudits.map(({ eventId }) => eventId)
            ),
            ...cpWithdrawalPreparation.commandReceipts.flatMap(
              ({ authorizationAudits }) => authorizationAudits.map(({ eventId }) => eventId)
            ),
            ...cpWithdrawalPreparation.queryAuthorizationObservations.flatMap(
              ({ authorizationAudits }) => authorizationAudits.map(({ eventId }) => eventId)
            ),
            "auth_event_cp_borrower_recovery_1",
            "auth_event_cp_borrower_recovery_2",
            "auth_event_cp_denial_stale",
            "auth_event_cp_denial_withdrawn",
            "auth_event_cp_withdrawal_recovery_1",
            "auth_event_cp_withdrawal_recovery_2"
          ],
          occurredAt: cpOperationTimes[3]
        })
      },
      profile: {
        capitalPartnerId: "capital_partner_candidate",
        operatorActorRefHash: `0x${"2".repeat(64)}`,
        invitationOnly: true,
        sameTenantOnly: true,
        sandboxOnly: true,
        productionFundsAuthority: false,
        resourceStatus: "active",
        resourceVersion: 1,
        bindingStatus: "active",
        bindingVersion: 1,
        bindingRelationship: "owner",
        selfQueryProof: queryProof({
          operationId: "pilotReadCapitalPartnerSelf",
          requestId: "request-cp-self",
          correlationId: "correlation-cp-self",
          responseSchemaVersion: "tenant_capital_partner_self_view.v1",
          resourceType: "workspace",
          resourceId: "workspace_capital_partner",
          suffix: "cp_self",
          responseProjection: cpSelfResponseProjection,
          actorRefHash: `0x${"2".repeat(64)}`,
          occurredAt: cpOperationTimes[0]
        })
      },
      currentLineage: {
        subjectId: "subject_human_candidate",
        borrowerActorRefHash: humanActorRefHash,
        riskDecisionId: "risk_decision_cp_current",
        passport: {
          artifactId: "credit_passport_cp_current",
          artifactHash: `0x${"a".repeat(64)}`,
          artifactVersion: 1,
          creditIntentId: "credit_intent_cp_current",
          purpose: "private_credit_review",
          status: "active",
          resourceStatus: "active",
          resourceVersion: 1,
          bindingStatus: "active",
          bindingVersion: 1,
          bindingRelationship: "verifier",
          bindingActorRefHash: `0x${"2".repeat(64)}`,
          verifierActorRefHash: `0x${"3".repeat(64)}`,
          claimCount: 3,
          onlineVerificationRequired: true,
          sameTenantOnly: true,
          pointInTime: true,
          nonAuthorizing: true,
          sandboxOnly: true,
          productionAuthority: false,
          piiIncluded: false,
          rawTransactionDataIncluded: false,
          scoreAuthoritative: false,
          inboxQueryProof: queryProof({
            operationId: "pilotReadCapitalPartnerPassportInbox",
            requestId: "request-cp-inbox-current",
            correlationId: "correlation-cp-inbox-current",
            responseSchemaVersion: "tenant_capital_partner_passport_inbox_view.v1",
            resourceType: "workspace",
            resourceId: "workspace_capital_partner",
            suffix: "cp_inbox_current",
            responseProjection: cpInboxResponseProjection({
              artifactId: "credit_passport_cp_current",
              artifactHash: `0x${"a".repeat(64)}`,
              creditIntentId: "credit_intent_cp_current"
            }),
            actorRefHash: `0x${"2".repeat(64)}`,
            occurredAt: cpOperationTimes[1]
          })
        },
        preliminaryOffer: {
          creditOfferId: "credit_offer_cp_preliminary",
          creditOfferHash: `0x${"b".repeat(64)}`,
          termsHash: `0x${"c".repeat(64)}`,
          schemaVersion: "credit_offer.v1",
          aggregateVersion: 2,
          status: "declined"
        },
        authoredOffer: {
          creditOfferId: "credit_offer_cp_current",
          creditOfferHash: `0x${"d".repeat(64)}`,
          termsHash: `0x${"e".repeat(64)}`,
          schemaVersion: "credit_offer.v2",
          aggregateVersion: 1,
          status: "offered"
        },
        replacement: {
          eventId: "event_cp_replacement",
          previousStatus: "offered",
          nextStatus: "declined",
          replacementOfferId: "credit_offer_cp_current",
          reasonCode: "capital_partner_offer_authored",
          eventPayloadProjection: cpCurrentReplacementPayload,
          offeredProjectionProof: cpPreliminaryOfferedProjection,
          declinedProjectionProof: cpPreliminaryDeclinedProjection
        },
        staleOfferDenial: denialProof({
          offerId: "credit_offer_cp_preliminary",
          suffix: "stale",
          occurredAt: cpOperationTimes[3],
          actorRefHash: humanActorRefHash
        }),
        borrowerRecovery: {
          operationId: "pilotReadWorkspaceResume",
          requestId: "request-cp-borrower-recovery",
          correlationId: "correlation-cp-borrower-recovery",
          responseSchemaVersion: "tenant_workspace_resume_view.v2",
          creditOfferId: "credit_offer_cp_current",
          creditOfferHash: `0x${"d".repeat(64)}`,
          termsHash: `0x${"e".repeat(64)}`,
          offerSchemaVersion: "credit_offer.v2",
          offerAggregateVersion: 1,
          serverTruth: true,
          queryProof: queryProof({
            operationId: "pilotReadWorkspaceResume",
            requestId: "request-cp-borrower-recovery",
            correlationId: "correlation-cp-borrower-recovery",
            responseSchemaVersion: "tenant_workspace_resume_view.v2",
            resourceType: "workspace",
            resourceId: "workspace_human_current",
            suffix: "cp_borrower_recovery",
            responseProjection: cpCurrentWorkspaceResponseProjection,
            actorRefHash: humanActorRefHash,
            occurredAt: cpOperationTimes[4]
          }),
          offerProjectionProof: cpCurrentProjection
        }
      },
      withdrawalLineage: {
        subjectId: "subject_human_candidate",
        borrowerActorRefHash: humanActorRefHash,
        riskDecisionId: "risk_decision_cp_withdrawal",
        passport: {
          artifactId: "credit_passport_cp_withdrawal",
          artifactHash: `0x${"f".repeat(64)}`,
          artifactVersion: 1,
          creditIntentId: "credit_intent_cp_withdrawal",
          purpose: "private_credit_review",
          status: "active",
          resourceStatus: "active",
          resourceVersion: 1,
          bindingStatus: "active",
          bindingVersion: 1,
          bindingRelationship: "verifier",
          bindingActorRefHash: `0x${"2".repeat(64)}`,
          verifierActorRefHash: `0x${"4".repeat(64)}`,
          claimCount: 3,
          onlineVerificationRequired: true,
          sameTenantOnly: true,
          pointInTime: true,
          nonAuthorizing: true,
          sandboxOnly: true,
          productionAuthority: false,
          piiIncluded: false,
          rawTransactionDataIncluded: false,
          scoreAuthoritative: false,
          inboxQueryProof: queryProof({
            operationId: "pilotReadCapitalPartnerPassportInbox",
            requestId: "request-cp-inbox-withdrawal",
            correlationId: "correlation-cp-inbox-withdrawal",
            responseSchemaVersion: "tenant_capital_partner_passport_inbox_view.v1",
            resourceType: "workspace",
            resourceId: "workspace_capital_partner",
            suffix: "cp_inbox_withdrawal",
            responseProjection: cpInboxResponseProjection({
              artifactId: "credit_passport_cp_withdrawal",
              artifactHash: `0x${"f".repeat(64)}`,
              creditIntentId: "credit_intent_cp_withdrawal"
            }),
            actorRefHash: `0x${"2".repeat(64)}`,
            occurredAt: cpOperationTimes[5]
          })
        },
        preliminaryOffer: {
          creditOfferId: "credit_offer_cp_withdrawal_preliminary",
          creditOfferHash: `0x${"8".repeat(64)}`,
          termsHash: `0x${"9".repeat(64)}`,
          schemaVersion: "credit_offer.v1",
          aggregateVersion: 2,
          status: "declined"
        },
        authoredOffer: {
          creditOfferId: "credit_offer_cp_withdrawn",
          creditOfferHash: `0x${"1".repeat(64)}`,
          termsHash: `0x${"2".repeat(64)}`,
          schemaVersion: "credit_offer.v2",
          aggregateVersion: 2,
          status: "withdrawn"
        },
        replacement: {
          eventId: "event_cp_withdrawal_replacement",
          previousStatus: "offered",
          nextStatus: "declined",
          replacementOfferId: "credit_offer_cp_withdrawn",
          reasonCode: "capital_partner_offer_authored",
          eventPayloadProjection: cpWithdrawalReplacementPayload,
          offeredProjectionProof: cpWithdrawalPreliminaryOfferedProjection,
          declinedProjectionProof: cpWithdrawalPreliminaryDeclinedProjection
        },
        withdrawal: {
          operationId: "pilotTransitionCapitalPartnerOffer",
          requestId: cpWithdrawalRequestId,
          correlationId: "correlation-cp-withdrawal",
          responseSchemaVersion: "tenant_capital_partner_offer_transitioned.v1",
          eventId: "event_cp_withdrawal",
          previousStatus: "offered",
          nextStatus: "withdrawn",
          eventPayloadProjection: cpWithdrawalPayload,
          authorizationAuditEventId: "auth_event_cp_command_withdrawal_2_2",
          withdrawnProjectionProof: cpWithdrawnProjection
        },
        withdrawnOfferDenial: denialProof({
          offerId: "credit_offer_cp_withdrawn",
          suffix: "withdrawn",
          occurredAt: cpOperationTimes[8],
          actorRefHash: humanActorRefHash
        }),
        borrowerRecovery: {
          operationId: "pilotReadWorkspaceResume",
          requestId: "request-cp-withdrawal-recovery",
          correlationId: "correlation-cp-withdrawal-recovery",
          responseSchemaVersion: "tenant_workspace_resume_view.v2",
          creditOfferId: "credit_offer_cp_current",
          creditOfferHash: `0x${"d".repeat(64)}`,
          termsHash: `0x${"e".repeat(64)}`,
          offerSchemaVersion: "credit_offer.v2",
          offerAggregateVersion: 1,
          serverTruth: true,
          queryProof: queryProof({
            operationId: "pilotReadWorkspaceResume",
            requestId: "request-cp-withdrawal-recovery",
            correlationId: "correlation-cp-withdrawal-recovery",
            responseSchemaVersion: "tenant_workspace_resume_view.v2",
            resourceType: "workspace",
            resourceId: "workspace_human_withdrawal",
            suffix: "cp_withdrawal_recovery",
            responseProjection: cpCurrentWorkspaceResponseProjection,
            actorRefHash: humanActorRefHash,
            occurredAt: cpOperationTimes[9]
          }),
          offerProjectionProof: cpCurrentProjection
        }
      },
      durability: {
        canonicalPersistence: "postgresql",
        rlsReadBack: true,
        authorizationAuditImmutable: true,
        tenantCommandExecutionsImmutable: true,
        fixtureUsed: false,
        commandReceipts: cpCommandReceipts,
        events: cpEvents,
        projectionReadBack: [
          cpPreliminaryDeclinedProjection,
          cpCurrentProjection,
          cpWithdrawalPreliminaryDeclinedProjection,
          cpWithdrawnProjection
        ]
      },
      safety: {
        sandboxOnly: true,
        productionFundsApproved: false,
        fundsAuthority: false
      },
      redaction: {
        containsSecrets: false,
        containsRawPii: false,
        containsSessionMaterial: false,
        containsRawSignature: false,
        containsWalletAddress: false,
        containsDatabaseCredentials: false
      }
    },
    risk: {
      schemaVersion: "m1_b_risk_mfa_boundary_receipt.v2",
      candidateReleaseId: SHA,
      sourceRuntime: "local_exact_commit",
      capturedAt: "2026-08-13T11:31:00.000Z",
      databaseStartedAt: afterTime,
      postRestartVerification: true,
      runtimeBinding: {
        buildSource: "tracked_git_archive",
        imageId: `sha256:${"a".repeat(64)}`,
        longLivedPilotImageMatch: true,
        longLivedWorkerImageMatch: true,
        releaseIdentityArtifactSha256
      },
      role: "risk_operations",
      status: "passed_fail_closed",
      releaseLevel: "L1_PUBLIC_SANDBOX",
      policy: {
        policyVersion: "security_001.v1",
        requiresRecentMfaActorTypesPreserved: true,
        protectedOperationIds: M1_B_RISK_MFA_OPERATION_IDS,
        derivation:
          "authorization_policy_requires_recent_mfa_for_risk_or_operations"
      },
      authorizationRegression: riskAuthorizationRegression(),
      liveRuntimeObservation: {
        provenance: "local_exact_commit_post_restart",
        observationStartedAt: "2026-08-13T11:30:10.000Z",
        actorType: "risk_operator",
        session: {
          actorType: "risk_operator",
          method: "siwe",
          acr: "urn:ipo.one:acr:wallet",
          amr: ["wallet", "siwe", "eip191_eoa_v1"],
          authTime: "2026-08-13T11:30:15.000Z",
          createdAt: "2026-08-13T11:30:30.000Z",
          observedAfterRestart: true,
          phishingResistantMfaSatisfied: false,
          sessionMaterialIncluded: false,
          syntheticMfaClaimUsed: false
        },
        operationIds: M1_B_RISK_MFA_LIVE_OPERATION_IDS,
        mfaDenialAttribution: {
          requiredCapabilities: ["risk.read.tenant", "risk.freeze"],
          roleBindingVerified: true,
          policyBindingVerified: true,
          clientBindingVerified: true,
          sessionCredentialMembershipCapabilitiesVerified: true,
          auditCorrelationBindingVerified: true,
          auditSessionTokenBindingVerified: true
        },
        credentialBoundary: {
          protectedActorTypes: [
            "auditor",
            "operations_operator",
            "risk_operator"
          ],
          activeMembershipCountsByActorType: {
            auditor: 0,
            operations_operator: 0,
            risk_operator: 1
          },
          activeCredentialCount: 1,
          activeAuthenticationMethods: ["siwe"],
          nonSiweActiveCredentialCount: 0,
          reviewedActiveIdentitySetVerified: true
        },
        checks: [
          {
            operationId: "pilotReadTenantRiskPortfolioReference",
            kind: "query",
            resourceType: "workspace",
            resourceId: "resource_pending",
            requestId: "request_m1_b_risk_read_00000000-0000-4000-8000-000000000001",
            correlationId: "correlation_m1_b_risk_00000000-0000-4000-8000-000000000001",
            auditEventId: "authorization_event_00000000-0000-4000-8000-000000000001",
            authorizationDecision: "deny",
            reasonCode: "actor_capability_rejected",
            additionalEffectCount: 0
          },
          {
            operationId: "pilotFreezeSubject",
            kind: "command",
            resourceType: "subject",
            resourceId: "subject_00000000-0000-4000-8000-000000000001",
            requestId: "request_m1_b_risk_freeze_00000000-0000-4000-8000-000000000001",
            correlationId: "correlation_m1_b_risk_00000000-0000-4000-8000-000000000002",
            auditEventId: "authorization_event_00000000-0000-4000-8000-000000000002",
            authorizationDecision: "deny",
            reasonCode: "actor_capability_rejected",
            additionalEffectCount: 0
          }
        ]
      },
      protectedState: {
        catalogVersion: "m1_b_risk_protected_state.v1",
        tableNames: M1_B_RISK_MFA_PROTECTED_STATE_TABLES,
        minimumRowCounts: M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS,
        observedRowCounts: Object.fromEntries(
          Object.entries(M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS).map(
            ([tableName, minimum]) => [tableName, minimum]
          )
        ),
        beforeHash: `0x${"2".repeat(64)}`,
        afterHash: `0x${"2".repeat(64)}`,
        privilegedMutationCount: 0,
        additionalEconomicEffectCount: 0
      },
      exposure: {
        evidenceScope: "local_private_pilot_exact_commit",
        activeRiskAuthenticationMethods: ["siwe"],
        nonSiweActiveRiskCredentialCount: 0,
        hostedRiskSurfaceEvaluated: false
      },
      authority: {
        mfaPolicyWeakened: false,
        privilegedMutationPerformed: false,
        realFundsEnabled: false
      },
      redaction: {
        containsSecrets: false,
        containsRawPii: false,
        containsSessionMaterial: false
      }
    }
  };
  const syncCapitalPartnerHumanReceiptBinding = () => ({
    schemaVersion: "m1_b_human_critical_receipt_binding.v1",
    candidateReleaseId: SHA,
    receiptHash: projectionHash(documents.human),
    capturedAt: documents.human.capturedAt,
    subjectId: documents.human.linkage.subjectId,
    actorRefHash: documents.human.actorScope.actorRefHash
  });
  documents.capital_partner.preparation = {
    schemaVersion: "m1_b_capital_partner_preparation.v1",
    humanReceiptBinding: syncCapitalPartnerHumanReceiptBinding(),
    currentLineage: cpCurrentPreparation,
    withdrawalLineage: cpWithdrawalPreparation
  };
  const artifacts = [];
  for (const [id, document] of Object.entries(documents)) {
    const content = `${JSON.stringify(document)}\n`;
    await writeFile(join(root, `${id}.json`), content);
    artifacts.push({
      id,
      kind: new Set(["application", "runtime"]).has(id)
        ? "agent_mcp_receipt"
        : id === "release_identity"
          ? "release_identity"
          : new Set(["human", "capital_partner"]).has(id)
            ? "postgres_receipt"
          : id === "risk"
            ? "negative_receipt"
            : "runtime_receipt",
      relativePath: `${id}.json`,
      sha256: createHash("sha256").update(content).digest("hex")
    });
  }
  const evidence = {
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
    artifacts,
    riskBoundary: {
      candidateReleaseId: SHA,
      artifactId: "risk"
    },
    runtime: {
      local: {
        releaseIdentityArtifactId: "release_identity",
        humanAcceptance: {
          schemaVersion: "local_human_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId: SHA,
          databaseStartedAt: afterTime,
          subjectId: documents.human.linkage.subjectId,
          consentId: documents.human.linkage.consentId,
          creditIntentId: documents.human.linkage.creditIntentId,
          riskDecisionId: documents.human.linkage.riskDecisionId,
          creditOfferId: documents.human.linkage.creditOfferId,
          creditOfferHash: documents.human.linkage.creditOfferHash,
          termsHash: documents.human.linkage.termsHash,
          offerAggregateVersion: documents.human.linkage.offerAggregateVersion,
          creditOfferAcceptanceId: documents.human.linkage.creditOfferAcceptanceId,
          obligationId: documents.human.linkage.obligationId,
          repaymentId: documents.human.linkage.repaymentId,
          artifactId: "human"
        },
        capitalPartnerAcceptance: {
          schemaVersion: "local_capital_partner_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId: SHA,
          databaseStartedAt: afterTime,
          capitalPartnerId: documents.capital_partner.profile.capitalPartnerId,
          currentLineage: {
            creditIntentId: documents.capital_partner.currentLineage.passport.creditIntentId,
            creditPassportArtifactId:
              documents.capital_partner.currentLineage.passport.artifactId,
            preliminaryOfferId:
              documents.capital_partner.currentLineage.preliminaryOffer.creditOfferId,
            currentOfferId:
              documents.capital_partner.currentLineage.authoredOffer.creditOfferId,
            currentOfferHash:
              documents.capital_partner.currentLineage.authoredOffer.creditOfferHash,
            currentTermsHash:
              documents.capital_partner.currentLineage.authoredOffer.termsHash,
            currentOfferAggregateVersion:
              documents.capital_partner.currentLineage.authoredOffer.aggregateVersion
          },
          withdrawalLineage: {
            creditIntentId:
              documents.capital_partner.withdrawalLineage.passport.creditIntentId,
            creditPassportArtifactId:
              documents.capital_partner.withdrawalLineage.passport.artifactId,
            withdrawnOfferId:
              documents.capital_partner.withdrawalLineage.authoredOffer.creditOfferId
          },
          artifactId: "capital_partner"
        },
        agentAcceptance: {
          ...acceptanceLinkage,
          schemaVersion: "local_agent_release_acceptance_linkage.v1",
          status: "passed",
          beforeRestart: {
            acceptanceMode: "before_restart_executed",
            databaseStartedAt: beforeTime,
            acceptanceArtifactId: "before",
            applicationMcpArtifactId: "application",
            runtimeMcpArtifactId: "runtime"
          },
          afterRestart: {
            acceptanceMode: "after_restart_recovered",
            databaseStartedAt: afterTime,
            acceptanceArtifactId: "after",
            recoveryReceiptArtifactId: "recovery"
          }
        }
      }
    }
  };
  assert.equal(
    await verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    true
  );
  const assertCriticalReceiptInvalid = async (documentName, fragment) => {
    await writeFile(
      join(root, `${documentName}.json`),
      `${JSON.stringify(documents[documentName])}\n`
    );
    await assert.rejects(
      verifyM1BCriticalArtifactContents(evidence, {
        evidenceRoot: root,
        expectedCommitSha: SHA
      }),
      issue(fragment)
    );
  };

  documents.human.originLineage.identityReferenceProof.decisionBinding
    .sourceEvidence.entityIdHash = `0x${"f".repeat(64)}`;
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.originLineage.identityReferenceProof.decisionBinding
    .sourceEvidence.entityIdHash = hashId("risk_source_entity", {
      entityType: "human_identity_reference",
      entityId: documents.human.linkage.identityReferenceId
    });

  documents.human.actorScope.resources[0].actorRefHash = `0x${"e".repeat(64)}`;
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.actorScope.resources[0].actorRefHash =
    documents.human.actorScope.actorRefHash;

  documents.human.durability.evidenceCompleteness.finalHasMore = true;
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.evidenceCompleteness.finalHasMore = false;

  const reorderedEvidenceIds = [...humanEvidenceIds];
  [reorderedEvidenceIds[0], reorderedEvidenceIds[1]] = [
    reorderedEvidenceIds[1],
    reorderedEvidenceIds[0]
  ];
  const selfAdjustedEvidenceHash = projectionHash(reorderedEvidenceIds.map((eventId) => {
    const event = documents.human.durability.events.find((entry) => entry.eventId === eventId);
    return {
      eventId: event.eventId,
      evidenceHash: event.evidenceHash,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      payloadHash: event.payloadHash,
      sourceFinality: event.sourceFinality
    };
  }));
  documents.human.durability.evidenceCompleteness.orderedEvidenceIds = reorderedEvidenceIds;
  documents.human.durability.evidenceCompleteness.orderedEvidenceHash =
    selfAdjustedEvidenceHash;
  documents.human.durability.evidenceCompleteness.databaseEvidenceManifestHash =
    selfAdjustedEvidenceHash;
  documents.human.operations[4].queryProof.responseProjection.orderedEvidenceIds =
    reorderedEvidenceIds;
  documents.human.operations[4].queryProof.responseHash = projectionHash(
    documents.human.operations[4].queryProof.responseProjection
  );
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.evidenceCompleteness.orderedEvidenceIds = humanEvidenceIds;
  documents.human.durability.evidenceCompleteness.orderedEvidenceHash =
    humanEvidenceManifestHash;
  documents.human.durability.evidenceCompleteness.databaseEvidenceManifestHash =
    humanEvidenceManifestHash;
  documents.human.operations[4].queryProof.responseProjection.orderedEvidenceIds =
    humanEvidenceIds;
  documents.human.operations[4].queryProof.responseHash = projectionHash(
    documents.human.operations[4].queryProof.responseProjection
  );

  documents.human.operations[2].commandReceipt.eventManifest[2]
    .payloadProjection.actionConfirmation.confirmationMethod =
      "authenticated_account_click";
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.operations[2].commandReceipt.eventManifest[2]
    .payloadProjection.actionConfirmation.confirmationMethod = "wallet_personal_sign";

  documents.human.authentication.amr[2] = "eip1271_eip191_v1";
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.authentication.amr[2] = "eip191_eoa_v1";

  const repaymentPayload = documents.human.operations[3].commandReceipt
    .eventManifest.at(-1).payloadProjection;
  const repaymentDurableEvent = documents.human.operations[3].commandReceipt
    .eventManifest.at(-1);
  repaymentPayload.requestedMinor = "1000001";
  repaymentPayload.surplusMinor = "1";
  repaymentDurableEvent.payloadHash = hashId("event_payload", repaymentPayload);
  repaymentDurableEvent.evidencePayloadHash = repaymentDurableEvent.payloadHash;
  documents.human.durability.economicReadBack.repayment.requestedMinor = "1000001";
  documents.human.durability.economicReadBack.repayment.surplusMinor = "1";
  documents.human.durability.economicReadBack.repaymentLedgerTransaction.metadataHash =
    hashId("ledger_metadata", {
      repaymentHash: documents.human.linkage.repaymentHash,
      sourceCode: "synthetic_wallet",
      appliedFeeMinor: "0",
      appliedInterestMinor: "0",
      appliedPrincipalMinor: "1000000",
      surplusMinor: "1",
      sandboxOnly: true,
      productionFundsMoved: false
    });
  const selfAdjustedPayoffEvidenceHash = projectionHash(humanEvidenceIds.map((eventId) => {
    const event = documents.human.durability.events.find((entry) => entry.eventId === eventId);
    return {
      eventId: event.eventId,
      evidenceHash: event.evidenceHash,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      payloadHash: event.payloadHash,
      sourceFinality: event.sourceFinality
    };
  }));
  documents.human.durability.evidenceCompleteness.orderedEvidenceHash =
    selfAdjustedPayoffEvidenceHash;
  documents.human.durability.evidenceCompleteness.databaseEvidenceManifestHash =
    selfAdjustedPayoffEvidenceHash;
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  repaymentPayload.requestedMinor = "1000000";
  repaymentPayload.surplusMinor = "0";
  repaymentDurableEvent.payloadHash = hashId("event_payload", repaymentPayload);
  repaymentDurableEvent.evidencePayloadHash = repaymentDurableEvent.payloadHash;
  documents.human.durability.economicReadBack.repayment.requestedMinor = "1000000";
  documents.human.durability.economicReadBack.repayment.surplusMinor = "0";
  documents.human.durability.economicReadBack.repaymentLedgerTransaction.metadataHash =
    hashId("ledger_metadata", {
      repaymentHash: documents.human.linkage.repaymentHash,
      sourceCode: "synthetic_wallet",
      appliedFeeMinor: "0",
      appliedInterestMinor: "0",
      appliedPrincipalMinor: "1000000",
      surplusMinor: "0",
      sandboxOnly: true,
      productionFundsMoved: false
    });
  documents.human.durability.evidenceCompleteness.orderedEvidenceHash =
    humanEvidenceManifestHash;
  documents.human.durability.evidenceCompleteness.databaseEvidenceManifestHash =
    humanEvidenceManifestHash;

  documents.human.durability.economicReadBack.repaymentRowCount = 2;
  documents.human.durability.economicReadBack.repaymentPostedEventCount = 2;
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.economicReadBack.repaymentRowCount = 1;
  documents.human.durability.economicReadBack.repaymentPostedEventCount = 1;

  documents.human.durability.economicReadBack.obligation.status = "active";
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.economicReadBack.obligation.status = "fully_repaid";

  documents.human.durability.economicReadBack.obligation.outstandingPrincipalMinor = "1";
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.economicReadBack.obligation.outstandingPrincipalMinor = "0";

  documents.human.durability.economicReadBack.installmentSummary.paidTotalMinor = "999999";
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.economicReadBack.installmentSummary.paidTotalMinor = "1000000";

  documents.human.durability.economicReadBack.principalLedgerTransaction
    .canonicalSourceVerified = false;
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.durability.economicReadBack.principalLedgerTransaction
    .canonicalSourceVerified = true;

  const principalReadBack =
    documents.human.durability.economicReadBack.principalLedgerTransaction;
  principalReadBack.entries[0].accountNormalSide = "credit";
  principalReadBack.entriesManifestHash = projectionHash(principalReadBack.entries);
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  principalReadBack.entries[0].accountNormalSide = "debit";
  principalReadBack.entriesManifestHash = projectionHash(principalReadBack.entries);

  principalReadBack.entries[0].canonicalAccountVerified = false;
  principalReadBack.entriesManifestHash = projectionHash(principalReadBack.entries);
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  principalReadBack.entries[0].canonicalAccountVerified = true;
  principalReadBack.entriesManifestHash = projectionHash(principalReadBack.entries);

  const repaymentReadBackEntries =
    documents.human.durability.economicReadBack.repaymentLedgerTransaction.entries;
  repaymentReadBackEntries[1].amountMinor = "999999";
  documents.human.durability.economicReadBack.repaymentLedgerTransaction
    .entriesManifestHash = projectionHash(repaymentReadBackEntries);
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  repaymentReadBackEntries[1].amountMinor = "1000000";
  documents.human.durability.economicReadBack.repaymentLedgerTransaction
    .entriesManifestHash = projectionHash(repaymentReadBackEntries);

  const executionResponseProjection =
    documents.human.operations[2].commandReceipt.responseProjection;
  documents.human.operations[2].commandReceipt.responseProjection = {};
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  documents.human.operations[2].commandReceipt.responseProjection =
    executionResponseProjection;

  const acceptanceManifest =
    documents.human.operations[1].commandReceipt.eventManifest;
  const acceptedOfferEvent = acceptanceManifest.splice(1, 1)[0];
  await assertCriticalReceiptInvalid("human", "Human critical receipt");
  acceptanceManifest.splice(1, 0, acceptedOfferEvent);

  documents.capital_partner.currentLineage.passport.bindingActorRefHash =
    `0x${"e".repeat(64)}`;
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.currentLineage.passport.bindingActorRefHash =
    documents.capital_partner.profile.operatorActorRefHash;

  documents.capital_partner.withdrawalLineage.passport.inboxQueryProof.occurredAt =
    cpOperationTimes[4];
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.withdrawalLineage.passport.inboxQueryProof.occurredAt =
    cpOperationTimes[5];

  documents.capital_partner.durability.commandReceipts[0]
    .responseProjection.subjectId = "subject_cp_tampered";
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.durability.commandReceipts[0]
    .responseProjection.subjectId = documents.capital_partner.currentLineage.subjectId;

  documents.capital_partner.durability.commandReceipts[2]
    .responseProjection.closedAt = cpOperationTimes[6];
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.durability.commandReceipts[2]
    .responseProjection.closedAt = cpOperationTimes[7];

  documents.capital_partner.currentLineage.passport.artifactHash =
    `0x${"e".repeat(64)}`;
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.currentLineage.passport.artifactHash =
    `0x${"a".repeat(64)}`;

  documents.capital_partner.withdrawalLineage.withdrawal.eventPayloadProjection.operatorRefHash =
    `0x${"e".repeat(64)}`;
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.withdrawalLineage.withdrawal.eventPayloadProjection.operatorRefHash =
    `0x${"2".repeat(64)}`;

  documents.capital_partner.currentLineage.staleOfferDenial.protectedStateAfterHash =
    `0x${"e".repeat(64)}`;
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.currentLineage.staleOfferDenial.protectedStateAfterHash =
    documents.capital_partner.currentLineage.staleOfferDenial.protectedStateBeforeHash;

  documents.capital_partner.withdrawalLineage.borrowerRecovery.creditOfferId =
    documents.capital_partner.withdrawalLineage.authoredOffer.creditOfferId;
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  documents.capital_partner.withdrawalLineage.borrowerRecovery.creditOfferId =
    documents.capital_partner.currentLineage.authoredOffer.creditOfferId;

  const withdrawalAuthorManifest =
    documents.capital_partner.durability.commandReceipts[1].eventManifest;
  const withdrawalCreatedEvent = withdrawalAuthorManifest.pop();
  await assertCriticalReceiptInvalid("capital_partner", "Capital Partner critical receipt");
  withdrawalAuthorManifest.push(withdrawalCreatedEvent);

  await writeFile(join(root, "human.json"), `${JSON.stringify(documents.human)}\n`);
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );

  documents.human.linkage.offerSchemaVersion = "credit_offer.v2";
  documents.human.recovery.offerSchemaVersion = "credit_offer.v2";
  documents.human.recovery.queryProof.responseProjection.humanOfferReview.offerSchemaVersion =
    "credit_offer.v2";
  documents.human.recovery.queryProof.responseHash = projectionHash(
    documents.human.recovery.queryProof.responseProjection
  );
  documents.human.operations[0].queryProof.responseProjection.humanOfferReview.offerSchemaVersion =
    "credit_offer.v2";
  documents.human.operations[0].queryProof.responseHash = projectionHash(
    documents.human.operations[0].queryProof.responseProjection
  );
  documents.capital_partner.preparation.humanReceiptBinding =
    syncCapitalPartnerHumanReceiptBinding();
  await writeFile(join(root, "human.json"), `${JSON.stringify(documents.human)}\n`);
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );
  assert.equal(
    await verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    true
  );
  documents.human.linkage.offerSchemaVersion = "credit_offer.v1";
  documents.human.recovery.offerSchemaVersion = "credit_offer.v1";
  documents.human.recovery.queryProof.responseProjection.humanOfferReview.offerSchemaVersion =
    "credit_offer.v1";
  documents.human.recovery.queryProof.responseHash = projectionHash(
    documents.human.recovery.queryProof.responseProjection
  );
  documents.human.operations[0].queryProof.responseProjection.humanOfferReview.offerSchemaVersion =
    "credit_offer.v1";
  documents.human.operations[0].queryProof.responseHash = projectionHash(
    documents.human.operations[0].queryProof.responseProjection
  );

  documents.human.recovery.responseSchemaVersion = "tenant_workspace_resume_view.v1";
  documents.human.operations[0].responseSchemaVersion = "tenant_workspace_resume_view.v1";
  await writeFile(join(root, "human.json"), `${JSON.stringify(documents.human)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Human critical receipt")
  );
  documents.human.recovery.responseSchemaVersion = "tenant_workspace_resume_view.v2";
  documents.human.operations[0].responseSchemaVersion = "tenant_workspace_resume_view.v2";

  documents.human.recovery.creditOfferHash = `0x${"f".repeat(64)}`;
  await writeFile(join(root, "human.json"), `${JSON.stringify(documents.human)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Human critical receipt")
  );
  documents.human.recovery.creditOfferHash = documents.human.linkage.creditOfferHash;

  documents.human.authentication.sessionMaterialIncluded = true;
  await writeFile(join(root, "human.json"), `${JSON.stringify(documents.human)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Human critical receipt")
  );
  documents.human.authentication.sessionMaterialIncluded = false;
  await writeFile(join(root, "human.json"), `${JSON.stringify(documents.human)}\n`);
  documents.capital_partner.preparation.humanReceiptBinding =
    syncCapitalPartnerHumanReceiptBinding();
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );

  documents.capital_partner.currentLineage.staleOfferDenial.authorizationAudit.reasonCode =
    "actor_capability_rejected";
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Capital Partner critical receipt")
  );
  documents.capital_partner.currentLineage.staleOfferDenial.authorizationAudit.reasonCode =
    "live_policy_rejected";

  const staleRequest =
    documents.capital_partner.currentLineage.staleOfferDenial.outwardResponse;
  const acknowledgementHash =
    staleRequest.requestProjection.payload.acknowledgementHash;
  staleRequest.requestProjection.payload.acknowledgementHash =
    `0x${"f".repeat(64)}`;
  staleRequest.requestProjectionHash = projectionHash(staleRequest.requestProjection);
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Capital Partner critical receipt")
  );
  staleRequest.requestProjection.payload.acknowledgementHash =
    acknowledgementHash;
  staleRequest.requestProjectionHash = projectionHash(staleRequest.requestProjection);

  const distinctWithdrawalIntent =
    documents.capital_partner.withdrawalLineage.passport.creditIntentId;
  documents.capital_partner.withdrawalLineage.passport.creditIntentId =
    documents.capital_partner.currentLineage.passport.creditIntentId;
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Capital Partner critical receipt")
  );
  documents.capital_partner.withdrawalLineage.passport.creditIntentId =
    distinctWithdrawalIntent;

  const withdrawalProjectionEventId =
    documents.capital_partner.durability.projectionReadBack[2].sourceEventId;
  documents.capital_partner.durability.projectionReadBack[2].sourceEventId =
    "event_cp_current_created";
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Capital Partner critical receipt")
  );
  documents.capital_partner.durability.projectionReadBack[2].sourceEventId =
    withdrawalProjectionEventId;
  await writeFile(
    join(root, "capital_partner.json"),
    `${JSON.stringify(documents.capital_partner)}\n`
  );

  documents.application.steps[0].operationId = "pilotRequestCredit";
  await writeFile(
    join(root, "application.json"),
    `${JSON.stringify(documents.application)}\n`
  );
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("four-tool")
  );
  documents.application.steps[0].operationId = "pilotReadAgentSelf";
  await writeFile(
    join(root, "application.json"),
    `${JSON.stringify(documents.application)}\n`
  );

  documents.runtime.steps[3].responseSchemaVersion =
    "tenant_sandbox_repayment_posted.v1";
  await writeFile(join(root, "runtime.json"), `${JSON.stringify(documents.runtime)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Provider-scoped")
  );
  documents.runtime.steps[3].responseSchemaVersion =
    "tenant_owned_obligation_evidence_view.v1";
  await writeFile(join(root, "runtime.json"), `${JSON.stringify(documents.runtime)}\n`);

  documents.after.lifecycle = { mcpReceipt: {} };
  await writeFile(join(root, "after.json"), `${JSON.stringify(documents.after)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("recovery-only")
  );
  delete documents.after.lifecycle;
  await writeFile(join(root, "after.json"), `${JSON.stringify(documents.after)}\n`);

  documents.risk.authorizationRegression.denials.pop();
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.authorizationRegression = riskAuthorizationRegression();

  documents.risk.runtimeBinding.releaseIdentityArtifactSha256 = "0".repeat(64);
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.runtimeBinding.releaseIdentityArtifactSha256 =
    releaseIdentityArtifactSha256;

  documents.risk.authorizationRegression.sourceFiles[0].sha256 = "0".repeat(64);
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.authorizationRegression = riskAuthorizationRegression();

  documents.risk.liveRuntimeObservation.checks[1].operationId =
    "pilotReadTenantRisk";
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.liveRuntimeObservation.checks[1].operationId =
    "pilotFreezeSubject";

  documents.risk.liveRuntimeObservation.checks[0].unexpected = true;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  delete documents.risk.liveRuntimeObservation.checks[0].unexpected;

  documents.risk.policy.protectedOperationIds =
    M1_B_RISK_MFA_OPERATION_IDS.slice(0, -1);
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.policy.protectedOperationIds = M1_B_RISK_MFA_OPERATION_IDS;

  documents.risk.liveRuntimeObservation.mfaDenialAttribution
    .auditSessionTokenBindingVerified = false;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.liveRuntimeObservation.mfaDenialAttribution
    .auditSessionTokenBindingVerified = true;

  documents.risk.liveRuntimeObservation.credentialBoundary
    .activeMembershipCountsByActorType.auditor = 1;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.liveRuntimeObservation.credentialBoundary
    .activeMembershipCountsByActorType.auditor = 0;

  documents.risk.liveRuntimeObservation.credentialBoundary
    .activeAuthenticationMethods = ["oidc_pkce_bff", "siwe"];
  documents.risk.liveRuntimeObservation.credentialBoundary
    .nonSiweActiveCredentialCount = 1;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.liveRuntimeObservation.credentialBoundary
    .activeAuthenticationMethods = ["siwe"];
  documents.risk.liveRuntimeObservation.credentialBoundary
    .nonSiweActiveCredentialCount = 0;

  documents.risk.liveRuntimeObservation.session.authTime =
    "2026-08-13T11:30:05.000Z";
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.liveRuntimeObservation.session.authTime =
    "2026-08-13T11:30:15.000Z";

  documents.risk.exposure.nonSiweActiveRiskCredentialCount = 1;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.exposure.nonSiweActiveRiskCredentialCount = 0;

  documents.risk.protectedState.afterHash = `0x${"3".repeat(64)}`;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.protectedState.afterHash = documents.risk.protectedState.beforeHash;

  documents.risk.protectedState.observedRowCounts.subjects = 0;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
  documents.risk.protectedState.observedRowCounts.subjects =
    M1_B_RISK_MFA_PROTECTED_STATE_MINIMUMS.subjects;

  documents.risk.databaseStartedAt = beforeTime;
  await writeFile(join(root, "risk.json"), `${JSON.stringify(documents.risk)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Risk MFA boundary")
  );
});
