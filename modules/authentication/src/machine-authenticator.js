import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "./constants.js";
import { createAuthenticationContext } from "./authentication-context.js";
import { verifyPinnedJwt } from "./jwt-verifier.js";
import {
  assertBoundedString,
  assertExactObjectKeys,
  assertNumericDate,
  assertSafeIdentifier,
  assertStringList,
  authenticationError,
  constantTimeEqual
} from "./security-utils.js";
import {
  assertTrustedMtlsSenderEvidence,
  verifyDpopProof
} from "./sender-evidence.js";

const WORKLOAD_ACTOR_TYPES = new Set([ActorType.AGENT, ActorType.PROVIDER, ActorType.SYSTEM_WORKER]);
const MACHINE_CLAIMS = Object.freeze([
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "nbf",
  "jti",
  "tenant_id",
  "actor_type",
  "client_id",
  "roles",
  "capabilities",
  "policy_version",
  "auth_time",
  "acr",
  "amr",
  "cnf"
]);
const REQUIRED_MACHINE_CLAIMS = Object.freeze([
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "nbf",
  "jti",
  "tenant_id",
  "actor_type",
  "client_id",
  "capabilities",
  "policy_version",
  "cnf"
]);

function subset(values, ceiling) {
  const allowed = new Set(ceiling);
  return values.every((value) => allowed.has(value));
}

function confirmationClaim(value, method) {
  if (method === SenderConstraintMethod.DPOP) {
    assertExactObjectKeys("cnf", value, { required: ["jkt"] });
    return assertBoundedString("cnf.jkt", value.jkt, {
      minimum: 43,
      maximum: 128,
      pattern: /^[A-Za-z0-9_-]+$/
    });
  }
  assertExactObjectKeys("cnf", value, { required: ["x5t#S256"] });
  return assertBoundedString("cnf.x5t#S256", value["x5t#S256"], {
    minimum: 43,
    maximum: 128,
    pattern: /^[A-Za-z0-9_-]+$/
  });
}

export class MachineAuthenticator {
  constructor({
    issuer,
    audience,
    resolver,
    credentialRegistry,
    replayCache,
    referenceHasher,
    allowedAlgorithms = ["ES256"],
    maximumTokenLifetimeSeconds = 300,
    clockToleranceSeconds = 30
  }) {
    if (
      !resolver?.keyResolver ||
      !credentialRegistry?.findBySubject ||
      !replayCache?.consume ||
      !referenceHasher?.hash
    ) {
      throw authenticationError("invalid_authentication_configuration", "machine authentication adapters are required");
    }
    if (
      !Number.isSafeInteger(maximumTokenLifetimeSeconds) ||
      maximumTokenLifetimeSeconds < 1 ||
      maximumTokenLifetimeSeconds > 300
    ) {
      throw authenticationError("invalid_authentication_configuration", "machine token lifetime is invalid");
    }
    if (!Number.isSafeInteger(clockToleranceSeconds) || clockToleranceSeconds < 0 || clockToleranceSeconds > 60) {
      throw authenticationError("invalid_authentication_configuration", "machine clock tolerance is invalid");
    }
    this.issuer = issuer;
    this.audience = assertBoundedString("audience", audience, { maximum: 512 });
    this.resolver = resolver;
    this.credentialRegistry = credentialRegistry;
    this.replayCache = replayCache;
    this.referenceHasher = referenceHasher;
    this.allowedAlgorithms = Object.freeze([...allowedAlgorithms]);
    if (
      resolver.issuer !== issuer ||
      this.allowedAlgorithms.length === 0 ||
      new Set(this.allowedAlgorithms).size !== this.allowedAlgorithms.length ||
      this.allowedAlgorithms.some((algorithm) => !resolver.allowedAlgorithms.includes(algorithm))
    ) {
      throw authenticationError("invalid_authentication_configuration", "machine issuer or algorithm pin is invalid");
    }
    this.maximumTokenLifetimeSeconds = maximumTokenLifetimeSeconds;
    this.clockToleranceSeconds = clockToleranceSeconds;
  }

  async authenticate({ accessToken, dpopProof, mtlsEvidence, requestMethod, requestUrl, now = new Date() }) {
    const verified = await verifyPinnedJwt({
      token: accessToken,
      resolver: this.resolver,
      issuer: this.issuer,
      audience: this.audience,
      allowedAlgorithms: this.allowedAlgorithms,
      expectedType: "at+jwt",
      allowedClaimFields: MACHINE_CLAIMS,
      requiredClaims: REQUIRED_MACHINE_CLAIMS,
      maximumLifetimeSeconds: this.maximumTokenLifetimeSeconds,
      clockToleranceSeconds: this.clockToleranceSeconds,
      now
    });
    const claims = verified.payload;
    const tenantId = assertSafeIdentifier("tenant_id", claims.tenant_id);
    const actorType = assertSafeIdentifier("actor_type", claims.actor_type);
    if (!WORKLOAD_ACTOR_TYPES.has(actorType)) {
      throw authenticationError("authentication_actor_type_rejected", "workload actor type is not allowed");
    }
    const clientId = assertSafeIdentifier("client_id", claims.client_id);
    const policyVersion = assertSafeIdentifier("policy_version", claims.policy_version);
    const subject = assertBoundedString("sub", claims.sub, { maximum: 512 });
    const capabilities = assertStringList("capabilities", claims.capabilities, { allowEmpty: false });
    if (claims.roles !== undefined) assertStringList("roles", claims.roles, { maximumItems: 16 });
    if (claims.auth_time !== undefined) assertNumericDate("auth_time", claims.auth_time);
    if (claims.acr !== undefined) assertBoundedString("acr", claims.acr, { maximum: 128 });
    if (claims.amr !== undefined) {
      assertStringList("amr", claims.amr, {
        maximumItems: 8,
        itemPattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
      });
    }
    const credential = this.credentialRegistry.findBySubject({
      issuer: claims.iss,
      tenantId,
      externalSubject: subject,
      clientId,
      now
    });
    if (
      credential.tenantId !== tenantId ||
      credential.actorType !== actorType ||
      credential.clientId !== clientId ||
      credential.policyVersion !== policyVersion ||
      !subset(capabilities, credential.allowedCapabilities)
    ) {
      throw authenticationError("authentication_binding_rejected", "JWT is not bound to the active credential");
    }
    if (![SenderConstraintMethod.DPOP, SenderConstraintMethod.MTLS].includes(credential.senderConstraint.method)) {
      throw authenticationError("authentication_sender_rejected", "workload sender constraint is not allowed");
    }
    if (![
      ClientAuthenticationMethod.PRIVATE_KEY_JWT,
      ClientAuthenticationMethod.MTLS
    ].includes(credential.clientAuthenticationMethod)) {
      throw authenticationError("authentication_binding_rejected", "workload client authentication is not asymmetric");
    }

    const confirmation = confirmationClaim(claims.cnf, credential.senderConstraint.method);
    if (!constantTimeEqual(confirmation, credential.senderConstraint.thumbprint)) {
      throw authenticationError("authentication_sender_rejected", "JWT sender constraint is not trusted");
    }
    let sender;
    if (credential.senderConstraint.method === SenderConstraintMethod.DPOP) {
      if (mtlsEvidence !== undefined) {
        throw authenticationError("authentication_sender_rejected", "ambiguous sender evidence is rejected");
      }
      sender = await verifyDpopProof({
        proof: dpopProof,
        accessToken,
        requestMethod,
        requestUrl,
        expectedThumbprint: confirmation,
        replayCache: this.replayCache,
        now
      });
    } else {
      if (dpopProof !== undefined) {
        throw authenticationError("authentication_sender_rejected", "ambiguous sender evidence is rejected");
      }
      const evidence = assertTrustedMtlsSenderEvidence(mtlsEvidence);
      if (!constantTimeEqual(evidence.certificateThumbprint, confirmation)) {
        throw authenticationError("authentication_sender_rejected", "mTLS sender does not match the access token");
      }
      sender = Object.freeze({ method: "mtls", thumbprint: confirmation });
    }

    return createAuthenticationContext({
      tenantId,
      actorId: credential.actorId,
      actorType,
      clientId,
      credentialId: credential.credentialId,
      credentialVersion: credential.version,
      policyVersion,
      capabilities,
      roles: credential.roles,
      tokenJtiHash: this.referenceHasher.hash("token.jti", claims.jti),
      authenticationMethod: credential.clientAuthenticationMethod,
      senderConstraintMethod: sender.method,
      authenticatedAt: now,
      amr: []
    });
  }
}
