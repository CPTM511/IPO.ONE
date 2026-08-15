import { pathToFileURL } from "node:url";
import pg from "pg";
import { hashId } from "../../packages/domain/src/index.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../modules/persistence/src/index.js";
import {
  HypercoreDelegateStatus,
  PostgresHypercoreDelegateRepository,
  PostgresHypercoreStableExecutionRepository,
  PostgresHypercoreTestnetSubmissionRepository,
  retireHypercoreTestnetSignerHandoff
} from "../../modules/hypercore-venue-adapter/src/index.js";
import {
  destroyHypercoreIsolatedTestnetSigner,
  withHypercoreIsolatedTestnetSigner
} from "./hypercore-isolated-signer.mjs";

const { Pool } = pg;
const INFO_ENDPOINT = "https://api.hyperliquid-testnet.xyz/info";
const TENANT_ID = "tenant_ipo_one_local_pilot";
const ACTOR_ID = "actor_hypercore_execution_owner";
const PARENT_INTENT_HASH =
  "0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5";
const CANCEL_INTENT_HASH =
  "0x773eb0c6262e91681ba2f526d0ece54e1397b70b8d76224361d5020fc77dc381";
const TARGET_CLOID = "0x3ec931145cbe6e36213621b50521a704";
const TARGET_VENUE_ORDER_ID = 57670774189;
const EXPECTED_ACCOUNT_ADDRESS_HASH =
  "0xda35abd4f31d5e8c9a5d87f289535c6164d1d587c49bb1deb206f906a1802038";
const EXPECTED_API_WALLET_ADDRESS_HASH =
  "0x1d1911fcbdb3809a1530f1e0740e23e04ff795239f0b497674a2c756322acea1";
const EXPECTED_SIGNER_REFERENCE_HASH =
  "0x8d51f324c056a411552c4945e30d1091e4c2036790e90022417c230ad38f5be3";
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`hypercore_002d_final_closure_error: ${message}`);
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
}

async function postInfo(body, name) {
  const response = await fetch(INFO_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) fail(`${name} query failed`);
  try {
    return JSON.parse(await response.text());
  } catch {
    fail(`${name} returned invalid JSON`);
  }
}

function exactTerminalObservation({
  masterRole,
  apiWalletRole,
  accountState,
  openOrders,
  orderStatus,
  observedAt
}) {
  const order = orderStatus?.order?.order;
  if (masterRole?.role !== "user" || apiWalletRole?.role !== "agent" ||
    !Array.isArray(openOrders) || openOrders.length !== 0 ||
    !Array.isArray(accountState?.assetPositions) || accountState.assetPositions.length !== 0 ||
    orderStatus?.status !== "order" || orderStatus.order?.status !== "canceled" ||
    order?.coin !== "BTC" || order.side !== "B" ||
    Number(order.limitPx) !== 62500 || Number(order.sz) !== 0.00016 ||
    order.cloid !== TARGET_CLOID || Number(order.oid) !== TARGET_VENUE_ORDER_ID) {
    fail("venue order/account terminal truth is missing or drifted");
  }
  const accountValue = String(accountState.marginSummary?.accountValue ?? "");
  const withdrawable = String(accountState.withdrawable ?? "");
  if (!/^\d+(?:\.\d+)?$/.test(accountValue) || !/^\d+(?:\.\d+)?$/.test(withdrawable)) {
    fail("terminal account values are unavailable");
  }
  const venueOrderState = {
    status: "canceled",
    market: "BTC",
    assetIndex: 3,
    side: "buy",
    limitPx: "62500",
    size: "0.00016",
    cloid: TARGET_CLOID,
    venueOrderId: TARGET_VENUE_ORDER_ID,
    openOrderCount: 0,
    observedAt
  };
  const venueAccountState = {
    masterRole: "user",
    apiWalletRole: "agent",
    accountValue,
    withdrawable,
    positionCount: 0,
    openOrderCount: 0,
    observedAt
  };
  return Object.freeze({
    venueOrderState,
    venueAccountState,
    venueOrderStateHash: hashId("hypercore_002d_terminal_order_state", venueOrderState),
    venueAccountStateHash: hashId("hypercore_002d_terminal_account_state", venueAccountState),
    sourceHashes: Object.freeze({
      masterRoleHash: hashId("hypercore_info_response", masterRole),
      apiWalletRoleHash: hashId("hypercore_info_response", apiWalletRole),
      accountStateHash: hashId("hypercore_info_response", accountState),
      openOrdersHash: hashId("hypercore_info_response", openOrders),
      orderStatusHash: hashId("hypercore_info_response", orderStatus)
    })
  });
}

async function runCli() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
  if (process.env.IPO_ONE_HYPERCORE_STABLE_CANCEL_INTENT_HASH !== CANCEL_INTENT_HASH ||
    process.env.IPO_ONE_APPROVE_HYPERCORE_TESTNET_RETIRE !==
      `HYPERLIQUID-002D-RETIRE:${CANCEL_INTENT_HASH}`) {
    fail("exact cancel-bound retirement marker is required");
  }
  const masterAddress = String(
    process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS ?? ""
  ).toLowerCase();
  const signerKeyPath = process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_KEY_PATH;
  if (!ADDRESS.test(masterAddress) ||
    hashId("hypercore_account_address", masterAddress) !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
    typeof signerKeyPath !== "string") {
    fail("reviewed master and isolated signer path are required");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    application_name: "ipo-one-hypercore-002d-final-closure"
  });
  const context = tenantContext();
  const eventRepository = new PostgresEventRepository({ pool, tenantContext: context });
  const stableRepository = new PostgresHypercoreStableExecutionRepository({
    eventRepository
  });
  const coreRepository = new PostgresCoreRepository({ pool, tenantContext: context });
  const delegateRepository = new PostgresHypercoreDelegateRepository({ coreRepository });
  const submissionRepository = new PostgresHypercoreTestnetSubmissionRepository({
    eventRepository
  });
  try {
    const [parent, cancel] = await Promise.all([
      stableRepository.findByHash(PARENT_INTENT_HASH),
      stableRepository.findByHash(CANCEL_INTENT_HASH)
    ]);
    if (!parent || !cancel || parent.state !== "SUBMITTED" || cancel.state !== "SUBMITTED" ||
      parent.disposition !== "confirmed" || cancel.disposition !== "confirmed" ||
      cancel.parentIntentHash !== parent.intentHash ||
      cancel.targetOrder.cloid !== TARGET_CLOID ||
      cancel.targetOrder.venueOrderId !== TARGET_VENUE_ORDER_ID ||
      cancel.canonicalAccountAddressHash !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
      cancel.apiWalletAddressHash !== EXPECTED_API_WALLET_ADDRESS_HASH ||
      cancel.signerReferenceHash !== EXPECTED_SIGNER_REFERENCE_HASH) {
      fail("confirmed parent/cancel durable truth is missing or drifted");
    }

    const observedAt = new Date().toISOString();
    const observation = await withHypercoreIsolatedTestnetSigner(
      signerKeyPath,
      async ({ descriptor, transientApiWalletAddress }) => {
        if (descriptor.apiWalletAddressHash !== cancel.apiWalletAddressHash ||
          descriptor.signerReferenceHash !== cancel.signerReferenceHash) {
          fail("isolated signer identity drifted before retirement");
        }
        const [masterRole, apiWalletRole, accountState, openOrders, orderStatus] =
          await Promise.all([
            postInfo({ type: "userRole", user: masterAddress }, "master role"),
            postInfo({ type: "userRole", user: transientApiWalletAddress }, "API wallet role"),
            postInfo({ type: "clearinghouseState", user: masterAddress }, "account state"),
            postInfo({ type: "openOrders", user: masterAddress }, "open orders"),
            postInfo({ type: "orderStatus", user: masterAddress, oid: TARGET_CLOID }, "order status")
          ]);
        return exactTerminalObservation({
          masterRole,
          apiWalletRole,
          accountState,
          openOrders,
          orderStatus,
          observedAt
        });
      }
    );

    const facility = await coreRepository.getTradingFacility(cancel.facilityId);
    if (!facility || facility.facilityHash !== cancel.facilityHash ||
      facility.productionAuthority !== false || facility.fundsAuthority !== false) {
      fail("canonical local Facility is missing or unsafe");
    }
    const ledgerState = {
      facilityId: facility.tradingFacilityId,
      facilityHash: facility.facilityHash,
      facilityLifecycleStatus: facility.lifecycleStatus,
      facilityRiskState: facility.riskState,
      parentIntentHash: parent.intentHash,
      cancelIntentHash: cancel.intentHash,
      venueOrderStateHash: observation.venueOrderStateHash,
      venueAccountStateHash: observation.venueAccountStateHash,
      openOrderCount: 0,
      positionCount: 0,
      productionAuthority: false,
      realFundsAuthority: false
    };
    const ledgerStateHash = hashId("hypercore_002d_terminal_ledger_state", ledgerState);
    const obligationEvidence = {
      parentIntentHash: parent.intentHash,
      cancelIntentHash: cancel.intentHash,
      targetOrderHash: cancel.targetOrderHash,
      payloadHash: cancel.payloadHash,
      venueOrderStateHash: observation.venueOrderStateHash,
      venueAccountStateHash: observation.venueAccountStateHash,
      ledgerStateHash,
      outcome: "canceled_without_fill",
      observedAt
    };
    const obligationEvidenceHash = hashId(
      "hypercore_002d_terminal_obligation_evidence",
      obligationEvidence
    );
    const commonHashes = {
      venueOrderStateHash: observation.venueOrderStateHash,
      venueAccountStateHash: observation.venueAccountStateHash,
      ledgerStateHash,
      obligationEvidenceHash
    };
    const parentReconciled = await stableRepository.reconcile({
      intentId: parent.intentId,
      reconciliationHash: hashId("hypercore_002d_parent_terminal_reconciliation", {
        intentHash: parent.intentHash,
        ...commonHashes,
        observedAt
      }),
      ...commonHashes,
      now: new Date(observedAt)
    });
    const cancelReconciled = await stableRepository.reconcile({
      intentId: cancel.intentId,
      reconciliationHash: hashId("hypercore_002d_cancel_terminal_reconciliation", {
        intentHash: cancel.intentHash,
        ...commonHashes,
        observedAt
      }),
      ...commonHashes,
      now: new Date(observedAt)
    });

    const delegate = await delegateRepository.find(cancel.delegateId);
    if (!delegate || delegate.delegateHash !== cancel.delegateHash ||
      delegate.apiWalletAddressHash !== cancel.apiWalletAddressHash) {
      fail("delegate retirement target is missing or drifted");
    }
    const retirementAt = new Date();
    const terminated = await delegateRepository.terminate({
      delegateId: delegate.delegateId,
      expectedDelegateHash: delegate.delegateHash,
      status: HypercoreDelegateStatus.RETIRED,
      reason: "bounded_testnet_execution_closed",
      idempotencyKey: `hypercore-002d-final-retire-${cancel.intentHash}`,
      now: retirementAt
    });
    const destruction = await destroyHypercoreIsolatedTestnetSigner(signerKeyPath);
    const retirementEvidenceHash = hashId("hypercore_002d_signer_retirement", {
      cancelIntentHash: cancel.intentHash,
      parentIntentHash: parent.intentHash,
      tombstoneHash: terminated.tombstone.tombstoneHash,
      keyPathHash: destruction.keyPathHash,
      logicallyDestroyed: destruction.logicallyDestroyed,
      destroyedAt: destruction.destroyedAt,
      observedAt
    });
    const handoff = await submissionRepository.findSignerHandoff(cancel.handoffId);
    const retiredHandoff = retireHypercoreTestnetSignerHandoff({
      handoff,
      retirementEvidenceHash,
      now: new Date(destruction.destroyedAt)
    });
    await submissionRepository.retireSignerHandoff(retiredHandoff);
    const parentClosed = await stableRepository.close({
      intentId: parent.intentId,
      now: new Date()
    });
    const cancelClosed = await stableRepository.close({
      intentId: cancel.intentId,
      now: new Date()
    });

    const readback = await eventRepository.withTenantRead((client) => client.query(
      `SELECT
         (SELECT count(*)::int FROM hypercore_stable_execution_intents
           WHERE id IN ($1, $2) AND state = 'CLOSED') AS closed_intents,
         (SELECT count(*)::int FROM hypercore_stable_execution_transitions
           WHERE intent_id IN ($1, $2) AND next_state IN ('RECONCILED', 'CLOSED'))
           AS closure_transitions,
         (SELECT count(*)::int FROM hypercore_delegate_tombstones
           WHERE delegate_id = $3 AND terminal_status = 'RETIRED') AS tombstones,
         (SELECT count(*)::int FROM hypercore_testnet_signer_handoffs
           WHERE id = $4 AND status = 'RETIRED') AS retired_handoffs`,
      [parent.intentId, cancel.intentId, cancel.delegateId, cancel.handoffId]
    ));
    console.log(`HYPERCORE_002D_FINAL_CLOSED ${JSON.stringify({
      issueId: "HYPERLIQUID-002D",
      decision: "VERIFIED_TESTNET_CLOSED",
      parentIntentHash: parentClosed.intentHash,
      cancelIntentHash: cancelClosed.intentHash,
      targetOrderHash: cancel.targetOrderHash,
      parentReconciliationHash: parentClosed.reconciliationHash,
      cancelReconciliationHash: cancelClosed.reconciliationHash,
      venueOrderStateHash: cancelClosed.venueOrderStateHash,
      venueAccountStateHash: cancelClosed.venueAccountStateHash,
      ledgerStateHash: cancelClosed.ledgerStateHash,
      obligationEvidenceHash: cancelClosed.obligationEvidenceHash,
      signerRetirementHash: cancelClosed.signerRetirementHash,
      delegateTombstoneHash: terminated.tombstone.tombstoneHash,
      keyPathHash: destruction.keyPathHash,
      keyLogicallyDestroyed: destruction.logicallyDestroyed,
      storageMediumSecureEraseClaimed: destruction.storageMediumSecureEraseClaimed,
      parentState: parentClosed.state,
      cancelState: cancelClosed.state,
      venueOrderStatus: observation.venueOrderState.status,
      openOrderCount: observation.venueAccountState.openOrderCount,
      positionCount: observation.venueAccountState.positionCount,
      observedAt,
      destroyedAt: destruction.destroyedAt,
      durableReadback: readback.rows[0],
      externalDeregistrationPerformed: false,
      exchangeWritePerformedDuringClosure: false,
      rawAddressPersisted: false,
      rawKeyPersisted: false,
      rawSignaturePersisted: false,
      rawResponsePersisted: false,
      automaticRetry: false,
      mainnetAuthority: false,
      productionAuthority: false,
      realFundsAuthority: false,
      sourceHashes: observation.sourceHashes,
      schemaVersion: "hypercore_002d_final_closure.v1"
    })}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
