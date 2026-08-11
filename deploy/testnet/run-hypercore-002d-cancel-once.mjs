import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { hashId } from "../../packages/domain/src/index.js";
import {
  PostgresEventRepository,
  createTenantSecurityContext
} from "../../modules/persistence/src/index.js";
import {
  HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION,
  HypercoreExecutionActionKind,
  HypercoreStableExecutionService,
  HypercoreTestnetExchangeTransport,
  PostgresHypercoreStableExecutionRepository,
  compileHypercoreExecutionAction,
  createHypercoreCancelJitVenuePreflightReceipt,
  createHypercoreL1SigningRequest,
  createHypercoreStableFounderApproval
} from "../../modules/hypercore-venue-adapter/src/index.js";
import { withHypercoreIsolatedTestnetSigner } from "./hypercore-isolated-signer.mjs";
import { collectHypercore002dCancelReadiness } from "./prepare-hypercore-002d-proof.mjs";

const { Pool } = pg;
const TENANT_ID = "tenant_ipo_one_local_pilot";
const EXECUTION_ACTOR_ID = "actor_hypercore_execution_owner";
const FOUNDER_ACTOR_ID = "actor_ipo_one_founder";
const PARENT_INTENT_HASH =
  "0x62d522423fb1583e530851a950291598a4e369f91dab11f7efbf31ef43fbdea5";
const EXPECTED_ACCOUNT_ADDRESS_HASH =
  "0xda35abd4f31d5e8c9a5d87f289535c6164d1d587c49bb1deb206f906a1802038";
const EXPECTED_API_WALLET_ADDRESS_HASH =
  "0x1d1911fcbdb3809a1530f1e0740e23e04ff795239f0b497674a2c756322acea1";
const EXPECTED_SIGNER_REFERENCE_HASH =
  "0x8d51f324c056a411552c4945e30d1091e4c2036790e90022417c230ad38f5be3";
const EXPECTED_REGISTRATION_REQUEST_HASH =
  "0x7903ed662ca1b3225ba4e57f53fac4d1fa4a289a68f05bc18df4a1fe1d30bf0a";
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`hypercore_002d_cancel_once_error: ${message}`);
}

function tenantContext() {
  return createTenantSecurityContext({
    tenantId: TENANT_ID,
    actorId: EXECUTION_ACTOR_ID,
    policyVersion: "security_001.v1",
    source: "system_worker"
  });
}

export function composeHypercore002dCancelJitExecution({
  approvedIntent,
  approval,
  readiness,
  now
}) {
  const receipt = createHypercoreCancelJitVenuePreflightReceipt({
    intent: approvedIntent,
    approval,
    observation: readiness.jitObservation,
    now
  });
  const preparedAction = compileHypercoreExecutionAction({
    actionKind: HypercoreExecutionActionKind.CANCEL_BY_CLOID,
    action: {
      assetIndex: approvedIntent.targetOrder.assetIndex,
      cloid: approvedIntent.targetOrder.cloid
    },
    sourceActionHash: approvedIntent.intentHash,
    policyDecisionHash: approvedIntent.policyConstraintHash,
    riskSnapshotHash: receipt.riskSnapshotHash,
    accountBindingHash: approvedIntent.accountBindingHash,
    delegateHash: approvedIntent.delegateHash
  });
  const expiresAfter = Math.min(
    now.getTime() + 9_000,
    new Date(receipt.expiresAt).getTime() - 250,
    new Date(approval.expiresAt).getTime() - 250
  );
  if (expiresAfter <= now.getTime()) fail("JIT cancel signing interval already expired");
  const signingRequest = createHypercoreL1SigningRequest({
    preparedAction,
    signerReferenceHash: approvedIntent.signerReferenceHash,
    canonicalAccountAddressHash: approvedIntent.canonicalAccountAddressHash,
    vaultAddress: null,
    nonce: approvedIntent.nonce,
    expiresAfter
  });
  return Object.freeze({ receipt, preparedAction, signingRequest });
}

async function runCli() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
  const intentHash = process.env.IPO_ONE_HYPERCORE_STABLE_CANCEL_INTENT_HASH;
  const exactMarker = HASH.test(intentHash ?? "")
    ? `HYPERLIQUID-002D-CANCEL:${intentHash}`
    : null;
  if (exactMarker === null ||
    process.env.IPO_ONE_APPROVE_HYPERCORE_TESTNET_CANCEL !== exactMarker) {
    fail("exact current cancel marker is required");
  }
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    fail("live Testnet cancel write is disabled in CI");
  }
  const masterAddress = String(
    process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS ?? ""
  ).toLowerCase();
  const signerKeyPath = process.env.IPO_ONE_HYPERCORE_TESTNET_SIGNER_KEY_PATH;
  const resultFile = process.env.IPO_ONE_HYPERCORE_REGISTRATION_RESULT_FILE;
  if (!ADDRESS.test(masterAddress) ||
    hashId("hypercore_account_address", masterAddress) !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
    typeof signerKeyPath !== "string" || typeof resultFile !== "string") {
    fail("reviewed Testnet master, isolated signer and registration Evidence are required");
  }
  const registrationResult = JSON.parse(await readFile(resultFile, "utf8"));
  if (registrationResult.requestHash !== EXPECTED_REGISTRATION_REQUEST_HASH ||
    registrationResult.status !== "REGISTERED" ||
    registrationResult.automaticRetry !== false ||
    registrationResult.rawSignaturePersisted !== false ||
    registrationResult.rawResponsePersisted !== false) {
    fail("one-use registration Evidence drifted");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    application_name: "ipo-one-hypercore-002d-cancel-once"
  });
  try {
    const eventRepository = new PostgresEventRepository({
      pool,
      tenantContext: tenantContext()
    });
    const repository = new PostgresHypercoreStableExecutionRepository({
      eventRepository
    });
    const [intent, parent] = await Promise.all([
      repository.findByHash(intentHash),
      repository.findByHash(PARENT_INTENT_HASH)
    ]);
    if (!intent || intent.schemaVersion !== HYPERCORE_STABLE_CANCEL_INTENT_SCHEMA_VERSION ||
      intent.state !== "PREPARED" || intent.parentIntentHash !== PARENT_INTENT_HASH ||
      intent.canonicalAccountAddressHash !== EXPECTED_ACCOUNT_ADDRESS_HASH ||
      intent.apiWalletAddressHash !== EXPECTED_API_WALLET_ADDRESS_HASH ||
      intent.signerReferenceHash !== EXPECTED_SIGNER_REFERENCE_HASH ||
      intent.externalSubmissionAttempted !== false || intent.retryAllowed !== false ||
      !parent || parent.state !== "SUBMITTED" || parent.disposition !== "confirmed") {
      fail("stable exact cancel intent or parent is missing, consumed, stale or drifted");
    }
    const approvedAt = new Date();
    const approvalDeadline = Math.min(
      approvedAt.getTime() + 5 * 60_000,
      new Date(intent.approvalExpiresAt).getTime()
    );
    if (approvalDeadline <= approvedAt.getTime() + 1_000) {
      fail("stable cancel approval window expired; generate a new exact marker");
    }
    const approval = createHypercoreStableFounderApproval({
      intent,
      actorId: FOUNDER_ACTOR_ID,
      confirmationNonceHash: hashId("hypercore_002d_cancel_confirmation_nonce", {
        intentHash,
        exactMarker,
        nonce: randomUUID(),
        approvedAt: approvedAt.toISOString()
      }),
      approvedAt,
      expiresAt: new Date(approvalDeadline)
    });
    const approvedIntent = await repository.approve({
      intentId: intent.intentId,
      approval
    });

    const output = await withHypercoreIsolatedTestnetSigner(
      signerKeyPath,
      async ({ descriptor, transientApiWalletAddress, signer }) => {
        if (descriptor.apiWalletAddressHash !== intent.apiWalletAddressHash ||
          descriptor.signerReferenceHash !== intent.signerReferenceHash) {
          fail("isolated signer identity drifted after cancel approval");
        }
        const observedAt = new Date();
        const readiness = await collectHypercore002dCancelReadiness({
          fetchImpl: fetch,
          masterAddress,
          apiWalletAddress: transientApiWalletAddress,
          parentIntent: parent,
          expectedTarget: intent.targetOrder,
          now: observedAt
        });
        const composed = composeHypercore002dCancelJitExecution({
          approvedIntent,
          approval,
          readiness,
          now: observedAt
        });
        const service = new HypercoreStableExecutionService({
          repository,
          signer,
          transport: new HypercoreTestnetExchangeTransport({
            fetchImpl: fetch,
            clock: () => new Date()
          }),
          clock: () => new Date()
        });
        const terminal = await service.submitExact({
          intent: approvedIntent,
          approval,
          receipt: composed.receipt,
          preparedAction: composed.preparedAction,
          signingRequest: composed.signingRequest
        });
        return {
          issueId: "HYPERLIQUID-002D",
          adr: "ADR-039-Closure-Addendum",
          intentId: terminal.intentId,
          intentHash: terminal.intentHash,
          parentIntentHash: terminal.parentIntentHash,
          targetOrderHash: terminal.targetOrderHash,
          payloadHash: terminal.payloadHash,
          founderApprovalHash: terminal.founderApprovalHash,
          preflightReceiptHash: terminal.preflightReceiptHash,
          riskSnapshotHash: terminal.riskSnapshotHash,
          actionAuthorizationHash: terminal.actionAuthorizationHash,
          requestBodyHash: terminal.requestBodyHash,
          signatureHash: terminal.signatureHash,
          claimHash: terminal.claimHash,
          disposition: terminal.disposition,
          responseHash: terminal.responseHash,
          state: terminal.state,
          externalSubmissionAttempted: terminal.externalSubmissionAttempted,
          retryAllowed: terminal.retryAllowed,
          jitObservedAt: composed.receipt.observedAt,
          jitExpiresAt: composed.receipt.expiresAt,
          riskReductionOnly: true,
          rawKeyPersisted: false,
          rawSignaturePersisted: false,
          rawResponsePersisted: false,
          automaticRetry: false,
          mainnetAuthority: false,
          productionAuthority: false,
          realFundsAuthority: false,
          schemaVersion: "hypercore_002d_stable_cancel_once_result.v1"
        };
      }
    );
    console.log(`HYPERCORE_002D_CANCEL_ONCE ${JSON.stringify(output)}`);
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
