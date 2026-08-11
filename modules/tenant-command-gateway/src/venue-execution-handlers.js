import { DomainError } from "../../../packages/domain/src/index.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REVOCATION_REASONS = new Set([
  "credential_compromise",
  "operator_request",
  "security_incident",
  "scheduled_rotation",
  "delegate_expired"
]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function closed(name, value, required) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    fail("invalid_tenant_command_payload", `${name} payload is invalid`);
  }
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
  if (
    !input ||
    input.resourceType !== expectedType ||
    !ID.test(input.resourceId ?? "")
  ) {
    fail(
      "invalid_tenant_command_payload",
      `an exact ${expectedType} resource is required`
    );
  }
}

function emptyPayload(payload) {
  return closed("venue read", payload, []);
}

function normalizePrepareDelegate(payload) {
  const value = closed("venue delegate preparation", payload, [
    "delegateAddressHash",
    "signerReferenceHash",
    "requestedExpiresAt"
  ]);
  hash("delegateAddressHash", value.delegateAddressHash);
  hash("signerReferenceHash", value.signerReferenceHash);
  const expiresAt = new Date(value.requestedExpiresAt);
  if (
    typeof value.requestedExpiresAt !== "string" ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.toISOString() !== value.requestedExpiresAt
  ) {
    fail(
      "invalid_tenant_command_payload",
      "venue delegate expiry must be canonical ISO time"
    );
  }
  return value;
}

function normalizeExpectedHash(name, payload, key) {
  const value = closed(name, payload, [key]);
  hash(key, value[key]);
  return value;
}

function normalizePrepareExecution(payload) {
  const value = closed("venue execution preparation", payload, [
    "orderIntentId",
    "orderIntentHash"
  ]);
  id("orderIntentId", value.orderIntentId);
  hash("orderIntentHash", value.orderIntentHash);
  return value;
}

function applicationMethod(application, name) {
  if (typeof application?.[name] !== "function") {
    fail(
      "invalid_venue_execution_application",
      `venue execution application method ${name} is unavailable`
    );
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
    plan: async (context) =>
      application[method]({
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
    execute: async (context) =>
      application[method]({
        ...context,
        resourceId: context.resource.resourceId,
        payload: normalize(context.payload)
      })
  });
}

export const VENUE_EXECUTION_OPERATION_IDS = Object.freeze([
  "venueDiscoverCapabilities",
  "venueReadBinding",
  "venuePrepareDelegate",
  "venueActivateDelegate",
  "venueRevokeDelegate",
  "venuePrepareExecution",
  "venueSubmitExecution",
  "venueReadExecution"
]);

export function createUnavailableVenueExecutionApplication() {
  const unavailable = async () =>
    fail(
      "venue_execution_application_not_composed",
      "the local Venue execution application is not composed with Tenant-scoped repositories"
    );
  return Object.freeze({
    discoverCapabilities: unavailable,
    readBinding: unavailable,
    prepareDelegate: unavailable,
    assertActivationDisabled: unavailable,
    assertRevocationDisabled: unavailable,
    prepareExecution: unavailable,
    assertSubmissionDisabled: unavailable,
    readExecution: unavailable
  });
}

export function createVenueExecutionHandlers({ application, ...unknown } = {}) {
  if (
    Object.keys(unknown).length !== 0 ||
    !application ||
    typeof application !== "object"
  ) {
    fail(
      "invalid_venue_execution_application",
      "venue execution application is required"
    );
  }
  for (const name of [
    "discoverCapabilities",
    "readBinding",
    "prepareDelegate",
    "assertActivationDisabled",
    "assertRevocationDisabled",
    "prepareExecution",
    "assertSubmissionDisabled",
    "readExecution"
  ]) applicationMethod(application, name);

  const activation = command(
    "venueActivateDelegate",
    application,
    "assertActivationDisabled",
    (payload) =>
      normalizeExpectedHash(
        "venue delegate activation",
        payload,
        "expectedDelegateHash"
      ),
    "venue_delegate"
  );
  const submission = command(
    "venueSubmitExecution",
    application,
    "assertSubmissionDisabled",
    (payload) =>
      normalizeExpectedHash(
        "venue execution submission",
        payload,
        "preparedExecutionHash"
      ),
    "venue_execution"
  );

  return Object.freeze([
    query(
      "venueDiscoverCapabilities",
      application,
      "discoverCapabilities",
      emptyPayload,
      "venue_adapter"
    ),
    query(
      "venueReadBinding",
      application,
      "readBinding",
      emptyPayload,
      "venue_binding"
    ),
    command(
      "venuePrepareDelegate",
      application,
      "prepareDelegate",
      normalizePrepareDelegate,
      "venue_binding"
    ),
    Object.freeze({
      ...activation,
      plan: async (context) => {
        await activation.plan(context);
        fail(
          "venue_delegate_activation_disabled_l0_local_no_funds",
          "approveAgent and delegate activation are disabled in the local no-funds profile"
        );
      }
    }),
    Object.freeze({
      operationId: "venueRevokeDelegate",
      kind: "command",
      preflight: ({ payload, resource: inputResource }) => {
        resource(inputResource, "venue_delegate");
        emptyPayload(payload);
      },
      plan: async (context) => {
        if (!REVOCATION_REASONS.has(context.reasonCode)) {
          fail(
            "invalid_tenant_command_payload",
            "venue delegate revocation reason is invalid"
          );
        }
        await application.assertRevocationDisabled({
          ...context,
          resourceId: context.authorizationDecision.resourceId,
          payload: {}
        });
        fail(
          "venue_delegate_revocation_disabled_l0_local_no_funds",
          "external deregistration is disabled; local tombstoning remains internal Evidence"
        );
      }
    }),
    command(
      "venuePrepareExecution",
      application,
      "prepareExecution",
      normalizePrepareExecution,
      "venue_delegate"
    ),
    Object.freeze({
      ...submission,
      plan: async (context) => {
        await submission.plan(context);
        fail(
          "venue_execution_submission_disabled_l0_local_no_funds",
          "HyperCore Exchange submission is disabled in the local no-funds profile"
        );
      }
    }),
    query(
      "venueReadExecution",
      application,
      "readExecution",
      emptyPayload,
      "venue_execution"
    )
  ]);
}
