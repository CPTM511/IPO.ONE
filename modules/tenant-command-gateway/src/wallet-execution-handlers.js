import { DomainError } from "../../../packages/domain/src/index.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REASON_CODES = new Set(["credential_compromise", "operator_request", "security_incident"]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function closed(name, value, required) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) fail("invalid_tenant_command_payload", `${name} payload is invalid`);
  return structuredClone(value);
}

function id(name, value) {
  if (typeof value !== "string" || !ID.test(value)) {
    fail("invalid_tenant_command_payload", `${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_tenant_command_payload", `${name} is invalid`);
  }
  return value;
}

function resource(input, expectedType) {
  if (!input || input.resourceType !== expectedType || !ID.test(input.resourceId ?? "")) {
    fail("invalid_tenant_command_payload", `an exact ${expectedType} resource is required`);
  }
}

function emptyPayload(payload) {
  closed("wallet read", payload, []);
}

function normalizePrepareGrant(payload) {
  const value = closed("wallet grant preparation", payload, [
    "providerId", "accountBindingId", "chainId", "requestedExpiresAt", "sessionEpoch", "nonce"
  ]);
  id("providerId", value.providerId);
  id("accountBindingId", value.accountBindingId);
  if (
    !new Set(["eip155:84532", "eip155:1952"]).has(value.chainId) ||
    !Number.isSafeInteger(value.sessionEpoch) || value.sessionEpoch < 0 ||
    !ID.test(value.nonce) || !Number.isFinite(new Date(value.requestedExpiresAt).getTime())
  ) fail("invalid_tenant_command_payload", "wallet grant preparation payload is invalid");
  return value;
}

function normalizeExpectedHash(name, payload, key) {
  const value = closed(name, payload, [key]);
  hash(key, value[key]);
  return value;
}

function normalizePrepareExecution(payload) {
  const value = closed("wallet execution preparation", payload, ["transferIntentId"]);
  id("transferIntentId", value.transferIntentId);
  return value;
}

function normalizeApproveExecution(payload) {
  const value = closed("wallet execution approval", payload, ["preflightHash", "approvalArtifactHash"]);
  hash("preflightHash", value.preflightHash);
  hash("approvalArtifactHash", value.approvalArtifactHash);
  return value;
}

function applicationMethod(application, name) {
  if (typeof application?.[name] !== "function") {
    fail("invalid_wallet_execution_application", `wallet execution application method ${name} is unavailable`);
  }
}

function command(operationId, application, method, normalize, resourceType) {
  return Object.freeze({
    operationId,
    kind: "command",
    preflight: ({ payload, resource: inputResource }) => {
      resource(inputResource, resourceType);
      normalize(payload);
    },
    plan: async (context) => application[method]({
      ...context,
      resourceId: context.authorizationDecision.resourceId,
      payload: normalize(context.payload)
    })
  });
}

function query(operationId, application, method, normalize, resourceType) {
  return Object.freeze({
    operationId,
    kind: "query",
    preflight: ({ payload, resource: inputResource }) => {
      resource(inputResource, resourceType);
      normalize(payload);
    },
    execute: async (context) => application[method]({
      ...context,
      resourceId: context.resource.resourceId,
      payload: normalize(context.payload)
    })
  });
}

export const WALLET_EXECUTION_OPERATION_IDS = Object.freeze([
  "walletDiscoverCapabilities",
  "walletPrepareGrant",
  "walletActivateGrant",
  "walletReadGrant",
  "walletRevokeGrant",
  "walletPrepareExecution",
  "walletApproveExecution",
  "walletSubmitExecution",
  "walletReadExecution"
]);

export function createUnavailableWalletExecutionApplication() {
  const unavailable = async () => fail(
    "wallet_execution_application_not_composed",
    "the local wallet execution application has not been composed with Tenant-scoped repositories"
  );
  return Object.freeze({
    discoverCapabilities: unavailable,
    prepareGrant: unavailable,
    activateGrant: unavailable,
    readGrant: unavailable,
    revokeGrant: unavailable,
    prepareExecution: unavailable,
    approveExecution: unavailable,
    assertSubmissionDisabled: unavailable,
    readExecution: unavailable
  });
}

export function createWalletExecutionHandlers({ application, ...unknown } = {}) {
  if (Object.keys(unknown).length !== 0 || !application || typeof application !== "object") {
    fail("invalid_wallet_execution_application", "wallet execution application is required");
  }
  for (const name of [
    "discoverCapabilities", "prepareGrant", "activateGrant", "readGrant", "revokeGrant",
    "prepareExecution", "approveExecution", "assertSubmissionDisabled", "readExecution"
  ]) applicationMethod(application, name);

  const submit = command(
    "walletSubmitExecution",
    application,
    "assertSubmissionDisabled",
    (payload) => normalizeExpectedHash("wallet execution submission", payload, "preflightHash"),
    "wallet_execution"
  );
  return Object.freeze([
    query("walletDiscoverCapabilities", application, "discoverCapabilities", emptyPayload, "wallet_adapter"),
    command("walletPrepareGrant", application, "prepareGrant", normalizePrepareGrant, "subject"),
    command(
      "walletActivateGrant", application, "activateGrant",
      (payload) => normalizeExpectedHash("wallet grant activation", payload, "expectedGrantHash"),
      "delegated_wallet_grant"
    ),
    query("walletReadGrant", application, "readGrant", emptyPayload, "delegated_wallet_grant"),
    Object.freeze({
      operationId: "walletRevokeGrant",
      kind: "command",
      preflight: ({ payload, resource: inputResource }) => {
        resource(inputResource, "delegated_wallet_grant");
        emptyPayload(payload);
      },
      plan: async (context) => {
        if (!REASON_CODES.has(context.reasonCode)) {
          fail("invalid_tenant_command_payload", "wallet grant revocation reason is invalid");
        }
        return application.revokeGrant({
          ...context,
          resourceId: context.authorizationDecision.resourceId,
          payload: {}
        });
      }
    }),
    command(
      "walletPrepareExecution", application, "prepareExecution",
      normalizePrepareExecution, "delegated_wallet_grant"
    ),
    command(
      "walletApproveExecution", application, "approveExecution",
      normalizeApproveExecution, "wallet_execution"
    ),
    Object.freeze({
      ...submit,
      plan: async (context) => {
        await submit.plan(context);
        fail(
          "execution_submission_disabled_l0_local_no_funds",
          "wallet submission is disabled in the L0 local no-funds delivery profile"
        );
      }
    }),
    query("walletReadExecution", application, "readExecution", emptyPayload, "wallet_execution")
  ]);
}
