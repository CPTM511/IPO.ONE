import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";

export const HYPERCORE_ACCOUNT_BINDING_SCHEMA_VERSION =
  "hypercore_account_binding.v1";
export const HYPERCORE_API_WALLET_DELEGATE_SCHEMA_VERSION =
  "hypercore_api_wallet_delegate.v1";
export const HYPERCORE_DELEGATE_TOMBSTONE_SCHEMA_VERSION =
  "hypercore_delegate_tombstone.v1";

export const HypercoreAccountRole = Object.freeze({
  MASTER: "master",
  SUBACCOUNT: "subaccount"
});

export const HypercoreDelegateStatus = Object.freeze({
  PREPARED: "PREPARED",
  SIMULATED_ACTIVE: "SIMULATED_ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
  COMPROMISED: "COMPROMISED",
  RETIRED: "RETIRED"
});

const TERMINAL_STATUSES = new Set([
  HypercoreDelegateStatus.REVOKED,
  HypercoreDelegateStatus.EXPIRED,
  HypercoreDelegateStatus.COMPROMISED,
  HypercoreDelegateStatus.RETIRED
]);
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const MAX_DELEGATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function exactShape(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_hypercore_delegate_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    fail(
      "invalid_hypercore_delegate_input",
      `${name} has an invalid closed shape`
    );
  }
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_delegate_input", `${name} is invalid`);
  }
  return value;
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_hypercore_delegate_input", `${name} must be lowercase bytes32`);
  }
  return value;
}

function address(name, value) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail(
      "invalid_hypercore_account_address",
      `${name} must be a lower-case EVM address`
    );
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_delegate_input", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail("invalid_hypercore_delegate_input", `${name} must be ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_hypercore_delegate_input", `${name} must be canonical ISO time`);
  }
  return parsed;
}

function accountAddressHash(value) {
  return hashId("hypercore_account_address", value);
}

function accountBindingCore(value) {
  return {
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    environment: value.environment,
    accountRole: value.accountRole,
    masterAccountAddressHash: value.masterAccountAddressHash,
    subaccountAddressHash: value.subaccountAddressHash,
    canonicalAccountAddressHash: value.canonicalAccountAddressHash,
    queryAddressHash: value.queryAddressHash,
    bindingProofHash: value.bindingProofHash,
    bindingVersion: value.bindingVersion,
    status: value.status,
    signerAddressIsAccountIdentity: value.signerAddressIsAccountIdentity,
    apiWalletAddressAcceptedForInfo: value.apiWalletAddressAcceptedForInfo,
    externalBindingPerformed: value.externalBindingPerformed,
    sandboxOnly: value.sandboxOnly,
    testnetOnly: value.testnetOnly,
    mainnetAuthority: value.mainnetAuthority,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    secretsIncluded: value.secretsIncluded,
    schemaVersion: value.schemaVersion
  };
}

export function createHypercoreAccountBinding(input) {
  exactShape("HyperCore account binding input", input, [
    "facilityId",
    "facilityHash",
    "accountRole",
    "masterAccountAddress",
    "subaccountAddress",
    "bindingProofHash",
    "bindingVersion"
  ]);
  identifier("facilityId", input.facilityId);
  bytes32("facilityHash", input.facilityHash);
  bytes32("bindingProofHash", input.bindingProofHash);
  const master = address("masterAccountAddress", input.masterAccountAddress);
  const subaccount =
    input.subaccountAddress === null
      ? null
      : address("subaccountAddress", input.subaccountAddress);
  if (!Object.values(HypercoreAccountRole).includes(input.accountRole)) {
    fail("invalid_hypercore_account_binding", "account role is unavailable");
  }
  if (
    (input.accountRole === HypercoreAccountRole.MASTER && subaccount !== null) ||
    (input.accountRole === HypercoreAccountRole.SUBACCOUNT &&
      (subaccount === null || subaccount === master))
  ) {
    fail(
      "invalid_hypercore_account_binding",
      "master/subaccount identity is inconsistent"
    );
  }
  if (!Number.isSafeInteger(input.bindingVersion) || input.bindingVersion < 1) {
    fail("invalid_hypercore_account_binding", "bindingVersion is invalid");
  }
  const masterAccountAddressHash = accountAddressHash(master);
  const subaccountAddressHash = subaccount ? accountAddressHash(subaccount) : null;
  const canonicalAccountAddressHash =
    input.accountRole === HypercoreAccountRole.MASTER
      ? masterAccountAddressHash
      : subaccountAddressHash;
  const value = {
    facilityId: input.facilityId,
    facilityHash: input.facilityHash,
    environment: "hyperliquid_testnet",
    accountRole: input.accountRole,
    masterAccountAddressHash,
    subaccountAddressHash,
    canonicalAccountAddressHash,
    queryAddressHash: canonicalAccountAddressHash,
    bindingProofHash: input.bindingProofHash,
    bindingVersion: input.bindingVersion,
    status: "active",
    signerAddressIsAccountIdentity: false,
    apiWalletAddressAcceptedForInfo: false,
    externalBindingPerformed: false,
    sandboxOnly: true,
    testnetOnly: true,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    secretsIncluded: false,
    schemaVersion: HYPERCORE_ACCOUNT_BINDING_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "hypercoreAccountBinding");
  const accountBindingHash = hashId("hypercore_account_binding", value);
  return cloneFreeze({
    accountBindingId: `hypercore_account_binding_${accountBindingHash.slice(2)}`,
    accountBindingHash,
    ...value
  });
}

export function verifyHypercoreAccountBinding(value) {
  exactShape("HyperCore account binding", value, [
    "accountBindingId",
    "accountBindingHash",
    "facilityId",
    "facilityHash",
    "environment",
    "accountRole",
    "masterAccountAddressHash",
    "subaccountAddressHash",
    "canonicalAccountAddressHash",
    "queryAddressHash",
    "bindingProofHash",
    "bindingVersion",
    "status",
    "signerAddressIsAccountIdentity",
    "apiWalletAddressAcceptedForInfo",
    "externalBindingPerformed",
    "sandboxOnly",
    "testnetOnly",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "secretsIncluded",
    "schemaVersion"
  ]);
  bytes32("accountBindingHash", value.accountBindingHash);
  bytes32("facilityHash", value.facilityHash);
  bytes32("masterAccountAddressHash", value.masterAccountAddressHash);
  bytes32("subaccountAddressHash", value.subaccountAddressHash, { nullable: true });
  bytes32("canonicalAccountAddressHash", value.canonicalAccountAddressHash);
  bytes32("queryAddressHash", value.queryAddressHash);
  bytes32("bindingProofHash", value.bindingProofHash);
  const expectedCanonical =
    value.accountRole === HypercoreAccountRole.MASTER
      ? value.masterAccountAddressHash
      : value.subaccountAddressHash;
  if (
    value.schemaVersion !== HYPERCORE_ACCOUNT_BINDING_SCHEMA_VERSION ||
    value.accountBindingId !==
      `hypercore_account_binding_${value.accountBindingHash.slice(2)}` ||
    !Object.values(HypercoreAccountRole).includes(value.accountRole) ||
    (value.accountRole === HypercoreAccountRole.MASTER &&
      value.subaccountAddressHash !== null) ||
    (value.accountRole === HypercoreAccountRole.SUBACCOUNT &&
      value.subaccountAddressHash === null) ||
    value.canonicalAccountAddressHash !== expectedCanonical ||
    value.queryAddressHash !== expectedCanonical ||
    value.environment !== "hyperliquid_testnet" ||
    !Number.isSafeInteger(value.bindingVersion) ||
    value.bindingVersion < 1 ||
    value.status !== "active" ||
    value.signerAddressIsAccountIdentity !== false ||
    value.apiWalletAddressAcceptedForInfo !== false ||
    value.externalBindingPerformed !== false ||
    value.sandboxOnly !== true ||
    value.testnetOnly !== true ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.secretsIncluded !== false ||
    hashId("hypercore_account_binding", accountBindingCore(value)) !==
      value.accountBindingHash
  ) {
    fail(
      "invalid_hypercore_account_binding",
      "account binding is inconsistent"
    );
  }
  return true;
}

export function assertHypercoreInfoQueryIdentity({
  binding,
  queryAddress,
  apiWalletAddress = null
}) {
  verifyHypercoreAccountBinding(binding);
  const queryHash = accountAddressHash(address("queryAddress", queryAddress));
  if (queryHash !== binding.queryAddressHash) {
    fail(
      "hypercore_info_query_identity_denied",
      "Info must query the bound master/subaccount address"
    );
  }
  if (apiWalletAddress !== null) {
    const signerHash = accountAddressHash(
      address("apiWalletAddress", apiWalletAddress)
    );
    if (queryHash === signerHash) {
      fail(
        "hypercore_api_wallet_query_denied",
        "an API-wallet signing identity cannot be used as account identity"
      );
    }
  }
  return true;
}

function delegateImmutableCore(value) {
  return {
    facilityId: value.facilityId,
    facilityHash: value.facilityHash,
    environment: value.environment,
    accountBindingId: value.accountBindingId,
    accountBindingHash: value.accountBindingHash,
    canonicalAccountAddressHash: value.canonicalAccountAddressHash,
    apiWalletAddressHash: value.apiWalletAddressHash,
    signerReferenceHash: value.signerReferenceHash,
    delegateNameHash: value.delegateNameHash,
    preparedAt: value.preparedAt,
    expiresAt: value.expiresAt
  };
}

function delegateRecordCore(value) {
  const core = structuredClone(value);
  delete core.delegateId;
  delete core.delegateHash;
  return core;
}

function preparedDelegateFromHashes({
  binding,
  apiWalletAddressHash,
  signerReferenceHash,
  delegateNameHash,
  expiresAt: expiresAtInput,
  now: nowInput
}) {
  verifyHypercoreAccountBinding(binding);
  const now = trustedDate("now", nowInput);
  const expiresAt = trustedDate("expiresAt", expiresAtInput);
  if (
    expiresAt <= now ||
    expiresAt.getTime() - now.getTime() > MAX_DELEGATE_LIFETIME_MS
  ) {
    fail("invalid_hypercore_delegate_expiry", "delegate lifetime is unavailable");
  }
  bytes32("apiWalletAddressHash", apiWalletAddressHash);
  if (
    apiWalletAddressHash === binding.masterAccountAddressHash ||
    apiWalletAddressHash === binding.subaccountAddressHash
  ) {
    fail(
      "hypercore_delegate_account_identity_conflict",
      "the API-wallet signer must be distinct from the account identity"
    );
  }
  bytes32("signerReferenceHash", signerReferenceHash);
  bytes32("delegateNameHash", delegateNameHash);
  const value = {
    facilityId: binding.facilityId,
    facilityHash: binding.facilityHash,
    environment: binding.environment,
    accountBindingId: binding.accountBindingId,
    accountBindingHash: binding.accountBindingHash,
    canonicalAccountAddressHash: binding.canonicalAccountAddressHash,
    apiWalletAddressHash,
    signerReferenceHash,
    delegateNameHash,
    status: HypercoreDelegateStatus.PREPARED,
    preparedAt: now.toISOString(),
    activatedAt: null,
    terminalAt: null,
    expiresAt: expiresAt.toISOString(),
    terminalReason: null,
    lifecycleVersion: 1,
    externalApprovalPerformed: false,
    venueRegistrationVerified: false,
    rawAddressPersisted: false,
    rawKeyAccepted: false,
    rawKeyPersisted: false,
    reusableSignaturePersisted: false,
    withdrawalAuthority: false,
    transferAuthority: false,
    accountAdministrationAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    secretsIncluded: false,
    schemaVersion: HYPERCORE_API_WALLET_DELEGATE_SCHEMA_VERSION
  };
  const immutableHash = hashId(
    "hypercore_api_wallet_delegate_identity",
    delegateImmutableCore(value)
  );
  const record = {
    delegateId: `hypercore_delegate_${immutableHash.slice(2)}`,
    delegateHash: hashId("hypercore_api_wallet_delegate", value),
    ...value
  };
  assertNoRawPiiReference(record, "hypercoreApiWalletDelegate");
  return cloneFreeze(record);
}

export function createPreparedHypercoreDelegate(input) {
  exactShape("HyperCore delegate preparation input", input, [
    "binding",
    "apiWalletAddress",
    "signerReferenceHash",
    "delegateName",
    "expiresAt",
    "now"
  ]);
  const apiWalletAddressHash = accountAddressHash(
    address("apiWalletAddress", input.apiWalletAddress)
  );
  identifier("delegateName", input.delegateName);
  return preparedDelegateFromHashes({
    binding: input.binding,
    apiWalletAddressHash,
    signerReferenceHash: input.signerReferenceHash,
    delegateNameHash: hashId("hypercore_delegate_name", input.delegateName),
    expiresAt: input.expiresAt,
    now: input.now
  });
}

export function createPreparedHypercoreDelegateFromHashes(input) {
  exactShape("HyperCore hash-only delegate preparation input", input, [
    "binding",
    "apiWalletAddressHash",
    "signerReferenceHash",
    "delegateNameHash",
    "expiresAt",
    "now"
  ]);
  return preparedDelegateFromHashes(input);
}

export function verifyHypercoreDelegate(value, { now, requireUsable = false } = {}) {
  exactShape("HyperCore API-wallet delegate", value, [
    "delegateId",
    "delegateHash",
    "facilityId",
    "facilityHash",
    "environment",
    "accountBindingId",
    "accountBindingHash",
    "canonicalAccountAddressHash",
    "apiWalletAddressHash",
    "signerReferenceHash",
    "delegateNameHash",
    "status",
    "preparedAt",
    "activatedAt",
    "terminalAt",
    "expiresAt",
    "terminalReason",
    "lifecycleVersion",
    "externalApprovalPerformed",
    "venueRegistrationVerified",
    "rawAddressPersisted",
    "rawKeyAccepted",
    "rawKeyPersisted",
    "reusableSignaturePersisted",
    "withdrawalAuthority",
    "transferAuthority",
    "accountAdministrationAuthority",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "secretsIncluded",
    "schemaVersion"
  ]);
  bytes32("delegateHash", value.delegateHash);
  bytes32("facilityHash", value.facilityHash);
  bytes32("accountBindingHash", value.accountBindingHash);
  bytes32("canonicalAccountAddressHash", value.canonicalAccountAddressHash);
  bytes32("apiWalletAddressHash", value.apiWalletAddressHash);
  bytes32("signerReferenceHash", value.signerReferenceHash);
  bytes32("delegateNameHash", value.delegateNameHash);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const activatedAt = value.activatedAt === null ? null : timestamp("activatedAt", value.activatedAt);
  const terminalAt = value.terminalAt === null ? null : timestamp("terminalAt", value.terminalAt);
  const terminal = TERMINAL_STATUSES.has(value.status);
  if (value.terminalReason !== null) identifier("terminalReason", value.terminalReason);
  const immutableHash = hashId(
    "hypercore_api_wallet_delegate_identity",
    delegateImmutableCore(value)
  );
  if (
    value.schemaVersion !== HYPERCORE_API_WALLET_DELEGATE_SCHEMA_VERSION ||
    value.delegateId !== `hypercore_delegate_${immutableHash.slice(2)}` ||
    value.delegateHash !==
      hashId("hypercore_api_wallet_delegate", delegateRecordCore(value)) ||
    !Object.values(HypercoreDelegateStatus).includes(value.status) ||
    expiresAt <= preparedAt ||
    expiresAt.getTime() - preparedAt.getTime() > MAX_DELEGATE_LIFETIME_MS ||
    !Number.isSafeInteger(value.lifecycleVersion) ||
    value.lifecycleVersion < 1 ||
    (value.status === HypercoreDelegateStatus.PREPARED && activatedAt !== null) ||
    (value.status === HypercoreDelegateStatus.SIMULATED_ACTIVE && activatedAt === null) ||
    (activatedAt !== null &&
      (activatedAt < preparedAt || activatedAt >= expiresAt)) ||
    (terminalAt !== null &&
      (terminalAt < preparedAt ||
        (activatedAt !== null && terminalAt < activatedAt))) ||
    terminal !== (terminalAt !== null) ||
    terminal !== (value.terminalReason !== null) ||
    value.externalApprovalPerformed !== false ||
    value.venueRegistrationVerified !== false ||
    value.rawAddressPersisted !== false ||
    value.rawKeyAccepted !== false ||
    value.rawKeyPersisted !== false ||
    value.reusableSignaturePersisted !== false ||
    value.withdrawalAuthority !== false ||
    value.transferAuthority !== false ||
    value.accountAdministrationAuthority !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.secretsIncluded !== false
  ) {
    fail("invalid_hypercore_delegate", "delegate record is inconsistent");
  }
  if (requireUsable) {
    const current = trustedDate("now", now);
    if (
      value.status !== HypercoreDelegateStatus.SIMULATED_ACTIVE ||
      expiresAt <= current
    ) {
      fail("hypercore_delegate_unusable", "delegate is not usable in local simulation");
    }
  }
  return true;
}

export function transitionHypercoreDelegate(delegate, { status, reason, now }) {
  verifyHypercoreDelegate(delegate);
  const current = trustedDate("now", now);
  if (TERMINAL_STATUSES.has(delegate.status)) {
    fail("hypercore_delegate_terminal", "terminal delegate state cannot change");
  }
  if (
    status === HypercoreDelegateStatus.SIMULATED_ACTIVE &&
    delegate.status !== HypercoreDelegateStatus.PREPARED
  ) {
    fail("hypercore_delegate_transition_denied", "delegate activation is out of order");
  }
  if (
    status !== HypercoreDelegateStatus.SIMULATED_ACTIVE &&
    !TERMINAL_STATUSES.has(status)
  ) {
    fail("hypercore_delegate_transition_denied", "delegate transition is unavailable");
  }
  if (
    status === HypercoreDelegateStatus.SIMULATED_ACTIVE &&
    current >= new Date(delegate.expiresAt)
  ) {
    fail("hypercore_delegate_expired", "an expired delegate cannot be activated");
  }
  const terminal = TERMINAL_STATUSES.has(status);
  if (terminal && (typeof reason !== "string" || !IDENTIFIER.test(reason))) {
    fail("invalid_hypercore_delegate_input", "terminal reason is required");
  }
  if (!terminal && reason !== null) {
    fail("invalid_hypercore_delegate_input", "activation cannot carry a terminal reason");
  }
  const value = {
    ...structuredClone(delegate),
    status,
    activatedAt:
      status === HypercoreDelegateStatus.SIMULATED_ACTIVE
        ? current.toISOString()
        : delegate.activatedAt,
    terminalAt: terminal ? current.toISOString() : null,
    terminalReason: terminal ? reason : null,
    lifecycleVersion: delegate.lifecycleVersion + 1
  };
  delete value.delegateHash;
  const recordCore = structuredClone(value);
  delete recordCore.delegateId;
  value.delegateHash = hashId("hypercore_api_wallet_delegate", recordCore);
  return cloneFreeze(value);
}

export function createHypercoreDelegateTombstone({ delegate }) {
  exactShape("HyperCore delegate tombstone input", { delegate }, ["delegate"]);
  verifyHypercoreDelegate(delegate);
  if (!TERMINAL_STATUSES.has(delegate.status)) {
    fail(
      "hypercore_delegate_transition_denied",
      "only a terminal delegate can create a tombstone"
    );
  }
  const value = {
    delegateId: delegate.delegateId,
    delegateHash: delegate.delegateHash,
    facilityId: delegate.facilityId,
    accountBindingId: delegate.accountBindingId,
    apiWalletAddressHash: delegate.apiWalletAddressHash,
    terminalStatus: delegate.status,
    terminalReason: delegate.terminalReason,
    terminalAt: delegate.terminalAt,
    addressReuseAllowed: false,
    rawAddressPersisted: false,
    rawKeyPersisted: false,
    reusableSignaturePersisted: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    secretsIncluded: false,
    schemaVersion: HYPERCORE_DELEGATE_TOMBSTONE_SCHEMA_VERSION
  };
  const tombstoneHash = hashId("hypercore_delegate_tombstone", value);
  const record = {
    tombstoneId: `hypercore_delegate_tombstone_${tombstoneHash.slice(2)}`,
    tombstoneHash,
    ...value
  };
  assertNoRawPiiReference(record, "hypercoreDelegateTombstone");
  return cloneFreeze(record);
}

export function verifyHypercoreDelegateTombstone(value) {
  exactShape("HyperCore delegate tombstone", value, [
    "tombstoneId",
    "tombstoneHash",
    "delegateId",
    "delegateHash",
    "facilityId",
    "accountBindingId",
    "apiWalletAddressHash",
    "terminalStatus",
    "terminalReason",
    "terminalAt",
    "addressReuseAllowed",
    "rawAddressPersisted",
    "rawKeyPersisted",
    "reusableSignaturePersisted",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "secretsIncluded",
    "schemaVersion"
  ]);
  bytes32("tombstoneHash", value.tombstoneHash);
  bytes32("delegateHash", value.delegateHash);
  bytes32("apiWalletAddressHash", value.apiWalletAddressHash);
  identifier("tombstoneId", value.tombstoneId);
  identifier("delegateId", value.delegateId);
  identifier("facilityId", value.facilityId);
  identifier("accountBindingId", value.accountBindingId);
  identifier("terminalReason", value.terminalReason);
  timestamp("terminalAt", value.terminalAt);
  const core = structuredClone(value);
  delete core.tombstoneId;
  delete core.tombstoneHash;
  if (
    value.schemaVersion !== HYPERCORE_DELEGATE_TOMBSTONE_SCHEMA_VERSION ||
    !TERMINAL_STATUSES.has(value.terminalStatus) ||
    value.tombstoneHash !== hashId("hypercore_delegate_tombstone", core) ||
    value.tombstoneId !==
      `hypercore_delegate_tombstone_${value.tombstoneHash.slice(2)}` ||
    value.addressReuseAllowed !== false ||
    value.rawAddressPersisted !== false ||
    value.rawKeyPersisted !== false ||
    value.reusableSignaturePersisted !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    value.secretsIncluded !== false
  ) {
    fail("invalid_hypercore_delegate_tombstone", "delegate tombstone is inconsistent");
  }
  return true;
}

export class InMemoryHypercoreDelegateRepository {
  #records = new Map();
  #addressOwners = new Map();
  #tombstones = new Set();
  #queue = Promise.resolve();

  constructor(snapshot) {
    if (snapshot === undefined) return;
    exactShape("delegate repository snapshot", snapshot, ["records", "tombstones"]);
    if (!Array.isArray(snapshot.records) || !Array.isArray(snapshot.tombstones)) {
      fail("invalid_hypercore_delegate_snapshot", "snapshot arrays are required");
    }
    for (const record of snapshot.records) {
      verifyHypercoreDelegate(record);
      this.#records.set(record.delegateId, cloneFreeze(record));
      this.#addressOwners.set(record.apiWalletAddressHash, record.delegateId);
    }
    for (const item of snapshot.tombstones) {
      bytes32("tombstone", item);
      this.#tombstones.add(item);
    }
  }

  #exclusive(operation) {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => {});
    return next;
  }

  async prepare(input) {
    return this.#exclusive(async () => {
      const delegate = createPreparedHypercoreDelegate(input);
      if (
        this.#addressOwners.has(delegate.apiWalletAddressHash) ||
        this.#tombstones.has(delegate.apiWalletAddressHash)
      ) {
        fail(
          "hypercore_delegate_address_reuse_denied",
          "an API-wallet address may be used only once"
        );
      }
      this.#records.set(delegate.delegateId, delegate);
      this.#addressOwners.set(delegate.apiWalletAddressHash, delegate.delegateId);
      return delegate;
    });
  }

  async simulateActivation({ delegateId, expectedDelegateHash, now }) {
    return this.#exclusive(async () => {
      const current = this.#records.get(identifier("delegateId", delegateId));
      if (!current || current.delegateHash !== bytes32("expectedDelegateHash", expectedDelegateHash)) {
        fail("hypercore_delegate_concurrency_conflict", "delegate changed or is unavailable");
      }
      const next = transitionHypercoreDelegate(current, {
        status: HypercoreDelegateStatus.SIMULATED_ACTIVE,
        reason: null,
        now
      });
      this.#records.set(delegateId, next);
      return next;
    });
  }

  async terminate({ delegateId, expectedDelegateHash, status, reason, now }) {
    return this.#exclusive(async () => {
      if (!TERMINAL_STATUSES.has(status)) {
        fail("hypercore_delegate_transition_denied", "terminal status is required");
      }
      const current = this.#records.get(identifier("delegateId", delegateId));
      if (!current || current.delegateHash !== bytes32("expectedDelegateHash", expectedDelegateHash)) {
        fail("hypercore_delegate_concurrency_conflict", "delegate changed or is unavailable");
      }
      const next = transitionHypercoreDelegate(current, { status, reason, now });
      this.#records.set(delegateId, next);
      this.#tombstones.add(next.apiWalletAddressHash);
      return next;
    });
  }

  async rotate({ delegateId, expectedDelegateHash, reason, replacement }) {
    return this.#exclusive(async () => {
      const current = this.#records.get(identifier("delegateId", delegateId));
      if (!current || current.delegateHash !== bytes32("expectedDelegateHash", expectedDelegateHash)) {
        fail("hypercore_delegate_concurrency_conflict", "delegate changed or is unavailable");
      }
      const retired = transitionHypercoreDelegate(current, {
        status: HypercoreDelegateStatus.RETIRED,
        reason,
        now: replacement.now
      });
      const next = createPreparedHypercoreDelegate(replacement);
      if (
        next.facilityId !== retired.facilityId ||
        next.accountBindingHash !== retired.accountBindingHash ||
        next.apiWalletAddressHash === retired.apiWalletAddressHash ||
        this.#addressOwners.has(next.apiWalletAddressHash) ||
        this.#tombstones.has(next.apiWalletAddressHash)
      ) {
        fail(
          "hypercore_delegate_rotation_denied",
          "rotation requires the same binding and a never-used fresh address"
        );
      }
      this.#records.set(delegateId, retired);
      this.#tombstones.add(retired.apiWalletAddressHash);
      this.#records.set(next.delegateId, next);
      this.#addressOwners.set(next.apiWalletAddressHash, next.delegateId);
      return cloneFreeze({ retired, replacement: next });
    });
  }

  async find(delegateId) {
    const value = this.#records.get(identifier("delegateId", delegateId));
    return value ? cloneFreeze(value) : undefined;
  }

  hasTombstone(apiWalletAddressHash) {
    return this.#tombstones.has(bytes32("apiWalletAddressHash", apiWalletAddressHash));
  }

  exportSnapshot() {
    return cloneFreeze({
      records: [...this.#records.values()].map((value) => structuredClone(value)),
      tombstones: [...this.#tombstones].sort()
    });
  }
}

export function describeHypercoreDelegateBoundary() {
  return Object.freeze({
    accountIdentity: "master_or_subaccount",
    signingIdentity: "api_wallet_delegate",
    signerAddressIsAccountIdentity: false,
    infoQueriesUseApiWalletAddress: false,
    externalApproveAgentEnabled: false,
    localSimulatedActivationOnly: true,
    addressReuseAllowed: false,
    rawKeyAccepted: false,
    rawKeyPersisted: false,
    testnetWriteAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
