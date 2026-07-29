export const MOBILE_WALLET_CONNECTOR_SCHEMA_VERSION =
  "mobile_wallet_connector.v1";
export const APPROVED_WALLETCONNECT_PACKAGE =
  "@walletconnect/ethereum-provider";
export const APPROVED_WALLETCONNECT_VERSION = "2.23.10";
export const APPROVED_WALLETCONNECT_ORIGIN = "https://ipo.one";
export const APPROVED_WALLETCONNECT_RELAY_URL =
  "wss://relay.walletconnect.org";
export const MOBILE_WALLET_PROVIDER_ID =
  "walletconnect:mobile-v2.23.10";

const APPROVAL_EXPIRES_AT = "2026-09-22T23:59:59.999Z";
const APPROVED_CHAINS = Object.freeze([84532, 1952]);
const APPROVED_METHODS = Object.freeze([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "personal_sign",
  "eth_signTypedData_v4",
  "eth_sendTransaction"
]);
const APPROVED_PROVIDER_EVENTS = Object.freeze([
  "accountsChanged",
  "chainChanged",
  "connect",
  "disconnect"
]);
const APPROVED_INTERNAL_EVENTS = Object.freeze([
  ...APPROVED_PROVIDER_EVENTS,
  "display_uri",
  "session_event"
]);
const RPC_MAP = Object.freeze({
  84532: "https://sepolia.base.org/",
  1952: "https://testrpc.xlayer.tech/terigon"
});
const CHAIN_PARAMETERS = deepFreeze({
  "0x14a34": {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org/"],
    blockExplorerUrls: ["https://sepolia-explorer.base.org"]
  },
  "0x7a0": {
    chainId: "0x7a0",
    chainName: "X Layer Testnet",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: ["https://testrpc.xlayer.tech/terigon"],
    blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"]
  }
});
const PROJECT_ID = /^[0-9a-fA-F]{32}$/;
const DISPLAY_URI = /^wc:[A-Za-z0-9._~%:@/?&=+-]{1,2045}$/;
const MAXIMUM_STORAGE_KEYS = 256;
const MAXIMUM_STORAGE_VALUE_BYTES = 64 * 1_024;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function exactHttpsOrigin(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError(`${name} must be one exact HTTPS origin`);
  }
  return parsed.origin;
}

function providerLike(value) {
  return value &&
    typeof value === "object" &&
    typeof value.request === "function" &&
    typeof value.connect === "function" &&
    typeof value.disconnect === "function" &&
    typeof value.on === "function" &&
    (
      typeof value.removeListener === "function" ||
      typeof value.off === "function"
    );
}

export function createMemoryOnlyConnectorStorage() {
  const values = new Map();
  let disposed = false;
  function key(value) {
    if (typeof value !== "string" || value.length < 1 || value.length > 512) {
      throw new TypeError("connector storage key is invalid");
    }
    return value;
  }
  function assertAvailable() {
    if (disposed) throw new TypeError("connector storage is disposed");
  }
  function value(input) {
    let serialized;
    try {
      serialized = JSON.stringify(input);
    } catch {
      throw new TypeError("connector storage value is invalid");
    }
    if (
      typeof serialized !== "string" ||
      new TextEncoder().encode(serialized).byteLength >
        MAXIMUM_STORAGE_VALUE_BYTES
    ) {
      throw new TypeError("connector storage value is invalid");
    }
    return JSON.parse(serialized);
  }
  function clone(input) {
    return input === undefined ? undefined : structuredClone(input);
  }
  return Object.freeze({
    async getItem(name) {
      assertAvailable();
      return clone(values.get(key(name)));
    },
    async setItem(name, input) {
      assertAvailable();
      const checkedKey = key(name);
      if (
        !values.has(checkedKey) &&
        values.size >= MAXIMUM_STORAGE_KEYS
      ) {
        throw new TypeError("connector storage key limit exceeded");
      }
      values.set(checkedKey, value(input));
    },
    async removeItem(name) {
      assertAvailable();
      values.delete(key(name));
    },
    async getKeys() {
      assertAvailable();
      return [...values.keys()].sort();
    },
    async getEntries() {
      assertAvailable();
      return [...values.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, entry]) => [name, clone(entry)]);
    },
    async clear() {
      values.clear();
    },
    async dispose() {
      values.clear();
      disposed = true;
    },
    descriptor: deepFreeze({
      schemaVersion: "wallet_connector_storage.v1",
      persistence: "memory_only",
      localStorage: false,
      sessionStorage: false,
      indexedDb: false,
      credentialsIncluded: false,
      telemetryIncluded: false
    })
  });
}

function exactKeys(value, keys) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function checkedParams(method, params) {
  const values = params ?? [];
  if (!Array.isArray(values)) return false;
  if (new Set(["eth_requestAccounts", "eth_accounts", "eth_chainId"]).has(method)) {
    return values.length === 0;
  }
  if (method === "wallet_switchEthereumChain") {
    return values.length === 1 &&
      exactKeys(values[0], ["chainId"]) &&
      Object.hasOwn(CHAIN_PARAMETERS, values[0].chainId);
  }
  if (method === "wallet_addEthereumChain") {
    if (
      values.length !== 1 ||
      !exactKeys(values[0], [
        "chainId",
        "chainName",
        "nativeCurrency",
        "rpcUrls",
        "blockExplorerUrls"
      ])
    ) {
      return false;
    }
    const expected = CHAIN_PARAMETERS[values[0].chainId];
    return expected !== undefined &&
      values[0].chainName === expected.chainName &&
      exactKeys(values[0].nativeCurrency, ["name", "symbol", "decimals"]) &&
      values[0].nativeCurrency.name === expected.nativeCurrency.name &&
      values[0].nativeCurrency.symbol === expected.nativeCurrency.symbol &&
      values[0].nativeCurrency.decimals === expected.nativeCurrency.decimals &&
      JSON.stringify(values[0].rpcUrls) === JSON.stringify(expected.rpcUrls) &&
      JSON.stringify(values[0].blockExplorerUrls) ===
        JSON.stringify(expected.blockExplorerUrls);
  }
  if (method === "personal_sign") {
    return values.length === 2 &&
      typeof values[0] === "string" &&
      values[0].length >= 1 &&
      values[0].length <= 16_384 &&
      typeof values[1] === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(values[1]);
  }
  if (method === "eth_signTypedData_v4") {
    return values.length === 2 &&
      typeof values[0] === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(values[0]) &&
      typeof values[1] === "string" &&
      values[1].length >= 2 &&
      values[1].length <= 64 * 1_024;
  }
  if (method === "eth_sendTransaction") {
    const transaction = values[0];
    return values.length === 1 &&
      exactKeys(transaction, ["from", "to", "data", "value"]) &&
      /^0x[0-9a-fA-F]{40}$/.test(transaction.from ?? "") &&
      /^0x[0-9a-fA-F]{40}$/.test(transaction.to ?? "") &&
      /^0x[0-9a-fA-F]{8,65536}$/.test(transaction.data ?? "") &&
      transaction.value === "0x0";
  }
  return false;
}

function checkedRequest(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !APPROVED_METHODS.includes(input.method) ||
    !checkedParams(input.method, input.params) ||
    Object.keys(input).some((key) => !new Set(["method", "params"]).has(key))
  ) {
    throw Object.assign(
      new Error("WalletConnect method is outside the approved read/sign scope"),
      { code: "wallet_connector_method_denied" }
    );
  }
  return {
    method: input.method,
    ...(input.params === undefined
      ? {}
      : { params: structuredClone(input.params) })
  };
}

function checkedSessionEvent(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !value.params ||
    typeof value.params !== "object" ||
    Array.isArray(value.params) ||
    !value.params.event ||
    typeof value.params.event !== "object" ||
    Array.isArray(value.params.event)
  ) {
    return null;
  }
  const { name, data } = value.params.event;
  return new Set(["accountsChanged", "chainChanged"]).has(name)
    ? { name, data: structuredClone(data) }
    : null;
}

export function createMobileWalletConnector({
  projectId,
  expectedOrigin,
  currentOrigin,
  loadEthereumProvider,
  onDisplayUri = () => {},
  clock = () => new Date()
} = {}) {
  const approvedOrigin = exactHttpsOrigin("expectedOrigin", expectedOrigin);
  const runtimeOrigin = exactHttpsOrigin("currentOrigin", currentOrigin);
  if (
    approvedOrigin !== APPROVED_WALLETCONNECT_ORIGIN ||
    approvedOrigin !== runtimeOrigin ||
    typeof projectId !== "string" ||
    !PROJECT_ID.test(projectId) ||
    typeof loadEthereumProvider !== "function" ||
    typeof onDisplayUri !== "function" ||
    typeof clock !== "function"
  ) {
    throw new TypeError("Mobile wallet connector runtime approval is invalid");
  }
  if (clock().getTime() > new Date(APPROVAL_EXPIRES_AT).getTime()) {
    throw new TypeError("Mobile wallet connector approval has expired");
  }

  const storage = createMemoryOnlyConnectorStorage();
  const listeners = new Map(
    APPROVED_PROVIDER_EVENTS.map((event) => [event, new Set()])
  );
  let provider;
  let cleanup = [];
  let status = "approved_not_initialized";
  let pendingInitialization;
  let disposed = false;

  function snapshot() {
    return deepFreeze({
      schemaVersion: MOBILE_WALLET_CONNECTOR_SCHEMA_VERSION,
      status,
      packageName: APPROVED_WALLETCONNECT_PACKAGE,
      packageVersion: APPROVED_WALLETCONNECT_VERSION,
      providerId: MOBILE_WALLET_PROVIDER_ID,
      chains: [...APPROVED_CHAINS],
      methods: [...APPROVED_METHODS],
      approvalOwner: "IPO.ONE Founder",
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
      storage: "memory_only",
      projectIdPersisted: false,
      pairingPersisted: false,
      credentialsIncluded: false,
      fundsAuthority: false,
      transactionsAllowed: true,
      transactionScope:
        "zero_value_contract_calldata_only"
    });
  }

  function emit(event, value) {
    for (const listener of listeners.get(event) ?? []) {
      listener(structuredClone(value));
    }
  }

  function subscribe(event, listener) {
    provider.on(event, listener);
    cleanup.push(() => {
      const remove = typeof provider.removeListener === "function"
        ? provider.removeListener.bind(provider)
        : provider.off.bind(provider);
      remove(event, listener);
    });
  }

  function bindProviderEvents() {
    for (const event of APPROVED_PROVIDER_EVENTS) {
      subscribe(event, (value) => {
        if (event === "connect") status = "connected";
        if (event === "disconnect") {
          status = "disconnected";
          storage.clear();
        }
        emit(event, value);
      });
    }
    subscribe("display_uri", (value) => {
      if (typeof value === "string" && DISPLAY_URI.test(value)) {
        onDisplayUri(value);
      }
    });
    subscribe("session_event", (value) => {
      const event = checkedSessionEvent(value);
      if (event) emit(event.name, event.data);
    });
  }

  async function initialize() {
    if (disposed) throw new TypeError("Mobile wallet connector is disposed");
    if (provider) return snapshot();
    if (pendingInitialization) return pendingInitialization;
    status = "initializing";
    pendingInitialization = (async () => {
      const loaded = await loadEthereumProvider({
        packageName: APPROVED_WALLETCONNECT_PACKAGE,
        packageVersion: APPROVED_WALLETCONNECT_VERSION,
        storage,
        options: deepFreeze({
          projectId,
          relayUrl: APPROVED_WALLETCONNECT_RELAY_URL,
          optionalChains: [...APPROVED_CHAINS],
          methods: [...APPROVED_METHODS],
          events: ["accountsChanged", "chainChanged"],
          rpcMap: { ...RPC_MAP },
          showQrModal: false
        })
      });
      if (
        !loaded ||
        loaded.packageName !== APPROVED_WALLETCONNECT_PACKAGE ||
        loaded.packageVersion !== APPROVED_WALLETCONNECT_VERSION ||
        loaded.storageApplied !== true ||
        !providerLike(loaded.provider)
      ) {
        throw new TypeError(
          "WalletConnect loader did not prove the approved package and memory-only storage"
        );
      }
      provider = loaded.provider;
      bindProviderEvents();
      status = "ready";
      return snapshot();
    })();
    try {
      return await pendingInitialization;
    } catch (error) {
      status = "unavailable";
      await storage.clear();
      throw error;
    } finally {
      pendingInitialization = undefined;
    }
  }

  const providerFacade = Object.freeze({
    async request(input) {
      if (!provider || disposed) {
        throw new TypeError("Mobile wallet connector is not initialized");
      }
      return provider.request(checkedRequest(input));
    },
    on(event, listener) {
      if (
        !APPROVED_PROVIDER_EVENTS.includes(event) ||
        typeof listener !== "function"
      ) {
        throw new TypeError("Mobile wallet Provider event is not approved");
      }
      listeners.get(event).add(listener);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    }
  });

  async function connect() {
    await initialize();
    const result = await provider.connect();
    status = "connected";
    return structuredClone(result);
  }

  async function disconnect() {
    if (!provider || disposed) return snapshot();
    await provider.disconnect();
    await storage.clear();
    status = "disconnected";
    return snapshot();
  }

  async function dispose() {
    if (disposed) return snapshot();
    for (const remove of cleanup.splice(0)) remove();
    await storage.dispose();
    for (const eventListeners of listeners.values()) eventListeners.clear();
    provider = undefined;
    disposed = true;
    status = "disposed";
    return snapshot();
  }

  return Object.freeze({
    connect,
    descriptor: deepFreeze({
      providerId: MOBILE_WALLET_PROVIDER_ID,
      source: "mobile_walletconnect",
      name: "WalletConnect mobile / QR",
      connectorVersion: APPROVED_WALLETCONNECT_VERSION,
      storage: "memory_only"
    }),
    disconnect,
    dispose,
    getSnapshot: snapshot,
    initialize,
    provider: providerFacade
  });
}
