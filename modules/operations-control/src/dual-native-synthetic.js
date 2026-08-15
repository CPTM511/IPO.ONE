import {
  assertAgentCreditOfferWorkflowReceipt,
  assertAgentSandboxObligationWorkflowReceipt,
  assertDualNativeCreditOfferParity,
  assertDualNativeSandboxObligationParity,
  assertHumanCreditOfferWorkflowReceipt,
  assertHumanSandboxObligationWorkflowReceipt
} from "../../../packages/api-contract/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { createPrivatePilotOperationalSourceBoundary } from "./operations-source-boundary.js";

export const DUAL_NATIVE_LIFECYCLE_SYNTHETIC_RESULT_SCHEMA_VERSION =
  "dual_native_lifecycle_synthetic_result.v1";
export const DUAL_NATIVE_LIFECYCLE_SYNTHETIC_POLICY_VERSION = "ops_001c.v1";

export const DualNativeSyntheticStage = Object.freeze({
  HUMAN_OFFER: "human_offer",
  AGENT_OFFER: "agent_offer",
  OFFER_PARITY: "offer_parity",
  HUMAN_OBLIGATION: "human_obligation",
  AGENT_OBLIGATION: "agent_obligation",
  RECEIPT_LINKAGE: "receipt_linkage",
  OBLIGATION_PARITY: "obligation_parity",
  RECONCILIATION: "reconciliation"
});

const STAGES = new Set(Object.values(DualNativeSyntheticStage));
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const RELEASE_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;
const CHECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const EXECUTOR_NAMES = Object.freeze([
  "runHumanOffer",
  "runAgentOffer",
  "runHumanObligation",
  "runAgentObligation",
  "runReconciliation"
]);

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exactKeys(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_dual_native_synthetic_result", `${name} must be an object`);
  }
  const expected = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !expected.has(key))) {
    invalid("invalid_dual_native_synthetic_result", `${name} has an invalid shape`);
  }
  return value;
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_dual_native_synthetic_result", `${name} is invalid`);
  }
  return value;
}

function contentHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid("invalid_dual_native_synthetic_result", `${name} is invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function linkageMatches(offerReceipt, obligationReceipt) {
  return (
    offerReceipt.subjectId === obligationReceipt.subjectId &&
    offerReceipt.creditIntent.creditIntentId === obligationReceipt.creditIntentId &&
    offerReceipt.offer.creditOfferId === obligationReceipt.creditOfferId &&
    offerReceipt.offer.creditOfferHash === obligationReceipt.acceptance.creditOfferHash &&
    offerReceipt.offer.termsHash === obligationReceipt.acceptance.termsHash
  );
}

function assertReconciliationSummary(summary, release) {
  exactKeys("reconciliation summary", summary, [
    "runId",
    "scope",
    "status",
    "checkCount",
    "discrepancyCount",
    "criticalCount",
    "truncated",
    "release",
    "startedAt",
    "completedAt",
    "schemaVersion"
  ], ["replayed"]);
  if (
    summary.schemaVersion !== "reconciliation_summary.v1" || summary.scope !== "full" ||
    summary.status !== "passed" || summary.discrepancyCount !== 0 ||
    summary.criticalCount !== 0 || summary.truncated !== false || summary.release !== release ||
    !Number.isSafeInteger(summary.checkCount) || summary.checkCount < 1
  ) invalid("synthetic_reconciliation_failed", "full reconciliation did not pass the synthetic gate");
  if (typeof summary.runId !== "string" || summary.runId.length < 8 || summary.runId.length > 256) {
    invalid("synthetic_reconciliation_failed", "reconciliation run identity is invalid");
  }
  timestamp("reconciliation.startedAt", summary.startedAt);
  timestamp("reconciliation.completedAt", summary.completedAt);
  return summary;
}

function evidenceRef(stage, value) {
  return Object.freeze({
    stage,
    evidenceHash: hashId(`operations_control.synthetic.${stage}`, value)
  });
}

function resultCore({
  syntheticRunId,
  tenantRefHash,
  checkIdHash,
  release,
  status,
  completedStages,
  evidenceRefs,
  reconciliationSummaryHash,
  failureStage,
  failureCode,
  startedAt,
  completedAt
}) {
  return {
    syntheticRunId,
    tenantRefHash,
    checkIdHash,
    release,
    status,
    completedStages,
    evidenceRefs,
    ...(reconciliationSummaryHash ? { reconciliationSummaryHash } : {}),
    ...(failureStage ? { failureStage, failureCode } : {}),
    startedAt,
    completedAt,
    observedAt: completedAt,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    notificationDelivered: false,
    policyVersion: DUAL_NATIVE_LIFECYCLE_SYNTHETIC_POLICY_VERSION,
    schemaVersion: DUAL_NATIVE_LIFECYCLE_SYNTHETIC_RESULT_SCHEMA_VERSION
  };
}

function finalizeResult(input) {
  const core = resultCore(input);
  return deepFreeze({
    ...core,
    resultHash: hashId("operations_control.dual_native_lifecycle_synthetic_result", core)
  });
}

export function assertDualNativeLifecycleSyntheticResult(value) {
  exactKeys("dual-native lifecycle synthetic result", value, [
    "syntheticRunId",
    "tenantRefHash",
    "checkIdHash",
    "release",
    "status",
    "completedStages",
    "evidenceRefs",
    "startedAt",
    "completedAt",
    "observedAt",
    "nonAuthorizing",
    "sandboxOnly",
    "productionFundsMoved",
    "credentialsIncluded",
    "publicEndpointEnabled",
    "notificationDelivered",
    "policyVersion",
    "resultHash",
    "schemaVersion"
  ], ["reconciliationSummaryHash", "failureStage", "failureCode"]);
  if (
    typeof value.syntheticRunId !== "string" ||
    !/^synthetic_run_[0-9a-f]{64}$/.test(value.syntheticRunId)
  ) invalid("invalid_dual_native_synthetic_result", "syntheticRunId is invalid");
  contentHash("tenantRefHash", value.tenantRefHash);
  contentHash("checkIdHash", value.checkIdHash);
  if (typeof value.release !== "string" || !RELEASE_PATTERN.test(value.release)) {
    invalid("invalid_dual_native_synthetic_result", "release is invalid");
  }
  if (!Array.isArray(value.completedStages) || value.completedStages.length > STAGES.size ||
      new Set(value.completedStages).size !== value.completedStages.length ||
      value.completedStages.some((stage) => !STAGES.has(stage))) {
    invalid("invalid_dual_native_synthetic_result", "completedStages is invalid");
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length !== value.completedStages.length) {
    invalid("invalid_dual_native_synthetic_result", "evidenceRefs is invalid");
  }
  value.evidenceRefs.forEach((reference, index) => {
    exactKeys(`evidenceRefs[${index}]`, reference, ["stage", "evidenceHash"]);
    if (reference.stage !== value.completedStages[index]) {
      invalid("invalid_dual_native_synthetic_result", "evidence stage order is invalid");
    }
    contentHash(`evidenceRefs[${index}].evidenceHash`, reference.evidenceHash);
  });
  const passed = value.status === "passed";
  const failed = value.status === "failed";
  if (!passed && !failed) invalid("invalid_dual_native_synthetic_result", "status is invalid");
  if (
    (passed && (value.failureStage !== undefined || value.failureCode !== undefined ||
      value.reconciliationSummaryHash === undefined || value.completedStages.length !== STAGES.size)) ||
    (failed && (!STAGES.has(value.failureStage) || typeof value.failureCode !== "string" ||
      !SAFE_CODE_PATTERN.test(value.failureCode) || value.reconciliationSummaryHash !== undefined))
  ) invalid("invalid_dual_native_synthetic_result", "result outcome fields are inconsistent");
  if (value.reconciliationSummaryHash !== undefined) {
    contentHash("reconciliationSummaryHash", value.reconciliationSummaryHash);
  }
  const startedAt = timestamp("startedAt", value.startedAt);
  const completedAt = timestamp("completedAt", value.completedAt);
  if (value.observedAt !== completedAt || new Date(completedAt) < new Date(startedAt)) {
    invalid("invalid_dual_native_synthetic_result", "result time window is invalid");
  }
  if (
    value.nonAuthorizing !== true || value.sandboxOnly !== true ||
    value.productionFundsMoved !== false || value.credentialsIncluded !== false ||
    value.publicEndpointEnabled !== false || value.notificationDelivered !== false ||
    value.policyVersion !== DUAL_NATIVE_LIFECYCLE_SYNTHETIC_POLICY_VERSION ||
    value.schemaVersion !== DUAL_NATIVE_LIFECYCLE_SYNTHETIC_RESULT_SCHEMA_VERSION
  ) invalid("invalid_dual_native_synthetic_result", "result safety boundary is invalid");
  const { resultHash, ...core } = value;
  if (resultHash !== hashId("operations_control.dual_native_lifecycle_synthetic_result", core)) {
    invalid("invalid_dual_native_synthetic_result", "resultHash does not match result content");
  }
  return value;
}

export class DualNativeLifecycleSyntheticRunner {
  constructor({ tenantRefHash, clock = () => new Date(), ...executors }) {
    contentHash("tenantRefHash", tenantRefHash);
    if (typeof clock !== "function" || EXECUTOR_NAMES.some((name) => typeof executors[name] !== "function")) {
      invalid("invalid_dual_native_synthetic_config", "synthetic runner dependencies are invalid");
    }
    this.tenantRefHash = tenantRefHash;
    this.clock = clock;
    this.executors = Object.fromEntries(EXECUTOR_NAMES.map((name) => [name, executors[name]]));
  }

  async run({ checkId, release }) {
    if (typeof checkId !== "string" || !CHECK_ID_PATTERN.test(checkId)) {
      invalid("invalid_dual_native_synthetic_input", "checkId is invalid");
    }
    if (typeof release !== "string" || !RELEASE_PATTERN.test(release)) {
      invalid("invalid_dual_native_synthetic_input", "release must be an exact commit SHA");
    }
    const boundary = createPrivatePilotOperationalSourceBoundary();
    const checkIdHash = hashId("operations_control.synthetic_check", { checkId });
    const startedAt = timestamp("startedAt", this.clock().toISOString());
    const syntheticRunHash = hashId("operations_control.synthetic_run", {
      tenantRefHash: this.tenantRefHash,
      checkIdHash,
      release,
      startedAt
    });
    const syntheticRunId = `synthetic_run_${syntheticRunHash.slice(2)}`;
    const completedStages = [];
    const evidenceRefs = [];
    let stage = DualNativeSyntheticStage.HUMAN_OFFER;
    let reconciliationSummaryHash;
    const context = Object.freeze({
      syntheticRunId,
      tenantRefHash: this.tenantRefHash,
      checkIdHash,
      release,
      boundary
    });
    const complete = (completedStage, value) => {
      completedStages.push(completedStage);
      evidenceRefs.push(evidenceRef(completedStage, value));
      return value;
    };
    try {
      const humanOffer = await this.executors.runHumanOffer(context);
      assertHumanCreditOfferWorkflowReceipt(humanOffer);
      complete(stage, humanOffer);

      stage = DualNativeSyntheticStage.AGENT_OFFER;
      const agentOffer = await this.executors.runAgentOffer(context);
      assertAgentCreditOfferWorkflowReceipt(agentOffer);
      complete(stage, agentOffer);

      stage = DualNativeSyntheticStage.OFFER_PARITY;
      complete(stage, assertDualNativeCreditOfferParity({ humanReceipt: humanOffer, agentReceipt: agentOffer }));

      stage = DualNativeSyntheticStage.HUMAN_OBLIGATION;
      const humanObligation = await this.executors.runHumanObligation(context);
      assertHumanSandboxObligationWorkflowReceipt(humanObligation);
      complete(stage, humanObligation);

      stage = DualNativeSyntheticStage.AGENT_OBLIGATION;
      const agentObligation = await this.executors.runAgentObligation(context);
      assertAgentSandboxObligationWorkflowReceipt(agentObligation);
      complete(stage, agentObligation);

      stage = DualNativeSyntheticStage.RECEIPT_LINKAGE;
      if (!linkageMatches(humanOffer, humanObligation) || !linkageMatches(agentOffer, agentObligation)) {
        invalid("synthetic_receipt_linkage_failed", "Offer and Obligation receipts do not share exact lifecycle identity");
      }
      complete(stage, {
        humanOfferHash: hashId("operations_control.synthetic.human_offer_link", humanOffer),
        humanObligationHash: hashId("operations_control.synthetic.human_obligation_link", humanObligation),
        agentOfferHash: hashId("operations_control.synthetic.agent_offer_link", agentOffer),
        agentObligationHash: hashId("operations_control.synthetic.agent_obligation_link", agentObligation)
      });

      stage = DualNativeSyntheticStage.OBLIGATION_PARITY;
      complete(stage, assertDualNativeSandboxObligationParity({
        humanReceipt: humanObligation,
        agentReceipt: agentObligation
      }));

      stage = DualNativeSyntheticStage.RECONCILIATION;
      const reconciliation = assertReconciliationSummary(
        await this.executors.runReconciliation(context),
        release
      );
      complete(stage, reconciliation);
      reconciliationSummaryHash = hashId("operations_control.synthetic.reconciliation_summary", reconciliation);

      const result = finalizeResult({
        syntheticRunId,
        tenantRefHash: this.tenantRefHash,
        checkIdHash,
        release,
        status: "passed",
        completedStages: Object.freeze(completedStages),
        evidenceRefs: Object.freeze(evidenceRefs),
        reconciliationSummaryHash,
        startedAt,
        completedAt: timestamp("completedAt", this.clock().toISOString())
      });
      assertDualNativeLifecycleSyntheticResult(result);
      return result;
    } catch (error) {
      const failureCode = typeof error?.code === "string" && SAFE_CODE_PATTERN.test(error.code)
        ? error.code
        : "synthetic_stage_failed";
      const result = finalizeResult({
        syntheticRunId,
        tenantRefHash: this.tenantRefHash,
        checkIdHash,
        release,
        status: "failed",
        completedStages: Object.freeze(completedStages),
        evidenceRefs: Object.freeze(evidenceRefs),
        failureStage: stage,
        failureCode,
        startedAt,
        completedAt: timestamp("completedAt", this.clock().toISOString())
      });
      assertDualNativeLifecycleSyntheticResult(result);
      return result;
    }
  }
}
