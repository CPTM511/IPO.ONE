import {
  BaseSepoliaEvidenceAnchorAdapter,
  createEvidenceAnchorBatch
} from "../../../modules/chain-adapter/src/index.js";
import {
  PostgresEvidenceAnchorStore
} from "../../../modules/event-indexer/src/index.js";
import {
  createTenantSecurityContextFromAuthentication,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import { ApiBoundaryError } from "../../../packages/api-contract/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";

export const EVIDENCE_ANCHOR_HTTP_ROUTES = Object.freeze({
  config: "/chain/v1/evidence-anchors/config",
  prepare: "/chain/v1/evidence-anchors/prepare",
  submit: "/chain/v1/evidence-anchors/submit",
  observe: "/chain/v1/evidence-anchors/observe",
  status: "/chain/v1/evidence-anchors/status"
});

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const MAX_HASHES = 16;

function fail(code, message) {
  throw new DomainError(code, message);
}

function exactObject(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.size &&
    ownKeys.every((key) => typeof key === "string" && keys.has(key)) &&
    ownKeys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.get && !descriptor?.set;
    })
  );
}

function obligationId(value) {
  if (!ID.test(value ?? "")) fail("invalid_evidence_anchor_request", "obligationId is invalid");
  return value;
}

function evidenceHashes(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_HASHES ||
    new Set(value).size !== value.length ||
    value.some((entry) => !HASH.test(entry))
  ) {
    fail("invalid_evidence_anchor_request", "evidenceHashes are invalid");
  }
  return [...value];
}

function accountAddress(value) {
  if (!ADDRESS.test(value ?? "")) {
    fail("invalid_evidence_anchor_request", "accountAddress is invalid");
  }
  return value;
}

async function withAuthenticatedTenant(pool, authenticationContext, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenantContext =
      createTenantSecurityContextFromAuthentication(authenticationContext);
    await setTenantTransactionContext(client, tenantContext);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function assertOwnedEvidence({
  pool,
  authenticationContext,
  resourceId,
  hashes
}) {
  return withAuthenticatedTenant(
    pool,
    authenticationContext,
    async (client) => {
      const binding = await client.query(
        `SELECT 1
           FROM authorization_resource_bindings
          WHERE resource_type = 'evidence'
            AND resource_id = $1
            AND actor_id = $2
            AND relationship IN ('owner', 'controller', 'subject')
            AND status = 'active'
          LIMIT 1`,
        [
          resourceId,
          authenticationContext.actorId
        ]
      );
      if (binding.rowCount !== 1) {
        throw new ApiBoundaryError(
          "resource_not_available",
          "The requested Evidence anchors are not available"
        );
      }
      const rows = await client.query(
        `SELECT evidence_hash
           FROM evidence_envelopes
          WHERE obligation_id = $1
            AND evidence_hash = ANY($2::text[])
          ORDER BY evidence_hash`,
        [resourceId, hashes]
      );
      if (
        rows.rowCount !== hashes.length ||
        rows.rows.some(({ evidence_hash }) => !hashes.includes(evidence_hash))
      ) {
        throw new ApiBoundaryError(
          "resource_not_available",
          "The requested Evidence anchors are not available"
        );
      }
    }
  );
}

function publicAnchor(anchor, adapter) {
  return Object.freeze({
    evidenceHash: anchor.evidenceHash,
    eventType: anchor.eventType,
    anchorGroupHash: anchor.actionDigest,
    status: anchor.status,
    chainId: anchor.chainId,
    contractAddress: anchor.contractAddress,
    confirmationMode: anchor.confirmationMode,
    transactionHash: anchor.transactionHash,
    transactionUrl: anchor.transactionHash
      ? adapter.transactionUrl(anchor.transactionHash)
      : undefined,
    blockNumber: anchor.blockNumber,
    confirmations: anchor.confirmations,
    requestedAt: anchor.requestedAt,
    anchoredAt: anchor.anchoredAt,
    finalizedAt: anchor.finalizedAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "evidence_anchor_public_state.v1"
  });
}

export function createEvidenceAnchorHttpHandler({
  pool,
  contractAddress,
  nonceReader,
  observer,
  systemAttestorConfigured = false,
  clock = () => new Date()
} = {}) {
  if (
    !pool ||
    typeof pool.connect !== "function" ||
    !ADDRESS.test(contractAddress ?? "") ||
    !nonceReader ||
    typeof nonceReader.read !== "function" ||
    !observer ||
    typeof observer.observe !== "function" ||
    typeof systemAttestorConfigured !== "boolean" ||
    typeof clock !== "function"
  ) {
    fail(
      "invalid_evidence_anchor_http_config",
      "Evidence anchor HTTP configuration is invalid"
    );
  }
  const adapter = new BaseSepoliaEvidenceAnchorAdapter({ contractAddress });
  return async function serveEvidenceAnchors({
    request,
    response,
    url,
    requestId,
    authenticationContext,
    readJson,
    sendJson
  }) {
    if (!Object.values(EVIDENCE_ANCHOR_HTTP_ROUTES).includes(url.pathname)) {
      return false;
    }
    if (
      !request ||
      !response ||
      typeof requestId !== "string" ||
      typeof readJson !== "function" ||
      typeof sendJson !== "function"
    ) {
      fail("invalid_evidence_anchor_http_request", "Evidence anchor request is invalid");
    }
    const tenantContext =
      createTenantSecurityContextFromAuthentication(authenticationContext);
    const store = new PostgresEvidenceAnchorStore({
      pool,
      tenantContext,
      clock
    });

    if (
      request.method === "GET" &&
      url.pathname === EVIDENCE_ANCHOR_HTTP_ROUTES.config
    ) {
      return sendJson(200, {
        ...adapter.descriptor(),
        accountRelayerConfigured: false,
        systemAttestorConfigured,
        allDurableEvidenceRequiresAnchor: true,
        schemaVersion: "evidence_anchor_http_config.v1"
      });
    }

    if (request.method !== "POST") {
      throw new ApiBoundaryError("method_not_allowed", "Evidence anchor route requires POST");
    }
    const body = await readJson();

    if (url.pathname === EVIDENCE_ANCHOR_HTTP_ROUTES.status) {
      if (!exactObject(body, new Set(["obligationId", "evidenceHashes"]))) {
        fail("invalid_evidence_anchor_request", "Evidence anchor status request is invalid");
      }
      const resourceId = obligationId(body.obligationId);
      const hashes = evidenceHashes(body.evidenceHashes);
      await assertOwnedEvidence({
        pool,
        authenticationContext,
        resourceId,
        hashes
      });
      const anchors = await store.listByEvidenceHashes(hashes);
      if (anchors.length !== hashes.length) {
        fail("evidence_anchor_coverage_missing", "Durable Evidence anchor coverage is incomplete");
      }
      return sendJson(200, {
        obligationId: resourceId,
        items: anchors.map((anchor) => publicAnchor(anchor, adapter)),
        complete: anchors.every(({ status }) => status === "finalized"),
        schemaVersion: "evidence_anchor_status_page.v1"
      });
    }

    if (url.pathname === EVIDENCE_ANCHOR_HTTP_ROUTES.prepare) {
      if (
        !exactObject(
          body,
          new Set([
            "obligationId",
            "evidenceHashes",
            "accountAddress",
            "confirmationMode"
          ])
        )
      ) {
        fail("invalid_evidence_anchor_request", "Evidence anchor prepare request is invalid");
      }
      const resourceId = obligationId(body.obligationId);
      const hashes = evidenceHashes(body.evidenceHashes);
      const attestorAddress = accountAddress(body.accountAddress);
      const expectedMode = authenticationContext.actorType === "agent"
        ? "agent_transaction"
        : "wallet_transaction";
      if (body.confirmationMode !== expectedMode) {
        fail("evidence_anchor_confirmation_mismatch", "Evidence anchor confirmation mode is invalid");
      }
      await assertOwnedEvidence({
        pool,
        authenticationContext,
        resourceId,
        hashes
      });
      let anchors = await store.listByEvidenceHashes(hashes);
      const attestorAccountId = `eip155:84532:${attestorAddress}`;
      const resumablePrepared =
        anchors.length === hashes.length &&
        anchors.every(({ status }) => status === "prepared") &&
        new Set(anchors.map(({ batchId }) => batchId)).size === 1 &&
        anchors.every((anchor) =>
          anchor.attestorAccountId?.toLowerCase() ===
            attestorAccountId.toLowerCase() &&
          anchor.confirmationMode === expectedMode
        );
      if (resumablePrepared) {
        const existing = anchors[0];
        if (new Date(existing.expiresAt).getTime() > clock().getTime()) {
          return sendJson(200, {
            batchId: existing.batchId,
            batchDigest: existing.batchDigest,
            transaction: existing.preparedTransaction,
            expiresAt: existing.expiresAt,
            nativeValue: "0",
            userWalletConfirmationRequired: true,
            resumed: true,
            sandboxOnly: true,
            productionFundsMoved: false,
            schemaVersion: "evidence_anchor_prepare_result.v1"
          });
        }
        await store.markPreparationFailed({
          batchId: existing.batchId,
          reasonCode: "prepared_transaction_expired"
        });
        anchors = await store.listByEvidenceHashes(hashes);
      }
      if (
        anchors.length !== hashes.length ||
        anchors.some(({ status }) =>
          !new Set(["pending", "failed", "reorged"]).has(status)
        ) ||
        new Set(anchors.map(({ actionDigest }) => actionDigest)).size !== 1
      ) {
        fail("evidence_anchor_state_conflict", "Evidence anchors are not ready for one batch");
      }
      const now = clock();
      const expiresAt = new Date(now.getTime() + 10 * 60_000);
      expiresAt.setMilliseconds(0);
      const nonce = await nonceReader.read(attestorAddress);
      const batch = createEvidenceAnchorBatch({
        batchId: hashId("evidence_anchor_batch_id", {
          tenantId: authenticationContext.tenantId,
          actorId: authenticationContext.actorId,
          actionDigest: anchors[0].actionDigest,
          evidenceHashes: hashes,
          attempt: Math.max(...anchors.map(({ attemptCount }) => attemptCount)) + 1
        }),
        accountId: attestorAccountId,
        actionDigest: anchors[0].actionDigest,
        nonce,
        expiresAt: expiresAt.toISOString(),
        items: anchors.map((anchor) => ({
          evidenceHash: anchor.evidenceHash,
          eventType: anchor.eventType,
          aggregateType: anchor.aggregateType,
          aggregateId: anchor.aggregateId,
          aggregateVersion: anchor.aggregateVersion
        }))
      }, { now });
      const preparedAnchor = adapter.prepareAnchor(batch, { now });
      const preparedTransaction = {
        chainId: preparedAnchor.chainId,
        from: preparedAnchor.from,
        to: preparedAnchor.to,
        data: preparedAnchor.data,
        value: "0x0",
        batchDigest: preparedAnchor.batchDigest,
        evidenceHashes: [...preparedAnchor.evidenceHashes]
      };
      await store.prepareBatch({
        evidenceHashes: hashes,
        contractAddress,
        attestorAccountId,
        confirmationMode: expectedMode,
        batchId: batch.batchId,
        batchDigest: batch.batchDigest,
        attestorNonce: batch.nonce,
        expiresAt: batch.expiresAt,
        preparedTransaction,
        preparedAt: now.toISOString()
      });
      return sendJson(200, {
        batchId: batch.batchId,
        batchDigest: batch.batchDigest,
        transaction: preparedTransaction,
        expiresAt: batch.expiresAt,
        nativeValue: "0",
        userWalletConfirmationRequired: true,
        sandboxOnly: true,
        productionFundsMoved: false,
        schemaVersion: "evidence_anchor_prepare_result.v1"
      });
    }

    if (url.pathname === EVIDENCE_ANCHOR_HTTP_ROUTES.submit) {
      if (
        !exactObject(
          body,
          new Set([
            "obligationId",
            "evidenceHashes",
            "batchId",
            "transactionHash",
            "outcome"
          ])
        ) ||
        !ID.test(body.batchId ?? "") ||
        !HASH.test(body.transactionHash ?? "") ||
        !new Set(["broadcast", "unknown"]).has(body.outcome)
      ) {
        fail("invalid_evidence_anchor_request", "Evidence anchor submission is invalid");
      }
      const resourceId = obligationId(body.obligationId);
      const hashes = evidenceHashes(body.evidenceHashes);
      await assertOwnedEvidence({
        pool,
        authenticationContext,
        resourceId,
        hashes
      });
      const anchors = await store.listByEvidenceHashes(hashes);
      if (
        anchors.length !== hashes.length ||
        anchors.some(({ batchId }) => batchId !== body.batchId) ||
        anchors.some(({ status }) => status !== "prepared")
      ) {
        fail("evidence_anchor_state_conflict", "Prepared Evidence anchor batch is unavailable");
      }
      const submitted = await store.markSubmitted({
        batchId: body.batchId,
        transactionHash: body.transactionHash,
        outcome: body.outcome,
        submittedAt: clock().toISOString()
      });
      return sendJson(200, {
        ...submitted,
        transactionUrl: adapter.transactionUrl(body.transactionHash),
        sandboxOnly: true,
        productionFundsMoved: false,
        schemaVersion: "evidence_anchor_submit_result.v1"
      });
    }

    if (url.pathname === EVIDENCE_ANCHOR_HTTP_ROUTES.observe) {
      if (!exactObject(body, new Set(["obligationId", "evidenceHashes"]))) {
        fail("invalid_evidence_anchor_request", "Evidence anchor observation request is invalid");
      }
      const resourceId = obligationId(body.obligationId);
      const hashes = evidenceHashes(body.evidenceHashes);
      await assertOwnedEvidence({
        pool,
        authenticationContext,
        resourceId,
        hashes
      });
      const anchors = await store.listByEvidenceHashes(hashes);
      if (
        anchors.length !== hashes.length ||
        anchors.some(({ status }) =>
          !new Set([
            "broadcast",
            "unknown",
            "included",
            "safe",
            "finalized"
          ]).has(status)
        ) ||
        new Set(anchors.map(({ batchId }) => batchId)).size !== 1 ||
        new Set(anchors.map(({ transactionHash }) => transactionHash)).size !== 1
      ) {
        fail("evidence_anchor_state_conflict", "Submitted Evidence anchor batch is unavailable");
      }
      const ordered = [...anchors].sort(
        (left, right) => left.batchOrdinal - right.batchOrdinal
      );
      const observations = await observer.observe({
        transactionHash: ordered[0].transactionHash,
        contractAddress,
        expectedAnchors: ordered.map((anchor) => ({
          evidenceHash: anchor.evidenceHash,
          eventTypeHash: anchor.eventTypeHash,
          aggregateRefHash: anchor.aggregateRefHash,
          actionDigest: anchor.actionDigest,
          attestorAccountId: anchor.attestorAccountId,
          nonce: anchor.attestorNonce,
          batchOrdinal: anchor.batchOrdinal,
          batchSize: anchor.batchSize
        }))
      });
      for (const observation of observations) {
        await store.recordObservation(observation);
      }
      const refreshed = await store.listByEvidenceHashes(hashes);
      return sendJson(200, {
        obligationId: resourceId,
        items: refreshed.map((anchor) => publicAnchor(anchor, adapter)),
        complete: refreshed.every(({ status }) => status === "finalized"),
        schemaVersion: "evidence_anchor_observation_result.v1"
      });
    }

    throw new ApiBoundaryError("not_found", "Evidence anchor route is not available");
  };
}
