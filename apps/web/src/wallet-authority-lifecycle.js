export const WALLET_AUTHORITY_LIFECYCLE_SCHEMA_VERSION =
  "wallet_authority_lifecycle.v1";

const MESSAGE_SCHEMA_VERSION = "wallet_authority_quarantine.v1";
const MATERIAL_REASONS = new Set([
  "wallet_account_changed",
  "wallet_chain_changed",
  "wallet_provider_changed",
  "wallet_provider_disconnected"
]);
const QUARANTINE_STATUSES = new Set(["pending", "invalidated", "unavailable"]);
const MESSAGE_KEYS = new Set(["schemaVersion", "type", "status", "reason"]);

function exactDataObject(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Object.values(descriptors).every((descriptor) => !descriptor.get && !descriptor.set) &&
    Object.keys(descriptors).length === keys.size &&
    Object.keys(descriptors).every((key) => keys.has(key))
  );
}

function checkedReason(value) {
  if (!MATERIAL_REASONS.has(value)) {
    throw new TypeError("Wallet authority lifecycle reason is invalid");
  }
  return value;
}

function checkedIdempotencyKey(value) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new TypeError("Wallet authority lifecycle idempotency key is invalid");
  }
  return value;
}

function validInvalidationResult(value) {
  return exactDataObject(value, new Set([
    "schemaVersion",
    "status",
    "reauthenticationRequired",
    "authorityAvailable",
    "credentialsIncluded",
    "fundsAuthority"
  ])) &&
    value.schemaVersion === "wallet_session_invalidation_result.v1" &&
    value.status === "invalidated" &&
    value.reauthenticationRequired === true &&
    value.authorityAvailable === false &&
    value.credentialsIncluded === false &&
    value.fundsAuthority === false;
}

function lifecycleError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createWalletAuthorityLifecycle({
  invalidateSession,
  onChange = () => {},
  broadcastChannel,
  createIdempotencyKey = () => `wallet_invalidation_${globalThis.crypto.randomUUID()}`
} = {}) {
  if (
    typeof invalidateSession !== "function" ||
    typeof onChange !== "function" ||
    typeof createIdempotencyKey !== "function" ||
    (
      broadcastChannel !== undefined &&
      (
        typeof broadcastChannel.postMessage !== "function" ||
        typeof broadcastChannel.addEventListener !== "function" ||
        typeof broadcastChannel.removeEventListener !== "function"
      )
    )
  ) {
    throw new TypeError("Wallet authority lifecycle configuration is invalid");
  }

  let status = "available";
  let reason;
  let contextEpoch = 0;
  let pendingInvalidation;
  let activeIdempotencyKey;
  let disposed = false;

  function snapshot() {
    return Object.freeze({
      schemaVersion: WALLET_AUTHORITY_LIFECYCLE_SCHEMA_VERSION,
      status,
      contextEpoch,
      reauthenticationRequired: status !== "available",
      protectedAuthorityAvailable: status === "available",
      canStartAuthentication: status === "available" || status === "invalidated",
      canRetryInvalidation:
        status === "unavailable" && activeIdempotencyKey !== undefined,
      ...(reason === undefined ? {} : { reason }),
      credentialsIncluded: false,
      fundsAuthority: false,
      storage: "memory_only"
    });
  }

  function notify() {
    onChange(snapshot());
  }

  function publish() {
    broadcastChannel?.postMessage({
      schemaVersion: MESSAGE_SCHEMA_VERSION,
      type: "wallet_authority_status",
      status,
      reason
    });
  }

  function transition(nextStatus, nextReason, { broadcast = true } = {}) {
    status = nextStatus;
    reason = nextReason;
    notify();
    if (broadcast) publish();
  }

  function receive(event) {
    if (disposed || !exactDataObject(event?.data, MESSAGE_KEYS)) return;
    const message = event.data;
    if (
      message.schemaVersion !== MESSAGE_SCHEMA_VERSION ||
      message.type !== "wallet_authority_status" ||
      !QUARANTINE_STATUSES.has(message.status) ||
      !MATERIAL_REASONS.has(message.reason)
    ) {
      return;
    }
    contextEpoch += 1;
    transition(message.status, message.reason, { broadcast: false });
  }

  broadcastChannel?.addEventListener("message", receive);

  function runInvalidation() {
    if (
      disposed ||
      reason === undefined ||
      activeIdempotencyKey === undefined ||
      !new Set(["available", "pending", "unavailable"]).has(status)
    ) {
      return Promise.resolve(snapshot());
    }
    transition("pending", reason);
    pendingInvalidation = (async () => {
      try {
        const result = await invalidateSession({
          reasonCode: reason,
          idempotencyKey: activeIdempotencyKey
        });
        if (!validInvalidationResult(result)) {
          throw lifecycleError(
            "wallet_invalidation_response_rejected",
            "Wallet session invalidation response is invalid"
          );
        }
        transition("invalidated", reason);
      } catch (error) {
        transition("unavailable", reason);
        throw error;
      } finally {
        pendingInvalidation = undefined;
      }
      return snapshot();
    })();
    return pendingInvalidation;
  }

  async function handleContextChange(changeReason, { serverAuthorityActive } = {}) {
    const checked = checkedReason(changeReason);
    contextEpoch += 1;
    if (disposed || serverAuthorityActive !== true) {
      notify();
      return snapshot();
    }
    if (status !== "available") return pendingInvalidation ?? snapshot();

    reason = checked;
    activeIdempotencyKey = checkedIdempotencyKey(createIdempotencyKey());
    return runInvalidation();
  }

  function retryInvalidation() {
    if (status !== "unavailable") return pendingInvalidation ?? Promise.resolve(snapshot());
    return runInvalidation();
  }

  function assertProtectedAvailable() {
    if (status !== "available") {
      throw lifecycleError(
        "wallet_authority_quarantined",
        "Wallet authority changed. Fresh sign-in is required."
      );
    }
  }

  function assertContextEpoch(expectedEpoch) {
    if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch !== contextEpoch) {
      throw lifecycleError(
        "wallet_context_changed",
        "Wallet context changed. Start a fresh wallet request."
      );
    }
  }

  function dispose() {
    if (disposed) return snapshot();
    disposed = true;
    broadcastChannel?.removeEventListener("message", receive);
    broadcastChannel?.close?.();
    return snapshot();
  }

  notify();
  return Object.freeze({
    assertContextEpoch,
    assertProtectedAvailable,
    dispose,
    getSnapshot: snapshot,
    handleContextChange,
    retryInvalidation
  });
}
