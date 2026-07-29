import { DomainError } from "../../../packages/domain/src/index.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BLOCK_NUMBER = /^[1-9][0-9]*$/;
const TRANSACTION_KINDS = Object.freeze([
  "publication",
  "proof_update",
  "close",
  "pause"
]);

function unavailable() {
  throw new DomainError(
    "tenant_resource_unavailable",
    "The requested resource is not available."
  );
}

function summarizeTransaction(transaction) {
  return {
    kind: transaction.kind,
    transactionHash: transaction.transactionHash,
    blockNumber: transaction.blockNumber,
    blockHash: transaction.blockHash,
    observationStatus: transaction.observationStatus,
    confirmations: transaction.confirmations,
    schemaVersion: "credit_registry_transaction_evidence_summary.v1"
  };
}

function validTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)
  ) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validBlock(block) {
  return (
    block &&
    typeof block === "object" &&
    !Array.isArray(block) &&
    BLOCK_NUMBER.test(block.number ?? "") &&
    HASH.test(block.hash ?? "")
  );
}

function validateObservation(observation, authorizationHash) {
  if (
    !observation ||
    typeof observation !== "object" ||
    Array.isArray(observation) ||
    observation.authorizationHash !== authorizationHash ||
    observation.chainId !== "eip155:84532" ||
    !ADDRESS.test(observation.contractAddress ?? "") ||
    !HASH.test(observation.observationHash ?? "") ||
    !HASH.test(observation.finalityProofHash ?? "") ||
    !HASH.test(observation.finalCreditStateHash ?? "") ||
    !HASH.test(observation.finalObligationProofHash ?? "") ||
    observation.finalStatus !== "closed" ||
    observation.finalVersion !== 3 ||
    observation.registryPaused !== true ||
    observation.authorizationActive !== false ||
    observation.readOnly !== true ||
    observation.liveTestnetObservation !== true ||
    observation.rawAccountPersisted !== false ||
    observation.rawProviderPayloadPersisted !== false ||
    observation.syntheticOnly !== true ||
    observation.productionFundsMoved !== false ||
    !validTimestamp(observation.observedAt) ||
    !validBlock(observation.safeBlock) ||
    !validBlock(observation.finalizedBlock) ||
    observation.schemaVersion !== "credit_registry_live_observation.v1" ||
    !Array.isArray(observation.transactions) ||
    observation.transactions.length !== TRANSACTION_KINDS.length ||
    observation.transactions.some((transaction, index) =>
      transaction?.kind !== TRANSACTION_KINDS[index] ||
      !HASH.test(transaction.transactionHash ?? "") ||
      !HASH.test(transaction.blockHash ?? "") ||
      !BLOCK_NUMBER.test(transaction.blockNumber ?? "") ||
      !new Set(["safe", "finalized"]).has(transaction.observationStatus) ||
      !Number.isSafeInteger(transaction.confirmations) ||
      transaction.confirmations < 2
    )
  ) unavailable();
}

export function readCreditRegistryEvidenceQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCreditRegistryEvidence",
    kind: "query",
    async execute({ client, authorizationDecision, payload, now }) {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 0
      ) {
        throw new DomainError(
          "invalid_tenant_command_payload",
          "Credit Registry Evidence query payload is invalid"
        );
      }
      if (
        authorizationDecision?.resourceType !==
          "credit_registry_evidence" ||
        !HASH.test(authorizationDecision.resourceId ?? "") ||
        !(now instanceof Date) ||
        !Number.isFinite(now.getTime())
      ) unavailable();
      const authorizationHash = authorizationDecision.resourceId;
      const result = await client.query(
        `SELECT observation, recorded_at
           FROM credit_registry_chain_observations
          WHERE authorization_hash = $1
          ORDER BY recorded_at DESC, id DESC
          LIMIT 1`,
        [authorizationHash]
      );
      if (result.rowCount !== 1) unavailable();
      const observation = result.rows[0].observation;
      validateObservation(observation, authorizationHash);
      const recordedAt = new Date(result.rows[0].recorded_at);
      if (!Number.isFinite(recordedAt.getTime())) unavailable();
      return {
        chainId: observation.chainId,
        contractAddress: observation.contractAddress,
        authorizationHash,
        observationHash: observation.observationHash,
        finalityProofHash: observation.finalityProofHash,
        finalCreditStateHash: observation.finalCreditStateHash,
        finalObligationProofHash: observation.finalObligationProofHash,
        finalStatus: observation.finalStatus,
        finalVersion: observation.finalVersion,
        registryPaused: observation.registryPaused,
        authorizationActive: observation.authorizationActive,
        transactions: observation.transactions.map(summarizeTransaction),
        safeBlock: {
          number: observation.safeBlock.number,
          hash: observation.safeBlock.hash
        },
        finalizedBlock: {
          number: observation.finalizedBlock.number,
          hash: observation.finalizedBlock.hash
        },
        observedAt: observation.observedAt,
        recordedAt: recordedAt.toISOString(),
        asOf: now.toISOString(),
        readOnly: true,
        liveTestnetObservation: true,
        syntheticOnly: true,
        authorizing: false,
        productionFundsMoved: false,
        fundsAuthority: false,
        rawAccountIncluded: false,
        rawProviderPayloadIncluded: false,
        schemaVersion: "tenant_credit_registry_evidence_view.v1"
      };
    }
  });
}

export function createCreditRegistryEvidenceHandlers() {
  return Object.freeze([readCreditRegistryEvidenceQueryHandler()]);
}
