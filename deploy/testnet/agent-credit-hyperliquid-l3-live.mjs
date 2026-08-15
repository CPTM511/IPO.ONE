import { constants } from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  rename
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { hashId } from "../../packages/domain/src/index.js";
import {
  applyAgentCreditRepayment,
  createAgentCreditIdentity,
  createAgentCreditOffer,
  acceptAgentCreditOffer
} from "../../modules/agent-credit-execution/src/credit.js";
import { AGENT_CREDIT_EXECUTION_POLICY } from "../../modules/agent-credit-execution/src/policy.js";
import {
  HypercoreExecutionActionKind,
  compileHypercoreExecutionAction,
  createHypercoreL1SigningRequest
} from "../../modules/hypercore-venue-adapter/src/index.js";
import {
  inspectHypercoreIsolatedTestnetSigner,
  withHypercoreIsolatedTestnetSigner
} from "./hypercore-isolated-signer.mjs";
import {
  AGENT_CREDIT_HYPERLIQUID_L3_PROFILE,
  createAgentCreditHyperliquidL3Preparation,
  revalidateAgentCreditHyperliquidL3Preparation
} from "./agent-credit-hyperliquid-l3-gate.mjs";

const execFileAsync = promisify(execFile);
const INFO_ENDPOINT = "https://api.hyperliquid-testnet.xyz/info";
const EXCHANGE_ENDPOINT = "https://api.hyperliquid-testnet.xyz/exchange";
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const RUN_ID = /^agent-credit-exec-001-l3-[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/;
const PRIVATE_DIRECTORY = "/private/tmp/ipo-one-agent-credit-exec-001";
const MINIMUM_OPEN_NOTIONAL_USD = "10";
const PRINCIPAL_MINOR = "1200";
const MAXIMUM_INFO_RESPONSE_BYTES = 512 * 1024;
const MAXIMUM_EXCHANGE_RESPONSE_BYTES = 32 * 1024;

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}

function canonicalAddress(value, name) {
  const normalized = String(value ?? "").toLowerCase();
  if (!ADDRESS.test(normalized)) fail("agent_credit_l3_invalid_address", `${name} is invalid`);
  return normalized;
}

function bytes32(value, name) {
  if (!HASH.test(value ?? "")) fail("agent_credit_l3_invalid_hash", `${name} is invalid`);
  return value;
}

function finiteDecimal(value, name, { allowZero = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (!allowZero && number <= 0)) {
    fail("agent_credit_l3_invalid_decimal", `${name} is invalid`);
  }
  return number;
}

function clone(value) {
  return structuredClone(value);
}

function exactObject(value, keys, code = "agent_credit_l3_invalid_input") {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) fail(code, "input has an open or incomplete shape");
  return value;
}

function privatePath(value, suffix) {
  const absolute = resolve(value);
  if (!absolute.startsWith(`${PRIVATE_DIRECTORY}/`) || !absolute.endsWith(suffix)) {
    fail("agent_credit_l3_private_path_denied", "runtime files must stay in the owner-only run directory");
  }
  return absolute;
}

async function writeOwnerOnlyJson(path, value, { exclusive = false } = {}) {
  const selected = privatePath(path, ".json");
  await mkdir(dirname(selected), { recursive: true, mode: 0o700 });
  if (exclusive) {
    try {
      await access(selected);
      fail("agent_credit_l3_replay_denied", "the exact run artifact already exists");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const temporary = `${selected}.${process.pid}.${randomUUID()}.tmp.json`;
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600
  );
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, selected);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function responseJson(response, name, maximumBytes) {
  if (!response) fail("agent_credit_l3_transport_unknown", `${name} returned no response`);
  const length = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(length) && length > maximumBytes) {
    fail("agent_credit_l3_response_oversized", `${name} response is oversized`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > maximumBytes) {
    fail("agent_credit_l3_response_oversized", `${name} response is oversized`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("agent_credit_l3_invalid_response", `${name} returned invalid JSON`);
  }
  if (!response.ok) {
    fail("agent_credit_l3_http_error", `${name} returned HTTP ${response.status}`, {
      statusCode: response.status,
      responseHash: hashId("agent_credit_l3_http_response", value)
    });
  }
  return { value, statusCode: response.status, text };
}

async function postInfo(fetchImpl, body, name) {
  const response = await fetchImpl(INFO_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(10_000)
  });
  return (await responseJson(response, name, MAXIMUM_INFO_RESPONSE_BYTES)).value;
}

function nonZeroPositions(clearinghouse) {
  if (!Array.isArray(clearinghouse?.assetPositions)) {
    fail("agent_credit_l3_account_state_invalid", "position state is incomplete");
  }
  return clearinghouse.assetPositions.filter((entry) =>
    Number(entry?.position?.szi ?? "0") !== 0
  );
}

async function readVenueState({ fetchImpl, account, apiWallet, startTime }) {
  const [masterRole, apiWalletRole, clearinghouse, orders, fills, meta, mids, book] =
    await Promise.all([
      postInfo(fetchImpl, { type: "userRole", user: account }, "master role"),
      postInfo(fetchImpl, { type: "userRole", user: apiWallet }, "API wallet role"),
      postInfo(fetchImpl, { type: "clearinghouseState", user: account }, "account state"),
      postInfo(fetchImpl, { type: "openOrders", user: account }, "open orders"),
      postInfo(fetchImpl, {
        type: "userFillsByTime",
        user: account,
        startTime,
        aggregateByTime: true
      }, "fills"),
      postInfo(fetchImpl, { type: "meta" }, "market metadata"),
      postInfo(fetchImpl, { type: "allMids" }, "market mids"),
      postInfo(fetchImpl, { type: "l2Book", coin: "BTC" }, "BTC book")
    ]);
  if (
    masterRole?.role !== "user" ||
    !clearinghouse?.marginSummary ||
    !Array.isArray(orders) ||
    !Array.isArray(fills) ||
    !Array.isArray(meta?.universe)
  ) fail("agent_credit_l3_venue_state_invalid", "the reviewed Testnet account state is incomplete");
  const btc = meta.universe[AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.assetIndex];
  if (btc?.name !== "BTC" || btc?.szDecimals !== 5) {
    fail("agent_credit_l3_market_metadata_drift", "BTC metadata drifted");
  }
  const bestBid = book?.levels?.[0]?.[0]?.px;
  const bestAsk = book?.levels?.[1]?.[0]?.px;
  finiteDecimal(bestBid, "best bid", { allowZero: false });
  finiteDecimal(bestAsk, "best ask", { allowZero: false });
  if (Number(bestBid) >= Number(bestAsk)) {
    fail("agent_credit_l3_market_metadata_drift", "BTC book is crossed");
  }
  const positions = nonZeroPositions(clearinghouse);
  const accountValue = String(clearinghouse.marginSummary.accountValue);
  const withdrawable = String(clearinghouse.withdrawable);
  finiteDecimal(accountValue, "account value");
  finiteDecimal(withdrawable, "withdrawable");
  return {
    masterRole: masterRole.role,
    apiWalletRole: apiWalletRole?.role ?? "missing",
    accountValue,
    withdrawable,
    positions,
    orders,
    fills,
    market: {
      name: btc.name,
      assetIndex: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.assetIndex,
      sizeDecimals: btc.szDecimals,
      maxLeverage: btc.maxLeverage,
      mid: String(mids?.BTC),
      bestBid: String(bestBid),
      bestAsk: String(bestAsk)
    },
    hashes: {
      masterRoleHash: hashId("agent_credit_l3_info_response", masterRole),
      apiWalletRoleHash: hashId("agent_credit_l3_info_response", apiWalletRole),
      accountStateHash: hashId("agent_credit_l3_info_response", clearinghouse),
      ordersHash: hashId("agent_credit_l3_info_response", orders),
      fillsHash: hashId("agent_credit_l3_info_response", fills),
      metadataHash: hashId("agent_credit_l3_info_response", meta),
      midsHash: hashId("agent_credit_l3_info_response", mids),
      bookHash: hashId("agent_credit_l3_info_response", book)
    },
    observedAt: new Date().toISOString()
  };
}

function priceStep(value) {
  const magnitude = Math.floor(Math.log10(value));
  return 10 ** Math.max(magnitude - 4, -1);
}

function canonicalDecimal(value) {
  const fixed = value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  if (!/^(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?)$/.test(fixed)) {
    fail("agent_credit_l3_decimal_encoding_denied", "decimal cannot be encoded canonically");
  }
  return fixed;
}

function decimalParts(value, name) {
  const text = String(value);
  if (!/^(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?)$/.test(text)) {
    fail("agent_credit_l3_decimal_encoding_denied", `${name} is not canonical`);
  }
  const [whole, fraction = ""] = text.split(".");
  return {
    coefficient: BigInt(`${whole}${fraction}`),
    decimals: fraction.length,
    text
  };
}

function powerOfTen(decimals) {
  return 10n ** BigInt(decimals);
}

function scaledDecimal(coefficient, decimals) {
  const padded = coefficient.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return padded;
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

function openingNotional({ limitPx, size, sizeDecimals }) {
  if (!Number.isSafeInteger(sizeDecimals) || sizeDecimals < 0 || sizeDecimals > 8) {
    fail("agent_credit_l3_size_precision_denied", "BTC size precision is invalid");
  }
  const price = decimalParts(limitPx, "limit price");
  const quantity = decimalParts(size, "quantity");
  if (quantity.decimals > sizeDecimals) {
    fail("agent_credit_l3_size_precision_denied", "quantity exceeds BTC size precision");
  }
  const sizeUnits = quantity.coefficient * powerOfTen(sizeDecimals - quantity.decimals);
  const product = price.coefficient * sizeUnits;
  const productDecimals = price.decimals + sizeDecimals;
  return {
    product,
    productDecimals,
    sizeUnits,
    exactNotionalUsd: scaledDecimal(product, productDecimals)
  };
}

export function revalidateBoundedBtcOpeningAction({
  action,
  sizeDecimals,
  maximumNotionalUsd = AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd
}) {
  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action) ||
    action.assetIndex !== AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.assetIndex ||
    action.side !== "buy" ||
    action.reduceOnly !== false ||
    action.timeInForce !== "Ioc" ||
    maximumNotionalUsd !== AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd
  ) {
    fail("agent_credit_l3_open_action_drift", "opening action drifted from the approved envelope");
  }
  const notional = openingNotional({
    limitPx: action.limitPx,
    size: action.size,
    sizeDecimals
  });
  const minimum = BigInt(MINIMUM_OPEN_NOTIONAL_USD) * powerOfTen(notional.productDecimals);
  const maximum = BigInt(maximumNotionalUsd) * powerOfTen(notional.productDecimals);
  if (notional.product <= minimum) {
    fail("agent_credit_l3_venue_minimum_denied", "opening notional must be greater than 10 USD");
  }
  if (notional.product > maximum) {
    fail("agent_credit_l3_notional_limit_denied", "opening notional exceeds 12 USD");
  }
  if (action.maximumLimitNotionalUsd !== notional.exactNotionalUsd) {
    fail("agent_credit_l3_open_action_drift", "opening notional evidence drifted");
  }
  return Object.freeze({
    exactNotionalUsd: notional.exactNotionalUsd,
    sizeUnits: notional.sizeUnits.toString(),
    sizeDecimals,
    venueMinimumSatisfied: true,
    maximumNotionalSatisfied: true
  });
}

export function selectBoundedBtcIocAction({
  bestBid,
  bestAsk,
  side,
  closeSize = null,
  sizeDecimals = 5,
  maximumNotionalUsd = AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd
}) {
  const bid = finiteDecimal(bestBid, "best bid", { allowZero: false });
  const ask = finiteDecimal(bestAsk, "best ask", { allowZero: false });
  if (!(bid < ask) || !["buy", "sell"].includes(side)) {
    fail("agent_credit_l3_action_selection_denied", "book or side is invalid");
  }
  const reference = side === "buy" ? ask * 1.01 : bid * 0.99;
  const step = priceStep(reference);
  const ticks = side === "buy"
    ? Math.ceil(reference / step)
    : Math.floor(reference / step);
  const limit = ticks * step;
  let size;
  if (closeSize === null) {
    if (
      !Number.isSafeInteger(sizeDecimals) ||
      sizeDecimals < 0 ||
      sizeDecimals > 8 ||
      maximumNotionalUsd !== AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd
    ) fail("agent_credit_l3_action_selection_denied", "approved size or notional policy drifted");
    const limitPx = canonicalDecimal(limit);
    const price = decimalParts(limitPx, "limit price");
    const quantityScale = powerOfTen(sizeDecimals);
    const minimumScaled =
      BigInt(MINIMUM_OPEN_NOTIONAL_USD) *
      powerOfTen(price.decimals) *
      quantityScale;
    const maximumScaled =
      BigInt(maximumNotionalUsd) *
      powerOfTen(price.decimals) *
      quantityScale;
    const units = minimumScaled / price.coefficient + 1n;
    if (units < 1n || price.coefficient * units > maximumScaled) {
      fail(
        "agent_credit_l3_notional_window_unavailable",
        "no BTC quantity exists inside the approved 10-12 USD window"
      );
    }
    size = scaledDecimal(units, sizeDecimals);
  } else {
    const quantity = decimalParts(closeSize, "close size");
    if (quantity.decimals > sizeDecimals) {
      fail("agent_credit_l3_size_precision_denied", "close quantity exceeds BTC size precision");
    }
    size = quantity.text;
  }
  const limitPx = canonicalDecimal(limit);
  const notional = openingNotional({ limitPx, size, sizeDecimals });
  const action = Object.freeze({
    assetIndex: 3,
    side,
    limitPx,
    size,
    reduceOnly: closeSize !== null,
    timeInForce: "Ioc",
    maximumLimitNotionalUsd: notional.exactNotionalUsd
  });
  if (closeSize === null) {
    revalidateBoundedBtcOpeningAction({
      action,
      sizeDecimals,
      maximumNotionalUsd
    });
  }
  return action;
}

function lifecycle(runId, now) {
  const identity = createAgentCreditIdentity({
    economicAgentWalletHash: hashId("agent_credit_l3_external_agent", { runId }),
    now,
    runId
  });
  const offerState = createAgentCreditOffer({
    identity,
    requestedPrincipalMinor: PRINCIPAL_MINOR,
    now
  });
  const credit = acceptAgentCreditOffer({ identity, offerState, now });
  const authorization = {
    authorizationId: `agent_credit_authorization_${hashId("agent_credit_l3_authorization", {
      runId,
      mandateId: identity.mandate.mandateId,
      facilityId: credit.facility.tradingFacilityId,
      obligationId: credit.obligation.obligationId,
      policyVersion: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.policyVersion,
      authorizationVersion: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.authorizationVersion
    }).slice(2, 34)}`,
    status: "active",
    expiresAt: identity.mandate.expiresAt,
    policyVersion: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.policyVersion,
    authorizationVersion: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.authorizationVersion,
    schemaVersion: "agent_credit_l3_authorization.v1"
  };
  return { identity, offerState, credit, authorization };
}

async function currentCommit(cwd) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

async function workingDiffHash(cwd) {
  const { stdout } = await execFileAsync("git", ["diff", "--binary", "HEAD"], {
    cwd,
    maxBuffer: 8 * 1024 * 1024
  });
  return hashId("agent_credit_l3_working_tree_diff", stdout);
}

async function runtimeSourceHash(cwd) {
  const files = [
    "deploy/testnet/agent-credit-hyperliquid-l3-live.mjs",
    "deploy/testnet/agent-credit-hyperliquid-l3-gate.mjs",
    "deploy/testnet/hypercore-isolated-signer.mjs",
    "deploy/testnet/start-hypercore-002d-handoff.mjs"
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(resolve(cwd, file), "utf8") }))
  );
  return hashId("agent_credit_l3_runtime_sources", sources);
}

function gateEnvironment({ runId, account, apiWallet, signerReference }) {
  return {
    IPO_ONE_EXECUTION_VENUE: "hyperliquid",
    IPO_ONE_EXECUTION_ENVIRONMENT: "testnet",
    IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN:
      "https://api.hyperliquid-testnet.xyz",
    IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID: runId,
    IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId,
    IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS: account,
    IPO_ONE_HYPERLIQUID_TESTNET_API_WALLET_ADDRESS: apiWallet,
    IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE: signerReference,
    IPO_ONE_HYPERLIQUID_ACTION: "order"
  };
}

function requireOperatorAuthority({
  env,
  runId,
  candidateCommit,
  account,
  apiWallet,
  signerReference
}) {
  const rawSecretNames = [
    "IPO_ONE_HYPERLIQUID_PRIVATE_KEY",
    "IPO_ONE_HYPERLIQUID_SEED_PHRASE",
    "IPO_ONE_HYPERCORE_PRIVATE_KEY",
    "IPO_ONE_HYPERCORE_SIGNER_PRIVATE_KEY"
  ];
  if (
    env.CI === "true" ||
    env.GITHUB_ACTIONS === "true" ||
    env.IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID !== runId ||
    env.IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN !== runId ||
    env.IPO_ONE_AGENT_CREDIT_CANDIDATE_COMMIT !== candidateCommit ||
    env.IPO_ONE_EXECUTION_VENUE !== "hyperliquid" ||
    env.IPO_ONE_EXECUTION_ENVIRONMENT !== "testnet" ||
    env.IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN !==
      "https://api.hyperliquid-testnet.xyz" ||
    String(env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS ?? "").toLowerCase() !== account ||
    String(env.IPO_ONE_HYPERLIQUID_TESTNET_API_WALLET_ADDRESS ?? "").toLowerCase() !== apiWallet ||
    env.IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE !== signerReference ||
    env.IPO_ONE_HYPERLIQUID_ACTION !== "order" ||
    rawSecretNames.some((name) => Boolean(env[name]))
  ) fail("agent_credit_l3_operator_authority_denied", "exact operator authority is missing or drifted");
}

export async function prepareAgentCreditHyperliquidL3({
  cwd,
  runId,
  candidateCommit,
  account,
  signerKeyPath,
  preparationFile,
  fetchImpl = fetch,
  now = new Date(),
  env = process.env
}) {
  if (!RUN_ID.test(runId ?? "") || !COMMIT.test(candidateCommit ?? "")) {
    fail("agent_credit_l3_candidate_binding_invalid", "run or candidate is invalid");
  }
  if (await currentCommit(cwd) !== candidateCommit) {
    fail("agent_credit_l3_candidate_commit_drift", "candidate commit drifted");
  }
  const masterAccount = canonicalAddress(account, "master account");
  const descriptor = await inspectHypercoreIsolatedTestnetSigner(signerKeyPath);
  const prepared = await withHypercoreIsolatedTestnetSigner(
    signerKeyPath,
    async ({ transientApiWalletAddress }) => {
      const apiWallet = canonicalAddress(transientApiWalletAddress, "API wallet");
      requireOperatorAuthority({
        env,
        runId,
        candidateCommit,
        account: masterAccount,
        apiWallet,
        signerReference: descriptor.isolatedSignerReference
      });
      const baseline = await readVenueState({
        fetchImpl,
        account: masterAccount,
        apiWallet,
        startTime: 0
      });
      if (
        baseline.positions.length !== 0 ||
        baseline.orders.length !== 0 ||
        Number(baseline.accountValue) < 12 ||
        Number(baseline.withdrawable) < 12 ||
        !["missing", "agent"].includes(baseline.apiWalletRole)
      ) fail("agent_credit_l3_baseline_denied", "account, funding or signer baseline is unsafe");
      const kernel = lifecycle(runId, now);
      const binding = {
        authorizationVersion: kernel.authorization.authorizationVersion,
        expiresAt: new Date(Math.min(
          now.getTime() + 30 * 60_000,
          new Date(kernel.authorization.expiresAt).getTime()
        )).toISOString(),
        facilityId: kernel.credit.facility.tradingFacilityId,
        market: "BTC",
        maximumLeverage: 1,
        maximumNotionalUsd: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd,
        obligationId: kernel.credit.obligation.obligationId,
        policyVersion: kernel.authorization.policyVersion
      };
      const gateEnv = gateEnvironment({
        runId,
        account: masterAccount,
        apiWallet,
        signerReference: descriptor.isolatedSignerReference
      });
      const executionPreparation = createAgentCreditHyperliquidL3Preparation({
        binding,
        env: gateEnv
      });
      const handoffCore = {
        issueId: "AGENT-CREDIT-EXEC-001",
        runId,
        candidateCommit,
        runtimeDiffHash: await workingDiffHash(cwd),
        runtimeSourceHash: await runtimeSourceHash(cwd),
        venue: "hyperliquid",
        environment: "testnet",
        origin: "https://api.hyperliquid-testnet.xyz",
        account: masterAccount,
        accountType: "master",
        accountAddressHash: hashId("hypercore_account_address", masterAccount),
        apiWalletAddress: apiWallet,
        apiWalletAddressHash: descriptor.apiWalletAddressHash,
        signerReference: descriptor.isolatedSignerReference,
        signerReferenceHash: descriptor.signerReferenceHash,
        subjectId: kernel.identity.subject.subjectId,
        principalId: kernel.identity.principal.principalId,
        mandateId: kernel.identity.mandate.mandateId,
        creditIntentId: kernel.offerState.intent.creditIntentId,
        offerId: kernel.offerState.offer.creditOfferId,
        obligationId: kernel.credit.obligation.obligationId,
        facilityId: kernel.credit.facility.tradingFacilityId,
        authorizationId: kernel.authorization.authorizationId,
        policyVersion: kernel.authorization.policyVersion,
        authorizationVersion: kernel.authorization.authorizationVersion,
        action: "one_bounded_open_close_cycle",
        market: "BTC",
        maximumNotionalUsd: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd,
        maximumLeverage: 1,
        maximumConcurrentPositions: 1,
        tradeCycles: 1,
        expiresAt: binding.expiresAt,
        preparationHash: executionPreparation.preparationHash,
        idempotencyIdentity: executionPreparation.idempotencyIdentity,
        repaymentDestination:
          `ipo-one://obligations/${kernel.credit.obligation.obligationId}/repayment`,
        emergencyClosePolicy: "cancel_then_reduce_only_close_then_reconcile_same_run",
        baseline: {
          accountValueUsd: baseline.accountValue,
          withdrawableUsd: baseline.withdrawable,
          positionsCount: 0,
          openOrdersCount: 0,
          apiWalletRole: baseline.apiWalletRole,
          hashes: baseline.hashes,
          observedAt: baseline.observedAt
        }
      };
      const handoffHash = hashId("agent_credit_l3_handoff", handoffCore);
      return {
        ...handoffCore,
        handoffHash,
        binding,
        environmentAuthority: gateEnv,
        executionPreparation,
        kernel,
        safety: {
          withdrawalAllowed: false,
          transferAllowed: false,
          agentCustodyAllowed: false,
          mainnetAuthority: false,
          productionAuthority: false,
          realFundsAuthority: false,
          automaticSecondRun: false,
          externalWritePerformed: false,
          rawPrivateKeyPersisted: false,
          rawSignaturePersisted: false,
          rawResponsePersisted: false
        },
        schemaVersion: "agent_credit_hyperliquid_l3_handoff.v1"
      };
    }
  );
  await writeOwnerOnlyJson(preparationFile, prepared, { exclusive: true });
  return clone({
    ...prepared,
    kernel: undefined,
    environmentAuthority: undefined,
    binding: undefined,
    externalRequestPerformed: true,
    externalWritePerformed: false
  });
}

function assertKernelAuthority(prepared, now) {
  const { identity, credit, authorization } = prepared.kernel;
  if (
    identity.mandate.status !== "active" ||
    new Date(identity.mandate.expiresAt) <= now ||
    credit.facility.lifecycleStatus !== "active" ||
    credit.facility.riskState !== "NORMAL" ||
    credit.facility.withdrawable !== false ||
    credit.facility.transferable !== false ||
    credit.obligation.status !== "active" ||
    authorization.status !== "active" ||
    new Date(authorization.expiresAt) <= now ||
    authorization.policyVersion !== AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.policyVersion ||
    authorization.authorizationVersion !==
      AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.authorizationVersion
  ) fail("agent_credit_l3_authority_unavailable", "Facility, Obligation, Mandate or Authorization drifted");
}

function validatePreparedArtifact(prepared) {
  if (
    prepared?.schemaVersion !== "agent_credit_hyperliquid_l3_handoff.v1" ||
    !RUN_ID.test(prepared.runId ?? "") ||
    !COMMIT.test(prepared.candidateCommit ?? "") ||
    prepared.venue !== "hyperliquid" ||
    prepared.environment !== "testnet" ||
    prepared.origin !== "https://api.hyperliquid-testnet.xyz" ||
    prepared.market !== "BTC" ||
    prepared.maximumNotionalUsd !==
      AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd ||
    prepared.maximumLeverage !== 1 ||
    prepared.maximumConcurrentPositions !== 1 ||
    prepared.tradeCycles !== 1 ||
    prepared.safety?.withdrawalAllowed !== false ||
    prepared.safety?.transferAllowed !== false ||
    prepared.safety?.agentCustodyAllowed !== false ||
    hashId("agent_credit_l3_handoff", {
      issueId: prepared.issueId,
      runId: prepared.runId,
      candidateCommit: prepared.candidateCommit,
      runtimeDiffHash: prepared.runtimeDiffHash,
      runtimeSourceHash: prepared.runtimeSourceHash,
      venue: prepared.venue,
      environment: prepared.environment,
      origin: prepared.origin,
      account: prepared.account,
      accountType: prepared.accountType,
      accountAddressHash: prepared.accountAddressHash,
      apiWalletAddress: prepared.apiWalletAddress,
      apiWalletAddressHash: prepared.apiWalletAddressHash,
      signerReference: prepared.signerReference,
      signerReferenceHash: prepared.signerReferenceHash,
      subjectId: prepared.subjectId,
      principalId: prepared.principalId,
      mandateId: prepared.mandateId,
      creditIntentId: prepared.creditIntentId,
      offerId: prepared.offerId,
      obligationId: prepared.obligationId,
      facilityId: prepared.facilityId,
      authorizationId: prepared.authorizationId,
      policyVersion: prepared.policyVersion,
      authorizationVersion: prepared.authorizationVersion,
      action: prepared.action,
      market: prepared.market,
      maximumNotionalUsd: prepared.maximumNotionalUsd,
      maximumLeverage: prepared.maximumLeverage,
      maximumConcurrentPositions: prepared.maximumConcurrentPositions,
      tradeCycles: prepared.tradeCycles,
      expiresAt: prepared.expiresAt,
      preparationHash: prepared.preparationHash,
      idempotencyIdentity: prepared.idempotencyIdentity,
      repaymentDestination: prepared.repaymentDestination,
      emergencyClosePolicy: prepared.emergencyClosePolicy,
      baseline: prepared.baseline
    }) !== prepared.handoffHash
  ) fail("agent_credit_l3_handoff_drift", "the exact handoff artifact drifted");
}

export async function dryRunAgentCreditHyperliquidL3({
  cwd,
  preparationFile,
  signerKeyPath,
  requireRegistered = true,
  fetchImpl = fetch,
  env = process.env
}) {
  const prepared = await readJson(preparationFile);
  validatePreparedArtifact(prepared);
  if (await currentCommit(cwd) !== prepared.candidateCommit) {
    fail("agent_credit_l3_candidate_commit_drift", "candidate commit drifted");
  }
  if (
    await workingDiffHash(cwd) !== prepared.runtimeDiffHash ||
    await runtimeSourceHash(cwd) !== prepared.runtimeSourceHash
  ) fail("EXECUTION_PREPARATION_DRIFT", "runtime source drifted after preparation");
  const descriptor = await inspectHypercoreIsolatedTestnetSigner(signerKeyPath);
  if (
    descriptor.signerReferenceHash !== prepared.signerReferenceHash ||
    descriptor.apiWalletAddressHash !== prepared.apiWalletAddressHash
  ) fail("agent_credit_l3_signer_drift", "isolated signer drifted");
  requireOperatorAuthority({
    env,
    runId: prepared.runId,
    candidateCommit: prepared.candidateCommit,
    account: prepared.account,
    apiWallet: prepared.apiWalletAddress,
    signerReference: prepared.signerReference
  });
  const revalidation = revalidateAgentCreditHyperliquidL3Preparation({
    binding: prepared.binding,
    env: prepared.environmentAuthority,
    preparation: prepared.executionPreparation
  });
  if (!revalidation.approved) fail(revalidation.reasonCode, "execution preparation drifted");
  const now = new Date();
  assertKernelAuthority(prepared, now);
  if (now >= new Date(prepared.expiresAt)) {
    fail("agent_credit_l3_preparation_expired", "preparation expired");
  }
  const venue = await readVenueState({
    fetchImpl,
    account: prepared.account,
    apiWallet: prepared.apiWalletAddress,
    startTime: 0
  });
  const checks = {
    environmentExact: true,
    preparationHash: true,
    signerIsolation: true,
    facilityActive: true,
    mandateActive: true,
    authorizationActive: true,
    reconciliationBaseline: venue.positions.length === 0 && venue.orders.length === 0,
    noExistingUnintendedPosition: venue.positions.length === 0,
    noUnintendedPendingOrder: venue.orders.length === 0,
    accountValueAtLeastTwelveUsd: Number(venue.accountValue) >= 12,
    signerRegistration: requireRegistered
      ? venue.apiWalletRole === "agent"
      : ["missing", "agent"].includes(venue.apiWalletRole),
    mainnetDenied: true,
    withdrawalDenied: true,
    transferDenied: true
  };
  if (Object.values(checks).some((value) => value !== true)) {
    fail("agent_credit_l3_dry_run_blocked", "one or more dry-run checks failed", checks);
  }
  return {
    status: "DRY_RUN_PASS",
    runId: prepared.runId,
    candidateCommit: prepared.candidateCommit,
    preparationHash: prepared.preparationHash,
    handoffHash: prepared.handoffHash,
    account: prepared.account,
    apiWalletAddress: prepared.apiWalletAddress,
    signerReference: prepared.signerReference,
    venueState: {
      accountValueUsd: venue.accountValue,
      withdrawableUsd: venue.withdrawable,
      positionsCount: venue.positions.length,
      openOrdersCount: venue.orders.length,
      apiWalletRole: venue.apiWalletRole,
      hashes: venue.hashes,
      observedAt: venue.observedAt
    },
    checks,
    signatureCreated: false,
    exchangeWritePerformed: false,
    mainnetInteraction: false,
    realFundsMoved: false,
    schemaVersion: "agent_credit_hyperliquid_l3_dry_run.v1"
  };
}

function positionSummary(positions) {
  return positions.map(({ position }) => ({
    coin: position.coin,
    size: String(position.szi),
    entryPrice: position.entryPx === null ? null : String(position.entryPx),
    positionValueUsd: String(position.positionValue ?? "0"),
    unrealizedPnlUsd: String(position.unrealizedPnl ?? "0"),
    leverageType: position.leverage?.type ?? null,
    leverageValue: Number(position.leverage?.value ?? 0)
  }));
}

function findBtcPosition(venue) {
  const btc = venue.positions.filter(({ position }) => position?.coin === "BTC");
  if (btc.length > 1 || venue.positions.some(({ position }) => position?.coin !== "BTC")) {
    fail("agent_credit_l3_unintended_position", "an unintended position exists");
  }
  return btc[0]?.position ?? null;
}

async function persistRunState(path, state) {
  await writeOwnerOnlyJson(path, state, { exclusive: state.version === 1 });
}

function submissionDisposition(parsed, actionKind) {
  if (parsed?.status !== "ok") return { disposition: "REJECTED", order: null };
  const item = parsed?.response?.data?.statuses?.[0];
  if (actionKind === HypercoreExecutionActionKind.CANCEL_BY_CLOID) {
    return item === "success"
      ? { disposition: "CONFIRMED", order: null }
      : { disposition: "UNKNOWN", order: null };
  }
  if (item?.filled && Number.isSafeInteger(Number(item.filled.oid))) {
    return {
      disposition: "FILLED",
      order: {
        oid: Number(item.filled.oid),
        totalSize: String(item.filled.totalSz),
        averagePrice: String(item.filled.avgPx)
      }
    };
  }
  if (item?.resting && Number.isSafeInteger(Number(item.resting.oid))) {
    return {
      disposition: "RESTING",
      order: { oid: Number(item.resting.oid) }
    };
  }
  return { disposition: "UNKNOWN", order: null };
}

async function assertBeforeSignature({
  cwd,
  prepared,
  signerDescriptor,
  apiWallet,
  phase,
  action,
  fetchImpl,
  startTime,
  expectedCloseSize = null,
  expectedCloid = null,
  env
}) {
  if (await currentCommit(cwd) !== prepared.candidateCommit) {
    fail("agent_credit_l3_candidate_commit_drift", "candidate commit drifted before signature");
  }
  if (
    await workingDiffHash(cwd) !== prepared.runtimeDiffHash ||
    await runtimeSourceHash(cwd) !== prepared.runtimeSourceHash
  ) fail("EXECUTION_PREPARATION_DRIFT", "runtime source drifted before signature");
  validatePreparedArtifact(prepared);
  if (
    signerDescriptor.signerReferenceHash !== prepared.signerReferenceHash ||
    signerDescriptor.apiWalletAddressHash !== prepared.apiWalletAddressHash ||
    apiWallet !== prepared.apiWalletAddress
  ) fail("agent_credit_l3_signer_drift", "signer drifted before signature");
  requireOperatorAuthority({
    env,
    runId: prepared.runId,
    candidateCommit: prepared.candidateCommit,
    account: prepared.account,
    apiWallet: prepared.apiWalletAddress,
    signerReference: prepared.signerReference
  });
  const revalidation = revalidateAgentCreditHyperliquidL3Preparation({
    binding: prepared.binding,
    env: prepared.environmentAuthority,
    preparation: prepared.executionPreparation
  });
  if (!revalidation.approved) fail(revalidation.reasonCode, "preparation drifted before signature");
  const now = new Date();
  assertKernelAuthority(prepared, now);
  if (now >= new Date(prepared.expiresAt)) {
    fail("agent_credit_l3_preparation_expired", "preparation expired before signature");
  }
  const venue = await readVenueState({
    fetchImpl,
    account: prepared.account,
    apiWallet,
    startTime
  });
  if (venue.apiWalletRole !== "agent") {
    fail("agent_credit_l3_signer_registration_missing", "API wallet is not the approved agent");
  }
  if (phase === "open") {
    revalidateBoundedBtcOpeningAction({
      action,
      sizeDecimals: venue.market.sizeDecimals,
      maximumNotionalUsd: prepared.maximumNotionalUsd
    });
  }
  const position = findBtcPosition(venue);
  if (phase === "open") {
    if (position || venue.orders.length !== 0 || Number(venue.accountValue) < 12) {
      fail("agent_credit_l3_open_preflight_denied", "opening baseline is unsafe");
    }
  } else if (phase === "cancel") {
    if (
      venue.orders.length !== 1 ||
      venue.orders[0]?.cloid !== expectedCloid ||
      venue.orders[0]?.coin !== "BTC"
    ) fail("agent_credit_l3_cancel_preflight_denied", "the exact pending order is unavailable");
  } else {
    if (!position || venue.orders.length !== 0 || Number(position.szi) === 0) {
      fail("agent_credit_l3_close_preflight_denied", "close target is unavailable");
    }
    if (expectedCloseSize !== null && Math.abs(Number(position.szi)) > Number(expectedCloseSize) + 1e-12) {
      fail("agent_credit_l3_close_size_drift", "close size expanded beyond the observed position");
    }
  }
  const positionNotional = Math.abs(Number(position?.positionValue ?? "0"));
  if (positionNotional > 12 + 1e-9 || positionNotional / Math.max(Number(venue.accountValue), 0.000001) > 1.000001) {
    fail("agent_credit_l3_leverage_or_notional_denied", "position exceeds the approved notional or 1x bound");
  }
  return venue;
}

async function signAndSubmit({
  cwd,
  prepared,
  signerDescriptor,
  signer,
  apiWallet,
  phase,
  action,
  fetchImpl,
  runState,
  runStateFile,
  startTime,
  env
}) {
  const venue = await assertBeforeSignature({
    cwd,
    prepared,
    signerDescriptor,
    apiWallet,
    phase,
    action,
    fetchImpl,
    startTime,
    expectedCloseSize: action.reduceOnly ? action.size : null,
    expectedCloid: action.kind === "cancelByCloid" ? action.cloid : null,
    env
  });
  const actionCore = {
    phase,
    runId: prepared.runId,
    preparationHash: prepared.preparationHash,
    accountStateHash: venue.hashes.accountStateHash,
    ordersHash: venue.hashes.ordersHash,
    action
  };
  const sourceActionHash = hashId("agent_credit_l3_exact_action", actionCore);
  const policyDecisionHash = hashId("agent_credit_l3_policy_decision", {
    runId: prepared.runId,
    authorizationId: prepared.authorizationId,
    policyVersion: prepared.policyVersion,
    action: actionCore,
    maximumNotionalUsd: prepared.maximumNotionalUsd,
    maximumLeverage: 1
  });
  const riskSnapshotHash = hashId("agent_credit_l3_risk_snapshot", {
    accountStateHash: venue.hashes.accountStateHash,
    ordersHash: venue.hashes.ordersHash,
    fillsHash: venue.hashes.fillsHash,
    observedAt: venue.observedAt,
    positions: positionSummary(venue.positions)
  });
  const accountBindingHash = hashId("agent_credit_l3_account_binding", {
    account: prepared.account,
    facilityId: prepared.facilityId,
    preparationHash: prepared.preparationHash
  });
  const delegateHash = hashId("agent_credit_l3_delegate", {
    apiWalletAddressHash: prepared.apiWalletAddressHash,
    signerReferenceHash: prepared.signerReferenceHash,
    runId: prepared.runId
  });
  const actionKind = action.kind === "cancelByCloid"
    ? HypercoreExecutionActionKind.CANCEL_BY_CLOID
    : action.reduceOnly
      ? HypercoreExecutionActionKind.REDUCE_ONLY_ORDER
      : HypercoreExecutionActionKind.ORDER;
  const compiledAction = actionKind === HypercoreExecutionActionKind.CANCEL_BY_CLOID
    ? { assetIndex: action.assetIndex, cloid: action.cloid }
    : {
        assetIndex: action.assetIndex,
        side: action.side,
        limitPx: action.limitPx,
        size: action.size,
        reduceOnly: action.reduceOnly,
        timeInForce: action.timeInForce,
        cloid: `0x${sourceActionHash.slice(2, 34)}`
      };
  const preparedAction = compileHypercoreExecutionAction({
    actionKind,
    action: compiledAction,
    sourceActionHash,
    policyDecisionHash,
    riskSnapshotHash,
    accountBindingHash,
    delegateHash
  });
  const nonce = Date.now();
  const signingRequest = createHypercoreL1SigningRequest({
    preparedAction,
    signerReferenceHash: prepared.signerReferenceHash,
    canonicalAccountAddressHash: prepared.accountAddressHash,
    nonce,
    expiresAfter: nonce + 9_000
  });
  const signed = await signer.sign(signingRequest);
  const body = {
    action: signingRequest.action,
    nonce: signingRequest.nonce,
    signature: signed.signature,
    vaultAddress: null,
    expiresAfter: signingRequest.expiresAfter
  };
  const requestBodyHash = hashId("agent_credit_l3_exchange_body", body);
  runState.version += 1;
  runState.phase = `${phase.toUpperCase()}_SUBMITTING`;
  runState.externalMutationStarted = true;
  runState.submissions.push({
    phase,
    actionKind: preparedAction.actionKind,
    cloid: preparedAction.hyperliquidAction.orders?.[0]?.c ?? action.cloid,
    preparedActionHash: preparedAction.preparedActionHash,
    signingRequestHash: signingRequest.signingRequestHash,
    signatureHash: signed.signatureHash,
    requestBodyHash,
    claimedAt: new Date().toISOString(),
    status: "SUBMITTING",
    retryAllowed: false
  });
  await persistRunState(runStateFile, runState);
  let response;
  try {
    response = await fetchImpl(EXCHANGE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(5_000)
    });
  } catch (error) {
    const current = runState.submissions.at(-1);
    current.status = "UNKNOWN";
    current.errorHash = hashId("agent_credit_l3_exchange_unknown", {
      requestBodyHash,
      errorName: error?.name ?? "Error",
      observedAt: new Date().toISOString()
    });
    runState.version += 1;
    runState.phase = `${phase.toUpperCase()}_UNKNOWN`;
    await persistRunState(runStateFile, runState);
    fail("agent_credit_l3_exchange_unknown", "exchange outcome is UNKNOWN; automatic retry denied");
  }
  const observed = await responseJson(response, "exchange", MAXIMUM_EXCHANGE_RESPONSE_BYTES);
  const normalized = submissionDisposition(observed.value, actionKind);
  const current = runState.submissions.at(-1);
  current.status = normalized.disposition;
  current.order = normalized.order;
  current.responseHash = hashId("agent_credit_l3_exchange_response", {
    requestBodyHash,
    statusCode: observed.statusCode,
    body: observed.value
  });
  current.statusCode = observed.statusCode;
  current.observedAt = new Date().toISOString();
  runState.version += 1;
  runState.phase = `${phase.toUpperCase()}_${normalized.disposition}`;
  await persistRunState(runStateFile, runState);
  return {
    phase,
    cloid: preparedAction.hyperliquidAction.orders?.[0]?.c ?? action.cloid,
    action,
    normalized,
    requestBodyHash,
    signatureHash: signed.signatureHash,
    responseHash: current.responseHash,
    submittedAt: current.claimedAt
  };
}

async function observeUntil({
  fetchImpl,
  account,
  apiWallet,
  startTime,
  predicate,
  attempts = 8
}) {
  let venue;
  for (let index = 0; index < attempts; index += 1) {
    venue = await readVenueState({ fetchImpl, account, apiWallet, startTime });
    if (predicate(venue)) return venue;
    if (index + 1 < attempts) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return venue;
}

function normalizedFill(fill) {
  return {
    oid: Number(fill.oid),
    cloid: fill.cloid ?? null,
    coin: fill.coin,
    side: fill.side,
    direction: fill.dir ?? null,
    price: String(fill.px),
    size: String(fill.sz),
    feeUsd: String(fill.fee ?? "0"),
    closedPnlUsd: String(fill.closedPnl ?? "0"),
    timestampMs: Number(fill.time),
    crossed: fill.crossed === true,
    fillHash: hashId("agent_credit_l3_fill", fill)
  };
}

function selectRunFills(venue, submissions) {
  return venue.fills
    .map((fill) => {
      const submission = submissions.find(({ cloid, normalized }) =>
        fill.cloid === cloid || Number(fill.oid) === normalized.order?.oid
      );
      return submission ? { ...normalizedFill(fill), phase: submission.phase } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

export function calculateAgentCreditL3Settlement(fills) {
  const feeUsd = fills.reduce((sum, fill) => sum + Number(fill.feeUsd), 0);
  const closedPnlUsd = fills.reduce((sum, fill) => sum + Number(fill.closedPnlUsd), 0);
  const realizedPnlUsd = closedPnlUsd - feeUsd;
  const realizedPnlMinor = Math.round(realizedPnlUsd * 100);
  const availableMinor = Math.max(0, Number(PRINCIPAL_MINOR) + realizedPnlMinor);
  const repaymentMinor = Math.min(Number(PRINCIPAL_MINOR), availableMinor);
  const outstandingMinor = Number(PRINCIPAL_MINOR) - repaymentMinor;
  const residualMinor = Math.max(0, availableMinor - repaymentMinor);
  return Object.freeze({
    principalMinor: PRINCIPAL_MINOR,
    closedPnlUsd: closedPnlUsd.toFixed(8),
    feeUsd: feeUsd.toFixed(8),
    realizedPnlUsd: realizedPnlUsd.toFixed(8),
    realizedPnlMinor: String(realizedPnlMinor),
    availableMinor: String(availableMinor),
    repaymentMinor: String(repaymentMinor),
    outstandingMinor: String(outstandingMinor),
    residualMinor: String(residualMinor)
  });
}

export async function executeAgentCreditHyperliquidL3Once({
  cwd,
  preparationFile,
  signerKeyPath,
  runStateFile,
  fetchImpl = fetch,
  env = process.env
}) {
  const prepared = await readJson(preparationFile);
  validatePreparedArtifact(prepared);
  const dryRun = await dryRunAgentCreditHyperliquidL3({
    cwd,
    preparationFile,
    signerKeyPath,
    requireRegistered: true,
    fetchImpl,
    env
  });
  const startTime = Date.now() - 5_000;
  const runState = {
    runId: prepared.runId,
    candidateCommit: prepared.candidateCommit,
    preparationHash: prepared.preparationHash,
    handoffHash: prepared.handoffHash,
    phase: "DRY_RUN_PASS",
    version: 1,
    externalMutationStarted: false,
    submissions: [],
    dryRunHash: hashId("agent_credit_l3_dry_run", dryRun),
    startedAt: new Date().toISOString(),
    automaticRetry: false,
    schemaVersion: "agent_credit_hyperliquid_l3_run_state.v1"
  };
  await persistRunState(runStateFile, runState);
  return withHypercoreIsolatedTestnetSigner(
    signerKeyPath,
    async ({ descriptor, transientApiWalletAddress, signer }) => {
      const apiWallet = canonicalAddress(transientApiWalletAddress, "API wallet");
      const before = await readVenueState({
        fetchImpl,
        account: prepared.account,
        apiWallet,
        startTime
      });
      const openAction = selectBoundedBtcIocAction({
        bestBid: before.market.bestBid,
        bestAsk: before.market.bestAsk,
        side: "buy",
        sizeDecimals: before.market.sizeDecimals,
        maximumNotionalUsd: prepared.maximumNotionalUsd
      });
      const open = await signAndSubmit({
        cwd,
        prepared,
        signerDescriptor: descriptor,
        signer,
        apiWallet,
        phase: "open",
        action: openAction,
        fetchImpl,
        runState,
        runStateFile,
        startTime,
        env
      });
      let observed = await observeUntil({
        fetchImpl,
        account: prepared.account,
        apiWallet,
        startTime,
        predicate: (venue) =>
          Boolean(findBtcPosition(venue)) ||
          venue.orders.some((order) => order.cloid === open.cloid) ||
          selectRunFills(venue, [open]).length > 0 ||
          open.normalized.disposition === "REJECTED"
      });
      const cancellations = [];
      const cancelPending = async (targetCloid) => {
        const pending = observed.orders.find((order) => order.cloid === targetCloid);
        if (!pending) return;
        const cancellation = await signAndSubmit({
          cwd,
          prepared,
          signerDescriptor: descriptor,
          signer,
          apiWallet,
          phase: "cancel",
          action: { kind: "cancelByCloid", assetIndex: 3, cloid: targetCloid },
          fetchImpl,
          runState,
          runStateFile,
          startTime,
          env
        });
        cancellations.push(cancellation);
        observed = await observeUntil({
          fetchImpl,
          account: prepared.account,
          apiWallet,
          startTime,
          predicate: (venue) => !venue.orders.some((order) => order.cloid === targetCloid)
        });
      };
      await cancelPending(open.cloid);
      let positionAfterOpen = findBtcPosition(observed);
      if (!positionAfterOpen && selectRunFills(observed, [open]).length > 0) {
        observed = await observeUntil({
          fetchImpl,
          account: prepared.account,
          apiWallet,
          startTime,
          predicate: (venue) => Boolean(findBtcPosition(venue))
        });
        positionAfterOpen = findBtcPosition(observed);
      }
      let close = null;
      let emergencyClose = null;
      if (positionAfterOpen) {
        const closeAction = selectBoundedBtcIocAction({
          bestBid: observed.market.bestBid,
          bestAsk: observed.market.bestAsk,
          side: Number(positionAfterOpen.szi) > 0 ? "sell" : "buy",
          closeSize: Math.abs(Number(positionAfterOpen.szi)).toString(),
          sizeDecimals: observed.market.sizeDecimals,
          maximumNotionalUsd: prepared.maximumNotionalUsd
        });
        close = await signAndSubmit({
          cwd,
          prepared,
          signerDescriptor: descriptor,
          signer,
          apiWallet,
          phase: "close",
          action: closeAction,
          fetchImpl,
          runState,
          runStateFile,
          startTime,
          env
        });
        observed = await observeUntil({
          fetchImpl,
          account: prepared.account,
          apiWallet,
          startTime,
          predicate: (venue) => !findBtcPosition(venue) && venue.orders.length === 0
        });
        await cancelPending(close.cloid);
        const remaining = findBtcPosition(observed);
        if (remaining) {
          const emergencyAction = selectBoundedBtcIocAction({
            bestBid: observed.market.bestBid,
            bestAsk: observed.market.bestAsk,
            side: Number(remaining.szi) > 0 ? "sell" : "buy",
            closeSize: Math.abs(Number(remaining.szi)).toString(),
            sizeDecimals: observed.market.sizeDecimals,
            maximumNotionalUsd: prepared.maximumNotionalUsd
          });
          emergencyClose = await signAndSubmit({
            cwd,
            prepared,
            signerDescriptor: descriptor,
            signer,
            apiWallet,
            phase: "emergency_close",
            action: emergencyAction,
            fetchImpl,
            runState,
            runStateFile,
            startTime,
            env
          });
          observed = await observeUntil({
            fetchImpl,
            account: prepared.account,
            apiWallet,
            startTime,
            predicate: (venue) => !findBtcPosition(venue) && venue.orders.length === 0
          });
          await cancelPending(emergencyClose.cloid);
        }
      }
      const finalPosition = findBtcPosition(observed);
      const reconciled = !finalPosition && observed.orders.length === 0;
      const submissions = [open, close, emergencyClose].filter(Boolean);
      const fills = selectRunFills(observed, submissions);
      const openFillCount = fills.filter((fill) => fill.phase === "open").length;
      const closeFillCount = fills.filter((fill) =>
        ["close", "emergency_close"].includes(fill.phase)
      ).length;
      const lifecycleProven = reconciled && openFillCount > 0 && closeFillCount > 0;
      const settlement = calculateAgentCreditL3Settlement(fills);
      let repayment = null;
      let finalObligation = prepared.kernel.credit.obligation;
      if (reconciled && Number(settlement.repaymentMinor) > 0) {
        const applied = applyAgentCreditRepayment({
          obligation: prepared.kernel.credit.obligation,
          amountMinor: settlement.repaymentMinor,
          actorId: `actor_agent_credit_l3_controller_${prepared.runId}`,
          now: new Date()
        });
        finalObligation = applied.obligation;
        repayment = {
          repaymentEventId: applied.repayment.repaymentId,
          repaymentHash: applied.repayment.repaymentHash,
          ledgerTransactionId: applied.ledgerTransaction.ledgerTransactionId,
          appliedPrincipalMinor: applied.repayment.appliedPrincipalMinor,
          outstandingPrincipalMinor: applied.obligation.outstandingPrincipalMinor
        };
      }
      const creditState = !reconciled
        ? "RECONCILIATION_BLOCKED"
        : finalObligation.outstandingPrincipalMinor === "0"
          ? "REPAID"
          : "LOSS_OUTSTANDING";
      const evidenceCore = {
        issueId: "AGENT-CREDIT-EXEC-001",
        result: lifecycleProven ? "L3_VERIFIED" : "PARTIAL",
        runId: prepared.runId,
        candidateCommit: prepared.candidateCommit,
        runtimeDiffHash: prepared.runtimeDiffHash,
        runtimeSourceHash: prepared.runtimeSourceHash,
        handoffHash: prepared.handoffHash,
        preparationHash: prepared.preparationHash,
        idempotencyIdentity: prepared.idempotencyIdentity,
        venue: prepared.venue,
        environment: prepared.environment,
        origin: prepared.origin,
        account: prepared.account,
        accountType: prepared.accountType,
        accountAddressHash: prepared.accountAddressHash,
        apiWalletAddress: prepared.apiWalletAddress,
        apiWalletAddressHash: prepared.apiWalletAddressHash,
        signerReference: prepared.signerReference,
        signerReferenceHash: prepared.signerReferenceHash,
        subjectId: prepared.subjectId,
        principalId: prepared.principalId,
        mandateId: prepared.mandateId,
        creditIntentId: prepared.creditIntentId,
        offerId: prepared.offerId,
        obligationId: prepared.obligationId,
        facilityId: prepared.facilityId,
        authorizationId: prepared.authorizationId,
        policyVersion: prepared.policyVersion,
        authorizationVersion: prepared.authorizationVersion,
        approvedEnvelope: {
          market: "BTC",
          maximumNotionalUsd: prepared.maximumNotionalUsd,
          maximumLeverage: 1,
          maximumConcurrentPositions: 1,
          tradeCycles: 1,
          withdrawalAllowed: false,
          transferAllowed: false,
          agentCustodyAllowed: false
        },
        capitalAllocation: {
          semantics: "CONTROLLED_ACCOUNT_ALLOCATION",
          amountMinor: PRINCIPAL_MINOR,
          externalAssetTransfer: false,
          custodyTransferredToAgent: false
        },
        accountEquityBeforeUsd: before.accountValue,
        accountEquityAfterUsd: observed.accountValue,
        positionBefore: positionSummary(before.positions),
        positionObservedAfterOpen: positionAfterOpen
          ? positionSummary([{ position: positionAfterOpen }])[0]
          : null,
        positionAfter: positionSummary(observed.positions),
        open: {
          cloid: open.cloid,
          venueOrderId: open.normalized.order?.oid ?? null,
          disposition: open.normalized.disposition,
          submittedAt: open.submittedAt,
          requestBodyHash: open.requestBodyHash,
          signatureHash: open.signatureHash,
          responseHash: open.responseHash,
          limitPrice: open.action.limitPx,
          size: open.action.size
        },
        close: close ? {
          cloid: close.cloid,
          venueOrderId: close.normalized.order?.oid ?? null,
          disposition: close.normalized.disposition,
          submittedAt: close.submittedAt,
          requestBodyHash: close.requestBodyHash,
          signatureHash: close.signatureHash,
          responseHash: close.responseHash,
          limitPrice: close.action.limitPx,
          size: close.action.size,
          reduceOnly: true
        } : null,
        emergencyClose: emergencyClose ? {
          cloid: emergencyClose.cloid,
          venueOrderId: emergencyClose.normalized.order?.oid ?? null,
          disposition: emergencyClose.normalized.disposition,
          submittedAt: emergencyClose.submittedAt,
          requestBodyHash: emergencyClose.requestBodyHash,
          signatureHash: emergencyClose.signatureHash,
          responseHash: emergencyClose.responseHash,
          size: emergencyClose.action.size,
          reduceOnly: true
        } : null,
        cancellations: cancellations.map((cancellation) => ({
          cloid: cancellation.cloid,
          disposition: cancellation.normalized.disposition,
          submittedAt: cancellation.submittedAt,
          requestBodyHash: cancellation.requestBodyHash,
          signatureHash: cancellation.signatureHash,
          responseHash: cancellation.responseHash
        })),
        fills,
        fillCounts: { open: openFillCount, close: closeFillCount },
        reconciliation: {
          status: reconciled ? "RECONCILED" : "BLOCKED",
          openOrdersCount: observed.orders.length,
          positionsCount: observed.positions.length,
          accountStateHash: observed.hashes.accountStateHash,
          ordersHash: observed.hashes.ordersHash,
          fillsHash: observed.hashes.fillsHash,
          observedAt: observed.observedAt
        },
        settlement,
        repayment: repayment ? {
          ...repayment,
          semantics: "CONTROLLED_ACCOUNT_REPAYMENT_ALLOCATION",
          externalAssetTransfer: false
        } : null,
        obligation: {
          status: finalObligation.status,
          outstandingPrincipalMinor: finalObligation.outstandingPrincipalMinor,
          totalRepaidMinor: finalObligation.totalRepaidMinor
        },
        creditState,
        terminalTruth: {
          realFundsMoved: false,
          mainnetInteraction: false,
          hyperliquidTestnetWrite: true,
          testnetAssetsMoved: fills.length > 0,
          externalFundingTransfer: false,
          signerRegistered: observed.apiWalletRole === "agent",
          l3ActivatedForThisRun: true,
          l3Status: lifecycleProven ? "L3_VERIFIED" : "PARTIAL"
        },
        safety: {
          automaticSecondRun: false,
          automaticRetry: false,
          rawPrivateKeyPersisted: false,
          rawSignaturePersisted: false,
          rawResponsePersisted: false,
          withdrawalsPerformed: false,
          transfersPerformed: false,
          mainnetAuthority: false,
          productionAuthority: false,
          realFundsAuthority: false
        },
        completedAt: new Date().toISOString(),
        schemaVersion: "agent_credit_hyperliquid_l3_evidence.v1"
      };
      const evidenceHash = hashId("agent_credit_hyperliquid_l3_evidence", evidenceCore);
      runState.version += 1;
      runState.phase = evidenceCore.result;
      runState.completedAt = evidenceCore.completedAt;
      runState.evidenceHash = evidenceHash;
      await persistRunState(runStateFile, runState);
      return { evidenceHash, ...evidenceCore };
    }
  );
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (index === process.argv.length - 1 || process.argv.indexOf(name, index + 1) >= 0) {
    fail("agent_credit_l3_cli_invalid", `${name} is invalid`);
  }
  return process.argv[index + 1];
}

async function runCli() {
  const command = process.argv[2];
  const cwd = resolve(argument("--cwd", process.cwd()));
  const signerKeyPath = resolve(argument("--signer-key", ""));
  const preparationFile = privatePath(
    argument("--preparation-file", `${PRIVATE_DIRECTORY}/agent-credit-exec-001-l3-preparation.json`),
    ".json"
  );
  if (command === "prepare") {
    const result = await prepareAgentCreditHyperliquidL3({
      cwd,
      runId: argument("--run-id"),
      candidateCommit: argument("--candidate-commit"),
      account: argument("--account"),
      signerKeyPath,
      preparationFile
    });
    console.log(`AGENT_CREDIT_L3_PREPARED ${JSON.stringify(result)}`);
    return;
  }
  if (command === "dry-run") {
    const result = await dryRunAgentCreditHyperliquidL3({
      cwd,
      preparationFile,
      signerKeyPath,
      requireRegistered: argument("--allow-unregistered", "false") !== "true"
    });
    console.log(`AGENT_CREDIT_L3_DRY_RUN ${JSON.stringify(result)}`);
    return;
  }
  if (command === "run-once") {
    const runStateFile = privatePath(
      argument("--run-state-file", `${PRIVATE_DIRECTORY}/agent-credit-exec-001-l3-run-state.json`),
      ".json"
    );
    const result = await executeAgentCreditHyperliquidL3Once({
      cwd,
      preparationFile,
      signerKeyPath,
      runStateFile
    });
    console.log(`AGENT_CREDIT_L3_ONCE ${JSON.stringify(result)}`);
    return;
  }
  fail("agent_credit_l3_cli_invalid", "command must be prepare, dry-run or run-once");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`AGENT_CREDIT_L3_BLOCKED ${error.code ?? "error"} ${error.message}`);
    process.exitCode = 1;
  });
}
