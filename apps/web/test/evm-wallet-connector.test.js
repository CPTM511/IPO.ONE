import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  EVM_WALLET_CAPABILITIES_SCHEMA_VERSION,
  EVM_WALLET_CONNECTOR_DESCRIPTOR_SCHEMA_VERSION,
  createEvmWalletConnector,
  describeEvmWalletConnectorBoundary
} from "../src/evm-wallet-connector.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const [descriptorSchema, capabilitySchema] = await Promise.all([
  readFile(new URL(
    "../../../schemas/v2/evm-wallet-connector-descriptor.schema.json",
    import.meta.url
  ), "utf8").then(JSON.parse),
  readFile(new URL(
    "../../../schemas/v2/evm-wallet-capabilities.schema.json",
    import.meta.url
  ), "utf8").then(JSON.parse)
]);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateDescriptor = ajv.compile(descriptorSchema);
const validateCapabilities = ajv.compile(capabilitySchema);

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const ACCOUNT_ID = `eip155:84532:${ACCOUNT}`;

function fakeProvider({ capabilityResult, capabilityError = false } = {}) {
  const listeners = new Map();
  const requests = [];
  let chainId = "0x14a34";
  let accounts = [ACCOUNT];
  function emit(event, value) {
    for (const listener of listeners.get(event) ?? []) listener(value);
  }
  return {
    requests,
    emit,
    setAccounts(value) {
      accounts = value;
      emit("accountsChanged", value);
    },
    setChain(value) {
      chainId = value;
      emit("chainChanged", value);
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
      if (input.method === "eth_chainId") return chainId;
      if (input.method === "eth_accounts" || input.method === "eth_requestAccounts") {
        return [...accounts];
      }
      if (input.method === "wallet_switchEthereumChain") {
        chainId = input.params[0].chainId;
        emit("chainChanged", chainId);
        return null;
      }
      if (input.method === "wallet_addEthereumChain") {
        chainId = input.params[0].chainId;
        emit("chainChanged", chainId);
        return null;
      }
      if (input.method === "wallet_getCapabilities") {
        if (capabilityError) throw Object.assign(new Error("unsupported"), { code: 4200 });
        return capabilityResult ?? {};
      }
      if (input.method === "personal_sign") return `0x${"11".repeat(65)}`;
      if (input.method === "eth_signTypedData_v4") return `0x${"22".repeat(65)}`;
      throw new Error(`unexpected method ${input.method}`);
    }
  };
}

function injectedFixture(options = {}) {
  const provider = fakeProvider(options);
  const connector = createEvmWalletConnector({
    descriptor: {
      providerId: "eip6963:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source: "eip6963",
      name: "Injected test wallet"
    },
    provider,
    declaredMethods: options.declaredMethods ?? []
  });
  return { connector, provider };
}

function assertClosedBoundary(connector) {
  const descriptor = connector.descriptor();
  assert.equal(
    validateDescriptor(descriptor),
    true,
    JSON.stringify(validateDescriptor.errors)
  );
  assert.equal(descriptor.schemaVersion, EVM_WALLET_CONNECTOR_DESCRIPTOR_SCHEMA_VERSION);
  assert.equal(descriptor.rawProviderExposed, false);
  assert.equal(descriptor.arbitraryCalldataAccepted, false);
  assert.equal(descriptor.preparedExecutionSubmission, false);
  assert.equal(Object.hasOwn(connector, "request"), false);
  assert.equal(Object.isFrozen(connector), true);
}

test("injected EIP-1193 provider is normalized behind one closed connector SPI", async () => {
  const { connector, provider } = injectedFixture({
    declaredMethods: ["eth_signTypedData_v4"]
  });
  assertClosedBoundary(connector);

  const connection = await connector.connect({ chainId: "eip155:84532" });
  assert.equal(connection.chainId, "eip155:84532");
  assert.deepEqual(connection.accounts, [{
    address: ACCOUNT,
    accountId: ACCOUNT_ID
  }]);
  assert.equal(connection.authorityGranted, false);
  assert.equal(connection.fundsAuthority, false);

  const signature = await connector.signTypedData({
    accountId: ACCOUNT_ID,
    typedData: { domain: { name: "IPO.ONE" }, message: { purpose: "test" } }
  });
  assert.match(signature, /^0x[0-9a-f]{130}$/);
  assert.equal(
    provider.requests.some(({ method }) => method === "eth_signTypedData_v4"),
    true
  );
});
test("WalletConnect-shaped provider satisfies the same SPI without raw request exposure", async () => {
  const provider = fakeProvider();
  let connected = 0;
  let disconnected = 0;
  const connector = createEvmWalletConnector({
    descriptor: {
      providerId: "walletconnect:mobile-v2.23.10",
      source: "mobile_walletconnect",
      name: "WalletConnect mobile / QR"
    },
    provider,
    connectProvider: async () => { connected += 1; },
    disconnectProvider: async () => { disconnected += 1; },
    declaredMethods: ["eth_signTypedData_v4", "wallet_getCapabilities"]
  });
  assertClosedBoundary(connector);
  assert.equal(connector.descriptor().walletTransport, "walletconnect");
  await connector.connect({ chainId: "eip155:84532" });
  const result = await connector.disconnect();
  assert.equal(connected, 1);
  assert.equal(disconnected, 1);
  assert.equal(result.status, "wallet_disconnected");
});

test("capability discovery is closed and unknown support remains non-permissive", async () => {
  const unknown = injectedFixture({ capabilityError: true });
  const unknownResult = await unknown.connector.getCapabilities();
  assert.equal(
    validateCapabilities(unknownResult),
    true,
    JSON.stringify(validateCapabilities.errors)
  );
  assert.equal(unknownResult.schemaVersion, EVM_WALLET_CAPABILITIES_SCHEMA_VERSION);
  assert.equal(unknownResult.calls.single, "unknown");
  assert.equal(unknownResult.calls.atomicBatch, "unknown");
  assert.equal(unknownResult.authorizationGranted, false);
  assert.equal(unknownResult.preparedExecutionAvailable, false);

  const positive = injectedFixture({
    capabilityResult: {
      "0x14a34": {
        single: { supported: true },
        batch: { supported: false },
        atomicBatch: { supported: true },
        erc4337: { supported: true },
        walletSimulation: { supported: false }
      }
    }
  });
  const positiveResult = await positive.connector.getCapabilities({
    accountId: ACCOUNT_ID
  });
  assert.equal(validateCapabilities(positiveResult), true);
  assert.equal(positiveResult.calls.single, "supported");
  assert.equal(positiveResult.calls.batch, "unsupported");
  assert.equal(positiveResult.calls.atomicBatch, "supported");
  assert.equal(positiveResult.accountAbstraction.erc4337, "supported");
  assert.equal(positiveResult.walletSimulation, "unsupported");
  assert.equal(positiveResult.fundsAuthority, false);
});

test("account, chain, provider and disconnect changes invalidate captured work", async () => {
  const { connector, provider } = injectedFixture();
  const accountChanges = [];
  const chainChanges = [];
  const disconnects = [];
  connector.subscribeAccountChanges((change) => accountChanges.push(change));
  connector.subscribeChainChanges((change) => chainChanges.push(change));
  connector.subscribeDisconnect((change) => disconnects.push(change));
  const initial = connector.captureContext();

  provider.setAccounts(["0x2222222222222222222222222222222222222222"]);
  assert.throws(
    () => connector.assertContextEpoch(initial.contextEpoch),
    (error) => error.code === "wallet_context_changed"
  );
  const afterAccount = connector.captureContext();
  provider.setChain("0x7a0");
  connector.invalidateContext("wallet_provider_changed");
  provider.emit("disconnect", { code: 4_900 });

  assert.equal(accountChanges.length, 1);
  assert.equal(chainChanges.length, 1);
  assert.equal(disconnects.length, 1);
  assert.ok(connector.captureContext().contextEpoch >= afterAccount.contextEpoch + 3);
  assert.equal(connector.captureContext().reason, "wallet_provider_disconnected");
});

test("prepared submission always rejects before any provider transaction call", async () => {
  const { connector, provider } = injectedFixture();
  const before = provider.requests.length;
  await assert.rejects(
    connector.submitPreparedExecution({
      contextEpoch: connector.captureContext().contextEpoch,
      calldata: "0x12345678"
    }),
    (error) => error.code === "prepared_execution_contract_unavailable"
  );
  assert.equal(provider.requests.length, before);
  assert.equal(
    provider.requests.some(({ method }) => method.includes("sendTransaction")),
    false
  );
});

test("unapproved chains and malformed provider results fail closed", async () => {
  const { connector, provider } = injectedFixture();
  await assert.rejects(
    connector.switchChain("eip155:1"),
    (error) => error.code === "wallet_chain_not_enabled"
  );
  provider.setChain("0x1");
  await assert.rejects(
    connector.getChain(),
    (error) => error.code === "wallet_chain_not_enabled"
  );
  assert.deepEqual(connector.descriptor().enabledChains, [
    "eip155:84532",
    "eip155:1952"
  ]);
});

test("boundary declaration grants no transaction, production, or funds authority", () => {
  const boundary = describeEvmWalletConnectorBoundary();
  assert.equal(boundary.rawProviderExposed, false);
  assert.equal(boundary.arbitraryCalldataAccepted, false);
  assert.equal(boundary.preparedExecutionAvailable, false);
  assert.equal(boundary.transactionsAllowed, false);
  assert.equal(boundary.externalCallsPerformedByBoundary, false);
  assert.equal(boundary.productionApproved, false);
  assert.equal(boundary.fundsAuthority, false);
});
