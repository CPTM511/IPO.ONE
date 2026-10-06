import assert from "node:assert/strict";
import test from "node:test";
import { createMobileWalletAccess, mobileWalletAvailability } from "../src/mobile-wallet-access.js";
import QRCode from "qrcode";

function fixture({ projectId = "a".repeat(32), origin = "https://ipo.one" } = {}) {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, dataset: {}, removeAttribute(name) { delete this[name]; }, remove() {} });
    return nodes.get(id);
  };
  const scripts = [], registered = [], removed = [], selected = [], messages = [], connections = [];
  const document = { getElementById: get, querySelector: () => ({ content: projectId }),
    createElement: () => ({ dataset: {}, remove() {} }), head: { append: (s) => scripts.push(s) } };
  const window = { location: { origin }, btoa: (s) => Buffer.from(s).toString("base64") };
  const registry = { registerConnector(value) { registered.push(value); return true; }, removeProvider(id) { removed.push(id); } };
  const bundle = {
    createPairingQrSvg: QRCode.toString,
    createMobileWalletConnector(options) {
      const connection = { options, descriptor: { providerId: "mobile" }, connector: {}, disposed: false,
        async dispose() { this.disposed = true; } };
      connections.push(connection); return connection;
    }
  };
  const access = createMobileWalletAccess({ document, window, registry, selectProvider: (id) => selected.push(id), onStatus: (m) => messages.push(m) });
  access.render({ walletEnabled: true });
  return { access, get, scripts, registered, removed, selected, messages, connections, window, bundle, registry };
}

test("phone access fails closed without operator configuration, exact origin or valid approval", async () => {
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(mobileWalletAvailability({ origin: "https://ipo.one", projectId: "a".repeat(32), now }).available, true);
  for (const input of [{ projectId: "" }, { projectId: 1e31 }, { origin: "https://attacker.example" }, { now: new Date("2026-09-23T00:00:00Z") }]) {
    assert.equal(mobileWalletAvailability({ origin: "https://ipo.one", projectId: "a".repeat(32), now, ...input }).available, false);
  }
  const f = fixture({ projectId: "" });
  await f.access.prepare();
  assert.equal(f.get("mobileWalletBtn").disabled, true);
  assert.equal(f.scripts.length, 0);
  assert.equal(f.registered.length, 0);
});

test("failed optional script can retry, pairing renders QR and cancel prevents late QR or authority", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-11T00:00:00Z") });
  const f = fixture();
  const first = f.access.prepare();
  f.scripts[0].onerror();
  await first;
  assert.equal(f.registered.length, 0);
  assert.match(f.get("mobileWalletStatus").textContent, /Try again/);
  const retry = f.access.prepare();
  assert.equal(f.scripts.length, 2);
  f.window.IpoOneWalletConnectBundle = f.bundle;
  f.scripts[1].onload(); await retry;
  assert.deepEqual(Object.keys(f.registered[0]).sort(), ["connector", "descriptor"]);
  assert.deepEqual(f.selected, ["mobile"]);
  f.access.render({ busy: true, walletEnabled: true });
  assert.equal(f.get("mobileWalletPairing").hidden, false, "cancel remains visible while connection is pending");
  const uri = `wc:${"b".repeat(64)}@2?relay-protocol=irn&symKey=${"c".repeat(64)}`;
  await f.connections[0].options.onDisplayUri(uri);
  const svg = Buffer.from(f.get("mobileWalletQr").src.split(",")[1], "base64").toString();
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox=/);
  await f.access.cancel();
  assert.equal(f.connections[0].disposed, true);
  assert.deepEqual(f.removed, ["mobile"]);
  assert.equal(f.get("mobileWalletQr").src, undefined);
  await f.connections[0].options.onDisplayUri(uri);
  assert.equal(f.get("mobileWalletPairing").hidden, true);
  f.access.render({ walletEnabled: true });
  await f.access.prepare();
  assert.equal(f.connections.length, 2);
});

test("registration and QR generation errors retain a usable retry or cancel path", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-11T00:00:00Z") });
  const f = fixture(); f.window.IpoOneWalletConnectBundle = f.bundle;
  f.registry.registerConnector = () => false;
  await f.access.prepare();
  assert.equal(f.connections[0].disposed, true);
  f.registry.registerConnector = () => true;
  await f.access.prepare();
  f.bundle.createPairingQrSvg = async () => { throw new Error("QR failed"); };
  await f.connections[1].options.onDisplayUri("wc:valid@2?symKey=test");
  assert.match(f.get("mobileWalletStatus").textContent, /Cancel phone connection/);
  assert.equal(f.get("mobileWalletPairing").hidden, false);
  await f.access.cancel();
});
