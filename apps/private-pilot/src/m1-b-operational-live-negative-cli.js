import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertM1BOperationalNegativeSafeValue,
  captureM1BOperationalLiveNegativeProof
} from "./m1-b-operational-negative-acceptance.js";

const MAX_CONTEXT_BYTES = 128 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const AUTHENTICATION_KEYS = Object.freeze([
  "method",
  "acr",
  "amr",
  "actorRefHash",
  "clientRefHash",
  "coveredAuditEventIds",
  "auditEventCount",
  "coveredRequestIds",
  "requestCount",
  "earliestAuthTime",
  "latestAuthTime",
  "activeCredentialBinding",
  "activeMembershipBinding",
  "credentialBindingCount",
  "invitationBoundCredentialRegistrationCount",
  "sessionMaterialIncluded",
  "rawSignatureIncluded",
  "walletAddressIncluded"
]);

function exactKeys(value, keys) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
  );
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function parseM1BOperationalLiveNegativeCliContext(argument) {
  if (
    typeof argument !== "string" ||
    argument.length < 8 ||
    argument.length > Math.ceil(MAX_CONTEXT_BYTES * 4 / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(argument)
  ) fail(
    "operational_live_negative_cli_context_invalid",
    "The exact live-negative context is invalid."
  );
  let bytes;
  let value;
  try {
    bytes = Buffer.from(argument, "base64url");
    if (bytes.toString("base64url") !== argument || bytes.length > MAX_CONTEXT_BYTES) {
      throw new Error("non-canonical context");
    }
    value = JSON.parse(bytes);
  } catch {
    fail(
      "operational_live_negative_cli_context_invalid",
      "The exact live-negative context is not canonical bounded JSON."
    );
  }
  if (!exactKeys(value, [
    "schemaVersion",
    "group",
    "id",
    "candidateReleaseId",
    "sourceTreeHash",
    "runtimeImageId",
    "supportingArtifacts",
    "tenantId",
    "actorId",
    "authentication",
    "databaseStartedAt",
    "resourceType",
    "resourceId"
  ]) || value.schemaVersion !== "m1_b_operational_live_negative_cli_context.v1") {
    fail(
      "operational_live_negative_cli_context_invalid",
      "The exact live-negative context shape is invalid."
    );
  }
  if (
    !SHA.test(value.candidateReleaseId ?? "") ||
    !SHA.test(value.sourceTreeHash ?? "") ||
    !IMAGE_ID.test(value.runtimeImageId ?? "") ||
    !IDENTIFIER.test(value.group ?? "") ||
    !IDENTIFIER.test(value.id ?? "") ||
    !IDENTIFIER.test(value.tenantId ?? "") ||
    !IDENTIFIER.test(value.actorId ?? "") ||
    !IDENTIFIER.test(value.resourceType ?? "") ||
    !IDENTIFIER.test(value.resourceId ?? "") ||
    !Array.isArray(value.supportingArtifacts) ||
    value.supportingArtifacts.length < 1 ||
    value.supportingArtifacts.length > 3 ||
    value.supportingArtifacts.some((artifact) =>
      !exactKeys(artifact, ["id", "sha256"]) ||
      !IDENTIFIER.test(artifact.id ?? "") ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? "")
    ) ||
    !exactKeys(value.authentication, AUTHENTICATION_KEYS) ||
    value.authentication.method !== "siwe" ||
    value.authentication.acr !== "urn:ipo.one:acr:wallet" ||
    !Array.isArray(value.authentication.amr) ||
    value.authentication.amr.length !== 3 ||
    value.authentication.amr[0] !== "wallet" ||
    value.authentication.amr[1] !== "siwe" ||
    !new Set(["eip191_eoa_v1", "erc1271_smart_wallet_v1"])
      .has(value.authentication.amr[2]) ||
    !HASH.test(value.authentication.actorRefHash ?? "") ||
    !HASH.test(value.authentication.clientRefHash ?? "") ||
    !Array.isArray(value.authentication.coveredAuditEventIds) ||
    value.authentication.coveredAuditEventIds.length < 2 ||
    value.authentication.coveredAuditEventIds.some((id) => !IDENTIFIER.test(id ?? "")) ||
    value.authentication.auditEventCount !==
      value.authentication.coveredAuditEventIds.length ||
    !Array.isArray(value.authentication.coveredRequestIds) ||
    value.authentication.coveredRequestIds.length < 2 ||
    value.authentication.coveredRequestIds.some((id) => !IDENTIFIER.test(id ?? "")) ||
    value.authentication.requestCount !==
      value.authentication.coveredRequestIds.length ||
    typeof value.authentication.earliestAuthTime !== "string" ||
    !Number.isFinite(Date.parse(value.authentication.earliestAuthTime)) ||
    typeof value.authentication.latestAuthTime !== "string" ||
    !Number.isFinite(Date.parse(value.authentication.latestAuthTime)) ||
    value.authentication.activeCredentialBinding !== true ||
    value.authentication.activeMembershipBinding !== true ||
    value.authentication.credentialBindingCount !== 1 ||
    value.authentication.invitationBoundCredentialRegistrationCount !== 1 ||
    value.authentication.sessionMaterialIncluded !== false ||
    value.authentication.rawSignatureIncluded !== false ||
    value.authentication.walletAddressIncluded !== false ||
    typeof value.databaseStartedAt !== "string" ||
    !Number.isFinite(Date.parse(value.databaseStartedAt)) ||
    new Date(value.databaseStartedAt).toISOString() !== value.databaseStartedAt
  ) fail(
    "operational_live_negative_cli_context_invalid",
    "The exact live-negative candidate, SIWE, or resource binding is invalid."
  );
  return Object.freeze(value);
}

export async function runM1BOperationalLiveNegativeCli({
  argv = process.argv.slice(2),
  environment = process.env,
  input = process.stdin,
  errorOutput = process.stderr
} = {}) {
  if (argv.length !== 2 || argv[0] !== "--context") {
    fail(
      "operational_live_negative_cli_arguments_invalid",
      "The live-negative CLI requires one canonical --context argument."
    );
  }
  const context = parseM1BOperationalLiveNegativeCliContext(argv[1]);
  const { schemaVersion: _schemaVersion, ...captureContext } = context;
  const captured = await captureM1BOperationalLiveNegativeProof({
    ...captureContext,
    databaseUrl: environment.DATABASE_URL,
    input,
    errorOutput
  });
  const result = Object.freeze({
    schemaVersion: "m1_b_operational_live_negative_cli_result.v1",
    status: "live_negative_captured",
    attemptReceipt: captured.attemptReceipt,
    negativeProof: captured.negativeProof
  });
  assertM1BOperationalNegativeSafeValue(result, "liveNegativeResult");
  return result;
}

async function main() {
  try {
    process.stdout.write(
      `${JSON.stringify(await runM1BOperationalLiveNegativeCli())}\n`
    );
  } catch (error) {
    process.stderr.write(
      `M1-B live negative: ${error?.code ?? "operational_failure"}: ` +
        `${error?.message ?? "failed"}\n`
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
