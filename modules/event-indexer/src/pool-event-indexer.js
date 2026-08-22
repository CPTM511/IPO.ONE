import { DomainError, hashId } from "../../../packages/domain/src/index.js";

const FINALITY_RANK = Object.freeze({ included: 1, safe: 2, finalized: 3, invalidated: 4 });
const PROTECTIVE_OPERATIONS = new Set(["repay", "add_collateral", "liquidate"]);
const NEW_RISK_OPERATIONS = new Set(["supply", "withdraw", "release_collateral", "borrow"]);
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function clone(value) {
  return structuredClone(value);
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    fail("invalid_pool_projection", `${name} must be an unsigned decimal string`);
  }
  return BigInt(value);
}

function add(left, right) {
  return (decimal("left", left) + decimal("right", right)).toString();
}

function subtract(left, right) {
  const result = decimal("left", left) - decimal("right", right);
  if (result < 0n) fail("pool_projection_underflow", "Pool V1 event would underflow the projection");
  return result.toString();
}

function emptyAccount(account) {
  return {
    account,
    supplyShares: "0",
    collateralAssets: "0",
    debtShares: "0",
    debtAssets: "0",
    badDebtAssets: "0"
  };
}

function accountFor(state, address) {
  state.accounts[address] ??= emptyAccount(address);
  return state.accounts[address];
}

function initialState(descriptor) {
  return {
    chainId: descriptor.chainId,
    contractAddress: descriptor.contractAddress,
    marketId: descriptor.marketId,
    abiVersion: descriptor.abiVersion,
    initialized: false,
    configuration: null,
    cashAssets: "0",
    grossDebtAssets: "0",
    reservesAssets: "0",
    badDebtAssets: "0",
    totalSupplyShares: "0",
    totalDebtShares: "0",
    lastAccruedAt: "0",
    acceptedPriceUsdWad: "0",
    acceptedOracleObservedAt: "0",
    acceptedOracleRoundId: "0",
    oracleDeviationHalted: false,
    newRiskPaused: false,
    accounts: {}
  };
}

function canonicalState(state) {
  return {
    chainId: state.chainId,
    contractAddress: state.contractAddress,
    marketId: state.marketId,
    abiVersion: state.abiVersion,
    initialized: state.initialized,
    configuration: clone(state.configuration),
    cashAssets: state.cashAssets,
    grossDebtAssets: state.grossDebtAssets,
    reservesAssets: state.reservesAssets,
    badDebtAssets: state.badDebtAssets,
    totalSupplyShares: state.totalSupplyShares,
    totalDebtShares: state.totalDebtShares,
    lastAccruedAt: state.lastAccruedAt,
    acceptedPriceUsdWad: state.acceptedPriceUsdWad,
    acceptedOracleObservedAt: state.acceptedOracleObservedAt,
    acceptedOracleRoundId: state.acceptedOracleRoundId,
    oracleDeviationHalted: state.oracleDeviationHalted,
    newRiskPaused: state.newRiskPaused,
    accounts: Object.values(state.accounts).sort((left, right) => left.account.localeCompare(right.account)).map(clone)
  };
}

function projectionSnapshot(state, finalizedEventKeys) {
  const canonical = canonicalState(state);
  const stateHash = hashId("pool_v1_economic_state", canonical);
  const core = {
    chainId: state.chainId,
    contractAddress: state.contractAddress,
    marketId: state.marketId,
    abiVersion: state.abiVersion,
    finalizedEventCount: finalizedEventKeys.length,
    finalizedEventKeys: [...finalizedEventKeys],
    state: canonical,
    stateHash
  };
  return Object.freeze({
    ...core,
    snapshotHash: hashId("pool_v1_projection_snapshot", core),
    schemaVersion: "pool_v1_projection_snapshot.v1"
  });
}

function applyFinalizedEvent(current, observation) {
  if (observation.observationStatus !== "finalized") {
    fail("pool_event_not_finalized", "only finalized Pool V1 events can mutate the canonical projection");
  }
  const state = clone(current);
  const args = observation.args;
  switch (observation.eventName) {
    case "MarketInitialized":
      if (state.initialized) fail("pool_already_initialized", "MarketInitialized can project only once");
      state.initialized = true;
      state.lastAccruedAt = observation.blockTimestamp;
      state.configuration = {
        chainId: args.chainId,
        debtAsset: args.debtAsset,
        collateralAsset: args.collateralAsset,
        priceOracle: args.priceOracle,
        oracleSourceId: args.oracleSourceId,
        marketDebtCapAssets: args.marketDebtCapAssets,
        borrowerDebtCapAssets: args.borrowerDebtCapAssets,
        loanToValueBps: args.loanToValueBps,
        liquidationThresholdBps: args.liquidationThresholdBps,
        pauseGuardian: args.pauseGuardian,
        recoveryAuthority: args.recoveryAuthority
      };
      break;
    case "OracleObservationAccepted":
      state.acceptedPriceUsdWad = args.priceUsdWad;
      state.acceptedOracleObservedAt = args.observedAt;
      state.acceptedOracleRoundId = args.roundId;
      break;
    case "OracleDeviationHaltChanged":
      state.oracleDeviationHalted = args.halted;
      break;
    case "InterestAccrued":
      state.lastAccruedAt = args.toTimestamp;
      state.grossDebtAssets = add(state.grossDebtAssets, args.interestAssets);
      state.reservesAssets = add(state.reservesAssets, args.reserveAssets);
      break;
    case "AssetsSupplied": {
      const account = accountFor(state, args.account);
      account.supplyShares = add(account.supplyShares, args.shares);
      state.cashAssets = args.cashAfter;
      state.totalSupplyShares = args.totalSupplySharesAfter;
      break;
    }
    case "AssetsWithdrawn": {
      const account = accountFor(state, args.account);
      account.supplyShares = subtract(account.supplyShares, args.shares);
      state.cashAssets = args.cashAfter;
      state.totalSupplyShares = args.totalSupplySharesAfter;
      break;
    }
    case "CollateralAdded":
    case "CollateralReleased":
      accountFor(state, args.account).collateralAssets = args.collateralAfter;
      break;
    case "AssetsBorrowed": {
      const account = accountFor(state, args.account);
      account.debtShares = add(account.debtShares, args.debtShares);
      account.debtAssets = args.debtAfter;
      state.cashAssets = args.cashAfter;
      state.grossDebtAssets = add(state.grossDebtAssets, args.assets);
      state.totalDebtShares = add(state.totalDebtShares, args.debtShares);
      break;
    }
    case "AssetsRepaid": {
      const account = accountFor(state, args.account);
      account.debtShares = subtract(account.debtShares, args.debtSharesBurned);
      account.debtAssets = args.debtAfter;
      state.cashAssets = args.cashAfter;
      state.grossDebtAssets = subtract(state.grossDebtAssets, args.debtReducedAssets);
      state.reservesAssets = add(state.reservesAssets, args.reserveDustAssets);
      state.totalDebtShares = subtract(state.totalDebtShares, args.debtSharesBurned);
      break;
    }
    case "PositionLiquidated": {
      const account = accountFor(state, args.borrower);
      account.collateralAssets = subtract(account.collateralAssets, args.collateralSeizedAssets);
      if (args.badDebtRecognizedAssets !== "0") {
        state.totalDebtShares = subtract(state.totalDebtShares, account.debtShares);
        account.debtShares = "0";
        account.debtAssets = args.badDebtRecognizedAssets;
        account.badDebtAssets = add(account.badDebtAssets, args.badDebtRecognizedAssets);
        state.badDebtAssets = add(state.badDebtAssets, args.badDebtRecognizedAssets);
      }
      break;
    }
    case "BadDebtRecovered": {
      const account = accountFor(state, args.account);
      account.badDebtAssets = args.accountBadDebtAfter;
      account.debtAssets = args.accountBadDebtAfter;
      state.badDebtAssets = args.marketBadDebtAfter;
      state.cashAssets = add(state.cashAssets, args.recoveredAssets);
      state.grossDebtAssets = subtract(state.grossDebtAssets, args.recoveredAssets);
      break;
    }
    case "NewRiskPauseChanged":
      state.newRiskPaused = args.paused;
      break;
    default:
      fail("unsupported_pool_projection_event", "Pool V1 event has no closed projection rule");
  }
  return state;
}

function validateStateShape(input, descriptor) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("invalid_pool_direct_state", "direct-read state must be an object");
  }
  const expected = new Set([
    "chainId", "contractAddress", "marketId", "abiVersion", "initialized", "configuration",
    "cashAssets", "grossDebtAssets", "reservesAssets", "badDebtAssets", "totalSupplyShares",
    "totalDebtShares", "lastAccruedAt", "acceptedPriceUsdWad", "acceptedOracleObservedAt",
    "acceptedOracleRoundId", "oracleDeviationHalted", "newRiskPaused", "accounts"
  ]);
  const unknown = Object.keys(input).filter((key) => !expected.has(key));
  if (unknown.length > 0) fail("invalid_pool_direct_state", "direct-read state has unknown fields", { unknown });
  if (
    input.chainId !== descriptor.chainId || input.contractAddress !== descriptor.contractAddress ||
    input.marketId !== descriptor.marketId || input.abiVersion !== descriptor.abiVersion
  ) fail("pool_direct_state_binding_mismatch", "direct-read state binding does not match the configured pool");
  if (typeof input.initialized !== "boolean" || typeof input.oracleDeviationHalted !== "boolean" || typeof input.newRiskPaused !== "boolean") {
    fail("invalid_pool_direct_state", "direct-read boolean state is invalid");
  }
  for (const name of [
    "cashAssets", "grossDebtAssets", "reservesAssets", "badDebtAssets", "totalSupplyShares",
    "totalDebtShares", "lastAccruedAt", "acceptedPriceUsdWad", "acceptedOracleObservedAt",
    "acceptedOracleRoundId"
  ]) decimal(name, input[name]);
  let configuration = null;
  if (input.initialized) {
    const configurationKeys = [
      "chainId", "debtAsset", "collateralAsset", "priceOracle", "oracleSourceId",
      "marketDebtCapAssets", "borrowerDebtCapAssets", "loanToValueBps",
      "liquidationThresholdBps", "pauseGuardian", "recoveryAuthority"
    ];
    if (
      !input.configuration || typeof input.configuration !== "object" ||
      Array.isArray(input.configuration) ||
      Object.keys(input.configuration).some((key) => !configurationKeys.includes(key)) ||
      configurationKeys.some((key) => !(key in input.configuration))
    ) fail("invalid_pool_direct_state", "direct-read market configuration is not closed");
    for (const name of ["debtAsset", "collateralAsset", "priceOracle", "pauseGuardian", "recoveryAuthority"]) {
      if (typeof input.configuration[name] !== "string" || !ADDRESS_PATTERN.test(input.configuration[name])) {
        fail("invalid_pool_direct_state", `direct-read ${name} is invalid`);
      }
    }
    if (typeof input.configuration.oracleSourceId !== "string" || !HEX_32_PATTERN.test(input.configuration.oracleSourceId)) {
      fail("invalid_pool_direct_state", "direct-read oracleSourceId is invalid");
    }
    for (const name of [
      "chainId", "marketDebtCapAssets", "borrowerDebtCapAssets", "loanToValueBps", "liquidationThresholdBps"
    ]) decimal(name, input.configuration[name]);
    configuration = clone(input.configuration);
  } else if (input.configuration !== null) {
    fail("invalid_pool_direct_state", "an uninitialized direct-read state cannot claim configuration");
  }
  if (!Array.isArray(input.accounts)) fail("invalid_pool_direct_state", "direct-read accounts must be an array");
  const accounts = input.accounts.map((account) => {
    const keys = ["account", "supplyShares", "collateralAssets", "debtShares", "debtAssets", "badDebtAssets"];
    if (!account || typeof account !== "object" || Object.keys(account).some((key) => !keys.includes(key))) {
      fail("invalid_pool_direct_state", "direct-read account is invalid");
    }
    if (typeof account.account !== "string" || !ADDRESS_PATTERN.test(account.account)) {
      fail("invalid_pool_direct_state", "direct-read account address is invalid");
    }
    for (const name of keys.slice(1)) decimal(name, account[name]);
    return { ...account };
  }).sort((left, right) => left.account.localeCompare(right.account));
  if (new Set(accounts.map(({ account }) => account)).size !== accounts.length) {
    fail("invalid_pool_direct_state", "direct-read accounts must be unique");
  }
  return { ...clone(input), configuration, accounts };
}

export function normalizePoolDirectStateSnapshot(input, descriptor) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("invalid_pool_direct_snapshot", "direct-read snapshot must be an object");
  }
  const allowed = new Set([
    "providerSlot", "chainId", "contractAddress", "marketId", "blockNumber", "blockHash",
    "state", "complete", "observedAt", "readOnly", "rawProviderPayloadPersisted", "schemaVersion"
  ]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail("invalid_pool_direct_snapshot", "direct-read snapshot has unknown fields", { unknown });
  if (!new Set(["primary", "secondary"]).has(input.providerSlot)) {
    fail("invalid_pool_direct_snapshot", "providerSlot must be primary or secondary");
  }
  if (
    input.chainId !== descriptor.chainId || input.contractAddress !== descriptor.contractAddress ||
    input.marketId !== descriptor.marketId
  ) fail("pool_direct_snapshot_binding_mismatch", "direct-read snapshot does not match the configured pool");
  if (input.readOnly !== true || input.rawProviderPayloadPersisted !== false || input.schemaVersion !== "pool_direct_state_snapshot.v1") {
    fail("invalid_pool_direct_snapshot", "direct reads must be normalized, read-only and raw-free");
  }
  if (typeof input.complete !== "boolean") fail("invalid_pool_direct_snapshot", "direct-read completeness is required");
  const blockNumber = decimal("blockNumber", input.blockNumber).toString();
  if (typeof input.blockHash !== "string" || !HEX_32_PATTERN.test(input.blockHash)) {
    fail("invalid_pool_direct_snapshot", "direct-read block hash is invalid");
  }
  const observed = new Date(input.observedAt);
  if (!Number.isFinite(observed.getTime())) fail("invalid_pool_direct_snapshot", "direct-read timestamp is invalid");
  const state = input.complete ? validateStateShape(input.state, descriptor) : undefined;
  const core = {
    providerSlot: input.providerSlot,
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    marketId: input.marketId,
    blockNumber,
    blockHash: input.blockHash,
    complete: input.complete,
    ...(state ? { state, stateHash: hashId("pool_v1_economic_state", state) } : {}),
    observedAt: observed.toISOString(),
    readOnly: true,
    rawProviderPayloadPersisted: false
  };
  return Object.freeze({
    ...core,
    snapshotHash: hashId("pool_direct_state_snapshot", core),
    schemaVersion: "pool_direct_state_snapshot.v1"
  });
}

export class InMemoryPoolObservationStore {
  #observations = [];
  #observationHashes = new Set();
  #effects = [];
  #effectKeys = new Set();
  #cursors = [];
  #outbox = [];
  #reconciliations = [];
  #riskControl;
  #riskTransitions = [];

  async commitIngestion(bundle) {
    const fresh = bundle.observations.filter(({ observationHash }) => !this.#observationHashes.has(observationHash));
    if (fresh.length === 0 && !bundle.effect) return { replayed: true };
    for (const observation of fresh) {
      this.#observationHashes.add(observation.observationHash);
      this.#observations.push(clone(observation));
    }
    if (bundle.effect && !this.#effectKeys.has(bundle.effect.eventKey)) {
      this.#effectKeys.add(bundle.effect.eventKey);
      this.#effects.push(clone(bundle.effect));
      this.#outbox.push(clone(bundle.outbox));
    }
    if (bundle.cursor) this.#cursors.push(clone(bundle.cursor));
    return { replayed: fresh.length === 0, observationCount: fresh.length };
  }

  async listObservations() {
    return this.#observations.map(clone);
  }

  async latestProjection() {
    return clone(this.#effects.at(-1)?.projection);
  }

  async listOutbox() {
    return this.#outbox.map(clone);
  }

  async appendReconciliation(bundle) {
    this.#reconciliations.push(clone(bundle));
    if (bundle.riskControl) this.#riskControl = clone(bundle.riskControl);
    if (bundle.riskTransition) this.#riskTransitions.push(clone(bundle.riskTransition));
    return { replayed: false };
  }

  async latestReconciliation() {
    return clone(this.#reconciliations.at(-1)?.run);
  }

  async latestRiskControl() {
    return clone(this.#riskControl);
  }

  async listRiskTransitions() {
    return this.#riskTransitions.map(clone);
  }
}

export class PoolEventIndexer {
  #adapter;
  #store;
  #descriptor;
  #state;
  #latestByEventKey = new Map();
  #finalizedEventKeys = [];
  #finalizedEventKeySet = new Set();
  #finalizedObservations = new Map();
  #head;
  #riskControl;

  constructor({ adapter, store, clock = () => new Date() }) {
    if (!adapter || typeof adapter.normalizeLog !== "function" || typeof adapter.createInvalidation !== "function") {
      fail("invalid_pool_adapter", "Pool event indexer requires the closed Pool V1 adapter");
    }
    if (!store || typeof store.commitIngestion !== "function" || typeof store.listObservations !== "function") {
      fail("invalid_pool_store", "Pool event indexer requires a durable observation store boundary");
    }
    this.#adapter = adapter;
    this.#store = store;
    this.#descriptor = adapter.descriptor();
    this.#state = initialState(this.#descriptor);
    this.clock = clock;
    this.#riskControl = this.#newRiskControl(false, "initial_local_no_funds_state");
  }

  #newRiskControl(frozen, reasonCode, previous = this.#riskControl) {
    const core = {
      chainId: this.#descriptor.chainId,
      contractAddress: this.#descriptor.contractAddress,
      marketId: this.#descriptor.marketId,
      newRiskFrozen: frozen,
      reasonCode,
      version: (previous?.version ?? 0) + 1,
      previousControlHash: previous?.controlHash,
      changedAt: this.clock().toISOString(),
      protectiveOperations: [...PROTECTIVE_OPERATIONS].sort(),
      blockedOperations: [...NEW_RISK_OPERATIONS].sort(),
      syntheticOnly: true,
      productionFundsMoved: false
    };
    return Object.freeze({
      ...core,
      controlHash: hashId("pool_risk_control", core),
      schemaVersion: "pool_risk_control.v1"
    });
  }

  snapshot() {
    return projectionSnapshot(this.#state, this.#finalizedEventKeys);
  }

  #orderedFinalized(observations = this.#finalizedObservations) {
    return [...observations.values()].sort((left, right) => {
      const blockOrder = BigInt(left.blockNumber) - BigInt(right.blockNumber);
      if (blockOrder !== 0n) return blockOrder < 0n ? -1 : 1;
      if (left.transactionIndex !== right.transactionIndex) return left.transactionIndex - right.transactionIndex;
      if (left.logIndex !== right.logIndex) return left.logIndex - right.logIndex;
      return left.eventKey.localeCompare(right.eventKey);
    });
  }

  #rebuildProjection(observations = this.#finalizedObservations) {
    const ordered = this.#orderedFinalized(observations);
    let state = initialState(this.#descriptor);
    for (const finalized of ordered) state = applyFinalizedEvent(state, finalized);
    return {
      state,
      eventKeys: ordered.map(({ eventKey }) => eventKey)
    };
  }

  riskControl() {
    return clone(this.#riskControl);
  }

  operationAllowed(operation) {
    if (!PROTECTIVE_OPERATIONS.has(operation) && !NEW_RISK_OPERATIONS.has(operation)) {
      fail("unknown_pool_operation", "operation is outside the closed Pool V1 risk policy");
    }
    return !this.#riskControl.newRiskFrozen || PROTECTIVE_OPERATIONS.has(operation);
  }

  #validateTransition(current, next) {
    if (!current) return;
    if (current.observationHash === next.observationHash) return;
    if (current.observationStatus === "finalized") {
      if (current.eventContentHash !== next.eventContentHash || next.observationStatus !== "finalized") {
        fail("finalized_pool_event_cannot_reorg", "finalized Pool V1 history cannot change");
      }
      return;
    }
    if (current.observationStatus === "invalidated") {
      if (current.blockHash === next.blockHash) {
        fail("invalidated_pool_event_reused", "an invalidated block observation cannot be reused");
      }
      return;
    }
    if (current.blockHash === next.blockHash) {
      if (current.eventContentHash !== next.eventContentHash) {
        fail("pool_event_content_drift", "one tuple/block identity decoded to different event content");
      }
      if (FINALITY_RANK[next.observationStatus] <= FINALITY_RANK[current.observationStatus]) {
        fail("pool_finality_regression", "Pool V1 finality must advance monotonically");
      }
    }
  }

  #cursorFor(observation) {
    const block = BigInt(observation.blockNumber);
    const headBlock = this.#head ? BigInt(this.#head.blockNumber) : undefined;
    if (headBlock !== undefined && block < headBlock) {
      const depth = headBlock - block;
      if (depth > BigInt(this.#descriptor.finalityPolicy.maxReorgDepth)) {
        fail("pool_log_beyond_reorg_window", "reordered pool log is outside the admitted reorg window");
      }
    }
    if (!this.#head || block > BigInt(this.#head.blockNumber)) {
      this.#head = {
        blockNumber: observation.blockNumber,
        blockHash: observation.blockHash,
        eventKey: observation.eventKey
      };
    }
    const core = {
      chainId: observation.chainId,
      contractAddress: observation.contractAddress,
      marketId: observation.marketId,
      blockNumber: observation.blockNumber,
      blockHash: observation.blockHash,
      eventKey: observation.eventKey,
      observationHash: observation.observationHash,
      recordedAt: observation.observedAt
    };
    return {
      ...core,
      cursorHash: hashId("pool_chain_cursor", core),
      schemaVersion: "pool_chain_cursor.v1"
    };
  }

  #applyObservation(observation, { persist }) {
    const current = this.#latestByEventKey.get(observation.eventKey);
    if (current?.observationHash === observation.observationHash) {
      return { duplicate: true, observations: [], effect: undefined, cursor: undefined };
    }
    if (
      current?.eventContentHash === observation.eventContentHash &&
      current.observationStatus === observation.observationStatus
    ) {
      return { duplicate: true, observations: [], effect: undefined, cursor: undefined };
    }
    this.#validateTransition(current, observation);
    const observations = [];
    if (
      current && current.observationStatus !== "invalidated" &&
      current.blockHash !== observation.blockHash
    ) {
      const invalidation = this.#adapter.createInvalidation(current, {
        canonicalBlockHash: observation.blockHash,
        observedAt: observation.observedAt
      });
      observations.push(invalidation);
      this.#latestByEventKey.set(current.eventKey, invalidation);
    }
    observations.push(observation);
    this.#latestByEventKey.set(observation.eventKey, observation);

    let effect;
    let outbox;
    if (observation.observationStatus === "finalized" && !this.#finalizedEventKeySet.has(observation.eventKey)) {
      const candidates = new Map(this.#finalizedObservations);
      candidates.set(observation.eventKey, observation);
      const rebuilt = this.#rebuildProjection(candidates);
      this.#state = rebuilt.state;
      this.#finalizedObservations = candidates;
      this.#finalizedEventKeySet.add(observation.eventKey);
      this.#finalizedEventKeys = rebuilt.eventKeys;
      const projection = this.snapshot();
      const effectCore = {
        eventKey: observation.eventKey,
        observationHash: observation.observationHash,
        projectionHash: projection.snapshotHash,
        stateHash: projection.stateHash,
        eventType: observation.eventType,
        recordedAt: observation.observedAt
      };
      effect = {
        ...effectCore,
        effectHash: hashId("pool_finalized_effect", effectCore),
        projection,
        schemaVersion: "pool_finalized_effect.v1"
      };
      const outboxCore = {
        eventKey: observation.eventKey,
        effectHash: effect.effectHash,
        stateHash: projection.stateHash,
        marketId: observation.marketId,
        finality: "finalized",
        syntheticOnly: true,
        productionFundsMoved: false
      };
      outbox = {
        outboxMessageId: hashId("pool_finalized_outbox", observation.eventKey),
        payloadHash: hashId("pool_finalized_outbox_payload", outboxCore),
        payload: outboxCore,
        status: "pending",
        schemaVersion: "pool_finalized_outbox.v1"
      };
    }
    return { duplicate: false, observations, effect, outbox, cursor: this.#cursorFor(observation), persist };
  }

  async ingest(log) {
    const observation = this.#adapter.normalizeLog(log);
    const applied = this.#applyObservation(observation, { persist: true });
    if (applied.duplicate) return { disposition: "duplicate", observation, snapshot: this.snapshot() };
    const persisted = await this.#store.commitIngestion(applied);
    return Object.freeze({
      disposition: applied.effect ? "finalized" : "observed",
      observation,
      invalidations: applied.observations.filter((item) => item.observationStatus === "invalidated"),
      effect: clone(applied.effect),
      snapshot: this.snapshot(),
      persisted
    });
  }

  async observeCanonicalBlock({ blockNumber, blockHash, observedAt }) {
    decimal("blockNumber", blockNumber);
    if (typeof blockHash !== "string" || !HEX_32_PATTERN.test(blockHash)) {
      fail("invalid_canonical_block", "canonical block hash is invalid");
    }
    const candidates = [...this.#latestByEventKey.values()].filter(
      (observation) => observation.blockNumber === blockNumber && observation.blockHash !== blockHash &&
        observation.observationStatus !== "invalidated"
    );
    if (candidates.some(({ observationStatus }) => observationStatus === "finalized")) {
      fail("finalized_pool_event_cannot_reorg", "canonical read conflicts with finalized Pool V1 history");
    }
    if (candidates.length === 0) return Object.freeze({ disposition: "unchanged", invalidations: [] });
    const invalidations = candidates.map((observation) => this.#adapter.createInvalidation(observation, {
      canonicalBlockHash: blockHash,
      observedAt
    }));
    for (const invalidation of invalidations) this.#latestByEventKey.set(invalidation.eventKey, invalidation);
    const cursorCore = {
      chainId: this.#descriptor.chainId,
      contractAddress: this.#descriptor.contractAddress,
      marketId: this.#descriptor.marketId,
      blockNumber,
      blockHash,
      eventKey: undefined,
      observationHash: hashId("pool_empty_canonical_block", { blockNumber, blockHash }),
      recordedAt: new Date(observedAt).toISOString()
    };
    const cursor = {
      ...cursorCore,
      cursorHash: hashId("pool_chain_cursor", cursorCore),
      schemaVersion: "pool_chain_cursor.v1"
    };
    await this.#store.commitIngestion({ observations: invalidations, cursor });
    return Object.freeze({ disposition: "invalidated", invalidations: invalidations.map(clone) });
  }

  async restore() {
    const history = await this.#store.listObservations(this.#descriptor);
    this.#state = initialState(this.#descriptor);
    this.#latestByEventKey = new Map();
    this.#finalizedEventKeys = [];
    this.#finalizedEventKeySet = new Set();
    this.#finalizedObservations = new Map();
    this.#head = undefined;
    for (const observation of history) {
      if (observation.observationStatus === "invalidated") {
        this.#latestByEventKey.set(observation.eventKey, observation);
        continue;
      }
      this.#latestByEventKey.set(observation.eventKey, observation);
      this.#cursorFor(observation);
      if (observation.observationStatus === "finalized") {
        this.#finalizedObservations.set(observation.eventKey, observation);
      }
    }
    const rebuilt = this.#rebuildProjection();
    this.#state = rebuilt.state;
    this.#finalizedEventKeys = rebuilt.eventKeys;
    this.#finalizedEventKeySet = new Set(rebuilt.eventKeys);
    this.#riskControl = (await this.#store.latestRiskControl?.(this.#descriptor)) ?? this.#newRiskControl(false, "restored_local_no_funds_state");
    return this.snapshot();
  }

  async reconcile({ directReads }) {
    if (!Array.isArray(directReads) || directReads.length !== 2) {
      fail("pool_two_provider_reads_required", "Pool V1 reconciliation requires exactly two direct reads");
    }
    const reads = directReads.map((read) => normalizePoolDirectStateSnapshot(read, this.#descriptor));
    if (new Set(reads.map(({ providerSlot }) => providerSlot)).size !== 2) {
      fail("pool_two_provider_reads_required", "Pool V1 reconciliation requires primary and secondary slots");
    }
    const projection = this.snapshot();
    let reasonCode = "reconciled";
    if (reads.some(({ complete }) => !complete)) reasonCode = "provider_read_incomplete";
    else if (
      reads[0].blockNumber !== reads[1].blockNumber || reads[0].blockHash !== reads[1].blockHash ||
      reads[0].stateHash !== reads[1].stateHash
    ) reasonCode = "provider_disagreement";
    else if (reads[0].stateHash !== projection.stateHash) reasonCode = "projection_mismatch";
    const consistent = reasonCode === "reconciled";
    const checkedAt = this.clock().toISOString();
    const runCore = {
      chainId: this.#descriptor.chainId,
      contractAddress: this.#descriptor.contractAddress,
      marketId: this.#descriptor.marketId,
      projectionHash: projection.snapshotHash,
      projectionStateHash: projection.stateHash,
      riskControlHash: this.#riskControl.controlHash,
      directReadHashes: reads.map(({ snapshotHash }) => snapshotHash).sort(),
      directStateHashes: reads.map(({ stateHash }) => stateHash ?? null).sort(),
      reasonCode,
      consistent,
      checkedAt,
      syntheticOnly: true,
      productionFundsMoved: false
    };
    const run = {
      reconciliationId: hashId("pool_reconciliation_id", runCore),
      reconciliationHash: hashId("pool_reconciliation", runCore),
      ...runCore,
      schemaVersion: "pool_reconciliation.v1"
    };
    const evidence = {
      evidenceId: hashId("pool_reconciliation_evidence_id", run.reconciliationId),
      evidenceHash: hashId("pool_reconciliation_evidence", run),
      eventType: consistent ? "pool_reconciliation_passed" : "pool_reconciliation_discrepancy",
      reasonCode,
      reconciliationId: run.reconciliationId,
      projectionStateHash: projection.stateHash,
      directStateHashes: run.directStateHashes,
      recordedAt: checkedAt,
      schemaVersion: "pool_reconciliation_evidence.v1"
    };
    let riskControl;
    let previousRiskControl;
    let riskTransition;
    if (!consistent && !this.#riskControl.newRiskFrozen) {
      const previous = this.#riskControl;
      previousRiskControl = previous;
      riskControl = this.#newRiskControl(true, reasonCode, previous);
      riskTransition = {
        transitionId: hashId("pool_risk_transition", { from: previous.controlHash, to: riskControl.controlHash }),
        previousControlHash: previous.controlHash,
        nextControlHash: riskControl.controlHash,
        reconciliationId: run.reconciliationId,
        transition: "freeze_new_risk",
        reasonCode,
        recordedAt: checkedAt,
        schemaVersion: "pool_risk_transition.v1"
      };
      this.#riskControl = riskControl;
    }
    await this.#store.appendReconciliation({
      run,
      reads,
      evidence,
      previousRiskControl,
      riskControl,
      riskTransition
    });
    return Object.freeze({ run, evidence, riskControl: this.riskControl(), riskTransition: clone(riskTransition) });
  }

  async approveRecovery({ reconciliationId, approvalHash, approvedByHash }) {
    if (!this.#riskControl.newRiskFrozen) fail("pool_new_risk_not_frozen", "Pool V1 new risk is already active");
    if (typeof approvalHash !== "string" || !HEX_32_PATTERN.test(approvalHash) || typeof approvedByHash !== "string" || !HEX_32_PATTERN.test(approvedByHash)) {
      fail("invalid_pool_recovery_approval", "recovery requires hash-only approval and reviewer bindings");
    }
    const latest = await this.#store.latestReconciliation(this.#descriptor);
    if (!latest || latest.reconciliationId !== reconciliationId || latest.consistent !== true) {
      fail("pool_recovery_reconciliation_required", "recovery requires the latest zero-discrepancy reconciliation");
    }
    const previous = this.#riskControl;
    const riskControl = this.#newRiskControl(false, "approved_zero_discrepancy_recovery", previous);
    const recordedAt = this.clock().toISOString();
    const riskTransition = {
      transitionId: hashId("pool_risk_transition", { from: previous.controlHash, to: riskControl.controlHash }),
      previousControlHash: previous.controlHash,
      nextControlHash: riskControl.controlHash,
      reconciliationId,
      approvalHash,
      approvedByHash,
      transition: "resume_new_risk",
      reasonCode: "approved_zero_discrepancy_recovery",
      recordedAt,
      schemaVersion: "pool_risk_transition.v1"
    };
    const evidence = {
      evidenceId: hashId("pool_recovery_evidence_id", riskTransition.transitionId),
      evidenceHash: hashId("pool_recovery_evidence", riskTransition),
      eventType: "pool_new_risk_recovery_approved",
      reconciliationId,
      approvalHash,
      approvedByHash,
      recordedAt,
      schemaVersion: "pool_reconciliation_evidence.v1"
    };
    this.#riskControl = riskControl;
    await this.#store.appendReconciliation({ run: latest, reads: [], evidence, riskControl, riskTransition });
    return Object.freeze({ riskControl: this.riskControl(), riskTransition, evidence });
  }
}
