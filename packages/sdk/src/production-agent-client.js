import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import {
  assertTenantProtocolRequest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";

const MAX_RESPONSE_BYTES = 1024 * 1024;

function exactHttpsOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError("baseUrl must be an HTTPS origin"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new TypeError("baseUrl must be an HTTPS origin");
  }
  return parsed;
}

function pem(name, value, marker) {
  if (typeof value !== "string" || value.length < 64 || value.length > 64 * 1024 || !value.includes(`-----BEGIN ${marker}`)) {
    throw new TypeError(`${name} must contain bounded PEM material`);
  }
  return value;
}

function compactJwt(name, value, maximum = 16_384) {
  if (typeof value !== "string" || value.length < 64 || value.length > maximum) {
    throw new TypeError(`${name} must be a bounded JWT`);
  }
  const segments = value.split(".");
  if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new TypeError(`${name} must be a compact JWT`);
  }
  return segments;
}

function shortLivedJwt(value, senderMethod, now = new Date()) {
  const segments = compactJwt("access token", value);
  let claims;
  try { claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")); } catch {
    throw new TypeError("access token claims are invalid");
  }
  const current = Math.floor(now.getTime() / 1000);
  if (
    !claims || typeof claims !== "object" || Array.isArray(claims) ||
    !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
    claims.exp <= current || claims.iat > current + 30 ||
    claims.exp <= claims.iat || claims.exp - claims.iat > 300
  ) throw new TypeError("access token must be an active <=300 second sender-bound JWT");
  const confirmation = senderMethod === "dpop" ? claims.cnf?.jkt : claims.cnf?.["x5t#S256"];
  if (typeof confirmation !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(confirmation)) {
    throw new TypeError(`access token must be bound to the configured ${senderMethod} sender`);
  }
  return value;
}

function dpopProof(value, { accessToken, method, url, now }) {
  const segments = compactJwt("DPoP proof", value, 8_192);
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    throw new TypeError("DPoP proof claims are invalid");
  }
  const current = Math.floor(now.getTime() / 1_000);
  const tokenHash = createHash("sha256").update(accessToken).digest("base64url");
  if (
    header?.alg !== "ES256" || header?.typ?.toLowerCase() !== "dpop+jwt" ||
    header?.jwk?.kty !== "EC" || header.jwk.crv !== "P-256" || Object.hasOwn(header.jwk, "d") ||
    claims?.htm !== method || claims?.htu !== url || claims?.ath !== tokenHash ||
    !Number.isSafeInteger(claims?.iat) || Math.abs(claims.iat - current) > 60 ||
    typeof claims?.jti !== "string" || claims.jti.length < 16 || claims.jti.length > 256
  ) throw new TypeError("DPoP proof is not bound to the exact request and access token");
  return value;
}

export class IpoOneAgentApiError extends Error {
  constructor(payload, { status, requestId }) {
    super(payload?.detail ?? `IPO.ONE Agent request failed with status ${status}`);
    this.name = "IpoOneAgentApiError";
    this.status = status;
    this.code = payload?.code ?? "unknown_agent_api_error";
    this.requestId = payload?.requestId ?? requestId;
    this.problem = payload;
    this.outcome = "known_rejection";
    this.retryAfterClass = payload?.retryAfterClass;
  }
}

export class IpoOneAgentTransportError extends Error {
  constructor(message, {
    cause,
    requestId,
    operationId,
    retryDirective,
    code = "agent_transport_unknown_outcome"
  }) {
    super(message, cause ? { cause } : undefined);
    this.name = "IpoOneAgentTransportError";
    this.code = code;
    this.requestId = requestId;
    this.operationId = operationId;
    this.outcome = "unknown";
    this.retryDirective = retryDirective;
  }
}

function unknownOutcome(error, protocolRequest, code) {
  return new IpoOneAgentTransportError(
    "IPO.ONE Agent request outcome is unknown; reconcile or replay the exact original idempotent request before taking further risk-increasing action",
    {
      cause: error,
      requestId: protocolRequest.requestId,
      operationId: protocolRequest.operationId,
      retryDirective: protocolRequest.idempotencyKey === undefined
        ? "read_or_reconcile_before_retry"
        : "replay_exact_request_with_same_idempotency_key",
      code
    }
  );
}

export class ProductionAgentClient {
  #origin;
  #accessTokenProvider;
  #cert;
  #key;
  #ca;
  #dpopProofProvider;
  #senderMethod;
  #request;
  #clock;

  constructor({
    baseUrl,
    accessTokenProvider,
    cert,
    key,
    ca,
    dpopProofProvider,
    request = httpsRequest,
    clock = () => new Date()
  }) {
    this.#origin = exactHttpsOrigin(baseUrl);
    if (typeof accessTokenProvider !== "function" || typeof request !== "function" || typeof clock !== "function") {
      throw new TypeError("Agent token, HTTPS, and clock adapters are required");
    }
    this.#accessTokenProvider = accessTokenProvider;
    if (dpopProofProvider === undefined) {
      this.#senderMethod = "mtls";
      this.#cert = pem("mTLS certificate", cert, "CERTIFICATE");
      this.#key = pem("mTLS private key", key, "PRIVATE KEY");
      this.#ca = ca === undefined ? undefined : pem("trusted CA", ca, "CERTIFICATE");
    } else {
      if (typeof dpopProofProvider !== "function" || cert !== undefined || key !== undefined || ca !== undefined) {
        throw new TypeError("DPoP and mTLS Agent sender configurations are mutually exclusive");
      }
      this.#senderMethod = "dpop";
      this.#dpopProofProvider = dpopProofProvider;
    }
    this.#request = request;
    this.#clock = clock;
  }

  async execute(protocolRequest, { signal } = {}) {
    assertTenantProtocolRequest(protocolRequest);
    const now = this.#clock();
    const accessToken = shortLivedJwt(
      await this.#accessTokenProvider(),
      this.#senderMethod,
      now
    );
    const body = JSON.stringify(protocolRequest);
    const url = new URL("/tenant/v1/operations", this.#origin);
    const proof = this.#senderMethod === "dpop"
      ? dpopProof(await this.#dpopProofProvider({
          accessToken,
          method: "POST",
          url: url.href
        }), {
          accessToken,
          method: "POST",
          url: url.href,
          now
        })
      : undefined;
    const payload = await new Promise((resolve, reject) => {
      const request = this.#request(url, {
        method: "POST",
        headers: {
          accept: "application/json, application/problem+json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-request-id": protocolRequest.requestId,
          ...(proof === undefined ? {} : { dpop: proof })
        },
        ...(this.#senderMethod === "mtls"
          ? {
              cert: this.#cert,
              key: this.#key,
              ...(this.#ca === undefined ? {} : { ca: this.#ca })
            }
          : {}),
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        servername: this.#origin.hostname,
        signal
      }, (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("IPO.ONE Agent response exceeds 1 MiB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", (error) => reject(
          unknownOutcome(error, protocolRequest, "agent_transport_unknown_outcome")
        ));
        response.on("end", () => {
          const type = response.headers["content-type"]?.split(";", 1)[0]?.trim();
          if (!new Set(["application/json", "application/problem+json"]).has(type)) {
            reject(unknownOutcome(
              new Error("IPO.ONE Agent response content type is invalid"),
              protocolRequest,
              "agent_response_content_type_rejected"
            ));
            return;
          }
          let parsed;
          try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
            reject(unknownOutcome(
              new Error("IPO.ONE Agent response is not valid JSON"),
              protocolRequest,
              "agent_response_json_rejected"
            ));
            return;
          }
          const requestId = response.headers["x-request-id"] ?? protocolRequest.requestId;
          if (requestId !== protocolRequest.requestId) {
            reject(unknownOutcome(
              new Error("IPO.ONE Agent response request ID does not match the command"),
              protocolRequest,
              "agent_response_binding_rejected"
            ));
            return;
          }
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(new IpoOneAgentApiError(parsed, {
              status: response.statusCode,
              requestId
            }));
            return;
          }
          resolve(parsed);
        });
      });
      request.once("error", (error) => reject(
        error instanceof IpoOneAgentTransportError
          ? error
          : unknownOutcome(error, protocolRequest, "agent_transport_unknown_outcome")
      ));
      request.setTimeout(30_000, () => request.destroy(
        unknownOutcome(
          new Error("IPO.ONE Agent request timed out"),
          protocolRequest,
          "agent_transport_timeout_unknown_outcome"
        )
      ));
      request.end(body);
    });
    try {
      assertTenantProtocolResult(payload);
    } catch (error) {
      throw unknownOutcome(error, protocolRequest, "agent_response_schema_rejected");
    }
    if (payload.operationId !== protocolRequest.operationId) {
      throw unknownOutcome(
        new Error("IPO.ONE Agent response operation does not match the command"),
        protocolRequest,
        "agent_response_binding_rejected"
      );
    }
    return payload;
  }
}
