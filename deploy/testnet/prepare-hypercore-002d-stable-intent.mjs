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
  PostgresHypercoreDelegateRepository,
  PostgresHypercoreStableExecutionRepository,
  PostgresHypercoreTestnetSubmissionRepository,
  createHypercoreStablePolicyConstraint
} from "../../modules/hypercore-venue-adapter/src/index.js";
import { withHypercoreIsolatedTestnetSigner } from "./hypercore-isolated-signer.mjs";
import { collectHypercore002dReadiness } from "./prepare-hypercore-002d-proof.mjs";

const { Pool } = pg;
const TENANT_ID = "tenant_ipo_one_local_pilot";
const ACTOR_ID = "actor_local_system";
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
  throw new Error(`hypercore_002d_stable_prepare_error: ${message}`);
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
}

function exactAction({ readiness, cloid }) {
  return Object.freeze({
    type: "order",
    orders: [Object.freeze({
      a: 3,
      b: readiness.action.side === "buy",
      p: readiness.action.limitPx,
      s: readiness.action.size,
      r: false,
      t: Object.freeze({ limit: Object.freeze({ tif: "Alo" }) }),
      c: cloid
    })],
    grouping: "na"
  });
}

export async function prepareHypercore002dStableIntent({
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
  const facility = await coreRepository.getTradingFacility(facilityId);
  if (
    !facility || facility.facilityHash !== facilityHash ||
    facility.lifecycleStatus !== "active" || facility.riskState !== "NORMAL" ||
    facility.withdrawable !== false || facility.transferable !== false ||
    facility.sandboxOnly !== true || facility.syntheticOnly !== true ||
    facility.productionAuthority !== false || facility.fundsAuthority !== false
  ) fail("canonical local Facility is absent, inactive or drifted");

  const counts = await eventRepository.withTenantRead((client) => client.query(
    `SELECT
       (SELECT count(*)::int FROM hypercore_testnet_submission_attempts
         WHERE facility_id = $1 AND state = 'UNKNOWN') AS unknown_v1,
       (SELECT count(*)::int FROM hypercore_testnet_submission_attempts
         WHERE facility_id = $1 AND external_submission_attempted) AS attempted_v1,
       (SELECT count(*)::int FROM hypercore_stable_execution_intents
         WHERE intent->>'facilityId' = $1 AND state = 'UNKNOWN') AS unknown_v2,
       (SELECT count(*)::int FROM hypercore_stable_execution_intents
         WHERE intent->>'facilityId' = $1 AND external_submission_attempted) AS attempted_v2`,
    [facilityId]
  ));
  const count = counts.rows[0];
  if (count.unknown_v1 !== 0 || count.unknown_v2 !== 0) {
    fail("unreconciled UNKNOWN execution blocks new risk");
  }
  if (count.attempted_v1 !== 0 || count.attempted_v2 !== 0) {
    fail("an earlier external submission already consumed the bounded proof");
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
  if (
    !binding || binding.accountBindingHash !== EXPECTED_ACCOUNT_BINDING_HASH ||
    binding.facilityId !== facilityId || binding.facilityHash !== facilityHash ||
    binding.canonicalAccountAddressHash !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
    !delegate || delegate.delegateHash !== EXPECTED_DELEGATE_HASH ||
    delegate.apiWalletAddressHash !== EXPECTED_API_WALLET_ADDRESS_HASH ||
    delegate.signerReferenceHash !== EXPECTED_SIGNER_REFERENCE_HASH ||
    !handoff || handoff.handoffHash !== EXPECTED_HANDOFF_HASH ||
    handoff.status !== "VERIFIED" || now >= new Date(handoff.expiresAt) || tombstoned
  ) fail("canonical binding, delegate or verified signer handoff drifted");
  if (
    descriptor.apiWalletAddressHash !== delegate.apiWalletAddressHash ||
    descriptor.signerReferenceHash !== delegate.signerReferenceHash ||
    hashId("hypercore_account_address", masterAddress) !==
      binding.canonicalAccountAddressHash
  ) fail("isolated signer or reviewed master identity drifted");

  const policyConstraint = createHypercoreStablePolicyConstraint({
    policyId: "hypercore_testnet_btc_proof_002d_stable",
    policyVersion: "adr_039.v2",
    facilityHash,
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash,
    signerReferenceHash: delegate.signerReferenceHash,
    executionOwnerActorId: "actor_hypercore_execution_owner",
    riskOwnerActorId: "actor_hypercore_risk_owner",
    incidentOwnerActorId: "actor_ipo_one_founder"
  });
  const sourceHash = hashId("hypercore_002d_stable_exact_source", {
    facilityHash,
    accountBindingHash: binding.accountBindingHash,
    delegateHash: delegate.delegateHash,
    side: readiness.action.side,
    limitPx: readiness.action.limitPx,
    size: readiness.action.size,
    preparedAt: now.toISOString()
  });
  const hyperliquidAction = exactAction({
    readiness,
    cloid: `0x${sourceHash.slice(2, 34)}`
  });
  const repository = new PostgresHypercoreStableExecutionRepository({ eventRepository });
  const prepared = await repository.prepare({
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
      policyConstraint,
      hyperliquidAction
    },
    idempotencyKey: `hypercore-002d-stable-${sourceHash}`,
    now
  });
  return Object.freeze({
    intent: prepared.intent,
    policyConstraint,
    replayed: prepared.replayed,
    priorExternalSubmissionCount: count.attempted_v1 + count.attempted_v2
  });
}

async function runCli() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
  const masterAddress = String(
    process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS ?? ""
  ).toLowerCase();
  if (
    !ADDRESS.test(masterAddress) ||
    hashId("hypercore_account_address", masterAddress) !== EXPECTED_ACCOUNT_ADDRESS_HASH
  ) fail("reviewed Testnet master is missing or drifted");
  const signerKeyPath = process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_KEY_PATH;
  const facilityId = process.env.IPO_ONE_HYPERCORE_TESTNET_FACILITY_ID;
  const facilityHash = process.env.IPO_ONE_HYPERCORE_TESTNET_FACILITY_HASH;
  const resultFile = process.env.IPO_ONE_HYPERCORE_REGISTRATION_RESULT_FILE;
  if (
    typeof signerKeyPath !== "string" || typeof facilityId !== "string" ||
    !HASH.test(facilityHash ?? "") || typeof resultFile !== "string"
  ) fail("closed signer, Facility and registration inputs are required");
  const registrationResult = JSON.parse(await readFile(resultFile, "utf8"));
  if (
    registrationResult.requestHash !== EXPECTED_REGISTRATION_REQUEST_HASH ||
    registrationResult.status !== "REGISTERED" ||
    registrationResult.automaticRetry !== false ||
    registrationResult.rawSignaturePersisted !== false ||
    registrationResult.rawResponsePersisted !== false ||
    !HASH.test(registrationResult.responseHash ?? "")
  ) fail("one-use registration result is missing or drifted");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    application_name: "ipo-one-hypercore-002d-stable-prepare"
  });
  try {
    const output = await withHypercoreIsolatedTestnetSigner(
      signerKeyPath,
      async ({ descriptor, transientApiWalletAddress }) => {
        const now = new Date();
        const readiness = await collectHypercore002dReadiness({
          fetchImpl: fetch,
          masterAddress,
          apiWalletAddress: transientApiWalletAddress,
          now,
          registrationResult
        });
        const prepared = await prepareHypercore002dStableIntent({
          pool,
          facilityId,
          facilityHash,
          masterAddress,
          descriptor,
          readiness,
          now
        });
        const order = prepared.intent.hyperliquidAction.orders[0];
        return {
          registrationEvidenceArtifact: readiness.registrationEvidenceArtifact,
          metadataArtifact: readiness.metadataArtifact,
          report: {
            issueId: "HYPERLIQUID-002D",
            decision: "READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL",
            adr: "ADR-039",
            intentId: prepared.intent.intentId,
            intentHash: prepared.intent.intentHash,
            exactApprovalMarker: `HYPERLIQUID-002D:${prepared.intent.intentHash}`,
            economicActionHash: prepared.intent.economicActionHash,
            payloadHash: prepared.intent.payloadHash,
            proposedAction: prepared.intent.hyperliquidAction,
            side: order.b ? "buy" : "sell",
            limitPx: order.p,
            size: order.s,
            exactLimitNotionalUsd: "10",
            maximumExposureUsd: "10",
            expectedFillNotionalUsd: "0",
            openingTimeInForce: "Alo",
            preparationDistanceBps: readiness.action.distanceBps,
            minimumJitPostOnlyDistanceBps: 50,
            maximumJitPostOnlyDistanceBps: 3_500,
            accountBindingHash: prepared.intent.accountBindingHash,
            canonicalAccountAddressHash: prepared.intent.canonicalAccountAddressHash,
            delegateHash: prepared.intent.delegateHash,
            handoffHash: prepared.intent.handoffHash,
            signerReferenceHash: prepared.intent.signerReferenceHash,
            apiWalletAddressHash: prepared.intent.apiWalletAddressHash,
            facilityId,
            facilityHash,
            policyConstraintHash: prepared.intent.policyConstraintHash,
            stableIntentState: prepared.intent.state,
            durableNonce: prepared.intent.nonce,
            preparedAt: prepared.intent.preparedAt,
            approvalExpiresAt: prepared.intent.approvalExpiresAt,
            riskWindowMs: prepared.policyConstraint.maxRiskAgeMs,
            riskSnapshotBoundToStableIntent: false,
            jitPreflightRequiredAfterApproval: true,
            jitPreflightExpiresAfterMs: 10_000,
            replayed: prepared.replayed,
            priorExternalSubmissionCount: prepared.priorExternalSubmissionCount,
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
            schemaVersion: "hypercore_002d_stable_exact_preparation.v2"
          }
        };
      }
    );
    console.log(`HYPERCORE_002D_STABLE_PREPARED ${JSON.stringify(output)}`);
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
