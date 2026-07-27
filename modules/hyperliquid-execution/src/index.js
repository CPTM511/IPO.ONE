import {
  DomainError,
  createOperationalId,
  hashId
} from "../../../packages/domain/src/index.js";

export const HYPERLIQUID_TESTNET_EXECUTION_RECORD_SCHEMA_VERSION =
  "hyperliquid_testnet_simulated_execution_record.v1";

export const HYPERLIQUID_TESTNET_EXCHANGE_PROFILE = Object.freeze({
  profileId: "hyperliquid_testnet_exchange_simulation.v1",
  environment: "hyperliquid_testnet",
  origin: "https://api.hyperliquid-testnet.xyz",
  path: "/exchange",
  endpoint: "https://api.hyperliquid-testnet.xyz/exchange",
  method: "POST",
  expiresAfterMs: 30_000,
  simulationOnly: true,
  liveTransportApproved: false,
  liveSignerApproved: false,
  apiWalletProvisioningApproved: false,
  mainnetAuthority: false,
  productionAuthority: false,
  fundsAuthority: false,
  schemaVersion: "hyperliquid_testnet_exchange_profile.v1"
});

export const HyperliquidExecutionActionKind = Object.freeze({
  ORDER: "order",
  REDUCE_ONLY_ORDER: "reduceOnlyOrder",
  CANCEL: "cancel",
  CANCEL_BY_CLOID: "cancelByCloid",
  MODIFY: "modify"
});

export const HyperliquidExecutionNonceState = Object.freeze({
  RESERVED: "RESERVED",
  SUBMITTED: "SUBMITTED",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN"
});

const ALLOWED_ACTION_KINDS = new Set(
  Object.values(HyperliquidExecutionActionKind)
);
const TERMINAL_NONCE_STATES = new Set([
  HyperliquidExecutionNonceState.CONFIRMED,
  HyperliquidExecutionNonceState.REJECTED,
  HyperliquidExecutionNonceState.UNKNOWN
]);
const HASH = /^0x[0-9a-f]{64}$/;
const CLOID = /^0x[0-9a-f]{32}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DECIMAL =
  /^(?:0\.(?:0*[1-9][0-9]*|[0-9]*[1-9]0*)|[1-9][0-9]{0,30}(?:\.[0-9]{1,18})?)$/;
const SIDE = new Set(["buy", "sell"]);
const TIME_IN_FORCE = new Set(["Alo", "Gtc", "Ioc"]);
const SIGNATURE_COMPONENT = /^0x[0-9a-f]{64}$/;
const MAXIMUM_ASSET_INDEX = 1_000_000;
const MAXIMUM_NONCE_AGE_MS = 2 * 24 * 60 * 60 * 1_000;
const MAXIMUM_NONCE_FUTURE_MS = 24 * 60 * 60 * 1_000;

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

function exactKeys(value, keys, code = "invalid_hyperliquid_execution_input") {
  if (!plainObject(value)) {
    fail(code, "input must be a plain object");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    fail(code, "input has an open or incomplete shape");
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hyperliquid_execution_input", `${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hyperliquid_execution_input", `${name} is invalid`);
  }
  return value;
}

function safePositiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(
      "invalid_hyperliquid_execution_input",
      `${name} must be a positive safe integer`
    );
  }
  return value;
}

function assetIndex(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAXIMUM_ASSET_INDEX
  ) {
    fail(
      "invalid_hyperliquid_execution_action",
      "assetIndex is outside the closed bound"
    );
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail(
      "invalid_hyperliquid_execution_action",
      `${name} must be a bounded positive decimal string`
    );
  }
  return value;
}

function side(value) {
  if (!SIDE.has(value)) {
    fail("invalid_hyperliquid_execution_action", "side is unsupported");
  }
  return value;
}

function timeInForce(value) {
  if (!TIME_IN_FORCE.has(value)) {
    fail(
      "invalid_hyperliquid_execution_action",
      "timeInForce is unsupported"
    );
  }
  return value;
}

function cloid(value) {
  if (typeof value !== "string" || !CLOID.test(value)) {
    fail("invalid_hyperliquid_execution_action", "cloid is invalid");
  }
  return value;
}

function timestamp(clock) {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid_hyperliquid_execution_clock", "clock returned an invalid time");
  }
  return value;
}

function iso(value) {
  return new Date(value).toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertOrderFields(value, { includeReduceOnly = false } = {}) {
  exactKeys(
    value,
    includeReduceOnly
      ? [
          "assetIndex",
          "side",
          "limitPx",
          "size",
          "timeInForce",
          "reduceOnly"
        ]
      : ["assetIndex", "side", "limitPx", "size", "timeInForce"],
    "invalid_hyperliquid_execution_action"
  );
  if (includeReduceOnly && typeof value.reduceOnly !== "boolean") {
    fail(
      "invalid_hyperliquid_execution_action",
      "reduceOnly must be a server boolean"
    );
  }
  return {
    assetIndex: assetIndex(value.assetIndex),
    side: side(value.side),
    limitPx: decimal("limitPx", value.limitPx),
    size: decimal("size", value.size),
    ...(includeReduceOnly ? { reduceOnly: value.reduceOnly } : {}),
    timeInForce: timeInForce(value.timeInForce)
  };
}

function deterministicCloid({
  facilityHash,
  orderIntentHash,
  idempotencyKeyHash,
  actionKind
}) {
  return `0x${hashId("hyperliquid_execution_cloid", {
    facilityHash,
    orderIntentHash,
    idempotencyKeyHash,
    actionKind
  }).slice(2, 34)}`;
}

function normalizeAction(
  input,
  { facilityHash, orderIntentHash, idempotencyKeyHash }
) {
  if (!plainObject(input) || !ALLOWED_ACTION_KINDS.has(input.kind)) {
    fail(
      "hyperliquid_execution_action_denied",
      "only the typed execution allowlist is available"
    );
  }
  const generatedCloid = deterministicCloid({
    facilityHash,
    orderIntentHash,
    idempotencyKeyHash,
    actionKind: input.kind
  });

  switch (input.kind) {
    case HyperliquidExecutionActionKind.ORDER: {
      exactKeys(
        input,
        ["kind", "assetIndex", "side", "limitPx", "size", "timeInForce"],
        "invalid_hyperliquid_execution_action"
      );
      return {
        actionKind: input.kind,
        action: {
          ...assertOrderFields({
            assetIndex: input.assetIndex,
            side: input.side,
            limitPx: input.limitPx,
            size: input.size,
            timeInForce: input.timeInForce
          }),
          reduceOnly: false,
          cloid: generatedCloid
        },
        cloid: generatedCloid
      };
    }
    case HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER: {
      exactKeys(
        input,
        ["kind", "assetIndex", "side", "limitPx", "size", "timeInForce"],
        "invalid_hyperliquid_execution_action"
      );
      return {
        actionKind: input.kind,
        action: {
          ...assertOrderFields({
            assetIndex: input.assetIndex,
            side: input.side,
            limitPx: input.limitPx,
            size: input.size,
            timeInForce: input.timeInForce
          }),
          reduceOnly: true,
          cloid: generatedCloid
        },
        cloid: generatedCloid
      };
    }
    case HyperliquidExecutionActionKind.CANCEL: {
      exactKeys(
        input,
        ["kind", "assetIndex", "orderId"],
        "invalid_hyperliquid_execution_action"
      );
      return {
        actionKind: input.kind,
        action: {
          assetIndex: assetIndex(input.assetIndex),
          orderId: safePositiveInteger("orderId", input.orderId)
        },
        cloid: null
      };
    }
    case HyperliquidExecutionActionKind.CANCEL_BY_CLOID: {
      exactKeys(
        input,
        ["kind", "assetIndex", "cloid"],
        "invalid_hyperliquid_execution_action"
      );
      return {
        actionKind: input.kind,
        action: {
          assetIndex: assetIndex(input.assetIndex),
          cloid: cloid(input.cloid)
        },
        cloid: input.cloid
      };
    }
    case HyperliquidExecutionActionKind.MODIFY: {
      exactKeys(
        input,
        ["kind", "orderId", "replacement"],
        "invalid_hyperliquid_execution_action"
      );
      const replacement = assertOrderFields(input.replacement, {
        includeReduceOnly: true
      });
      return {
        actionKind: input.kind,
        action: {
          orderId: safePositiveInteger("orderId", input.orderId),
          replacement: {
            ...replacement,
            cloid: generatedCloid
          }
        },
        cloid: generatedCloid
      };
    }
    default:
      fail("hyperliquid_execution_action_denied", "action is denied");
  }
}

function assertBinding(value, expected) {
  exactKeys(
    value,
    [
      "facilityId",
      "facilityHash",
      "accountBindingHash",
      "signerReferenceHash",
      "simulationOnly",
      "liveSignerAvailable",
      "apiWalletApproved",
      "keyExportable"
    ],
    "invalid_hyperliquid_execution_binding"
  );
  if (
    value.facilityId !== expected.facilityId ||
    value.facilityHash !== expected.facilityHash ||
    value.simulationOnly !== true ||
    value.liveSignerAvailable !== false ||
    value.apiWalletApproved !== false ||
    value.keyExportable !== false
  ) {
    fail(
      "hyperliquid_execution_binding_unavailable",
      "an offline simulation-only Facility binding is required"
    );
  }
  hash("accountBindingHash", value.accountBindingHash);
  hash("signerReferenceHash", value.signerReferenceHash);
  return value;
}

function assertPolicyDecision(value, actionKind) {
  exactKeys(
    value,
    [
      "approved",
      "policyDecisionHash",
      "actionKind",
      "serverReduceOnlyProven",
      "killSwitchOpen",
      "simulationOnly"
    ],
    "invalid_hyperliquid_execution_policy"
  );
  if (
    value.approved !== true ||
    value.actionKind !== actionKind ||
    value.killSwitchOpen !== true ||
    value.simulationOnly !== true
  ) {
    fail(
      "hyperliquid_execution_policy_denied",
      "server policy or kill switch denied execution"
    );
  }
  if (
    actionKind === HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER &&
    value.serverReduceOnlyProven !== true
  ) {
    fail(
      "hyperliquid_execution_reduce_only_unproven",
      "reduce-only execution requires server proof"
    );
  }
  if (typeof value.serverReduceOnlyProven !== "boolean") {
    fail(
      "invalid_hyperliquid_execution_policy",
      "serverReduceOnlyProven must be boolean"
    );
  }
  hash("policyDecisionHash", value.policyDecisionHash);
  return value;
}

function assertSignerResult(value, digestHash) {
  exactKeys(
    value,
    [
      "digestHash",
      "signature",
      "signatureHash",
      "simulationOnly",
      "keyExportable",
      "rawKeyAccessible",
      "reusable"
    ],
    "invalid_hyperliquid_simulated_signer"
  );
  exactKeys(
    value.signature,
    ["r", "s", "v"],
    "invalid_hyperliquid_simulated_signer"
  );
  if (
    value.digestHash !== digestHash ||
    !SIGNATURE_COMPONENT.test(value.signature.r) ||
    !SIGNATURE_COMPONENT.test(value.signature.s) ||
    ![27, 28].includes(value.signature.v) ||
    value.signatureHash !==
      hashId("hyperliquid_simulated_signature", {
        digestHash,
        signature: value.signature
      }) ||
    value.simulationOnly !== true ||
    value.keyExportable !== false ||
    value.rawKeyAccessible !== false ||
    value.reusable !== false
  ) {
    fail(
      "invalid_hyperliquid_simulated_signer",
      "simulated signer violated the isolated non-export boundary"
    );
  }
  return value;
}

function assertTransportResult(value) {
  exactKeys(
    value,
    [
      "disposition",
      "responseHash",
      "simulationOnly",
      "externalSystemQueried",
      "externalOrderSubmitted"
    ],
    "invalid_hyperliquid_simulated_transport"
  );
  if (
    !["confirmed", "rejected", "unknown"].includes(value.disposition) ||
    value.simulationOnly !== true ||
    value.externalSystemQueried !== false ||
    value.externalOrderSubmitted !== false
  ) {
    fail(
      "invalid_hyperliquid_simulated_transport",
      "transport attempted to leave the simulation boundary"
    );
  }
  hash("responseHash", value.responseHash);
  return value;
}

function baseSafety() {
  return {
    environment: HYPERLIQUID_TESTNET_EXCHANGE_PROFILE.environment,
    origin: HYPERLIQUID_TESTNET_EXCHANGE_PROFILE.origin,
    path: HYPERLIQUID_TESTNET_EXCHANGE_PROFILE.path,
    method: HYPERLIQUID_TESTNET_EXCHANGE_PROFILE.method,
    simulationOnly: true,
    externalSystemQueried: false,
    externalOrderSubmitted: false,
    externalReconciliationRequired: false,
    reconciled: true,
    signerIsolated: true,
    keyExportable: false,
    rawActionAccepted: false,
    rawResponsePersisted: false,
    reusableSignaturePersisted: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    accountAdministrationAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion: HYPERLIQUID_TESTNET_EXECUTION_RECORD_SCHEMA_VERSION
  };
}

function assertGatewayInput(value) {
  exactKeys(value, [
    "facilityId",
    "facilityHash",
    "facilityVersion",
    "orderIntentId",
    "orderIntentHash",
    "orderIntentVersion",
    "idempotencyKey",
    "action"
  ]);
  identifier("facilityId", value.facilityId);
  hash("facilityHash", value.facilityHash);
  safePositiveInteger("facilityVersion", value.facilityVersion);
  identifier("orderIntentId", value.orderIntentId);
  hash("orderIntentHash", value.orderIntentHash);
  if (![1, 2].includes(value.orderIntentVersion)) {
    fail(
      "invalid_hyperliquid_execution_input",
      "orderIntentVersion is unsupported"
    );
  }
  if (
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length < 8 ||
    value.idempotencyKey.length > 256
  ) {
    fail(
      "invalid_hyperliquid_execution_input",
      "idempotencyKey must be bounded"
    );
  }
  return value;
}

function createDraft(input, binding, policy, normalized) {
  const idempotencyKeyHash = hashId("hyperliquid_execution_idempotency", {
    idempotencyKey: input.idempotencyKey
  });
  const actionHash = hashId(
    "hyperliquid_execution_action",
    normalized.action
  );
  const requestCore = {
    facilityId: input.facilityId,
    facilityHash: input.facilityHash,
    facilityVersion: input.facilityVersion,
    orderIntentId: input.orderIntentId,
    orderIntentHash: input.orderIntentHash,
    orderIntentVersion: input.orderIntentVersion,
    accountBindingHash: binding.accountBindingHash,
    signerReferenceHash: binding.signerReferenceHash,
    idempotencyKeyHash,
    policyDecisionHash: policy.policyDecisionHash,
    actionKind: normalized.actionKind,
    actionHash,
    action: normalized.action,
    cloid: normalized.cloid
  };
  return deepFreeze({
    ...requestCore,
    requestHash: hashId("hyperliquid_execution_request", requestCore)
  });
}

export function createReservedExecutionRecord(draft, {
  nonce,
  nowMs,
  expiresAfter
}) {
  safePositiveInteger("nonce", nonce);
  safePositiveInteger("nowMs", nowMs);
  safePositiveInteger("expiresAfter", expiresAfter);
  if (
    nonce < nowMs - MAXIMUM_NONCE_AGE_MS ||
    nonce > nowMs + MAXIMUM_NONCE_FUTURE_MS ||
    expiresAfter <= nowMs
  ) {
    fail(
      "hyperliquid_execution_nonce_out_of_window",
      "nonce or expiration is outside the fixed Testnet window"
    );
  }
  const executionId = createOperationalId("trading_execution");
  const createdAt = iso(nowMs);
  const immutable = {
    executionId,
    requestHash: draft.requestHash,
    facilityId: draft.facilityId,
    facilityHash: draft.facilityHash,
    orderIntentId: draft.orderIntentId,
    orderIntentHash: draft.orderIntentHash,
    signerReferenceHash: draft.signerReferenceHash,
    actionHash: draft.actionHash,
    nonce
  };
  return deepFreeze({
    executionId,
    executionHash: hashId("hyperliquid_execution", immutable),
    ...draft,
    expiresAfter,
    nonce,
    nonceState: HyperliquidExecutionNonceState.RESERVED,
    outcome: null,
    resultHash: null,
    createdAt,
    reservedAt: createdAt,
    submittedAt: null,
    resolvedAt: null,
    updatedAt: createdAt,
    ...baseSafety()
  });
}

export function transitionExecutionRecord(
  record,
  { nextState, resultHash = null, outcome = null, nowMs }
) {
  safePositiveInteger("nowMs", nowMs);
  const previous = record.nonceState;
  const legal =
    (previous === HyperliquidExecutionNonceState.RESERVED &&
      [
        HyperliquidExecutionNonceState.SUBMITTED,
        HyperliquidExecutionNonceState.REJECTED
      ].includes(nextState)) ||
    (previous === HyperliquidExecutionNonceState.SUBMITTED &&
      TERMINAL_NONCE_STATES.has(nextState));
  if (!legal) {
    fail(
      "hyperliquid_execution_transition_denied",
      "nonce state transition is terminal or out of order"
    );
  }
  if (TERMINAL_NONCE_STATES.has(nextState)) {
    hash("resultHash", resultHash);
    const expectedOutcome = {
      [HyperliquidExecutionNonceState.CONFIRMED]: "simulated_confirmed",
      [HyperliquidExecutionNonceState.REJECTED]: "simulated_rejected",
      [HyperliquidExecutionNonceState.UNKNOWN]: "simulated_unknown"
    }[nextState];
    if (outcome !== expectedOutcome) {
      fail(
        "invalid_hyperliquid_execution_outcome",
        "outcome does not match terminal nonce state"
      );
    }
  } else if (resultHash !== null || outcome !== null) {
    fail(
      "invalid_hyperliquid_execution_outcome",
      "non-terminal execution cannot have a result"
    );
  }
  const changedAt = iso(nowMs);
  return deepFreeze({
    ...structuredClone(record),
    nonceState: nextState,
    outcome,
    resultHash,
    submittedAt:
      nextState === HyperliquidExecutionNonceState.SUBMITTED
        ? changedAt
        : record.submittedAt,
    resolvedAt: TERMINAL_NONCE_STATES.has(nextState) ? changedAt : null,
    updatedAt: changedAt
  });
}

export class InMemoryHyperliquidExecutionRepository {
  #records = new Map();
  #idempotency = new Map();
  #nonceHeads = new Map();
  #transitions = new Map();
  #queue = Promise.resolve();

  constructor(snapshot) {
    if (snapshot === undefined) return;
    exactKeys(
      snapshot,
      ["records", "nonceHeads", "transitions"],
      "invalid_hyperliquid_execution_snapshot"
    );
    for (const record of snapshot.records) {
      this.#records.set(record.executionId, deepFreeze(structuredClone(record)));
      this.#idempotency.set(record.idempotencyKeyHash, record.executionId);
    }
    for (const [key, value] of snapshot.nonceHeads) {
      this.#nonceHeads.set(hash("signerReferenceHash", key), value);
    }
    for (const [key, value] of snapshot.transitions) {
      this.#transitions.set(key, structuredClone(value));
    }
  }

  #exclusive(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => {});
    return next;
  }

  async reserve(draft, { nowMs, expiresAfter }) {
    return this.#exclusive(async () => {
      const existingId = this.#idempotency.get(draft.idempotencyKeyHash);
      if (existingId) {
        const existing = this.#records.get(existingId);
        if (existing.requestHash !== draft.requestHash) {
          fail(
            "hyperliquid_execution_idempotency_conflict",
            "idempotency key is bound to another request"
          );
        }
        return { record: existing, replayed: true };
      }
      const previous = this.#nonceHeads.get(draft.signerReferenceHash) ?? 0;
      const nonce = Math.max(nowMs, previous + 1);
      const record = createReservedExecutionRecord(draft, {
        nonce,
        nowMs,
        expiresAfter
      });
      this.#nonceHeads.set(draft.signerReferenceHash, nonce);
      this.#records.set(record.executionId, record);
      this.#idempotency.set(record.idempotencyKeyHash, record.executionId);
      this.#transitions.set(record.executionId, [
        {
          sequence: 1,
          state: record.nonceState,
          transitionHash: hashId("hyperliquid_execution_transition", {
            executionHash: record.executionHash,
            state: record.nonceState,
            changedAt: record.updatedAt
          }),
          changedAt: record.updatedAt
        }
      ]);
      return { record, replayed: false };
    });
  }

  async transition({ executionId, expectedState, nextState, resultHash, outcome, nowMs }) {
    return this.#exclusive(async () => {
      const current = this.#records.get(executionId);
      if (!current || current.nonceState !== expectedState) {
        fail(
          "hyperliquid_execution_concurrency_conflict",
          "execution state changed or is unavailable"
        );
      }
      const next = transitionExecutionRecord(current, {
        nextState,
        resultHash,
        outcome,
        nowMs
      });
      this.#records.set(executionId, next);
      this.#transitions.get(executionId).push({
        sequence:
          current.nonceState === HyperliquidExecutionNonceState.RESERVED
            ? 2
            : 3,
        state: next.nonceState,
        transitionHash: hashId("hyperliquid_execution_transition", {
          executionHash: next.executionHash,
          previousState: current.nonceState,
          state: next.nonceState,
          resultHash: next.resultHash,
          changedAt: next.updatedAt
        }),
        changedAt: next.updatedAt
      });
      return next;
    });
  }

  async findByIdempotencyHash(idempotencyKeyHash) {
    const executionId = this.#idempotency.get(
      hash("idempotencyKeyHash", idempotencyKeyHash)
    );
    return executionId ? this.#records.get(executionId) : undefined;
  }

  async transitionHistory(executionId) {
    identifier("executionId", executionId);
    return structuredClone(this.#transitions.get(executionId) ?? []);
  }

  exportSnapshot() {
    return deepFreeze({
      records: [...this.#records.values()].map((value) =>
        structuredClone(value)
      ),
      nonceHeads: [...this.#nonceHeads.entries()],
      transitions: [...this.#transitions.entries()].map(([key, value]) => [
        key,
        structuredClone(value)
      ])
    });
  }
}

export class SimulatedIsolatedHyperliquidSigner {
  constructor(options = {}) {
    exactKeys(
      options,
      [],
      "invalid_hyperliquid_simulated_signer_configuration"
    );
    this.profile = deepFreeze({
      signerMode: "isolated_simulation",
      simulationOnly: true,
      liveSignerAvailable: false,
      apiWalletApproved: false,
      keyExportable: false,
      rawKeyAccessible: false,
      privateKeyAccepted: false,
      schemaVersion: "hyperliquid_simulated_signer_profile.v1"
    });
  }

  async sign({ digestHash }) {
    hash("digestHash", digestHash);
    const signature = {
      r: hashId("hyperliquid_simulated_signature_r", { digestHash }),
      s: hashId("hyperliquid_simulated_signature_s", { digestHash }),
      v: 27
    };
    return deepFreeze({
      digestHash,
      signature,
      signatureHash: hashId("hyperliquid_simulated_signature", {
        digestHash,
        signature
      }),
      simulationOnly: true,
      keyExportable: false,
      rawKeyAccessible: false,
      reusable: false
    });
  }
}

export class SimulatedHyperliquidExchangeTransport {
  #disposition;
  #submissionHashes = [];

  constructor({ disposition = "confirmed", ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !["confirmed", "rejected", "unknown"].includes(disposition)
    ) {
      fail(
        "invalid_hyperliquid_simulated_transport_configuration",
        "simulation disposition is invalid"
      );
    }
    this.#disposition = disposition;
    this.profile = deepFreeze({
      ...HYPERLIQUID_TESTNET_EXCHANGE_PROFILE,
      networkAvailable: false,
      fetchAvailable: false,
      rawBodyAccepted: false,
      schemaVersion: "hyperliquid_simulated_exchange_transport.v1"
    });
  }

  async submit(envelope) {
    exactKeys(
      envelope,
      [
        "action",
        "actionKind",
        "expiresAfter",
        "nonce",
        "signature",
        "signerReferenceHash"
      ],
      "invalid_hyperliquid_simulated_transport"
    );
    safePositiveInteger("nonce", envelope.nonce);
    safePositiveInteger("expiresAfter", envelope.expiresAfter);
    hash("signerReferenceHash", envelope.signerReferenceHash);
    exactKeys(
      envelope.signature,
      ["r", "s", "v"],
      "invalid_hyperliquid_simulated_transport"
    );
    const submissionHash = hashId("hyperliquid_simulated_submission", envelope);
    this.#submissionHashes.push(submissionHash);
    return deepFreeze({
      disposition: this.#disposition,
      responseHash: hashId("hyperliquid_simulated_response", {
        submissionHash,
        disposition: this.#disposition
      }),
      simulationOnly: true,
      externalSystemQueried: false,
      externalOrderSubmitted: false
    });
  }

  get submissionHashes() {
    return Object.freeze([...this.#submissionHashes]);
  }
}

export class HyperliquidTestnetExecutionGateway {
  #repository;
  #bindingResolver;
  #policyEvaluator;
  #signer;
  #transport;
  #clock;

  constructor({
    repository,
    bindingResolver,
    policyEvaluator,
    signer,
    transport,
    clock = Date.now,
    ...unknown
  } = {}) {
    if (Object.keys(unknown).length !== 0) {
      fail(
        "invalid_hyperliquid_execution_configuration",
        "gateway configuration has an open shape"
      );
    }
    if (
      !repository ||
      typeof repository.reserve !== "function" ||
      typeof repository.transition !== "function" ||
      !bindingResolver ||
      typeof bindingResolver.resolve !== "function" ||
      !policyEvaluator ||
      typeof policyEvaluator.evaluate !== "function" ||
      !signer ||
      typeof signer.sign !== "function" ||
      signer.profile?.simulationOnly !== true ||
      signer.profile?.liveSignerAvailable !== false ||
      signer.profile?.apiWalletApproved !== false ||
      signer.profile?.keyExportable !== false ||
      !transport ||
      typeof transport.submit !== "function" ||
      transport.profile?.simulationOnly !== true ||
      transport.profile?.liveTransportApproved !== false ||
      transport.profile?.networkAvailable !== false ||
      typeof clock !== "function"
    ) {
      fail(
        "hyperliquid_execution_runtime_unavailable",
        "only the complete offline simulation composition is approved"
      );
    }
    this.#repository = repository;
    this.#bindingResolver = bindingResolver;
    this.#policyEvaluator = policyEvaluator;
    this.#signer = signer;
    this.#transport = transport;
    this.#clock = clock;
  }

  async execute(rawInput) {
    const input = assertGatewayInput(rawInput);
    const idempotencyKeyHash = hashId("hyperliquid_execution_idempotency", {
      idempotencyKey: input.idempotencyKey
    });
    const normalized = normalizeAction(input.action, {
      facilityHash: input.facilityHash,
      orderIntentHash: input.orderIntentHash,
      idempotencyKeyHash
    });
    const binding = assertBinding(
      await this.#bindingResolver.resolve({
        facilityId: input.facilityId,
        facilityHash: input.facilityHash
      }),
      input
    );
    const policy = assertPolicyDecision(
      await this.#policyEvaluator.evaluate({
        facilityId: input.facilityId,
        facilityHash: input.facilityHash,
        facilityVersion: input.facilityVersion,
        orderIntentId: input.orderIntentId,
        orderIntentHash: input.orderIntentHash,
        orderIntentVersion: input.orderIntentVersion,
        actionKind: normalized.actionKind,
        actionHash: hashId(
          "hyperliquid_execution_action",
          normalized.action
        ),
        action: normalized.action,
        simulationOnly: true
      }),
      normalized.actionKind
    );
    const draft = createDraft(input, binding, policy, normalized);
    const nowMs = timestamp(this.#clock);
    const reservation = await this.#repository.reserve(draft, {
      nowMs,
      expiresAfter:
        nowMs + HYPERLIQUID_TESTNET_EXCHANGE_PROFILE.expiresAfterMs
    });
    if (reservation.replayed) return reservation.record;

    const digestHash = hashId("hyperliquid_simulated_signing_digest", {
      action: reservation.record.action,
      nonce: reservation.record.nonce,
      expiresAfter: reservation.record.expiresAfter,
      signerReferenceHash: reservation.record.signerReferenceHash
    });
    let signed;
    try {
      signed = assertSignerResult(
        await this.#signer.sign({ digestHash }),
        digestHash
      );
    } catch (error) {
      const resultHash = hashId("hyperliquid_simulated_local_rejection", {
        executionHash: reservation.record.executionHash,
        reasonCode: "simulated_signer_rejected"
      });
      await this.#repository.transition({
        executionId: reservation.record.executionId,
        expectedState: HyperliquidExecutionNonceState.RESERVED,
        nextState: HyperliquidExecutionNonceState.REJECTED,
        resultHash,
        outcome: "simulated_rejected",
        nowMs: timestamp(this.#clock)
      });
      throw error;
    }

    const submitted = await this.#repository.transition({
      executionId: reservation.record.executionId,
      expectedState: HyperliquidExecutionNonceState.RESERVED,
      nextState: HyperliquidExecutionNonceState.SUBMITTED,
      resultHash: null,
      outcome: null,
      nowMs: timestamp(this.#clock)
    });

    let transportResult;
    try {
      transportResult = assertTransportResult(
        await this.#transport.submit({
          action: submitted.action,
          actionKind: submitted.actionKind,
          expiresAfter: submitted.expiresAfter,
          nonce: submitted.nonce,
          signature: signed.signature,
          signerReferenceHash: submitted.signerReferenceHash
        })
      );
    } catch {
      transportResult = {
        disposition: "unknown",
        responseHash: hashId("hyperliquid_simulated_unknown_response", {
          executionHash: submitted.executionHash
        }),
        simulationOnly: true,
        externalSystemQueried: false,
        externalOrderSubmitted: false
      };
    }
    const terminal = {
      confirmed: {
        nextState: HyperliquidExecutionNonceState.CONFIRMED,
        outcome: "simulated_confirmed"
      },
      rejected: {
        nextState: HyperliquidExecutionNonceState.REJECTED,
        outcome: "simulated_rejected"
      },
      unknown: {
        nextState: HyperliquidExecutionNonceState.UNKNOWN,
        outcome: "simulated_unknown"
      }
    }[transportResult.disposition];
    const resultHash = hashId("hyperliquid_simulated_execution_result", {
      executionHash: submitted.executionHash,
      signatureHash: signed.signatureHash,
      responseHash: transportResult.responseHash,
      outcome: terminal.outcome
    });
    return this.#repository.transition({
      executionId: submitted.executionId,
      expectedState: HyperliquidExecutionNonceState.SUBMITTED,
      ...terminal,
      resultHash,
      nowMs: timestamp(this.#clock)
    });
  }
}

function executionTransitionRecord({
  record,
  previousState,
  changedAt
}) {
  const transitionId = createOperationalId("trading_execution_transition");
  const sequence =
    previousState === null
      ? 1
      : previousState === HyperliquidExecutionNonceState.RESERVED
        ? 2
        : 3;
  const core = {
    transitionId,
    executionId: record.executionId,
    executionHash: record.executionHash,
    sequence,
    previousState,
    nextState: record.nonceState,
    resultHash: record.resultHash,
    changedAt
  };
  return deepFreeze({
    ...core,
    transitionHash: hashId("hyperliquid_execution_transition", core),
    simulationOnly: true,
    secretsIncluded: false,
    schemaVersion: "trading_testnet_execution_transition.v1"
  });
}

function recordSqlValues(record, version) {
  return [
    record.executionId,
    record.executionHash,
    record.requestHash,
    record.idempotencyKeyHash,
    record.facilityId,
    record.facilityHash,
    record.orderIntentId,
    record.orderIntentHash,
    record.accountBindingHash,
    record.signerReferenceHash,
    record.policyDecisionHash,
    record.actionKind,
    record.actionHash,
    record.cloid,
    record.nonce,
    record.nonceState,
    record.outcome,
    record.resultHash,
    JSON.stringify(record),
    version,
    record.createdAt,
    record.reservedAt,
    record.submittedAt,
    record.resolvedAt,
    record.updatedAt,
    record.simulationOnly,
    record.externalSystemQueried,
    record.externalOrderSubmitted,
    record.signerIsolated,
    record.keyExportable,
    record.rawActionAccepted,
    record.rawResponsePersisted,
    record.reusableSignaturePersisted,
    record.withdrawalAuthority,
    record.transferAuthority,
    record.accountAdministrationAuthority,
    record.mainnetAuthority,
    record.productionAuthority,
    record.fundsAuthority,
    record.secretsIncluded,
    record.schemaVersion
  ];
}

async function insertTransition(client, {
  record,
  previousState
}) {
  const transition = executionTransitionRecord({
    record,
    previousState,
    changedAt: record.updatedAt
  });
  await client.query(
    `INSERT INTO trading_testnet_execution_transitions (
       id,
       execution_id,
       execution_hash,
       transition_hash,
       previous_state,
       next_state,
       sequence,
       result_hash,
       changed_at,
       transition,
       simulation_only,
       secrets_included,
       schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11, $12, $13
     )`,
    [
      transition.transitionId,
      transition.executionId,
      transition.executionHash,
      transition.transitionHash,
      transition.previousState,
      transition.nextState,
      transition.sequence,
      transition.resultHash,
      transition.changedAt,
      JSON.stringify(transition),
      transition.simulationOnly,
      transition.secretsIncluded,
      transition.schemaVersion
    ]
  );
}

export class PostgresHyperliquidExecutionRepository {
  #eventRepository;

  constructor({ eventRepository, ...unknown } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      !eventRepository ||
      typeof eventRepository.withTenantWrite !== "function" ||
      typeof eventRepository.withTenantRead !== "function"
    ) {
      fail(
        "invalid_hyperliquid_execution_repository",
        "a tenant-scoped PostgreSQL Event Repository is required"
      );
    }
    this.#eventRepository = eventRepository;
  }

  async #withWrite(operation) {
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      try {
        return await this.#eventRepository.withTenantWrite(operation);
      } catch (error) {
        if (
          !["40001", "40P01"].includes(error.code) ||
          attempt === 5
        ) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 5 * (attempt + 1))
        );
      }
    }
    fail(
      "hyperliquid_execution_transaction_retry_exhausted",
      "nonce transaction retry budget was exhausted"
    );
  }

  async reserve(draft, { nowMs, expiresAfter }) {
    return this.#withWrite(async (client) => {
      const existing = await client.query(
        `SELECT request_hash, record
           FROM trading_testnet_execution_records
          WHERE idempotency_key_hash = $1
          FOR UPDATE`,
        [draft.idempotencyKeyHash]
      );
      if (existing.rowCount === 1) {
        if (existing.rows[0].request_hash !== draft.requestHash) {
          fail(
            "hyperliquid_execution_idempotency_conflict",
            "idempotency key is bound to another request"
          );
        }
        return {
          record: deepFreeze(structuredClone(existing.rows[0].record)),
          replayed: true
        };
      }

      const head = await client.query(
        `INSERT INTO trading_execution_nonce_heads (
           signer_reference_hash,
           facility_id,
           account_binding_hash,
           last_nonce,
           version,
           updated_at,
           simulation_only,
           live_signer_available,
           api_wallet_approved,
           key_exportable,
           schema_version
         ) VALUES (
           $1, $2, $3, $4, 1, $5, TRUE, FALSE, FALSE, FALSE,
           'trading_execution_nonce_head.v1'
         )
         ON CONFLICT (tenant_id, signer_reference_hash)
         DO UPDATE SET
           last_nonce = GREATEST(
             trading_execution_nonce_heads.last_nonce + 1,
             EXCLUDED.last_nonce
           ),
           version = trading_execution_nonce_heads.version + 1,
           updated_at = EXCLUDED.updated_at
         WHERE
           trading_execution_nonce_heads.facility_id = EXCLUDED.facility_id
           AND trading_execution_nonce_heads.account_binding_hash =
             EXCLUDED.account_binding_hash
         RETURNING last_nonce`,
        [
          draft.signerReferenceHash,
          draft.facilityId,
          draft.accountBindingHash,
          nowMs,
          iso(nowMs)
        ]
      );
      if (head.rowCount !== 1) {
        fail(
          "hyperliquid_execution_binding_conflict",
          "signer reference is already bound to another Facility"
        );
      }
      const nonce = Number(head.rows[0].last_nonce);
      safePositiveInteger("nonce", nonce);
      const record = createReservedExecutionRecord(draft, {
        nonce,
        nowMs,
        expiresAfter
      });
      await client.query(
        `INSERT INTO trading_testnet_execution_records (
           id,
           execution_hash,
           request_hash,
           idempotency_key_hash,
           facility_id,
           facility_hash,
           order_intent_id,
           order_intent_hash,
           account_binding_hash,
           signer_reference_hash,
           policy_decision_hash,
           action_kind,
           action_hash,
           cloid,
           nonce,
           nonce_state,
           outcome,
           result_hash,
           record,
           version,
           created_at,
           reserved_at,
           submitted_at,
           resolved_at,
           updated_at,
           simulation_only,
           external_system_queried,
           external_order_submitted,
           signer_isolated,
           key_exportable,
           raw_action_accepted,
           raw_response_persisted,
           reusable_signature_persisted,
           withdrawal_authority,
           transfer_authority,
           account_administration_authority,
           mainnet_authority,
           production_authority,
           funds_authority,
           secrets_included,
           schema_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19::JSONB, $20,
           $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
           $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
         )`,
        recordSqlValues(record, 1)
      );
      await insertTransition(client, { record, previousState: null });
      return { record, replayed: false };
    });
  }

  async transition({
    executionId,
    expectedState,
    nextState,
    resultHash,
    outcome,
    nowMs
  }) {
    return this.#withWrite(async (client) => {
      const currentResult = await client.query(
        `SELECT record, version
           FROM trading_testnet_execution_records
          WHERE id = $1
          FOR UPDATE`,
        [executionId]
      );
      if (
        currentResult.rowCount !== 1 ||
        currentResult.rows[0].record.nonceState !== expectedState
      ) {
        fail(
          "hyperliquid_execution_concurrency_conflict",
          "execution state changed or is unavailable"
        );
      }
      const current = currentResult.rows[0].record;
      const version = Number(currentResult.rows[0].version);
      const next = transitionExecutionRecord(current, {
        nextState,
        resultHash,
        outcome,
        nowMs
      });
      const result = await client.query(
        `UPDATE trading_testnet_execution_records
            SET nonce_state = $2,
                outcome = $3,
                result_hash = $4,
                record = $5::JSONB,
                version = $6,
                submitted_at = $7,
                resolved_at = $8,
                updated_at = $9
          WHERE id = $1
            AND nonce_state = $10
            AND version = $11`,
        [
          executionId,
          next.nonceState,
          next.outcome,
          next.resultHash,
          JSON.stringify(next),
          version + 1,
          next.submittedAt,
          next.resolvedAt,
          next.updatedAt,
          expectedState,
          version
        ]
      );
      if (result.rowCount !== 1) {
        fail(
          "hyperliquid_execution_concurrency_conflict",
          "execution transition lost its version lock"
        );
      }
      await insertTransition(client, {
        record: next,
        previousState: current.nonceState
      });
      return next;
    });
  }

  async findByIdempotencyHash(idempotencyKeyHash) {
    hash("idempotencyKeyHash", idempotencyKeyHash);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT record
           FROM trading_testnet_execution_records
          WHERE idempotency_key_hash = $1`,
        [idempotencyKeyHash]
      );
      return result.rowCount === 1
        ? deepFreeze(structuredClone(result.rows[0].record))
        : undefined;
    });
  }

  async transitionHistory(executionId) {
    identifier("executionId", executionId);
    return this.#eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT transition
           FROM trading_testnet_execution_transitions
          WHERE execution_id = $1
          ORDER BY sequence`,
        [executionId]
      );
      return result.rows.map(({ transition }) => structuredClone(transition));
    });
  }
}
