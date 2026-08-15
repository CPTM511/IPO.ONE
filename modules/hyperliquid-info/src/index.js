import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";

export * from "./binding-proof.js";

export const HYPERLIQUID_INFO_ACCOUNT_SNAPSHOT_SCHEMA_VERSION =
  "hyperliquid_info_account_snapshot.v1";
export const HYPERLIQUID_INFO_READ_RESULT_SCHEMA_VERSION =
  "hyperliquid_info_read_result.v1";
export const HYPERLIQUID_TESTNET_INFO_PROFILE = Object.freeze({
  profileId: "hyperliquid_testnet_info.v1",
  environment: "testnet",
  origin: "https://api.hyperliquid-testnet.xyz",
  path: "/info",
  endpoint: "https://api.hyperliquid-testnet.xyz/info",
  method: "POST",
  staleAfterMs: 15_000,
  maximumFillWindowMs: 24 * 60 * 60 * 1_000,
  maximumResponseBytes: 1_048_576,
  maximumPositions: 200,
  maximumOpenOrders: 200,
  maximumFills: 500,
  maximumSubaccounts: 100,
  signerAvailable: false,
  exchangeEndpointAvailable: false,
  credentialsRequired: false,
  productionAuthority: false,
  fundsAuthority: false,
  schemaVersion: "hyperliquid_info_profile.v1"
});

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]{0,77})(?:\.[0-9]{1,18})?$/;
const COIN = /^[A-Za-z0-9@:_./-]{1,64}$/;
const SAFE_LABEL = /^[A-Za-z0-9 _./:-]{1,64}$/;
const ACCOUNT_ROLES = new Set(["master", "subaccount"]);
const RETRYABLE_CODES = new Set([
  "hyperliquid_info_rate_limited",
  "hyperliquid_info_timeout",
  "hyperliquid_info_unavailable"
]);
const CONFIG_KEYS = new Set([
  "cacheTtlMs",
  "clock",
  "cooldownMs",
  "failureThreshold",
  "fetchImpl",
  "maximumCallsPerMinute",
  "maximumResponseBytes",
  "maxAttempts",
  "timeoutMs"
]);
const MAXIMUM_FUTURE_SKEW_MS = 5_000;
const MAXIMUM_JSON_DEPTH = 64;
// One official fill contains 13 keys. The 2,000-row bounded history page
// therefore needs more than 20,000 keys even though the byte limit remains 1 MiB.
const MAXIMUM_JSON_KEYS = 50_000;
const MAXIMUM_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const MAXIMUM_HISTORY_PAGES = 5;
const MAXIMUM_FILLS_PER_HISTORY_PAGE = 2_000;
const MAXIMUM_AVAILABLE_FILLS = 10_000;

function fail(code, message) {
  throw new DomainError(code, message);
}

function plainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function parseExternalJson(text) {
  let cursor = 0;
  let depth = 0;
  let keyCount = 0;

  function malformed(message = "Hyperliquid Info returned malformed JSON") {
    fail("invalid_hyperliquid_info_response", message);
  }

  function skipWhitespace() {
    while (
      text[cursor] === " " ||
      text[cursor] === "\t" ||
      text[cursor] === "\n" ||
      text[cursor] === "\r"
    ) {
      cursor += 1;
    }
  }

  function readString() {
    if (text[cursor] !== '"') malformed();
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === '"') {
        cursor += 1;
        const token = text.slice(start, cursor);
        try {
          return JSON.parse(token);
        } catch {
          malformed();
        }
      }
      if (text[cursor] === "\\") {
        cursor += 2;
      } else {
        cursor += 1;
      }
    }
    malformed();
  }

  function readScalar() {
    const start = cursor;
    while (
      cursor < text.length &&
      ![" ", "\t", "\n", "\r", ",", "]", "}"].includes(text[cursor])
    ) {
      cursor += 1;
    }
    if (cursor === start) malformed();
  }

  function readValue() {
    skipWhitespace();
    if (text[cursor] === "{") {
      readObject();
      return;
    }
    if (text[cursor] === "[") {
      readArray();
      return;
    }
    if (text[cursor] === '"') {
      readString();
      return;
    }
    readScalar();
  }

  function enterContainer() {
    depth += 1;
    if (depth > MAXIMUM_JSON_DEPTH) {
      malformed("Hyperliquid Info JSON nesting exceeds the approved bound");
    }
  }

  function readObject() {
    enterContainer();
    cursor += 1;
    skipWhitespace();
    const keys = new Set();
    if (text[cursor] === "}") {
      cursor += 1;
      depth -= 1;
      return;
    }
    while (cursor < text.length) {
      skipWhitespace();
      const key = readString();
      keyCount += 1;
      if (keyCount > MAXIMUM_JSON_KEYS) {
        malformed("Hyperliquid Info JSON key count exceeds the approved bound");
      }
      if (keys.has(key)) {
        malformed("Hyperliquid Info JSON contains a duplicate object key");
      }
      keys.add(key);
      skipWhitespace();
      if (text[cursor] !== ":") malformed();
      cursor += 1;
      readValue();
      skipWhitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        depth -= 1;
        return;
      }
      if (text[cursor] !== ",") malformed();
      cursor += 1;
    }
    malformed();
  }

  function readArray() {
    enterContainer();
    cursor += 1;
    skipWhitespace();
    if (text[cursor] === "]") {
      cursor += 1;
      depth -= 1;
      return;
    }
    while (cursor < text.length) {
      readValue();
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        depth -= 1;
        return;
      }
      if (text[cursor] !== ",") malformed();
      cursor += 1;
    }
    malformed();
  }

  if (typeof text !== "string" || text.length === 0) malformed();
  readValue();
  skipWhitespace();
  if (cursor !== text.length || depth !== 0) malformed();
  try {
    return JSON.parse(text);
  } catch {
    malformed();
  }
}

function nowMs(clock) {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(
      "invalid_hyperliquid_info_client",
      "Hyperliquid Info client clock is invalid"
    );
  }
  return value;
}

function boundedInteger(name, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      "invalid_hyperliquid_info_client",
      `Hyperliquid Info ${name} is outside the approved bound`
    );
  }
  return value;
}

function accountAddress(value) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail(
      "invalid_hyperliquid_info_request",
      "Hyperliquid Info requires an actual master or subaccount address"
    );
  }
  const normalized = value.toLowerCase();
  if (normalized === "0x0000000000000000000000000000000000000000") {
    fail(
      "invalid_hyperliquid_info_request",
      "Hyperliquid Info requires a non-zero actual account address"
    );
  }
  return normalized;
}

function accountRole(value) {
  if (!ACCOUNT_ROLES.has(value)) {
    fail(
      "invalid_hyperliquid_info_request",
      "Hyperliquid Info account role must be master or subaccount"
    );
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail(
      "invalid_hyperliquid_info_response",
      `Hyperliquid Info ${name} is invalid`
    );
  }
  return value;
}

function coin(name, value) {
  if (typeof value !== "string" || !COIN.test(value)) {
    fail(
      "invalid_hyperliquid_info_response",
      `Hyperliquid Info ${name} is invalid`
    );
  }
  return value;
}

function label(name, value) {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (typeof normalized !== "string" || !SAFE_LABEL.test(normalized)) {
    fail(
      "invalid_hyperliquid_info_response",
      `Hyperliquid Info ${name} is invalid`
    );
  }
  return normalized;
}

function safeUnsignedId(name, value) {
  if (
    !(
      (Number.isSafeInteger(value) && value >= 0) ||
      (typeof value === "string" && /^(?:0|[1-9][0-9]{0,30})$/.test(value))
    )
  ) {
    fail(
      "invalid_hyperliquid_info_response",
      `Hyperliquid Info ${name} is invalid`
    );
  }
  return String(value);
}

function timestamp(name, value, { maximumMs, minimumMs = 0 } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimumMs ||
    (maximumMs !== undefined && value > maximumMs)
  ) {
    fail(
      "invalid_hyperliquid_info_response",
      `Hyperliquid Info ${name} is invalid`
    );
  }
  return new Date(value).toISOString();
}

function side(value) {
  if (value === "B") return "buy";
  if (value === "A") return "sell";
  fail("invalid_hyperliquid_info_response", "Hyperliquid Info side is invalid");
}

function summary(value, name) {
  if (!plainObject(value)) {
    fail(
      "hyperliquid_info_partial_response",
      `Hyperliquid Info ${name} summary is missing`
    );
  }
  return {
    accountValue: decimal(`${name}.accountValue`, value.accountValue),
    totalNotionalPosition: decimal(`${name}.totalNtlPos`, value.totalNtlPos),
    totalRawUsd: decimal(`${name}.totalRawUsd`, value.totalRawUsd),
    totalMarginUsed: decimal(`${name}.totalMarginUsed`, value.totalMarginUsed)
  };
}

function normalizePosition(wrapper) {
  if (!plainObject(wrapper) || !plainObject(wrapper.position)) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info position is incomplete"
    );
  }
  const value = wrapper.position;
  if (
    !plainObject(value.leverage) ||
    !["cross", "isolated"].includes(value.leverage.type) ||
    !Number.isSafeInteger(value.leverage.value) ||
    value.leverage.value < 1 ||
    value.leverage.value > 1_000
  ) {
    fail(
      "invalid_hyperliquid_info_response",
      "Hyperliquid Info leverage is invalid"
    );
  }
  return {
    coin: coin("position.coin", value.coin),
    size: decimal("position.szi", value.szi),
    entryPrice: decimal("position.entryPx", value.entryPx),
    positionValue: decimal("position.positionValue", value.positionValue),
    unrealizedPnl: decimal("position.unrealizedPnl", value.unrealizedPnl),
    liquidationPrice:
      value.liquidationPx === null
        ? null
        : decimal("position.liquidationPx", value.liquidationPx),
    marginUsed: decimal("position.marginUsed", value.marginUsed),
    returnOnEquity: decimal("position.returnOnEquity", value.returnOnEquity),
    leverageType: value.leverage.type,
    leverageValue: value.leverage.value
  };
}

function normalizeClearinghouse(value, observedAtMs) {
  if (
    !plainObject(value) ||
    !Array.isArray(value.assetPositions) ||
    value.assetPositions.length > HYPERLIQUID_TESTNET_INFO_PROFILE.maximumPositions
  ) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info clearinghouse state is incomplete or unbounded"
    );
  }
  const margin = summary(value.marginSummary, "margin");
  summary(value.crossMarginSummary, "crossMargin");
  const venueTime = timestamp("clearinghouse.time", value.time, {
    maximumMs: observedAtMs + MAXIMUM_FUTURE_SKEW_MS
  });
  return {
    venueTime,
    venueTimeMs: value.time,
    equity: {
      accountValue: margin.accountValue,
      withdrawable: decimal("clearinghouse.withdrawable", value.withdrawable),
      totalNotionalPosition: margin.totalNotionalPosition,
      totalRawUsd: margin.totalRawUsd,
      totalMarginUsed: margin.totalMarginUsed,
      crossMaintenanceMarginUsed: decimal(
        "clearinghouse.crossMaintenanceMarginUsed",
        value.crossMaintenanceMarginUsed
      )
    },
    positions: value.assetPositions.map(normalizePosition)
  };
}

function normalizeOrder(value, observedAtMs) {
  if (!plainObject(value)) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info open order is incomplete"
    );
  }
  if (
    typeof value.reduceOnly !== "boolean" ||
    typeof value.isTrigger !== "boolean"
  ) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info open order flags are incomplete"
    );
  }
  return {
    coin: coin("order.coin", value.coin),
    side: side(value.side),
    limitPrice: decimal("order.limitPx", value.limitPx),
    size: decimal("order.sz", value.sz),
    originalSize: decimal("order.origSz", value.origSz),
    orderId: safeUnsignedId("order.oid", value.oid),
    orderType: label("order.orderType", value.orderType),
    reduceOnly: value.reduceOnly,
    isTrigger: value.isTrigger,
    timestamp: timestamp("order.timestamp", value.timestamp, {
      maximumMs: observedAtMs + MAXIMUM_FUTURE_SKEW_MS
    })
  };
}

function normalizeOrders(value, observedAtMs) {
  if (
    !Array.isArray(value) ||
    value.length > HYPERLIQUID_TESTNET_INFO_PROFILE.maximumOpenOrders
  ) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info open orders are incomplete or unbounded"
    );
  }
  return value.map((order) => normalizeOrder(order, observedAtMs));
}

function normalizeFill(value, observedAtMs, startTimeMs, endTimeMs) {
  if (
    !plainObject(value) ||
    typeof value.crossed !== "boolean" ||
    typeof value.hash !== "string" ||
    !TRANSACTION_HASH.test(value.hash)
  ) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info fill is incomplete"
    );
  }
  const fillTime = timestamp("fill.time", value.time, {
    minimumMs: startTimeMs,
    maximumMs: Math.min(
      endTimeMs + MAXIMUM_FUTURE_SKEW_MS,
      observedAtMs + MAXIMUM_FUTURE_SKEW_MS
    )
  });
  return {
    coin: coin("fill.coin", value.coin),
    side: side(value.side),
    price: decimal("fill.px", value.px),
    size: decimal("fill.sz", value.sz),
    startPosition: decimal("fill.startPosition", value.startPosition),
    closedPnl: decimal("fill.closedPnl", value.closedPnl),
    fee: decimal("fill.fee", value.fee),
    feeToken: coin("fill.feeToken", label("fill.feeToken", value.feeToken)),
    orderId: safeUnsignedId("fill.oid", value.oid),
    tradeId: safeUnsignedId("fill.tid", value.tid),
    transactionHash: value.hash.toLowerCase(),
    direction: label("fill.dir", value.dir),
    crossed: value.crossed,
    timestamp: fillTime
  };
}

function normalizeFills(
  value,
  observedAtMs,
  startTimeMs,
  endTimeMs,
  maximum = HYPERLIQUID_TESTNET_INFO_PROFILE.maximumFills
) {
  if (
    !Array.isArray(value) ||
    value.length > maximum
  ) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info fills are incomplete or unbounded"
    );
  }
  return value.map((fill) =>
    normalizeFill(fill, observedAtMs, startTimeMs, endTimeMs)
  );
}

function normalizeSubaccounts(value, masterAddress) {
  if (value === null) return [];
  if (
    !Array.isArray(value) ||
    value.length > HYPERLIQUID_TESTNET_INFO_PROFILE.maximumSubaccounts
  ) {
    fail(
      "hyperliquid_info_partial_response",
      "Hyperliquid Info subaccounts are incomplete or unbounded"
    );
  }
  return value.map((entry) => {
    if (
      !plainObject(entry) ||
      typeof entry.name !== "string" ||
      entry.name.length < 1 ||
      entry.name.length > 128 ||
      !ADDRESS.test(entry.subAccountUser ?? "") ||
      !ADDRESS.test(entry.master ?? "") ||
      entry.master.toLowerCase() !== masterAddress ||
      !plainObject(entry.clearinghouseState) ||
      !Array.isArray(entry.clearinghouseState.assetPositions) ||
      entry.clearinghouseState.assetPositions.length >
        HYPERLIQUID_TESTNET_INFO_PROFILE.maximumPositions
    ) {
      fail(
        "invalid_hyperliquid_info_response",
        "Hyperliquid Info subaccount binding is invalid"
      );
    }
    const accountSummary = summary(
      entry.clearinghouseState.marginSummary,
      "subaccount.margin"
    );
    return {
      nameHash: hashId("hyperliquid_subaccount_name", entry.name),
      subaccountAddressHash: hashId(
        "hyperliquid_account_address",
        entry.subAccountUser.toLowerCase()
      ),
      masterAddressHash: hashId(
        "hyperliquid_account_address",
        masterAddress
      ),
      accountValue: accountSummary.accountValue,
      positionCount: entry.clearinghouseState.assetPositions.length
    };
  });
}

function normalizeAccountRole(value, requestedRole, requestedAddress) {
  const requestedAddressHash = hashId(
    "hyperliquid_account_address",
    requestedAddress
  );
  if (
    requestedRole === "master" &&
    exactKeys(value, ["role"]) &&
    value.role === "user"
  ) {
    return {
      verifiedMasterAddressHash: requestedAddressHash
    };
  }
  if (
    requestedRole === "subaccount" &&
    exactKeys(value, ["data", "role"]) &&
    value.role === "subAccount" &&
    exactKeys(value.data, ["master"]) &&
    ADDRESS.test(value.data.master)
  ) {
    return {
      verifiedMasterAddressHash: hashId(
        "hyperliquid_account_address",
        value.data.master.toLowerCase()
      )
    };
  }
  fail(
    "hyperliquid_info_account_role_denied",
    "Hyperliquid Info address is not the requested master or subaccount role"
  );
}

async function boundedResponseText(response, maximumBytes) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    fail(
      "hyperliquid_info_response_too_large",
      "Hyperliquid Info response exceeds the approved byte limit"
    );
  }
  if (!response.body?.getReader) {
    const body = await response.text();
    if (Buffer.byteLength(body) > maximumBytes) {
      fail(
        "hyperliquid_info_response_too_large",
        "Hyperliquid Info response exceeds the approved byte limit"
      );
    }
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      fail(
        "hyperliquid_info_response_too_large",
        "Hyperliquid Info response exceeds the approved byte limit"
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function requestBody(queryType, address, startTimeMs, endTimeMs) {
  if (queryType === "userRole") {
    return { type: queryType, user: address };
  }
  if (queryType === "clearinghouseState") {
    return { type: queryType, user: address };
  }
  if (queryType === "frontendOpenOrders") {
    return { type: queryType, user: address };
  }
  if (queryType === "userFillsByTime") {
    return {
      type: queryType,
      user: address,
      startTime: startTimeMs,
      endTime: endTimeMs,
      aggregateByTime: true
    };
  }
  if (queryType === "subAccounts") {
    return { type: queryType, user: address };
  }
  fail(
    "hyperliquid_info_query_denied",
    "Hyperliquid Info query is outside the closed read allowlist"
  );
}

function assertReadInput(input, clock) {
  if (
    !exactKeys(input, [
      "accountAddress",
      "accountRole",
      "fillWindowEndMs",
      "fillWindowStartMs"
    ])
  ) {
    fail(
      "invalid_hyperliquid_info_request",
      "Hyperliquid Info read request has an open or incomplete shape"
    );
  }
  const current = nowMs(clock);
  const address = accountAddress(input.accountAddress);
  const role = accountRole(input.accountRole);
  const startTimeMs = input.fillWindowStartMs;
  const endTimeMs = input.fillWindowEndMs;
  if (
    !Number.isSafeInteger(startTimeMs) ||
    !Number.isSafeInteger(endTimeMs) ||
    startTimeMs < 0 ||
    endTimeMs < startTimeMs ||
    endTimeMs > current + MAXIMUM_FUTURE_SKEW_MS ||
    endTimeMs - startTimeMs >
      HYPERLIQUID_TESTNET_INFO_PROFILE.maximumFillWindowMs
  ) {
    fail(
      "invalid_hyperliquid_info_request",
      "Hyperliquid Info fill window is invalid or unbounded"
    );
  }
  return { address, role, startTimeMs, endTimeMs, current };
}

function readResult(snapshot, { hit, ageMs }) {
  return deepFreeze({
    snapshot,
    cache: {
      hit,
      ageMs
    },
    schemaVersion: HYPERLIQUID_INFO_READ_RESULT_SCHEMA_VERSION
  });
}

export class HyperliquidTestnetInfoAdapter {
  #fetch;
  #clock;
  #timeoutMs;
  #maximumResponseBytes;
  #maxAttempts;
  #failureThreshold;
  #cooldownMs;
  #cacheTtlMs;
  #maximumCallsPerMinute;
  #calls = [];
  #consecutiveFailures = 0;
  #openUntil = 0;
  #cache = new Map();

  constructor(options = {}) {
    if (
      !plainObject(options) ||
      Object.keys(options).some((key) => !CONFIG_KEYS.has(key))
    ) {
      fail(
        "invalid_hyperliquid_info_client",
        "Hyperliquid Info client configuration has an open shape"
      );
    }
    const {
      fetchImpl = globalThis.fetch,
      clock = () => Date.now(),
      timeoutMs = 3_000,
      maximumResponseBytes =
        HYPERLIQUID_TESTNET_INFO_PROFILE.maximumResponseBytes,
      maxAttempts = 2,
      failureThreshold = 3,
      cooldownMs = 30_000,
      cacheTtlMs = 5_000,
      maximumCallsPerMinute = 20
    } = options;
    if (typeof fetchImpl !== "function" || typeof clock !== "function") {
      fail(
        "invalid_hyperliquid_info_client",
        "Hyperliquid Info client dependencies are invalid"
      );
    }
    this.#fetch = fetchImpl;
    this.#clock = clock;
    this.#timeoutMs = boundedInteger("timeout", timeoutMs, 250, 3_000);
    this.#maximumResponseBytes = boundedInteger(
      "response byte limit",
      maximumResponseBytes,
      4_096,
      HYPERLIQUID_TESTNET_INFO_PROFILE.maximumResponseBytes
    );
    this.#maxAttempts = boundedInteger("attempt limit", maxAttempts, 1, 2);
    this.#failureThreshold = boundedInteger(
      "failure threshold",
      failureThreshold,
      1,
      5
    );
    this.#cooldownMs = boundedInteger("circuit cooldown", cooldownMs, 1_000, 60_000);
    this.#cacheTtlMs = boundedInteger("cache TTL", cacheTtlMs, 100, 10_000);
    this.#maximumCallsPerMinute = boundedInteger(
      "request budget",
      maximumCallsPerMinute,
      5,
      20
    );
  }

  get profile() {
    return HYPERLIQUID_TESTNET_INFO_PROFILE;
  }

  get circuitState() {
    return this.#openUntil > nowMs(this.#clock) ? "open" : "closed";
  }

  #reserveCall(current) {
    this.#calls = this.#calls.filter(
      (calledAt) => current >= calledAt && current - calledAt < 60_000
    );
    if (this.#calls.length >= this.#maximumCallsPerMinute) {
      fail(
        "hyperliquid_info_budget_exhausted",
        "Hyperliquid Info request budget is exhausted"
      );
    }
    this.#calls.push(current);
  }

  async #post(queryType, body) {
    let lastError;
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      const current = nowMs(this.#clock);
      this.#reserveCall(current);
      let response;
      try {
        response = await this.#fetch(
          HYPERLIQUID_TESTNET_INFO_PROFILE.endpoint,
          {
            method: HYPERLIQUID_TESTNET_INFO_PROFILE.method,
            headers: {
              accept: "application/json",
              "content-type": "application/json"
            },
            body: JSON.stringify(body),
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(this.#timeoutMs)
          }
        );
      } catch (error) {
        lastError = new DomainError(
          error?.name === "AbortError" || error?.name === "TimeoutError"
            ? "hyperliquid_info_timeout"
            : "hyperliquid_info_unavailable",
          "Hyperliquid Info request failed"
        );
        if (attempt < this.#maxAttempts) continue;
        throw lastError;
      }
      if (!response?.ok) {
        const code =
          response?.status === 429
            ? "hyperliquid_info_rate_limited"
            : response?.status >= 500
              ? "hyperliquid_info_unavailable"
              : "hyperliquid_info_rejected";
        lastError = new DomainError(code, "Hyperliquid Info request failed");
        if (RETRYABLE_CODES.has(code) && attempt < this.#maxAttempts) continue;
        throw lastError;
      }
      const contentType = response.headers
        ?.get?.("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        ?.toLowerCase();
      if (contentType !== "application/json") {
        fail(
          "invalid_hyperliquid_info_response",
          "Hyperliquid Info response content type is invalid"
        );
      }
      let text;
      try {
        text = await boundedResponseText(response, this.#maximumResponseBytes);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        fail(
          "invalid_hyperliquid_info_response",
          "Hyperliquid Info response body is invalid"
        );
      }
      const value = parseExternalJson(text);
      return {
        queryType,
        value,
        responseHash: hashId("hyperliquid_info_source_response", {
          profileId: HYPERLIQUID_TESTNET_INFO_PROFILE.profileId,
          queryType,
          value
        })
      };
    }
    throw lastError;
  }

  async readAccountSnapshot(input) {
    const request = assertReadInput(input, this.#clock);
    if (this.#openUntil > request.current) {
      fail(
        "hyperliquid_info_circuit_open",
        "Hyperliquid Info circuit is open"
      );
    }
    const cacheKey = hashId("hyperliquid_info_cache_key", {
      accountAddress: request.address,
      accountRole: request.role,
      fillWindowStartMs: request.startTimeMs,
      fillWindowEndMs: request.endTimeMs
    });
    const cached = this.#cache.get(cacheKey);
    if (
      cached &&
      request.current >= cached.cachedAt &&
      request.current < cached.expiresAt
    ) {
      return readResult(cached.snapshot, {
        hit: true,
        ageMs: request.current - cached.cachedAt
      });
    }
    if (cached) this.#cache.delete(cacheKey);

    const queryTypes = [
      "userRole",
      "clearinghouseState",
      "frontendOpenOrders",
      "userFillsByTime",
      ...(request.role === "master" ? ["subAccounts"] : [])
    ];
    let sources;
    let accountRoleEvidence;
    try {
      const userRoleSource = await this.#post(
        "userRole",
        requestBody("userRole", request.address)
      );
      accountRoleEvidence = normalizeAccountRole(
        userRoleSource.value,
        request.role,
        request.address
      );
      const accountSources = await Promise.all(
        queryTypes.slice(1).map((queryType) =>
          this.#post(
            queryType,
            requestBody(
              queryType,
              request.address,
              request.startTimeMs,
              request.endTimeMs
            )
          )
        )
      );
      sources = [userRoleSource, ...accountSources];
    } catch (error) {
      this.#consecutiveFailures += 1;
      if (this.#consecutiveFailures >= this.#failureThreshold) {
        this.#openUntil = nowMs(this.#clock) + this.#cooldownMs;
      }
      throw error;
    }
    this.#consecutiveFailures = 0;
    this.#openUntil = 0;

    const observedAtMs = nowMs(this.#clock);
    const source = Object.fromEntries(
      sources.map((entry) => [entry.queryType, entry])
    );
    if (
      !source.clearinghouseState ||
      !source.userRole ||
      !source.frontendOpenOrders ||
      !source.userFillsByTime ||
      (request.role === "master" && !source.subAccounts)
    ) {
      fail(
        "hyperliquid_info_partial_response",
        "Hyperliquid Info snapshot source set is incomplete"
      );
    }
    const clearinghouse = normalizeClearinghouse(
      source.clearinghouseState.value,
      observedAtMs
    );
    const openOrders = normalizeOrders(
      source.frontendOpenOrders.value,
      observedAtMs
    );
    const fills = normalizeFills(
      source.userFillsByTime.value,
      observedAtMs,
      request.startTimeMs,
      request.endTimeMs
    );
    const subaccounts =
      request.role === "master"
        ? normalizeSubaccounts(source.subAccounts.value, request.address)
        : [];
    const sourceResponseHashes = {
      userRole: source.userRole.responseHash,
      clearinghouseState: source.clearinghouseState.responseHash,
      frontendOpenOrders: source.frontendOpenOrders.responseHash,
      userFillsByTime: source.userFillsByTime.responseHash,
      subAccounts: source.subAccounts?.responseHash ?? null
    };
    const sourceBundleHash = hashId("hyperliquid_info_source_bundle", {
      profileId: HYPERLIQUID_TESTNET_INFO_PROFILE.profileId,
      accountAddressHash: hashId(
        "hyperliquid_account_address",
        request.address
      ),
      accountRole: request.role,
      fillWindowStartMs: request.startTimeMs,
      fillWindowEndMs: request.endTimeMs,
      sourceResponseHashes
    });
    const snapshotCore = {
      profileId: HYPERLIQUID_TESTNET_INFO_PROFILE.profileId,
      environment: HYPERLIQUID_TESTNET_INFO_PROFILE.environment,
      origin: HYPERLIQUID_TESTNET_INFO_PROFILE.origin,
      path: HYPERLIQUID_TESTNET_INFO_PROFILE.path,
      method: HYPERLIQUID_TESTNET_INFO_PROFILE.method,
      queryTypes,
      accountRole: request.role,
      accountAddressHash: hashId(
        "hyperliquid_account_address",
        request.address
      ),
      verifiedMasterAddressHash:
        accountRoleEvidence.verifiedMasterAddressHash,
      accountRoleVerified: true,
      actualAccountAddressQueried: true,
      apiWalletAddressAccepted: false,
      observedAt: new Date(observedAtMs).toISOString(),
      venueTime: clearinghouse.venueTime,
      freshness:
        observedAtMs >= clearinghouse.venueTimeMs &&
        observedAtMs - clearinghouse.venueTimeMs <=
          HYPERLIQUID_TESTNET_INFO_PROFILE.staleAfterMs
          ? "fresh"
          : "stale",
      staleAfterMs: HYPERLIQUID_TESTNET_INFO_PROFILE.staleAfterMs,
      sourceResponseHashes,
      sourceBundleHash,
      equity: clearinghouse.equity,
      positions: clearinghouse.positions,
      openOrders,
      fills,
      subaccounts,
      counts: {
        positions: clearinghouse.positions.length,
        openOrders: openOrders.length,
        fills: fills.length,
        subaccounts: subaccounts.length
      },
      partialResponse: false,
      readOnly: true,
      testnetOnly: true,
      testnetData: true,
      realFunds: false,
      authorizing: false,
      signerAvailable: false,
      exchangeEndpointAvailable: false,
      credentialsUsed: false,
      externalSystemQueried: true,
      externalOrderSubmitted: false,
      productionAuthority: false,
      fundsAuthority: false,
      piiIncluded: false,
      secretsIncluded: false,
      schemaVersion: HYPERLIQUID_INFO_ACCOUNT_SNAPSHOT_SCHEMA_VERSION
    };
    const snapshot = deepFreeze({
      ...snapshotCore,
      snapshotHash: hashId("hyperliquid_info_account_snapshot", snapshotCore)
    });
    if (
      !HASH.test(snapshot.sourceBundleHash) ||
      !HASH.test(snapshot.snapshotHash)
    ) {
      fail(
        "invalid_hyperliquid_info_response",
        "Hyperliquid Info snapshot hashes are invalid"
      );
    }
    this.#cache.set(cacheKey, {
      snapshot,
      cachedAt: observedAtMs,
      expiresAt: observedAtMs + this.#cacheTtlMs
    });
    return readResult(snapshot, { hit: false, ageMs: 0 });
  }

  async verifyMasterSubaccountBinding(input) {
    if (
      !exactKeys(input, ["masterAccountAddress", "subaccountAddress"])
    ) {
      fail(
        "invalid_hyperliquid_info_request",
        "Hyperliquid binding verification request has an open shape"
      );
    }
    const current = nowMs(this.#clock);
    if (this.#openUntil > current) {
      fail(
        "hyperliquid_info_circuit_open",
        "Hyperliquid Info circuit is open"
      );
    }
    const masterAddress = accountAddress(input.masterAccountAddress);
    const subaccountAddress = accountAddress(input.subaccountAddress);
    if (masterAddress === subaccountAddress) {
      fail(
        "invalid_hyperliquid_info_request",
        "Hyperliquid master and subaccount addresses must differ"
      );
    }
    let masterRoleSource;
    let subaccountRoleSource;
    let subaccountsSource;
    let subaccountRole;
    let subaccounts;
    try {
      [masterRoleSource, subaccountRoleSource] = await Promise.all([
        this.#post("userRole", requestBody("userRole", masterAddress)),
        this.#post("userRole", requestBody("userRole", subaccountAddress))
      ]);
      normalizeAccountRole(
        masterRoleSource.value,
        "master",
        masterAddress
      );
      subaccountRole = normalizeAccountRole(
        subaccountRoleSource.value,
        "subaccount",
        subaccountAddress
      );
      subaccountsSource = await this.#post(
        "subAccounts",
        requestBody("subAccounts", masterAddress)
      );
      subaccounts = normalizeSubaccounts(
        subaccountsSource.value,
        masterAddress
      );
    } catch (error) {
      this.#consecutiveFailures += 1;
      if (this.#consecutiveFailures >= this.#failureThreshold) {
        this.#openUntil = nowMs(this.#clock) + this.#cooldownMs;
      }
      throw error;
    }
    const masterAddressHash = hashId(
      "hyperliquid_account_address",
      masterAddress
    );
    const subaccountAddressHash = hashId(
      "hyperliquid_account_address",
      subaccountAddress
    );
    if (
      subaccountRole.verifiedMasterAddressHash !== masterAddressHash ||
      !subaccounts.some(
        (entry) =>
          entry.masterAddressHash === masterAddressHash &&
          entry.subaccountAddressHash === subaccountAddressHash
      )
    ) {
      this.#consecutiveFailures += 1;
      if (this.#consecutiveFailures >= this.#failureThreshold) {
        this.#openUntil = nowMs(this.#clock) + this.#cooldownMs;
      }
      fail(
        "hyperliquid_subaccount_relationship_denied",
        "Hyperliquid master/subaccount relationship was not independently verified"
      );
    }
    this.#consecutiveFailures = 0;
    this.#openUntil = 0;
    const observedAt = new Date(nowMs(this.#clock)).toISOString();
    const sourceResponseHashes = {
      masterUserRole: masterRoleSource.responseHash,
      subaccountUserRole: subaccountRoleSource.responseHash,
      subAccounts: subaccountsSource.responseHash
    };
    const relationshipCore = {
      profileId: HYPERLIQUID_TESTNET_INFO_PROFILE.profileId,
      environment: HYPERLIQUID_TESTNET_INFO_PROFILE.environment,
      masterAddressHash,
      subaccountAddressHash,
      sourceResponseHashes,
      observedAt
    };
    return deepFreeze({
      ...relationshipCore,
      relationshipHash: hashId(
        "hyperliquid_master_subaccount_relationship",
        relationshipCore
      ),
      masterRole: "user",
      subaccountRole: "subAccount",
      relationshipVerified: true,
      actualAccountAddressesQueried: true,
      apiWalletAddressAccepted: false,
      readOnly: true,
      testnetOnly: true,
      externalOrderSubmitted: false,
      signerAvailable: false,
      credentialsUsed: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "hyperliquid_account_relationship.v1"
    });
  }

  async readFillHistory(input) {
    if (
      !exactKeys(input, [
        "accountAddress",
        "fillWindowEndMs",
        "fillWindowStartMs"
      ])
    ) {
      fail(
        "invalid_hyperliquid_info_request",
        "Hyperliquid fill-history request has an open shape"
      );
    }
    const current = nowMs(this.#clock);
    if (this.#openUntil > current) {
      fail(
        "hyperliquid_info_circuit_open",
        "Hyperliquid Info circuit is open"
      );
    }
    const address = accountAddress(input.accountAddress);
    const startTimeMs = input.fillWindowStartMs;
    const endTimeMs = input.fillWindowEndMs;
    if (
      !Number.isSafeInteger(startTimeMs) ||
      !Number.isSafeInteger(endTimeMs) ||
      startTimeMs < 0 ||
      endTimeMs < startTimeMs ||
      endTimeMs > current + MAXIMUM_FUTURE_SKEW_MS ||
      endTimeMs - startTimeMs > MAXIMUM_HISTORY_WINDOW_MS
    ) {
      fail(
        "invalid_hyperliquid_info_request",
        "Hyperliquid fill-history window is invalid or unbounded"
      );
    }
    const pageHashes = [];
    const eventByHash = new Map();
    let duplicateCount = 0;
    let totalReturnedCount = 0;
    let cursor = startTimeMs;
    let paginationComplete = false;
    let paginationStalled = false;
    let sourceRoleHash;
    try {
      const roleSource = await this.#post(
        "userRole",
        requestBody("userRole", address)
      );
      normalizeAccountRole(roleSource.value, "subaccount", address);
      sourceRoleHash = roleSource.responseHash;
      for (let page = 1; page <= MAXIMUM_HISTORY_PAGES; page += 1) {
        const source = await this.#post(
          "userFillsByTime",
          requestBody("userFillsByTime", address, cursor, endTimeMs)
        );
        const fills = normalizeFills(
          source.value,
          nowMs(this.#clock),
          startTimeMs,
          endTimeMs,
          MAXIMUM_FILLS_PER_HISTORY_PAGE
        ).sort((left, right) =>
          left.timestamp.localeCompare(right.timestamp) ||
          left.transactionHash.localeCompare(right.transactionHash) ||
          left.tradeId.localeCompare(right.tradeId)
        );
        pageHashes.push(source.responseHash);
        totalReturnedCount += fills.length;
        let newEventCount = 0;
        for (const fill of fills) {
          const eventHash = hashId("hyperliquid_fill_event", fill);
          if (eventByHash.has(eventHash)) {
            duplicateCount += 1;
          } else {
            eventByHash.set(eventHash, deepFreeze({ ...fill, eventHash }));
            newEventCount += 1;
          }
        }
        if (fills.length < MAXIMUM_FILLS_PER_HISTORY_PAGE) {
          paginationComplete = true;
          break;
        }
        const lastTimeMs = Math.max(
          ...fills.map(({ timestamp: value }) => new Date(value).getTime())
        );
        if (lastTimeMs < cursor || (lastTimeMs === cursor && newEventCount === 0)) {
          paginationStalled = true;
          break;
        }
        cursor = lastTimeMs;
      }
    } catch (error) {
      this.#consecutiveFailures += 1;
      if (this.#consecutiveFailures >= this.#failureThreshold) {
        this.#openUntil = nowMs(this.#clock) + this.#cooldownMs;
      }
      throw error;
    }
    this.#consecutiveFailures = 0;
    this.#openUntil = 0;
    const events = [...eventByHash.values()].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp) ||
      left.eventHash.localeCompare(right.eventHash)
    );
    const eventHashes = events.map(({ eventHash }) => eventHash);
    const pageLimitReached =
      !paginationComplete &&
      !paginationStalled &&
      pageHashes.length === MAXIMUM_HISTORY_PAGES;
    const sourceRetentionLimitReached =
      eventHashes.length >= MAXIMUM_AVAILABLE_FILLS;
    const dataGapCodes = [
      "venue_exposes_only_10000_most_recent_fills",
      ...(paginationStalled ? ["pagination_cursor_stalled"] : []),
      ...(pageLimitReached ? ["pagination_page_limit_reached"] : []),
      ...(sourceRetentionLimitReached
        ? ["venue_survivorship_limit_reached"]
        : [])
    ];
    const observedAt = new Date(nowMs(this.#clock)).toISOString();
    const historyCore = {
      profileId: HYPERLIQUID_TESTNET_INFO_PROFILE.profileId,
      environment: HYPERLIQUID_TESTNET_INFO_PROFILE.environment,
      accountAddressHash: hashId(
        "hyperliquid_account_address",
        address
      ),
      windowStartsAt: new Date(startTimeMs).toISOString(),
      windowEndsAt: new Date(endTimeMs).toISOString(),
      sourceRoleHash,
      pageHashes,
      eventHashes,
      paginationComplete,
      paginationStalled,
      pageLimitReached,
      sourceRetentionLimitReached
    };
    return deepFreeze({
      ...historyCore,
      historyManifestHash: hashId(
        "hyperliquid_fill_history_manifest",
        historyCore
      ),
      events,
      counts: {
        pageCount: pageHashes.length,
        totalReturnedCount,
        uniqueEventCount: eventHashes.length,
        duplicateCount
      },
      sourceLimits: {
        maximumPages: MAXIMUM_HISTORY_PAGES,
        maximumFillsPerPage: MAXIMUM_FILLS_PER_HISTORY_PAGE,
        venueMostRecentFillLimit: MAXIMUM_AVAILABLE_FILLS,
        maximumWindowMs: MAXIMUM_HISTORY_WINDOW_MS
      },
      dataGapCodes,
      observedAt,
      readOnly: true,
      testnetOnly: true,
      externalOrderSubmitted: false,
      signerAvailable: false,
      credentialsUsed: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "hyperliquid_fill_history.v1"
    });
  }
}
