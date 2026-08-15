import { createPrivateKey, createPublicKey } from "node:crypto";
import { createServer } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  createSignedProviderSandboxCallback,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  PROVIDER_SANDBOX_DELIVERY_PATH,
  PROVIDER_SANDBOX_DELIVERY_RESULT_SCHEMA_VERSION,
  verifyProviderDeliveryEnvelope
} from "../../../modules/provider-sandbox/src/index.js";

const BODY_LIMIT = 32_768;
const RESPONSE_LIMIT = 65_536;
const STATE_SCHEMA_VERSION = "provider_sandbox_state.v1";

function configuration() {
  const port = Number(process.env.IPO_ONE_PROVIDER_SANDBOX_PORT);
  const stateFile = process.env.IPO_ONE_PROVIDER_STATE_FILE;
  const callbackKeyId = process.env.IPO_ONE_PROVIDER_CALLBACK_KEY_ID;
  const deliveryKeyId = process.env.IPO_ONE_PROVIDER_DELIVERY_KEY_ID;
  if (
    !Number.isInteger(port) || port < 1024 || port > 65_535 ||
    typeof stateFile !== "string" || !isAbsolute(stateFile) ||
    !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(callbackKeyId ?? "") ||
    !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(deliveryKeyId ?? "") ||
    typeof process.env.IPO_ONE_PROVIDER_CALLBACK_PRIVATE_KEY_B64 !== "string" ||
    typeof process.env.IPO_ONE_PROVIDER_DELIVERY_PUBLIC_KEY_B64 !== "string"
  ) {
    throw new Error("provider_sandbox_configuration_invalid");
  }
  return {
    port,
    stateFile,
    callbackKeyId,
    deliveryKeyId,
    crashPoint: process.env.IPO_ONE_PROVIDER_TEST_CRASH_POINT ?? "none",
    callbackPrivateKey: createPrivateKey({
      key: Buffer.from(process.env.IPO_ONE_PROVIDER_CALLBACK_PRIVATE_KEY_B64, "base64"),
      format: "der",
      type: "pkcs8"
    }),
    deliveryPublicKey: createPublicKey({
      key: Buffer.from(process.env.IPO_ONE_PROVIDER_DELIVERY_PUBLIC_KEY_B64, "base64"),
      format: "der",
      type: "spki"
    })
  };
}

async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (
      parsed?.schemaVersion !== STATE_SCHEMA_VERSION ||
      !parsed.deliveries || typeof parsed.deliveries !== "object" || Array.isArray(parsed.deliveries)
    ) {
      throw new Error("provider_sandbox_state_invalid");
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return { deliveries: {}, schemaVersion: STATE_SCHEMA_VERSION };
    throw error;
  }
}

async function saveState(path, state) {
  const next = `${path}.next`;
  await writeFile(next, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(next, path);
}

function boundedJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error("payload_too_large"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("invalid_json"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function callbackDescriptor(delivery, acknowledgedAt, callbackKeyId) {
  const token = hashId("provider_sandbox_callback_identity", {
    deliveryId: delivery.deliveryId,
    deliveryHash: delivery.deliveryHash
  }).slice(2, 34);
  const issuedAt = new Date(acknowledgedAt);
  const deliveryExpiry = new Date(delivery.expiresAt);
  const expiresAt = new Date(Math.min(deliveryExpiry.getTime(), issuedAt.getTime() + 300_000));
  if (expiresAt <= issuedAt) throw Object.assign(new Error("delivery_expired"), { status: 409 });
  return {
    callbackId: `provider_callback_${token}`,
    transferIntentId: delivery.transferIntentId,
    providerId: delivery.providerId,
    deliveryHash: delivery.deliveryHash,
    outcome: "accepted",
    reasonCode: "provider_accepted",
    providerEventRefHash: hashId("provider_sandbox_event_ref", {
      deliveryId: delivery.deliveryId,
      deliveryHash: delivery.deliveryHash
    }),
    nonce: `provider_nonce_${hashId("provider_sandbox_nonce", delivery.deliveryHash).slice(2, 42)}`,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    keyId: callbackKeyId
  };
}

function responseFor(record, callbackPrivateKey, replayed) {
  const callback = createSignedProviderSandboxCallback(record.callbackDescriptor, {
    privateKey: callbackPrivateKey
  });
  return {
    acknowledgement: record.acknowledgement,
    callback,
    replayed,
    schemaVersion: PROVIDER_SANDBOX_DELIVERY_RESULT_SCHEMA_VERSION
  };
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > RESPONSE_LIMIT) throw new Error("provider_sandbox_response_too_large");
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

const config = configuration();
let state = await loadState(config.stateFile);

const server = createServer(async (request, response) => {
  try {
    if (
      request.method !== "POST" || request.url !== PROVIDER_SANDBOX_DELIVERY_PATH ||
      request.headers.host !== `127.0.0.1:${config.port}` ||
      request.headers["content-type"] !== "application/json"
    ) {
      sendJson(response, 404, { code: "not_found" });
      return;
    }
    const envelope = await boundedJson(request);
    const verified = await verifyProviderDeliveryEnvelope(envelope, {
      keyResolver: async (keyId) => keyId === config.deliveryKeyId
        ? config.deliveryPublicKey
        : undefined
    });
    if (new Date(verified.delivery.expiresAt) <= new Date()) {
      throw Object.assign(new Error("delivery_expired"), { status: 409 });
    }
    const existing = state.deliveries[verified.delivery.deliveryId];
    if (existing) {
      if (
        existing.deliveryHash !== verified.delivery.deliveryHash ||
        existing.deliveryPayloadHash !== verified.payloadHash
      ) {
        throw Object.assign(new Error("delivery_replay_conflict"), { status: 409 });
      }
      sendJson(response, 200, responseFor(existing, config.callbackPrivateKey, true));
      return;
    }
    if (Object.values(state.deliveries).some((record) =>
      record.transferIntentId === verified.delivery.transferIntentId
    )) {
      throw Object.assign(new Error("transfer_intent_replay_conflict"), { status: 409 });
    }

    const acknowledgedAt = new Date().toISOString();
    const record = {
      deliveryId: verified.delivery.deliveryId,
      deliveryHash: verified.delivery.deliveryHash,
      deliveryPayloadHash: verified.payloadHash,
      transferIntentId: verified.delivery.transferIntentId,
      acknowledgement: {
        acknowledgementId: `provider_ack_${hashId("provider_sandbox_ack", verified.delivery.deliveryHash).slice(2, 34)}`,
        deliveryId: verified.delivery.deliveryId,
        deliveryHash: verified.delivery.deliveryHash,
        transferIntentId: verified.delivery.transferIntentId,
        providerId: verified.delivery.providerId,
        acknowledgedAt,
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        schemaVersion: "provider_intent_acknowledgement.v1"
      },
      callbackDescriptor: callbackDescriptor(verified.delivery, acknowledgedAt, config.callbackKeyId)
    };
    if (config.crashPoint === "before_commit") process.exit(71);
    state = {
      ...state,
      deliveries: { ...state.deliveries, [record.deliveryId]: record }
    };
    await saveState(config.stateFile, state);
    if (config.crashPoint === "after_commit") process.exit(72);
    sendJson(response, 200, responseFor(record, config.callbackPrivateKey, false));
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, error.status ?? (error?.code ? 401 : 400), {
        code: error.status === 409 ? "provider_sandbox_conflict" : "provider_sandbox_request_rejected"
      });
    } else {
      response.destroy();
    }
  }
});

server.requestTimeout = 2_000;
server.headersTimeout = 2_000;
server.keepAliveTimeout = 500;
server.maxRequestsPerSocket = 32;
server.on("error", () => process.exit(1));
server.listen(config.port, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ event: "provider_sandbox_ready", port: config.port })}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
