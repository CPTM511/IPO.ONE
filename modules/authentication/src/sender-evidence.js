import { calculateJwkThumbprint, importJWK, jwtVerify } from "jose";
import { inspectCompactJwt } from "./jwt-verifier.js";
import {
  assertBoundedString,
  assertExactObjectKeys,
  assertNumericDate,
  authenticationError,
  constantTimeEqual,
  epochSeconds,
  sha256Base64Url
} from "./security-utils.js";

const trustedMtlsEvidence = new WeakSet();
const PRIVATE_JWK_FIELDS = new Set(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);
const DPOP_CLAIMS = Object.freeze(["jti", "htm", "htu", "iat", "ath", "nonce"]);

function normalizedTargetUri(value, { allowQuery = false } = {}) {
  assertBoundedString("DPoP target URI", value, { maximum: 2_048 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("dpop_target_rejected", "DPoP target URI is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (!allowQuery && parsed.search) ||
    parsed.pathname.includes("//")
  ) {
    throw authenticationError("dpop_target_rejected", "DPoP target URI is invalid");
  }
  return `${parsed.origin}${parsed.pathname}`;
}

function publicJwk(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw authenticationError("dpop_key_rejected", "DPoP public key is invalid");
  }
  if (Object.keys(value).some((field) => PRIVATE_JWK_FIELDS.has(field))) {
    throw authenticationError("dpop_key_rejected", "DPoP proof cannot carry private key material");
  }
  if (
    value.kty !== "EC" ||
    value.crv !== "P-256" ||
    (value.alg !== undefined && value.alg !== "ES256") ||
    value.use === "enc"
  ) {
    throw authenticationError("dpop_key_rejected", "DPoP public key is invalid");
  }
  return value;
}

export function createTrustedMtlsSenderEvidence({ certificateThumbprint, source }) {
  if (source !== "trusted_mtls_terminator") {
    throw authenticationError("mtls_evidence_rejected", "mTLS evidence source is not trusted");
  }
  const evidence = Object.freeze({
    certificateThumbprint: assertBoundedString("certificateThumbprint", certificateThumbprint, {
      minimum: 43,
      maximum: 128,
      pattern: /^[A-Za-z0-9_-]+$/
    }),
    source
  });
  trustedMtlsEvidence.add(evidence);
  return evidence;
}

export function assertTrustedMtlsSenderEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || !trustedMtlsEvidence.has(evidence)) {
    throw authenticationError("mtls_evidence_rejected", "trusted mTLS sender evidence is required");
  }
  return evidence;
}

export async function verifyDpopProof({
  proof,
  accessToken,
  requestMethod,
  requestUrl,
  expectedThumbprint,
  replayCache,
  now = new Date(),
  maximumProofAgeSeconds = 60,
  clockToleranceSeconds = 5
}) {
  if (
    !replayCache?.consume ||
    !Number.isSafeInteger(maximumProofAgeSeconds) ||
    maximumProofAgeSeconds < 1 ||
    maximumProofAgeSeconds > 300 ||
    !Number.isSafeInteger(clockToleranceSeconds) ||
    clockToleranceSeconds < 0 ||
    clockToleranceSeconds > 60
  ) {
    throw authenticationError("invalid_authentication_configuration", "DPoP verification profile is invalid");
  }
  assertBoundedString("accessToken", accessToken, { maximum: 16_384 });
  assertBoundedString("expectedThumbprint", expectedThumbprint, {
    minimum: 43,
    maximum: 128,
    pattern: /^[A-Za-z0-9_-]+$/
  });
  const inspected = inspectCompactJwt(proof, {
    allowedHeaderFields: ["alg", "typ", "jwk"],
    requiredHeaderFields: ["alg", "typ", "jwk"],
    allowedClaimFields: DPOP_CLAIMS,
    maximumBytes: 8_192
  });
  const algorithm = assertBoundedString("DPoP alg", inspected.protectedHeader.alg, { maximum: 16 });
  const type = assertBoundedString("DPoP typ", inspected.protectedHeader.typ, { maximum: 32 });
  if (algorithm !== "ES256" || type.toLowerCase() !== "dpop+jwt") {
    throw authenticationError("dpop_header_rejected", "DPoP protected header is not allowed");
  }
  const jwk = publicJwk(inspected.protectedHeader.jwk);
  let key;
  let thumbprint;
  try {
    [key, thumbprint] = await Promise.all([
      importJWK(jwk, "ES256"),
      calculateJwkThumbprint(jwk, "sha256")
    ]);
  } catch {
    throw authenticationError("dpop_key_rejected", "DPoP public key is invalid");
  }
  if (!constantTimeEqual(thumbprint, expectedThumbprint)) {
    throw authenticationError("dpop_sender_rejected", "DPoP sender does not match the access token");
  }

  let verified;
  try {
    verified = await jwtVerify(proof, key, {
      algorithms: ["ES256"],
      clockTolerance: clockToleranceSeconds,
      currentDate: now,
      requiredClaims: ["jti", "htm", "htu", "iat", "ath"],
      typ: "dpop+jwt"
    });
  } catch {
    throw authenticationError("dpop_signature_rejected", "DPoP proof verification failed");
  }
  const claims = verified.payload;
  assertExactObjectKeys("DPoP claims", claims, {
    required: ["jti", "htm", "htu", "iat", "ath"],
    optional: ["nonce"]
  });
  assertNumericDate("DPoP iat", claims.iat);
  const current = epochSeconds(now);
  if (claims.iat < current - maximumProofAgeSeconds || claims.iat > current + clockToleranceSeconds) {
    throw authenticationError("dpop_lifetime_rejected", "DPoP proof is outside its allowed time window");
  }
  const method = assertBoundedString("DPoP htm", claims.htm, {
    maximum: 16,
    pattern: /^[A-Za-z]+$/
  }).toUpperCase();
  if (method !== assertBoundedString("requestMethod", requestMethod, {
    maximum: 16,
    pattern: /^[A-Za-z]+$/
  }).toUpperCase()) {
    throw authenticationError("dpop_method_rejected", "DPoP method does not match the request");
  }
  if (!constantTimeEqual(
    normalizedTargetUri(claims.htu),
    normalizedTargetUri(requestUrl, { allowQuery: true })
  )) {
    throw authenticationError("dpop_target_rejected", "DPoP target does not match the request");
  }
  if (!constantTimeEqual(claims.ath, sha256Base64Url(accessToken))) {
    throw authenticationError("dpop_token_binding_rejected", "DPoP proof does not match the access token");
  }
  const jti = assertBoundedString("DPoP jti", claims.jti, {
    minimum: 16,
    maximum: 256,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
  });
  if (claims.nonce !== undefined) {
    assertBoundedString("DPoP nonce", claims.nonce, { minimum: 16, maximum: 256 });
  }
  replayCache.consume({
    namespace: "dpop",
    value: `${thumbprint}\0${jti}`,
    expiresAt: current + maximumProofAgeSeconds + clockToleranceSeconds + 1,
    now
  });
  return Object.freeze({ method: "dpop", thumbprint });
}
