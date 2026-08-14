import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTenantProtocolRequest
} from "../../../packages/api-contract/src/tenant-protocol.js";
import {
  AUTHORIZATION_POLICY_VERSION
} from "../../../modules/authorization/src/index.js";
import {
  createTenantSecurityContext
} from "../../../modules/persistence/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createM1BAcceptanceAppPool,
  M1_B_ACCEPTANCE_SECRET_MOUNT,
  withM1BAcceptanceTenantRead
} from "./m1-b-acceptance-postgres.js";
import {
  captureM1BCapitalPartnerDenialBoundary,
  hashM1BAcceptanceManifest,
  inspectM1BResponseOnlyOperation,
  readM1BAuthorizationResourceLocator,
  readM1BCommandProof
} from "./m1-b-human-capital-partner-acceptance.js";
import {
  produceM1BCapitalPartnerCriticalReceipt,
  produceM1BHumanCriticalReceipt
} from "./m1-b-human-capital-partner-producer.js";

const SHA = /^[0-9a-f]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const MAX_LINE_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024;

export const M1_B_HUMAN_OPERATOR_SEQUENCE = Object.freeze([
  Object.freeze(["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"]),
  Object.freeze(["human", "pilotAcceptCreditOffer", "tenant_credit_offer_accepted.v1"]),
  Object.freeze(["human", "pilotExecuteSandboxObligation", "tenant_sandbox_obligation_executed.v1"]),
  Object.freeze(["human", "pilotPostSandboxRepayment", "tenant_sandbox_repayment_posted.v1"]),
  Object.freeze(["human", "pilotReadOwnObligationEvidence", "tenant_owned_obligation_evidence_view.v1"])
]);

export const M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE = Object.freeze([
  Object.freeze(["capital_partner", "pilotReadCapitalPartnerSelf", "tenant_capital_partner_self_view.v1"]),
  Object.freeze(["capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1"]),
  Object.freeze(["capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1"]),
  Object.freeze(["human", "pilotAcceptCreditOffer", "problem_details.v1"]),
  Object.freeze(["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"]),
  Object.freeze(["capital_partner", "pilotReadCapitalPartnerPassportInbox", "tenant_capital_partner_passport_inbox_view.v1"]),
  Object.freeze(["capital_partner", "pilotAuthorCapitalPartnerOffer", "tenant_capital_partner_offer_authored.v1"]),
  Object.freeze(["capital_partner", "pilotTransitionCapitalPartnerOffer", "tenant_capital_partner_offer_transitioned.v1"]),
  Object.freeze(["human", "pilotAcceptCreditOffer", "problem_details.v1"]),
  Object.freeze(["human", "pilotReadWorkspaceResume", "tenant_workspace_resume_view.v2"])
]);

export class M1BHumanCapitalPartnerCliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BHumanCapitalPartnerCliError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BHumanCapitalPartnerCliError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  return plainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function iso(value) {
  const parsed = new Date(value);
  assert(
    Number.isFinite(parsed.getTime()),
    "acceptance_operator_time_invalid",
    "Operator response time is invalid"
  );
  return parsed.toISOString();
}

function environmentIdentifier(environment, name) {
  const value = environment[name];
  assert(
    IDENTIFIER.test(value ?? ""),
    "acceptance_environment_invalid",
    `${name} is missing or invalid`
  );
  return value;
}

export function readM1BHumanCapitalPartnerCliEnvironment(environment) {
  const candidateReleaseId = environment.IPO_ONE_M1_B_RELEASE_SHA;
  const databaseStartedAt = environment.IPO_ONE_M1_B_EXPECTED_DATABASE_STARTED_AT;
  const tenantId = environmentIdentifier(environment, "IPO_ONE_M1_B_TENANT_ID");
  const humanActorId = environmentIdentifier(
    environment,
    "IPO_ONE_M1_B_HUMAN_ACTOR_ID"
  );
  const capitalPartnerActorId = environmentIdentifier(
    environment,
    "IPO_ONE_M1_B_CAPITAL_PARTNER_ACTOR_ID"
  );
  assert(
    SHA.test(candidateReleaseId ?? "") &&
      Number.isFinite(Date.parse(databaseStartedAt ?? "")) &&
      humanActorId !== capitalPartnerActorId &&
      environment.IPO_ONE_PILOT_DB_SECRET_FILE === M1_B_ACCEPTANCE_SECRET_MOUNT &&
      typeof environment.DATABASE_URL === "string" &&
      environment.DATABASE_URL.length <= 8_192,
    "acceptance_environment_invalid",
    "Exact candidate, restart, actors, database endpoint, or secret mount is invalid"
  );
  let databaseUrl;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
  } catch {
    fail("acceptance_environment_invalid", "The database endpoint is invalid");
  }
  assert(
    new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol) &&
      databaseUrl.username === "" &&
      databaseUrl.password === "" &&
      databaseUrl.hostname.length > 0 &&
      databaseUrl.pathname.length > 1,
    "acceptance_environment_invalid",
    "The producer database endpoint must not contain credentials"
  );
  return Object.freeze({
    candidateReleaseId,
    databaseStartedAt: new Date(databaseStartedAt).toISOString(),
    tenantId,
    humanActorId,
    capitalPartnerActorId,
    databaseUrl: databaseUrl.toString(),
    secretPath: M1_B_ACCEPTANCE_SECRET_MOUNT
  });
}

function parseLine(line) {
  assert(
    typeof line === "string" &&
      line.length > 0 &&
      Buffer.byteLength(line, "utf8") <= MAX_LINE_BYTES,
    "acceptance_operator_line_invalid",
    "Operator input must be one bounded NDJSON line"
  );
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    fail("acceptance_operator_line_invalid", "Operator input is not valid JSON");
  }
  assert(
    plainObject(parsed),
    "acceptance_operator_line_invalid",
    "Operator input must be one JSON object"
  );
  return parsed;
}

export function parseM1BOperatorResponseLine(line, {
  flow,
  sequence,
  operationId,
  responseSchemaVersion,
  actorRole,
  observedAt
}) {
  const parsed = parseLine(line);
  const denialResponse = responseSchemaVersion === "problem_details.v1";
  assert(
    exactKeys(parsed, denialResponse ? [
      "schemaVersion",
      "flow",
      "sequence",
      "requestId",
      "correlationId",
      "requestProjection",
      "response"
    ] : [
      "schemaVersion",
      "flow",
      "sequence",
      "requestId",
      "correlationId",
      "response"
    ]) &&
      parsed.schemaVersion === "m1_b_acceptance_operator_response.v1" &&
      parsed.flow === flow &&
      parsed.sequence === sequence &&
      REQUEST_IDENTIFIER.test(parsed.requestId ?? "") &&
      REQUEST_IDENTIFIER.test(parsed.correlationId ?? "") &&
      plainObject(parsed.response),
    "acceptance_operator_response_invalid",
    `Operator response ${flow}:${sequence} is invalid`
  );
  let requestProjection;
  if (denialResponse) {
    try {
      assertTenantProtocolRequest(parsed.requestProjection);
    } catch {
      fail(
        "acceptance_operator_denial_request_invalid",
        "Denied Offer request projection does not satisfy the exact protocol contract"
      );
    }
    requestProjection = Object.freeze(structuredClone(parsed.requestProjection));
    assert(
      requestProjection.operationId === operationId &&
        requestProjection.requestId === parsed.requestId &&
        requestProjection.correlationId === parsed.correlationId &&
        requestProjection.resource?.resourceType === "credit_offer" &&
        REQUEST_IDENTIFIER.test(requestProjection.idempotencyKey ?? "") &&
        requestProjection.payload?.actionConfirmation?.confirmationMethod ===
          "wallet_personal_sign" &&
        requestProjection.payload.actionConfirmation.requestId === parsed.requestId &&
        requestProjection.payload.actionConfirmation.resourceId ===
          requestProjection.resource.resourceId &&
        requestProjection.payload.actionConfirmation.resourceHash ===
          requestProjection.payload.expectedOfferHash &&
        requestProjection.payload.actionConfirmation.rawSignaturePersisted === false &&
        requestProjection.payload.actionConfirmation.blockchainTransactionSubmitted === false,
      "acceptance_operator_denial_request_invalid",
      "Denied Offer request projection is not bound to the fresh wallet confirmation"
    );
  }
  inspectM1BResponseOnlyOperation({
    operationId,
    responseSchemaVersion,
    response: parsed.response
  });
  return Object.freeze({
    sequence,
    actorRole,
    operationId,
    requestId: parsed.requestId,
    correlationId: parsed.correlationId,
    responseSchemaVersion,
    capturedAt: iso(observedAt),
    ...(requestProjection ? {
      requestProjection,
      requestProjectionHash: hashM1BAcceptanceManifest(requestProjection)
    } : {}),
    response: Object.freeze(structuredClone(parsed.response))
  });
}

export function parseM1BOperatorPreparationLine(line, {
  lineage,
  observedAt
}) {
  const parsed = parseLine(line);
  assert(
    exactKeys(parsed, ["schemaVersion", "flow", "lineage", "status"]) &&
      parsed.schemaVersion === "m1_b_acceptance_operator_preparation.v1" &&
      parsed.flow === "capital_partner" &&
      new Set(["current", "withdrawal"]).has(lineage) &&
      parsed.lineage === lineage &&
      parsed.status === "complete",
    "acceptance_operator_preparation_invalid",
    `Capital Partner ${lineage} preparation acknowledgement is invalid`
  );
  return Object.freeze({
    lineage,
    observedAt: iso(observedAt)
  });
}

class OperatorNdjson {
  constructor(input, errorOutput) {
    this.lines = createInterface({
      input,
      crlfDelay: Infinity,
      terminal: false,
      historySize: 0
    })[Symbol.asyncIterator]();
    this.errorOutput = errorOutput;
    this.totalBytes = 0;
  }

  prompt(value) {
    this.errorOutput.write(`${JSON.stringify(value)}\n`);
  }

  async nextLine() {
    const next = await this.lines.next();
    assert(
      next.done !== true,
      "acceptance_operator_input_ended",
      "Operator input ended before acceptance was complete"
    );
    const bytes = Buffer.byteLength(next.value, "utf8");
    this.totalBytes += bytes;
    assert(
      bytes <= MAX_LINE_BYTES && this.totalBytes <= MAX_INPUT_BYTES,
      "acceptance_operator_input_too_large",
      "Operator input exceeds the bounded in-memory acceptance limit"
    );
    return next.value;
  }

  async response(flow, sequence, definition) {
    const [actorRole, operationId, responseSchemaVersion] = definition;
    this.prompt({
      schemaVersion: "m1_b_acceptance_operator_prompt.v1",
      kind: "response",
      flow,
      sequence,
      actorRole,
      operationId,
      responseSchemaVersion
    });
    const line = await this.nextLine();
    const observedAt = new Date();
    return parseM1BOperatorResponseLine(line, {
      flow,
      sequence,
      operationId,
      responseSchemaVersion,
      actorRole,
      observedAt
    });
  }

  async preparation(lineage) {
    this.prompt({
      schemaVersion: "m1_b_acceptance_operator_prompt.v1",
      kind: "human_preparation",
      flow: "capital_partner",
      lineage,
      actorRole: "human",
      operations: [
        "pilotCreateConsent",
        "pilotReadHumanSelf",
        "pilotRequestCredit",
        "pilotReadCreditApplication",
        "pilotEvaluateCreditApplication",
        "pilotCreateCreditPassportArtifact"
      ],
      instruction: lineage === "current"
        ? "In the signed-in Human UI, start another request, create a fresh scoped Consent, request and evaluate credit, then issue one Passport to the exact Capital Partner actor. Submit only the completion acknowledgement; no response, token, signature, claims, disclosures, or issuer data."
        : "After recovering the current Capital Partner Offer, repeat the signed-in Human UI path with a fresh Consent and issue a distinct Passport to the same Capital Partner. Do not read workspace again until the second Offer is withdrawn. Submit only the completion acknowledgement."
    });
    const line = await this.nextLine();
    return parseM1BOperatorPreparationLine(line, {
      lineage,
      observedAt: new Date()
    });
  }

}

function tenantContext(tenantId, actorId) {
  return createTenantSecurityContext({
    tenantId,
    actorId,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    source: "local_test"
  });
}

export function assertM1BDatabasePostmasterStart(expected, observed) {
  const expectedIso = iso(expected);
  const observedIso = iso(observed);
  assert(
    expectedIso === observedIso,
    "acceptance_database_restart_mismatch",
    "PostgreSQL start time does not match the sole Agent-after restart"
  );
  return observedIso;
}

async function readDatabasePostmasterStart(readTenant, expected) {
  const observed = await readTenant(async (client) => {
    const result = await client.query(
      "SELECT pg_postmaster_start_time() AS database_started_at"
    );
    assert(
      result.rowCount === 1,
      "acceptance_database_restart_mismatch",
      "PostgreSQL start time is unavailable"
    );
    return result.rows[0].database_started_at;
  });
  return assertM1BDatabasePostmasterStart(expected, observed);
}

function capture(flow, candidateReleaseId, databaseStartedAt, responses) {
  const last = responses.at(-1);
  assert(
    last && Date.parse(last.capturedAt) >= Date.parse(databaseStartedAt),
    "acceptance_operator_response_invalid",
    `${flow} capture does not occur after the exact restart`
  );
  return {
    schemaVersion: flow === "human"
      ? "m1_b_human_response_capture.v1"
      : "m1_b_capital_partner_response_capture.v1",
    candidateReleaseId,
    capturedAt: last.capturedAt,
    databaseStartedAt,
    role: flow,
    responses
  };
}

async function readAuthorReplacementOfferId({
  readTenant,
  tenantId,
  actorId,
  entry
}) {
  const inspected = inspectM1BResponseOnlyOperation({
    operationId: entry.operationId,
    responseSchemaVersion: entry.responseSchemaVersion,
    response: entry.response
  });
  return readTenant(async (client) => {
    const resource = await readM1BAuthorizationResourceLocator(client, {
      tenantId,
      actorId,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId
    });
    const proof = await readM1BCommandProof(client, {
      tenantId,
      actorId,
      operationId: entry.operationId,
      requestId: entry.requestId,
      correlationId: entry.correlationId,
      ...resource,
      responseSchemaVersion: entry.responseSchemaVersion,
      safeResponse: inspected.response,
      capturedRawResponseHash: inspected.rawResponseHash,
      capturedAt: entry.capturedAt
    });
    const transition = proof.eventManifest[0];
    const created = proof.eventManifest[1];
    assert(
      proof.eventManifest.length === 2 &&
        transition.eventType === "credit_offer_status_changed" &&
        transition.payloadProjection?.previousStatus === "offered" &&
        transition.payloadProjection?.nextStatus === "declined" &&
        transition.payloadProjection?.replacementOfferId ===
          inspected.response.offer?.creditOfferId &&
        created.eventType === "credit_offer_created" &&
        created.payloadProjection?.creditOfferId ===
          inspected.response.offer?.creditOfferId,
      "acceptance_operator_author_lineage_invalid",
      "Capital Partner author response does not bind one replaced preliminary Offer"
    );
    return transition.payloadProjection.creditOfferId;
  });
}

async function readExactHumanClientId({
  readTenant,
  tenantId,
  actorId,
  authentication
}) {
  const auditEventIds = authentication.coveredAuditEventIds;
  return readTenant(async (client) => {
    const result = await client.query(
      `SELECT a.id AS audit_event_id, min(s.client_id) AS client_id,
              count(s.*)::int AS session_match_count
         FROM authorization_audit_events a
         JOIN authentication_sessions s
           ON s.tenant_id = a.tenant_id AND s.actor_id = a.actor_id
          AND s.token_jti_ref_hash = a.token_jti_hash
        WHERE a.tenant_id = $1 AND a.actor_id = $2
          AND a.id = ANY($3::text[])
        GROUP BY a.id
        ORDER BY a.id`,
      [tenantId, actorId, auditEventIds]
    );
    const clientIds = new Set(result.rows.map(({ client_id: clientId }) => clientId));
    const clientId = result.rows[0]?.client_id;
    assert(
      result.rowCount === auditEventIds.length &&
        result.rows.every(({ session_match_count: count }) => Number(count) === 1) &&
        clientIds.size === 1 &&
        IDENTIFIER.test(clientId ?? "") &&
        hashId("m1_b_acceptance_client_reference", { clientId }) ===
          authentication.clientRefHash,
      "acceptance_operator_client_binding_invalid",
      "Human denial capture does not bind the exact invited SIWE client"
    );
    return clientId;
  });
}

function requestToken(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function createM1BCapitalPartnerDenialBrowserExpression({
  sequence,
  creditOfferId,
  expectedOfferHash,
  expectedTermsHash,
  disclosureRef,
  requestId,
  correlationId,
  idempotencyKey
}) {
  assert(
    new Set([4, 9]).has(sequence) &&
      IDENTIFIER.test(creditOfferId ?? "") &&
      /^0x[0-9a-f]{64}$/.test(expectedOfferHash ?? "") &&
      /^0x[0-9a-f]{64}$/.test(expectedTermsHash ?? "") &&
      IDENTIFIER.test(disclosureRef ?? "") &&
      REQUEST_IDENTIFIER.test(requestId ?? "") &&
      REQUEST_IDENTIFIER.test(correlationId ?? "") &&
      REQUEST_IDENTIFIER.test(idempotencyKey ?? ""),
    "acceptance_operator_denial_request_invalid",
    "Denial browser expression input is invalid"
  );
  const confirmationRequest = {
    schemaVersion: "m1_b_operational_offer_denial_confirmation_request.v1",
    operationId: "pilotAcceptCreditOffer",
    resourceId: creditOfferId,
    expectedOfferHash,
    expectedTermsHash,
    disclosureRef,
    requestId
  };
  const envelope = {
    schemaVersion: "m1_b_acceptance_operator_response.v1",
    flow: "capital_partner",
    sequence,
    requestId,
    correlationId
  };
  return `(async()=>{const c=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;if(!/^[A-Za-z0-9_-]{32,128}$/.test(c??""))throw new Error("Fresh invited Human SIWE session required");const f=globalThis.__ipoOneM1BOperationalOfferDenialConfirmation;if(typeof f!=="function")throw new Error("Local wallet confirmation bridge unavailable");const i=${JSON.stringify(confirmationRequest)};const a=await f(i);const h=async v=>{const d=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return "0x"+[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};const k=await h(JSON.stringify({acknowledgementVersion:"human_credit_offer_acknowledgement.v1",creditOfferHash:i.expectedOfferHash,termsHash:i.expectedTermsHash,disclosureRef:i.disclosureRef,actionConfirmationMethod:a.confirmationMethod,actionConfirmationHash:a.confirmationHash,actionConfirmationMessageHash:a.messageHash,sandboxOnly:true,productionFundsAuthority:false}));const q={operationId:i.operationId,resource:{resourceType:"credit_offer",resourceId:i.resourceId},payload:{expectedOfferHash:i.expectedOfferHash,expectedTermsHash:i.expectedTermsHash,acknowledgementHash:k,actionConfirmation:a},requestId:i.requestId,correlationId:${JSON.stringify(correlationId)},idempotencyKey:${JSON.stringify(idempotencyKey)},schemaVersion:"tenant_protocol_request.v1"};const r=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{accept:"application/json, application/problem+json","content-type":"application/json","x-csrf-token":c,"x-request-id":q.requestId},body:JSON.stringify(q)});const b=await r.json();if(r.status!==404||b?.schemaVersion!=="problem_details.v1"||b?.code!=="authorization_denied"||b?.requestId!==q.requestId)throw new Error("Offer acceptance did not fail closed");const e={...${JSON.stringify(envelope)},requestProjection:q,response:b};console.log(JSON.stringify(e));return e;})()`;
}

async function captureOneDenial({
  operator,
  sequence,
  expectedStatus,
  creditOfferId,
  readBorrower,
  tenantId,
  humanActorId,
  clientId
}) {
  const request = Object.freeze({
    requestId: requestToken("request_m1b_cp_denial"),
    correlationId: requestToken("correlation_m1b_cp_denial"),
    clientId,
    idempotencyKey: requestToken("idempotency_m1b_cp_denial")
  });
  const target = Object.freeze({
    creditOfferId,
    expectedStatus,
    ...request
  });
  let responseEntry;
  const [proof] = await captureM1BCapitalPartnerDenialBoundary({
    readTenant: readBorrower,
    tenantId,
    actorId: humanActorId,
    targets: [target],
    async performDenials(_targets, baseline) {
      const protectedOffer = baseline?.states?.[0]?.creditOffer;
      assert(
        protectedOffer?.creditOfferId === creditOfferId &&
          /^0x[0-9a-f]{64}$/.test(protectedOffer.creditOfferHash ?? "") &&
          /^0x[0-9a-f]{64}$/.test(protectedOffer.termsHash ?? "") &&
          IDENTIFIER.test(protectedOffer.disclosureRef ?? ""),
        "acceptance_operator_denial_target_invalid",
        "Denied Offer confirmation is not bound to the protected PostgreSQL Offer"
      );
      operator.prompt({
        schemaVersion: "m1_b_acceptance_operator_prompt.v1",
        kind: "denial_response_ready",
        flow: "capital_partner",
        sequence,
        actorRole: "human",
        operationId: "pilotAcceptCreditOffer",
        responseSchemaVersion: "problem_details.v1",
        creditOfferId,
        expectedStatus,
        browserExpression: createM1BCapitalPartnerDenialBrowserExpression({
          sequence,
          creditOfferId,
          expectedOfferHash: protectedOffer.creditOfferHash,
          expectedTermsHash: protectedOffer.termsHash,
          disclosureRef: protectedOffer.disclosureRef,
          requestId: request.requestId,
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey
        })
      });
      const line = await operator.nextLine();
      const observedAt = new Date();
      responseEntry = parseM1BOperatorResponseLine(line, {
        flow: "capital_partner",
        sequence,
        operationId: "pilotAcceptCreditOffer",
        responseSchemaVersion: "problem_details.v1",
        actorRole: "human",
        observedAt
      });
      assert(
        responseEntry.requestId === request.requestId &&
          responseEntry.correlationId === request.correlationId &&
          responseEntry.requestProjection.resource.resourceId === creditOfferId,
        "acceptance_operator_denial_request_invalid",
        "Denial response does not match the pre-snapshot request metadata"
      );
      return [{
        creditOfferId,
        requestId: responseEntry.requestId,
        correlationId: responseEntry.correlationId,
        responseSchemaVersion: responseEntry.responseSchemaVersion,
        capturedAt: responseEntry.capturedAt,
        requestProjection: responseEntry.requestProjection,
        requestProjectionHash: responseEntry.requestProjectionHash,
        response: responseEntry.response
      }];
    }
  });
  return Object.freeze({ responseEntry, proof });
}

export async function runM1BHumanCapitalPartnerAcceptanceCli({
  environment = process.env,
  input = process.stdin,
  output = process.stdout,
  errorOutput = process.stderr
} = {}) {
  const configuration = readM1BHumanCapitalPartnerCliEnvironment(environment);
  const pool = await createM1BAcceptanceAppPool({
    databaseUrl: configuration.databaseUrl,
    secretPath: configuration.secretPath,
    applicationName: "ipo-one-m1-b-human-capital-partner",
    max: 2
  });
  const humanContext = tenantContext(
    configuration.tenantId,
    configuration.humanActorId
  );
  const capitalPartnerContext = tenantContext(
    configuration.tenantId,
    configuration.capitalPartnerActorId
  );
  const readHuman = (operation) => withM1BAcceptanceTenantRead(
    pool,
    humanContext,
    operation
  );
  const readCapitalPartner = (operation) => withM1BAcceptanceTenantRead(
    pool,
    capitalPartnerContext,
    operation
  );
  const operator = new OperatorNdjson(input, errorOutput);
  try {
    const databasePostmasterStartedAt = await readDatabasePostmasterStart(
      readHuman,
      configuration.databaseStartedAt
    );
    const humanResponses = [];
    for (const [index, definition] of M1_B_HUMAN_OPERATOR_SEQUENCE.entries()) {
      humanResponses.push(await operator.response("human", index + 1, definition));
    }
    let humanCapture = capture(
      "human",
      configuration.candidateReleaseId,
      configuration.databaseStartedAt,
      humanResponses
    );
    const humanReceipt = await readHuman((client) =>
      produceM1BHumanCriticalReceipt({
        client,
        tenantId: configuration.tenantId,
        actorId: configuration.humanActorId,
        candidateReleaseId: configuration.candidateReleaseId,
        databaseStartedAt: configuration.databaseStartedAt,
        capture: humanCapture
      })
    );
    const humanClientId = await readExactHumanClientId({
      readTenant: readHuman,
      tenantId: configuration.tenantId,
      actorId: configuration.humanActorId,
      authentication: humanReceipt.authentication
    });
    humanCapture = undefined;
    humanResponses.length = 0;

    const currentPreparation = await operator.preparation("current");
    const capitalPartnerResponses = [];
    for (const sequence of [1, 2, 3]) {
      capitalPartnerResponses.push(await operator.response(
        "capital_partner",
        sequence,
        M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE[sequence - 1]
      ));
    }
    const preliminaryOfferId = await readAuthorReplacementOfferId({
      readTenant: readCapitalPartner,
      tenantId: configuration.tenantId,
      actorId: configuration.capitalPartnerActorId,
      entry: capitalPartnerResponses[2]
    });
    const stale = await captureOneDenial({
      operator,
      sequence: 4,
      expectedStatus: "declined",
      creditOfferId: preliminaryOfferId,
      readBorrower: readHuman,
      tenantId: configuration.tenantId,
      humanActorId: configuration.humanActorId,
      clientId: humanClientId
    });
    capitalPartnerResponses.push(stale.responseEntry);
    capitalPartnerResponses.push(await operator.response(
      "capital_partner",
      5,
      M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE[4]
    ));
    const withdrawalPreparation = await operator.preparation("withdrawal");
    for (const sequence of [6, 7, 8]) {
      capitalPartnerResponses.push(await operator.response(
        "capital_partner",
        sequence,
        M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE[sequence - 1]
      ));
    }
    const authoredWithdrawalOfferId = inspectM1BResponseOnlyOperation({
      operationId: capitalPartnerResponses[6].operationId,
      responseSchemaVersion: capitalPartnerResponses[6].responseSchemaVersion,
      response: capitalPartnerResponses[6].response
    }).response.offer?.creditOfferId;
    assert(
      IDENTIFIER.test(authoredWithdrawalOfferId ?? "") &&
        capitalPartnerResponses[7].response.offer?.creditOfferId ===
          authoredWithdrawalOfferId &&
        capitalPartnerResponses[7].response.offer?.status === "withdrawn",
      "acceptance_operator_withdrawal_lineage_invalid",
      "Capital Partner withdrawal does not bind its authored Offer"
    );
    const withdrawn = await captureOneDenial({
      operator,
      sequence: 9,
      expectedStatus: "withdrawn",
      creditOfferId: authoredWithdrawalOfferId,
      readBorrower: readHuman,
      tenantId: configuration.tenantId,
      humanActorId: configuration.humanActorId,
      clientId: humanClientId
    });
    capitalPartnerResponses.push(withdrawn.responseEntry);
    capitalPartnerResponses.push(await operator.response(
      "capital_partner",
      10,
      M1_B_CAPITAL_PARTNER_OPERATOR_SEQUENCE[9]
    ));
    let capitalPartnerCapture = capture(
      "capital_partner",
      configuration.candidateReleaseId,
      configuration.databaseStartedAt,
      capitalPartnerResponses
    );
    const capitalPartnerReceipt = await readCapitalPartner((client) =>
      produceM1BCapitalPartnerCriticalReceipt({
        client,
        tenantId: configuration.tenantId,
        capitalPartnerActorId: configuration.capitalPartnerActorId,
        borrowerActorId: configuration.humanActorId,
        candidateReleaseId: configuration.candidateReleaseId,
        databaseStartedAt: configuration.databaseStartedAt,
        capture: capitalPartnerCapture,
        denialProofs: [stale.proof, withdrawn.proof],
        humanReceiptBinding: {
          schemaVersion: "m1_b_human_critical_receipt_binding.v1",
          candidateReleaseId: configuration.candidateReleaseId,
          receiptHash: hashM1BAcceptanceManifest(humanReceipt),
          capturedAt: humanReceipt.capturedAt,
          subjectId: humanReceipt.linkage.subjectId,
          actorRefHash: humanReceipt.actorScope.actorRefHash
        },
        preparationMarkers: {
          schemaVersion: "m1_b_capital_partner_preparation_markers.v1",
          currentObservedAt: currentPreparation.observedAt,
          withdrawalObservedAt: withdrawalPreparation.observedAt
        }
      })
    );
    capitalPartnerCapture = undefined;
    capitalPartnerResponses.length = 0;
    const result = Object.freeze({
      schemaVersion: "m1_b_human_capital_partner_acceptance_bundle.v1",
      candidateReleaseId: configuration.candidateReleaseId,
      databaseStartedAt: configuration.databaseStartedAt,
      databasePostmasterStartedAt: await readDatabasePostmasterStart(
        readHuman,
        configuration.databaseStartedAt
      ),
      human: humanReceipt,
      capitalPartner: capitalPartnerReceipt
    });
    assert(
      result.databasePostmasterStartedAt === databasePostmasterStartedAt,
      "acceptance_database_restart_mismatch",
      "PostgreSQL restarted during Human/Capital Partner acceptance"
    );
    output.write(`${JSON.stringify(result)}\n`);
    return result;
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runM1BHumanCapitalPartnerAcceptanceCli().catch((error) => {
    const code = error instanceof M1BHumanCapitalPartnerCliError
      ? error.code
      : error?.code ?? "human_capital_partner_acceptance_failed";
    process.stderr.write(`M1-B Human/Capital Partner acceptance failed: ${code}\n`);
    process.exitCode = 1;
  });
}
