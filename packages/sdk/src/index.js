const CYCLE_TYPES = new Set(["healthy", "risky", "recovery"]);

function createRequestId() {
  return `sdk_${globalThis.crypto.randomUUID()}`;
}

function createSandboxSessionId() {
  return `sdk_session_${globalThis.crypto.randomUUID()}`;
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new TypeError("baseUrl must be a non-empty HTTP(S) URL");
  }
  const parsed = new URL(baseUrl);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new TypeError("baseUrl must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new TypeError("baseUrl must not contain credentials");
  }
  return parsed.href.replace(/\/$/, "");
}

function segment(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return encodeURIComponent(value);
}

async function parseResponseBody(response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new IpoOneTransportError("IPO.ONE returned a non-JSON response", {
      status: response.status,
      requestId: response.headers.get("x-request-id") ?? undefined
    });
  }
}

export class IpoOneApiError extends Error {
  constructor(problem, { status, requestId }) {
    super(problem?.detail ?? `IPO.ONE request failed with status ${status}`);
    this.name = "IpoOneApiError";
    this.status = status;
    this.code = problem?.code ?? "unknown_api_error";
    this.requestId = problem?.requestId ?? requestId;
    this.problem = problem;
  }
}

export class IpoOneTransportError extends Error {
  constructor(message, { cause, status, requestId } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "IpoOneTransportError";
    this.status = status;
    this.requestId = requestId;
  }
}

export class IpoOneClient {
  #baseUrl;
  #fetch;
  #defaultHeaders;
  #sandboxSessionId;

  constructor({
    baseUrl,
    fetch: fetchImpl = globalThis.fetch,
    headers = {},
    sandboxSessionId = createSandboxSessionId()
  }) {
    if (typeof fetchImpl !== "function") throw new TypeError("a fetch implementation is required");
    if (typeof sandboxSessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(sandboxSessionId)) {
      throw new TypeError("sandboxSessionId must be a bounded safe identifier");
    }
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#fetch = fetchImpl;
    this.#defaultHeaders = { ...headers };
    this.#sandboxSessionId = sandboxSessionId;
  }

  health(options) {
    return this.#request("/healthz", options);
  }

  getDemoState(options) {
    return this.#request("/v1/demo/state", options);
  }

  createAgent(input = {}, options) {
    return this.#request("/v1/agents", { ...options, method: "POST", body: input });
  }

  bindWallet(agentId, input = {}, options) {
    return this.#request(`/v1/agents/${segment(agentId, "agentId")}/wallet-bindings`, {
      ...options,
      method: "POST",
      body: input
    });
  }

  createLockbox(agentId, options) {
    return this.#request(`/v1/agents/${segment(agentId, "agentId")}/lockbox`, {
      ...options,
      method: "POST",
      body: {}
    });
  }

  requestCreditLine(agentId, options) {
    return this.#request(`/v1/agents/${segment(agentId, "agentId")}/credit-line`, {
      ...options,
      method: "POST",
      body: {}
    });
  }

  submitSpendRequest(input, options) {
    return this.#request("/v1/spend-requests", { ...options, method: "POST", body: input });
  }

  recordSettlement(input = {}, options) {
    return this.#request("/v1/settlements", { ...options, method: "POST", body: input });
  }

  captureRevenue(input, options) {
    return this.#request("/v1/revenue-capture", { ...options, method: "POST", body: input });
  }

  autoRepay(input, options) {
    return this.#request("/v1/repayments/auto", { ...options, method: "POST", body: input });
  }

  evaluateCreditLearning(input, options) {
    return this.#request("/v1/credit-learning/evaluate", { ...options, method: "POST", body: input });
  }

  runCycle(cycleType, input, options) {
    if (!CYCLE_TYPES.has(cycleType)) {
      throw new TypeError("cycleType must be healthy, risky, or recovery");
    }
    return this.#request(`/v1/demo/cycles/${cycleType}`, { ...options, method: "POST", body: input });
  }

  getAgentStatus(agentId, options) {
    return this.#request(`/v1/agents/${segment(agentId, "agentId")}/status`, options);
  }

  getCreditProfile(agentId, options) {
    return this.#request(`/v1/agents/${segment(agentId, "agentId")}/credit-profile`, options);
  }

  getAudit(options) {
    return this.#request("/v1/admin/audit", options);
  }

  listRails(options) {
    return this.#request("/v1/rails", options);
  }

  getTransferIntent(transferIntentId, options) {
    return this.#request(`/v1/transfer-intents/${segment(transferIntentId, "transferIntentId")}`, options);
  }

  runVerticalSlice(options) {
    return this.#request("/v1/demo/vertical-slice", options);
  }

  resetDemo(options) {
    return this.#request("/v1/demo/reset", { ...options, method: "POST", body: {} });
  }

  async #request(path, { method = "GET", body, requestId = createRequestId(), signal, headers = {} } = {}) {
    const requestHeaders = {
      accept: "application/json, application/problem+json",
      ...this.#defaultHeaders,
      ...headers,
      "x-request-id": requestId,
      "x-ipo-one-sandbox-session": this.#sandboxSessionId
    };
    if (body !== undefined) requestHeaders["content-type"] = "application/json";

    let response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal
      });
    } catch (cause) {
      throw new IpoOneTransportError("IPO.ONE request failed before receiving a response", { cause, requestId });
    }

    const payload = await parseResponseBody(response);
    const responseRequestId = response.headers.get("x-request-id") ?? requestId;
    if (!response.ok) {
      throw new IpoOneApiError(payload, { status: response.status, requestId: responseRequestId });
    }
    return payload;
  }
}
