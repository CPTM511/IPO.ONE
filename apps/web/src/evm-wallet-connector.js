export const EVM_WALLET_CONNECTOR_DESCRIPTOR_SCHEMA_VERSION =
  "evm_wallet_connector_descriptor.v1";
export const EVM_WALLET_CAPABILITIES_SCHEMA_VERSION =
  "evm_wallet_capabilities.v1";

const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_SIGNATURE = /^0x(?:[0-9a-fA-F]{2}){1,4096}$/;
const CAPABILITY_STATUS = Object.freeze({
  SUPPORTED: "supported",
  UNSUPPORTED: "unsupported",
  UNKNOWN: "unknown"
});
const SOURCES = new Set([
  "eip6963",
  "legacy_eip1193",
  "mobile_walletconnect"
]);
const CONTEXT_REASONS = new Set([
  "wallet_account_changed",
  "wallet_chain_changed",
  "wallet_provider_changed",
  "wallet_provider_connected",
  "wallet_provider_disconnected"
]);
const CHAIN_PROFILES = Object.freeze({
  "eip155:84532": Object.freeze({
    chainId: "eip155:84532",
    chainIdHex: "0x14a34",
    name: "Base Sepolia",
    nativeCurrency: Object.freeze({ name: "Ether", symbol: "ETH", decimals: 18 }),
    rpcUrls: Object.freeze(["https://sepolia.base.org/"]),
    blockExplorerUrls: Object.freeze(["https://sepolia-explorer.base.org"]),
    executionEnabled: false,
    sandboxOnly: true,
    productionApproved: false
  }),
  "eip155:1952": Object.freeze({
    chainId: "eip155:1952",
    chainIdHex: "0x7a0",
    name: "X Layer Testnet",
    nativeCurrency: Object.freeze({ name: "OKB", symbol: "OKB", decimals: 18 }),
    rpcUrls: Object.freeze(["https://testrpc.xlayer.tech/terigon"]),
    blockExplorerUrls: Object.freeze(["https://www.okx.com/web3/explorer/xlayer-test"]),
    executionEnabled: false,
    sandboxOnly: true,
    productionApproved: false
  })
});
const CHAIN_BY_HEX = new Map(
  Object.values(CHAIN_PROFILES).map((profile) => [profile.chainIdHex, profile])
);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
function fail(code, message) {
  throw Object.assign(new Error(message), {
    name: "EvmWalletConnectorError",
    code
  });
}

function checkedDescriptor(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !PROVIDER_ID.test(value.providerId ?? "") ||
    !SOURCES.has(value.source) ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 80
  ) {
    fail("invalid_wallet_connector", "Wallet connector descriptor is invalid");
  }
  return deepFreeze({
    schemaVersion: EVM_WALLET_CONNECTOR_DESCRIPTOR_SCHEMA_VERSION,
    providerId: value.providerId,
    source: value.source,
    name: value.name,
    walletTransport: value.source === "mobile_walletconnect"
      ? "walletconnect"
      : "eip1193",
    enabledChains: Object.keys(CHAIN_PROFILES),
    explicitSelectionRequired: true,
    capabilityNegotiated: true,
    rawProviderExposed: false,
    arbitraryCalldataAccepted: false,
    preparedExecutionSubmission: false,
    sandboxOnly: true,
    productionApproved: false,
    fundsAuthority: false
  });
}

function checkedProvider(value) {
  if (
    !value ||
    (typeof value !== "object" && typeof value !== "function") ||
    typeof value.request !== "function"
  ) {
    fail("invalid_wallet_connector", "EIP-1193 provider is invalid");
  }
  return value;
}

function checkedChainId(value) {
  const profile = CHAIN_PROFILES[value];
  if (!profile) {
    fail(
      "wallet_chain_not_enabled",
      "Wallet connector chain is not enabled by the IPO.ONE registry"
    );
  }
  return profile;
}

function chainFromProvider(value) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    fail("wallet_chain_result_invalid", "Wallet returned an invalid chain identifier");
  }
  const normalized = `0x${BigInt(value).toString(16)}`;
  const profile = CHAIN_BY_HEX.get(normalized);
  if (!profile) {
    fail(
      "wallet_chain_not_enabled",
      "Wallet is connected to a chain outside the enabled IPO.ONE registry"
    );
  }
  return profile;
}

function normalizedAddresses(value) {
  if (!Array.isArray(value) || value.length > 16) {
    fail("wallet_accounts_result_invalid", "Wallet returned an invalid account list");
  }
  const addresses = [];
  const seen = new Set();
  for (const address of value) {
    if (typeof address !== "string" || !ADDRESS.test(address)) {
      fail("wallet_accounts_result_invalid", "Wallet returned an invalid EVM account");
    }
    const normalized = address.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      addresses.push(normalized);
    }
  }
  return addresses;
}

function checkedAccountId(value, chainId) {
  if (typeof value !== "string") {
    fail("wallet_account_mismatch", "Wallet account must be one CAIP-10 identifier");
  }
  const prefix = `${chainId}:`;
  const address = value.startsWith(prefix) ? value.slice(prefix.length) : "";
  if (!ADDRESS.test(address)) {
    fail("wallet_account_mismatch", "Wallet account does not match the selected chain");
  }
  return address.toLowerCase();
}

function checkedMessage(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 16_384) {
    fail("wallet_sign_input_invalid", "Wallet message is outside the approved bound");
  }
  return value;
}

function checkedTypedData(value) {
  let serialized;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    fail("wallet_sign_input_invalid", "Wallet typed data is not serializable");
  }
  if (
    typeof serialized !== "string" ||
    serialized.length < 2 ||
    new TextEncoder().encode(serialized).byteLength > 64 * 1_024
  ) {
    fail("wallet_sign_input_invalid", "Wallet typed data is outside the approved bound");
  }
  return serialized;
}

function checkedSignature(value) {
  if (typeof value !== "string" || !HEX_SIGNATURE.test(value)) {
    fail("wallet_signature_result_invalid", "Wallet returned an invalid signature");
  }
  return value;
}

function supported(value) {
  return value === true || (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.supported === true
  );
}

function capabilityDocument(value, chainId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const chainHex = CHAIN_PROFILES[chainId]?.chainIdHex;
  const candidate = value[chainId] ?? value[chainHex] ?? value;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate
    : null;
}

function featureStatus(document, keys, fallback = CAPABILITY_STATUS.UNKNOWN) {
  if (!document) return fallback;
  for (const key of keys) {
    if (Object.hasOwn(document, key)) {
      return supported(document[key])
        ? CAPABILITY_STATUS.SUPPORTED
        : CAPABILITY_STATUS.UNSUPPORTED;
    }
  }
  return fallback;
}

function capabilitySnapshot({ descriptor, chainId, contextEpoch, document, declaredMethods }) {
  const typedDataStatus = declaredMethods.has("eth_signTypedData_v4")
    ? CAPABILITY_STATUS.SUPPORTED
    : CAPABILITY_STATUS.UNKNOWN;
  return deepFreeze({
    schemaVersion: EVM_WALLET_CAPABILITIES_SCHEMA_VERSION,
    providerId: descriptor.providerId,
    chainId,
    contextEpoch,
    walletTransport: descriptor.walletTransport,
    accountType: "unknown",
    signatures: {
      eip712: typedDataStatus,
      erc1271: CAPABILITY_STATUS.UNKNOWN,
      erc6492: CAPABILITY_STATUS.UNKNOWN
    },
    calls: {
      single: featureStatus(document, ["single", "singleCall"]),
      batch: featureStatus(document, ["batch", "batchCalls"]),
      atomicBatch: featureStatus(document, ["atomicBatch", "atomic"])
    },
    delegation: {
      erc7715: featureStatus(document, ["erc7715"]),
      erc7710: featureStatus(document, ["erc7710"]),
      vendorNative: CAPABILITY_STATUS.UNKNOWN
    },
    accountAbstraction: {
      eip7702: featureStatus(document, ["eip7702"]),
      erc4337: featureStatus(document, ["erc4337"]),
      vendorNative: CAPABILITY_STATUS.UNKNOWN
    },
    humanStepUp: {
      wallet: featureStatus(document, ["humanStepUp", "walletStepUp"]),
      mobile: descriptor.walletTransport === "walletconnect"
        ? CAPABILITY_STATUS.SUPPORTED
        : CAPABILITY_STATUS.UNKNOWN,
      email: CAPABILITY_STATUS.UNKNOWN,
      external: CAPABILITY_STATUS.UNKNOWN
    },
    walletSimulation: featureStatus(document, ["walletSimulation", "simulation"]),
    walletThreatScreening: featureStatus(document, ["walletThreatScreening", "threatScreening"]),
    unknownIsNonPermissive: true,
    authorizationGranted: false,
    preparedExecutionAvailable: false,
    fundsAuthority: false
  });
}

export function createEvmWalletConnector({
  descriptor: descriptorInput,
  provider: providerInput,
  connectProvider,
  disconnectProvider,
  declaredMethods = []
} = {}) {
  const descriptor = checkedDescriptor(descriptorInput);
  const provider = checkedProvider(providerInput);
  if (
    (connectProvider !== undefined && typeof connectProvider !== "function") ||
    (disconnectProvider !== undefined && typeof disconnectProvider !== "function") ||
    !Array.isArray(declaredMethods) ||
    declaredMethods.some((method) => typeof method !== "string")
  ) {
    fail("invalid_wallet_connector", "Wallet connector lifecycle is invalid");
  }
  const declaredMethodSet = new Set(declaredMethods);
  const listeners = new Map([
    ["account", new Set()],
    ["chain", new Set()],
    ["disconnect", new Set()]
  ]);
  const cleanup = [];
  let contextEpoch = 0;
  let contextReason = "wallet_provider_connected";
  let disposed = false;

  function contextSnapshot() {
    return deepFreeze({
      schemaVersion: "evm_wallet_context.v1",
      providerId: descriptor.providerId,
      contextEpoch,
      reason: contextReason,
      preparedWorkValid: !disposed,
      fundsAuthority: false
    });
  }

  function invalidateContext(reason) {
    if (!CONTEXT_REASONS.has(reason)) {
      fail("wallet_context_reason_invalid", "Wallet context reason is invalid");
    }
    contextEpoch += 1;
    contextReason = reason;
    return contextSnapshot();
  }

  function notify(kind, reason, value) {
    const context = invalidateContext(reason);
    for (const listener of listeners.get(kind) ?? []) {
      listener(deepFreeze({
        schemaVersion: "evm_wallet_context_change.v1",
        type: kind,
        value: structuredClone(value),
        context
      }));
    }
  }

  function bindProviderEvent(event, kind, reason) {
    if (typeof provider.on !== "function") return;
    const listener = (value) => notify(kind, reason, value);
    provider.on(event, listener);
    cleanup.push(() => {
      if (typeof provider.removeListener === "function") {
        provider.removeListener(event, listener);
      } else if (typeof provider.off === "function") {
        provider.off(event, listener);
      }
    });
  }

  bindProviderEvent("accountsChanged", "account", "wallet_account_changed");
  bindProviderEvent("chainChanged", "chain", "wallet_chain_changed");
  bindProviderEvent("disconnect", "disconnect", "wallet_provider_disconnected");

  function assertAvailable() {
    if (disposed) fail("wallet_connector_disposed", "Wallet connector is disposed");
  }

  async function rawAccounts({ requestAccess = false } = {}) {
    assertAvailable();
    if (typeof requestAccess !== "boolean") {
      fail("wallet_accounts_input_invalid", "Wallet account request is invalid");
    }
    return normalizedAddresses(await provider.request({
      method: requestAccess ? "eth_requestAccounts" : "eth_accounts"
    }));
  }

  async function getChain() {
    assertAvailable();
    const profile = chainFromProvider(await provider.request({ method: "eth_chainId" }));
    return deepFreeze({
      schemaVersion: "evm_wallet_chain.v1",
      providerId: descriptor.providerId,
      chainId: profile.chainId,
      contextEpoch,
      sandboxOnly: true,
      productionApproved: false,
      fundsAuthority: false
    });
  }

  async function getAccounts(options) {
    const chain = await getChain();
    const addresses = await rawAccounts(options);
    return deepFreeze({
      schemaVersion: "evm_wallet_accounts.v1",
      providerId: descriptor.providerId,
      chainId: chain.chainId,
      contextEpoch,
      accounts: addresses.map((address) => ({
        address,
        accountId: `${chain.chainId}:${address}`
      })),
      fundsAuthority: false
    });
  }

  async function switchChain(chainId) {
    assertAvailable();
    const profile = checkedChainId(chainId);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: profile.chainIdHex }]
      });
    } catch (error) {
      if (Number(error?.code) !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: profile.chainIdHex,
          chainName: profile.name,
          nativeCurrency: { ...profile.nativeCurrency },
          rpcUrls: [...profile.rpcUrls],
          blockExplorerUrls: [...profile.blockExplorerUrls]
        }]
      });
    }
    const current = await getChain();
    if (current.chainId !== chainId) {
      fail("wallet_chain_switch_failed", "Wallet did not switch to the requested chain");
    }
    return current;
  }

  async function connect({ chainId } = {}) {
    assertAvailable();
    const profile = checkedChainId(chainId);
    if (connectProvider) await connectProvider();
    const addresses = await rawAccounts({ requestAccess: true });
    if (addresses.length === 0) {
      fail("wallet_account_unavailable", "Wallet returned no account");
    }
    await switchChain(profile.chainId);
    const accounts = await getAccounts();
    invalidateContext("wallet_provider_connected");
    return deepFreeze({
      schemaVersion: "evm_wallet_connection.v1",
      providerId: descriptor.providerId,
      chainId: accounts.chainId,
      accounts: accounts.accounts,
      contextEpoch,
      authorityGranted: false,
      fundsAuthority: false
    });
  }

  async function getCapabilities({ accountId } = {}) {
    const chain = await getChain();
    let address;
    if (accountId !== undefined) address = checkedAccountId(accountId, chain.chainId);
    let document;
    try {
      document = capabilityDocument(await provider.request({
        method: "wallet_getCapabilities",
        params: address === undefined ? [] : [address]
      }), chain.chainId);
    } catch {
      document = null;
    }
    return capabilitySnapshot({
      descriptor,
      chainId: chain.chainId,
      contextEpoch,
      document,
      declaredMethods: declaredMethodSet
    });
  }

  async function assertCurrentAccount(accountId) {
    const accounts = await getAccounts();
    const address = checkedAccountId(accountId, accounts.chainId);
    if (!accounts.accounts.some((account) => account.address === address)) {
      fail("wallet_account_mismatch", "Wallet no longer exposes the requested account");
    }
    return { accounts, address };
  }

  async function signMessage({ accountId, message } = {}) {
    const { address } = await assertCurrentAccount(accountId);
    return checkedSignature(await provider.request({
      method: "personal_sign",
      params: [checkedMessage(message), address]
    }));
  }

  async function signTypedData({ accountId, typedData } = {}) {
    const { address } = await assertCurrentAccount(accountId);
    return checkedSignature(await provider.request({
      method: "eth_signTypedData_v4",
      params: [address, checkedTypedData(typedData)]
    }));
  }

  async function submitPreparedExecution() {
    assertAvailable();
    fail(
      "prepared_execution_contract_unavailable",
      "Prepared execution requires the separately reviewed EXEC-002 preflight contract"
    );
  }

  function subscribe(kind, listener) {
    assertAvailable();
    if (!listeners.has(kind) || typeof listener !== "function") {
      fail("wallet_subscription_invalid", "Wallet connector subscription is invalid");
    }
    listeners.get(kind).add(listener);
    return Object.freeze(() => listeners.get(kind)?.delete(listener));
  }

  function assertContextEpoch(expectedEpoch) {
    if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch !== contextEpoch) {
      fail("wallet_context_changed", "Wallet context changed; prepare fresh work");
    }
    return contextSnapshot();
  }

  async function disconnect({ revokePermissions = false } = {}) {
    assertAvailable();
    if (typeof revokePermissions !== "boolean") {
      fail("wallet_disconnect_invalid", "Wallet disconnect request is invalid");
    }
    let status = "app_state_cleared";
    if (disconnectProvider) {
      await disconnectProvider();
      status = "wallet_disconnected";
    } else if (revokePermissions) {
      try {
        await provider.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }]
        });
        status = "account_permission_revoked";
      } catch {
        status = "app_state_cleared";
      }
    }
    invalidateContext("wallet_provider_disconnected");
    return deepFreeze({
      schemaVersion: "evm_wallet_disconnect.v1",
      providerId: descriptor.providerId,
      status,
      contextEpoch,
      fundsAuthority: false
    });
  }

  function dispose() {
    if (disposed) return contextSnapshot();
    for (const remove of cleanup.splice(0)) remove();
    for (const values of listeners.values()) values.clear();
    invalidateContext("wallet_provider_disconnected");
    disposed = true;
    return contextSnapshot();
  }

  return Object.freeze({
    assertContextEpoch,
    captureContext: contextSnapshot,
    connect,
    descriptor: () => descriptor,
    disconnect,
    dispose,
    getAccounts,
    getCapabilities,
    getChain,
    invalidateContext,
    signMessage,
    signTypedData,
    submitPreparedExecution,
    subscribeAccountChanges: (listener) => subscribe("account", listener),
    subscribeChainChanges: (listener) => subscribe("chain", listener),
    subscribeDisconnect: (listener) => subscribe("disconnect", listener),
    switchChain
  });
}

export function describeEvmWalletConnectorBoundary() {
  return deepFreeze({
    schemaVersion: "evm_wallet_connector_boundary.v1",
    enabledChains: Object.keys(CHAIN_PROFILES),
    walletTransports: ["eip1193", "walletconnect"],
    capabilityStatuses: Object.values(CAPABILITY_STATUS),
    rawProviderExposed: false,
    arbitraryCalldataAccepted: false,
    preparedExecutionAvailable: false,
    transactionsAllowed: false,
    externalCallsPerformedByBoundary: false,
    productionApproved: false,
    fundsAuthority: false
  });
}
