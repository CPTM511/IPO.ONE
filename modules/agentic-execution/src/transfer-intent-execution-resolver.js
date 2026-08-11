import { encodeFunctionData, toFunctionSelector } from "viem";
import {
  DomainError,
  createAccountHash,
  hashId
} from "../../../packages/domain/src/index.js";
import { createExecutionTargetPolicy } from "./agentic-execution-grant.js";

export const TRANSFER_INTENT_EXECUTION_RESOLVER_VERSION = "1.0.0";
export const TRANSFER_INTENT_EXECUTION_RESOLUTION_SCHEMA_VERSION =
  "transfer_intent_execution_resolution.v1";

const EXECUTOR_ABI = Object.freeze([{
  type: "function",
  name: "executeProviderSpend",
  stateMutability: "nonpayable",
  inputs: [
    { name: "transferIntentHash", type: "bytes32" },
    { name: "destinationAccountRefHash", type: "bytes32" },
    { name: "amountMinor", type: "uint256" }
  ],
  outputs: []
}]);
const SELECTOR = toFunctionSelector("executeProviderSpend(bytes32,bytes32,uint256)");
const TARGET_BY_CHAIN = Object.freeze({
  "eip155:84532": "0x0000000000000000000000000000000000008453",
  "eip155:1952": "0x0000000000000000000000000000000000001952"
});

function fail(code, message) {
  throw new DomainError(code, message);
}

function assertClient(client) {
  if (!client || typeof client.query !== "function") {
    fail("postgres_client_required", "exact execution resolver requires the active Gateway transaction client");
  }
}

function assertId(name, value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/.test(value)) {
    fail("invalid_transfer_intent_execution_resolution", `${name} is invalid`);
  }
  return value;
}

export function createLocalTransferIntentTargetPolicy({ providerId, chainId, now = new Date() }) {
  assertId("providerId", providerId);
  const targetAddress = TARGET_BY_CHAIN[chainId];
  if (!targetAddress) fail("transfer_intent_execution_chain_unavailable", "selected network is not approved");
  return createExecutionTargetPolicy({
    providerId,
    chainId,
    targetAddress,
    codeHash: hashId("local_provider_executor_code", {
      chainId,
      resolverVersion: TRANSFER_INTENT_EXECUTION_RESOLVER_VERSION
    }),
    allowedFunctionSelectors: [SELECTOR],
    validFrom: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    now
  });
}

export async function resolveTransferIntentExecution({
  client,
  transferIntentId,
  grant,
  targetPolicy,
  now = new Date()
}) {
  assertClient(client);
  assertId("transferIntentId", transferIntentId);
  const result = await client.query(
    `SELECT
       t.id, t.transfer_intent_hash, t.subject_id, t.mandate_id,
       t.policy_decision_ref, t.provider_id, t.purpose_code, t.rail_id,
       t.direction, t.source_asset_id, t.source_amount_minor::TEXT,
       t.destination_asset_id, t.source_account_ref_hash,
       t.destination_account_ref_hash, t.status, t.aggregate_version,
       t.sandbox_only, t.production_funds_moved,
       s.spend_policy_id, s.asset_id AS spend_asset_id,
       s.amount_minor::TEXT AS spend_amount_minor,
       s.purpose_code AS spend_purpose_code, s.status AS spend_status,
       p.settlement_account_ref,
       a.account_hash AS bound_account_hash, a.status AS binding_status,
       a.schema_version AS binding_schema_version
      FROM transfer_intents t
      JOIN spend_requests s
        ON s.tenant_id = t.tenant_id AND s.id = t.policy_decision_ref
      JOIN providers p
        ON p.tenant_id = t.tenant_id AND p.id = t.provider_id
      JOIN account_bindings a
        ON a.tenant_id = t.tenant_id AND a.id = $2
     WHERE t.id = $1
     FOR SHARE OF t, s, p, a`,
    [transferIntentId, grant.accountBindingId]
  );
  if (result.rowCount !== 1) {
    fail("transfer_intent_execution_unavailable", "canonical TransferIntent is unavailable");
  }
  const row = result.rows[0];
  const destinationAccountRefHash = createAccountHash(row.settlement_account_ref);
  const exact =
    row.status === "authorized" &&
    row.spend_status === "approved" &&
    row.subject_id === grant.subjectId &&
    row.mandate_id === grant.mandateId &&
    row.provider_id === grant.providerId &&
    row.spend_policy_id === grant.spendPolicyId &&
    row.source_asset_id === grant.assetIds[0] &&
    row.destination_asset_id === grant.assetIds[0] &&
    row.spend_asset_id === grant.assetIds[0] &&
    row.source_amount_minor === row.spend_amount_minor &&
    row.purpose_code === row.spend_purpose_code &&
    row.bound_account_hash === row.source_account_ref_hash &&
    row.binding_status === "active" &&
    new Set(["account_binding.v2", "account_binding.v3"]).has(row.binding_schema_version) &&
    row.destination_account_ref_hash === destinationAccountRefHash &&
    row.sandbox_only === true &&
    row.production_funds_moved === false &&
    targetPolicy.providerId === row.provider_id &&
    targetPolicy.chainId === grant.chainIds[0] &&
    targetPolicy.allowedFunctionSelectors.length === 1 &&
    targetPolicy.allowedFunctionSelectors[0] === SELECTOR;
  if (!exact) {
    fail(
      "transfer_intent_execution_context_mismatch",
      "TransferIntent does not resolve uniquely inside current bounded authority"
    );
  }
  const calldata = encodeFunctionData({
    abi: EXECUTOR_ABI,
    functionName: "executeProviderSpend",
    args: [row.transfer_intent_hash, row.destination_account_ref_hash, BigInt(row.source_amount_minor)]
  }).toLowerCase();
  const resolvedAction = Object.freeze({
    chainId: targetPolicy.chainId,
    accountRefHash: row.source_account_ref_hash,
    targetAddress: targetPolicy.targetAddress,
    calldata,
    nativeValueMinor: "0"
  });
  const expectedEffects = Object.freeze({
    nativeDeltaMinor: "0",
    assetDeltas: Object.freeze([
      Object.freeze({
        assetId: row.source_asset_id,
        accountRefHash: row.source_account_ref_hash,
        deltaMinor: `-${row.source_amount_minor}`
      }),
      Object.freeze({
        assetId: row.destination_asset_id,
        accountRefHash: row.destination_account_ref_hash,
        deltaMinor: row.source_amount_minor
      })
    ]),
    allowanceDeltas: Object.freeze([]),
    withdrawal: false,
    transfer: false
  });
  const core = {
    resolverId: "local_provider_spend_v1",
    resolverVersion: TRANSFER_INTENT_EXECUTION_RESOLVER_VERSION,
    transferIntentId: row.id,
    transferIntentHash: row.transfer_intent_hash,
    transferIntentVersion: Number(row.aggregate_version),
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    targetPolicyId: targetPolicy.targetPolicyId,
    targetPolicyHash: targetPolicy.policyHash,
    resolvedAction,
    expectedEffects,
    resolvedAt: now.toISOString(),
    browserAuthoredPayload: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: TRANSFER_INTENT_EXECUTION_RESOLUTION_SCHEMA_VERSION
  };
  return Object.freeze({
    resolutionHash: hashId("transfer_intent_execution_resolution", core),
    ...core
  });
}

export function describeTransferIntentExecutionResolver() {
  return Object.freeze({
    resolverId: "local_provider_spend_v1",
    resolverVersion: TRANSFER_INTENT_EXECUTION_RESOLVER_VERSION,
    supportedChains: Object.freeze(Object.keys(TARGET_BY_CHAIN)),
    functionSelector: SELECTOR,
    callerRawPayloadAccepted: false,
    externalCallsEnabled: false,
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "transfer_intent_execution_resolver_descriptor.v1"
  });
}
