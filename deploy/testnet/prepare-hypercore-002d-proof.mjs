import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { hashId } from "../../packages/domain/src/index.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../modules/persistence/src/index.js";
import {
  HYPERCORE_TESTNET_PROOF_PROFILE,
  HYPERCORE_002D_CANCEL_TARGET_CLOID,
  HypercoreExecutionActionKind,
  PostgresHypercoreDelegateRepository,
  PostgresHypercoreTestnetSubmissionRepository,
  compileHypercoreExecutionAction,
  createHypercoreAccountBinding,
  createHypercoreStableCancelTarget,
  createHypercoreTestnetProofPolicy,
  createHypercoreTestnetSignerHandoff,
  verifyHypercoreStableCancelTarget,
  verifyHypercoreStableExecutionIntent
} from "../../modules/hypercore-venue-adapter/src/index.js";
import {
  withHypercoreIsolatedTestnetSigner
} from "./hypercore-isolated-signer.mjs";

const { Pool } = pg;
const INFO_ENDPOINT = "https://api.hyperliquid-testnet.xyz/info";
const TENANT_ID = "tenant_ipo_one_local_pilot";
const ACTOR_ID = "actor_local_system";
const EXPECTED_ACCOUNT_ADDRESS_HASH =
  "0xda35abd4f31d5e8c9a5d87f289535c6164d1d587c49bb1deb206f906a1802038";
const EXPECTED_API_WALLET_ADDRESS_HASH =
  "0x1d1911fcbdb3809a1530f1e0740e23e04ff795239f0b497674a2c756322acea1";
const EXPECTED_SIGNER_REFERENCE_HASH =
  "0x8d51f324c056a411552c4945e30d1091e4c2036790e90022417c230ad38f5be3";
const EXPECTED_REGISTRATION_REQUEST_HASH =
  "0x7903ed662ca1b3225ba4e57f53fac4d1fa4a289a68f05bc18df4a1fe1d30bf0a";
const EXPECTED_REGISTRATION_AUTHORIZATION_HASH =
  "0x6709ce6218fb213463ed9e5e524b8ee368cfd6d675e4cdead1936edfc7ddbbf2";
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`hypercore_002d_proof_preparation_error: ${message}`);
}

function address(value, name) {
  const normalized = String(value ?? "").toLowerCase();
  if (!ADDRESS.test(normalized)) fail(`${name} is invalid`);
  return normalized;
}

function bytes32(value, name) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${name} is invalid`);
  return value;
}

function canonicalDecimalFromUnits(units, decimals) {
  if (!Number.isSafeInteger(units) || units < 1) fail("decimal units are invalid");
  const digits = String(units).padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function canonicalPriceFromTenths(tenths) {
  if (!Number.isSafeInteger(tenths) || tenths < 1) fail("price ticks are invalid");
  return tenths % 10 === 0
    ? String(tenths / 10)
    : `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${name} is unavailable`);
  return parsed;
}

export function selectExactTenUsdBtcAlo({ mid, bestBid, bestAsk }) {
  positiveNumber(mid, "BTC mid");
  const bidValue = positiveNumber(bestBid, "BTC best bid");
  const askValue = positiveNumber(bestAsk, "BTC best ask");
  if (!(bidValue < askValue)) {
    fail("BTC book is crossed or inconsistent");
  }
  // `allMids` and `l2Book` are separate, non-atomic Testnet reads. Use the
  // internally consistent book midpoint for distance policy while retaining
  // the independently observed allMids value in Evidence.
  const referenceMid = (bidValue + askValue) / 2;
  const candidates = [];
  for (let sizeUnits = 1; sizeUnits <= 100_000; sizeUnits += 1) {
    if (10_000_000 % sizeUnits !== 0) continue;
    const priceTenths = 10_000_000 / sizeUnits;
    const price = priceTenths / 10;
    let side;
    let distance;
    if (price < bidValue) {
      side = "buy";
      distance = (bidValue - price) / referenceMid;
    } else if (price > askValue) {
      side = "sell";
      distance = (price - askValue) / referenceMid;
    } else {
      continue;
    }
    if (distance < 0.005 || distance > 0.35) continue;
    candidates.push({
      side,
      limitPx: canonicalPriceFromTenths(priceTenths),
      size: canonicalDecimalFromUnits(sizeUnits, 5),
      exactLimitNotionalUsd: "10",
      distanceBps: Math.floor(distance * 10_000),
      price,
      sizeUnits
    });
  }
  candidates.sort((left, right) =>
    left.distanceBps - right.distanceBps ||
    (left.side === "buy" ? -1 : 1) ||
    left.sizeUnits - right.sizeUnits
  );
  const selected = candidates[0];
  if (!selected) fail("no exact-$10 post-only BTC action fits the reviewed band");
  return Object.freeze({
    side: selected.side,
    limitPx: selected.limitPx,
    size: selected.size,
    exactLimitNotionalUsd: selected.exactLimitNotionalUsd,
    distanceBps: selected.distanceBps,
    timeInForce: "Alo",
    reduceOnly: false,
    expectedFillNotionalUsd: "0"
  });
}

async function responseJson(response, name) {
  if (!response?.ok) fail(`${name} query failed`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(`${name} returned invalid JSON`);
  }
}

async function postInfo(fetchImpl, body, name) {
  return responseJson(await fetchImpl(INFO_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  }), name);
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function observationSlug(value) {
  return value.replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

function registrationResultHash(result) {
  return hashId("hypercore_002d_agent_registration_result", result);
}

export async function collectHypercore002dReadiness({
  fetchImpl,
  masterAddress,
  apiWalletAddress,
  now,
  registrationResult
}) {
  const [masterRole, apiWalletRole, clearinghouse, orders, meta, mids, book] =
    await Promise.all([
      postInfo(fetchImpl, { type: "userRole", user: masterAddress }, "master role"),
      postInfo(fetchImpl, { type: "userRole", user: apiWalletAddress }, "API wallet role"),
      postInfo(fetchImpl, { type: "clearinghouseState", user: masterAddress }, "account state"),
      postInfo(fetchImpl, { type: "openOrders", user: masterAddress }, "open orders"),
      postInfo(fetchImpl, { type: "meta" }, "market metadata"),
      postInfo(fetchImpl, { type: "allMids" }, "market mids"),
      postInfo(fetchImpl, { type: "l2Book", coin: "BTC" }, "BTC book")
    ]);
  if (masterRole?.role !== "user") fail("reviewed account is not a Testnet master");
  if (apiWalletRole?.role !== "agent") fail("API wallet registration is not currently active");
  if (
    !clearinghouse?.marginSummary ||
    !Array.isArray(clearinghouse.assetPositions) ||
    !Array.isArray(orders)
  ) fail("account state is incomplete");
  const accountValue = positiveNumber(
    String(clearinghouse.marginSummary.accountValue),
    "account value"
  );
  const withdrawable = positiveNumber(String(clearinghouse.withdrawable), "withdrawable");
  if (accountValue < 10 || withdrawable < 10) fail("Testnet account has less than 10 USDC");
  if (clearinghouse.assetPositions.length !== 0 || orders.length !== 0) {
    fail("existing position or open order blocks the bounded proof");
  }
  if (!Array.isArray(meta?.universe)) fail("market metadata is incomplete");
  const btc = meta.universe[HYPERCORE_TESTNET_PROOF_PROFILE.assetIndex];
  if (btc?.name !== "BTC" || btc?.szDecimals !== 5) {
    fail("BTC asset index or size decimals drifted");
  }
  if (!mids || typeof mids.BTC !== "string") fail("BTC mid is unavailable");
  const bid = book?.levels?.[0]?.[0]?.px;
  const ask = book?.levels?.[1]?.[0]?.px;
  const action = selectExactTenUsdBtcAlo({
    mid: mids.BTC,
    bestBid: bid,
    bestAsk: ask
  });
  const observedAt = now.toISOString();
  const observedAtSlug = observationSlug(observedAt);
  const metadataCore = {
    artifactId: `hyperliquid-002d-market-metadata-${observedAtSlug}`,
    issueId: "HYPERLIQUID-002D",
    environment: "hyperliquid_testnet",
    origin: "https://api.hyperliquid-testnet.xyz",
    path: "/info",
    method: "POST",
    requestTypes: ["meta", "allMids", "l2Book"],
    market: "BTC",
    productClass: "perpetual",
    assetIndex: 3,
    sizeDecimals: 5,
    maximumPriceDecimalPlaces: 1,
    maximumPriceSignificantFigures: 5,
    maxLeverageObserved: btc.maxLeverage,
    onlyIsolatedObserved: btc.onlyIsolated === true,
    midObserved: mids.BTC,
    bestBidObserved: String(bid),
    bestAskObserved: String(ask),
    universeCount: meta.universe.length,
    observedAt,
    metaResponseSha256: sha256(meta),
    midsResponseSha256: sha256(mids),
    bookResponseSha256: sha256(book),
    rawResponsePersisted: false,
    signerUsed: false,
    credentialsUsed: false,
    exchangeWritePerformed: false,
    accountQualified: true,
    policyAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "hypercore_testnet_market_metadata_observation.v1"
  };
  const metadataArtifact = Object.freeze({
    ...metadataCore,
    metadataHash: hashId("hypercore_002d_market_metadata", metadataCore)
  });
  const immutableRegistration = {
    requestHash: registrationResult.requestHash,
    status: registrationResult.status,
    responseHash: registrationResult.responseHash,
    resultHash: registrationResultHash(registrationResult),
    authorizationHash: EXPECTED_REGISTRATION_AUTHORIZATION_HASH,
    completedAt: registrationResult.observedAt,
    accountAddressHash: EXPECTED_ACCOUNT_ADDRESS_HASH,
    apiWalletAddressHash: EXPECTED_API_WALLET_ADDRESS_HASH,
    signerReferenceHash: EXPECTED_SIGNER_REFERENCE_HASH,
    requestedAgentName: "ipo-one-002d",
    submissionCount: 1,
    automaticRetry: false
  };
  const registrationEvidenceHash = hashId(
    "hypercore_002d_registration_evidence",
    immutableRegistration
  );
  const registrationEvidenceArtifact = Object.freeze({
    artifactVersion: "ipo-one.hyperliquid-002d.api-wallet-registration-revalidation.v1",
    artifactId: `hyperliquid-002d-api-wallet-registration-revalidation-${observedAtSlug}`,
    issueId: "HYPERLIQUID-002D",
    environment: "HYPERLIQUID_TESTNET",
    registrationEvidenceHash,
    registration: immutableRegistration,
    roleObservation: {
      role: "agent",
      registered: true,
      responseHash: hashId("hypercore_info_response", apiWalletRole),
      observedAt
    },
    masterAccountObservation: {
      role: "user",
      accountValue: String(clearinghouse.marginSummary.accountValue),
      withdrawable: String(clearinghouse.withdrawable),
      positionCount: 0,
      openOrderCount: 0,
      roleResponseHash: hashId("hypercore_info_response", masterRole),
      stateResponseHash: hashId("hypercore_info_response", clearinghouse),
      ordersResponseHash: hashId("hypercore_info_response", orders),
      observedAt
    },
    decision: "REGISTERED_AND_ACCOUNT_QUALIFIED",
    safety: {
      registrationWriteCount: 1,
      registrationAuthorizationConsumed: true,
      registrationRetryPerformed: false,
      exchangeOrderWritePerformed: false,
      orderSubmitted: false,
      fundsMoved: false,
      rawAccountAddressStored: false,
      rawApiWalletAddressStored: false,
      rawSignatureStored: false,
      rawResponseStored: false,
      mainnetAuthority: false,
      productionAuthority: false,
      realFundsAuthority: false
    }
  });
  return Object.freeze({
    action,
    metadataArtifact,
    registrationEvidenceArtifact,
    registrationEvidenceHash,
    accountValue: String(clearinghouse.marginSummary.accountValue),
    withdrawable: String(clearinghouse.withdrawable),
    masterRoleHash: hashId("hypercore_info_response", masterRole),
    apiWalletRoleHash: hashId("hypercore_info_response", apiWalletRole),
    accountStateHash: hashId("hypercore_info_response", clearinghouse),
    ordersHash: hashId("hypercore_info_response", orders),
    jitObservation: Object.freeze({
      masterRole: masterRole.role,
      apiWalletRole: apiWalletRole.role,
      accountValue: String(clearinghouse.marginSummary.accountValue),
      withdrawable: String(clearinghouse.withdrawable),
      positionCount: clearinghouse.assetPositions.length,
      openOrderCount: orders.length,
      aggregateExposureUsd: "0",
      positionNotionalUsd: "0",
      unknownOutcomeCount: 0,
      reconciliationStatus: "RECONCILED",
      paused: false,
      masterRoleHash: hashId("hypercore_info_response", masterRole),
      apiWalletRoleHash: hashId("hypercore_info_response", apiWalletRole),
      accountStateHash: hashId("hypercore_info_response", clearinghouse),
      ordersHash: hashId("hypercore_info_response", orders),
      metadataHash: metadataArtifact.metadataHash,
      metadataObservedAt: observedAt,
      market: "BTC",
      assetIndex: 3,
      sizeDecimals: 5,
      priceDecimals: 1,
      mid: String(mids.BTC),
      bestBid: String(bid),
      bestAsk: String(ask),
      metaResponseHash: hashId("hypercore_info_response", meta),
      midsResponseHash: hashId("hypercore_info_response", mids),
      bookResponseHash: hashId("hypercore_info_response", book)
    }),
    observedAt
  });
}

export async function collectHypercore002dCancelReadiness({
  fetchImpl,
  masterAddress,
  apiWalletAddress,
  parentIntent,
  expectedTarget = null,
  now
}) {
  verifyHypercoreStableExecutionIntent(parentIntent);
  if (expectedTarget !== null) verifyHypercoreStableCancelTarget(expectedTarget);
  const parentOrder = parentIntent.hyperliquidAction?.orders?.[0];
  if (
    parentIntent.schemaVersion !== "hypercore_stable_execution_intent.v2" ||
    parentIntent.state !== "SUBMITTED" || parentIntent.disposition !== "confirmed" ||
    parentIntent.externalSubmissionAttempted !== true || parentIntent.retryAllowed !== false ||
    parentOrder?.a !== 3 || parentOrder.b !== true || parentOrder.r !== false ||
    parentOrder.p !== "62500" || parentOrder.s !== "0.00016" ||
    parentOrder.c !== HYPERCORE_002D_CANCEL_TARGET_CLOID
  ) fail("confirmed exact parent order is unavailable for cancellation");

  const [masterRole, apiWalletRole, clearinghouse, orders, orderStatus, meta] =
    await Promise.all([
      postInfo(fetchImpl, { type: "userRole", user: masterAddress }, "master role"),
      postInfo(fetchImpl, { type: "userRole", user: apiWalletAddress }, "API wallet role"),
      postInfo(fetchImpl, { type: "clearinghouseState", user: masterAddress }, "account state"),
      postInfo(fetchImpl, { type: "openOrders", user: masterAddress }, "open orders"),
      postInfo(fetchImpl, {
        type: "orderStatus",
        user: masterAddress,
        oid: HYPERCORE_002D_CANCEL_TARGET_CLOID
      }, "order status"),
      postInfo(fetchImpl, { type: "meta" }, "market metadata")
    ]);
  if (masterRole?.role !== "user" || apiWalletRole?.role !== "agent") {
    fail("reviewed Testnet account or API wallet role drifted");
  }
  if (!clearinghouse?.marginSummary || !Array.isArray(clearinghouse.assetPositions) ||
    !Array.isArray(orders) || clearinghouse.assetPositions.length !== 0 ||
    orders.length !== 1) {
    fail("cancel preparation requires zero positions and one open order");
  }
  positiveNumber(String(clearinghouse.marginSummary.accountValue), "account value");
  positiveNumber(String(clearinghouse.withdrawable), "withdrawable");
  if (!Array.isArray(meta?.universe)) fail("market metadata is incomplete");
  const btc = meta.universe[HYPERCORE_TESTNET_PROOF_PROFILE.assetIndex];
  if (btc?.name !== "BTC" || btc?.szDecimals !== 5) {
    fail("BTC asset index or size decimals drifted");
  }

  const openOrder = orders[0];
  const statusOrder = orderStatus?.order?.order;
  const venueOrderId = Number(openOrder?.oid);
  if (
    orderStatus?.status !== "order" || !statusOrder ||
    openOrder?.coin !== "BTC" || openOrder.side !== "B" ||
    openOrder.cloid !== HYPERCORE_002D_CANCEL_TARGET_CLOID ||
    Number(openOrder.limitPx) !== Number(parentOrder.p) ||
    Number(openOrder.sz) !== Number(parentOrder.s) ||
    !Number.isSafeInteger(venueOrderId) || venueOrderId < 1 ||
    statusOrder.coin !== "BTC" || statusOrder.side !== "B" ||
    statusOrder.cloid !== HYPERCORE_002D_CANCEL_TARGET_CLOID ||
    Number(statusOrder.limitPx) !== Number(parentOrder.p) ||
    Number(statusOrder.sz) !== Number(parentOrder.s) ||
    Number(statusOrder.oid) !== venueOrderId || statusOrder.reduceOnly !== false
  ) fail("open order and orderStatus do not match the exact parent order");

  const observedTarget = createHypercoreStableCancelTarget({
    parentIntentId: parentIntent.intentId,
    parentIntentHash: parentIntent.intentHash,
    market: "BTC",
    assetIndex: 3,
    side: "buy",
    limitPx: parentOrder.p,
    size: parentOrder.s,
    reduceOnly: false,
    cloid: parentOrder.c,
    venueOrderId
  });
  if (expectedTarget !== null &&
    observedTarget.targetOrderHash !== expectedTarget.targetOrderHash) {
    fail("observed cancel target drifted from the exact stable intent");
  }

  const observedAt = now.toISOString();
  const observedAtSlug = observationSlug(observedAt);
  const metadataCore = {
    artifactId: `hyperliquid-002d-cancel-metadata-${observedAtSlug}`,
    issueId: "HYPERLIQUID-002D",
    environment: "hyperliquid_testnet",
    origin: "https://api.hyperliquid-testnet.xyz",
    path: "/info",
    method: "POST",
    requestTypes: ["userRole", "clearinghouseState", "openOrders", "orderStatus", "meta"],
    market: "BTC",
    assetIndex: 3,
    sizeDecimals: 5,
    targetOrderHash: observedTarget.targetOrderHash,
    openOrderCount: 1,
    positionCount: 0,
    observedAt,
    metaResponseSha256: sha256(meta),
    ordersResponseSha256: sha256(orders),
    orderStatusResponseSha256: sha256(orderStatus),
    rawResponsePersisted: false,
    signerUsed: false,
    credentialsUsed: false,
    exchangeWritePerformed: false,
    mainnetAuthority: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: "hypercore_testnet_cancel_target_observation.v1"
  };
  const metadataArtifact = Object.freeze({
    ...metadataCore,
    metadataHash: hashId("hypercore_002d_cancel_metadata", metadataCore)
  });
  const ordersResponseHash = hashId("hypercore_info_response", orders);
  const orderStatusResponseHash = hashId("hypercore_info_response", orderStatus);
  return Object.freeze({
    targetOrder: observedTarget,
    metadataArtifact,
    accountValue: String(clearinghouse.marginSummary.accountValue),
    withdrawable: String(clearinghouse.withdrawable),
    jitObservation: Object.freeze({
      masterRole: masterRole.role,
      apiWalletRole: apiWalletRole.role,
      accountValue: String(clearinghouse.marginSummary.accountValue),
      withdrawable: String(clearinghouse.withdrawable),
      positionCount: 0,
      openOrderCount: 1,
      aggregateExposureUsd: "0",
      positionNotionalUsd: "0",
      unknownOutcomeCount: 0,
      reconciliationStatus: "RECONCILED",
      paused: false,
      masterRoleHash: hashId("hypercore_info_response", masterRole),
      apiWalletRoleHash: hashId("hypercore_info_response", apiWalletRole),
      accountStateHash: hashId("hypercore_info_response", clearinghouse),
      ordersHash: ordersResponseHash,
      orderStatusHash: hashId("hypercore_002d_cancel_order_status", {
        status: orderStatus.status,
        targetOrderHash: observedTarget.targetOrderHash
      }),
      metadataHash: metadataArtifact.metadataHash,
      metadataObservedAt: observedAt,
      market: "BTC",
      assetIndex: 3,
      sizeDecimals: 5,
      priceDecimals: 1,
      observedTargetOrder: observedTarget,
      observedTargetOrderHash: observedTarget.targetOrderHash,
      metaResponseHash: hashId("hypercore_info_response", meta),
      ordersResponseHash,
      orderStatusResponseHash
    }),
    observedAt
  });
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
}

async function prepareDurableAttempt({
  pool,
  facilityId,
  facilityHash,
  masterAddress,
  descriptor,
  readiness,
  now
}) {
  const context = tenantContext();
  const coreRepository = new PostgresCoreRepository({
    pool,
    tenantContext: context,
    transactionRetries: 10
  });
  const facility = await coreRepository.getTradingFacility(facilityId);
  if (
    !facility ||
    facility.facilityHash !== facilityHash ||
    facility.lifecycleStatus !== "active" ||
    facility.riskState !== "NORMAL" ||
    facility.withdrawable !== false ||
    facility.transferable !== false ||
    facility.sandboxOnly !== true ||
    facility.syntheticOnly !== true ||
    facility.productionAuthority !== false ||
    facility.fundsAuthority !== false
  ) fail("canonical local Facility is absent, inactive, or drifted");
  const unknown = await coreRepository.eventRepository.withTenantRead(
    (client) => client.query(
      `SELECT count(*)::int AS count
         FROM hypercore_testnet_submission_attempts
        WHERE facility_id = $1 AND state = 'UNKNOWN'`,
      [facilityId]
    )
  );
  if (unknown.rows[0]?.count !== 0) fail("unreconciled UNKNOWN execution blocks new risk");

  const binding = createHypercoreAccountBinding({
    facilityId,
    facilityHash,
    accountRole: "master",
    masterAccountAddress: masterAddress,
    subaccountAddress: null,
    bindingProofHash: hashId("hypercore_002d_master_binding_proof", {
      registrationEvidenceHash: readiness.registrationEvidenceHash,
      accountAddressHash: EXPECTED_ACCOUNT_ADDRESS_HASH,
      apiWalletAddressHash: EXPECTED_API_WALLET_ADDRESS_HASH
    }),
    bindingVersion: 1
  });
  const delegateRepository = new PostgresHypercoreDelegateRepository({
    coreRepository
  });
  await delegateRepository.recordBinding({
    binding,
    idempotencyKey: "hypercore-002d-live-binding-20260810",
    now: new Date(readiness.registrationEvidenceArtifact.registration.completedAt)
  });
  const registrationAt = new Date(
    readiness.registrationEvidenceArtifact.registration.completedAt
  );
  const delegateExpiry = new Date(registrationAt.getTime() + 30 * 86_400_000);
  const delegate = await delegateRepository.prepare({
    bindingId: binding.accountBindingId,
    apiWalletAddressHash: descriptor.apiWalletAddressHash,
    signerReferenceHash: descriptor.signerReferenceHash,
    delegateNameHash: hashId("hypercore_delegate_name", "ipo-one-002d"),
    expiresAt: delegateExpiry,
    idempotencyKey: "hypercore-002d-live-delegate-20260810",
    now: registrationAt
  });
  const handoff = createHypercoreTestnetSignerHandoff({
    binding,
    delegate,
    registrationEvidenceHash: readiness.registrationEvidenceHash,
    verifiedAt: registrationAt,
    expiresAt: delegateExpiry
  });
  const submissionRepository = new PostgresHypercoreTestnetSubmissionRepository({
    eventRepository: new PostgresEventRepository({ pool, tenantContext: context })
  });
  await submissionRepository.recordSignerHandoff(handoff);

  const riskSnapshot = {
    accountBindingHash: binding.accountBindingHash,
    metadataHash: readiness.metadataArtifact.metadataHash,
    metadataObservedAt: readiness.observedAt,
    observedAt: readiness.observedAt,
    status: "FRESH",
    openOrdersCount: 0,
    aggregateExposureUsd: "0",
    positionNotionalUsd: "0",
    unknownOutcomeCount: 0,
    reconciliationStatus: "RECONCILED",
    paused: false
  };
  riskSnapshot.riskSnapshotHash = hashId(
    "hypercore_testnet_risk_snapshot",
    riskSnapshot
  );
  const policy = createHypercoreTestnetProofPolicy({
    policyId: "hypercore_testnet_btc_proof_002d_live",
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash,
    signerReferenceHash: delegate.signerReferenceHash,
    metadataHash: readiness.metadataArtifact.metadataHash,
    assetIndex: 3,
    sizeDecimals: 5,
    priceDecimals: 1,
    metadataObservedAt: readiness.observedAt,
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder",
    approvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString()
  });
  const sourceActionHash = hashId("hypercore_002d_live_source_action", {
    facilityId,
    metadataHash: readiness.metadataArtifact.metadataHash,
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    registrationEvidenceHash: readiness.registrationEvidenceHash
  });
  const preparedAction = compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.ORDER,
    action: {
      assetIndex: 3,
      side: readiness.action.side,
      limitPx: readiness.action.limitPx,
      size: readiness.action.size,
      reduceOnly: false,
      timeInForce: "Alo",
      cloid: `0x${sourceActionHash.slice(2, 34)}`
    },
    sourceActionHash,
    policyDecisionHash: hashId("hypercore_002d_live_policy_decision", {
      policyHash: policy.policyHash,
      exactLimitNotionalUsd: "10",
      expectedFillNotionalUsd: "0"
    }),
    riskSnapshotHash: riskSnapshot.riskSnapshotHash,
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash
  });
  const prepared = await submissionRepository.prepare({
    binding,
    handoffId: handoff.handoffId,
    policy,
    preparedAction,
    idempotencyKey: `hypercore-002d-live-${readiness.metadataArtifact.metadataHash}`,
    now
  });
  return Object.freeze({
    binding,
    delegate,
    handoff,
    policy,
    riskSnapshot,
    preparedAction,
    attempt: prepared.attempt,
    replayed: prepared.replayed
  });
}

async function runCli() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
  const masterAddress = address(
    process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS,
    "reviewed Testnet master"
  );
  if (hashId("hypercore_account_address", masterAddress) !== EXPECTED_ACCOUNT_ADDRESS_HASH) {
    fail("reviewed Testnet master hash drifted");
  }
  const signerKeyPath = process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_KEY_PATH;
  if (typeof signerKeyPath !== "string") fail("isolated signer key path is required");
  const facilityId = process.env.IPO_ONE_HYPERCORE_TESTNET_FACILITY_ID;
  if (typeof facilityId !== "string") fail("canonical Facility ID is required");
  const facilityHash = bytes32(
    process.env.IPO_ONE_HYPERCORE_TESTNET_FACILITY_HASH,
    "canonical Facility hash"
  );
  const resultFile = process.env.IPO_ONE_HYPERCORE_REGISTRATION_RESULT_FILE;
  if (typeof resultFile !== "string") fail("registration result file is required");
  const registrationResult = JSON.parse(await readFile(resultFile, "utf8"));
  if (
    registrationResult.requestHash !== EXPECTED_REGISTRATION_REQUEST_HASH ||
    registrationResult.status !== "REGISTERED" ||
    registrationResult.automaticRetry !== false ||
    registrationResult.rawSignaturePersisted !== false ||
    registrationResult.rawResponsePersisted !== false ||
    !HASH.test(registrationResult.responseHash ?? "")
  ) fail("exact one-use registration result is missing or drifted");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    application_name: "ipo-one-hypercore-002d-proof-prepare"
  });
  try {
    const output = await withHypercoreIsolatedTestnetSigner(
      signerKeyPath,
      async ({ descriptor, transientApiWalletAddress }) => {
        if (
          descriptor.apiWalletAddressHash !== EXPECTED_API_WALLET_ADDRESS_HASH ||
          descriptor.signerReferenceHash !== EXPECTED_SIGNER_REFERENCE_HASH
        ) fail("isolated signer identity drifted");
        const now = new Date();
        const readiness = await collectHypercore002dReadiness({
          fetchImpl: fetch,
          masterAddress,
          apiWalletAddress: transientApiWalletAddress,
          now,
          registrationResult
        });
        const durable = await prepareDurableAttempt({
          pool,
          facilityId,
          facilityHash,
          masterAddress,
          descriptor,
          readiness,
          now
        });
        return {
          registrationEvidenceArtifact: readiness.registrationEvidenceArtifact,
          metadataArtifact: readiness.metadataArtifact,
          report: {
            issueId: "HYPERLIQUID-002D",
            decision: "READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL",
            accountRole: "master",
            accountAddressHash: durable.binding.canonicalAccountAddressHash,
            accountBindingHash: durable.binding.accountBindingHash,
            delegateHash: durable.delegate.delegateHash,
            handoffHash: durable.handoff.handoffHash,
            signerReferenceHash: durable.delegate.signerReferenceHash,
            apiWalletAddressHash: durable.delegate.apiWalletAddressHash,
            registrationEvidenceHash: readiness.registrationEvidenceHash,
            facilityId,
            facilityHash,
            executionId: durable.attempt.executionId,
            executionHash: durable.attempt.executionHash,
            preparedActionHash: durable.preparedAction.preparedActionHash,
            proposedAction: durable.preparedAction.hyperliquidAction,
            side: readiness.action.side,
            limitPx: readiness.action.limitPx,
            size: readiness.action.size,
            exactLimitNotionalUsd: "10",
            maximumExposureUsd: "10",
            expectedFillNotionalUsd: "0",
            openingTimeInForce: "Alo",
            distanceBps: readiness.action.distanceBps,
            policyHash: durable.policy.policyHash,
            metadataHash: readiness.metadataArtifact.metadataHash,
            riskSnapshotHash: durable.riskSnapshot.riskSnapshotHash,
            durableExecutionState: durable.attempt.state,
            preparedAt: durable.attempt.preparedAt,
            expiresAt: durable.attempt.expiresAt,
            exactApprovalMarker: `HYPERLIQUID-002D:${durable.attempt.executionHash}`,
            replayed: durable.replayed,
            duplicatePrevention: {
              durableNonce: durable.attempt.nonce,
              idempotencyKeyHash: durable.attempt.idempotencyKeyHash,
              retryAllowed: false,
              externalSubmissionAttempted: false
            },
            safety: {
              exchangeWriteAttempted: false,
              signatureCreated: false,
              rawAddressPersisted: false,
              rawKeyPersisted: false,
              rawSignaturePersisted: false,
              rawResponsePersisted: false,
              automaticRetry: false,
              transfersAvailable: false,
              withdrawalsAvailable: false,
              leverageChangesAvailable: false,
              mainnetAuthority: false,
              productionAuthority: false,
              realFundsAuthority: false
            },
            schemaVersion: "hypercore_002d_live_prewrite_preparation.v1"
          }
        };
      }
    );
    console.log(`HYPERCORE_002D_PREPARED ${JSON.stringify(output)}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
