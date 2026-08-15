import {
  CreditEventType,
  DomainError,
  createCreditEvent,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  CoreProjectionType,
  PostgresCoreRepository
} from "../../persistence/src/index.js";
import {
  createHypercoreDelegateTombstone,
  createPreparedHypercoreDelegateFromHashes,
  transitionHypercoreDelegate,
  verifyHypercoreAccountBinding,
  verifyHypercoreDelegate,
  verifyHypercoreDelegateTombstone
} from "./hypercore-delegate.js";

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail("invalid_hypercore_delegate_persistence_input", `${name} is invalid`);
  }
  return value;
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(
      "invalid_hypercore_delegate_persistence_input",
      `${name} must be lowercase bytes32`
    );
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_hypercore_delegate_persistence_input", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function assertClient(client) {
  if (!client || typeof client.query !== "function") {
    fail("postgres_client_required", "an active PostgreSQL transaction client is required");
  }
}

function assertCoreRepository(coreRepository) {
  if (
    !coreRepository ||
    typeof coreRepository.commitCommandInTransaction !== "function" ||
    typeof coreRepository.getProjectionStateInTransaction !== "function"
  ) {
    fail(
      "postgres_repository_required",
      "a PostgresCoreRepository is required for HyperCore delegate persistence"
    );
  }
}

function preparationCommandHash({ binding, delegate }) {
  return hashId("hypercore_delegate_prepare_command", {
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash
  });
}

async function assertAddressUnused(client, apiWalletAddressHash) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext('hypercore_delegate_address'),
       hashtext($1)
     )`,
    [apiWalletAddressHash]
  );
  const result = await client.query(
    `SELECT 1
       FROM hypercore_api_wallet_delegates
      WHERE api_wallet_address_hash = $1
     UNION ALL
     SELECT 1
       FROM hypercore_delegate_tombstones
      WHERE api_wallet_address_hash = $1
      LIMIT 1`,
    [apiWalletAddressHash]
  );
  if (result.rowCount !== 0) {
    fail(
      "hypercore_delegate_address_reuse_denied",
      "an API-wallet address hash may be used only once"
    );
  }
}

export async function planHypercoreDelegatePreparation({
  client,
  coreRepository,
  bindingId,
  apiWalletAddressHash,
  signerReferenceHash,
  delegateNameHash,
  expiresAt,
  now,
  skipAddressCheck = false
}) {
  assertClient(client);
  assertCoreRepository(coreRepository);
  identifier("bindingId", bindingId);
  bytes32("apiWalletAddressHash", apiWalletAddressHash);
  bytes32("signerReferenceHash", signerReferenceHash);
  bytes32("delegateNameHash", delegateNameHash);
  const trustedNow = trustedDate("now", now);
  const trustedExpiresAt = trustedDate("expiresAt", expiresAt);
  const bindingState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.HYPERCORE_ACCOUNT_BINDING,
    bindingId,
    { lock: true }
  );
  if (!bindingState?.value) {
    fail("hypercore_account_binding_unavailable", "HyperCore account binding is unavailable");
  }
  verifyHypercoreAccountBinding(bindingState.value);
  const delegate = createPreparedHypercoreDelegateFromHashes({
    binding: bindingState.value,
    apiWalletAddressHash,
    signerReferenceHash,
    delegateNameHash,
    expiresAt: trustedExpiresAt,
    now: trustedNow
  });
  if (!skipAddressCheck) await assertAddressUnused(client, apiWalletAddressHash);
  const event = createCreditEvent({
    eventType: CreditEventType.HYPERCORE_DELEGATE_PREPARED,
    payload: {
      delegateId: delegate.delegateId,
      delegateHash: delegate.delegateHash,
      facilityId: delegate.facilityId,
      accountBindingId: delegate.accountBindingId,
      accountBindingHash: delegate.accountBindingHash,
      apiWalletAddressHash: delegate.apiWalletAddressHash,
      lifecycleVersion: delegate.lifecycleVersion,
      externalApprovalPerformed: false,
      productionAuthority: false,
      fundsAuthority: false
    },
    now: trustedNow
  });
  return Object.freeze({
    binding: bindingState.value,
    delegate,
    commandHash: preparationCommandHash({
      binding: bindingState.value,
      delegate
    }),
    plan: Object.freeze({
      aggregateType: "hypercore_delegate",
      aggregateId: delegate.delegateId,
      events: Object.freeze([Object.freeze({
        aggregateType: "hypercore_delegate",
        aggregateId: delegate.delegateId,
        expectedVersion: 0,
        event
      })]),
      writes: Object.freeze([Object.freeze({
        type: CoreProjectionType.HYPERCORE_API_WALLET_DELEGATE,
        value: delegate,
        eventId: event.eventId
      })])
    })
  });
}

export async function planHypercoreDelegateTermination({
  client,
  coreRepository,
  delegateId,
  expectedDelegateHash,
  status,
  reason,
  now
}) {
  assertClient(client);
  assertCoreRepository(coreRepository);
  identifier("delegateId", delegateId);
  bytes32("expectedDelegateHash", expectedDelegateHash);
  const trustedNow = trustedDate("now", now);
  const currentState = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.HYPERCORE_API_WALLET_DELEGATE,
    delegateId,
    { lock: true }
  );
  if (!currentState?.value || currentState.value.delegateHash !== expectedDelegateHash) {
    fail(
      "hypercore_delegate_concurrency_conflict",
      "delegate changed or is unavailable"
    );
  }
  verifyHypercoreDelegate(currentState.value);
  const delegate = transitionHypercoreDelegate(currentState.value, {
    status,
    reason,
    now: trustedNow
  });
  const tombstone = createHypercoreDelegateTombstone({ delegate });
  const event = createCreditEvent({
    eventType: CreditEventType.HYPERCORE_DELEGATE_TERMINATED,
    payload: {
      delegateId: delegate.delegateId,
      delegateHash: delegate.delegateHash,
      tombstoneId: tombstone.tombstoneId,
      tombstoneHash: tombstone.tombstoneHash,
      apiWalletAddressHash: delegate.apiWalletAddressHash,
      terminalStatus: delegate.status,
      terminalReason: delegate.terminalReason,
      lifecycleVersion: delegate.lifecycleVersion,
      productionAuthority: false,
      fundsAuthority: false
    },
    now: trustedNow
  });
  return Object.freeze({
    delegate,
    tombstone,
    commandHash: hashId("hypercore_delegate_terminate_command", {
      delegateId,
      expectedDelegateHash,
      status,
      reason,
      now: trustedNow.toISOString()
    }),
    plan: Object.freeze({
      aggregateType: "hypercore_delegate",
      aggregateId: delegate.delegateId,
      events: Object.freeze([Object.freeze({
        aggregateType: "hypercore_delegate",
        aggregateId: delegate.delegateId,
        expectedVersion: currentState.aggregateVersion,
        event
      })]),
      writes: Object.freeze([
        Object.freeze({
          type: CoreProjectionType.HYPERCORE_API_WALLET_DELEGATE,
          value: delegate,
          eventId: event.eventId
        }),
        Object.freeze({
          type: CoreProjectionType.HYPERCORE_DELEGATE_TOMBSTONE,
          value: tombstone,
          eventId: event.eventId
        })
      ])
    })
  });
}

export class PostgresHypercoreDelegateRepository {
  constructor({ coreRepository, pool, tenantContext } = {}) {
    this.coreRepository = coreRepository ??
      new PostgresCoreRepository({ pool, tenantContext });
    assertCoreRepository(this.coreRepository);
  }

  async recordBinding({ binding, idempotencyKey, now = new Date() }) {
    verifyHypercoreAccountBinding(binding);
    identifier("idempotencyKey", idempotencyKey);
    const trustedNow = trustedDate("now", now);
    const event = createCreditEvent({
      eventType: CreditEventType.HYPERCORE_ACCOUNT_BINDING_RECORDED,
      payload: {
        accountBindingId: binding.accountBindingId,
        accountBindingHash: binding.accountBindingHash,
        facilityId: binding.facilityId,
        facilityHash: binding.facilityHash,
        environment: binding.environment,
        bindingVersion: binding.bindingVersion,
        externalBindingPerformed: false,
        productionAuthority: false,
        fundsAuthority: false
      },
      now: trustedNow
    });
    const commandHash = hashId("hypercore_account_binding_record_command", {
      accountBindingHash: binding.accountBindingHash
    });
    const committed = await this.coreRepository.commitCommand({
      aggregateType: "hypercore_account_binding",
      aggregateId: binding.accountBindingId,
      idempotencyKey,
      commandHash,
      events: [{
        aggregateType: "hypercore_account_binding",
        aggregateId: binding.accountBindingId,
        expectedVersion: 0,
        event
      }],
      writes: [{
        type: CoreProjectionType.HYPERCORE_ACCOUNT_BINDING,
        value: binding,
        eventId: event.eventId
      }],
      response: { binding }
    });
    return committed.response.binding;
  }

  async prepare({
    bindingId,
    apiWalletAddressHash,
    signerReferenceHash,
    delegateNameHash,
    expiresAt,
    idempotencyKey,
    now = new Date()
  }) {
    identifier("idempotencyKey", idempotencyKey);
    return this.coreRepository.withTenantTransaction(async (client) => {
      const planned = await planHypercoreDelegatePreparation({
        client,
        coreRepository: this.coreRepository,
        bindingId,
        apiWalletAddressHash,
        signerReferenceHash,
        delegateNameHash,
        expiresAt,
        now,
        skipAddressCheck: true
      });
      const replay = await this.coreRepository.findCommandInTransaction(client, {
        idempotencyKey,
        commandHash: planned.commandHash,
        lock: true
      });
      if (replay) return replay.response.delegate;
      await assertAddressUnused(client, apiWalletAddressHash);
      const committed = await this.coreRepository.commitCommandInTransaction(client, {
        ...planned.plan,
        idempotencyKey,
        commandHash: planned.commandHash,
        response: { delegate: planned.delegate }
      });
      return committed.response.delegate;
    });
  }

  async terminate({
    delegateId,
    expectedDelegateHash,
    status,
    reason,
    idempotencyKey,
    now = new Date()
  }) {
    identifier("idempotencyKey", idempotencyKey);
    identifier("delegateId", delegateId);
    bytes32("expectedDelegateHash", expectedDelegateHash);
    const trustedNow = trustedDate("now", now);
    const commandHash = hashId("hypercore_delegate_terminate_command", {
      delegateId,
      expectedDelegateHash,
      status,
      reason,
      now: trustedNow.toISOString()
    });
    return this.coreRepository.withTenantTransaction(async (client) => {
      const replay = await this.coreRepository.findCommandInTransaction(client, {
        idempotencyKey,
        commandHash,
        lock: true
      });
      if (replay) return replay.response;
      const planned = await planHypercoreDelegateTermination({
        client,
        coreRepository: this.coreRepository,
        delegateId,
        expectedDelegateHash,
        status,
        reason,
        now: trustedNow
      });
      const committed = await this.coreRepository.commitCommandInTransaction(client, {
        ...planned.plan,
        idempotencyKey,
        commandHash: planned.commandHash,
        response: {
          delegate: planned.delegate,
          tombstone: planned.tombstone
        }
      });
      verifyHypercoreDelegateTombstone(committed.response.tombstone);
      return committed.response;
    });
  }

  findBinding(bindingId) {
    return this.coreRepository.getHypercoreAccountBinding(
      identifier("bindingId", bindingId)
    );
  }

  find(delegateId) {
    return this.coreRepository.getHypercoreApiWalletDelegate(
      identifier("delegateId", delegateId)
    );
  }

  findTombstone(tombstoneId) {
    return this.coreRepository.getHypercoreDelegateTombstone(
      identifier("tombstoneId", tombstoneId)
    );
  }

  async hasTombstone(apiWalletAddressHash) {
    bytes32("apiWalletAddressHash", apiWalletAddressHash);
    return this.coreRepository.eventRepository.withTenantRead(async (client) => {
      const result = await client.query(
        `SELECT 1 FROM hypercore_delegate_tombstones
          WHERE api_wallet_address_hash = $1`,
        [apiWalletAddressHash]
      );
      return result.rowCount === 1;
    });
  }
}
