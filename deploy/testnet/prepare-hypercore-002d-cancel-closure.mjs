import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { hashId } from "../../packages/domain/src/index.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../modules/persistence/src/index.js";
import {
  HYPERCORE_002D_CANCEL_TARGET_CLOID,
  PostgresHypercoreDelegateRepository,
  PostgresHypercoreStableExecutionRepository,
  PostgresHypercoreTestnetSubmissionRepository,
  createHypercoreStableCancelPolicyConstraint
} from "../../modules/hypercore-venue-adapter/src/index.js";
import { withHypercoreIsolatedTestnetSigner } from "./hypercore-isolated-signer.mjs";
import { collectHypercore002dCancelReadiness } from "./prepare-hypercore-002d-proof.mjs";

const { Pool } = pg;
const TENANT_ID = "tenant_ipo_one_local_pilot";
const ACTOR_ID = "actor_local_system";
const PARENT_INTENT_HASH =
  "0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5";
const EXPECTED_ACCOUNT_ADDRESS_HASH =
  "0xda35abd4f31d5e8c9a5d87f289535c6164d1d587c49bb1deb206f906a1802038";
const EXPECTED_ACCOUNT_BINDING_HASH =
  "0x21398d62dfc114228399ce00543ecbe2a4721b7d06fc8db3017f5e0ca17f4be8";
const EXPECTED_DELEGATE_HASH =
  "0x2d98609ff479184904e4cbfd75962bd90f4c2fbbd1727f1dc071711a686f97da";
const EXPECTED_HANDOFF_HASH =
  "0x1914e382c7b84315c9ec81300240bf305369810805e261bd0efa6519c20fa82f";
const EXPECTED_API_WALLET_ADDRESS_HASH =
  "0x1d1911fcbdb3809a1530f1e0740e23e04ff795239f0b497674a2c756322acea1";
const EXPECTED_SIGNER_REFERENCE_HASH =
  "0x8d51f324c056a411552c4945e30d1091e4c2036790e90022417c230ad38f5be3";
const EXPECTED_REGISTRATION_REQUEST_HASH =
  "0x7903ed662ca1b3225ba4e57f53fac4d1fa4a289a68f05bc18df4a1fe1d30bf0a";
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`hypercore_002d_cancel_prepare_error: ${message}`);
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
}

export async function prepareHypercore002dStableCancelIntent({
  pool,
  facilityId,
  facilityHash,
  masterAddress,
  descriptor,
  readiness,
  now
}) {
  const context = tenantContext();
  const eventRepository = new PostgresEventRepository({ pool, tenantContext: context });
  const coreRepository = new PostgresCoreRepository({
    pool,
    tenantContext: context,
    transactionRetries: 10
  });
  const stableRepository = new PostgresHypercoreStableExecutionRepository({
    eventRepository
  });
  const [facility, parent] = await Promise.all([
    coreRepository.getTradingFacility(facilityId),
    stableRepository.findByHash(PARENT_INTENT_HASH)
  ]);
  if (!facility || facility.facilityHash !== facilityHash ||
    facility.lifecycleStatus !== "active" || facility.riskState !== "NORMAL" ||
    facility.withdrawable !== false || facility.transferable !== false ||
    facility.sandboxOnly !== true || facility.syntheticOnly !== true ||
    facility.productionAuthority !== false || facility.fundsAuthority !== false) {
    fail("canonical local Facility is absent, inactive or drifted");
  }
  if (!parent || parent.state !== "SUBMITTED" || parent.disposition !== "confirmed" ||
    parent.intentHash !== PARENT_INTENT_HASH ||
    parent.hyperliquidAction.orders[0].c !== HYPERCORE_002D_CANCEL_TARGET_CLOID ||
    parent.facilityId !== facilityId || parent.facilityHash !== facilityHash) {
    fail("confirmed exact parent intent is unavailable");
  }

  const counts = await eventRepository.withTenantRead((client) => client.query(
    `SELECT
       (SELECT count(*)::int FROM hypercore_testnet_submission_attempts
         WHERE facility_id = $1 AND state = 'UNKNOWN') AS unknown_v1,
       (SELECT count(*)::int FROM hypercore_stable_execution_intents
         WHERE intent->>'facilityId' = $1 AND state = 'UNKNOWN') AS unknown_stable,
       (SELECT count(*)::int FROM hypercore_stable_execution_intents
         WHERE parent_intent_id = $2 AND external_submission_attempted) AS prior_cancel_attempts`,
    [facilityId, parent.intentId]
  ));
  const count = counts.rows[0];
  if (count.unknown_v1 !== 0 || count.unknown_stable !== 0) {
    fail("unreconciled UNKNOWN execution blocks cancellation signing authority");
  }
  if (count.prior_cancel_attempts !== 0) {
    fail("a cancellation submission was already attempted for the parent order");
  }

  const delegateIds = await eventRepository.withTenantRead((client) => client.query(
    `SELECT id FROM hypercore_api_wallet_delegates
      WHERE delegate_hash = $1 AND account_binding_hash = $2`,
    [EXPECTED_DELEGATE_HASH, EXPECTED_ACCOUNT_BINDING_HASH]
  ));
  if (delegateIds.rowCount !== 1) fail("canonical API-wallet delegate is unavailable");
  const bindingId = `hypercore_account_binding_${EXPECTED_ACCOUNT_BINDING_HASH.slice(2)}`;
  const handoffId = `hypercore_testnet_handoff_${EXPECTED_HANDOFF_HASH.slice(2)}`;
  const delegateId = delegateIds.rows[0].id;
  const delegateRepository = new PostgresHypercoreDelegateRepository({ coreRepository });
  const submissionRepository = new PostgresHypercoreTestnetSubmissionRepository({
    eventRepository
  });
  const [binding, delegate, handoff, tombstoned] = await Promise.all([
    delegateRepository.findBinding(bindingId),
    delegateRepository.find(delegateId),
    submissionRepository.findSignerHandoff(handoffId),
    delegateRepository.hasTombstone(EXPECTED_API_WALLET_ADDRESS_HASH)
  ]);
  if (!binding || binding.accountBindingHash !== EXPECTED_ACCOUNT_BINDING_HASH ||
    binding.facilityId !== facilityId || binding.facilityHash !== facilityHash ||
    binding.canonicalAccountAddressHash !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
    !delegate || delegate.delegateHash !== EXPECTED_DELEGATE_HASH ||
    delegate.apiWalletAddressHash !== EXPECTED_API_WALLET_ADDRESS_HASH ||
    delegate.signerReferenceHash !== EXPECTED_SIGNER_REFERENCE_HASH ||
    !handoff || handoff.handoffHash !== EXPECTED_HANDOFF_HASH ||
    handoff.status !== "VERIFIED" || now >= new Date(handoff.expiresAt) || tombstoned ||
    descriptor.apiWalletAddressHash !== delegate.apiWalletAddressHash ||
    descriptor.signerReferenceHash !== delegate.signerReferenceHash ||
    hashId("hypercore_account_address", masterAddress) !==
      binding.canonicalAccountAddressHash) {
    fail("canonical binding, delegate or isolated signer drifted");
  }

  const targetOrder = readiness.targetOrder;
  if (targetOrder.parentIntentHash !== parent.intentHash ||
    targetOrder.parentIntentId !== parent.intentId ||
    targetOrder.cloid !== HYPERCORE_002D_CANCEL_TARGET_CLOID) {
    fail("read-only target order does not match the parent intent");
  }
  const policyConstraint = createHypercoreStableCancelPolicyConstraint({
    policyId: "hypercore_testnet_btc_proof_002d_cancel",
    policyVersion: "adr_039_closure.v1",
    facilityHash,
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash,
    signerReferenceHash: delegate.signerReferenceHash,
    parentIntentHash: parent.intentHash,
    targetOrderHash: targetOrder.targetOrderHash,
    targetClientOrderId: targetOrder.cloid,
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
  const hyperliquidAction = Object.freeze({
    type: "cancelByCloid",
    cancels: [Object.freeze({ asset: 3, cloid: targetOrder.cloid })]
  });
  const sourceHash = hashId("hypercore_002d_cancel_exact_source", {
    parentIntentHash: parent.intentHash,
    targetOrderHash: targetOrder.targetOrderHash,
    facilityHash,
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash,
    observedAt: readiness.observedAt
  });
  const prepared = await stableRepository.prepareCancel({
    draft: {
      facilityId,
      facilityHash,
      accountBindingId: binding.accountBindingId,
      accountBindingHash: binding.accountBindingHash,
      canonicalAccountAddressHash: binding.canonicalAccountAddressHash,
      handoffId: handoff.handoffId,
      handoffHash: handoff.handoffHash,
      delegateId: delegate.delegateId,
      delegateHash: delegate.delegateHash,
      apiWalletAddressHash: delegate.apiWalletAddressHash,
      signerReferenceHash: delegate.signerReferenceHash,
      parentIntentId: parent.intentId,
      parentIntentHash: parent.intentHash,
      targetOrder,
      policyConstraint,
      hyperliquidAction
    },
    idempotencyKey: `hypercore-002d-cancel-${sourceHash}`,
    now
  });
  return Object.freeze({
    parent,
    intent: prepared.intent,
    policyConstraint,
    replayed: prepared.replayed,
    priorCancelSubmissionCount: count.prior_cancel_attempts
  });
}

async function runCli() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
  const masterAddress = String(
    process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS ?? ""
  ).toLowerCase();
  const signerKeyPath = process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_KEY_PATH;
  const facilityId = process.env.IPO_ONE_HYPERCORE_TESTNET_FACILITY_ID;
  const facilityHash = process.env.IPO_ONE_HYPERCORE_TESTNET_FACILITY_HASH;
  const resultFile = process.env.IPO_ONE_HYPERCORE_REGISTRATION_RESULT_FILE;
  if (!ADDRESS.test(masterAddress) ||
    hashId("hypercore_account_address", masterAddress) !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
    typeof signerKeyPath !== "string" || typeof facilityId !== "string" ||
    !HASH.test(facilityHash ?? "") || typeof resultFile !== "string") {
    fail("reviewed Testnet master, signer, Facility and registration inputs are required");
  }
  const registrationResult = JSON.parse(await readFile(resultFile, "utf8"));
  if (registrationResult.requestHash !== EXPECTED_REGISTRATION_REQUEST_HASH ||
    registrationResult.status !== "REGISTERED" ||
    registrationResult.automaticRetry !== false ||
    registrationResult.rawSignaturePersisted !== false ||
    registrationResult.rawResponsePersisted !== false) {
    fail("one-use registration result is missing or drifted");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    application_name: "ipo-one-hypercore-002d-cancel-prepare"
  });
  try {
    const output = await withHypercoreIsolatedTestnetSigner(
      signerKeyPath,
      async ({ descriptor, transientApiWalletAddress }) => {
        const eventRepository = new PostgresEventRepository({
          pool,
          tenantContext: tenantContext()
        });
        const stableRepository = new PostgresHypercoreStableExecutionRepository({
          eventRepository
        });
        const parent = await stableRepository.findByHash(PARENT_INTENT_HASH);
        if (!parent) fail("confirmed parent intent is missing");
        const now = new Date();
        const readiness = await collectHypercore002dCancelReadiness({
          fetchImpl: fetch,
          masterAddress,
          apiWalletAddress: transientApiWalletAddress,
          parentIntent: parent,
          now
        });
        const prepared = await prepareHypercore002dStableCancelIntent({
          pool,
          facilityId,
          facilityHash,
          masterAddress,
          descriptor,
          readiness,
          now
        });
        return {
          metadataArtifact: readiness.metadataArtifact,
          report: {
            issueId: "HYPERLIQUID-002D",
            adr: "ADR-039-Closure-Addendum",
            decision: "READY_FOR_EXACT_CANCEL_APPROVAL",
            intentId: prepared.intent.intentId,
            intentHash: prepared.intent.intentHash,
            exactApprovalMarker: `HYPERLIQUID-002D-CANCEL:${prepared.intent.intentHash}`,
            parentIntentHash: prepared.intent.parentIntentHash,
            targetOrderHash: prepared.intent.targetOrderHash,
            targetOrder: prepared.intent.targetOrder,
            payloadHash: prepared.intent.payloadHash,
            policyConstraintHash: prepared.intent.policyConstraintHash,
            proposedAction: prepared.intent.hyperliquidAction,
            accountBindingHash: prepared.intent.accountBindingHash,
            canonicalAccountAddressHash: prepared.intent.canonicalAccountAddressHash,
            delegateHash: prepared.intent.delegateHash,
            handoffHash: prepared.intent.handoffHash,
            signerReferenceHash: prepared.intent.signerReferenceHash,
            apiWalletAddressHash: prepared.intent.apiWalletAddressHash,
            facilityId,
            facilityHash,
            durableNonce: prepared.intent.nonce,
            state: prepared.intent.state,
            preparedAt: prepared.intent.preparedAt,
            approvalExpiresAt: prepared.intent.approvalExpiresAt,
            stableApprovalWindowMs: 30 * 60_000,
            jitRiskWindowMs: prepared.policyConstraint.maxRiskAgeMs,
            expectedOpenOrdersAtJit: 1,
            expectedPositionsAtJit: 0,
            replayed: prepared.replayed,
            priorCancelSubmissionCount: prepared.priorCancelSubmissionCount,
            safety: {
              exchangeWriteAttempted: false,
              signatureCreated: false,
              rawAddressPersisted: false,
              rawKeyPersisted: false,
              rawSignaturePersisted: false,
              rawResponsePersisted: false,
              automaticRetry: false,
              retryAllowed: false,
              mainnetAuthority: false,
              productionAuthority: false,
              realFundsAuthority: false
            },
            schemaVersion: "hypercore_002d_stable_cancel_preparation.v1"
          }
        };
      }
    );
    console.log(`HYPERCORE_002D_CANCEL_PREPARED ${JSON.stringify(output)}`);
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
