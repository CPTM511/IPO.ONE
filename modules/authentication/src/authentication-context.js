import {
  AUTHENTICATION_CONTEXT_SCHEMA_VERSION,
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "./constants.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import {
  assertBoundedString,
  assertSafeIdentifier,
  assertStringList,
  deepFreeze
} from "./security-utils.js";

const trustedAuthenticationContexts = new WeakSet();
const ACTOR_TYPES = new Set(Object.values(ActorType));
const AUTHENTICATION_METHODS = new Set(Object.values(ClientAuthenticationMethod));
const SENDER_CONSTRAINT_METHODS = new Set(Object.values(SenderConstraintMethod));

function timestamp(name, value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_authentication_context", `${name} must be a valid timestamp`);
  }
  return parsed.toISOString();
}

export function createAuthenticationContext(input) {
  const actorType = assertSafeIdentifier("actorType", input.actorType);
  const authenticationMethod = assertSafeIdentifier("authenticationMethod", input.authenticationMethod);
  const senderConstraintMethod = assertSafeIdentifier("senderConstraintMethod", input.senderConstraintMethod);
  if (
    !ACTOR_TYPES.has(actorType) ||
    !AUTHENTICATION_METHODS.has(authenticationMethod) ||
    !SENDER_CONSTRAINT_METHODS.has(senderConstraintMethod)
  ) {
    throw new DomainError("invalid_authentication_context", "Authentication Context profile is invalid");
  }
  const context = {
    tenantId: assertSafeIdentifier("tenantId", input.tenantId),
    actorId: assertSafeIdentifier("actorId", input.actorId),
    actorType,
    clientId: assertSafeIdentifier("clientId", input.clientId),
    credentialId: assertSafeIdentifier("credentialId", input.credentialId),
    credentialVersion: input.credentialVersion,
    policyVersion: assertSafeIdentifier("policyVersion", input.policyVersion),
    capabilities: assertStringList("capabilities", input.capabilities ?? []),
    roles: assertStringList("roles", input.roles ?? [], { maximumItems: 16 }),
    tokenJtiHash: assertBoundedString("tokenJtiHash", input.tokenJtiHash, { minimum: 32, maximum: 128 }),
    authenticationMethod,
    senderConstraintMethod,
    authenticatedAt: timestamp("authenticatedAt", input.authenticatedAt),
    authTime: input.authTime === undefined ? undefined : timestamp("authTime", input.authTime),
    acr: input.acr === undefined
      ? undefined
      : assertBoundedString("acr", input.acr, { maximum: 128 }),
    amr: assertStringList("amr", input.amr ?? [], {
      maximumItems: 8,
      itemPattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
    }),
    authorizationDecision: "not_evaluated",
    schemaVersion: AUTHENTICATION_CONTEXT_SCHEMA_VERSION
  };
  if (!Number.isSafeInteger(context.credentialVersion) || context.credentialVersion < 1) {
    throw new DomainError("invalid_authentication_context", "credentialVersion must be a positive integer");
  }
  deepFreeze(context);
  trustedAuthenticationContexts.add(context);
  return context;
}

export function assertAuthenticationContext(context) {
  if (!context || typeof context !== "object" || !trustedAuthenticationContexts.has(context)) {
    throw new DomainError(
      "authentication_context_required",
      "a server-created Authentication Context is required"
    );
  }
  return context;
}
