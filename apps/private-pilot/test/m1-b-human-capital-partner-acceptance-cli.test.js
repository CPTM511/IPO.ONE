import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { assertTenantProtocolRequest } from "../../../packages/api-contract/src/tenant-protocol.js";
import {
  M1BHumanCapitalPartnerCliError,
  M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE,
  M1_B_HUMAN_OPERATOR_SEQUENCE,
  assertM1BDatabasePostmasterStart,
  createM1BCapitalPartnerDenialBrowserExpression,
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

function responseLine(overrides = {}) {
  return JSON.stringify({
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "human",
    sequence: 1,
    requestId: "request-human-cli-0001",
    correlationId: "correlation-human-cli-0001",
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
      observedAt: OBSERVED_AT
    }),
    (error) => error.code === "acceptance_capture_sensitive_key"
  );
});

test("denial browser expression obtains a fresh wallet confirmation and submits a contract-valid response-only probe", async () => {
  const expectedOfferHash = `0x${"a".repeat(64)}`;
  const expectedTermsHash = `0x${"b".repeat(64)}`;
  const expression = createM1BCapitalPartnerDenialBrowserExpression({
    sequence: 4,
    creditOfferId: "credit_offer_declined_candidate",
    expectedOfferHash,
    expectedTermsHash,
    disclosureRef: "urn:ipo.one:sandbox:credit-offer-disclosure:v1",
    requestId: "request-m1b-denial-0001",
    correlationId: "correlation-m1b-denial-0001",
    idempotencyKey: "idempotency-m1b-denial-0001"
  });
  assert.match(expression, /ipo-one-csrf-token/);
  assert.match(expression, /credentials:"same-origin"/);
  assert.match(expression, /__ipoOneM1BOperationalOfferDenialConfirmation/);
  assert.match(expression, /acknowledgementVersion/);
  assert.match(expression, /r\.status!==404/);
  assert.match(expression, /authorization_denied/);
  assert.match(expression, /console\.log\(JSON\.stringify\(e\)\)/);
  assert.doesNotMatch(expression, /document\.cookie|localStorage|sessionStorage/);

  const secretCsrf = "z".repeat(43);
  const calls = [];
  const logs = [];
  const execute = new Function(
    "document",
    "fetch",
    "console",
    `return ${expression}`
  );
  const bridgeName = "__ipoOneM1BOperationalOfferDenialConfirmation";
  const previousBridge = globalThis[bridgeName];
  globalThis[bridgeName] = async (input) => ({
    actionType: "accept_offer",
    resourceId: input.resourceId,
    resourceHash: input.expectedOfferHash,
    payloadHash: `0x${"c".repeat(64)}`,
    requestId: input.requestId,
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
  });
  let result;
  try {
    result = await execute(
      {
        querySelector(selector) {
          assert.equal(selector, 'meta[name="ipo-one-csrf-token"]');
          return { content: secretCsrf };
        }
      },
      async (url, options) => {
        calls.push({ url, options });
        return {
          status: 404,
          async json() {
            return {
              status: 404,
              code: "authorization_denied",
              requestId: "request-m1b-denial-0001",
              schemaVersion: "problem_details.v1"
            };
          }
        };
      },
      { log(value) { logs.push(value); } }
    );
  } finally {
    if (previousBridge === undefined) delete globalThis[bridgeName];
    else globalThis[bridgeName] = previousBridge;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/tenant/v1/operations");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.headers["x-csrf-token"], secretCsrf);
  const submitted = JSON.parse(calls[0].options.body);
  assertTenantProtocolRequest(submitted);
  assert.equal(submitted.payload.expectedOfferHash, expectedOfferHash);
  assert.equal(submitted.payload.expectedTermsHash, expectedTermsHash);
  assert.equal(submitted.payload.actionConfirmation.confirmationMethod, "wallet_personal_sign");
  assert.equal(submitted.payload.actionConfirmation.rawSignaturePersisted, false);
  assert.deepEqual(result.requestProjection, submitted);
  assert.equal(result.response.code, "authorization_denied");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes(secretCsrf), false);
  assert.equal(logs[0].includes("x-csrf-token"), false);
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
