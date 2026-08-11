import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { hashId } from "../../packages/domain/src/index.js";
import {
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../modules/persistence/src/index.js";
import {
  PostgresHypercoreTestnetSubmissionRepository
} from "../../modules/hypercore-venue-adapter/src/index.js";
import {
  withHypercoreIsolatedTestnetSigner
} from "./hypercore-isolated-signer.mjs";

const { Pool } = pg;
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,127}$/;
const DEFAULT_METADATA_FILE = resolve(
  process.cwd(),
  "artifacts/testnet/hyperliquid-002c-market-metadata-20260808.json"
);
const MIGRATION_FILE = resolve(
  process.cwd(),
  "db/migrations/0058_hypercore_testnet_submission_closure.up.sql"
);

const blockers = [];
const checks = [];

function check(id, passed, blocker) {
  checks.push({ id, passed });
  if (!passed) blockers.push(blocker);
}

function secretIngressPresent() {
  return [
    "IPO_ONE_HYPERCORE_PRIVATE_KEY",
    "IPO_ONE_HYPERLIQUID_PRIVATE_KEY",
    "IPO_ONE_HYPERLIQUID_SEED_PHRASE",
    "IPO_ONE_HYPERCORE_SIGNER_PRIVATE_KEY"
  ].some((name) => Boolean(process.env[name]));
}

const accountAddress =
  process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS?.toLowerCase();
let apiWalletAddress =
  process.env.IPO_ONE_HYPERCORE_TESTNET_API_WALLET_ADDRESS?.toLowerCase();
const accountRole = process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ROLE;
const accountBindingHash =
  process.env.IPO_ONE_HYPERCORE_TESTNET_ACCOUNT_BINDING_HASH;
const delegateHash = process.env.IPO_ONE_HYPERCORE_TESTNET_DELEGATE_HASH;
const signerReferenceHash =
  process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_REFERENCE_HASH;
let isolatedSignerReference =
  process.env.IPO_ONE_HYPERCORE_ISOLATED_SIGNER_REFERENCE;
const signerKeyPath = process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_KEY_PATH;
const executionId = process.env.IPO_ONE_HYPERCORE_TESTNET_EXECUTION_ID;
const expectedExecutionHash =
  process.env.IPO_ONE_HYPERCORE_TESTNET_EXECUTION_HASH;
const expectedPreparedActionHash =
  process.env.IPO_ONE_HYPERCORE_TESTNET_PREPARED_ACTION_HASH;
const expectedFounderApprovalHash =
  process.env.IPO_ONE_HYPERCORE_TESTNET_FOUNDER_APPROVAL_HASH;
const expectedHumanConfirmationHash =
  process.env.IPO_ONE_HYPERCORE_TESTNET_HUMAN_CONFIRMATION_HASH;
const tenantId = process.env.IPO_ONE_TENANT_ID;
const actorId = process.env.IPO_ONE_ACTOR_ID;
const connectionString = process.env.DATABASE_URL;
const metadataFile = resolve(
  process.env.IPO_ONE_HYPERCORE_TESTNET_METADATA_FILE ?? DEFAULT_METADATA_FILE
);

if (
  typeof signerKeyPath === "string" &&
  (!apiWalletAddress || !isolatedSignerReference)
) {
  await withHypercoreIsolatedTestnetSigner(
    signerKeyPath,
    ({ descriptor, transientApiWalletAddress }) => {
      apiWalletAddress ??= transientApiWalletAddress;
      isolatedSignerReference ??= descriptor.isolatedSignerReference;
    }
  );
}

let metadata;
try {
  metadata = JSON.parse(await readFile(metadataFile, "utf8"));
} catch {
  blockers.push("reviewed_metadata_artifact_unavailable");
}

let migrationContract = "";
try {
  migrationContract = await readFile(MIGRATION_FILE, "utf8");
} catch {
  blockers.push("durable_submission_migration_unavailable");
}

let attempt;
let handoff;
let founderApproval;
if (
  typeof connectionString === "string" &&
  IDENTIFIER.test(tenantId ?? "") &&
  IDENTIFIER.test(actorId ?? "") &&
  typeof executionId === "string"
) {
  const pool = new Pool({
    connectionString,
    max: 1,
    application_name: "ipo-one-hypercore-002d-preflight"
  });
  try {
    const eventRepository = new PostgresEventRepository({
      pool,
      tenantContext: createTenantSecurityContext({
        tenantId,
        actorId,
        policyVersion: "security_001.v1",
        source: "system_worker"
      })
    });
    const repository = new PostgresHypercoreTestnetSubmissionRepository({
      eventRepository
    });
    attempt = await repository.find(executionId);
    if (attempt) {
      handoff = await repository.findSignerHandoff(attempt.handoffId);
      founderApproval = await repository.findFounderApproval(executionId);
    }
  } catch {
    blockers.push("durable_submission_record_unavailable");
  } finally {
    await pool.end();
  }
}

check(
  "no_raw_key_ingress",
  !secretIngressPresent(),
  "raw_private_key_ingress_denied"
);
check(
  "qualified_account_address",
  ADDRESS.test(accountAddress ?? ""),
  "qualified_testnet_master_or_subaccount_missing"
);
check(
  "qualified_account_role",
  accountRole === "master" || accountRole === "subaccount",
  "qualified_testnet_account_role_missing"
);
check(
  "fresh_api_wallet_address",
  ADDRESS.test(apiWalletAddress ?? "") && apiWalletAddress !== accountAddress,
  "fresh_distinct_api_wallet_address_missing"
);
check(
  "isolated_signer_reference",
  typeof isolatedSignerReference === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:._/%-]{7,255}$/.test(isolatedSignerReference),
  "isolated_non_exporting_signer_port_missing"
);
check(
  "durable_single_use_submission_store",
  migrationContract.includes("hypercore_testnet_submission_attempts") &&
    migrationContract.includes("hypercore_testnet_nonce_heads") &&
    migrationContract.includes("hypercore_testnet_submission_transitions"),
  "durable_single_use_submission_store_not_composed"
);
check(
  "durable_execution_record",
  Boolean(attempt),
  "exact_durable_testnet_execution_missing"
);
check(
  "durable_execution_state",
  attempt?.state === "PREPARED" || attempt?.state === "APPROVED",
  "durable_testnet_execution_not_prewrite_ready"
);
check(
  "exact_execution_hash",
  HASH.test(expectedExecutionHash ?? "") &&
    attempt?.executionHash === expectedExecutionHash,
  "exact_execution_hash_missing_or_drifted"
);
check(
  "exact_prepared_action_hash",
  HASH.test(expectedPreparedActionHash ?? "") &&
    attempt?.preparedActionHash === expectedPreparedActionHash,
  "exact_prepared_action_hash_missing_or_drifted"
);
check(
  "exact_account_binding",
  HASH.test(accountBindingHash ?? "") &&
    attempt?.accountBindingHash === accountBindingHash &&
    attempt?.canonicalAccountAddressHash ===
      (ADDRESS.test(accountAddress ?? "")
        ? hashId("hypercore_account_address", accountAddress)
        : null),
  "durable_account_binding_missing_or_drifted"
);
check(
  "exact_api_wallet_delegate",
  HASH.test(delegateHash ?? "") &&
    attempt?.delegateHash === delegateHash &&
    attempt?.apiWalletAddressHash ===
      (ADDRESS.test(apiWalletAddress ?? "")
        ? hashId("hypercore_account_address", apiWalletAddress)
        : null),
  "approved_fresh_delegate_missing_or_drifted"
);
check(
  "exact_signer_handoff",
  HASH.test(signerReferenceHash ?? "") &&
    attempt?.signerReferenceHash === signerReferenceHash &&
    handoff?.status === "VERIFIED" &&
    handoff?.signerReferenceHash === signerReferenceHash &&
    Date.now() < new Date(handoff?.expiresAt ?? 0).getTime(),
  "verified_fresh_signer_handoff_missing_or_stale"
);
check(
  "metadata_contract",
  metadata?.environment === "hyperliquid_testnet" &&
    metadata?.market === "BTC" &&
    metadata?.assetIndex === 3 &&
    metadata?.sizeDecimals === 5 &&
    metadata?.exchangeWritePerformed === false &&
    HASH.test(metadata?.metadataHash ?? "") &&
    attempt?.metadataHash === metadata?.metadataHash,
  "reviewed_btc_metadata_contract_mismatch"
);

const metadataAgeMs = metadata?.observedAt
  ? Date.now() - new Date(metadata.observedAt).getTime()
  : Number.POSITIVE_INFINITY;
check(
  "metadata_freshness",
  metadataAgeMs >= 0 && metadataAgeMs <= 5 * 60 * 1000,
  "testnet_market_metadata_stale"
);

const exactApprovalMarker = attempt
  ? `HYPERLIQUID-002D:${attempt.executionHash}`
  : null;
const exactFounderApprovalPresent =
  attempt?.state === "APPROVED" &&
  founderApproval?.status === "APPROVED" &&
  Date.now() < new Date(founderApproval.expiresAt).getTime() &&
  process.env.IPO_ONE_APPROVE_HYPERCORE_TESTNET_PROOF === exactApprovalMarker &&
  HASH.test(expectedFounderApprovalHash ?? "") &&
  expectedFounderApprovalHash === founderApproval.approvalHash &&
  HASH.test(expectedHumanConfirmationHash ?? "") &&
  expectedHumanConfirmationHash === founderApproval.humanConfirmationHash;

if (attempt?.state === "APPROVED") {
  check(
    "exact_founder_approval",
    exactFounderApprovalPresent,
    "exact_one_use_founder_approval_missing_stale_or_drifted"
  );
}

const uniqueBlockers = [...new Set(blockers)].sort();
const decision = uniqueBlockers.length !== 0
  ? "BLOCKED"
  : exactFounderApprovalPresent
    ? "AUTHORIZED_FOR_EXACT_TESTNET_WRITE"
    : "READY_FOR_FOUNDER_TESTNET_WRITE_APPROVAL";
const reportCore = {
  issueId: "HYPERLIQUID-002D",
  decision,
  checks,
  blockers: uniqueBlockers,
  accountRole: accountRole ?? null,
  accountAddressHash: ADDRESS.test(accountAddress ?? "")
    ? hashId("hypercore_account_address", accountAddress)
    : null,
  apiWalletAddressHash: ADDRESS.test(apiWalletAddress ?? "")
    ? hashId("hypercore_account_address", apiWalletAddress)
    : null,
  accountBindingHash: attempt?.accountBindingHash ?? null,
  handoffHash: handoff?.handoffHash ?? null,
  delegateHash: attempt?.delegateHash ?? null,
  signerReferenceHash: attempt?.signerReferenceHash ?? null,
  executionId: attempt?.executionId ?? null,
  executionHash: attempt?.executionHash ?? null,
  preparedActionHash: attempt?.preparedActionHash ?? null,
  proposedAction: attempt?.preparedAction?.hyperliquidAction ?? null,
  policyHash: attempt?.policyHash ?? null,
  metadataHash: attempt?.metadataHash ?? null,
  riskSnapshotHash: attempt?.riskSnapshotHash ?? null,
  founderApprovalHash: founderApproval?.approvalHash ?? null,
  humanConfirmationHash: founderApproval?.humanConfirmationHash ?? null,
  durableExecutionState: attempt?.state ?? null,
  expiresAt: attempt?.expiresAt ?? null,
  market: attempt?.market ?? metadata?.market ?? null,
  assetIndex: Number.isSafeInteger(metadata?.assetIndex)
    ? metadata.assetIndex
    : null,
  maxOrderNotionalUsd: "10",
  maxOpenOrders: 1,
  openingTimeInForce: "Alo",
  rawKeyAccepted: false,
  rawAddressPersisted: false,
  rawSignaturePersisted: false,
  rawResponsePersisted: false,
  automaticRetry: false,
  exchangeWriteAttempted: false,
  mainnetAuthority: false,
  productionAuthority: false,
  realFundsAuthority: false,
  schemaVersion: "hypercore_testnet_proof_preflight.v2"
};
const report = {
  reportHash: hashId("hypercore_testnet_proof_preflight", reportCore),
  ...reportCore
};

console.log(`HYPERCORE_002D_PREFLIGHT ${JSON.stringify(report)}`);
if (report.decision === "BLOCKED") process.exitCode = 2;
