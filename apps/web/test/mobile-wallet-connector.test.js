import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVED_WALLETCONNECT_PACKAGE,
  APPROVED_WALLETCONNECT_ORIGIN,
  APPROVED_WALLETCONNECT_RELAY_URL,
  APPROVED_WALLETCONNECT_VERSION,
  MOBILE_WALLET_PROVIDER_ID,
  createMemoryOnlyConnectorStorage,
  createMobileWalletConnector
} from "../src/mobile-wallet-connector.js";
import {
  createApprovedWalletConnectLoader
} from "../src/walletconnect-ethereum-provider-loader.js";
import { createWalletAuthorityLifecycle } from "../src/wallet-authority-lifecycle.js";
import { createWalletProviderRegistry } from "../src/wallet-provider-registry.js";

const NOW = new Date("2026-07-23T08:00:00.000Z");
const PROJECT_ID = "a".repeat(32);

function fakeProvider() {
  const listeners = new Map();
  const requests = [];
  function emit(event, value) {
    for (const listener of listeners.get(event) ?? []) listener(value);
  }
  return {
    requests,
    async connect() {
      emit("connect", { chainId: "eip155:84532" });
      return { uri: "redacted" };
    },
    async disconnect() {
      emit("disconnect", { code: 4_900 });
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    async request(input) {
      requests.push(structuredClone(input));
      if (input.method === "eth_accounts") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      return null;
    },
    emit
  };
}

function connectorFixture() {
  const provider = fakeProvider();
  const loads = [];
  const displayUris = [];
  const connector = createMobileWalletConnector({
    projectId: PROJECT_ID,
    expectedOrigin: APPROVED_WALLETCONNECT_ORIGIN,
    currentOrigin: APPROVED_WALLETCONNECT_ORIGIN,
    clock: () => NOW,
    onDisplayUri(uri) {
      displayUris.push(uri);
    },
    async loadEthereumProvider(input) {
      loads.push(input);
      return {
        packageName: input.packageName,
        packageVersion: input.packageVersion,
        storageApplied: true,
        provider
      };
    }
  });
  return { connector, displayUris, loads, provider };
}

test("mobile connector rejects origin drift, invalid Project ID, and expired approval", () => {
  for (const input of [
    {
      projectId: PROJECT_ID,
      expectedOrigin: APPROVED_WALLETCONNECT_ORIGIN,
      currentOrigin: "https://attacker.example"
    },
    {
      projectId: PROJECT_ID,
      expectedOrigin: "https://pilot.ipo.one",
      currentOrigin: "https://pilot.ipo.one"
    },
    {
      projectId: "not-a-project-id",
      expectedOrigin: APPROVED_WALLETCONNECT_ORIGIN,
      currentOrigin: APPROVED_WALLETCONNECT_ORIGIN
    },
    {
      projectId: PROJECT_ID,
      expectedOrigin: APPROVED_WALLETCONNECT_ORIGIN,
      currentOrigin: APPROVED_WALLETCONNECT_ORIGIN,
      clock: () => new Date("2026-09-23T00:00:00.000Z")
    }
  ]) {
    assert.throws(
      () => createMobileWalletConnector({
        loadEthereumProvider: async () => {},
        ...input
      }),
      /invalid|expired/
    );
  }
});

test("initialization proves exact package, fixed Testnets/methods, and memory-only storage", async () => {
  const fixture = connectorFixture();
  const before = fixture.connector.getSnapshot();
  assert.equal(before.status, "approved_not_initialized");
  assert.equal(JSON.stringify(before).includes(PROJECT_ID), false);

  const initialized = await fixture.connector.initialize();
  assert.equal(initialized.status, "ready");
  assert.equal(fixture.loads.length, 1);
  const load = fixture.loads[0];
  assert.equal(load.packageName, APPROVED_WALLETCONNECT_PACKAGE);
  assert.equal(load.packageVersion, APPROVED_WALLETCONNECT_VERSION);
  assert.equal(load.options.relayUrl, APPROVED_WALLETCONNECT_RELAY_URL);
  assert.deepEqual(load.options.optionalChains, [84532, 1952]);
  assert.deepEqual(load.options.rpcMap, {
    84532: "https://sepolia.base.org/",
    1952: "https://testrpc.xlayer.tech/terigon"
  });
  assert.equal(load.options.methods.includes("eth_sendTransaction"), true);
  assert.equal(load.options.methods.includes("personal_sign"), true);
  assert.equal(load.options.methods.includes("eth_signTypedData_v4"), true);
  assert.equal(load.options.showQrModal, false);
  assert.equal(load.storage.descriptor.persistence, "memory_only");
  assert.equal(load.storage.descriptor.localStorage, false);
  assert.equal(load.storage.descriptor.sessionStorage, false);
  assert.equal(load.storage.descriptor.indexedDb, false);
  assert.equal(initialized.projectIdPersisted, false);
  assert.equal(initialized.pairingPersisted, false);
  assert.equal(initialized.transactionsAllowed, true);
  assert.equal(
    initialized.transactionScope,
    "zero_value_contract_calldata_only"
  );
  assert.equal(initialized.fundsAuthority, false);
});

test("loader must attest exact version and actual memory storage application", async () => {
  for (const loaded of [
    {
      packageName: APPROVED_WALLETCONNECT_PACKAGE,
      packageVersion: "2.23.9",
      storageApplied: true,
      provider: fakeProvider()
    },
    {
      packageName: APPROVED_WALLETCONNECT_PACKAGE,
      packageVersion: APPROVED_WALLETCONNECT_VERSION,
      storageApplied: false,
      provider: fakeProvider()
    }
  ]) {
    const connector = createMobileWalletConnector({
      projectId: PROJECT_ID,
      expectedOrigin: APPROVED_WALLETCONNECT_ORIGIN,
      currentOrigin: APPROVED_WALLETCONNECT_ORIGIN,
      clock: () => NOW,
      loadEthereumProvider: async () => loaded
    });
    await assert.rejects(
      connector.initialize(),
      /did not prove the approved package and memory-only storage/
    );
    assert.equal(connector.getSnapshot().status, "unavailable");
  }
});

test("Provider facade allows only approved account/network/sign and exact zero-value calldata", async () => {
  const fixture = connectorFixture();
  await fixture.connector.initialize();
  const accounts = await fixture.connector.provider.request({
    method: "eth_accounts"
  });
  assert.deepEqual(accounts, [
    "0x1111111111111111111111111111111111111111"
  ]);
  await fixture.connector.provider.request({
    method: "personal_sign",
    params: ["bounded-message", accounts[0]]
  });
  await fixture.connector.provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: accounts[0],
      to: "0x2222222222222222222222222222222222222222",
      data: "0x12345678",
      value: "0x0"
    }]
  });
  await assert.rejects(
    fixture.connector.provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: accounts[0],
        to: "0x2222222222222222222222222222222222222222",
        data: "0x12345678",
        value: "0x1"
      }]
    }),
    (error) => error.code === "wallet_connector_method_denied"
  );
  await assert.rejects(
    fixture.connector.provider.request({
      method: "eth_sendTransaction",
      params: [{ to: accounts[0], value: "0x0" }]
    }),
    (error) => error.code === "wallet_connector_method_denied"
  );
  await assert.rejects(
    fixture.connector.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }]
    }),
    (error) => error.code === "wallet_connector_method_denied"
  );
  await assert.rejects(
    fixture.connector.provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x14a34",
        chainName: "Base Sepolia",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://attacker.example/"],
        blockExplorerUrls: ["https://sepolia-explorer.base.org"]
      }]
    }),
    (error) => error.code === "wallet_connector_method_denied"
  );
  assert.deepEqual(
    fixture.provider.requests.map(({ method }) => method),
    ["eth_accounts", "personal_sign", "eth_sendTransaction"]
  );
});

test("approved lifecycle events are shared; URI and unknown session events are not exposed", async () => {
  const fixture = connectorFixture();
  await fixture.connector.initialize();
  const events = [];
  for (const event of [
    "accountsChanged",
    "chainChanged",
    "connect",
    "disconnect"
  ]) {
    fixture.connector.provider.on(event, (value) => {
      events.push({ event, value });
    });
  }
  fixture.provider.emit("display_uri", "wc:pairing@2?relay-protocol=irn");
  fixture.provider.emit("session_event", {
    params: {
      event: {
        name: "accountsChanged",
        data: ["0x2222222222222222222222222222222222222222"]
      }
    }
  });
  fixture.provider.emit("session_event", {
    params: {
      event: {
        name: "eth_sendTransaction",
        data: { value: "0x1" }
      }
    }
  });
  fixture.provider.emit("chainChanged", "0x14a34");
  await fixture.connector.connect();
  await fixture.connector.disconnect();

  assert.deepEqual(fixture.displayUris, [
    "wc:pairing@2?relay-protocol=irn"
  ]);
  assert.deepEqual(
    events.map(({ event }) => event),
    ["accountsChanged", "chainChanged", "connect", "disconnect"]
  );
  assert.equal(
    events.some(({ event }) => event === "eth_sendTransaction"),
    false
  );
  assert.equal(fixture.connector.getSnapshot().status, "disconnected");
});

test("mobile Provider enters the same registry selection and authority invalidation lifecycle", async () => {
  const fixture = connectorFixture();
  await fixture.connector.initialize();
  const target = new EventTarget();
  const registry = createWalletProviderRegistry({
    eventTarget: target,
    setTimer() {
      return 1;
    },
    clearTimer() {}
  });
  registry.start();
  assert.equal(registry.registerConnector({
    descriptor: fixture.connector.descriptor,
    provider: fixture.connector.provider
  }), true);
  registry.finishDiscovery();
  assert.equal(registry.getSnapshot().providers[0].providerId, MOBILE_WALLET_PROVIDER_ID);
  assert.equal(registry.selectProvider(MOBILE_WALLET_PROVIDER_ID), true);
  assert.equal(registry.getSelectedProvider(), fixture.connector.provider);

  const invalidations = [];
  const lifecycle = createWalletAuthorityLifecycle({
    createIdempotencyKey: () => "wallet_mobile_invalidation_key_000001",
    async invalidateSession(input) {
      invalidations.push(input);
      return {
        schemaVersion: "wallet_session_invalidation_result.v1",
        status: "invalidated",
        reauthenticationRequired: true,
        authorityAvailable: false,
        credentialsIncluded: false,
        fundsAuthority: false
      };
    }
  });
  fixture.connector.provider.on("accountsChanged", () => {
    lifecycle.handleContextChange("wallet_account_changed", {
      serverAuthorityActive: true
    });
  });
  fixture.provider.emit("accountsChanged", [
    "0x3333333333333333333333333333333333333333"
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(invalidations.length, 1);
  assert.equal(lifecycle.getSnapshot().status, "invalidated");
  assert.equal(lifecycle.getSnapshot().protectedAuthorityAvailable, false);
});

test("memory-only storage clears on command and never exposes persisted state", async () => {
  const storage = createMemoryOnlyConnectorStorage();
  const pairing = { topic: "redacted", expiry: 123 };
  await storage.setItem("pairing", pairing);
  pairing.topic = "mutated-after-write";
  assert.deepEqual(await storage.getItem("pairing"), {
    topic: "redacted",
    expiry: 123
  });
  assert.deepEqual(await storage.getKeys(), ["pairing"]);
  assert.deepEqual(await storage.getEntries(), [[
    "pairing",
    { topic: "redacted", expiry: 123 }
  ]]);
  await storage.clear();
  assert.equal(await storage.getItem("pairing"), undefined);
  await storage.dispose();
  await assert.rejects(storage.getItem("pairing"), /disposed/);
});

test("approved real-package loader passes and attests the exact memory storage instance", async () => {
  const storage = createMemoryOnlyConnectorStorage();
  const calls = [];
  const provider = fakeProvider();
  const loader = createApprovedWalletConnectLoader({
    async initialize(options) {
      calls.push(options);
      provider.signer = {
        client: {
          core: {
            storage: options.storage
          }
        }
      };
      return provider;
    }
  });

  const loaded = await loader({
    packageName: APPROVED_WALLETCONNECT_PACKAGE,
    packageVersion: APPROVED_WALLETCONNECT_VERSION,
    storage,
    options: {
      projectId: PROJECT_ID,
      optionalChains: [84532, 1952],
      methods: ["personal_sign", "eth_signTypedData_v4"],
      events: ["accountsChanged", "chainChanged"],
      showQrModal: false
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].telemetryEnabled, false);
  assert.equal(calls[0].disableProviderPing, true);
  assert.equal(loaded.storageApplied, true);
  assert.equal(loaded.provider, provider);
});

test("approved loader fails closed when the initialized package does not retain supplied storage", async () => {
  const storage = createMemoryOnlyConnectorStorage();
  const loader = createApprovedWalletConnectLoader({
    async initialize() {
      const provider = fakeProvider();
      provider.signer = {
        client: {
          core: {
            storage: createMemoryOnlyConnectorStorage()
          }
        }
      };
      return provider;
    }
  });
  const loaded = await loader({
    packageName: APPROVED_WALLETCONNECT_PACKAGE,
    packageVersion: APPROVED_WALLETCONNECT_VERSION,
    storage,
    options: {
      projectId: PROJECT_ID,
      optionalChains: [84532, 1952],
      showQrModal: false
    }
  });
  assert.equal(loaded.storageApplied, false);
});
