import assert from "node:assert/strict";
import test from "node:test";
import { createWalletAuthorityLifecycle } from "../src/wallet-authority-lifecycle.js";

const RESULT = Object.freeze({
  schemaVersion: "wallet_session_invalidation_result.v1",
  status: "invalidated",
  reauthenticationRequired: true,
  authorityAvailable: false,
  credentialsIncluded: false,
  fundsAuthority: false
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

function broadcastHub() {
  const channels = new Set();
  return {
    channel() {
      const listeners = new Set();
      const channel = {
        addEventListener(type, listener) {
          if (type === "message") listeners.add(listener);
        },
        removeEventListener(type, listener) {
          if (type === "message") listeners.delete(listener);
        },
        postMessage(data) {
          for (const other of channels) {
            if (other !== channel) other.deliver(data);
          }
        },
        deliver(data) {
          for (const listener of listeners) listener({ data: structuredClone(data) });
        },
        close() {
          channels.delete(channel);
          listeners.clear();
        }
      };
      channels.add(channel);
      return channel;
    }
  };
}

test("one wallet change quarantines every tab before the durable invalidation resolves", async () => {
  const hub = broadcastHub();
  const pending = deferred();
  const calls = [];
  const tabA = createWalletAuthorityLifecycle({
    broadcastChannel: hub.channel(),
    createIdempotencyKey: () => "wallet-cross-tab-idempotency-00000000000001",
    invalidateSession(input) {
      calls.push(structuredClone(input));
      return pending.promise;
    }
  });
  const tabB = createWalletAuthorityLifecycle({
    broadcastChannel: hub.channel(),
    createIdempotencyKey: () => "wallet-unused-idempotency-0000000000000001",
    async invalidateSession() {
      throw new Error("receiving tab must not duplicate invalidation");
    }
  });

  const invalidation = tabA.handleContextChange("wallet_account_changed", {
    serverAuthorityActive: true
  });
  assert.equal(tabA.getSnapshot().status, "pending");
  assert.equal(tabB.getSnapshot().status, "pending");
  assert.throws(
    () => tabA.assertProtectedAvailable(),
    (error) => error.code === "wallet_authority_quarantined"
  );
  assert.throws(
    () => tabB.assertProtectedAvailable(),
    (error) => error.code === "wallet_authority_quarantined"
  );
  assert.equal(calls.length, 1);

  pending.resolve(RESULT);
  await invalidation;
  assert.equal(tabA.getSnapshot().status, "invalidated");
  assert.equal(tabB.getSnapshot().status, "invalidated");
  assert.equal(tabA.getSnapshot().canStartAuthentication, true);
  assert.equal(tabB.getSnapshot().protectedAuthorityAvailable, false);
  assert.equal(calls.length, 1);

  tabA.dispose();
  tabB.dispose();
});

test("network failure stays closed and retry reuses the exact idempotency key", async () => {
  const keys = [];
  let attempts = 0;
  const lifecycle = createWalletAuthorityLifecycle({
    createIdempotencyKey: () => "wallet-retry-idempotency-000000000000000001",
    async invalidateSession(input) {
      keys.push(input.idempotencyKey);
      attempts += 1;
      if (attempts === 1) throw new Error("network unavailable");
      return RESULT;
    }
  });

  await assert.rejects(
    () => lifecycle.handleContextChange("wallet_chain_changed", {
      serverAuthorityActive: true
    }),
    /network unavailable/
  );
  assert.equal(lifecycle.getSnapshot().status, "unavailable");
  assert.equal(lifecycle.getSnapshot().canStartAuthentication, false);
  assert.throws(
    () => lifecycle.assertProtectedAvailable(),
    (error) => error.code === "wallet_authority_quarantined"
  );

  await lifecycle.retryInvalidation();
  assert.equal(lifecycle.getSnapshot().status, "invalidated");
  assert.deepEqual(keys, [
    "wallet-retry-idempotency-000000000000000001",
    "wallet-retry-idempotency-000000000000000001"
  ]);
});

test("a pre-session Provider event abandons the old challenge epoch without claiming server authority", async () => {
  let invalidations = 0;
  const lifecycle = createWalletAuthorityLifecycle({
    createIdempotencyKey: () => "wallet-pre-session-idempotency-0000000000001",
    async invalidateSession() {
      invalidations += 1;
      return RESULT;
    }
  });
  const oldEpoch = lifecycle.getSnapshot().contextEpoch;
  await lifecycle.handleContextChange("wallet_provider_changed", {
    serverAuthorityActive: false
  });
  assert.equal(lifecycle.getSnapshot().status, "available");
  assert.equal(lifecycle.getSnapshot().contextEpoch, oldEpoch + 1);
  assert.equal(invalidations, 0);
  assert.throws(
    () => lifecycle.assertContextEpoch(oldEpoch),
    (error) => error.code === "wallet_context_changed"
  );
  lifecycle.assertContextEpoch(oldEpoch + 1);
});

test("unknown cross-tab messages and open invalidation results cannot restore authority", async () => {
  const hub = broadcastHub();
  const channel = hub.channel();
  const lifecycle = createWalletAuthorityLifecycle({
    broadcastChannel: channel,
    createIdempotencyKey: () => "wallet-invalid-result-idempotency-00000000001",
    async invalidateSession() {
      return { ...RESULT, authorityAvailable: true };
    }
  });
  channel.deliver({
    schemaVersion: "wallet_authority_quarantine.v1",
    type: "wallet_authority_status",
    status: "available",
    reason: "wallet_account_changed"
  });
  assert.equal(lifecycle.getSnapshot().status, "available");

  await assert.rejects(
    () => lifecycle.handleContextChange("wallet_provider_disconnected", {
      serverAuthorityActive: true
    }),
    (error) => error.code === "wallet_invalidation_response_rejected"
  );
  assert.equal(lifecycle.getSnapshot().status, "unavailable");
  assert.equal(lifecycle.getSnapshot().protectedAuthorityAvailable, false);
});
