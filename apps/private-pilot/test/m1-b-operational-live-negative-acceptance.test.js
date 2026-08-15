import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  captureM1BOperationalLiveDenialBoundary,
  captureM1BOperationalLiveDenialBoundaryForTest,
  createM1BOperationalLiveAttempt,
  createM1BOperationalLiveNegativeArmToken,
  deriveM1BOperationalLiveNegativeIdempotencyKey,
  deriveM1BOperationalRepositoryIdempotencyKey,
  inspectM1BOperationalLiveNegativeResponse,
  parseM1BOperationalLiveNegativeResponseLine,
  readM1BOperationalLiveClientId
} from "../src/m1-b-operational-live-negative-acceptance.js";
import {
  captureM1BOperationalLiveNegativeProof,
  getM1BOperationalNegativeCaseDefinition
} from "../src/m1-b-operational-negative-acceptance.js";
import {
  hashM1BAcceptanceManifest
} from "../src/m1-b-human-capital-partner-acceptance.js";
import { hashId } from "../../../packages/domain/src/index.js";
import { createLocalPilotIdentities } from "../src/local-pilot-identities.js";
import {
  parseM1BOperationalLiveNegativeCliContext
} from "../src/m1-b-operational-live-negative-cli.js";
import {
  createM1BOperationalLiveNegativeDocuments
} from "../../../scripts/m1-b-operational-evidence-builder.mjs";

const HASH = `0x${"a".repeat(64)}`;
const TENANT = "tenant_ipo_one_local_pilot";
const HUMAN = "actor_human_borrower_pilot";
const CLIENT = "client_human_invited_siwe";
const OFFER_HASH = HASH;
const TERMS_HASH = `0x${"b".repeat(64)}`;
const DISCLOSURE = "urn:ipo.one:sandbox:credit-offer-disclosure:v1";
const LIVE_ARM_CHALLENGE =
  "m1_b_live_negative_response_01234567-89ab-4def-8123-456789abcdef";

function liveCliContext() {
  return {
    schemaVersion: "m1_b_operational_live_negative_cli_context.v1",
    group: "authorization",
    id: "cross_role_private_read",
    candidateReleaseId: "a".repeat(40),
    sourceTreeHash: "b".repeat(40),
    runtimeImageId: `sha256:${"c".repeat(64)}`,
    supportingArtifacts: [
      { id: "capital_partner_critical", sha256: "d".repeat(64) },
      { id: "human_critical", sha256: "e".repeat(64) }
    ],
    tenantId: TENANT,
    actorId: "actor_capital_partner_pilot",
    authentication: {
      method: "siwe",
      acr: "urn:ipo.one:acr:wallet",
      amr: ["wallet", "siwe", "eip191_eoa_v1"],
      actorRefHash: HASH,
      clientRefHash: `0x${"f".repeat(64)}`,
      coveredAuditEventIds: ["audit_cp_0001", "audit_cp_0002"],
      auditEventCount: 2,
      coveredRequestIds: ["request_cp_0001", "request_cp_0002"],
      requestCount: 2,
      earliestAuthTime: "2026-08-15T00:10:20.000Z",
      latestAuthTime: "2026-08-15T00:10:21.000Z",
      activeCredentialBinding: true,
      activeMembershipBinding: true,
      credentialBindingCount: 1,
      invitationBoundCredentialRegistrationCount: 1,
      sessionMaterialIncluded: false,
      rawSignatureIncluded: false,
      walletAddressIncluded: false
    },
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    resourceType: "obligation",
    resourceId: "obligation_human_critical"
  };
}

function encodeContext(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test("exact-image live-negative CLI accepts only closed safe SIWE context", () => {
  const context = liveCliContext();
  assert.deepEqual(
    parseM1BOperationalLiveNegativeCliContext(encodeContext(context)),
    context
  );
  assert.throws(
    () => parseM1BOperationalLiveNegativeCliContext(encodeContext({
      ...context,
      authentication: { ...context.authentication, sessionHandle: "opaque" }
    })),
    /invalid/i
  );
  assert.throws(
    () => parseM1BOperationalLiveNegativeCliContext(
      `${encodeContext(context)}=`
    ),
    /context is invalid/i
  );
});

function sha256Json(value) {
  return `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function deniedOfferRequest(attempt) {
  const confirmationHash = `0x${"c".repeat(64)}`;
  const messageHash = `0x${"d".repeat(64)}`;
  const actionConfirmation = {
    actionType: "accept_offer",
    resourceId: attempt.resourceId,
    resourceHash: OFFER_HASH,
    payloadHash: sha256Json({
      expectedOfferHash: OFFER_HASH,
      expectedTermsHash: TERMS_HASH,
      disclosureRef: DISCLOSURE,
      sandboxOnly: true,
      productionFundsAuthority: false
    }),
    requestId: attempt.requestId,
    requestNonce: "human_action_confirmation_01234567-89ab-4def-8123-456789abcdef",
    requestedAt: "2026-08-15T01:00:00.500Z",
    confirmedAt: "2026-08-15T01:00:01.000Z",
    expiresAt: "2026-08-15T01:05:00.500Z",
    confirmationMethod: "wallet_personal_sign",
    confirmationHash,
    messageHash,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
  return {
    operationId: attempt.operationId,
    resource: {
      resourceType: attempt.resourceType,
      resourceId: attempt.resourceId
    },
    payload: {
      expectedOfferHash: OFFER_HASH,
      expectedTermsHash: TERMS_HASH,
      acknowledgementHash: sha256Json({
        acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
        creditOfferHash: OFFER_HASH,
        termsHash: TERMS_HASH,
        disclosureRef: DISCLOSURE,
        actionConfirmationMethod: "wallet_personal_sign",
        actionConfirmationHash: confirmationHash,
        actionConfirmationMessageHash: messageHash,
        sandboxOnly: true,
        productionFundsAuthority: false
      }),
      actionConfirmation
    },
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    idempotencyKey: attempt.idempotencyKey,
    schemaVersion: "tenant_protocol_request.v1"
  };
}

function problem(requestId) {
  return {
    schemaVersion: "problem_details.v1",
    type: "urn:ipo.one:problem:authorization_denied",
    title: "Not available",
    status: 404,
    code: "authorization_denied",
    detail: "The requested operation is not available.",
    requestId
  };
}

test("live-negative arm is closed, expiring, and carries no executable browser expression", () => {
  const idempotencyKey =
    deriveM1BOperationalLiveNegativeIdempotencyKey(LIVE_ARM_CHALLENGE);
  const arm = createM1BOperationalLiveNegativeArmToken({
    group: "human",
    id: "unauthorized_subject",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    resourceId: "credit_offer_agent_candidate",
    expectedOfferHash: HASH,
    expectedTermsHash: `0x${"b".repeat(64)}`,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request_m1b_unauthorized_001",
    correlationId: "correlation_m1b_unauthorized_001",
    idempotencyKey,
    issuedAt: "2026-08-15T01:00:00.000Z",
    challenge: LIVE_ARM_CHALLENGE
  });
  assert.equal(arm.schemaVersion, "m1_b_operational_live_negative_arm.v1");
  assert.equal(arm.expiresAt, "2026-08-15T01:15:00.000Z");
  assert.equal(arm.actorRole, "human");
  assert.equal(arm.expectedStatus, 404);
  assert.equal(Object.hasOwn(arm, "idempotencyKey"), false);
  assert.doesNotMatch(JSON.stringify(arm), /browserExpression|csrf|signature|cookie/i);
  assert.throws(
    () => createM1BOperationalLiveNegativeArmToken({
      ...arm,
      challenge:
        "m1_b_live_negative_response_11234567-89ab-4def-8123-456789abcdef",
      idempotencyKey
    }),
    /business binding is invalid/
  );
});

test("live response parser timestamps a closed problem projection and rejects operator extras", () => {
  const context = {
    group: "authorization",
    id: "cross_role_private_read",
    requestId: "request_m1b_cross_role_001",
    correlationId: "correlation_m1b_cross_role_001",
    resourceType: "obligation",
    resourceId: "obligation_human_critical",
    armChallenge: LIVE_ARM_CHALLENGE,
    observedAt: new Date("2026-08-15T01:00:00.000Z")
  };
  const line = JSON.stringify({
    schemaVersion: "m1_b_operational_live_negative_response.v2",
    group: context.group,
    id: context.id,
    requestId: context.requestId,
    correlationId: context.correlationId,
    armChallenge: LIVE_ARM_CHALLENGE,
    requestProjection: {
      operationId: "pilotReadOwnObligation",
      resource: {
        resourceType: "obligation",
        resourceId: context.resourceId
      },
      payload: {},
      requestId: context.requestId,
      correlationId: context.correlationId,
      schemaVersion: "tenant_protocol_request.v1"
    },
    response: problem(context.requestId)
  });
  const parsed = parseM1BOperationalLiveNegativeResponseLine(line, context);
  assert.equal(parsed.responseProjection.status, 404);
  assert.equal(parsed.responseHash.startsWith("0x"), true);
  assert.throws(
    () => parseM1BOperationalLiveNegativeResponseLine(
      JSON.stringify({ ...JSON.parse(line), cookie: "forbidden" }),
      context
    ),
    /envelope is invalid/
  );
});

test("live Offer response parser recomputes the exact wallet payload and acknowledgement", () => {
  const attempt = createM1BOperationalLiveAttempt({
    tenantId: TENANT,
    actorId: HUMAN,
    clientId: CLIENT,
    group: "human",
    id: "unauthorized_subject",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    resourceId: "credit_offer_agent_candidate",
    command: true
  });
  const requestProjection = deniedOfferRequest(attempt);
  const context = {
    group: attempt.group,
    id: attempt.id,
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    resourceType: attempt.resourceType,
    resourceId: attempt.resourceId,
    expectedOfferHash: OFFER_HASH,
    expectedTermsHash: TERMS_HASH,
    disclosureRef: DISCLOSURE,
    idempotencyKey: attempt.idempotencyKey,
    armChallenge: LIVE_ARM_CHALLENGE,
    observedAt: new Date("2026-08-15T01:00:02.000Z")
  };
  const envelope = {
    schemaVersion: "m1_b_operational_live_negative_response.v2",
    group: attempt.group,
    id: attempt.id,
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    armChallenge: LIVE_ARM_CHALLENGE,
    requestProjection,
    response: problem(attempt.requestId)
  };
  const parsed = parseM1BOperationalLiveNegativeResponseLine(
    JSON.stringify(envelope),
    context
  );
  assert.equal(parsed.requestProjectionHash, hashM1BAcceptanceManifest(requestProjection));
  assert.throws(
    () => inspectM1BOperationalLiveNegativeResponse({
      requestProjection,
      response: envelope.response,
      armChallenge: LIVE_ARM_CHALLENGE
    }, context),
    /sealed response shape is invalid/
  );
  const tamperedRequest = structuredClone(requestProjection);
  tamperedRequest.payload.acknowledgementHash = `0x${"f".repeat(64)}`;
  assert.throws(
    () => parseM1BOperationalLiveNegativeResponseLine(
      JSON.stringify({ ...envelope, requestProjection: tamperedRequest }),
      context
    ),
    /not bound to its exact role and wallet authority/
  );
});

test("repository idempotency key is two-stage and exact attempt IDs are unique", () => {
  const first = createM1BOperationalLiveAttempt({
    tenantId: TENANT,
    actorId: HUMAN,
    clientId: CLIENT,
    group: "human",
    id: "expired_offer",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    resourceId: "credit_offer_expired_c",
    command: true
  });
  const second = createM1BOperationalLiveAttempt({
    tenantId: TENANT,
    actorId: HUMAN,
    clientId: CLIENT,
    group: "human",
    id: "expired_offer",
    operationId: "pilotAcceptCreditOffer",
    resourceType: "credit_offer",
    resourceId: "credit_offer_expired_c",
    command: true
  });
  assert.notEqual(first.requestId, second.requestId);
  assert.notEqual(first.correlationId, second.correlationId);
  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  assert.match(deriveM1BOperationalRepositoryIdempotencyKey(first), /^0x[0-9a-f]{64}$/);
});

test("cross-role private read is attributed to the real Capital Partner capability boundary", () => {
  const { identities, policyRegistry } = createLocalPilotIdentities();
  const policy = policyRegistry.getAuthenticated("pilotReadOwnObligation");
  assert.equal(policy.requiredCapability, "obligation.read.owned");
  assert.equal(
    identities.capitalPartner.capabilities.includes(policy.requiredCapability),
    false
  );
  assert.equal(identities.capitalPartner.roleBundle, "capital_partner_operator");
});

test("live client lookup binds every critical audit to one SIWE client without emitting session refs", async () => {
  const auditEventIds = ["audit_human_1", "audit_human_2"];
  const clientRefHash = (await import("../../../packages/domain/src/index.js")).hashId(
    "m1_b_acceptance_client_reference",
    { clientId: CLIENT }
  );
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return {
        rowCount: 2,
        rows: auditEventIds.map((audit_event_id) => ({
          audit_event_id,
          client_id: CLIENT,
          session_match_count: 1
        }))
      };
    }
  };
  assert.equal(await readM1BOperationalLiveClientId(client, {
    tenantId: TENANT,
    actorId: HUMAN,
    authentication: { coveredAuditEventIds: auditEventIds, clientRefHash }
  }), CLIENT);
  assert.match(calls[0].text, /token_jti_ref_hash = a\.token_jti_hash/);
  assert.deepEqual(calls[0].values, [TENANT, HUMAN, auditEventIds]);
});

test("live boundary measures exact outward denial, durable audit, zero effects, and equal business state", async () => {
  const databaseStartedAt = "2026-08-15T00:59:00.000Z";
  const times = [
    "2026-08-15T01:00:00.000Z",
    "2026-08-15T01:00:03.000Z"
  ];
  const client = {
    async query() {
      return { rowCount: 1, rows: [{ captured_at: times.shift() }] };
    }
  };
  const read = (operation) => operation(client);
  const attempt = {
    ...createM1BOperationalLiveAttempt({
      tenantId: TENANT,
      actorId: HUMAN,
      clientId: CLIENT,
      group: "human",
      id: "unauthorized_subject",
      operationId: "pilotAcceptCreditOffer",
      resourceType: "credit_offer",
      resourceId: "credit_offer_agent_candidate",
      command: true
    })
  };
  const zeroEffects = {
    repositoryIdempotencyKeyHash:
      deriveM1BOperationalRepositoryIdempotencyKey(attempt),
    commandIdempotencyCount: 0,
    commandEventCount: 0,
    executionCount: 0,
    businessEventCount: 0
  };
  const protectedState = {
    manifest: {
      catalogVersion: "m1_b_operational_offer_protected_state.v2",
      offer: {
        creditOfferRefHash: hashId("m1_b_operational_credit_offer_reference", {
          value: attempt.resourceId
        }),
        offerHash: OFFER_HASH,
        termsHash: TERMS_HASH,
        disclosureRef: DISCLOSURE,
        status: "offered",
        validUntil: "2026-08-16T01:00:00.000Z"
      },
      related: Object.fromEntries([
        "acceptance",
        "obligations",
        "executions",
        "repayments",
        "ledgerTransactions"
      ].map((key) => [key, { rowCount: 0, manifestHash: HASH }]))
    },
    manifestHash: HASH
  };
  const testCapture = await captureM1BOperationalLiveDenialBoundaryForTest({
    caseDefinition: getM1BOperationalNegativeCaseDefinition(
      "human",
      "unauthorized_subject"
    ),
    attempt,
    databaseStartedAt,
    readTarget: read,
    readAttempt: read,
    async performDenial(exactAttempt) {
      const requestProjection = deniedOfferRequest(exactAttempt);
      const responseProjection = {
        status: 404,
        code: "authorization_denied",
        requestId: exactAttempt.requestId,
        schemaVersion: "problem_details.v1"
      };
      return {
        capturedAt: "2026-08-15T01:00:02.000Z",
        requestProjection,
        requestProjectionHash: hashM1BAcceptanceManifest(requestProjection),
        responseProjection,
        responseHash: hashM1BAcceptanceManifest(responseProjection)
      };
    }
  }, {
      readOfferState: async () => protectedState,
      readEffects: async () => zeroEffects,
      readAudit: async () => ({
        eventId: "audit_live_unauthorized_subject",
        requestId: attempt.requestId,
        correlationId: attempt.correlationId,
        operationId: attempt.operationId,
        authorizationDecision: "deny",
        occurredAt: "2026-08-15T01:00:01.000Z",
        reasonCode: "resource_access_denied"
      })
  });
  assert.equal(testCapture.fixtureUsed, true);
  assert.equal(testCapture.productionEvidenceEligible, false);
  const proof = testCapture.observation;
  assert.equal(proof.schemaVersion, "m1_b_negative_live_observation.v2");
  assert.equal(proof.fixtureUsed, true);
  assert.equal(proof.productionEvidenceEligible, false);
  assert.equal(proof.protectedStateBeforeHash, HASH);
  assert.equal(proof.protectedStateAfterHash, HASH);
  assert.equal(proof.authorizationAudit.eventId, "audit_live_unauthorized_subject");
  assert.equal(proof.additionalEffectCount, 0);
  const definition = getM1BOperationalNegativeCaseDefinition(
    "human",
    "unauthorized_subject"
  );
  const supportingArtifacts = [
    { id: "human_critical", sha256: "d".repeat(64) },
    { id: "agent_foreign_offer_setup", sha256: "e".repeat(64) }
  ];
  const negativeProof = {
    proofKind: "runtime_observation",
    group: "human",
    id: "unauthorized_subject",
    sourceMode: definition.sourceMode,
    caseDefinitionHash: definition.caseDefinitionHash,
    candidateReleaseId: "a".repeat(40),
    sourceTreeHash: "b".repeat(40),
    runtimeImageId: `sha256:${"c".repeat(64)}`,
    capturedAt: proof.capturedAt,
    requestId: proof.requestId,
    correlationId: proof.correlationId,
    outwardStatus: proof.outwardStatus,
    outwardCode: proof.outwardCode,
    outwardResponseHash: hashM1BAcceptanceManifest(proof.outwardBody),
    authorizationAuditEventId: proof.authorizationAudit.eventId,
    authorizationDecision: proof.authorizationAudit.authorizationDecision,
    authorizationReasonCode: proof.authorizationAudit.reasonCode,
    protectedStateBeforeHash: proof.protectedStateBeforeHash,
    protectedStateAfterHash: proof.protectedStateAfterHash,
    databaseProof: proof.databaseProof,
    additionalEffectCount: 0,
    nonEnumerating: true,
    duplicateSemantics: null,
    regressionAssertions: null,
    sourceEvidence: {
      operationId: definition.operationId,
      subtestName: definition.subtestName,
      supportingArtifacts,
      testCommand: definition.testCommand,
      tapSha256: null,
      exitCode: null,
      tapParser: null,
      sourceFiles: []
    },
    producerVerified: true
  };
  const {
    fixtureUsed: _fixtureUsed,
    productionEvidenceEligible: _productionEvidenceEligible,
    ...attemptEvidence
  } = testCapture.attemptEvidence;
  const attemptReceipt = {
    schemaVersion: "m1_b_operational_live_attempt_receipt.v2",
    fixtureUsed: false,
    productionEvidenceEligible: true,
    candidateReleaseId: negativeProof.candidateReleaseId,
    sourceTreeHash: negativeProof.sourceTreeHash,
    runtimeImageId: negativeProof.runtimeImageId,
    group: negativeProof.group,
    id: negativeProof.id,
    databaseStartedAt,
    capturedAt: negativeProof.capturedAt,
    supportingArtifacts,
    ...attemptEvidence,
    negativeProofHash: hashM1BAcceptanceManifest(negativeProof)
  };
  const liveContext = {
    candidateReleaseId: negativeProof.candidateReleaseId,
    sourceTreeHash: negativeProof.sourceTreeHash,
    runtimeImageId: negativeProof.runtimeImageId,
    group: negativeProof.group,
    id: negativeProof.id,
    databaseStartedAt,
    supportingArtifacts,
    resourceType: attempt.resourceType,
    resourceId: attempt.resourceId
  };
  const sealed = await createM1BOperationalLiveNegativeDocuments({
    result: {
      schemaVersion: "m1_b_operational_live_negative_cli_result.v1",
      status: "live_negative_captured",
      attemptReceipt,
      negativeProof
    },
    context: liveContext,
    outputRoot: `${process.cwd()}/output/playwright/m1-b-p0-5`,
    availableArtifacts: supportingArtifacts
  });
  assert.deepEqual(
    sealed.references.map(({ id }) => id),
    [
      "negative_live_attempt_human_unauthorized_subject",
      "negative_live_source_proof_human_unauthorized_subject"
    ]
  );
  await assert.rejects(
    createM1BOperationalLiveNegativeDocuments({
      result: {
        schemaVersion: "m1_b_operational_live_negative_cli_result.v1",
        status: "live_negative_captured",
        attemptReceipt: {
          ...attemptReceipt,
          requestProjectionHash: "0x" + "0".repeat(64)
        },
        negativeProof
      },
      context: liveContext,
      outputRoot: `${process.cwd()}/output/playwright/m1-b-p0-5`,
      availableArtifacts: supportingArtifacts
    }),
    /does not reconstruct one exact request/
  );
  await assert.rejects(
    createM1BOperationalLiveNegativeDocuments({
      result: {
        schemaVersion: "m1_b_operational_live_negative_cli_result.v1",
        status: "live_negative_captured",
        attemptReceipt: { ...attemptReceipt, fixtureUsed: true },
        negativeProof
      },
      context: liveContext,
      outputRoot: `${process.cwd()}/output/playwright/m1-b-p0-5`,
      availableArtifacts: supportingArtifacts
    }),
    /attempt\/proof envelope is invalid/
  );
  await assert.rejects(
    captureM1BOperationalLiveNegativeProof({
      group: "human",
      id: "unauthorized_subject",
      candidateReleaseId: "a".repeat(40),
      sourceTreeHash: "b".repeat(40),
      runtimeImageId: `sha256:${"c".repeat(64)}`,
      supportingArtifacts: [
        { id: "human_critical", sha256: "d".repeat(64) },
        { id: "agent_foreign_offer_setup", sha256: "e".repeat(64) }
      ],
      observation: proof
    }),
    (error) => error?.code === "operational_negative_live_capture_invalid"
  );

  const secondTimes = [
    "2026-08-15T01:01:00.000Z",
    "2026-08-15T01:01:03.000Z"
  ];
  const secondRead = (operation) => operation({
    async query() {
      return { rowCount: 1, rows: [{ captured_at: secondTimes.shift() }] };
    }
  });
  await assert.rejects(
    captureM1BOperationalLiveDenialBoundaryForTest({
      caseDefinition: getM1BOperationalNegativeCaseDefinition(
        "human",
        "unauthorized_subject"
      ),
      attempt,
      databaseStartedAt,
      readTarget: secondRead,
      readAttempt: secondRead,
      performDenial: async () => ({})
    }, {
        readOfferState: async () => protectedState,
        readEffects: async () => ({ ...zeroEffects, businessEventCount: 1 }),
        readAudit: async () => ({})
    }),
    /already has command effects/
  );
  await assert.rejects(
    captureM1BOperationalLiveDenialBoundary({
      group: "human",
      id: "unauthorized_subject",
      readTarget: secondRead,
      performDenial: async () => ({}),
      dependencies: { readOfferState: async () => ({}) }
    }),
    (error) => error?.code ===
      "operational_live_negative_dependency_override_forbidden"
  );
});
