import { request as httpsRequest } from "node:https";
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

function shortLivedJwt(value, now = new Date()) {
  if (typeof value !== "string" || value.length < 64 || value.length > 16_384) {
    throw new TypeError("access token must be a bounded JWT");
  }
  const segments = value.split(".");
  if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new TypeError("access token must be a compact JWT");
  }
  let claims;
  try { claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")); } catch {
    throw new TypeError("access token claims are invalid");
  }
  const current = Math.floor(now.getTime() / 1000);
  if (
    !claims || typeof claims !== "object" || Array.isArray(claims) ||
    !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
    claims.exp <= current || claims.iat > current + 30 ||
    claims.exp <= claims.iat || claims.exp - claims.iat > 300 ||
    typeof claims.cnf?.["x5t#S256"] !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(claims.cnf["x5t#S256"])
  ) throw new TypeError("access token must be an active <=300 second mTLS-bound JWT");
  return value;
}

function problemError(payload, status, requestId) {
  const error = new Error(payload?.detail ?? `IPO.ONE Agent request failed with status ${status}`);
  error.name = "IpoOneAgentApiError";
  error.status = status;
  error.code = payload?.code ?? "unknown_agent_api_error";
  error.requestId = payload?.requestId ?? requestId;
  error.problem = payload;
  return error;
}

export class ProductionAgentClient {
  #origin;
  #accessTokenProvider;
  #cert;
  #key;
  #ca;
  #request;
  #clock;

  constructor({
    baseUrl,
    accessTokenProvider,
    cert,
    key,
    ca,
    request = httpsRequest,
    clock = () => new Date()
  }) {
    this.#origin = exactHttpsOrigin(baseUrl);
    if (typeof accessTokenProvider !== "function" || typeof request !== "function" || typeof clock !== "function") {
      throw new TypeError("Agent token, HTTPS, and clock adapters are required");
    }
    this.#accessTokenProvider = accessTokenProvider;
    this.#cert = pem("mTLS certificate", cert, "CERTIFICATE");
    this.#key = pem("mTLS private key", key, "PRIVATE KEY");
    this.#ca = ca === undefined ? undefined : pem("trusted CA", ca, "CERTIFICATE");
    this.#request = request;
    this.#clock = clock;
  }

  async execute(protocolRequest, { signal } = {}) {
    assertTenantProtocolRequest(protocolRequest);
    const accessToken = shortLivedJwt(await this.#accessTokenProvider(), this.#clock());
    const body = JSON.stringify(protocolRequest);
    const url = new URL("/tenant/v1/operations", this.#origin);
    const payload = await new Promise((resolve, reject) => {
      const request = this.#request(url, {
        method: "POST",
        headers: {
          accept: "application/json, application/problem+json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-request-id": protocolRequest.requestId
        },
        cert: this.#cert,
        key: this.#key,
        ...(this.#ca === undefined ? {} : { ca: this.#ca }),
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
        response.on("error", reject);
        response.on("end", () => {
          const type = response.headers["content-type"]?.split(";", 1)[0]?.trim();
          if (!new Set(["application/json", "application/problem+json"]).has(type)) {
            reject(new Error("IPO.ONE Agent response content type is invalid"));
            return;
          }
          let parsed;
          try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
            reject(new Error("IPO.ONE Agent response is not valid JSON"));
            return;
          }
          const requestId = response.headers["x-request-id"] ?? protocolRequest.requestId;
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(problemError(parsed, response.statusCode, requestId));
            return;
          }
          resolve(parsed);
        });
      });
      request.once("error", reject);
      request.setTimeout(30_000, () => request.destroy(new Error("IPO.ONE Agent request timed out")));
      request.end(body);
    });
    assertTenantProtocolResult(payload);
    return payload;
  }
}
