import { jwtVerify } from "jose";
import { parseStrictJson } from "./strict-json.js";
import {
  assertBoundedString,
  assertExactObjectKeys,
  assertNumericDate,
  authenticationError,
  deepFreeze,
  epochSeconds
} from "./security-utils.js";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function decodeSegment(segment) {
  if (!BASE64URL_PATTERN.test(segment)) {
    throw authenticationError("invalid_compact_jwt", "JWT compact serialization is invalid");
  }
  const decoded = Buffer.from(segment, "base64url");
  if (decoded.toString("base64url") !== segment) {
    throw authenticationError("invalid_compact_jwt", "JWT compact serialization is invalid");
  }
  try {
    return UTF8_DECODER.decode(decoded);
  } catch {
    throw authenticationError("invalid_compact_jwt", "JWT compact serialization is invalid");
  }
}

export function inspectCompactJwt(
  token,
  {
    allowedHeaderFields = ["alg", "kid", "typ"],
    allowedClaimFields,
    requiredHeaderFields = ["alg", "kid", "typ"],
    maximumBytes = 16_384
  }
) {
  if (typeof token !== "string" || token.length === 0 || Buffer.byteLength(token, "utf8") > maximumBytes) {
    throw authenticationError("invalid_compact_jwt", "JWT compact serialization is invalid");
  }
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw authenticationError("invalid_compact_jwt", "JWT compact serialization is invalid");
  }
  const protectedHeader = parseStrictJson(decodeSegment(segments[0]), { maximumBytes: 2_048 });
  const payload = parseStrictJson(decodeSegment(segments[1]), { maximumBytes: 12_288 });
  assertExactObjectKeys("JWT protected header", protectedHeader, {
    required: requiredHeaderFields,
    optional: allowedHeaderFields.filter((field) => !requiredHeaderFields.includes(field))
  });
  assertExactObjectKeys("JWT claims", payload, {
    optional: allowedClaimFields
  });
  return { payload, protectedHeader };
}

export async function verifyPinnedJwt({
  token,
  resolver,
  issuer,
  audience,
  allowedAlgorithms,
  expectedType,
  allowedClaimFields,
  requiredClaims,
  requiredNumericDateClaims = ["iat", "nbf", "exp"],
  requireJti = true,
  maximumLifetimeSeconds,
  clockToleranceSeconds = 30,
  now = new Date()
}) {
  const inspected = inspectCompactJwt(token, { allowedClaimFields });
  if (
    inspected.protectedHeader.typ !== expectedType ||
    !allowedAlgorithms.includes(inspected.protectedHeader.alg)
  ) {
    throw authenticationError("authentication_header_rejected", "JWT protected header is not allowed");
  }
  if (typeof inspected.payload.aud !== "string" || inspected.payload.aud !== audience) {
    throw authenticationError("authentication_audience_rejected", "JWT audience is not allowed");
  }
  for (const claim of requiredClaims) {
    if (!Object.hasOwn(inspected.payload, claim)) {
      throw authenticationError("authentication_claims_rejected", "JWT claims are incomplete");
    }
  }

  let verified;
  try {
    verified = await jwtVerify(token, resolver.keyResolver(), {
      algorithms: allowedAlgorithms,
      audience,
      clockTolerance: clockToleranceSeconds,
      currentDate: now,
      issuer,
      requiredClaims
    });
  } catch (error) {
    if (error?.name === "DomainError") throw error;
    throw authenticationError("authentication_signature_rejected", "JWT verification failed");
  }

  const payload = verified.payload;
  for (const name of requiredNumericDateClaims) assertNumericDate(name, payload[name]);
  if (payload.nbf !== undefined) assertNumericDate("nbf", payload.nbf);
  if (
    (payload.nbf !== undefined && payload.nbf > payload.exp) ||
    payload.iat > payload.exp ||
    payload.exp - payload.iat > maximumLifetimeSeconds
  ) {
    throw authenticationError("authentication_lifetime_rejected", "JWT lifetime is not allowed");
  }
  if (payload.iat > epochSeconds(now) + clockToleranceSeconds) {
    throw authenticationError("authentication_lifetime_rejected", "JWT issue time is not allowed");
  }
  if (requireJti || payload.jti !== undefined) {
    assertBoundedString("jti", payload.jti, {
      minimum: 16,
      maximum: 256,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
    });
  }
  deepFreeze(payload);
  return Object.freeze({ payload, protectedHeader: deepFreeze(verified.protectedHeader) });
}
