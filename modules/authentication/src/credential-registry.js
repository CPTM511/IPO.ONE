import { createOperationalId } from "../../../packages/domain/src/index.js";
import {
  ActorType,
  AuthenticationEventType,
  ClientAuthenticationMethod,
  CredentialStatus,
  SenderConstraintMethod
} from "./constants.js";
import {
  assertBoundedString,
  assertExactObjectKeys,
  assertSafeIdentifier,
  assertStringList,
  authenticationError,
  deepFreeze
} from "./security-utils.js";

const ACTOR_TYPES = new Set(Object.values(ActorType));
const CREDENTIAL_STATUSES = new Set(Object.values(CredentialStatus));
const CLIENT_AUTHENTICATION_METHODS = new Set(Object.values(ClientAuthenticationMethod));
const SENDER_CONSTRAINT_METHODS = new Set(Object.values(SenderConstraintMethod));
const HUMAN_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);

function assertCredentialProfile(actorType, clientAuthenticationMethod, senderConstraintMethod) {
  const humanProfile = HUMAN_ACTOR_TYPES.has(actorType);
  if (
    (humanProfile && (
      clientAuthenticationMethod !== ClientAuthenticationMethod.OIDC_PKCE_BFF ||
      senderConstraintMethod !== SenderConstraintMethod.HOST_SESSION
    )) ||
    (!humanProfile && (
      clientAuthenticationMethod === ClientAuthenticationMethod.OIDC_PKCE_BFF ||
      senderConstraintMethod === SenderConstraintMethod.HOST_SESSION
    ))
  ) {
    throw authenticationError("invalid_authentication_input", "credential authentication profile is invalid");
  }
}

function exactHttpsOrigin(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_input", `${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw authenticationError("invalid_authentication_input", `${name} is invalid`);
  }
  return parsed.origin;
}

function senderConstraint(value) {
  assertExactObjectKeys("senderConstraint", value, { required: ["method", "thumbprint"] });
  if (!SENDER_CONSTRAINT_METHODS.has(value.method)) {
    throw authenticationError("invalid_authentication_input", "sender constraint method is invalid");
  }
  return deepFreeze({
    method: value.method,
    thumbprint: assertBoundedString("sender thumbprint", value.thumbprint, {
      minimum: 43,
      maximum: 128,
      pattern: /^[A-Za-z0-9_-]+$/
    })
  });
}

function clone(value) {
  return structuredClone(value);
}

export class InMemoryCredentialRegistry {
  #credentials = new Map();
  #credentialIdsBySubject = new Map();
  #credentialIdsByClient = new Map();

  constructor({ referenceHasher, eventStore, actorDirectory, maximumCredentials = 10_000 }) {
    if (
      !referenceHasher ||
      typeof referenceHasher.hash !== "function" ||
      !eventStore?.append ||
      !actorDirectory?.assertActive
    ) {
      throw authenticationError("invalid_authentication_configuration", "credential registry adapters are required");
    }
    if (!Number.isSafeInteger(maximumCredentials) || maximumCredentials < 1 || maximumCredentials > 100_000) {
      throw authenticationError("invalid_authentication_configuration", "maximumCredentials is invalid");
    }
    this.referenceHasher = referenceHasher;
    this.eventStore = eventStore;
    this.actorDirectory = actorDirectory;
    this.maximumCredentials = maximumCredentials;
  }

  register(input) {
    assertExactObjectKeys("credential registration", input, {
      required: [
        "tenantId",
        "actorId",
        "actorType",
        "issuer",
        "externalSubject",
        "clientId",
        "clientAuthenticationMethod",
        "senderConstraint",
        "policyVersion",
        "performedByActorId",
        "reasonCode"
      ],
      optional: ["roles", "allowedCapabilities", "expiresAt", "now"]
    });
    if (this.#credentials.size >= this.maximumCredentials) {
      throw authenticationError("authentication_credential_capacity_exceeded", "credential capacity is exhausted");
    }
    if (!ACTOR_TYPES.has(input.actorType)) {
      throw authenticationError("invalid_authentication_input", "actorType is invalid");
    }
    if (!CLIENT_AUTHENTICATION_METHODS.has(input.clientAuthenticationMethod)) {
      throw authenticationError("invalid_authentication_input", "client authentication method is invalid");
    }
    const now = input.now ?? new Date();
    const expiresAt = input.expiresAt === undefined ? undefined : new Date(input.expiresAt);
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)) {
      throw authenticationError("invalid_authentication_input", "credential expiration is invalid");
    }
    const issuer = exactHttpsOrigin("issuer", input.issuer);
    const externalSubject = assertBoundedString("externalSubject", input.externalSubject, { maximum: 512 });
    const tenantId = assertSafeIdentifier("tenantId", input.tenantId);
    const clientId = assertSafeIdentifier("clientId", input.clientId);
    const externalSubjectHash = this.referenceHasher.hash("subject", `${issuer}\0${externalSubject}`);
    const subjectKey = `${issuer}\0${tenantId}\0${clientId}\0${externalSubjectHash}`;
    const clientKey = `${issuer}\0${tenantId}\0${clientId}`;
    const humanProfile = HUMAN_ACTOR_TYPES.has(input.actorType);
    if (
      this.#credentialIdsBySubject.has(subjectKey) ||
      (!humanProfile && this.#credentialIdsByClient.has(clientKey))
    ) {
      throw authenticationError("authentication_credential_conflict", "credential binding already exists");
    }
    const normalizedSenderConstraint = senderConstraint(input.senderConstraint);
    assertCredentialProfile(
      input.actorType,
      input.clientAuthenticationMethod,
      normalizedSenderConstraint.method
    );
    const actorId = assertSafeIdentifier("actorId", input.actorId);
    this.actorDirectory.assertActive({ actorId, actorType: input.actorType });
    const credential = {
      credentialId: createOperationalId("credential"),
      tenantId,
      actorId,
      actorType: input.actorType,
      issuer,
      externalSubjectHash,
      clientId,
      clientAuthenticationMethod: input.clientAuthenticationMethod,
      senderConstraint: normalizedSenderConstraint,
      roles: assertStringList("roles", input.roles ?? [], { maximumItems: 16 }),
      allowedCapabilities: assertStringList("allowedCapabilities", input.allowedCapabilities ?? []),
      policyVersion: assertSafeIdentifier("policyVersion", input.policyVersion),
      status: CredentialStatus.ACTIVE,
      version: 1,
      expiresAt: expiresAt?.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      schemaVersion: "authentication_credential.v1"
    };
    deepFreeze(credential);
    this.#event(AuthenticationEventType.CREDENTIAL_REGISTERED, credential, input, {
      actorType: credential.actorType,
      clientAuthenticationMethod: credential.clientAuthenticationMethod,
      senderConstraintMethod: credential.senderConstraint.method,
      version: credential.version
    });
    this.#credentials.set(credential.credentialId, credential);
    this.#credentialIdsBySubject.set(subjectKey, credential.credentialId);
    if (!humanProfile) this.#credentialIdsByClient.set(clientKey, credential.credentialId);
    return clone(credential);
  }

  findBySubject({ issuer, tenantId, externalSubject, clientId, now = new Date() }) {
    const normalizedIssuer = exactHttpsOrigin("issuer", issuer);
    const normalizedTenantId = assertSafeIdentifier("tenantId", tenantId);
    const normalizedClientId = assertSafeIdentifier("clientId", clientId);
    const subjectHash = this.referenceHasher.hash(
      "subject",
      `${normalizedIssuer}\0${assertBoundedString("externalSubject", externalSubject, { maximum: 512 })}`
    );
    const id = this.#credentialIdsBySubject.get(
      `${normalizedIssuer}\0${normalizedTenantId}\0${normalizedClientId}\0${subjectHash}`
    );
    return this.assertActive(id, now);
  }

  findByClient({ issuer, tenantId, clientId, now = new Date() }) {
    const normalizedIssuer = exactHttpsOrigin("issuer", issuer);
    const id = this.#credentialIdsByClient.get(
      `${normalizedIssuer}\0${assertSafeIdentifier("tenantId", tenantId)}\0${assertSafeIdentifier("clientId", clientId)}`
    );
    return this.assertActive(id, now);
  }

  get(credentialId) {
    const credential = this.#credentials.get(credentialId);
    if (!credential) throw authenticationError("authentication_credential_rejected", "credential is not active");
    return clone(credential);
  }

  assertActive(credentialId, now = new Date()) {
    let credential = this.#credentials.get(credentialId);
    if (
      credential?.status === CredentialStatus.ACTIVE &&
      credential.expiresAt &&
      new Date(credential.expiresAt) <= now
    ) {
      credential = deepFreeze({
        ...credential,
        status: CredentialStatus.EXPIRED,
        updatedAt: now.toISOString()
      });
      this.#credentials.set(credentialId, credential);
      this.#event(AuthenticationEventType.CREDENTIAL_EXPIRED, credential, {
        performedByActorId: "actor_system_authentication",
        reasonCode: "credential_expired",
        now
      }, { status: CredentialStatus.EXPIRED });
    }
    if (
      !credential ||
      credential.status !== CredentialStatus.ACTIVE ||
      (credential.expiresAt && new Date(credential.expiresAt) <= now)
    ) {
      throw authenticationError("authentication_credential_rejected", "credential is not active");
    }
    this.actorDirectory.assertActive({
      actorId: credential.actorId,
      actorType: credential.actorType
    });
    return clone(credential);
  }

  rotate({ credentialId, senderConstraint: nextConstraint, performedByActorId, reasonCode, now = new Date() }) {
    const current = this.assertActive(credentialId, now);
    const normalizedSenderConstraint = senderConstraint(nextConstraint);
    assertCredentialProfile(
      current.actorType,
      current.clientAuthenticationMethod,
      normalizedSenderConstraint.method
    );
    const updated = deepFreeze({
      ...current,
      senderConstraint: normalizedSenderConstraint,
      version: current.version + 1,
      updatedAt: now.toISOString()
    });
    this.#credentials.set(credentialId, updated);
    this.#event(AuthenticationEventType.CREDENTIAL_ROTATED, updated, {
      performedByActorId,
      reasonCode,
      now
    }, {
      senderConstraintMethod: updated.senderConstraint.method,
      version: updated.version
    });
    return clone(updated);
  }

  suspend(input) {
    return this.#setStatus(input, CredentialStatus.SUSPENDED, AuthenticationEventType.CREDENTIAL_SUSPENDED);
  }

  revoke(input) {
    return this.#setStatus(input, CredentialStatus.REVOKED, AuthenticationEventType.CREDENTIAL_REVOKED);
  }

  #setStatus({ credentialId, performedByActorId, reasonCode, now = new Date() }, status, eventType) {
    const current = this.#credentials.get(credentialId);
    if (!current) throw authenticationError("authentication_credential_rejected", "credential is not active");
    if (!CREDENTIAL_STATUSES.has(status)) {
      throw authenticationError("invalid_authentication_input", "credential status is invalid");
    }
    if (current.status === status) return clone(current);
    if (current.status === CredentialStatus.REVOKED) {
      throw authenticationError("authentication_credential_rejected", "credential is not active");
    }
    const updated = deepFreeze({ ...current, status, updatedAt: now.toISOString() });
    this.#credentials.set(credentialId, updated);
    this.#event(eventType, updated, { performedByActorId, reasonCode, now }, { status });
    return clone(updated);
  }

  #event(eventType, credential, input, payload) {
    this.eventStore.append({
      eventType,
      tenantId: credential.tenantId,
      actorId: assertSafeIdentifier("performedByActorId", input.performedByActorId),
      credentialId: credential.credentialId,
      reasonCode: assertBoundedString("reasonCode", input.reasonCode, {
        maximum: 96,
        pattern: /^[a-z][a-z0-9_]+$/
      }),
      occurredAt: (input.now ?? new Date()).toISOString(),
      payload
    });
  }
}
