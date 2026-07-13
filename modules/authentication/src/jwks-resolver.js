import { importJWK } from "jose";
import {
  assertBoundedString,
  assertExactObjectKeys,
  authenticationError
} from "./security-utils.js";

const SUPPORTED_ASYMMETRIC_ALGORITHMS = new Set(["ES256", "PS256", "RS256", "EdDSA"]);
const PRIVATE_JWK_FIELDS = new Set(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function boundedBase64Url(name, value, minimum, maximum) {
  return assertBoundedString(name, value, {
    minimum,
    maximum,
    pattern: BASE64URL_PATTERN
  });
}

function validatePublicJwkShape(jwk, algorithm) {
  const commonRequired = ["kty", "kid", "use", "alg", "key_ops"];
  if (algorithm === "ES256") {
    assertExactObjectKeys("EC JWK", jwk, {
      required: [...commonRequired, "crv", "x", "y"]
    });
    if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
      throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
    }
    boundedBase64Url("EC x", jwk.x, 43, 43);
    boundedBase64Url("EC y", jwk.y, 43, 43);
    return;
  }
  if (algorithm === "EdDSA") {
    assertExactObjectKeys("OKP JWK", jwk, {
      required: [...commonRequired, "crv", "x"]
    });
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") {
      throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
    }
    boundedBase64Url("OKP x", jwk.x, 43, 43);
    return;
  }
  assertExactObjectKeys("RSA JWK", jwk, {
    required: [...commonRequired, "n", "e"]
  });
  if (jwk.kty !== "RSA") {
    throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
  }
  boundedBase64Url("RSA modulus", jwk.n, 342, 1_366);
  boundedBase64Url("RSA exponent", jwk.e, 2, 8);
}

function issuerUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw authenticationError("invalid_authentication_configuration", "issuer must be an absolute URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw authenticationError(
      "invalid_authentication_configuration",
      "issuer must be a credential-free HTTPS origin"
    );
  }
  return parsed.origin;
}

function positiveInteger(name, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw authenticationError("invalid_authentication_configuration", `${name} is invalid`);
  }
  return value;
}

function validateAlgorithms(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 4) {
    throw authenticationError("invalid_authentication_configuration", "allowedAlgorithms is invalid");
  }
  const unique = new Set(values);
  if (unique.size !== values.length || values.some((value) => !SUPPORTED_ASYMMETRIC_ALGORITHMS.has(value))) {
    throw authenticationError("invalid_authentication_configuration", "allowedAlgorithms is invalid");
  }
  return Object.freeze([...values]);
}

export class PinnedJwksResolver {
  #cache = new Map();
  #cacheLoadedAt = 0;
  #lastUnknownKidRefreshAt;
  #refreshPromise;

  constructor({
    issuer,
    allowedAlgorithms,
    fetchJwks,
    cacheTtlMs = 60_000,
    fetchTimeoutMs = 2_000,
    maximumKeys = 8,
    unknownKidRefreshCooldownMs = 5_000,
    now = () => Date.now()
  }) {
    if (typeof fetchJwks !== "function" || typeof now !== "function") {
      throw authenticationError("invalid_authentication_configuration", "JWKS adapters are required");
    }
    this.issuer = issuerUrl(issuer);
    this.allowedAlgorithms = validateAlgorithms(allowedAlgorithms);
    this.fetchJwks = fetchJwks;
    this.cacheTtlMs = positiveInteger("cacheTtlMs", cacheTtlMs, 100, 300_000);
    this.fetchTimeoutMs = positiveInteger("fetchTimeoutMs", fetchTimeoutMs, 100, 5_000);
    this.maximumKeys = positiveInteger("maximumKeys", maximumKeys, 1, 16);
    this.unknownKidRefreshCooldownMs = positiveInteger(
      "unknownKidRefreshCooldownMs",
      unknownKidRefreshCooldownMs,
      100,
      60_000
    );
    this.now = now;
  }

  keyResolver() {
    return async (protectedHeader) => this.resolve(protectedHeader);
  }

  async resolve(protectedHeader) {
    const kid = assertBoundedString("kid", protectedHeader?.kid, {
      maximum: 128,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
    });
    const algorithm = assertBoundedString("alg", protectedHeader?.alg, { maximum: 16 });
    if (!this.allowedAlgorithms.includes(algorithm)) {
      throw authenticationError("authentication_algorithm_rejected", "JWT algorithm is not allowed");
    }

    const current = this.now();
    if (!Number.isFinite(current)) {
      throw authenticationError("authentication_key_source_unavailable", "trusted signing key clock is invalid");
    }
    const cacheExpired =
      this.#cacheLoadedAt === 0 ||
      current < this.#cacheLoadedAt ||
      current - this.#cacheLoadedAt >= this.cacheTtlMs;
    let refreshed = false;
    if (cacheExpired) {
      await this.#refresh();
      refreshed = true;
    }
    let entry = this.#cache.get(kid);
    if (!entry && !refreshed) {
      if (
        this.#lastUnknownKidRefreshAt !== undefined &&
        current - this.#lastUnknownKidRefreshAt < this.unknownKidRefreshCooldownMs
      ) {
        throw authenticationError("authentication_signing_key_rejected", "JWT signing key is not trusted");
      }
      this.#lastUnknownKidRefreshAt = current;
      await this.#refresh();
      entry = this.#cache.get(kid);
    }
    if (!entry && refreshed) this.#lastUnknownKidRefreshAt = current;
    if (!entry || entry.algorithm !== algorithm) {
      throw authenticationError("authentication_signing_key_rejected", "JWT signing key is not trusted");
    }
    return entry.key;
  }

  clear() {
    this.#cache = new Map();
    this.#cacheLoadedAt = 0;
    this.#lastUnknownKidRefreshAt = undefined;
  }

  async #refresh() {
    if (!this.#refreshPromise) {
      this.#refreshPromise = this.#load().finally(() => {
        this.#refreshPromise = undefined;
      });
    }
    return this.#refreshPromise;
  }

  async #load() {
    let jwks;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      jwks = await Promise.race([
        this.fetchJwks({ issuer: this.issuer, signal: controller.signal }),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("JWKS fetch timed out")), { once: true });
        })
      ]);
    } catch {
      throw authenticationError(
        "authentication_key_source_unavailable",
        "trusted signing keys are temporarily unavailable"
      );
    } finally {
      clearTimeout(timeout);
    }
    assertExactObjectKeys("JWKS", jwks, { required: ["keys"] });
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > this.maximumKeys) {
      throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
    }

    const next = new Map();
    for (const jwk of jwks.keys) {
      if (!jwk || typeof jwk !== "object" || Array.isArray(jwk)) {
        throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
      }
      if (Object.keys(jwk).some((field) => PRIVATE_JWK_FIELDS.has(field))) {
        throw authenticationError("authentication_key_set_rejected", "JWKS cannot contain private key material");
      }
      const kid = assertBoundedString("JWK kid", jwk.kid, {
        maximum: 128,
        pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]+$/
      });
      const algorithm = assertBoundedString("JWK alg", jwk.alg, { maximum: 16 });
      if (
        next.has(kid) ||
        !this.allowedAlgorithms.includes(algorithm) ||
        jwk.use !== "sig" ||
        !Array.isArray(jwk.key_ops) ||
        jwk.key_ops.length !== 1 ||
        jwk.key_ops[0] !== "verify"
      ) {
        throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
      }
      try {
        validatePublicJwkShape(jwk, algorithm);
      } catch {
        throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
      }
      let key;
      try {
        key = await importJWK(jwk, algorithm);
      } catch {
        throw authenticationError("authentication_key_set_rejected", "trusted signing key set is invalid");
      }
      next.set(kid, Object.freeze({ algorithm, key }));
    }
    const loadedAt = this.now();
    if (!Number.isFinite(loadedAt)) {
      throw authenticationError("authentication_key_source_unavailable", "trusted signing key clock is invalid");
    }
    this.#cache = next;
    this.#cacheLoadedAt = loadedAt;
  }
}
