import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION,
  createM1BExpiredOfferSetupCapture,
  parseM1BExpiredOfferSetupResponseLine,
  produceM1BExpiredOfferSetupReceipt,
  validateM1BExpiredOfferSetupReceipt
} from "./m1-b-expired-offer-setup.js";
import {
  DEFAULT_PRIVATE_PILOT_PROFILE
} from "./private-pilot-profile.js";

const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{1,255}$/;
const MAX_CONTEXT_BYTES = 128 * 1024;
const MAX_LINE_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 768 * 1024;

export class M1BExpiredOfferSetupCliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BExpiredOfferSetupCliError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BExpiredOfferSetupCliError(code, message);
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
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === value,
    "expired_offer_cli_context_invalid",
    "Expired-Offer CLI time is invalid"
  );
  return value;
}

function actorRefHash(actorId) {
  return hashId("m1_b_acceptance_actor_reference", { actorId });
}

function assertCriticalLineage(lineage, status) {
  assert(
    exactKeys(lineage, [
      "consentId",
      "creditIntentId",
      "riskDecisionId",
      "passportArtifactId",
      "preliminaryOfferId",
      "creditOfferId",
      "creditOfferHash",
      "termsHash",
      "aggregateVersion",
      "status"
    ]) &&
      [
        lineage.consentId,
        lineage.creditIntentId,
        lineage.riskDecisionId,
        lineage.passportArtifactId,
        lineage.preliminaryOfferId,
        lineage.creditOfferId
      ].every((value) => IDENTIFIER.test(value ?? "")) &&
      HASH.test(lineage.creditOfferHash ?? "") &&
      HASH.test(lineage.termsHash ?? "") &&
      Number.isSafeInteger(lineage.aggregateVersion) &&
      lineage.aggregateVersion >= 1 &&
      lineage.status === status,
    "expired_offer_cli_context_invalid",
    "Expired-Offer CLI critical lineage is invalid"
  );
}

function assertCriticalBinding(binding, configuration) {
  assert(
    exactKeys(binding, [
      "schemaVersion",
      "artifactId",
      "sha256",
      "candidateReleaseId",
      "databaseStartedAt",
      "capturedAt",
      "subjectId",
      "borrowerActorRefHash",
      "capitalPartnerActorRefHash",
      "capitalPartnerId",
      "currentLineage",
      "withdrawalLineage"
    ]) &&
      binding.schemaVersion === "m1_b_expired_offer_critical_binding.v1" &&
      binding.artifactId === "capital_partner_critical" &&
      SHA256.test(binding.sha256 ?? "") &&
      binding.candidateReleaseId === configuration.candidateReleaseId &&
      binding.databaseStartedAt === configuration.databaseStartedAt &&
      iso(binding.capturedAt) === binding.capturedAt &&
      Date.parse(binding.capturedAt) > Date.parse(configuration.databaseStartedAt) &&
      IDENTIFIER.test(binding.subjectId ?? "") &&
      IDENTIFIER.test(binding.capitalPartnerId ?? "") &&
      binding.borrowerActorRefHash === actorRefHash(configuration.humanActorId) &&
      binding.capitalPartnerActorRefHash ===
        actorRefHash(configuration.capitalPartnerActorId),
    "expired_offer_cli_context_invalid",
    "Expired-Offer CLI critical receipt binding is invalid"
  );
  assertCriticalLineage(binding.currentLineage, "offered");
  assertCriticalLineage(binding.withdrawalLineage, "withdrawn");
  const identifiers = [binding.currentLineage, binding.withdrawalLineage]
    .flatMap((lineage) => [
      lineage.consentId,
      lineage.creditIntentId,
      lineage.riskDecisionId,
      lineage.passportArtifactId,
      lineage.preliminaryOfferId,
      lineage.creditOfferId
    ]);
  assert(
    new Set(identifiers).size === identifiers.length,
    "expired_offer_cli_context_invalid",
    "Expired-Offer CLI critical lineages are not distinct"
  );
  return binding;
}

function loopbackOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(
      "expired_offer_cli_context_invalid",
      "Expired-Offer Capital Partner origin is invalid"
    );
  }
  assert(
    parsed.protocol === "http:" &&
      new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) &&
      parsed.username === "" && parsed.password === "" &&
      parsed.pathname === "/" && parsed.search === "" && parsed.hash === "" &&
      parsed.port !== "",
    "expired_offer_cli_context_invalid",
    "Expired-Offer Capital Partner origin must be exact loopback HTTP"
  );
  return parsed.href;
}

export function readM1BExpiredOfferSetupCliContext(encoded) {
  assert(
    typeof encoded === "string" &&
      /^[A-Za-z0-9_-]+$/.test(encoded) &&
      encoded.length <= Math.ceil(MAX_CONTEXT_BYTES * 4 / 3),
    "expired_offer_cli_context_invalid",
    "Expired-Offer CLI context is invalid"
  );
  let context;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    assert(
      bytes.length >= 1 && bytes.length <= MAX_CONTEXT_BYTES &&
        bytes.toString("base64url") === encoded,
      "expired_offer_cli_context_invalid",
      "Expired-Offer CLI context encoding is not canonical"
    );
    context = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof M1BExpiredOfferSetupCliError) throw error;
    fail(
      "expired_offer_cli_context_invalid",
      "Expired-Offer CLI context is not valid JSON"
    );
  }
  assert(
    exactKeys(context, [
      "schemaVersion",
      "candidateReleaseId",
      "sourceTreeHash",
      "runtimeImageId",
      "databaseStartedAt",
      "tenantId",
      "humanActorId",
      "capitalPartnerActorId",
      "capitalPartnerOrigin",
      "capitalPartnerCriticalBinding"
    ]) &&
      context.schemaVersion === "m1_b_expired_offer_setup_cli_context.v1" &&
      SHA.test(context.candidateReleaseId ?? "") &&
      SHA.test(context.sourceTreeHash ?? "") &&
      IMAGE_ID.test(context.runtimeImageId ?? "") &&
      iso(context.databaseStartedAt) === context.databaseStartedAt &&
      context.tenantId === DEFAULT_PRIVATE_PILOT_PROFILE.tenantId &&
      context.humanActorId ===
        DEFAULT_PRIVATE_PILOT_PROFILE.identities.borrower.actorId &&
      context.capitalPartnerActorId ===
        DEFAULT_PRIVATE_PILOT_PROFILE.identities.capitalPartner.actorId &&
      context.humanActorId !== context.capitalPartnerActorId,
    "expired_offer_cli_context_invalid",
    "Expired-Offer CLI exact runtime or reviewed identities are invalid"
  );
  const capitalPartnerOrigin = loopbackOrigin(context.capitalPartnerOrigin);
  assertCriticalBinding(context.capitalPartnerCriticalBinding, context);
  return Object.freeze({
    ...context,
    capitalPartnerOrigin,
    capitalPartnerCriticalBinding: Object.freeze(
      structuredClone(context.capitalPartnerCriticalBinding)
    )
  });
}

export function readM1BExpiredOfferSetupCliEnvironment(environment) {
  assert(
    environment.IPO_ONE_PILOT_DB_SECRET_FILE ===
      M1_B_ACCEPTANCE_SECRET_MOUNT &&
      typeof environment.DATABASE_URL === "string" &&
      environment.DATABASE_URL.length <= 8_192,
    "expired_offer_cli_environment_invalid",
    "Expired-Offer CLI app-role database boundary is invalid"
  );
  let databaseUrl;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
  } catch {
    fail(
      "expired_offer_cli_environment_invalid",
      "Expired-Offer CLI database endpoint is invalid"
    );
  }
  assert(
    new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol) &&
      databaseUrl.username === "" && databaseUrl.password === "" &&
      databaseUrl.hostname.length > 0 && databaseUrl.pathname.length > 1,
    "expired_offer_cli_environment_invalid",
    "Expired-Offer CLI database endpoint must be credential-free"
  );
  return Object.freeze({
    databaseUrl: databaseUrl.toString(),
    secretPath: M1_B_ACCEPTANCE_SECRET_MOUNT
  });
}

function browserOperationExpression({
  expectedOrigin,
  bodyExpression,
  sequence
}) {
  const origin = new URL(expectedOrigin).origin;
  return `(async()=>{` +
    `if(location.origin!==${JSON.stringify(origin)})throw new Error("wrong_origin");` +
    `const csrf=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content??"";` +
    `if(!/^[A-Za-z0-9_-]{32,128}$/.test(csrf))throw new Error("csrf_unavailable");` +
    `const requestId="m1b_expired_${sequence}_request_"+crypto.randomUUID();` +
    `const correlationId="m1b_expired_${sequence}_correlation_"+crypto.randomUUID();` +
    `${bodyExpression}` +
    `const result=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{accept:"application/json, application/problem+json","content-type":"application/json","x-csrf-token":csrf,"x-request-id":requestId},body:JSON.stringify(request)});` +
    `const response=await result.json();` +
    `if(!result.ok||result.headers.get("x-request-id")!==requestId)throw new Error("operation_failed");` +
    `const output={schemaVersion:"m1_b_acceptance_operator_response.v1",flow:"expired_offer_setup",sequence:${sequence},requestId,correlationId,response};` +
    `console.log(JSON.stringify(output));return output;` +
    `})()`;
}

export function createM1BExpiredOfferInboxBrowserExpression({
  expectedOrigin
}) {
  loopbackOrigin(expectedOrigin);
  return browserOperationExpression({
    expectedOrigin,
    sequence: 1,
    bodyExpression:
      `const request={operationId:"pilotReadCapitalPartnerPassportInbox",payload:{},requestId,correlationId,schemaVersion:"tenant_protocol_request.v1"};`
  });
}

function freshInboxItem(inboxResponse, criticalBinding) {
  const priorPassportIds = new Set([
    criticalBinding.currentLineage.passportArtifactId,
    criticalBinding.withdrawalLineage.passportArtifactId
  ]);
  const candidates = inboxResponse?.items?.filter((item) =>
    item?.resource?.resourceType === "credit_passport_artifact" &&
    IDENTIFIER.test(item.resource.resourceId ?? "") &&
    !priorPassportIds.has(item.resource.resourceId) &&
    IDENTIFIER.test(item?.reviewContext?.creditIntentId ?? "") &&
    HASH.test(item?.reviewContext?.artifactHash ?? "") &&
    Number.isSafeInteger(item?.reviewContext?.artifactVersion) &&
    item.reviewContext.artifactVersion >= 1
  ) ?? [];
  assert(
    inboxResponse?.schemaVersion ===
      "tenant_capital_partner_passport_inbox_view.v1" &&
      inboxResponse.serverTruth === true && inboxResponse.readOnly === true &&
      inboxResponse.fundsAuthority === false && inboxResponse.hasMore === false &&
      candidates.length === 1,
    "expired_offer_cli_inbox_invalid",
    "Exactly one fresh bounded Passport C must be present in the Capital Partner inbox"
  );
  return Object.freeze(structuredClone(candidates[0]));
}

export function createM1BExpiredOfferAuthorBrowserExpression({
  expectedOrigin,
  inboxResponse,
  criticalBinding
}) {
  loopbackOrigin(expectedOrigin);
  const item = freshInboxItem(inboxResponse, criticalBinding);
  const passportId = item.resource.resourceId;
  const review = item.reviewContext;
  const bodyExpression =
    `const el=(id)=>{const value=document.getElementById(id);if(!(value instanceof HTMLInputElement)||value.value==="")throw new Error("missing_term_"+id);return value;};` +
    `const minor=(id)=>{const value=Number(el(id).value);if(!Number.isFinite(value)||value<0)throw new Error("invalid_term_"+id);return String(Math.round(value*100));};` +
    `const passportId=${JSON.stringify(passportId)};` +
    `const creditIntentId=${JSON.stringify(review.creditIntentId)};` +
    `const artifactHash=${JSON.stringify(review.artifactHash)};` +
    `const artifactVersion=${JSON.stringify(review.artifactVersion)};` +
    `const healthRequestId="m1b_expired_health_"+crypto.randomUUID();` +
    `const health=await fetch("/tenant/v1/healthz",{method:"GET",credentials:"omit",headers:{accept:"application/json","x-request-id":healthRequestId}});` +
    `const healthBody=await health.json();` +
    `const serverNow=Date.parse(health.headers.get("date")??"");` +
    `if(!health.ok||health.headers.get("x-request-id")!==healthRequestId||health.headers.get("cache-control")!=="no-store"||healthBody?.schemaVersion!=="tenant_transport_health.v1"||healthBody?.status!=="ready"||healthBody?.transport!=="authenticated_http_loopback"||healthBody?.public!==false||!Number.isFinite(serverNow))throw new Error("health_identity_invalid");` +
    `const validUntil=new Date(serverNow+105000).toISOString();` +
    `const terms={assetId:"urn:ipo-one:sandbox-asset:usd-cent",facilityLimitMinor:minor("capitalPartnerFacilityLimit"),approvedPrincipalMinor:minor("capitalPartnerPrincipal"),perDrawCapMinor:minor("capitalPartnerPerDrawCap"),annualRateBps:Math.round(Number(el("capitalPartnerAnnualRate").value)*100),originationFeeMinor:minor("capitalPartnerOriginationFee"),repaymentFrequency:"monthly",installmentCount:Number(el("capitalPartnerInstallments").value),firstPaymentAt:new Date(el("capitalPartnerFirstPaymentAt").value).toISOString(),maturityAt:new Date(el("capitalPartnerMaturityAt").value).toISOString(),permittedPurposeCode:"working_capital",conditions:["passport_current_at_acceptance","authority_current_at_acceptance","no_adverse_obligation_at_acceptance"],undrawnRevocationRule:"capital_partner_before_acceptance",validUntil,reasonCodes:["capital_partner_underwritten"],disclosureRef:"disclosure_capital_partner_standard_v1"};` +
    `const snapshot=JSON.stringify({creditIntentId,passportId,artifactHash,artifactVersion,terms});` +
    `const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(snapshot));` +
    `const underwritingSnapshotHash="0x"+[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");` +
    `const idempotencyKey="m1b_expired_author_idempotency_"+crypto.randomUUID();` +
    `const request={operationId:"pilotAuthorCapitalPartnerOffer",resource:{resourceType:"credit_passport_artifact",resourceId:passportId},payload:{creditIntentId,artifactHash,artifactVersion,underwritingSnapshotHash,...terms,schemaVersion:"capital_partner_offer_authoring.v1"},requestId,correlationId,idempotencyKey,schemaVersion:"tenant_protocol_request.v1"};`;
  return Object.freeze({
    freshPassportId: passportId,
    browserExpression: browserOperationExpression({
      expectedOrigin,
      sequence: 2,
      bodyExpression
    })
  });
}

function parsePreparationLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    fail(
      "expired_offer_cli_preparation_invalid",
      "Expired-Offer Human preparation acknowledgement is not JSON"
    );
  }
  assert(
    exactKeys(parsed, ["schemaVersion", "flow", "status"]) &&
      parsed.schemaVersion === "m1_b_expired_offer_setup_preparation.v1" &&
      parsed.flow === "expired_offer_setup" && parsed.status === "complete",
    "expired_offer_cli_preparation_invalid",
    "Expired-Offer Human preparation acknowledgement is invalid"
  );
  return Object.freeze({ observedAt: new Date().toISOString() });
}

class OperatorInput {
  constructor(input, errorOutput) {
    this.iterator = createInterface({
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
    const result = await this.iterator.next();
    assert(
      result.done !== true && typeof result.value === "string",
      "expired_offer_cli_input_ended",
      "Expired-Offer operator input ended before completion"
    );
    const bytes = Buffer.byteLength(result.value, "utf8");
    this.totalBytes += bytes;
    assert(
      bytes >= 1 && bytes <= MAX_LINE_BYTES &&
        this.totalBytes <= MAX_INPUT_BYTES,
      "expired_offer_cli_input_oversized",
      "Expired-Offer operator input exceeds the bounded limit"
    );
    return result.value;
  }
}

function cliArgument(argv) {
  assert(
    Array.isArray(argv) && argv.length === 2 && argv[0] === "--context",
    "expired_offer_cli_arguments_invalid",
    "Expired-Offer CLI requires one exact context"
  );
  return argv[1];
}

async function assertDatabaseStart(pool, tenantContext, expected) {
  const observed = await withM1BAcceptanceTenantRead(
    pool,
    tenantContext,
    async (client) => {
      const result = await client.query(
        "SELECT pg_postmaster_start_time() AS database_started_at"
      );
      assert(
        result.rowCount === 1,
        "expired_offer_cli_database_restart_mismatch",
        "Expired-Offer CLI PostgreSQL start time is unavailable"
      );
      return new Date(result.rows[0].database_started_at).toISOString();
    }
  );
  assert(
    observed === expected,
    "expired_offer_cli_database_restart_mismatch",
    "Expired-Offer CLI PostgreSQL does not match the sole retained restart"
  );
  return observed;
}

export async function runM1BExpiredOfferSetupCli({
  argv = process.argv.slice(2),
  environment = process.env,
  input = process.stdin,
  output = process.stdout,
  errorOutput = process.stderr
} = {}) {
  const context = readM1BExpiredOfferSetupCliContext(cliArgument(argv));
  const configuration = readM1BExpiredOfferSetupCliEnvironment(environment);
  const tenantContext = createTenantSecurityContext({
    tenantId: context.tenantId,
    actorId: context.capitalPartnerActorId,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    source: "local_test"
  });
  const pool = await createM1BAcceptanceAppPool({
    databaseUrl: configuration.databaseUrl,
    secretPath: configuration.secretPath,
    applicationName: "ipo-one-m1-b-expired-offer",
    max: 2
  });
  try {
    await assertDatabaseStart(
      pool,
      tenantContext,
      context.databaseStartedAt
    );
    const operator = new OperatorInput(input, errorOutput);
    operator.prompt(Object.freeze({
      schemaVersion: "m1_b_expired_offer_setup_prompt.v1",
      kind: "human_preparation",
      flow: "expired_offer_setup",
      actorRole: M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION.actorRole,
      operations: M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION.operations,
      instruction: M1_B_EXPIRED_OFFER_SETUP_HUMAN_PREPARATION.requirement,
      acknowledgement: Object.freeze({
        schemaVersion: "m1_b_expired_offer_setup_preparation.v1",
        flow: "expired_offer_setup",
        status: "complete"
      })
    }));
    const preparation = parsePreparationLine(await operator.nextLine());
    operator.prompt(Object.freeze({
      schemaVersion: "m1_b_expired_offer_setup_prompt.v1",
      kind: "response",
      flow: "expired_offer_setup",
      sequence: 1,
      actorRole: "capital_partner",
      operationId: "pilotReadCapitalPartnerPassportInbox",
      responseSchemaVersion: "tenant_capital_partner_passport_inbox_view.v1",
      browserExpression: createM1BExpiredOfferInboxBrowserExpression({
        expectedOrigin: context.capitalPartnerOrigin
      })
    }));
    const inbox = parseM1BExpiredOfferSetupResponseLine(
      await operator.nextLine(),
      { sequence: 1, observedAt: new Date() }
    );
    const author = createM1BExpiredOfferAuthorBrowserExpression({
      expectedOrigin: context.capitalPartnerOrigin,
      inboxResponse: inbox.response,
      criticalBinding: context.capitalPartnerCriticalBinding
    });
    operator.prompt(Object.freeze({
      schemaVersion: "m1_b_expired_offer_setup_prompt.v1",
      kind: "response",
      flow: "expired_offer_setup",
      sequence: 2,
      actorRole: "capital_partner",
      operationId: "pilotAuthorCapitalPartnerOffer",
      responseSchemaVersion: "tenant_capital_partner_offer_authored.v1",
      instruction:
        "Run the exact expression immediately in the same signed-in Capital Partner page. It uses the existing visible no-funds terms, a 105-second validity, and page-memory CSRF; it returns only request IDs and the safe protocol response.",
      freshPassportId: author.freshPassportId,
      browserExpression: author.browserExpression
    }));
    const authored = parseM1BExpiredOfferSetupResponseLine(
      await operator.nextLine(),
      { sequence: 2, observedAt: new Date() }
    );
    const capture = createM1BExpiredOfferSetupCapture({
      candidateReleaseId: context.candidateReleaseId,
      sourceTreeHash: context.sourceTreeHash,
      runtimeImageId: context.runtimeImageId,
      databaseStartedAt: context.databaseStartedAt,
      preparationObservedAt: preparation.observedAt,
      responses: [inbox, authored]
    });
    const receipt = await produceM1BExpiredOfferSetupReceipt({
      pool,
      tenantContext,
      tenantId: context.tenantId,
      borrowerActorId: context.humanActorId,
      capitalPartnerActorId: context.capitalPartnerActorId,
      candidateReleaseId: context.candidateReleaseId,
      sourceTreeHash: context.sourceTreeHash,
      runtimeImageId: context.runtimeImageId,
      databaseStartedAt: context.databaseStartedAt,
      capture,
      capitalPartnerCriticalBinding: context.capitalPartnerCriticalBinding
    });
    validateM1BExpiredOfferSetupReceipt(receipt, {
      candidateReleaseId: context.candidateReleaseId,
      sourceTreeHash: context.sourceTreeHash,
      runtimeImageId: context.runtimeImageId,
      databaseStartedAt: context.databaseStartedAt,
      capitalPartnerCriticalArtifact: {
        id: context.capitalPartnerCriticalBinding.artifactId,
        sha256: context.capitalPartnerCriticalBinding.sha256
      },
      expectedFixtureUsed: false
    });
    output.write(`${JSON.stringify(receipt)}\n`);
    return receipt;
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runM1BExpiredOfferSetupCli().catch((error) => {
    process.stderr.write(
      `M1-B expired-Offer setup failed: ${error?.code ?? "expired_offer_setup_failed"}\n`
    );
    process.exitCode = 1;
  });
}
