import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  createProviderIntentDelivery,
  createProviderIntentView,
  verifyProviderSandboxCallback
} from "../../../packages/domain/src/index.js";
import { FixedLoopbackProviderClient } from "../../../modules/provider-sandbox/src/index.js";

function keyMaterial() {
  const delivery = generateKeyPairSync("ed25519");
  const callback = generateKeyPairSync("ed25519");
  return {
    delivery,
    callback,
    deliveryPrivateKey: delivery.privateKey,
    deliveryPublicDer: delivery.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    callbackPrivateDer: callback.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")
  };
}

function providerDelivery({ deliveryId = "provider_delivery_process_001", amount = "12000" } = {}) {
  const issuedAt = new Date();
  return createProviderIntentView(createProviderIntentDelivery({
    deliveryId,
    transferIntent: {
      transferIntentId: "transfer_intent_process_001",
      transferIntentHash: `0x${"11".repeat(32)}`,
      providerId: "provider_process_001",
      purposeCode: "compute_services",
      sourceAssetId: "urn:ipo-one:sandbox-asset:usd-cent",
      sourceAmountMinor: amount,
      destinationAssetId: "urn:ipo-one:sandbox-asset:usd-cent"
    },
    providerActorId: "actor_provider_process_001",
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 300_000)
  }));
}

async function startProvider({ port, stateFile, keys, crashPoint = "none" }) {
  const child = spawn(process.execPath, ["apps/provider-sandbox/src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IPO_ONE_PROVIDER_SANDBOX_PORT: String(port),
      IPO_ONE_PROVIDER_STATE_FILE: stateFile,
      IPO_ONE_PROVIDER_CALLBACK_KEY_ID: "provider_callback_key_process_001",
      IPO_ONE_PROVIDER_CALLBACK_PRIVATE_KEY_B64: keys.callbackPrivateDer,
      IPO_ONE_PROVIDER_DELIVERY_KEY_ID: "provider_delivery_key_process_001",
      IPO_ONE_PROVIDER_DELIVERY_PUBLIC_KEY_B64: keys.deliveryPublicDer,
      IPO_ONE_PROVIDER_TEST_CRASH_POINT: crashPoint
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.setEncoding("utf8");
  const ready = new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("provider_sandbox_ready")) resolve();
    });
    child.once("exit", (code) => reject(new Error(`provider exited before ready (${code}): ${stderr}`)));
  });
  await Promise.race([
    ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error("provider readiness timeout")), 3_000))
  ]);
  return child;
}

async function stopProvider(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

function client(port, keys, options = {}) {
  return new FixedLoopbackProviderClient({
    port,
    deliverySigningPrivateKey: keys.deliveryPrivateKey,
    deliveryKeyId: "provider_delivery_key_process_001",
    timeoutMs: 800,
    maxAttempts: 1,
    failureThreshold: 2,
    ...options
  });
}

test("real loopback Provider process is signed, replay-safe, conflict-safe, and restart-durable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-provider-process-"));
  const stateFile = join(directory, "provider-state.json");
  const port = 54_701;
  const keys = keyMaterial();
  let child = await startProvider({ port, stateFile, keys });
  t.after(async () => {
    await stopProvider(child);
    await rm(directory, { recursive: true, force: true });
  });

  const transport = client(port, keys);
  const delivery = providerDelivery();
  const first = await transport.deliver(delivery);
  assert.equal(first.replayed, false);
  assert.equal(first.acknowledgement.deliveryHash, delivery.deliveryHash);
  assert.equal(first.callback.productionFundsMoved, false);
  await verifyProviderSandboxCallback(first.callback, {
    keyResolver: async (keyId) => keyId === "provider_callback_key_process_001"
      ? keys.callback.publicKey
      : undefined,
    now: new Date(first.callback.issuedAt),
    expectedProviderId: delivery.providerId,
    expectedTransferIntentId: delivery.transferIntentId,
    expectedDeliveryHash: delivery.deliveryHash
  });

  const duplicate = await transport.deliver(delivery);
  assert.equal(duplicate.replayed, true);
  assert.deepEqual(
    { ...duplicate, replayed: false },
    first
  );
  await assert.rejects(
    () => transport.deliver(providerDelivery({ amount: "12001" })),
    (error) => error.code === "provider_sandbox_delivery_conflict"
  );

  await stopProvider(child);
  child = await startProvider({ port, stateFile, keys });
  const recovered = await transport.deliver(delivery);
  assert.equal(recovered.replayed, true);
  assert.deepEqual(recovered, duplicate);

  const durableState = await readFile(stateFile, "utf8");
  assert.equal(durableState.includes("signature"), false);
  assert.equal(durableState.includes(keys.callbackPrivateDer), false);
  assert.equal(durableState.includes(keys.deliveryPublicDer), false);
});

test("crash after durable commit recovers the same deterministic callback without a second state", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-provider-crash-"));
  const stateFile = join(directory, "provider-state.json");
  const port = 54_702;
  const keys = keyMaterial();
  let child = await startProvider({ port, stateFile, keys, crashPoint: "after_commit" });
  t.after(async () => {
    await stopProvider(child);
    await rm(directory, { recursive: true, force: true });
  });
  const delivery = providerDelivery({ deliveryId: "provider_delivery_crash_001" });
  await assert.rejects(
    () => client(port, keys, { timeoutMs: 500 }).deliver(delivery),
    (error) => ["provider_sandbox_transport_unavailable", "provider_sandbox_timeout"].includes(error.code)
  );
  if (child.exitCode === null) await once(child, "exit");

  child = await startProvider({ port, stateFile, keys });
  const recovered = await client(port, keys).deliver(delivery);
  assert.equal(recovered.replayed, true);
  assert.equal(recovered.callback.deliveryHash, delivery.deliveryHash);
  assert.equal(recovered.callback.productionFundsMoved, false);
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(Object.keys(state.deliveries).length, 1);
});

test("crash before commit leaves no Provider state and a clean restart accepts the delivery once", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ipo-one-provider-precommit-"));
  const stateFile = join(directory, "provider-state.json");
  const port = 54_703;
  const keys = keyMaterial();
  let child = await startProvider({ port, stateFile, keys, crashPoint: "before_commit" });
  t.after(async () => {
    await stopProvider(child);
    await rm(directory, { recursive: true, force: true });
  });
  const delivery = providerDelivery({ deliveryId: "provider_delivery_precommit_001" });
  await assert.rejects(
    () => client(port, keys, { timeoutMs: 500 }).deliver(delivery),
    (error) => ["provider_sandbox_transport_unavailable", "provider_sandbox_timeout"].includes(error.code)
  );
  if (child.exitCode === null) await once(child, "exit");

  await assert.rejects(() => readFile(stateFile, "utf8"), (error) => error.code === "ENOENT");
  child = await startProvider({ port, stateFile, keys });
  const recovered = await client(port, keys).deliver(delivery);
  assert.equal(recovered.replayed, false);
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(Object.keys(state.deliveries).length, 1);
});
