import {
  DomainError,
  M2_POOL_REFERENCE_POLICY,
  calculateCollateralValueAssets,
  calculateUtilizationBps,
  hashId
} from "../../../packages/domain/src/index.js";

const OWN_ACTIONS = new Set([
  "supply",
  "withdraw",
  "deposit_collateral",
  "borrow",
  "repay",
  "release_collateral"
]);
const NEW_RISK_ACTIONS = new Set(["withdraw", "borrow", "release_collateral"]);
const ORACLE_REQUIRED_ACTIONS = new Set(["borrow", "release_collateral"]);
const POSITION_REQUIRED_ACTIONS = new Set(["withdraw", "borrow", "repay", "release_collateral"]);
const EMPTY_POSITION = Object.freeze({
  supplyShares: "0",
  collateralAssets: "0",
  debtShares: "0",
  debtAssets: "0",
  badDebtAssets: "0"
});
const EVM_ACCOUNT = /^0x[0-9a-fA-F]{40}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function exactObject(value, keys) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function decimal(name, value, { positive = false } = {}) {
  if (
    typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value) ||
    (positive && value === "0")
  ) fail("invalid_secured_pool_workspace", `${name} must be bounded unsigned asset units`);
  return BigInt(value);
}

function safeDecimal(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value);
}

function iso(value) {
  return (typeof value === "string" || value instanceof Date) && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : null;
}

function emptyPayload(payload, label) {
  if (!exactObject(payload, [])) {
    fail("invalid_tenant_command_payload", `${label} payload must be empty`);
  }
}

function ownResource(resource) {
  if (
    resource?.resourceType !== "subject" ||
    typeof resource.resourceId !== "string" || resource.resourceId.length === 0
  ) fail("tenant_resource_unavailable", "The requested resource is not available.");
  return resource.resourceId;
}

function riskResource(authorizationDecision) {
  if (
    authorizationDecision?.resourceType !== "risk_portfolio" ||
    typeof authorizationDecision.resourceId !== "string" ||
    authorizationDecision.resourceId.length === 0
  ) fail("tenant_resource_unavailable", "The requested resource is not available.");
  return authorizationDecision.resourceId;
}

function verifiedPoolSnapshot(row) {
  const projection = row?.projection;
  const state = projection?.state;
  if (
    projection?.schemaVersion !== "pool_v1_projection_snapshot.v1" ||
    !state || typeof state !== "object" || Array.isArray(state) ||
    state.chainId !== row.chain_id || state.contractAddress !== row.contract_address ||
    state.marketId !== row.market_id || state.initialized !== true ||
    !state.configuration || typeof state.configuration !== "object" ||
    typeof state.newRiskPaused !== "boolean" ||
    !Array.isArray(state.accounts) ||
    !safeDecimal(state.cashAssets) || !safeDecimal(state.grossDebtAssets) ||
    !safeDecimal(state.reservesAssets) || !safeDecimal(state.badDebtAssets) ||
    !safeDecimal(state.totalSupplyShares) || !safeDecimal(state.totalDebtShares)
  ) fail("projection_integrity_mismatch", "Secured Pool projection is inconsistent");
  return projection;
}

async function loadPoolContext(client) {
  const markets = await client.query(
    `SELECT chain_id, contract_address, market_id
       FROM pool_chain_finalized_effects
      GROUP BY chain_id, contract_address, market_id
      ORDER BY chain_id, contract_address, market_id
      LIMIT 2`
  );
  if (!Array.isArray(markets?.rows) || markets.rowCount !== markets.rows.length) {
    fail("projection_integrity_mismatch", "Secured Pool market scope is inconsistent");
  }
  if (markets.rowCount > 1) {
    fail("pool_market_scope_violation", "M2 permits exactly one curated secured market");
  }
  if (markets.rowCount === 0) return null;
  const market = markets.rows[0];
  const effectResult = await client.query(
      `SELECT chain_id, contract_address, market_id, effect_hash, projection, recorded_at
         FROM pool_chain_finalized_effects
        WHERE chain_id = $1 AND contract_address = $2 AND market_id = $3
        ORDER BY finalized_sequence DESC
        LIMIT 1`,
      [market.chain_id, market.contract_address, market.market_id]
    );
  const reconciliationResult = await client.query(
      `SELECT reconciliation_hash, consistent, reason_code, run, checked_at
         FROM pool_reconciliation_runs
        WHERE chain_id = $1 AND contract_address = $2 AND market_id = $3
        ORDER BY checked_at DESC, id DESC
        LIMIT 1`,
      [market.chain_id, market.contract_address, market.market_id]
    );
  const controlResult = await client.query(
      `SELECT control_hash, new_risk_frozen, reason_code, control, changed_at
         FROM pool_risk_controls
        WHERE chain_id = $1 AND contract_address = $2 AND market_id = $3
        ORDER BY version DESC
        LIMIT 1`,
      [market.chain_id, market.contract_address, market.market_id]
    );
  if (effectResult.rowCount !== 1 || reconciliationResult.rowCount > 1 || controlResult.rowCount > 1) {
    fail("projection_integrity_mismatch", "Secured Pool server truth is inconsistent");
  }
  const effect = effectResult.rows[0];
  const projection = verifiedPoolSnapshot(effect);
  const reconciliation = reconciliationResult.rows[0] ?? null;
  const control = controlResult.rows[0] ?? null;
  if (
    reconciliation &&
    (reconciliation.run?.schemaVersion !== "pool_reconciliation.v1" ||
      reconciliation.run.reconciliationHash !== reconciliation.reconciliation_hash)
  ) fail("projection_integrity_mismatch", "Secured Pool reconciliation is inconsistent");
  if (
    control &&
    (control.control?.schemaVersion !== "pool_risk_control.v1" ||
      control.control.controlHash !== control.control_hash ||
      control.control.newRiskFrozen !== control.new_risk_frozen)
  ) fail("projection_integrity_mismatch", "Secured Pool risk control is inconsistent");
  return Object.freeze({ effect, projection, reconciliation, control });
}

function oracleState(state, now) {
  const observedAt = Number(state.acceptedOracleObservedAt ?? "0");
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (state.oracleDeviationHalted === true) return "deviation_halted";
  if (observedAt === 0) return "missing";
  if (observedAt > nowSeconds + Number(M2_POOL_REFERENCE_POLICY.maxOracleFutureSkewSeconds)) {
    return "future";
  }
  return nowSeconds - observedAt > Number(M2_POOL_REFERENCE_POLICY.maxOracleAgeSeconds)
    ? "stale"
    : "fresh";
}

function accountingView(state) {
  const cash = decimal("cashAssets", state.cashAssets);
  const grossDebt = decimal("grossDebtAssets", state.grossDebtAssets);
  const badDebt = decimal("badDebtAssets", state.badDebtAssets);
  const reserves = decimal("reservesAssets", state.reservesAssets);
  const performingDebt = grossDebt - badDebt;
  const signedClaim = cash + grossDebt - reserves - badDebt;
  const lpClaim = signedClaim > 0n ? signedClaim : 0n;
  return Object.freeze({
    cashAssets: cash.toString(),
    grossDebtAssets: grossDebt.toString(),
    performingDebtAssets: performingDebt.toString(),
    reservesAssets: reserves.toString(),
    badDebtAssets: badDebt.toString(),
    lpClaimAssets: lpClaim.toString(),
    totalSupplyShares: state.totalSupplyShares,
    totalDebtShares: state.totalDebtShares,
    utilizationBps: calculateUtilizationBps(cash, performingDebt).toString()
  });
}

function healthView(position, state) {
  const collateral = decimal("position.collateralAssets", position.collateralAssets);
  const debt = decimal("position.debtAssets", position.debtAssets) +
    decimal("position.badDebtAssets", position.badDebtAssets);
  const price = decimal("acceptedPriceUsdWad", state.acceptedPriceUsdWad);
  if (price === 0n) {
    return Object.freeze({ state: "unavailable", healthFactorWad: null, liquidatable: false });
  }
  const collateralValue = calculateCollateralValueAssets(collateral, price);
  const threshold = collateralValue * BigInt(state.configuration.liquidationThresholdBps) /
    M2_POOL_REFERENCE_POLICY.bps;
  return Object.freeze({
    state: debt === 0n ? "no_debt" : debt > threshold ? "liquidatable" : "healthy",
    collateralValueAssets: collateralValue.toString(),
    liquidationThresholdAssets: threshold.toString(),
    healthFactorWad: debt === 0n
      ? null
      : (threshold * M2_POOL_REFERENCE_POLICY.wad / debt).toString(),
    liquidatable: debt > 0n && debt > threshold
  });
}

function marketView({
  context,
  now,
  deploymentProfile,
  liveRead,
  liveErrorCode,
  contextErrorCode
}) {
  const liveState = liveRead?.state ?? null;
  const indexedState = context?.projection.state ?? null;
  const state = liveState ?? indexedState;
  const deployed = Boolean(deploymentProfile);
  const deploymentState = liveRead?.deployment ?? Object.freeze({
    state: liveErrorCode === "secured_pool_exact_profile_mismatch"
      ? "verification_failed"
      : deployed
        ? "configured"
        : "unavailable",
    chainId: deploymentProfile?.chainId ?? "eip155:84532",
    contractAddress: deploymentProfile?.poolContract ?? null,
    bytecodeHash: deploymentProfile?.poolBytecodeHash ?? null,
    configurationHash: deploymentProfile?.configurationHash ?? null,
    deploymentApprovalRef: deploymentProfile?.deploymentApprovalRef ?? null,
    testAssetsOnly: deploymentProfile?.realValueClassification === "test_assets_only"
  });
  const rpcState = liveRead?.rpc ?? Object.freeze({
    state: "unavailable",
    providerSlot: null,
    blockNumber: null,
    blockTimestamp: null,
    observedAt: null,
    reasonCode: liveErrorCode ?? (deployed
      ? "pool_rpc_adapter_unavailable"
      : "pool_deployment_unavailable")
  });
  const indexerState = Object.freeze(context
    ? {
        state: "indexed",
        source: "finalized_event_projection",
        effectHash: context.effect.effect_hash,
        recordedAt: iso(context.effect.recorded_at)
      }
    : {
        state: "unavailable",
        source: null,
        effectHash: null,
        recordedAt: null,
        reasonCode: contextErrorCode ?? "pool_indexer_state_unavailable"
      });
  const reconciliation = Object.freeze(context?.reconciliation
    ? {
        state: context.reconciliation.consistent ? "reconciled" : "discrepancy",
        reasonCode: context.reconciliation.reason_code,
        checkedAt: iso(context.reconciliation.checked_at),
        reconciliationHash: context.reconciliation.reconciliation_hash
      }
    : {
        state: "unavailable",
        reasonCode: "reconciliation_unavailable",
        checkedAt: null,
        reconciliationHash: null
      });
  if (!state) {
    return Object.freeze({
      status: deployed ? "deployed_not_indexed" : "not_indexed",
      chainId: deploymentProfile?.chainId ?? "eip155:84532",
      contractAddress: deploymentProfile?.poolContract ?? null,
      marketId: null,
      deployment: deploymentState,
      rpc: rpcState,
      indexer: indexerState,
      accounting: null,
      oracle: Object.freeze({ state: "unavailable", observedAt: null }),
      reconciliation,
      riskControl: Object.freeze({
        newRiskFrozen: true,
        protocolNewRiskPaused: null,
        reasonCode: "risk_control_unavailable",
        changedAt: null
      }),
      testAssetsOnly: deploymentProfile?.realValueClassification === "test_assets_only",
      deploymentApprovalRef: deploymentProfile?.deploymentApprovalRef ?? null,
      readOnly: true
    });
  }
  return Object.freeze({
    status: liveState ? "live_testnet_read_only" : "local_synthetic_indexed",
    chainId: state.chainId,
    contractAddress: state.contractAddress,
    marketId: state.marketId,
    deployment: deploymentState,
    rpc: rpcState,
    indexer: indexerState,
    debtAsset: state.configuration.debtAsset,
    collateralAsset: state.configuration.collateralAsset,
    liquidationThresholdBps: state.configuration.liquidationThresholdBps,
    accounting: accountingView(state),
    oracle: Object.freeze({
      state: oracleState(state, now),
      observedAt: Number(state.acceptedOracleObservedAt ?? "0") > 0
        ? new Date(Number(state.acceptedOracleObservedAt) * 1_000).toISOString()
        : null,
      roundId: state.acceptedOracleRoundId,
      priceUsdWad: state.acceptedPriceUsdWad,
      deviationHalted: state.oracleDeviationHalted === true
    }),
    reconciliation,
    riskControl: Object.freeze(context?.control
      ? {
          newRiskFrozen: context.control.new_risk_frozen || state.newRiskPaused,
          protocolNewRiskPaused: state.newRiskPaused,
          reasonCode: context.control.reason_code,
          changedAt: iso(context.control.changed_at),
          controlHash: context.control.control_hash
        }
      : {
          newRiskFrozen: true,
          protocolNewRiskPaused: state.newRiskPaused,
          reasonCode: "risk_control_unavailable",
          changedAt: null
        }),
    source: liveState ? "base_sepolia_safe_block" : "finalized_event_projection",
    fixtureOnly: !liveState,
    testAssetsOnly: deploymentProfile?.realValueClassification === "test_assets_only",
    readOnly: true
  });
}

function submissionView() {
  return Object.freeze({
    state: "unavailable",
    reasonCode: "pool_submission_unavailable",
    recoveryCondition: "This read-only Pool product has no transaction submission authority; a separately approved execution task is required",
    transactionHash: null,
    finality: "not_applicable"
  });
}

async function ownAccountBinding(client, coreRepository, subjectId, chainId) {
  const bindings = await coreRepository.listExecutionAccountBindingsForSubjectInTransaction(
    client,
    subjectId,
    { lock: false }
  );
  const active = bindings.filter((binding) =>
    binding.status === "active" && binding.chainId === chainId
  );
  if (active.length > 1) {
    fail("projection_integrity_mismatch", "Subject has multiple active Pool execution accounts");
  }
  const accountBinding = active[0] ?? null;
  if (!accountBinding) return Object.freeze({ accountBinding: null, account: null });
  const prefix = `${chainId}:`;
  if (!accountBinding.accountIdRef.startsWith(prefix)) {
    fail("projection_integrity_mismatch", "Pool AccountBinding is inconsistent");
  }
  const account = accountBinding.accountIdRef.slice(prefix.length);
  if (!EVM_ACCOUNT.test(account)) {
    fail("projection_integrity_mismatch", "Pool AccountBinding account is invalid");
  }
  return Object.freeze({ accountBinding, account });
}

async function readLivePool(readAdapter, account) {
  if (!readAdapter?.readSnapshot) {
    return Object.freeze({ liveRead: null, liveErrorCode: null });
  }
  try {
    return Object.freeze({
      liveRead: await readAdapter.readSnapshot(account ? { account } : {}),
      liveErrorCode: null
    });
  } catch (error) {
    return Object.freeze({
      liveRead: null,
      liveErrorCode: new Set([
        "secured_pool_rpc_unavailable",
        "secured_pool_exact_profile_mismatch"
      ]).has(error?.code)
        ? error.code
        : "secured_pool_rpc_unavailable"
    });
  }
}

function admittedPoolContext(context, deploymentProfile, liveRead) {
  if (!context) return Object.freeze({ context: null, contextErrorCode: null });
  const state = context.projection.state;
  const expectedChainId = deploymentProfile?.chainId ?? liveRead?.state.chainId ?? state.chainId;
  const expectedContract = deploymentProfile?.poolContract ?? liveRead?.state.contractAddress ?? state.contractAddress;
  const expectedMarketId = liveRead?.state.marketId ?? state.marketId;
  if (
    state.chainId !== expectedChainId ||
    state.contractAddress.toLowerCase() !== expectedContract.toLowerCase() ||
    state.marketId.toLowerCase() !== expectedMarketId.toLowerCase()
  ) {
    return Object.freeze({
      context: null,
      contextErrorCode: "pool_indexer_profile_mismatch"
    });
  }
  return Object.freeze({ context, contextErrorCode: null });
}

async function ownPosition(client, subjectId, context, binding, liveRead) {
  let position = null;
  let positionSource = null;
  if (binding.accountBinding && liveRead?.position) {
    position = liveRead.position;
    positionSource = "base_sepolia_safe_block";
  } else if (binding.accountBinding && context) {
    const account = binding.account;
    const accountHash = hashId("pool_position_account", {
      chainId: context.projection.state.chainId,
      account
    });
    const matches = context.projection.state.accounts.filter((candidate) =>
      hashId("pool_position_account", {
        chainId: context.projection.state.chainId,
        account: candidate.account
      }) === accountHash
    );
    if (matches.length > 1) fail("projection_integrity_mismatch", "Pool position account is duplicated");
    if (matches[0]) {
      const { account: _account, ...safePosition } = matches[0];
      position = safePosition;
    } else {
      position = { ...EMPTY_POSITION };
    }
    positionSource = "finalized_event_projection";
  }
  if (!context) {
    return Object.freeze({
      accountBinding: binding.accountBinding,
      position,
      positionSource,
      obligationProjection: null
    });
  }
  const obligationResult = await client.query(
    `SELECT b.id AS binding_id, b.obligation_id, p.projection
       FROM pool_obligation_bindings b
       JOIN pool_obligation_projections p
         ON p.tenant_id = b.tenant_id AND p.pool_obligation_binding_id = b.id
      WHERE b.subject_id = $1 AND b.chain_id = $2
        AND b.contract_address = $3 AND b.market_id = $4 AND b.status = 'active'
      ORDER BY b.bound_at DESC, b.id
      LIMIT 2`,
    [subjectId, context.projection.state.chainId, context.projection.state.contractAddress,
      context.projection.state.marketId]
  );
  if (obligationResult.rowCount > 1) {
    fail("projection_integrity_mismatch", "Subject has multiple active Pool Obligation bindings");
  }
  const obligationProjection = obligationResult.rows[0] ?? null;
  if (
    obligationProjection &&
    (obligationProjection.projection?.schemaVersion !== "pool_obligation_projection.v1" ||
      obligationProjection.projection.obligationId !== obligationProjection.obligation_id)
  ) fail("projection_integrity_mismatch", "Pool Obligation projection is inconsistent");
  return Object.freeze({
    accountBinding: binding.accountBinding,
    position,
    positionSource,
    obligationProjection
  });
}

function ownWorkspaceResponse({
  subjectId,
  context,
  owned,
  now,
  deploymentProfile,
  liveRead,
  liveErrorCode,
  contextErrorCode
}) {
  const market = marketView({
    context,
    now,
    deploymentProfile,
    liveRead,
    liveErrorCode,
    contextErrorCode
  });
  const healthState = liveRead?.state ?? context?.projection.state ?? null;
  const position = owned.position ? Object.freeze({
    ...owned.position,
    source: owned.positionSource,
    health: healthState
      ? healthView(owned.position, healthState)
      : Object.freeze({ state: "unavailable", healthFactorWad: null, liquidatable: false })
  }) : null;
  return Object.freeze({
    subjectId,
    market,
    position,
    accountBindingAvailable: Boolean(owned.accountBinding),
    obligation: owned.obligationProjection
      ? Object.freeze({
          obligationId: owned.obligationProjection.obligation_id,
          lifecycleStatus: owned.obligationProjection.projection.lifecycleStatus,
          projectionVersion: owned.obligationProjection.projection.projectionVersion,
          finalizedEffectCount: owned.obligationProjection.projection.finalizedEffectCount,
          evidenceHash: owned.obligationProjection.projection.lastEvidenceHash
        })
      : null,
    actions: Object.freeze({
      supply: "review_only",
      withdraw: "review_only",
      depositCollateral: "review_only",
      borrow: "review_only",
      repay: "review_only",
      releaseCollateral: "review_only"
    }),
    submission: submissionView(),
    serverDerived: true,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "tenant_secured_pool_workspace.v1"
  });
}

export async function readSecuredPoolMarketSnapshot({
  client,
  deploymentProfile,
  readAdapter,
  now = new Date()
}) {
  if (
    !client?.query || !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) fail("invalid_secured_pool_workspace", "Secured Pool market reader configuration is invalid");
  const loadedContext = await loadPoolContext(client);
  const { liveRead, liveErrorCode } = await readLivePool(readAdapter, null);
  const { context, contextErrorCode } = admittedPoolContext(
    loadedContext,
    deploymentProfile,
    liveRead
  );
  return Object.freeze({
    market: marketView({
      context,
      now,
      deploymentProfile,
      liveRead,
      liveErrorCode,
      contextErrorCode
    }),
    submission: submissionView(),
    serverDerived: true,
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "secured_pool_market_snapshot.v1"
  });
}

function actionPayload(payload) {
  if (!exactObject(payload, ["actionType", "amountAssets"])) {
    fail("invalid_tenant_command_payload", "Secured Pool action review payload is invalid");
  }
  if (!OWN_ACTIONS.has(payload.actionType)) {
    fail("secured_pool_action_forbidden", "The requested Secured Pool action is not available");
  }
  decimal("amountAssets", payload.amountAssets, { positive: true });
  return payload;
}

function actionReview({ workspace, actionType, amountAssets, now }) {
  const blockers = [];
  const market = workspace.market;
  const position = workspace.position;
  const amount = decimal("amountAssets", amountAssets, { positive: true });
  if (!workspace.accountBindingAvailable) blockers.push("pool_account_binding_unavailable");
  const marketReadable = new Set([
    "local_synthetic_indexed",
    "live_testnet_read_only"
  ]).has(market.status);
  if (!marketReadable) blockers.push("pool_state_unavailable");
  if (!position && POSITION_REQUIRED_ACTIONS.has(actionType)) blockers.push("pool_position_unavailable");
  if (market.reconciliation.state !== "reconciled" && NEW_RISK_ACTIONS.has(actionType)) {
    blockers.push("pool_reconciliation_unavailable");
  }
  if (market.riskControl.newRiskFrozen && NEW_RISK_ACTIONS.has(actionType)) {
    blockers.push("pool_new_risk_frozen");
  }
  if (ORACLE_REQUIRED_ACTIONS.has(actionType) && market.oracle.state !== "fresh") {
    blockers.push(`pool_oracle_${market.oracle.state}`);
  }
  let preview = Object.freeze({
    supplySharesDelta: null,
    collateralAssetsAfter: null,
    debtAssetsAfter: null,
    healthAfter: null
  });
  if (marketReadable && position) {
    const cash = decimal("cashAssets", market.accounting.cashAssets);
    const supplyShares = decimal("supplyShares", position.supplyShares);
    const debt = decimal("debtAssets", position.debtAssets) + decimal("badDebtAssets", position.badDebtAssets);
    const collateral = decimal("collateralAssets", position.collateralAssets);
    const totalSupplyShares = decimal("totalSupplyShares", market.accounting.totalSupplyShares);
    const lpClaim = decimal("lpClaimAssets", market.accounting.lpClaimAssets);
    const supplySharesDelta = actionType === "supply"
      ? totalSupplyShares === 0n ? amount : lpClaim === 0n ? 0n : amount * totalSupplyShares / lpClaim
      : actionType === "withdraw" && lpClaim > 0n
        ? (amount * totalSupplyShares + lpClaim - 1n) / lpClaim
        : null;
    if (actionType === "supply" && totalSupplyShares > 0n && lpClaim === 0n) {
      blockers.push("pool_share_conversion_unavailable");
    }
    if (actionType === "withdraw" && (amount > cash || supplyShares === 0n || supplySharesDelta === null || supplySharesDelta > supplyShares)) {
      blockers.push("pool_withdrawal_not_liquid");
    }
    if (actionType === "borrow" && amount > cash) blockers.push("pool_borrow_exceeds_liquidity");
    if (actionType === "repay" && (debt === 0n || amount > debt)) blockers.push("pool_repayment_exceeds_debt");
    if (actionType === "release_collateral" && amount > collateral) {
      blockers.push("pool_release_exceeds_collateral");
    }
    const collateralAfter = actionType === "deposit_collateral"
      ? collateral + amount
      : actionType === "release_collateral" && amount <= collateral
        ? collateral - amount
        : collateral;
    const debtAfter = actionType === "borrow"
      ? debt + amount
      : actionType === "repay" && amount <= debt
        ? debt - amount
        : debt;
    preview = Object.freeze({
      supplySharesDelta: supplySharesDelta?.toString() ?? null,
      collateralAssetsAfter: collateralAfter.toString(),
      debtAssetsAfter: debtAfter.toString(),
      healthAfter: healthView({
        ...position,
        collateralAssets: collateralAfter.toString(),
        debtAssets: debtAfter.toString(),
        badDebtAssets: "0"
      }, {
        configuration: { liquidationThresholdBps: market.liquidationThresholdBps },
        acceptedPriceUsdWad: market.oracle.priceUsdWad
      })
    });
  }
  blockers.push("pool_submission_unavailable");
  const uniqueBlockers = [...new Set(blockers)];
  const core = {
    actionType,
    amountAssets,
    chainId: market.chainId,
    contractAddress: market.contractAddress,
    marketId: market.marketId,
    position: position
      ? {
          supplyShares: position.supplyShares,
          collateralAssets: position.collateralAssets,
          debtAssets: position.debtAssets,
          badDebtAssets: position.badDebtAssets,
          healthFactorWad: position.health.healthFactorWad
        }
      : null,
    preview,
    blockerReasonCodes: uniqueBlockers,
    reviewedAt: now.toISOString(),
    syntheticOnly: true,
    productionFundsMoved: false
  };
  return Object.freeze({
    ...core,
    reviewHash: hashId("secured_pool_action_review", core),
    reviewState: "blocked_before_submission",
    submittable: false,
    transactionState: "not_submitted",
    finality: "not_applicable",
    recoveryCondition: "This read-only Pool product has no transaction submission authority; a separately approved execution task is required",
    schemaVersion: "tenant_secured_pool_action_review.v1"
  });
}

export function readOwnSecuredPoolQueryHandler({ deploymentProfile, readAdapter } = {}) {
  return Object.freeze({
    operationId: "pilotReadOwnSecuredPool",
    kind: "query",
    async execute({ client, coreRepository, resource, payload, now }) {
      emptyPayload(payload, "Own Secured Pool workspace");
      const subjectId = ownResource(resource);
      const loadedContext = await loadPoolContext(client);
      const chainId = deploymentProfile?.chainId ?? loadedContext?.projection.state.chainId ?? "eip155:84532";
      const binding = await ownAccountBinding(client, coreRepository, subjectId, chainId);
      const { liveRead, liveErrorCode } = await readLivePool(readAdapter, binding.account);
      const { context, contextErrorCode } = admittedPoolContext(
        loadedContext,
        deploymentProfile,
        liveRead
      );
      const owned = await ownPosition(client, subjectId, context, binding, liveRead);
      return ownWorkspaceResponse({
        subjectId,
        context,
        owned,
        now,
        deploymentProfile,
        liveRead,
        liveErrorCode,
        contextErrorCode
      });
    }
  });
}

export function reviewSecuredPoolActionQueryHandler({ deploymentProfile, readAdapter } = {}) {
  return Object.freeze({
    operationId: "pilotReviewSecuredPoolAction",
    kind: "query",
    async execute({ client, coreRepository, resource, payload, now }) {
      const checked = actionPayload(payload);
      const subjectId = ownResource(resource);
      const loadedContext = await loadPoolContext(client);
      const chainId = deploymentProfile?.chainId ?? loadedContext?.projection.state.chainId ?? "eip155:84532";
      const binding = await ownAccountBinding(client, coreRepository, subjectId, chainId);
      const { liveRead, liveErrorCode } = await readLivePool(readAdapter, binding.account);
      const { context, contextErrorCode } = admittedPoolContext(
        loadedContext,
        deploymentProfile,
        liveRead
      );
      const owned = await ownPosition(client, subjectId, context, binding, liveRead);
      const workspace = ownWorkspaceResponse({
        subjectId,
        context,
        owned,
        now,
        deploymentProfile,
        liveRead,
        liveErrorCode,
        contextErrorCode
      });
      return actionReview({ workspace, ...checked, now });
    }
  });
}

export function readSecuredPoolRiskQueryHandler({ deploymentProfile, readAdapter } = {}) {
  return Object.freeze({
    operationId: "pilotReadSecuredPoolRisk",
    kind: "query",
    async execute({ client, authorizationDecision, payload, now }) {
      emptyPayload(payload, "Secured Pool Risk/Ops workspace");
      const portfolioId = riskResource(authorizationDecision);
      const loadedContext = await loadPoolContext(client);
      const { liveRead, liveErrorCode } = await readLivePool(readAdapter, null);
      const { context, contextErrorCode } = admittedPoolContext(
        loadedContext,
        deploymentProfile,
        liveRead
      );
      const market = marketView({
        context,
        now,
        deploymentProfile,
        liveRead,
        liveErrorCode,
        contextErrorCode
      });
      const positions = context?.projection.state.accounts ?? [];
      const liquidatablePositions = context
        ? positions.filter((position) => healthView(position, context.projection.state).liquidatable).length
        : 0;
      const discrepancyResult = context?.reconciliation
        ? await client.query(
            `SELECT COUNT(*)::int AS count
               FROM pool_reconciliation_discrepancies
              WHERE reconciliation_id = $1`,
            [context.reconciliation.run.reconciliationId]
          )
        : { rows: [{ count: 0 }], rowCount: 1 };
      if (discrepancyResult.rowCount !== 1) {
        fail("projection_integrity_mismatch", "Secured Pool discrepancy count is inconsistent");
      }
      return Object.freeze({
        portfolioId,
        market,
        positionCount: context ? positions.length : null,
        liquidatablePositionCount: context ? liquidatablePositions : null,
        discrepancyCount: context?.reconciliation ? discrepancyResult.rows[0].count : null,
        controls: Object.freeze({
          freezeNewRisk: market.riskControl.newRiskFrozen,
          automaticRecoveryEnabled: false,
          dualControlRequiredForRecovery: true,
          protectiveRepaymentAvailable: true,
          liquidationSubmissionAvailable: false
        }),
        submission: Object.freeze({
          state: "unavailable",
          reasonCode: "pool_submission_unavailable",
          transactionHash: null,
          finality: "not_applicable"
        }),
        serverDerived: true,
        syntheticOnly: true,
        productionFundsMoved: false,
        schemaVersion: "tenant_secured_pool_risk_view.v1"
      });
    }
  });
}

export function createSecuredPoolWorkspaceHandlers(options = {}) {
  return Object.freeze([
    readOwnSecuredPoolQueryHandler(options),
    reviewSecuredPoolActionQueryHandler(options),
    readSecuredPoolRiskQueryHandler(options)
  ]);
}
