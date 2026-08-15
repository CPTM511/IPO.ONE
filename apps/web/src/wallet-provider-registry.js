import { createEvmWalletConnector } from "./evm-wallet-connector.js";

export const WALLET_PROVIDER_REGISTRY_SCHEMA_VERSION = "wallet_provider_registry.v1";
export const EIP6963_REQUEST_EVENT = "eip6963:requestProvider";
export const EIP6963_ANNOUNCE_EVENT = "eip6963:announceProvider";
export const LEGACY_WALLET_PROVIDER_ID = "legacy:globalThis.ethereum";
export const MOBILE_WALLET_PROVIDER_ID = "walletconnect:mobile-v2.23.10";

const EIP6963_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RDNS = /^[a-z0-9](?:[a-z0-9.-]{1,251})[a-z0-9]$/;
const SAFE_ICON =
  /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const UNSAFE_DISPLAY_CONTROLS =
  /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const PROVIDER_INFO_KEYS = new Set(["uuid", "name", "icon", "rdns"]);
const ANNOUNCEMENT_KEYS = new Set(["info", "provider"]);
const CONNECTOR_KEYS = new Set(["connector", "descriptor"]);
const CONNECTOR_DESCRIPTOR_KEYS = new Set([
  "connectorVersion",
  "name",
  "providerId",
  "source",
  "storage"
]);
const MAXIMUM_PROVIDERS = 16;
const MAXIMUM_RAW_NAME_LENGTH = 512;
const MAXIMUM_DISPLAY_NAME_LENGTH = 80;
const MAXIMUM_ICON_LENGTH = 32_768;
const DEFAULT_LEGACY_DELAY_MS = 150;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function isClosedDataObject(value, allowedKeys, requiredKeys) {
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
    Object.keys(descriptors).every((key) => allowedKeys.has(key)) &&
    requiredKeys.every((key) => Object.hasOwn(descriptors, key))
  );
}

function isProvider(value) {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) && typeof value.request === "function";
}

function displayName(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > MAXIMUM_RAW_NAME_LENGTH) {
    return "Unnamed wallet";
  }
  const normalized = value
    .normalize("NFKC")
    .replace(UNSAFE_DISPLAY_CONTROLS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Unnamed wallet";
  return normalized.length <= MAXIMUM_DISPLAY_NAME_LENGTH
    ? normalized
    : `${normalized.slice(0, MAXIMUM_DISPLAY_NAME_LENGTH - 1)}…`;
}

function iconDataUri(value) {
  return typeof value === "string" &&
    value.length <= MAXIMUM_ICON_LENGTH &&
    SAFE_ICON.test(value)
    ? value
    : undefined;
}

function normalizedRdns(value) {
  if (typeof value !== "string" || value.length > 253) return undefined;
  const normalized = value.toLowerCase();
  return RDNS.test(normalized) && !normalized.includes("..") ? normalized : undefined;
}

function normalizeAnnouncement(detail) {
  if (
    !isClosedDataObject(detail, ANNOUNCEMENT_KEYS, ["info", "provider"]) ||
    !isClosedDataObject(detail.info, PROVIDER_INFO_KEYS, ["uuid", "name", "icon", "rdns"]) ||
    !isProvider(detail.provider)
  ) {
    return null;
  }
  const uuid = typeof detail.info.uuid === "string" ? detail.info.uuid.toLowerCase() : "";
  if (!EIP6963_UUID.test(uuid)) return null;
  const icon = iconDataUri(detail.info.icon);
  const rdns = normalizedRdns(detail.info.rdns);
  return {
    provider: detail.provider,
    descriptor: {
      providerId: `eip6963:${uuid}`,
      source: "eip6963",
      uuid,
      name: displayName(detail.info.name),
      ...(icon === undefined ? {} : { iconDataUri: icon }),
      ...(rdns === undefined ? {} : { rdns })
    }
  };
}

function legacyRecord(provider) {
  return isProvider(provider)
    ? {
        provider,
        descriptor: {
          providerId: LEGACY_WALLET_PROVIDER_ID,
          source: "legacy_eip1193",
          name: "Browser wallet (legacy EIP-1193)"
        }
      }
    : null;
}

function connectorRecord(value) {
  if (
    !isClosedDataObject(value, CONNECTOR_KEYS, ["connector", "descriptor"]) ||
    !isClosedDataObject(
      value.descriptor,
      CONNECTOR_DESCRIPTOR_KEYS,
      [...CONNECTOR_DESCRIPTOR_KEYS]
    ) ||
    !value.connector ||
    typeof value.connector !== "object" ||
    typeof value.connector.descriptor !== "function" ||
    typeof value.connector.connect !== "function" ||
    typeof value.connector.getAccounts !== "function" ||
    typeof value.connector.getChain !== "function" ||
    typeof value.connector.getCapabilities !== "function" ||
    typeof value.connector.signTypedData !== "function" ||
    typeof value.connector.submitPreparedExecution !== "function" ||
    typeof value.connector.disconnect !== "function" ||
    value.descriptor.providerId !== MOBILE_WALLET_PROVIDER_ID ||
    value.descriptor.source !== "mobile_walletconnect" ||
    value.descriptor.connectorVersion !== "2.23.10" ||
    value.descriptor.storage !== "memory_only"
  ) {
    return null;
  }
  const normalizedDescriptor = value.connector.descriptor();
  if (
    normalizedDescriptor?.providerId !== MOBILE_WALLET_PROVIDER_ID ||
    normalizedDescriptor.walletTransport !== "walletconnect" ||
    normalizedDescriptor.rawProviderExposed !== false ||
    normalizedDescriptor.arbitraryCalldataAccepted !== false
  ) {
    return null;
  }
  return {
    connector: value.connector,
    providerReference: value.connector,
    descriptor: {
      providerId: MOBILE_WALLET_PROVIDER_ID,
      source: "mobile_walletconnect",
      name: displayName(value.descriptor.name),
      connectorVersion: "2.23.10",
      storage: "memory_only"
    }
  };
}

function compareProviderRecords(left, right) {
  const byName = left.descriptor.name.localeCompare(right.descriptor.name, "en", {
    sensitivity: "base"
  });
  return byName || left.descriptor.providerId.localeCompare(right.descriptor.providerId);
}

export function createWalletProviderRegistry({
  eventTarget,
  legacyProvider,
  onChange = () => {},
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  legacyFallbackDelayMs = DEFAULT_LEGACY_DELAY_MS
} = {}) {
  if (
    !eventTarget ||
    typeof eventTarget.addEventListener !== "function" ||
    typeof eventTarget.removeEventListener !== "function" ||
    typeof eventTarget.dispatchEvent !== "function" ||
    typeof onChange !== "function" ||
    typeof setTimer !== "function" ||
    typeof clearTimer !== "function" ||
    !Number.isSafeInteger(legacyFallbackDelayMs) ||
    legacyFallbackDelayMs < 0 ||
    legacyFallbackDelayMs > 1_000
  ) {
    throw new TypeError("Wallet Provider registry configuration is invalid");
  }

  const recordsById = new Map();
  const providerIdsByReference = new WeakMap();
  let selectedProviderId;
  let status = "discovering";
  let started = false;
  let fallbackTimer;

  function snapshot() {
    const providers = [...recordsById.values()]
      .sort(compareProviderRecords)
      .map((record) => ({ ...record.descriptor }));
    return deepFreeze({
      schemaVersion: WALLET_PROVIDER_REGISTRY_SCHEMA_VERSION,
      status,
      selectionRequired: providers.length > 0 && selectedProviderId === undefined,
      ...(selectedProviderId === undefined ? {} : { selectedProviderId }),
      providers,
      nonAuthorizing: true,
      credentialsIncluded: false,
      fundsAuthority: false,
      storage: "memory_only"
    });
  }

  function notify() {
    onChange(snapshot());
  }

  function addRecord(record, { emit = true } = {}) {
    if (record && !record.connector && isProvider(record.provider)) {
      record = {
        ...record,
        connector: createEvmWalletConnector({
          descriptor: record.descriptor,
          provider: record.provider
        }),
        providerReference: record.provider
      };
    }
    const providerReference = record?.providerReference;
    if (
      status === "disposed" ||
      !record ||
      !record.connector ||
      !providerReference ||
      recordsById.size >= MAXIMUM_PROVIDERS ||
      recordsById.has(record.descriptor.providerId) ||
      providerIdsByReference.has(providerReference)
    ) {
      return false;
    }
    recordsById.set(record.descriptor.providerId, record);
    providerIdsByReference.set(providerReference, record.descriptor.providerId);
    if (emit) notify();
    return true;
  }

  function announce(event) {
    addRecord(normalizeAnnouncement(event?.detail));
  }

  function finishDiscovery() {
    if (status === "disposed") return snapshot();
    if (fallbackTimer !== undefined) {
      clearTimer(fallbackTimer);
      fallbackTimer = undefined;
    }
    if (recordsById.size === 0) addRecord(legacyRecord(legacyProvider), { emit: false });
    status = "ready";
    notify();
    return snapshot();
  }

  function start() {
    if (started || status === "disposed") return snapshot();
    started = true;
    eventTarget.addEventListener(EIP6963_ANNOUNCE_EVENT, announce);
    eventTarget.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
    fallbackTimer = setTimer(finishDiscovery, legacyFallbackDelayMs);
    notify();
    return snapshot();
  }

  function rediscover() {
    if (!started || status === "disposed") return snapshot();
    if (fallbackTimer !== undefined) clearTimer(fallbackTimer);
    status = "discovering";
    eventTarget.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
    fallbackTimer = setTimer(finishDiscovery, legacyFallbackDelayMs);
    notify();
    return snapshot();
  }

  function selectProvider(providerId) {
    if (status === "disposed" || typeof providerId !== "string" || !recordsById.has(providerId)) {
      return false;
    }
    if (selectedProviderId === providerId) return true;
    recordsById.get(selectedProviderId)?.connector.invalidateContext(
      "wallet_provider_changed"
    );
    selectedProviderId = providerId;
    recordsById.get(selectedProviderId)?.connector.invalidateContext(
      "wallet_provider_changed"
    );
    notify();
    return true;
  }

  function clearSelection() {
    if (status === "disposed" || selectedProviderId === undefined) return false;
    recordsById.get(selectedProviderId)?.connector.invalidateContext(
      "wallet_provider_changed"
    );
    selectedProviderId = undefined;
    notify();
    return true;
  }

  function registerConnector(connector) {
    return addRecord(connectorRecord(connector));
  }

  function selectedConnector() {
    return selectedProviderId === undefined
      ? null
      : recordsById.get(selectedProviderId)?.connector ?? null;
  }

  function removeProvider(providerId, expectedProvider) {
    if (status === "disposed" || typeof providerId !== "string") return false;
    const record = recordsById.get(providerId);
    if (!record || (
      expectedProvider !== undefined &&
      record.providerReference !== expectedProvider &&
      record.connector !== expectedProvider
    )) return false;
    recordsById.delete(providerId);
    providerIdsByReference.delete(record.providerReference);
    record.connector.invalidateContext("wallet_provider_changed");
    if (selectedProviderId === providerId) selectedProviderId = undefined;
    notify();
    return true;
  }

  function dispose() {
    if (status === "disposed") return snapshot();
    if (started) eventTarget.removeEventListener(EIP6963_ANNOUNCE_EVENT, announce);
    if (fallbackTimer !== undefined) clearTimer(fallbackTimer);
    fallbackTimer = undefined;
    for (const record of recordsById.values()) record.connector.dispose();
    recordsById.clear();
    selectedProviderId = undefined;
    status = "disposed";
    notify();
    return snapshot();
  }

  return Object.freeze({
    start,
    rediscover,
    finishDiscovery,
    getSnapshot: snapshot,
    getSelectedConnector: selectedConnector,
    registerConnector,
    selectProvider,
    clearSelection,
    removeProvider,
    dispose
  });
}
