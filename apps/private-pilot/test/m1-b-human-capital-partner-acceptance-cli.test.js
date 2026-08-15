import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import {
  M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN,
  M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS
} from "../../web/src/m1-b-acceptance-normal-response-capture.js";
import {
  deriveM1BAcceptanceDenialIdempotencyKey
} from "../../web/src/m1-b-acceptance-denial-response-capture.js";
import {
  M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN,
  M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE
} from "../src/m1-b-expired-offer-setup.js";
import {
  M1BHumanCapitalPartnerCliError,
  M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE,
  M1_B_HUMAN_OPERATOR_SEQUENCE,
  M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
  assertM1BDatabasePostmasterStart,
  createM1BDenialResponseArmToken,
  createM1BNormalResponseArmToken,
  deriveM1BDenialResponseIdempotencyKey,
  parseM1BOperatorResponseLine,
  readM1BHumanCapitalPartnerCliEnvironment
} from "../src/m1-b-human-capital-partner-acceptance-cli.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const CLI = resolve(
  ROOT,
  "apps/private-pilot/src/m1-b-human-capital-partner-acceptance-cli.js"
);
const SHA = "a".repeat(40);
const OBSERVED_AT = "2026-08-14T01:02:03.004Z";
const ARM_CHALLENGE =
  "m1_b_normal_response_01234567-89ab-4def-8123-456789abcdef";
const DENIAL_ARM_CHALLENGE =
  "m1_b_denial_response_11234567-89ab-4def-8123-456789abcdef";

function sha256Json(value) {
  return `0x${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function responseLine(overrides = {}) {
  return JSON.stringify({
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "human",
    sequence: 1,
    requestId: "request-human-cli-0001",
    correlationId: "correlation-human-cli-0001",
    armChallenge: ARM_CHALLENGE,
    armIssuedAt: OBSERVED_AT,
    armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
    response: {
      workspaceKind: "human_borrower",
      humanOfferReview: null,
      hasMore: false,
      serverTruth: true,
      schemaVersion: "tenant_workspace_resume_view.v2"
    },
    ...overrides
  });
}

test("operator response chronology is owned by the CLI observation clock", () => {
  const parsed = parseM1BOperatorResponseLine(responseLine(), {
    flow: "human",
    sequence: 1,
    actorRole: "human",
    operationId: "pilotReadWorkspaceResume",
    responseSchemaVersion: "tenant_workspace_resume_view.v2",
    armChallenge: ARM_CHALLENGE,
    armIssuedAt: OBSERVED_AT,
    armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
    observedAt: OBSERVED_AT
  });
  assert.equal(parsed.capturedAt, OBSERVED_AT);
  assert.equal(Object.hasOwn(JSON.parse(responseLine()), "capturedAt"), false);

  assert.throws(
    () => parseM1BOperatorResponseLine(
      responseLine({ capturedAt: "2099-01-01T00:00:00.000Z" }),
      {
        flow: "human",
        sequence: 1,
        actorRole: "human",
        operationId: "pilotReadWorkspaceResume",
        responseSchemaVersion: "tenant_workspace_resume_view.v2",
        armChallenge: ARM_CHALLENGE,
        armIssuedAt: OBSERVED_AT,
        armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
        observedAt: OBSERVED_AT
      }
    ),
    (error) => error instanceof M1BHumanCapitalPartnerCliError &&
      error.code === "acceptance_operator_response_invalid"
  );
});

test("operator response rejects sensitive material before any DB reconciliation", () => {
  const parsed = JSON.parse(responseLine());
  parsed.response.sessionId = "opaque-session";
  assert.throws(
    () => parseM1BOperatorResponseLine(JSON.stringify(parsed), {
      flow: "human",
      sequence: 1,
      actorRole: "human",
      operationId: "pilotReadWorkspaceResume",
      responseSchemaVersion: "tenant_workspace_resume_view.v2",
      armChallenge: ARM_CHALLENGE,
      armIssuedAt: OBSERVED_AT,
      armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
      observedAt: OBSERVED_AT
    }),
    (error) => error.code === "acceptance_capture_sensitive_key"
  );
});

test("normal response arm token is closed, expiring, challenge-bound, and never retained in the receipt entry", () => {
  const token = createM1BNormalResponseArmToken({
    flow: "human",
    sequence: 1,
    actorRole: "human",
    operationId: "pilotReadWorkspaceResume",
    responseSchemaVersion: "tenant_workspace_resume_view.v2",
    issuedAt: new Date(OBSERVED_AT),
    challenge: ARM_CHALLENGE
  });
  assert.deepEqual(Object.keys(token), [
    "schemaVersion",
    "challenge",
    "clockDomain",
    "issuedAt",
    "expiresAt",
    "flow",
    "sequence",
    "actorRole",
    "operationId",
    "responseSchemaVersion"
  ]);
  assert.equal(
    M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
    M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN
  );
  assert.equal(
    M1_B_EXPIRED_OFFER_NORMAL_RESPONSE_CLOCK_DOMAIN,
    M1_B_ACCEPTANCE_NORMAL_RESPONSE_CLOCK_DOMAIN
  );
  assert.equal(Date.parse(token.expiresAt) - Date.parse(token.issuedAt), 15 * 60_000);
  assert.throws(
    () => createM1BNormalResponseArmToken({
      ...token,
      sequence: 4
    }),
    (error) => error.code === "acceptance_operator_arm_invalid"
  );
  assert.throws(
    () => parseM1BOperatorResponseLine(responseLine({
      armChallenge:
        "m1_b_normal_response_11234567-89ab-4def-8123-456789abcdef"
    }), {
      flow: "human",
      sequence: 1,
      actorRole: "human",
      operationId: "pilotReadWorkspaceResume",
      responseSchemaVersion: "tenant_workspace_resume_view.v2",
      armChallenge: ARM_CHALLENGE,
      armIssuedAt: OBSERVED_AT,
      armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
      observedAt: OBSERVED_AT
    }),
    (error) => error.code === "acceptance_operator_response_invalid"
  );
  const parsed = parseM1BOperatorResponseLine(responseLine(), {
    flow: "human",
    sequence: 1,
    actorRole: "human",
    operationId: "pilotReadWorkspaceResume",
    responseSchemaVersion: "tenant_workspace_resume_view.v2",
    armChallenge: ARM_CHALLENGE,
    armIssuedAt: OBSERVED_AT,
    armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
    observedAt: OBSERVED_AT
  });
  assert.equal(Object.hasOwn(parsed, "armChallenge"), false);
  assert.equal(parsed.armIssuedAt, OBSERVED_AT);
  assert.equal(parsed.armClockDomain, M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN);

  for (const [line, options] of [
    [responseLine({ armIssuedAt: "2026-08-14T01:02:03.003Z" }), {}],
    [responseLine({ armClockDomain: "host_process_clock" }), {}],
    [responseLine(), { observedAt: "2026-08-14T01:02:03.003Z" }],
    [responseLine(), { observedAt: "2026-08-14T01:19:03.005Z" }]
  ]) {
    assert.throws(
      () => parseM1BOperatorResponseLine(line, {
        flow: "human",
        sequence: 1,
        actorRole: "human",
        operationId: "pilotReadWorkspaceResume",
        responseSchemaVersion: "tenant_workspace_resume_view.v2",
        armChallenge: ARM_CHALLENGE,
        armIssuedAt: OBSERVED_AT,
        armClockDomain: M1_B_NORMAL_RESPONSE_CLOCK_DOMAIN,
        observedAt: options.observedAt ?? OBSERVED_AT
      }),
      (error) => error.code === "acceptance_operator_response_invalid"
    );
  }
});

test("denial arm token is closed, challenge-bound, and its visible-panel receipt remains contract-valid", () => {
  const expectedOfferHash = `0x${"a".repeat(64)}`;
  const expectedTermsHash = `0x${"b".repeat(64)}`;
  const token = createM1BDenialResponseArmToken({
    sequence: 4,
    expectedStatus: "declined",
    resourceId: "credit_offer_declined_candidate",
    expectedOfferHash,
    expectedTermsHash,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request-m1b-denial-0001",
    correlationId: "correlation-m1b-denial-0001",
    issuedAt: new Date(OBSERVED_AT),
    challenge: DENIAL_ARM_CHALLENGE
  });
  assert.deepEqual(Object.keys(token), [
    "schemaVersion", "challenge", "issuedAt", "expiresAt", "flow", "sequence",
    "actorRole", "operationId", "responseSchemaVersion", "expectedStatus",
    "resourceId", "expectedOfferHash", "expectedTermsHash", "disclosureRef",
    "requestId", "correlationId"
  ]);
  assert.equal(
    deriveM1BDenialResponseIdempotencyKey(DENIAL_ARM_CHALLENGE),
    "idempotency_m1b_cp_denial_11234567-89ab-4def-8123-456789abcdef"
  );
  assert.equal(
    deriveM1BAcceptanceDenialIdempotencyKey(DENIAL_ARM_CHALLENGE),
    deriveM1BDenialResponseIdempotencyKey(DENIAL_ARM_CHALLENGE)
  );
  assert.throws(
    () => createM1BDenialResponseArmToken({ ...token, expectedStatus: "withdrawn" }),
    (error) => error.code === "acceptance_operator_denial_arm_invalid"
  );
  const actionConfirmation = {
    actionType: "accept_offer",
    resourceId: token.resourceId,
    resourceHash: expectedOfferHash,
    payloadHash: sha256Json({
      expectedOfferHash,
      expectedTermsHash,
      disclosureRef: token.disclosureRef,
      sandboxOnly: true,
      productionFundsAuthority: false
    }),
    requestId: token.requestId,
    requestNonce: "human_action_confirmation_01234567-89ab-4def-8123-456789abcdef",
    requestedAt: "2026-08-15T00:00:00.000Z",
    confirmedAt: "2026-08-15T00:00:01.000Z",
    expiresAt: "2026-08-15T00:05:00.000Z",
    confirmationMethod: "wallet_personal_sign",
    confirmationHash: `0x${"d".repeat(64)}`,
    messageHash: `0x${"e".repeat(64)}`,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
  const requestProjection = {
    operationId: token.operationId,
    resource: { resourceType: "credit_offer", resourceId: token.resourceId },
    payload: {
      expectedOfferHash,
      expectedTermsHash,
      acknowledgementHash: sha256Json({
        acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
        creditOfferHash: expectedOfferHash,
        termsHash: expectedTermsHash,
        disclosureRef: token.disclosureRef,
        actionConfirmationMethod: actionConfirmation.confirmationMethod,
        actionConfirmationHash: actionConfirmation.confirmationHash,
        actionConfirmationMessageHash: actionConfirmation.messageHash,
        sandboxOnly: true,
        productionFundsAuthority: false
      }),
      actionConfirmation
    },
    requestId: token.requestId,
    correlationId: token.correlationId,
    idempotencyKey: deriveM1BDenialResponseIdempotencyKey(token.challenge),
    schemaVersion: "tenant_protocol_request.v1"
  };
  const line = JSON.stringify({
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "capital_partner",
    sequence: 4,
    requestId: token.requestId,
    correlationId: token.correlationId,
    armChallenge: token.challenge,
    requestProjection,
    response: {
      status: 404,
      code: "authorization_denied",
      requestId: token.requestId,
      schemaVersion: "problem_details.v1"
    }
  });
  const parsed = parseM1BOperatorResponseLine(line, {
    flow: "capital_partner",
    sequence: 4,
    actorRole: "human",
    operationId: "pilotAcceptCreditOffer",
    responseSchemaVersion: "problem_details.v1",
    armChallenge: token.challenge,
    denialArmToken: token,
    observedAt: OBSERVED_AT
  });
  assert.equal(Object.hasOwn(parsed, "armChallenge"), false);
  assert.deepEqual(parsed.requestProjection, requestProjection);
  assert.throws(
    () => parseM1BOperatorResponseLine(line, {
      flow: "capital_partner",
      sequence: 4,
      actorRole: "human",
      operationId: "pilotAcceptCreditOffer",
      responseSchemaVersion: "problem_details.v1",
      armChallenge:
        "m1_b_denial_response_21234567-89ab-4def-8123-456789abcdef",
      denialArmToken: token,
      observedAt: OBSERVED_AT
    }),
    (error) => error.code === "acceptance_operator_response_invalid"
  );

  for (const mutate of [
    (value) => {
      value.requestProjection.payload.actionConfirmation.payloadHash =
        `0x${"1".repeat(64)}`;
    },
    (value) => {
      value.requestProjection.payload.acknowledgementHash =
        `0x${"2".repeat(64)}`;
    }
  ]) {
    const mismatched = JSON.parse(line);
    mutate(mismatched);
    assert.throws(
      () => parseM1BOperatorResponseLine(JSON.stringify(mismatched), {
        flow: "capital_partner",
        sequence: 4,
        actorRole: "human",
        operationId: "pilotAcceptCreditOffer",
        responseSchemaVersion: "problem_details.v1",
        armChallenge: token.challenge,
        denialArmToken: token,
        observedAt: OBSERVED_AT
      }),
      (error) => error.code === "acceptance_operator_denial_request_invalid"
    );
  }
});

test("CLI environment is credential-free and binds exact actors/restart", () => {
  const environment = {
    IPO_ONE_M1_B_RELEASE_SHA: SHA,
    IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT: "2026-08-14T00:00:00.000Z",
    IPO_ONE_M1_B_TENANT_ID: "tenant_local",
    IPO_ONE_M1_B_HUMAN_ACTOR_ID: "actor_human_borrower_pilot",
    IPO_ONE_M1_B_CAPITAL_PARTNER_ACTOR_ID: "actor_capital_partner_pilot",
    IPO_ONE_PILOT_DB_SECRET_FILE: "/run/secrets/private-pilot-db-secret",
    DATABASE_URL: "postgresql://127.0.0.2:55432/ipo_one_private_pilot"
  };
  const parsed = readM1BHumanCapitalPartnerCliEnvironment(environment);
  assert.equal(parsed.candidateReleaseId, SHA);
  assert.equal(parsed.databaseUrl.includes("@"), false);
  assert.throws(
    () => readM1BHumanCapitalPartnerCliEnvironment({
      ...environment,
      DATABASE_URL:
        "postgresql://ipo_one_owner:forbidden@127.0.0.2:55432/ipo_one_private_pilot"
    }),
    (error) => error instanceof M1BHumanCapitalPartnerCliError &&
      error.code === "acceptance_environment_invalid"
  );
});

test("CLI rejects a stale Agent-after marker after any PostgreSQL restart", () => {
  assert.equal(
    assertM1BDatabasePostmasterStart(
      "2026-08-14T00:00:00.000Z",
      "2026-08-14T00:00:00.000Z"
    ),
    "2026-08-14T00:00:00.000Z"
  );
  assert.throws(
    () => assertM1BDatabasePostmasterStart(
      "2026-08-14T00:00:00.000Z",
      "2026-08-14T00:05:00.000Z"
    ),
    (error) => error instanceof M1BHumanCapitalPartnerCliError &&
      error.code === "acceptance_database_restart_mismatch"
  );
});

test("CLI exposes the exact five-step Human and ten-step CP protocols", () => {
  assert.equal(M1_B_HUMAN_OPERATOR_SEQUENCE.length, 5);
  assert.equal(M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE.length, 10);
  assert.deepEqual(
    M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE.map(([, operationId]) => operationId),
    [
      "pilotReadCapitalPartnerSelf",
      "pilotReadCapitalPartnerPassportInbox",
      "pilotAuthorCapitalPartnerOffer",
      "pilotAcceptCreditOffer",
      "pilotReadWorkspaceResume",
      "pilotReadCapitalPartnerPassportInbox",
      "pilotAuthorCapitalPartnerOffer",
      "pilotTransitionCapitalPartnerOffer",
      "pilotAcceptCreditOffer",
      "pilotReadWorkspaceResume"
    ]
  );
});

test("web normal-response arm policy cannot drift from the CLI's thirteen non-denial prompts", () => {
  const cli = [
    ...M1_B_HUMAN_OPERATOR_SEQUENCE.map((definition, index) => [
      "human",
      index + 1,
      ...definition
    ]),
    ...M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE.map((definition, index) => [
      "capital_partner",
      index + 1,
      ...definition
    ])
  ].filter(([, , , , responseSchemaVersion]) =>
    responseSchemaVersion !== "problem_details.v1"
  );
  const web = M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS
    .filter(({ flow }) => new Set(["human", "capital_partner"]).has(flow))
    .map((definition) => [
      definition.flow,
      definition.sequence,
      definition.actorRole,
      definition.operationId,
      definition.responseSchemaVersion
    ]);
  assert.equal(cli.length, 13);
  assert.deepEqual(web, cli);
});

test("web expired-Offer arm policy cannot drift from its exact two-step setup", () => {
  assert.deepEqual(
    M1_B_ACCEPTANCE_NORMAL_RESPONSE_DEFINITIONS
      .filter(({ flow }) => flow === "expired_offer_setup")
      .map(({ actorRole, operationId, responseSchemaVersion }) => [
        actorRole,
        operationId,
        responseSchemaVersion
      ]),
    M1_B_EXPIRED_OFFER_SETUP_RESPONSE_SEQUENCE
  );
});

test("CLI executable fails closed before DB access when exact environment is absent", () => {
  const result = spawnSync(process.execPath, [CLI], {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH }
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /acceptance_environment_invalid/);
});
