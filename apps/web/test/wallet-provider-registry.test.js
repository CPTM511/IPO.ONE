import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { createEvmWalletConnector } from "../src/evm-wallet-connector.js";
import {
  EIP6963_ANNOUNCE_EVENT,
  EIP6963_REQUEST_EVENT,
  LEGACY_WALLET_PROVIDER_ID,
  MOBILE_WALLET_PROVIDER_ID,
  WALLET_PROVIDER_REGISTRY_SCHEMA_VERSION,
  createWalletProviderRegistry
} from "../src/wallet-provider-registry.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const registrySchema = JSON.parse(await readFile(
  new URL("../../../schemas/v2/wallet-provider-registry.schema.json", import.meta.url),
  "utf8"
));
const validateRegistry = new Ajv2020({ allErrors: true, strict: true }).compile(registrySchema);

const ICON = "data:image/png;base64,iVBORw0KGgo=";

function provider(label) {
  return {
    label,
    requests: [],
    async request(input) {
      this.requests.push(structuredClone(input));
      return null;
    }
  };
}

function mobileConnector(walletProvider) {
  return createEvmWalletConnector({
    descriptor: {
      providerId: MOBILE_WALLET_PROVIDER_ID,
      source: "mobile_walletconnect",
      name: "WalletConnect mobile / QR"
    },
    provider: walletProvider
  });
}

function detail(info, walletProvider, extra = {}) {
  return {
    info: {
      uuid: info.uuid,
      name: info.name,
      icon: info.icon ?? ICON,
      rdns: info.rdns,
      ...(info.extra ?? {})
    },
    provider: walletProvider,
    ...extra
  };
}

function announce(target, announcement) {
  const event = new Event(EIP6963_ANNOUNCE_EVENT);
  Object.defineProperty(event, "detail", {
    configurable: false,
    enumerable: true,
    value: announcement,
    writable: false
  });
  target.dispatchEvent(event);
}

function timers() {
  let callback;
  let cleared = 0;
  return {
    setTimer(next) {
      callback = next;
      return 1;
    },
    clearTimer() {
      callback = undefined;
      cleared += 1;
    },
    run() {
      const next = callback;
      callback = undefined;
      next?.();
    },
    get cleared() {
      return cleared;
    }
  };
}

function registry(target, options = {}) {
  const timer = timers();
  const snapshots = [];
  const value = createWalletProviderRegistry({
    eventTarget: target,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
    onChange(snapshot) {
      snapshots.push(snapshot);
    },
    ...options
  });
  return { registry: value, snapshots, timer };
}

function assertValidSnapshot(snapshot) {
  assert.equal(validateRegistry(snapshot), true, JSON.stringify(validateRegistry.errors));
  assert.equal(snapshot.schemaVersion, WALLET_PROVIDER_REGISTRY_SCHEMA_VERSION);
  assert.equal(snapshot.nonAuthorizing, true);
  assert.equal(snapshot.credentialsIncluded, false);
  assert.equal(snapshot.fundsAuthority, false);
  assert.equal(snapshot.storage, "memory_only");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.providers), true);
}

test("no announced or legacy Provider reaches one empty ready registry", () => {
  const target = new EventTarget();
  const fixture = registry(target);

  const discovering = fixture.registry.start();
  assert.equal(discovering.status, "discovering");
  assert.deepEqual(discovering.providers, []);
  assert.equal(discovering.selectionRequired, false);

  fixture.timer.run();
  const ready = fixture.registry.getSnapshot();
  assertValidSnapshot(ready);
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.providers, []);
  assert.equal(fixture.registry.getSelectedConnector(), null);
});

test("one EIP-6963 Provider is discovered but never selected implicitly", () => {
  const target = new EventTarget();
  const wallet = provider("alpha");
  let requestEvents = 0;
  target.addEventListener(EIP6963_REQUEST_EVENT, () => {
    requestEvents += 1;
    announce(target, detail({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Alpha Wallet",
      rdns: "com.alpha.wallet"
    }, wallet));
  });
  const fixture = registry(target);

  fixture.registry.start();
  fixture.timer.run();
  const snapshot = fixture.registry.getSnapshot();
  assertValidSnapshot(snapshot);
  assert.equal(requestEvents, 1);
  assert.equal(snapshot.providers.length, 1);
  assert.equal(snapshot.providers[0].providerId, "eip6963:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(snapshot.selectionRequired, true);
  assert.equal(snapshot.selectedProviderId, undefined);
  assert.equal(fixture.registry.getSelectedConnector(), null);
  assert.equal(wallet.requests.length, 0);

  assert.equal(fixture.registry.selectProvider(snapshot.providers[0].providerId), true);
  assert.equal(
    fixture.registry.getSelectedConnector().descriptor().providerId,
    snapshot.providers[0].providerId
  );
  assert.equal(fixture.registry.getSnapshot().selectionRequired, false);
  assert.equal(wallet.requests.length, 0, "selection must not request an account, chain, or signature");
});

test("sign-out clears selection without disposing discovered Providers", () => {
  const target = new EventTarget();
  const wallet = provider("reusable");
  const fixture = registry(target);
  fixture.registry.start();
  announce(target, detail({
    uuid: "123e4567-e89b-42d3-a456-426614174099",
    name: "Reusable Wallet",
    rdns: "com.reusable.wallet"
  }, wallet));
  fixture.timer.run();

  const providerId = fixture.registry.getSnapshot().providers[0].providerId;
  assert.equal(fixture.registry.selectProvider(providerId), true);
  assert.equal(fixture.registry.getSelectedConnector().descriptor().providerId, providerId);
  assert.equal(fixture.registry.clearSelection(), true);

  const cleared = fixture.registry.getSnapshot();
  assertValidSnapshot(cleared);
  assert.equal(cleared.status, "ready");
  assert.equal(cleared.providers.length, 1);
  assert.equal(cleared.selectionRequired, true);
  assert.equal(cleared.selectedProviderId, undefined);
  assert.equal(fixture.registry.getSelectedConnector(), null);
  assert.equal(fixture.registry.clearSelection(), false);
});

test("one reviewed mobile connector registers explicitly and remains unselected", () => {
  const target = new EventTarget();
  const mobile = provider("mobile");
  const fixture = registry(target);
  fixture.registry.start();
  assert.equal(fixture.registry.registerConnector({
    descriptor: {
      providerId: MOBILE_WALLET_PROVIDER_ID,
      source: "mobile_walletconnect",
      name: "WalletConnect mobile / QR",
      connectorVersion: "2.23.10",
      storage: "memory_only"
    },
    connector: mobileConnector(mobile)
  }), true);
  fixture.timer.run();

  const snapshot = fixture.registry.getSnapshot();
  assertValidSnapshot(snapshot);
  assert.equal(snapshot.providers.length, 1);
  assert.deepEqual(snapshot.providers[0], {
    providerId: MOBILE_WALLET_PROVIDER_ID,
    source: "mobile_walletconnect",
    name: "WalletConnect mobile / QR",
    connectorVersion: "2.23.10",
    storage: "memory_only"
  });
  assert.equal(snapshot.selectionRequired, true);
  assert.equal(snapshot.selectedProviderId, undefined);
  assert.equal(fixture.registry.getSelectedConnector(), null);
  assert.equal(mobile.requests.length, 0);
});

test("multiple Providers render in deterministic order and duplicate announcements never replace one", () => {
  const target = new EventTarget();
  const alpha = provider("alpha");
  const beta = provider("beta");
  const maliciousReplacement = provider("replacement");
  target.addEventListener(EIP6963_REQUEST_EVENT, () => {
    announce(target, detail({
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Beta Wallet",
      rdns: "com.beta.wallet"
    }, beta));
    announce(target, detail({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "alpha wallet",
      rdns: "com.alpha.wallet"
    }, alpha));
  });
  const fixture = registry(target);
  fixture.registry.start();
  fixture.timer.run();

  const snapshot = fixture.registry.getSnapshot();
  assert.deepEqual(snapshot.providers.map((item) => item.name), ["alpha wallet", "Beta Wallet"]);
  assert.equal(
    fixture.registry.selectProvider("eip6963:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    true
  );
  const selectedConnector = fixture.registry.getSelectedConnector();
  announce(target, detail({
    uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Replacement Wallet",
    rdns: "com.replacement.wallet"
  }, maliciousReplacement));
  assert.equal(fixture.registry.getSelectedConnector(), selectedConnector);
  assert.deepEqual(
    fixture.registry.getSnapshot().providers.map((item) => item.name),
    ["alpha wallet", "Beta Wallet"]
  );

  announce(target, detail({
    uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: "Alias Wallet",
    rdns: "com.alias.wallet"
  }, alpha));
  assert.equal(fixture.registry.getSnapshot().providers.length, 2);
});

test("malicious metadata is bounded, text-only, scheme-restricted, and closed", () => {
  const target = new EventTarget();
  const hostile = provider("hostile");
  const unknownField = provider("unknown-field");
  const oversized = provider("oversized");
  const fixture = registry(target);
  fixture.registry.start();

  announce(target, detail({
    uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "  </button><script>alert(1)</script>\u202e  ",
    icon: "https://attacker.example/wallet.svg",
    rdns: "bad..example"
  }, hostile));
  announce(target, detail({
    uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "Unknown field",
    rdns: "com.unknown.wallet",
    extra: { homepage: "https://attacker.example" }
  }, unknownField));
  announce(target, detail({
    uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "x".repeat(513),
    rdns: "com.oversized.wallet"
  }, oversized));
  fixture.timer.run();

  const snapshot = fixture.registry.getSnapshot();
  assertValidSnapshot(snapshot);
  assert.equal(snapshot.providers.length, 2);
  const hostileDescriptor = snapshot.providers.find((item) => item.uuid?.startsWith("dddd"));
  assert.equal(hostileDescriptor.name, "</button><script>alert(1)</script>");
  assert.equal(Object.hasOwn(hostileDescriptor, "iconDataUri"), false);
  assert.equal(Object.hasOwn(hostileDescriptor, "rdns"), false);
  assert.equal(
    snapshot.providers.find((item) => item.uuid?.startsWith("ffff")).name,
    "Unnamed wallet"
  );
  assert.equal(snapshot.providers.some((item) => item.uuid?.startsWith("eeee")), false);
});

test("selected Provider removal clears selection and replacement requires a new explicit choice", () => {
  const target = new EventTarget();
  const first = provider("first");
  const replacement = provider("replacement");
  const fixture = registry(target);
  fixture.registry.start();
  const announcement = {
    uuid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    name: "Stable Wallet",
    rdns: "com.stable.wallet"
  };
  const providerId = `eip6963:${announcement.uuid}`;
  announce(target, detail(announcement, first));
  assert.equal(fixture.registry.selectProvider(providerId), true);
  assert.equal(fixture.registry.removeProvider(providerId, replacement), false);
  assert.equal(fixture.registry.getSelectedConnector().descriptor().providerId, providerId);

  assert.equal(fixture.registry.removeProvider(providerId, first), true);
  assert.equal(fixture.registry.getSelectedConnector(), null);
  assert.equal(fixture.registry.getSnapshot().selectedProviderId, undefined);

  announce(target, detail(announcement, replacement));
  assert.equal(fixture.registry.getSnapshot().providers.length, 1);
  assert.equal(fixture.registry.getSelectedConnector(), null);
  assert.equal(fixture.registry.selectProvider(providerId), true);
  assert.equal(fixture.registry.getSelectedConnector().descriptor().providerId, providerId);
});

test("legacy global EIP-1193 support is a fixed fallback and still requires selection", () => {
  const target = new EventTarget();
  const legacy = provider("legacy");
  const fixture = registry(target, { legacyProvider: legacy });
  fixture.registry.start();
  fixture.timer.run();

  const snapshot = fixture.registry.getSnapshot();
  assertValidSnapshot(snapshot);
  assert.deepEqual(snapshot.providers, [{
    providerId: LEGACY_WALLET_PROVIDER_ID,
    source: "legacy_eip1193",
    name: "Browser wallet (legacy EIP-1193)"
  }]);
  assert.equal(snapshot.selectionRequired, true);
  assert.equal(fixture.registry.getSelectedConnector(), null);
  assert.equal(fixture.registry.selectProvider(LEGACY_WALLET_PROVIDER_ID), true);
  assert.equal(
    fixture.registry.getSelectedConnector().descriptor().providerId,
    LEGACY_WALLET_PROVIDER_ID
  );
  assert.equal(legacy.requests.length, 0);
});

test("dispose removes the announcement listener, cancels fallback, and clears references", () => {
  class CountingTarget extends EventTarget {
    listeners = 0;
    addEventListener(type, listener, options) {
      if (type === EIP6963_ANNOUNCE_EVENT) this.listeners += 1;
      return super.addEventListener(type, listener, options);
    }
    removeEventListener(type, listener, options) {
      if (type === EIP6963_ANNOUNCE_EVENT) this.listeners -= 1;
      return super.removeEventListener(type, listener, options);
    }
  }

  const target = new CountingTarget();
  const wallet = provider("disposed");
  const fixture = registry(target);
  fixture.registry.start();
  announce(target, detail({
    uuid: "99999999-9999-4999-8999-999999999999",
    name: "Dispose Wallet",
    rdns: "com.dispose.wallet"
  }, wallet));
  assert.equal(target.listeners, 1);

  const disposed = fixture.registry.dispose();
  assertValidSnapshot(disposed);
  assert.equal(disposed.status, "disposed");
  assert.deepEqual(disposed.providers, []);
  assert.equal(target.listeners, 0);
  assert.ok(fixture.timer.cleared >= 1);

  announce(target, detail({
    uuid: "88888888-8888-4888-8888-888888888888",
    name: "Late Wallet",
    rdns: "com.late.wallet"
  }, provider("late")));
  assert.deepEqual(fixture.registry.getSnapshot().providers, []);
});
