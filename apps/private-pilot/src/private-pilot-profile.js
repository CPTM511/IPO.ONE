import { readFile } from "node:fs/promises";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { DomainError } from "../../../packages/domain/src/index.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,127}$/;
const PROFILE_KEYS = Object.freeze([
  "identities",
  "mode",
  "realFundsEnabled",
  "remoteAccessEnabled",
  "riskPortfolioId",
  "schemaVersion",
  "servicingQueueId",
  "syntheticDataOnly",
  "tenantId"
]);
const IDENTITY_NAMES = Object.freeze(["agent", "borrower", "controller", "risk"]);

export const DEFAULT_PRIVATE_PILOT_PROFILE = Object.freeze({
  schemaVersion: "private_pilot_tenant_profile.v1",
  mode: "local_no_funds",
  tenantId: "tenant_ipo_one_local_pilot",
  syntheticDataOnly: true,
  realFundsEnabled: false,
  remoteAccessEnabled: false,
  riskPortfolioId: "risk_portfolio_local_private_pilot",
  servicingQueueId: "servicing_queue_local_private_pilot",
  identities: Object.freeze({
    borrower: Object.freeze({ actorId: "actor_human_borrower_pilot" }),
    controller: Object.freeze({ actorId: "actor_principal_controller_pilot" }),
    agent: Object.freeze({ actorId: "actor_agent_pilot_alpha" }),
    risk: Object.freeze({ actorId: "actor_risk_operations_pilot" })
  })
});

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  return plainObject(value) && Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key));
}

function rejectProfile() {
  throw new DomainError(
    "invalid_private_pilot_profile",
    "Private pilot profile must be a closed, synthetic-only, no-funds local Tenant profile"
  );
}

function identifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) rejectProfile();
  return value;
}

export function assertPrivatePilotProfile(input) {
  if (
    !exactKeys(input, PROFILE_KEYS) ||
    input.schemaVersion !== "private_pilot_tenant_profile.v1" ||
    input.mode !== "local_no_funds" ||
    input.syntheticDataOnly !== true ||
    input.realFundsEnabled !== false ||
    input.remoteAccessEnabled !== false ||
    !exactKeys(input.identities, IDENTITY_NAMES)
  ) rejectProfile();

  const identities = {};
  for (const name of IDENTITY_NAMES) {
    const identity = input.identities[name];
    if (!exactKeys(identity, ["actorId"])) rejectProfile();
    identities[name] = Object.freeze({ actorId: identifier(identity.actorId) });
  }
  const actorIds = Object.values(identities).map(({ actorId }) => actorId);
  if (new Set(actorIds).size !== actorIds.length) rejectProfile();

  return Object.freeze({
    schemaVersion: input.schemaVersion,
    mode: input.mode,
    tenantId: identifier(input.tenantId),
    syntheticDataOnly: true,
    realFundsEnabled: false,
    remoteAccessEnabled: false,
    riskPortfolioId: identifier(input.riskPortfolioId),
    servicingQueueId: identifier(input.servicingQueueId),
    identities: Object.freeze(identities)
  });
}

export function parsePrivatePilotProfile(source) {
  let parsed;
  try {
    parsed = parseStrictJson(source, {
      maximumBytes: 16 * 1024,
      maximumDepth: 6,
      maximumKeys: 32
    });
  } catch {
    rejectProfile();
  }
  return assertPrivatePilotProfile(parsed);
}

export async function loadPrivatePilotProfile(
  path = process.env.IPO_ONE_PILOT_PROFILE_FILE
) {
  if (path === undefined || path === "") return DEFAULT_PRIVATE_PILOT_PROFILE;
  if (typeof path !== "string" || path.length > 4_096 || /[\0\r\n]/.test(path)) rejectProfile();
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new DomainError(
      "private_pilot_profile_unavailable",
      "Private pilot profile could not be read"
    );
  }
  return parsePrivatePilotProfile(source);
}

export function privatePilotProfileSummary(profile) {
  const checked = assertPrivatePilotProfile(profile);
  return Object.freeze({
    schemaVersion: "private_pilot_profile_check.v1",
    tenantId: checked.tenantId,
    mode: checked.mode,
    identityCount: Object.keys(checked.identities).length,
    roleNames: Object.freeze([...IDENTITY_NAMES]),
    syntheticDataOnly: true,
    realFundsEnabled: false,
    remoteAccessEnabled: false,
    credentialsIncluded: false,
    privateDataIncluded: false,
    valid: true
  });
}
