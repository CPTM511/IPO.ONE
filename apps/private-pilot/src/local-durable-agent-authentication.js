import {
  SignJWT,
  calculateJwkThumbprint,
  importJWK,
  jwtVerify
} from "jose";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod,
  assertBoundedString,
  assertNumericDate,
  assertSafeIdentifier,
  authenticationError,
  constantTimeEqual,
  epochSeconds
} from "../../../modules/authentication/src/index.js";
import {
  createAuthenticationContext
} from "../../../modules/authentication/src/authentication-context.js";
import {
  inspectCompactJwt
} from "../../../modules/authentication/src/jwt-verifier.js";
import {
  LOCAL_AGENT_EXTERNAL_SUBJECT,
  LOCAL_AGENT_ISSUER
} from "./local-authentication-material.js";

const CLAIM_FIELDS = Object.freeze([
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
  "policy_version"
]);

function checkedAudience(value) {
  return assertBoundedString("local Agent audience", value, {
    maximum: 512,
    pattern: /^urn:ipo\.one:local:[A-Za-z0-9._:/-]+$/
  });
}

function checkedPublicJwk(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.kty !== "EC" ||
    value.crv !== "P-256" ||
    value.alg !== "ES256" ||
    value.use !== "sig" ||
    !Array.isArray(value.key_ops) ||
    value.key_ops.length !== 1 ||
    value.key_ops[0] !== "verify" ||
    Object.hasOwn(value, "d")
  ) {
    throw authenticationError(
      "local_agent_key_rejected",
      "local Agent public key is invalid"
    );
  }
  return value;
}

export class LocalDurableAgentAuthenticator {
  constructor({
    tenantId,
    clientId,
    policyVersion,
    audience,
    credentialRegistry,
    replayCache,
    referenceHasher
  }) {
    if (
      !credentialRegistry?.findBySubject ||
      !replayCache?.consume ||
      !referenceHasher?.hash
    ) {
      throw authenticationError(
        "invalid_authentication_configuration",
        "local Agent authentication adapters are required"
      );
    }
    this.tenantId = assertSafeIdentifier("tenantId", tenantId);
    this.clientId = assertSafeIdentifier("clientId", clientId);
    this.policyVersion = assertSafeIdentifier(
      "policyVersion",
      policyVersion
    );
    this.audience = checkedAudience(audience);
    this.credentialRegistry = credentialRegistry;
    this.replayCache = replayCache;
    this.referenceHasher = referenceHasher;
  }

  async authenticate({ proof, now = new Date() }) {
    const inspected = inspectCompactJwt(proof, {
      allowedHeaderFields: ["alg", "typ", "jwk"],
      requiredHeaderFields: ["alg", "typ", "jwk"],
      allowedClaimFields: CLAIM_FIELDS,
      maximumBytes: 8_192
    });
    if (
      inspected.protectedHeader.alg !== "ES256" ||
      inspected.protectedHeader.typ !== "local-workload+jwt"
    ) {
      throw authenticationError(
        "local_agent_proof_rejected",
        "local Agent proof header is invalid"
      );
    }
    const publicJwk = checkedPublicJwk(inspected.protectedHeader.jwk);
    let key;
    let thumbprint;
    try {
      [key, thumbprint] = await Promise.all([
        importJWK(publicJwk, "ES256"),
        calculateJwkThumbprint(publicJwk, "sha256")
      ]);
    } catch {
      throw authenticationError(
        "local_agent_key_rejected",
        "local Agent public key is invalid"
      );
    }
    let verified;
    try {
      verified = await jwtVerify(proof, key, {
        algorithms: ["ES256"],
        audience: this.audience,
        clockTolerance: 5,
        currentDate: now,
        issuer: LOCAL_AGENT_ISSUER,
        requiredClaims: [
          "sub",
          "aud",
          "exp",
          "iat",
          "nbf",
          "jti",
          "tenant_id",
          "actor_type",
          "client_id",
          "policy_version"
        ],
        typ: "local-workload+jwt"
      });
    } catch {
      throw authenticationError(
        "local_agent_proof_rejected",
        "local Agent proof verification failed"
      );
    }
    const claims = verified.payload;
    for (const name of ["iat", "nbf", "exp"]) {
      assertNumericDate(name, claims[name]);
    }
    const nowSeconds = epochSeconds(now);
    if (
      claims.iat > nowSeconds + 5 ||
      claims.nbf > claims.exp ||
      claims.iat > claims.exp ||
      claims.exp - claims.iat > 60
    ) {
      throw authenticationError(
        "local_agent_proof_rejected",
        "local Agent proof lifetime is invalid"
      );
    }
    const jti = assertBoundedString("jti", claims.jti, {
      minimum: 16,
      maximum: 256,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
    });
    if (
      claims.sub !== LOCAL_AGENT_EXTERNAL_SUBJECT ||
      claims.tenant_id !== this.tenantId ||
      claims.actor_type !== ActorType.AGENT ||
      claims.client_id !== this.clientId ||
      claims.policy_version !== this.policyVersion
    ) {
      throw authenticationError(
        "authentication_binding_rejected",
        "local Agent proof is not bound to the configured workload"
      );
    }
    const credential = await this.credentialRegistry.findBySubject({
      issuer: LOCAL_AGENT_ISSUER,
      tenantId: this.tenantId,
      externalSubject: LOCAL_AGENT_EXTERNAL_SUBJECT,
      clientId: this.clientId,
      now
    });
    const expectedSender = this.referenceHasher.hash(
      "sender.constraint",
      thumbprint
    );
    if (
      credential.actorType !== ActorType.AGENT ||
      credential.clientAuthenticationMethod !==
        ClientAuthenticationMethod.PRIVATE_KEY_JWT ||
      credential.senderConstraint.method !== SenderConstraintMethod.DPOP ||
      credential.policyVersion !== this.policyVersion ||
      !constantTimeEqual(
        credential.senderConstraint.thumbprint,
        expectedSender
      )
    ) {
      throw authenticationError(
        "authentication_binding_rejected",
        "local Agent Credential is not active for this sender"
      );
    }
    await this.replayCache.consume({
      namespace: "local_workload",
      value: `${thumbprint}\0${jti}`,
      expiresAt: claims.exp + 6,
      now
    });
    return createAuthenticationContext({
      tenantId: credential.tenantId,
      actorId: credential.actorId,
      actorType: credential.actorType,
      clientId: credential.clientId,
      credentialId: credential.credentialId,
      credentialVersion: credential.version,
      policyVersion: credential.policyVersion,
      capabilities: credential.allowedCapabilities,
      roles: credential.roles,
      tokenJtiHash: this.referenceHasher.hash("token.jti", jti),
      authenticationMethod: credential.clientAuthenticationMethod,
      senderConstraintMethod: credential.senderConstraint.method,
      authenticatedAt: now,
      amr: []
    });
  }
}

export async function createLocalAgentProof({
  keyMaterial,
  tenantId,
  clientId,
  policyVersion,
  audience,
  now = new Date(),
  jti = `local-agent-${globalThis.crypto.randomUUID()}`
}) {
  const privateKey = await importJWK(keyMaterial.agentPrivateJwk, "ES256");
  const issuedAt = epochSeconds(now);
  return new SignJWT({
    tenant_id: assertSafeIdentifier("tenantId", tenantId),
    actor_type: ActorType.AGENT,
    client_id: assertSafeIdentifier("clientId", clientId),
    policy_version: assertSafeIdentifier("policyVersion", policyVersion)
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "local-workload+jwt",
      jwk: keyMaterial.agentPublicJwk
    })
    .setIssuer(LOCAL_AGENT_ISSUER)
    .setSubject(LOCAL_AGENT_EXTERNAL_SUBJECT)
    .setAudience(checkedAudience(audience))
    .setIssuedAt(issuedAt)
    .setNotBefore(issuedAt)
    .setExpirationTime(issuedAt + 60)
    .setJti(jti)
    .sign(privateKey);
}
