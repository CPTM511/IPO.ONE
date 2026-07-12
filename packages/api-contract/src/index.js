import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CLIENT_ERROR_STATUSES = new Map([
  ["ambiguous_body_framing", 400],
  ["invalid_json_body", 400],
  ["invalid_json", 400],
  ["invalid_path_parameter", 400],
  ["invalid_request_field", 400],
  ["invalid_request_target", 400],
  ["misdirected_request", 421],
  ["method_not_allowed", 405],
  ["payload_too_large", 413],
  ["uri_too_long", 414],
  ["unsupported_content_encoding", 415],
  ["unsupported_media_type", 415],
  ["https_required", 426],
  ["global_rate_limit_exceeded", 429],
  ["sandbox_mutation_limit_exceeded", 429],
  ["server_busy", 503],
  ["not_found", 404]
]);

function stripCodePrefix(code, message) {
  const prefix = `${code}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

function statusForDomainCode(code) {
  if (CLIENT_ERROR_STATUSES.has(code)) return CLIENT_ERROR_STATUSES.get(code);
  if (code.endsWith("_not_found")) return 404;
  if (
    code.includes("idempotency_conflict") ||
    code.includes("payload_conflict") ||
    code.startsWith("stale_") ||
    code.startsWith("duplicate_") ||
    code.includes("cannot_transition") ||
    code.includes("already_")
  ) {
    return 409;
  }
  if (
    code.includes("not_authorized") ||
    code.includes("not_allowlisted") ||
    code.includes("not_approved") ||
    code.includes("not_active") ||
    code.includes("prohibited") ||
    code.includes("blocked")
  ) {
    return 403;
  }
  return 400;
}

function titleForStatus(status) {
  return {
    400: "Bad Request",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Content Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    421: "Misdirected Request",
    426: "Upgrade Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    503: "Service Unavailable",
    500: "Internal Server Error"
  }[status] ?? "Request Failed";
}

export class ApiBoundaryError extends Error {
  constructor(code, message, { status = statusForDomainCode(code), headers = {} } = {}) {
    super(message);
    this.name = "ApiBoundaryError";
    this.code = code;
    this.status = status;
    this.headers = headers;
  }
}

export function createRequestId(headers = {}) {
  const supplied = Array.isArray(headers["x-request-id"])
    ? headers["x-request-id"][0]
    : headers["x-request-id"];
  return typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : `req_${randomUUID()}`;
}

export function createProblemDetails(error, { requestId }) {
  const hasStableCode = typeof error?.code === "string" && /^[a-z][a-z0-9_]{1,95}$/.test(error.code);
  const code = hasStableCode ? error.code : "internal_error";
  const isKnownClientError = error instanceof ApiBoundaryError || error?.name === "DomainError";
  const status = error instanceof ApiBoundaryError
    ? error.status
    : error?.name === "DomainError"
      ? statusForDomainCode(code)
      : 500;
  const detail = isKnownClientError
    ? stripCodePrefix(code, String(error.message))
    : "An unexpected error occurred. Use the request ID when contacting support.";

  return {
    type: `urn:ipo-one:problem:${code}`,
    title: titleForStatus(status),
    status,
    detail,
    instance: `urn:ipo-one:request:${requestId}`,
    code,
    requestId,
    schemaVersion: "problem_details.v1"
  };
}

export function isValidRequestId(value) {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}
