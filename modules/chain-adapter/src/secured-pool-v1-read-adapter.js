import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi
} from "viem";
import { DomainError } from "../../../packages/domain/src/index.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const RPC_HEX = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const RPC_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
const ACCOUNT_REF = /^eip155:84532:(0x[0-9a-fA-F]{40})$/;
const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 5_000;

const POOL_READ_ABI = parseAbi([
  "function marketId() view returns (bytes32)",
  "function marketChainId() view returns (uint256)",
  "function debtAsset() view returns (address)",
  "function collateralAsset() view returns (address)",
  "function priceOracle() view returns (address)",
  "function oracleSourceId() view returns (bytes32)",
  "function marketDebtCapAssets() view returns (uint256)",
  "function borrowerDebtCapAssets() view returns (uint256)",
  "function loanToValueBps() view returns (uint16)",
  "function LIQUIDATION_THRESHOLD_BPS() view returns (uint256)",
  "function pauseGuardian() view returns (address)",
  "function recoveryAuthority() view returns (address)",
  "function cashAssets() view returns (uint256)",
  "function grossDebtAssets() view returns (uint256)",
  "function reservesAssets() view returns (uint256)",
  "function badDebtAssets() view returns (uint256)",
  "function totalSupplyShares() view returns (uint256)",
  "function totalDebtShares() view returns (uint256)",
  "function lastAccruedAt() view returns (uint256)",
  "function acceptedPriceUsdWad() view returns (uint256)",
  "function acceptedOracleObservedAt() view returns (uint64)",
  "function acceptedOracleRoundId() view returns (uint80)",
  "function oracleDeviationHalted() view returns (bool)",
  "function newRiskPaused() view returns (bool)",
  "function position(address account) view returns ((uint256 supplyShares, uint256 collateralAssets, uint256 debtShares, uint256 supplyClaimAssets, uint256 performingDebtAssets, uint256 badDebtAssets, uint256 totalOutstandingDebtAssets))"
]);

const ORACLE_READ_ABI = parseAbi([
  "function marketChainId() view returns (uint256)",
  "function asset() view returns (address)",
  "function feed() view returns (address)",
  "function sourceId() view returns (bytes32)",
  "function feedDecimals() view returns (uint8)"
]);

const POOL_READS = Object.freeze([
  "marketId", "marketChainId", "debtAsset", "collateralAsset", "priceOracle",
  "oracleSourceId", "marketDebtCapAssets", "borrowerDebtCapAssets", "loanToValueBps",
  "LIQUIDATION_THRESHOLD_BPS", "pauseGuardian", "recoveryAuthority", "cashAssets",
  "grossDebtAssets", "reservesAssets", "badDebtAssets", "totalSupplyShares",
  "totalDebtShares", "lastAccruedAt", "acceptedPriceUsdWad", "acceptedOracleObservedAt",
  "acceptedOracleRoundId", "oracleDeviationHalted", "newRiskPaused"
]);
const ORACLE_READS = Object.freeze([
  "marketChainId", "asset", "feed", "sourceId", "feedDecimals"
]);

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function address(name, value) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail("invalid_secured_pool_read_profile", `${name} must be an EVM address`);
  }
  return getAddress(value);
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_secured_pool_read_profile", `${name} must be a 32-byte hash`);
  }
  return value.toLowerCase();
}

function decimal(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value !== "bigint" || value < 0n) {
    fail("secured_pool_rpc_response_invalid", "Pool RPC returned an invalid unsigned value");
  }
  return value.toString();
}

function normalizedAddress(value) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail("secured_pool_rpc_response_invalid", "Pool RPC returned an invalid address");
  }
  return getAddress(value).toLowerCase();
}

function normalizedHash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("secured_pool_rpc_response_invalid", `Pool RPC returned an invalid ${name} hash`);
  }
  return value.toLowerCase();
}

function exactProfile(profile) {
  if (
    !profile || typeof profile !== "object" || Array.isArray(profile) ||
    profile.chainId !== "eip155:84532" || profile.marketCount !== 1 ||
    profile.realValueClassification !== "test_assets_only" ||
    typeof profile.deploymentApprovalRef !== "string" ||
    typeof profile.oracleSource !== "string" || profile.oracleSource.length === 0
  ) fail("invalid_secured_pool_read_profile", "The exact Base Sepolia Pool profile is invalid");
  return Object.freeze({
    ...profile,
    poolContract: address("poolContract", profile.poolContract),
    oracleAddress: address("oracleAddress", profile.oracleAddress),
    wethCollateral: address("wethCollateral", profile.wethCollateral),
    testUsdcDebt: address("testUsdcDebt", profile.testUsdcDebt),
    poolBytecodeHash: hash("poolBytecodeHash", profile.poolBytecodeHash),
    configurationHash: hash("configurationHash", profile.configurationHash)
  });
}

function exactProviders(providers) {
  if (
    !Array.isArray(providers) || providers.length !== 2 ||
    providers.map(({ providerSlot }) => providerSlot).join("|") !== "primary|secondary"
  ) fail("invalid_secured_pool_read_profile", "Exactly two ordered approved RPC slots are required");
  return Object.freeze(providers.map(({ providerSlot, rpcUrl }) => {
    let parsed;
    try {
      parsed = new URL(rpcUrl);
    } catch {
      fail("invalid_secured_pool_read_profile", "Approved Pool RPC URL is invalid");
    }
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash
    ) fail("invalid_secured_pool_read_profile", "Approved Pool RPC must be one closed HTTPS endpoint");
    return Object.freeze({ providerSlot, rpcUrl: parsed.href });
  }));
}

function callDescriptor({ key, address: contractAddress, abi, functionName, args = [] }) {
  return Object.freeze({
    key,
    address: contractAddress,
    abi,
    functionName,
    args,
    data: encodeFunctionData({ abi, functionName, args })
  });
}

function rpcError(message) {
  return new DomainError("secured_pool_rpc_unavailable", message);
}

async function postRpc(fetchImpl, rpcUrl, body, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw rpcError("Approved Base Sepolia RPC request failed");
  }
  if (!response?.ok) throw rpcError("Approved Base Sepolia RPC returned an HTTP error");
  try {
    return await response.json();
  } catch {
    throw rpcError("Approved Base Sepolia RPC returned invalid JSON");
  }
}

function rpcResult(value, id, { allowMissingId = false } = {}) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    value.jsonrpc !== "2.0" ||
    (value.id !== id && !(allowMissingId && value.id === undefined)) ||
    value.error !== undefined
  ) throw rpcError("Approved Base Sepolia RPC returned an invalid result envelope");
  return value.result;
}

function decodeCall(descriptor, result) {
  if (typeof result !== "string" || !RPC_DATA.test(result) || result === "0x") {
    throw rpcError("Approved Base Sepolia RPC returned invalid contract data");
  }
  try {
    return decodeFunctionResult({
      abi: descriptor.abi,
      functionName: descriptor.functionName,
      data: result
    });
  } catch {
    throw rpcError("Approved Base Sepolia RPC response did not match the closed read ABI");
  }
}

function stateFrom(values, profile) {
  const chainId = decimal(values.marketChainId);
  const debtAsset = normalizedAddress(values.debtAsset);
  const collateralAsset = normalizedAddress(values.collateralAsset);
  const priceOracle = normalizedAddress(values.priceOracle);
  const oracleSourceId = normalizedHash("oracleSourceId", values.oracleSourceId);
  const oracleMarketChainId = decimal(values.oracleAdapterMarketChainId);
  const oracleAsset = normalizedAddress(values.oracleAdapterAsset);
  const oracleSource = normalizedHash("oracleAdapterSourceId", values.oracleAdapterSourceId);
  const poolContract = profile.poolContract.toLowerCase();
  const expectedSource = keccak256(new TextEncoder().encode(profile.oracleSource));
  const configurationHash = keccak256(encodeAbiParameters(
    [
      { type: "uint256" }, { type: "address" }, { type: "address" },
      { type: "address" }, { type: "address" }, { type: "bytes32" },
      { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
      { type: "address" }, { type: "address" }
    ],
    [
      values.marketChainId, values.debtAsset, values.collateralAsset,
      values.oracleAdapterFeed, values.priceOracle, values.oracleSourceId,
      values.marketDebtCapAssets, values.borrowerDebtCapAssets, values.loanToValueBps,
      values.pauseGuardian, values.recoveryAuthority
    ]
  ));
  if (
    chainId !== "84532" || oracleMarketChainId !== "84532" ||
    debtAsset !== profile.testUsdcDebt.toLowerCase() ||
    collateralAsset !== profile.wethCollateral.toLowerCase() ||
    priceOracle !== profile.oracleAddress.toLowerCase() ||
    oracleAsset !== profile.wethCollateral.toLowerCase() ||
    oracleSourceId !== expectedSource || oracleSource !== expectedSource ||
    Number(values.oracleAdapterFeedDecimals) !== 8 ||
    configurationHash !== profile.configurationHash
  ) fail("secured_pool_exact_profile_mismatch", "Live Pool configuration does not match the approved exact profile");
  const grossDebt = values.grossDebtAssets;
  const badDebt = values.badDebtAssets;
  if (badDebt > grossDebt) {
    fail("secured_pool_rpc_response_invalid", "Live Pool accounting is internally inconsistent");
  }
  return Object.freeze({
    schemaVersion: "secured_pool_live_state.v1",
    chainId: profile.chainId,
    contractAddress: poolContract,
    marketId: normalizedHash("marketId", values.marketId),
    initialized: true,
    configuration: Object.freeze({
      chainId,
      debtAsset,
      collateralAsset,
      priceOracle,
      oracleSourceId,
      marketDebtCapAssets: decimal(values.marketDebtCapAssets),
      borrowerDebtCapAssets: decimal(values.borrowerDebtCapAssets),
      loanToValueBps: decimal(values.loanToValueBps),
      liquidationThresholdBps: decimal(values.LIQUIDATION_THRESHOLD_BPS),
      pauseGuardian: normalizedAddress(values.pauseGuardian),
      recoveryAuthority: normalizedAddress(values.recoveryAuthority)
    }),
    cashAssets: decimal(values.cashAssets),
    grossDebtAssets: decimal(grossDebt),
    reservesAssets: decimal(values.reservesAssets),
    badDebtAssets: decimal(badDebt),
    totalSupplyShares: decimal(values.totalSupplyShares),
    totalDebtShares: decimal(values.totalDebtShares),
    lastAccruedAt: decimal(values.lastAccruedAt),
    acceptedPriceUsdWad: decimal(values.acceptedPriceUsdWad),
    acceptedOracleObservedAt: decimal(values.acceptedOracleObservedAt),
    acceptedOracleRoundId: decimal(values.acceptedOracleRoundId),
    oracleDeviationHalted: values.oracleDeviationHalted === true,
    newRiskPaused: values.newRiskPaused === true
  });
}

function positionFrom(value) {
  if (!value) return null;
  return Object.freeze({
    supplyShares: decimal(value.supplyShares ?? value[0]),
    collateralAssets: decimal(value.collateralAssets ?? value[1]),
    debtShares: decimal(value.debtShares ?? value[2]),
    supplyClaimAssets: decimal(value.supplyClaimAssets ?? value[3]),
    debtAssets: decimal(value.performingDebtAssets ?? value[4]),
    badDebtAssets: decimal(value.badDebtAssets ?? value[5]),
    totalOutstandingDebtAssets: decimal(value.totalOutstandingDebtAssets ?? value[6])
  });
}

async function readProvider({ fetchImpl, profile, provider, account, timeoutMs, clock }) {
  const blockEnvelope = await postRpc(fetchImpl, provider.rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBlockByNumber",
    params: ["safe", false]
  }, timeoutMs);
  const block = rpcResult(blockEnvelope, 1, { allowMissingId: true });
  if (
    !block || typeof block !== "object" || Array.isArray(block) ||
    !RPC_HEX.test(block.number ?? "") || !RPC_HEX.test(block.timestamp ?? "")
  ) throw rpcError("Approved Base Sepolia RPC did not return one safe block");

  const poolAddress = profile.poolContract;
  const oracleAddress = profile.oracleAddress;
  const descriptors = [
    ...POOL_READS.map((functionName) => callDescriptor({
      key: functionName,
      address: poolAddress,
      abi: POOL_READ_ABI,
      functionName
    })),
    ...ORACLE_READS.map((functionName) => callDescriptor({
      key: `oracleAdapter${functionName[0].toUpperCase()}${functionName.slice(1)}`,
      address: oracleAddress,
      abi: ORACLE_READ_ABI,
      functionName
    })),
    ...(account ? [callDescriptor({
      key: "position",
      address: poolAddress,
      abi: POOL_READ_ABI,
      functionName: "position",
      args: [account]
    })] : [])
  ];
  const codeId = 2;
  const payload = [
    {
      jsonrpc: "2.0",
      id: codeId,
      method: "eth_getCode",
      params: [poolAddress, block.number]
    },
    ...descriptors.map((descriptor, index) => ({
      jsonrpc: "2.0",
      id: index + 3,
      method: "eth_call",
      params: [{ to: descriptor.address, data: descriptor.data }, block.number]
    }))
  ];
  const batch = await postRpc(fetchImpl, provider.rpcUrl, payload, timeoutMs);
  if (!Array.isArray(batch) || batch.length !== payload.length) {
    throw rpcError("Approved Base Sepolia RPC batch response is incomplete");
  }
  const byId = new Map(batch.map((entry) => [entry?.id, entry]));
  const bytecode = rpcResult(byId.get(codeId), codeId);
  if (typeof bytecode !== "string" || !RPC_DATA.test(bytecode) || bytecode === "0x") {
    throw rpcError("The approved Pool bytecode is unavailable at the safe block");
  }
  if (keccak256(bytecode) !== profile.poolBytecodeHash) {
    fail("secured_pool_exact_profile_mismatch", "Live Pool bytecode does not match the approved exact profile");
  }
  const values = {};
  for (const [index, descriptor] of descriptors.entries()) {
    const id = index + 3;
    values[descriptor.key] = decodeCall(descriptor, rpcResult(byId.get(id), id));
  }
  const state = stateFrom(values, profile);
  const observedAt = clock().toISOString();
  return Object.freeze({
    deployment: Object.freeze({
      state: "verified",
      chainId: profile.chainId,
      contractAddress: profile.poolContract,
      bytecodeHash: profile.poolBytecodeHash,
      configurationHash: profile.configurationHash,
      deploymentApprovalRef: profile.deploymentApprovalRef,
      testAssetsOnly: true
    }),
    rpc: Object.freeze({
      state: "available",
      providerSlot: provider.providerSlot,
      blockNumber: BigInt(block.number).toString(),
      blockTimestamp: new Date(Number(BigInt(block.timestamp)) * 1_000).toISOString(),
      observedAt
    }),
    state,
    position: account ? positionFrom(values.position) : null,
    readOnly: true,
    transactionPrimitivePresent: false,
    productionFundsMoved: false,
    schemaVersion: "secured_pool_live_read.v1"
  });
}

export function accountFromPoolBinding(accountIdRef) {
  const match = typeof accountIdRef === "string" ? accountIdRef.match(ACCOUNT_REF) : null;
  return match ? getAddress(match[1]) : null;
}

export function createSecuredPoolV1ReadAdapter({
  deploymentProfile,
  providers,
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const profile = exactProfile(deploymentProfile);
  const approvedProviders = exactProviders(providers);
  if (
    typeof fetchImpl !== "function" || typeof clock !== "function" ||
    !Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 60_000 ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 15_000
  ) fail("invalid_secured_pool_read_profile", "Pool read adapter runtime configuration is invalid");

  const cache = new Map();
  const inFlight = new Map();
  async function load(account) {
    const failures = [];
    for (const provider of approvedProviders) {
      try {
        return await readProvider({
          fetchImpl,
          profile,
          provider,
          account,
          timeoutMs,
          clock
        });
      } catch (error) {
        failures.push(Object.freeze({
          code: error?.code ?? "secured_pool_rpc_unavailable",
          message: typeof error?.message === "string"
            ? error.message.slice(0, 240)
            : "Pool read failed"
        }));
      }
    }
    fail(
      failures.some(({ code }) => code === "secured_pool_exact_profile_mismatch")
        ? "secured_pool_exact_profile_mismatch"
        : "secured_pool_rpc_unavailable",
      "The exact Base Sepolia Pool could not be verified through either approved RPC slot",
      {
        providerAttempts: failures.length,
        providerFailureCodes: failures.map(({ code }) => code),
        providerFailureMessages: failures.map(({ message }) => message)
      }
    );
  }

  return Object.freeze({
    descriptor: Object.freeze({
      chainId: profile.chainId,
      contractAddress: profile.poolContract,
      providerSlots: Object.freeze(approvedProviders.map(({ providerSlot }) => providerSlot)),
      readOnly: true,
      transactionPrimitivePresent: false,
      schemaVersion: "secured_pool_v1_read_adapter.v1"
    }),
    async readSnapshot({ account } = {}) {
      const normalizedAccount = account === undefined || account === null
        ? null
        : address("account", account);
      const key = normalizedAccount?.toLowerCase() ?? "market";
      const now = clock().getTime();
      const cached = cache.get(key);
      if (cached && now - cached.cachedAt <= cacheTtlMs) return cached.value;
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = load(normalizedAccount).then((value) => {
        cache.set(key, { cachedAt: clock().getTime(), value });
        return value;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    }
  });
}
