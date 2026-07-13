export const ActorType = Object.freeze({
  HUMAN: "human",
  AGENT: "agent",
  PROVIDER: "provider",
  RISK_OPERATOR: "risk_operator",
  OPERATIONS_OPERATOR: "operations_operator",
  AUDITOR: "auditor",
  SYSTEM_WORKER: "system_worker"
});

export const CredentialStatus = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  REVOKED: "revoked",
  EXPIRED: "expired"
});

export const ClientAuthenticationMethod = Object.freeze({
  OIDC_PKCE_BFF: "oidc_pkce_bff",
  PRIVATE_KEY_JWT: "private_key_jwt",
  MTLS: "mtls"
});

export const SenderConstraintMethod = Object.freeze({
  DPOP: "dpop",
  HOST_SESSION: "host_session",
  MTLS: "mtls"
});

export const AuthenticationEventType = Object.freeze({
  CREDENTIAL_REGISTERED: "credential_registered",
  CREDENTIAL_ROTATED: "credential_rotated",
  CREDENTIAL_SUSPENDED: "credential_suspended",
  CREDENTIAL_REVOKED: "credential_revoked",
  CREDENTIAL_EXPIRED: "credential_expired",
  SESSION_CREATED: "session_created",
  SESSION_ROTATED: "session_rotated",
  SESSION_REVOKED: "session_revoked",
  SESSION_EXPIRED: "session_expired"
});

export const PHISHING_RESISTANT_AMR = Object.freeze(["hwk", "webauthn", "fido"]);

export const AUTHENTICATION_CONTEXT_SCHEMA_VERSION = "authentication_context.v1";
export const AUTHENTICATION_CLAIMS_SCHEMA_VERSION = "authentication_claims.v1";
