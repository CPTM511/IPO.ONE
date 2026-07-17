export type TenantProtocolOperationId =
  | "pilotAcceptCreditOffer"
  | "pilotAcknowledgeProviderIntent"
  | "pilotActivateSandboxMandate"
  | "pilotCreateAgentAccountChallenge"
  | "pilotCreateAgentSubject"
  | "pilotCreateConsent"
  | "pilotCreateHumanSubject"
  | "pilotCreateDraftMandate"
  | "pilotEvaluateCreditApplication"
  | "pilotExecuteSandboxObligation"
  | "pilotFreezeSubject"
  | "pilotPostSandboxRepayment"
  | "pilotRepurchaseSandboxObligation"
  | "pilotRestructureSandboxObligation"
  | "pilotRequestCredit"
  | "pilotReadAgentSelf"
  | "pilotReadAgentAccountBinding"
  | "pilotReadCreditApplication"
  | "pilotReadConsent"
  | "pilotReadHumanSelf"
  | "pilotReadWorkspaceResume"
  | "pilotReadIdentityReference"
  | "pilotReadMandate"
  | "pilotReadTenantRisk"
  | "pilotReadPilotHealth"
  | "pilotReadPilotFeedbackSummary"
  | "pilotReadServicingQueue"
  | "pilotReadEvidence"
  | "pilotReadOwnObligation"
  | "pilotReadOwnObligationEvidence"
  | "pilotReadProviderIntent"
  | "pilotRevokeConsent"
  | "pilotRevokeDraftMandate"
  | "pilotSubmitAgentAccountProof"
  | "pilotSubmitPilotFeedback"
  | "pilotWriteOffSandboxObligation"
  | "workerAdvanceSandboxServicing"
  | "workerProcessInbox";

export type TenantProtocolRequestSchemaVersion = "tenant_protocol_request.v1";
export type TenantProtocolResultSchemaVersion = "tenant_protocol_result.v1";
export type TenantProtocolCatalogSchemaVersion = "tenant_protocol_catalog.v1";
export type AgentHandoffManifestSchemaVersion = "agent_handoff_manifest.v1";
export type AgentPilotCapabilityManifestSchemaVersion =
  "agent_pilot_capability_manifest.v1";
export type AgentCreditOfferWorkflowReceiptSchemaVersion =
  "agent_credit_offer_workflow_receipt.v1";
export type AgentSandboxObligationWorkflowReceiptSchemaVersion =
  "agent_sandbox_obligation_workflow_receipt.v1";
export type HumanCreditOfferWorkflowReceiptSchemaVersion =
  "human_credit_offer_workflow_receipt.v1";
export type HumanSandboxObligationWorkflowReceiptSchemaVersion =
  "human_sandbox_obligation_workflow_receipt.v1";
export type SandboxObligationPortabilityReceiptSchemaVersion =
  "sandbox_obligation_portability_receipt.v1";
export type MandateCapability =
  | "request_credit"
  | "accept_credit_offer"
  | "execute_sandbox_credit"
  | "provider_spend"
  | "capture_revenue"
  | "route_repayment";
export type MandateStatus = "draft" | "active" | "suspended" | "revoked" | "expired";
export type SubjectStatus = "pending" | "active" | "suspended" | "closed";
export type RepaymentFrequency = "weekly" | "biweekly" | "monthly" | "end_of_term";
export type ProtectiveReasonCode =
  | "credential_compromise"
  | "operator_request"
  | "provider_failure"
  | "reconciliation_failure"
  | "risk_limit_breach"
  | "security_incident"
  | "stop_loss_triggered";

export interface AgentHandoffToolReference {
  name:
    | "ipo_one_read_self"
    | "ipo_one_request_credit"
    | "ipo_one_read_credit_application"
    | "ipo_one_evaluate_credit_application"
    | "ipo_one_submit_account_proof"
    | "ipo_one_read_account_binding"
    | "ipo_one_read_obligation"
    | "ipo_one_read_obligation_evidence"
    | "ipo_one_accept_credit_offer"
    | "ipo_one_execute_sandbox_obligation"
    | "ipo_one_post_sandbox_repayment";
  operationId:
    | "pilotReadAgentSelf"
    | "pilotRequestCredit"
    | "pilotReadCreditApplication"
    | "pilotEvaluateCreditApplication"
    | "pilotSubmitAgentAccountProof"
    | "pilotReadAgentAccountBinding"
    | "pilotReadOwnObligation"
    | "pilotReadOwnObligationEvidence"
    | "pilotAcceptCreditOffer"
    | "pilotExecuteSandboxObligation"
    | "pilotPostSandboxRepayment";
}

interface AgentHandoffManifestSafety {
  schemaVersion: AgentHandoffManifestSchemaVersion;
  nonAuthorizing: true;
  credentialDelivery: "out_of_band";
  credentialsIncluded: false;
  publicEndpointEnabled: false;
  remoteMcpEnabled: false;
  fundsAuthority: false;
}

export interface AwaitingAgentHandoffManifest extends AgentHandoffManifestSafety {
  status: "awaiting_active_mandate";
  requiredState: readonly ["active Agent Subject", "active sandbox Mandate"];
}

export interface ApplicationReadyAgentHandoffManifest extends AgentHandoffManifestSafety {
  status: "application_ready";
  subjectId: string;
  mandateId: string;
  mandateHash: string;
  termsHash: string;
  authority: {
    status: "draft";
    capabilities: MandateCapability[];
    assetIds: string[];
    perActionLimitMinor: string;
    aggregateLimitMinor: string;
    expiresAt: string;
  };
  protocol: {
    requestSchemaVersion: TenantProtocolRequestSchemaVersion;
    transportProfile: "mcp_stdio_local";
    nextTool: "ipo_one_read_self";
    tools: readonly AgentHandoffToolReference[];
  };
}

export interface ReadyAgentHandoffManifest extends AgentHandoffManifestSafety {
  status: "ready";
  subjectId: string;
  mandateId: string;
  mandateHash: string;
  termsHash: string;
  authority: {
    status: "active";
    capabilities: MandateCapability[];
    assetIds: string[];
    perActionLimitMinor: string;
    aggregateLimitMinor: string;
    expiresAt: string;
  };
  protocol: {
    requestSchemaVersion: TenantProtocolRequestSchemaVersion;
    transportProfile: "mcp_stdio_local";
    nextTool: "ipo_one_read_self";
    tools: readonly AgentHandoffToolReference[];
  };
}

export type AgentHandoffManifest =
  | AwaitingAgentHandoffManifest
  | ApplicationReadyAgentHandoffManifest
  | ReadyAgentHandoffManifest;

export type AgentPilotWorkflowAvailability = "enabled" | "locked" | "input_required";
export type AgentPilotWorkflowBlockedReason =
  | "awaiting_application_handoff"
  | "application_handoff_only"
  | "active_mandate_required"
  | "required_mandate_capabilities_missing"
  | "prior_receipt_required";

export interface AgentPilotWorkflowCapability {
  sequence: 1 | 2 | 3;
  workflowId: "credit_offer" | "sandbox_obligation" | "obligation_portability";
  entryPoint:
    | "runAgentCreditOfferWorkflow"
    | "runAgentSandboxObligationWorkflow"
    | "runSandboxObligationPortabilityConformance";
  interface: "sdk_mcp_stdio_local" | "sdk_tenant_protocol_local" | "sdk_local_conformance";
  requiredHandoffStatus: "application_ready" | "ready" | "none";
  requiredCapabilities: readonly MandateCapability[];
  inputSchemaVersion:
    | TenantProtocolRequestSchemaVersion
    | AgentCreditOfferWorkflowReceiptSchemaVersion
    | AgentSandboxObligationWorkflowReceiptSchemaVersion;
  outputSchemaVersion:
    | AgentCreditOfferWorkflowReceiptSchemaVersion
    | AgentSandboxObligationWorkflowReceiptSchemaVersion
    | SandboxObligationPortabilityReceiptSchemaVersion;
  availability: AgentPilotWorkflowAvailability;
  blockedReason?: AgentPilotWorkflowBlockedReason;
}

export interface AgentPilotCapabilityManifest {
  schemaVersion: AgentPilotCapabilityManifestSchemaVersion;
  status: "waiting" | "application_ready" | "runtime_ready";
  nextAgentAction:
    | "await_principal_handoff"
    | "run_credit_offer_workflow"
    | "run_sandbox_obligation_workflow"
    | "request_principal_scope_review";
  handoff: AgentHandoffManifest;
  mcp: {
    registryVersion: "agent_mcp_registry.v2";
    transportProfile: "mcp_stdio_local";
    toolCount: 10;
    tools: readonly AgentHandoffToolReference[];
    economicLifecycleToolsIncluded: true;
  };
  workflows: readonly [
    AgentPilotWorkflowCapability,
    AgentPilotWorkflowCapability,
    AgentPilotWorkflowCapability
  ];
  nonAuthorizing: true;
  sandboxOnly: true;
  productionFundsApproved: false;
  productionFundsMoved: false;
  withdrawable: false;
  fundsAuthority: false;
  credentialsIncluded: false;
  publicEndpointEnabled: false;
  remoteMcpEnabled: false;
  economicMcpToolsEnabled: true;
  liveChainExecution: false;
}

export const AGENT_PILOT_CAPABILITY_MANIFEST_SCHEMA_VERSION:
  AgentPilotCapabilityManifestSchemaVersion;
export const AGENT_PILOT_MCP_TOOLS: readonly AgentHandoffToolReference[];
export function createAgentPilotCapabilityManifest(
  handoff: AgentHandoffManifest
): AgentPilotCapabilityManifest;
export function isAgentPilotCapabilityManifest(
  value: unknown
): value is AgentPilotCapabilityManifest;
export function assertAgentPilotCapabilityManifest(
  value: unknown
): asserts value is AgentPilotCapabilityManifest;

export type AgentCreditWorkflowIntent = Omit<CreditIntentSummary, "authorityType"> & {
  authorityType: "mandate";
};

export type AgentCreditWorkflowDecision = Omit<
  CreditDecisionSummary,
  "authorityType" | "decisionPassport"
> & {
  authorityType: "mandate";
  decisionPassport: CreditDecisionPassportSummary;
};

export interface AgentCreditOfferWorkflowStep {
  sequence: 1 | 2 | 3 | 4;
  tool: AgentHandoffToolReference["name"];
  operationId: AgentHandoffToolReference["operationId"];
  requestId: string;
  replayed: boolean;
  responseSchemaVersion:
    | "tenant_agent_subject_view.v2"
    | "tenant_credit_intent_created.v1"
    | "tenant_credit_application_view.v1"
    | "tenant_credit_application_evaluated.v2";
}

interface AgentCreditOfferWorkflowReceiptBase {
  schemaVersion: AgentCreditOfferWorkflowReceiptSchemaVersion;
  transportProfile: "mcp_stdio_local";
  nonAuthorizing: true;
  sandboxOnly: true;
  productionFundsApproved: false;
  fundsAuthority: false;
  credentialsIncluded: false;
  publicEndpointEnabled: false;
  remoteMcpEnabled: false;
  workflowId: string;
  correlationId: string;
  subjectId: string;
  mandateId: string;
  creditIntent: AgentCreditWorkflowIntent;
  steps: readonly [
    AgentCreditOfferWorkflowStep,
    AgentCreditOfferWorkflowStep,
    AgentCreditOfferWorkflowStep,
    AgentCreditOfferWorkflowStep
  ];
}

export interface AgentCreditOfferReadyWorkflowReceipt
  extends AgentCreditOfferWorkflowReceiptBase {
  status: "offer_ready";
  decision: AgentCreditWorkflowDecision & { status: "approved" };
  offer: CreditOfferSummary;
}

export interface AgentCreditDecisionCompleteWorkflowReceipt
  extends AgentCreditOfferWorkflowReceiptBase {
  status: "decision_complete";
  decision: AgentCreditWorkflowDecision & { status: "rejected" | "frozen" };
  offer: null;
}

export type AgentCreditOfferWorkflowReceipt =
  | AgentCreditOfferReadyWorkflowReceipt
  | AgentCreditDecisionCompleteWorkflowReceipt;

export const AGENT_CREDIT_OFFER_WORKFLOW_RECEIPT_SCHEMA_VERSION:
  AgentCreditOfferWorkflowReceiptSchemaVersion;
export function isAgentCreditOfferWorkflowReceipt(
  value: unknown
): value is AgentCreditOfferWorkflowReceipt;
export function assertAgentCreditOfferWorkflowReceipt(
  value: unknown
): asserts value is AgentCreditOfferWorkflowReceipt;

export interface AgentSandboxObligationWorkflowStep {
  sequence: 1 | 2 | 3;
  operationId:
    | "pilotAcceptCreditOffer"
    | "pilotExecuteSandboxObligation"
    | "pilotPostSandboxRepayment";
  requestId: string;
  replayed: boolean;
  responseSchemaVersion:
    | "tenant_credit_offer_accepted.v1"
    | "tenant_sandbox_obligation_executed.v1"
    | "tenant_sandbox_repayment_posted.v1";
}

export interface AgentSandboxObligationWorkflowReceipt {
  schemaVersion: AgentSandboxObligationWorkflowReceiptSchemaVersion;
  status: "repayment_posted";
  transportProfile: "local_in_process";
  nonAuthorizing: true;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  fundsAuthority: false;
  credentialsIncluded: false;
  publicEndpointEnabled: false;
  remoteMcpEnabled: false;
  workflowId: string;
  correlationId: string;
  subjectId: string;
  mandateId: string;
  creditIntentId: string;
  creditOfferId: string;
  acceptance: CreditOfferAcceptanceSummary & { authorityType: "mandate" };
  obligation: SharedObligationSummary & {
    authorityType: "mandate";
    executionStatus: "executed";
    status: "partially_repaid" | "fully_repaid";
    withdrawable: false;
  };
  executionReceipt: SandboxExecutionReceiptSummary;
  principalLedgerTransactionId: string;
  repayment: SandboxRepaymentSummary;
  steps: readonly [
    AgentSandboxObligationWorkflowStep,
    AgentSandboxObligationWorkflowStep,
    AgentSandboxObligationWorkflowStep
  ];
}

export const AGENT_SANDBOX_OBLIGATION_WORKFLOW_RECEIPT_SCHEMA_VERSION:
  AgentSandboxObligationWorkflowReceiptSchemaVersion;
export function isAgentSandboxObligationWorkflowReceipt(
  value: unknown
): value is AgentSandboxObligationWorkflowReceipt;
export function assertAgentSandboxObligationWorkflowReceipt(
  value: unknown
): asserts value is AgentSandboxObligationWorkflowReceipt;

export interface HumanSandboxObligationWorkflowStep {
  sequence: 1 | 2 | 3;
  operationId:
    | "pilotAcceptCreditOffer"
    | "pilotExecuteSandboxObligation"
    | "pilotPostSandboxRepayment";
  requestId: string;
  replayed: boolean;
  responseSchemaVersion:
    | "tenant_credit_offer_accepted.v1"
    | "tenant_sandbox_obligation_executed.v1"
    | "tenant_sandbox_repayment_posted.v1";
}

export interface HumanSandboxObligationWorkflowReceipt {
  schemaVersion: HumanSandboxObligationWorkflowReceiptSchemaVersion;
  status: "repayment_posted";
  transportProfile: "authenticated_http_loopback";
  nonAuthorizing: true;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  fundsAuthority: false;
  credentialsIncluded: false;
  publicEndpointEnabled: false;
  remoteMcpEnabled: false;
  workflowId: string;
  correlationId: string;
  subjectId: string;
  consentId: string;
  identityReferenceId: string;
  creditIntentId: string;
  creditOfferId: string;
  repaymentSequence: number;
  acceptance: CreditOfferAcceptanceSummary & { authorityType: "consent" };
  obligation: SharedObligationSummary & {
    authorityType: "consent";
    executionStatus: "executed";
    status: "partially_repaid" | "fully_repaid";
    withdrawable: false;
  };
  executionReceipt: SandboxExecutionReceiptSummary;
  principalLedgerTransactionId: string;
  repayment: SandboxRepaymentSummary;
  steps: readonly [
    HumanSandboxObligationWorkflowStep,
    HumanSandboxObligationWorkflowStep,
    HumanSandboxObligationWorkflowStep
  ];
}

export const HUMAN_SANDBOX_OBLIGATION_WORKFLOW_RECEIPT_SCHEMA_VERSION:
  HumanSandboxObligationWorkflowReceiptSchemaVersion;
export function isHumanSandboxObligationWorkflowReceipt(
  value: unknown
): value is HumanSandboxObligationWorkflowReceipt;
export function assertHumanSandboxObligationWorkflowReceipt(
  value: unknown
): asserts value is HumanSandboxObligationWorkflowReceipt;

export interface SandboxObligationPortabilityProfileResult {
  readonly profileId:
    | "base_sepolia_execution_test_v1"
    | "x_layer_testnet_portability_v1";
  readonly displayName: "Base Sepolia" | "X Layer Testnet";
  readonly role: "primary_execution_test" | "portability_conformance";
  readonly chainId: "eip155:84532" | "eip155:1952";
  readonly adapterVersion: string;
  readonly profileHash: string;
  readonly canonicalPaymentRef: string;
  readonly finalityProofHash: string;
  readonly evidenceHash: string;
  readonly sourceFinality: "finalized";
  readonly selectedProviderSlot: "secondary";
  readonly duplicateDisposition: "duplicate";
  readonly deterministicReplay: true;
  readonly reorgInvalidation: true;
  readonly providerFailover: true;
  readonly executionCapFailsClosed: true;
  readonly sandboxOnly: true;
  readonly productionFundsMoved: false;
  readonly networkCallsMade: false;
}

export interface SandboxObligationPortabilityReceipt {
  readonly schemaVersion: SandboxObligationPortabilityReceiptSchemaVersion;
  readonly status: "conformant";
  readonly entryMode: "human" | "agent";
  readonly sourceReceiptSchemaVersion:
    | HumanSandboxObligationWorkflowReceiptSchemaVersion
    | AgentSandboxObligationWorkflowReceiptSchemaVersion;
  readonly obligationId: string;
  readonly paymentId: string;
  readonly assetId: string;
  readonly amountMinor: string;
  readonly principalLedgerTransactionId: string;
  readonly paymentLedgerTransactionId: string;
  readonly canonicalPaymentRef: string;
  readonly kernelInvariantHash: string;
  readonly profiles: readonly [
    SandboxObligationPortabilityProfileResult,
    SandboxObligationPortabilityProfileResult
  ];
  readonly invariants: {
    readonly canonicalPaymentChainNeutral: true;
    readonly obligationKernelUnchanged: true;
    readonly ledgerReferencesBound: true;
    readonly explicitFinality: true;
    readonly deterministicReplay: true;
    readonly reorgInvalidation: true;
    readonly providerFailover: true;
    readonly executionCapFailsClosed: true;
  };
  readonly nonAuthorizing: true;
  readonly sandboxOnly: true;
  readonly productionFundsMoved: false;
  readonly withdrawable: false;
  readonly fundsAuthority: false;
  readonly networkCallsMade: false;
  readonly liveTestnetExecution: false;
  readonly credentialsIncluded: false;
  readonly privateKeysIncluded: false;
  readonly publicEndpointEnabled: false;
  readonly remoteMcpEnabled: false;
  readonly receiptHash: string;
}

export const SANDBOX_OBLIGATION_PORTABILITY_RECEIPT_SCHEMA_VERSION:
  SandboxObligationPortabilityReceiptSchemaVersion;
export function isSandboxObligationPortabilityReceipt(
  value: unknown
): value is SandboxObligationPortabilityReceipt;
export function assertSandboxObligationPortabilityReceipt(
  value: unknown
): asserts value is SandboxObligationPortabilityReceipt;

export type HumanCreditWorkflowIntent = Omit<CreditIntentSummary, "authorityType"> & {
  authorityType: "consent";
};

export type HumanCreditWorkflowDecision = Omit<
  CreditDecisionSummary,
  "authorityType" | "decisionPassport"
> & {
  authorityType: "consent";
  decisionPassport: CreditDecisionPassportSummary;
};

export interface HumanCreditOfferWorkflowStep {
  sequence: 1 | 2 | 3 | 4;
  operationId:
    | "pilotReadHumanSelf"
    | "pilotRequestCredit"
    | "pilotReadCreditApplication"
    | "pilotEvaluateCreditApplication";
  requestId: string;
  replayed: boolean;
  responseSchemaVersion:
    | "tenant_human_subject_view.v1"
    | "tenant_credit_intent_created.v1"
    | "tenant_credit_application_view.v1"
    | "tenant_credit_application_evaluated.v2";
}

interface HumanCreditOfferWorkflowReceiptBase {
  schemaVersion: HumanCreditOfferWorkflowReceiptSchemaVersion;
  transportProfile: "authenticated_http_loopback";
  nonAuthorizing: true;
  sandboxOnly: true;
  productionFundsApproved: false;
  fundsAuthority: false;
  credentialsIncluded: false;
  publicEndpointEnabled: false;
  remoteMcpEnabled: false;
  workflowId: string;
  correlationId: string;
  subjectId: string;
  consentId: string;
  identityReferenceId: string;
  creditIntent: HumanCreditWorkflowIntent;
  steps: readonly [
    HumanCreditOfferWorkflowStep,
    HumanCreditOfferWorkflowStep,
    HumanCreditOfferWorkflowStep,
    HumanCreditOfferWorkflowStep
  ];
}

export interface HumanCreditOfferReadyWorkflowReceipt
  extends HumanCreditOfferWorkflowReceiptBase {
  status: "offer_ready";
  decision: HumanCreditWorkflowDecision & { status: "approved" };
  offer: CreditOfferSummary;
}

export interface HumanCreditDecisionCompleteWorkflowReceipt
  extends HumanCreditOfferWorkflowReceiptBase {
  status: "decision_complete";
  decision: HumanCreditWorkflowDecision & { status: "rejected" | "frozen" };
  offer: null;
}

export type HumanCreditOfferWorkflowReceipt =
  | HumanCreditOfferReadyWorkflowReceipt
  | HumanCreditDecisionCompleteWorkflowReceipt;

export const HUMAN_CREDIT_OFFER_WORKFLOW_RECEIPT_SCHEMA_VERSION:
  HumanCreditOfferWorkflowReceiptSchemaVersion;
export function isHumanCreditOfferWorkflowReceipt(
  value: unknown
): value is HumanCreditOfferWorkflowReceipt;
export function assertHumanCreditOfferWorkflowReceipt(
  value: unknown
): asserts value is HumanCreditOfferWorkflowReceipt;

export type DualNativeOfferEconomicsSchemaVersion =
  "dual_native_offer_economics.v1";

export interface DualNativeOfferEconomicParity {
  readonly schemaVersion: DualNativeOfferEconomicsSchemaVersion;
  readonly matched: true;
  readonly nonAuthorizing: true;
  readonly sandboxOnly: true;
  readonly productionFundsApproved: false;
  readonly fundsAuthority: false;
  readonly credentialsIncluded: false;
  readonly entries: {
    readonly human: "consent_authenticated_http_loopback";
    readonly agent: "mandate_mcp_stdio_local";
  };
  readonly economics: {
    readonly creditIntent: {
      readonly assetId: string;
      readonly requestedPrincipalMinor: string;
      readonly purposeCode: string;
      readonly requestedTermDays: number;
      readonly repaymentFrequency: RepaymentFrequency;
      readonly installmentCount: number;
      readonly status: "decided";
      readonly sandboxOnly: true;
      readonly productionFundsRequested: false;
    };
    readonly decision: {
      readonly status: "approved";
      readonly policyVersion: string;
      readonly featureSetVersion: "credit-application-evidence-features.v1";
      readonly approvedPrincipalMinor: string;
      readonly sandboxOnly: true;
      readonly productionAuthority: false;
      readonly passportNonAuthorizing: true;
      readonly passportSandboxOnly: true;
      readonly passportProductionAuthority: false;
    };
    readonly offer: {
      readonly assetId: string;
      readonly approvedPrincipalMinor: string;
      readonly annualRateBps: number;
      readonly originationFeeMinor: string;
      readonly repaymentFrequency: RepaymentFrequency;
      readonly installmentCount: number;
      readonly firstPaymentOffsetMs: number;
      readonly maturityOffsetMs: number;
      readonly validityOffsetMs: number;
      readonly disclosureRef: string;
      readonly termsVersion: string;
      readonly status: "offered";
      readonly sandboxOnly: true;
      readonly productionFundsApproved: false;
    };
    readonly safety: {
      readonly nonAuthorizing: true;
      readonly sandboxOnly: true;
      readonly productionFundsApproved: false;
      readonly fundsAuthority: false;
      readonly credentialsIncluded: false;
      readonly publicEndpointEnabled: false;
      readonly remoteMcpEnabled: false;
    };
  };
}

export const DUAL_NATIVE_OFFER_ECONOMICS_SCHEMA_VERSION:
  DualNativeOfferEconomicsSchemaVersion;
export function assertDualNativeCreditOfferParity(input: {
  humanReceipt: HumanCreditOfferWorkflowReceipt;
  agentReceipt: AgentCreditOfferWorkflowReceipt;
}): DualNativeOfferEconomicParity;

export type DualNativeObligationEconomicsSchemaVersion =
  "dual_native_obligation_economics.v1";

export interface DualNativeObligationEconomicParity {
  readonly schemaVersion: DualNativeObligationEconomicsSchemaVersion;
  readonly matched: true;
  readonly nonAuthorizing: true;
  readonly sandboxOnly: true;
  readonly productionFundsMoved: false;
  readonly withdrawable: false;
  readonly fundsAuthority: false;
  readonly credentialsIncluded: false;
  readonly entries: {
    readonly human: "consent_authenticated_http_loopback";
    readonly agent: "mandate_local_in_process";
  };
  readonly economics: {
    readonly obligation: {
      readonly assetId: string;
      readonly originalPrincipalMinor: string;
      readonly outstandingPrincipalMinor: string;
      readonly annualRateBps: number;
      readonly originationFeeMinor: string;
      readonly accruedInterestMinor: string;
      readonly outstandingInterestMinor: string;
      readonly accruedFeesMinor: string;
      readonly outstandingFeesMinor: string;
      readonly totalRepaidMinor: string;
      readonly repaymentFrequency: RepaymentFrequency;
      readonly installmentCount: number;
      readonly firstPaymentOffsetMs: number;
      readonly maturityOffsetMs: number;
      readonly scheduleVersion: string;
      readonly scheduleSequence: number;
      readonly installments: readonly {
        readonly installmentNumber: number;
        readonly dueOffsetMs: number;
        readonly scheduledPrincipalMinor: string;
        readonly scheduledInterestMinor: string;
        readonly scheduledFeeMinor: string;
        readonly paidPrincipalMinor: string;
        readonly paidInterestMinor: string;
        readonly paidFeeMinor: string;
        readonly status: string;
        readonly scheduleVersion: string;
        readonly scheduleSequence: number;
        readonly schemaVersion: "obligation_installment.v1";
      }[];
      readonly executionStatus: "executed";
      readonly status: "partially_repaid" | "fully_repaid";
      readonly servicingClassification: string;
      readonly daysPastDue: number;
      readonly servicingReasonCode: string;
      readonly servicingPolicyVersion: string;
      readonly servicingOwnerCode: string;
      readonly writtenOffPrincipalMinor: string;
      readonly writtenOffInterestMinor: string;
      readonly writtenOffFeesMinor: string;
    };
    readonly execution: {
      readonly assetId: string;
      readonly amountMinor: string;
      readonly adapterId: string;
      readonly adapterVersion: string;
      readonly executedOffsetMs: number;
      readonly sandboxOnly: true;
      readonly productionFundsMoved: false;
      readonly withdrawable: false;
    };
    readonly repayment: {
      readonly assetId: string;
      readonly requestedMinor: string;
      readonly appliedMinor: string;
      readonly appliedFeeMinor: string;
      readonly appliedInterestMinor: string;
      readonly appliedPrincipalMinor: string;
      readonly surplusMinor: string;
      readonly remainingPrincipalMinor: string;
      readonly remainingInterestMinor: string;
      readonly remainingFeesMinor: string;
      readonly accruedInterestMinor: string;
      readonly accrualDays: number;
      readonly occurredOffsetMs: number;
      readonly sandboxOnly: true;
      readonly productionFundsMoved: false;
    };
    readonly safety: {
      readonly nonAuthorizing: true;
      readonly sandboxOnly: true;
      readonly productionFundsMoved: false;
      readonly withdrawable: false;
      readonly fundsAuthority: false;
      readonly credentialsIncluded: false;
      readonly publicEndpointEnabled: false;
      readonly remoteMcpEnabled: false;
    };
  };
}

export const DUAL_NATIVE_OBLIGATION_ECONOMICS_SCHEMA_VERSION:
  DualNativeObligationEconomicsSchemaVersion;
export function assertDualNativeSandboxObligationParity(input: {
  humanReceipt: HumanSandboxObligationWorkflowReceipt;
  agentReceipt: AgentSandboxObligationWorkflowReceipt;
}): DualNativeObligationEconomicParity;

export interface TenantProtocolResourceReference {
  resourceType: "subject" | "consent" | "credit_intent" | "credit_offer" | "evidence" | "human_identity_reference" | "inbox_message" | "mandate" | "obligation" | "risk_portfolio" | "servicing_queue" | "transfer_intent";
  resourceId: string;
}

export interface TenantProtocolRequestBase {
  operationId: TenantProtocolOperationId;
  payload: Record<string, unknown>;
  requestId: string;
  correlationId: string;
  retryAttempt?: number;
  approvalArtifact?: { proposalId: string; proposalVersion: number };
  schemaVersion: TenantProtocolRequestSchemaVersion;
}

export interface CreateAgentSubjectRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateAgentSubject";
  payload: { subjectActorId: string; displayName: string; jurisdiction?: string };
  idempotencyKey: string;
}

export type AgentAccountPurpose = "primary" | "revenue" | "repayment" | "treasury" | "execution";

export interface CreateAgentAccountChallengeRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateAgentAccountChallenge";
  payload: { accountId: string; purpose: AgentAccountPurpose };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface SubmitAgentAccountProofRequest extends TenantProtocolRequestBase {
  operationId: "pilotSubmitAgentAccountProof";
  payload: { challengeId: string; accountId: string; signature: string };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadAgentAccountBindingRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadAgentAccountBinding";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
}

export interface CreateHumanSubjectRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateHumanSubject";
  payload: Record<string, never>;
  idempotencyKey: string;
}

export interface CreateConsentRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateConsent";
  payload: {
    purposes: Array<"credit_application" | "credit_decision" | "credit_offer_acceptance" | "identity_reference_use" | "obligation_servicing" | "evidence_sharing">;
    allowedAssetIds: string[];
    allowedCreditPurposeCodes: string[];
    allowedRepaymentFrequencies: Array<"weekly" | "biweekly" | "monthly" | "end_of_term">;
    maxRequestedPrincipalMinor: string;
    maxRequestedTermDays: number;
    maxInstallmentCount: number;
    termsRef: string;
    termsVersion: string;
    dataUsageRef: string;
    dataUsageVersion: string;
    disclosureRef: string;
    validFrom?: string;
    expiresAt: string;
  };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface CreateDraftMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateDraftMandate";
  payload: {
    capabilities: MandateCapability[];
    allowedProviderIds: string[];
    allowedCategories: string[];
    assetIds: string[];
    perActionLimitMinor: string;
    aggregateLimitMinor: string;
    validFrom: string;
    expiresAt: string;
    nonce: string;
    termsRef: string;
  };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ActivateSandboxMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotActivateSandboxMandate";
  payload: {
    expectedMandateHash: string;
    acknowledgedTermsHash: string;
    acknowledgementCode: "principal_authorizes_sandbox_credit_v1";
  };
  resource: { resourceType: "mandate"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadAgentSelfRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadAgentSelf";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
}

export interface RequestCreditPayload {
  authorityId: string;
  assetId: string;
  requestedPrincipalMinor: string;
  purposeCode: string;
  requestedTermDays: number;
  repaymentFrequency: RepaymentFrequency;
  installmentCount: number;
}

export interface RequestCreditIntentRequest extends TenantProtocolRequestBase {
  operationId: "pilotRequestCredit";
  payload: RequestCreditPayload;
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadCreditApplicationRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadCreditApplication";
  payload: Record<string, never>;
  resource: { resourceType: "credit_intent"; resourceId: string };
}

export interface EvaluateCreditApplicationRequest extends TenantProtocolRequestBase {
  operationId: "pilotEvaluateCreditApplication";
  payload: Record<string, never>;
  resource: { resourceType: "credit_intent"; resourceId: string };
  idempotencyKey: string;
}

export interface AcceptCreditOfferRequest extends TenantProtocolRequestBase {
  operationId: "pilotAcceptCreditOffer";
  payload: {
    expectedOfferHash: string;
    expectedTermsHash: string;
    acknowledgementHash: string;
  };
  resource: { resourceType: "credit_offer"; resourceId: string };
  idempotencyKey: string;
}

export interface ExecuteSandboxObligationRequest extends TenantProtocolRequestBase {
  operationId: "pilotExecuteSandboxObligation";
  payload: Record<string, never>;
  resource: { resourceType: "obligation"; resourceId: string };
  idempotencyKey: string;
}

export type SandboxRepaymentSource =
  | "synthetic_wallet"
  | "synthetic_bank"
  | "synthetic_revenue";

export interface PostSandboxRepaymentRequest extends TenantProtocolRequestBase {
  operationId: "pilotPostSandboxRepayment";
  payload: { amountMinor: string; sourceCode: SandboxRepaymentSource };
  resource: { resourceType: "obligation"; resourceId: string };
  idempotencyKey: string;
}

export interface AdvanceSandboxServicingRequest extends TenantProtocolRequestBase {
  operationId: "workerAdvanceSandboxServicing";
  payload: Record<string, never>;
  resource: { resourceType: "obligation"; resourceId: string };
  reasonCode: "servicing_clock_tick";
  idempotencyKey: string;
}

export interface RestructureSandboxObligationRequest extends TenantProtocolRequestBase {
  operationId: "pilotRestructureSandboxObligation";
  payload: { expectedServicingStateHash: string; additionalTermDays: number };
  resource: { resourceType: "obligation"; resourceId: string };
  reasonCode: "sandbox_hardship_restructure";
  approvalArtifact: { proposalId: string; proposalVersion: number };
  idempotencyKey: string;
}

export interface RepurchaseSandboxObligationRequest extends TenantProtocolRequestBase {
  operationId: "pilotRepurchaseSandboxObligation";
  payload: {
    expectedServicingStateHash: string;
    servicingOwnerCode: "sandbox_platform" | "sandbox_originator";
  };
  resource: { resourceType: "obligation"; resourceId: string };
  reasonCode: "sandbox_contractual_repurchase";
  approvalArtifact: { proposalId: string; proposalVersion: number };
  idempotencyKey: string;
}

export interface WriteOffSandboxObligationRequest extends TenantProtocolRequestBase {
  operationId: "pilotWriteOffSandboxObligation";
  payload: { expectedServicingStateHash: string };
  resource: { resourceType: "obligation"; resourceId: string };
  reasonCode: "sandbox_uncollectible_writeoff";
  approvalArtifact: { proposalId: string; proposalVersion: number };
  idempotencyKey: string;
}

export interface ReadHumanSelfRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadHumanSelf";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
}

export interface ReadWorkspaceResumeRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadWorkspaceResume";
  payload: Record<string, never>;
}

export interface ReadConsentRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadConsent";
  payload: Record<string, never>;
  resource: { resourceType: "consent"; resourceId: string };
}

export interface ReadHumanIdentityReferenceRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadIdentityReference";
  payload: Record<string, never>;
  resource: { resourceType: "human_identity_reference"; resourceId: string };
}

export interface FreezeSubjectRequest extends TenantProtocolRequestBase {
  operationId: "pilotFreezeSubject";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
  reasonCode: ProtectiveReasonCode;
  idempotencyKey: string;
}

export interface ReadMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadMandate";
  payload: Record<string, never>;
  resource: { resourceType: "mandate"; resourceId: string };
}

export interface ReadTenantRiskRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadTenantRisk";
  payload: Record<string, never>;
  resource: { resourceType: "risk_portfolio"; resourceId: string };
}

export interface ReadPilotHealthRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadPilotHealth";
  payload: Record<string, never>;
  resource: { resourceType: "risk_portfolio"; resourceId: string };
}

export type PilotFeedbackSurface =
  | "human_portfolio" | "human_application" | "human_offer" | "human_payments"
  | "agent_protocol" | "agent_sdk" | "agent_mcp" | "evidence" | "servicing";
export type PilotFeedbackLifecycleStage =
  | "onboarding" | "application" | "offer" | "obligation" | "execution"
  | "repayment" | "servicing" | "evidence";
export type PilotFeedbackSentiment = "blocked" | "difficult" | "neutral" | "easy" | "valuable";
export type PilotFeedbackOutcome = "incomplete" | "completed" | "needs_support";
export type PilotFeedbackBlockerCode =
  | "none" | "unclear_copy" | "missing_capability" | "authentication"
  | "authority_setup" | "identity_proof" | "credit_terms" | "execution"
  | "repayment" | "servicing" | "evidence" | "integration" | "other_no_text";

export interface PilotFeedbackPayload {
  surface: PilotFeedbackSurface;
  lifecycleStage: PilotFeedbackLifecycleStage;
  sentiment: PilotFeedbackSentiment;
  outcome: PilotFeedbackOutcome;
  blockerCode: PilotFeedbackBlockerCode;
  schemaVersion: "pilot_feedback_record.v1";
}

export interface SubmitPilotFeedbackRequest extends TenantProtocolRequestBase {
  operationId: "pilotSubmitPilotFeedback";
  payload: PilotFeedbackPayload;
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadPilotFeedbackSummaryRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadPilotFeedbackSummary";
  payload: Record<string, never>;
  resource: { resourceType: "risk_portfolio"; resourceId: string };
}

export type ServicingQueueClassification =
  | "defaulted"
  | "dpd_61_89"
  | "dpd_31_60"
  | "dpd_1_30"
  | "grace_period";

export interface ReadServicingQueueRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadServicingQueue";
  payload: {
    classifications?: ServicingQueueClassification[];
    limit?: number;
    cursor?: string;
  };
  resource: { resourceType: "servicing_queue"; resourceId: string };
}

export interface ReadObligationEvidenceRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadEvidence";
  payload: { limit?: number; cursor?: string };
  resource: { resourceType: "evidence"; resourceId: string };
  purpose?: string;
}

export interface ReadOwnObligationEvidenceRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadOwnObligationEvidence";
  payload: { limit?: number; cursor?: string };
  resource: { resourceType: "evidence"; resourceId: string };
}

export interface ReadOwnObligationRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadOwnObligation";
  payload: Record<string, never>;
  resource: { resourceType: "obligation"; resourceId: string };
}

export interface RevokeDraftMandateRequest extends TenantProtocolRequestBase {
  operationId: "pilotRevokeDraftMandate";
  payload: Record<string, never>;
  resource: { resourceType: "mandate"; resourceId: string };
  reasonCode: "credential_compromise" | "operator_request" | "security_incident";
  idempotencyKey: string;
}

export interface RevokeConsentRequest extends TenantProtocolRequestBase {
  operationId: "pilotRevokeConsent";
  payload: Record<string, never>;
  resource: { resourceType: "consent"; resourceId: string };
  reasonCode: "human_withdrawal";
  idempotencyKey: string;
}

export interface ReadProviderIntentRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadProviderIntent";
  payload: Record<string, never>;
  resource: { resourceType: "transfer_intent"; resourceId: string };
  purpose: "provider_intent_delivery";
}

export interface AcknowledgeProviderIntentRequest extends TenantProtocolRequestBase {
  operationId: "pilotAcknowledgeProviderIntent";
  payload: { deliveryHash: string };
  resource: { resourceType: "transfer_intent"; resourceId: string };
  purpose: "provider_intent_delivery";
  idempotencyKey: string;
}

export interface ProviderSandboxCallbackPayload {
  callbackId: string;
  transferIntentId: string;
  providerId: string;
  deliveryHash: string;
  outcome: "accepted" | "rejected";
  reasonCode: "provider_accepted" | "provider_policy_rejected";
  providerEventRefHash: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  keyId: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "provider_sandbox_callback.v1";
  payloadHash: string;
  signature: string;
}

export interface ProcessProviderInboxRequest extends TenantProtocolRequestBase {
  operationId: "workerProcessInbox";
  payload: ProviderSandboxCallbackPayload;
  resource: { resourceType: "inbox_message"; resourceId: string };
  idempotencyKey: string;
}

export type TenantProtocolRequest =
  | AcceptCreditOfferRequest
  | AcknowledgeProviderIntentRequest
  | ActivateSandboxMandateRequest
  | CreateAgentAccountChallengeRequest
  | CreateAgentSubjectRequest
  | CreateConsentRequest
  | CreateHumanSubjectRequest
  | CreateDraftMandateRequest
  | EvaluateCreditApplicationRequest
  | ExecuteSandboxObligationRequest
  | FreezeSubjectRequest
  | PostSandboxRepaymentRequest
  | AdvanceSandboxServicingRequest
  | RestructureSandboxObligationRequest
  | RepurchaseSandboxObligationRequest
  | WriteOffSandboxObligationRequest
  | RequestCreditIntentRequest
  | ReadAgentSelfRequest
  | ReadAgentAccountBindingRequest
  | ReadCreditApplicationRequest
  | ReadConsentRequest
  | ReadHumanSelfRequest
  | ReadWorkspaceResumeRequest
  | ReadHumanIdentityReferenceRequest
  | ReadMandateRequest
  | ReadTenantRiskRequest
  | ReadPilotHealthRequest
  | ReadPilotFeedbackSummaryRequest
  | ReadServicingQueueRequest
  | ReadObligationEvidenceRequest
  | ReadOwnObligationRequest
  | ReadOwnObligationEvidenceRequest
  | ReadProviderIntentRequest
  | RevokeConsentRequest
  | RevokeDraftMandateRequest
  | SubmitAgentAccountProofRequest
  | SubmitPilotFeedbackRequest
  | ProcessProviderInboxRequest;

export interface AgentAccountBindingSummary {
  accountBindingId: string;
  accountHash: string;
  chainId: "eip155:84532" | "eip155:1952";
  purpose: AgentAccountPurpose;
  proofHash: string;
  verificationMethod: "eip712_eoa_v1";
  status: "active";
  boundAt: string;
  protocolVersion: "1.1";
}

export interface AgentAccountChallengeCreatedResponse {
  challengeId: string;
  subjectId: string;
  chainId: "eip155:84532" | "eip155:1952";
  accountHash: string;
  purpose: AgentAccountPurpose;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  protocolVersion: "1.1";
  typedDataHash: string;
  typedData: Record<string, unknown>;
  oneUse: true;
  schemaVersion: "tenant_agent_account_challenge_created.v1";
}

export interface AgentAccountProofVerifiedResponse {
  subjectId: string;
  subjectHash: string;
  status: "active";
  accountBinding: AgentAccountBindingSummary;
  challengeConsumed: true;
  productionAuthority: false;
  schemaVersion: "tenant_agent_account_proof_verified.v1";
}

export interface AgentAccountBindingViewResponse {
  subjectId: string;
  subjectHash: string;
  subjectStatus: SubjectStatus;
  accountBinding: AgentAccountBindingSummary | null;
  schemaVersion: "tenant_agent_account_binding_view.v1";
}

export interface AgentSubjectCreatedResponse {
  principalId: string;
  subjectId: string;
  subjectHash: string;
  subjectType: "agent";
  status: SubjectStatus;
  schemaVersion: "tenant_agent_subject_created.v1";
}

export interface HumanSubjectCreatedResponse {
  principalId: string;
  subjectId: string;
  subjectHash: string;
  subjectType: "human";
  status: SubjectStatus;
  prototypeOnly: true;
  schemaVersion: "tenant_human_subject_created.v1";
}

export interface DraftMandateCreatedResponse {
  mandateId: string;
  mandateHash: string;
  subjectId: string;
  status: "draft";
  capabilities: MandateCapability[];
  assetIds: string[];
  perActionLimitMinor: string;
  aggregateLimitMinor: string;
  validFrom: string;
  expiresAt: string;
  schemaVersion: "tenant_draft_mandate_created.v1";
}

export interface AgentSubjectFrozenResponse {
  subjectId: string;
  subjectHash: string;
  previousStatus: "pending" | "active";
  status: "suspended";
  reasonCode: ProtectiveReasonCode;
  updatedAt: string;
  schemaVersion: "tenant_agent_subject_frozen.v1";
}

export interface AgentSubjectView {
  subjectId: string;
  subjectHash: string;
  subjectType: "agent";
  displayName: string;
  primaryPrincipalId: string;
  status: SubjectStatus;
  riskTier: "unrated" | "tier_1" | "tier_2" | "tier_3" | "tier_4";
  metadataRef?: string;
  prototypeOnly: boolean;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "subject.v1";
}

export interface MandateSummary {
  mandateId: string;
  mandateHash: string;
  status: MandateStatus;
  capabilities: MandateCapability[];
  assetIds: string[];
  providerScopeCount: number;
  categoryScopeCount: number;
  perActionLimitMinor: string;
  aggregateLimitMinor: string;
  utilizedMinor: string;
  validFrom: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSubjectViewResponse {
  subject: AgentSubjectView;
  mandates: MandateSummary[];
  hasMoreMandates: boolean;
  schemaVersion: "tenant_agent_subject_view.v2";
}

export interface CreditIntentSummary {
  creditIntentId: string;
  creditIntentHash: string;
  subjectId: string;
  authorityType: "consent" | "mandate";
  authorityId: string;
  assetId: string;
  requestedPrincipalMinor: string;
  purposeCode: string;
  requestedTermDays: number;
  repaymentFrequency: RepaymentFrequency;
  installmentCount: number;
  sandboxOnly: true;
  productionFundsRequested: false;
  status: "submitted" | "decided" | "withdrawn" | "expired";
  createdAt: string;
  updatedAt: string;
}

export interface CreditIntentCreatedResponse {
  creditIntent: CreditIntentSummary;
  schemaVersion: "tenant_credit_intent_created.v1";
}

export interface CreditApplicationViewResponse {
  creditIntent: CreditIntentSummary;
  decision: CreditDecisionSummary | null;
  offer: CreditOfferSummary | null;
  schemaVersion: "tenant_credit_application_view.v1";
}

export interface CreditDecisionPassportSourceEvidence {
  role: "credit_intent" | "subject" | "principal" | "authority" | "human_identity_reference";
  evidenceHash: string;
  entityHash: string;
  aggregateVersion: number;
  sourceFinality: "finalized";
}

export interface CreditDecisionReasonLineage {
  reasonCode: string;
  featureKeys: string[];
  sourceRoles: string[];
}

export interface CreditDecisionPassportSummary {
  riskDecisionPassportId: string;
  decisionPassportHash: string;
  riskFeatureSnapshotId: string;
  featureSnapshotHash: string;
  featureSetVersion: "credit-application-evidence-features.v1";
  policyVersion: "credit-application-rules.v1";
  policyHash: string;
  riskStateHash: string;
  sourceEvidence: CreditDecisionPassportSourceEvidence[];
  reasonLineage: CreditDecisionReasonLineage[];
  asOf: string;
  nonAuthorizing: true;
  sandboxOnly: true;
  productionAuthority: false;
  schemaVersion: "risk_decision_passport.v1";
}

export interface CreditDecisionSummary {
  riskDecisionId: string;
  decisionHash: string;
  creditIntentId: string;
  subjectId: string;
  authorityType: "consent" | "mandate";
  authorityId: string;
  assetId: string;
  status: "approved" | "rejected" | "frozen";
  policyVersion: "credit-application-rules.v1";
  approvedPrincipalMinor: string;
  reasonCodes: string[];
  decisionPassport?: CreditDecisionPassportSummary;
  sandboxOnly: true;
  productionAuthority: false;
  decidedAt: string;
}

export interface CreditOfferSummary {
  creditOfferId: string;
  creditOfferHash: string;
  termsHash: string;
  creditIntentId: string;
  riskDecisionId: string;
  subjectId: string;
  assetId: string;
  approvedPrincipalMinor: string;
  annualRateBps: number;
  originationFeeMinor: string;
  repaymentFrequency: RepaymentFrequency;
  installmentCount: number;
  firstPaymentAt: string;
  maturityAt: string;
  disclosureRef: string;
  termsVersion: "credit_terms.v1";
  validUntil: string;
  reasonCodes: string[];
  sandboxOnly: true;
  productionFundsApproved: false;
  status: "offered" | "accepted" | "declined" | "expired" | "superseded";
  createdAt: string;
  updatedAt: string;
}

export interface CreditApplicationEvaluatedResponse {
  creditIntent: CreditIntentSummary;
  decision: CreditDecisionSummary & { decisionPassport: CreditDecisionPassportSummary };
  offer: CreditOfferSummary | null;
  schemaVersion: "tenant_credit_application_evaluated.v2";
}

export interface CreditOfferAcceptanceSummary {
  creditOfferAcceptanceId: string;
  acceptanceHash: string;
  creditOfferId: string;
  creditOfferHash: string;
  termsHash: string;
  creditIntentId: string;
  riskDecisionId: string;
  subjectId: string;
  principalId: string;
  authorityType: "consent" | "mandate";
  authorityId: string;
  acknowledgementHash: string;
  acceptedAt: string;
  sandboxOnly: true;
  productionAuthority: false;
}

export interface ObligationInstallmentSummary {
  installmentId: string;
  obligationId: string;
  installmentNumber: number;
  dueAt: string;
  scheduledPrincipalMinor: string;
  scheduledInterestMinor: string;
  scheduledFeeMinor: string;
  paidPrincipalMinor: string;
  paidInterestMinor: string;
  paidFeeMinor: string;
  status: "scheduled" | "partial" | "paid";
  scheduleVersion: "obligation_schedule.v1";
  scheduleSequence: number;
  schemaVersion: "obligation_installment.v1";
}

export interface SharedObligationSummary {
  obligationId: string;
  obligationHash: string;
  subjectId: string;
  principalId: string;
  creditIntentId: string;
  riskDecisionId: string;
  creditOfferId: string;
  creditOfferAcceptanceId: string;
  authorityType: "consent" | "mandate";
  authorityId: string;
  assetId: string;
  originalPrincipalMinor: string;
  outstandingPrincipalMinor: string;
  annualRateBps: number;
  originationFeeMinor: string;
  accruedInterestMinor: string;
  outstandingInterestMinor: string;
  accruedFeesMinor: string;
  outstandingFeesMinor: string;
  totalRepaidMinor: string;
  repaymentFrequency: RepaymentFrequency;
  installmentCount: number;
  firstPaymentAt: string;
  maturityAt: string;
  scheduleVersion: "obligation_schedule.v1";
  scheduleHash: string;
  scheduleSequence: number;
  installments: ObligationInstallmentSummary[];
  executionStatus: "pending" | "executed";
  sandboxExecutionReceiptId?: string;
  executedAt?: string;
  lastAccruedAt?: string;
  interestAccrualRemainder?: string;
  withdrawable?: false;
  sandboxOnly: true;
  productionFundsMoved: false;
  status:
    | "created"
    | "active"
    | "partially_repaid"
    | "fully_repaid"
    | "delinquent"
    | "defaulted"
    | "restructured"
    | "repurchased"
    | "written_off";
  servicingClassification:
    | "current"
    | "grace_period"
    | "dpd_1_30"
    | "dpd_31_60"
    | "dpd_61_89"
    | "defaulted"
    | "cured"
    | "restructured"
    | "repurchased"
    | "written_off";
  daysPastDue: number;
  oldestUnpaidInstallmentId: string | null;
  servicingEffectiveAt: string;
  servicingReasonCode: string;
  servicingPolicyVersion: "sandbox-servicing-policy.v1";
  servicingOwnerCode: "sandbox_platform" | "sandbox_originator";
  resolutionType?: "restructure" | "repurchase" | "write_off";
  resolutionReasonCode?: string;
  resolutionAt?: string;
  writtenOffPrincipalMinor: string;
  writtenOffInterestMinor: string;
  writtenOffFeesMinor: string;
  acceptedAt: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "obligation.v2";
}

export interface CreditOfferAcceptedResponse {
  acceptance: CreditOfferAcceptanceSummary;
  obligation: SharedObligationSummary;
  offerStatus: "accepted";
  executionCreated: false;
  fundsAuthority: false;
  schemaVersion: "tenant_credit_offer_accepted.v1";
}

export interface SandboxExecutionReceiptSummary {
  sandboxExecutionReceiptId: string;
  receiptHash: string;
  obligationId: string;
  assetId: string;
  amountMinor: string;
  adapterId: string;
  adapterVersion: string;
  adapterKeyId: string;
  adapterMessageHash: string;
  executedAt: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "sandbox_execution_receipt.v1";
}

export interface SandboxObligationExecutedResponse {
  obligation: SharedObligationSummary;
  executionReceipt: SandboxExecutionReceiptSummary;
  principalLedgerTransactionId: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "tenant_sandbox_obligation_executed.v1";
}

export interface SandboxRepaymentSummary {
  repaymentId: string;
  repaymentHash: string;
  obligationId: string;
  subjectId: string;
  assetId: string;
  requestedMinor: string;
  appliedMinor: string;
  appliedFeeMinor: string;
  appliedInterestMinor: string;
  appliedPrincipalMinor: string;
  surplusMinor: string;
  remainingPrincipalMinor: string;
  remainingInterestMinor: string;
  remainingFeesMinor: string;
  sourceCode: SandboxRepaymentSource;
  actorHash: string;
  accruedInterestMinor: string;
  accrualDays: number;
  ledgerTransactionId: string;
  interestLedgerTransactionId?: string;
  occurredAt: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  schemaVersion: "repayment.v2";
}

export interface SandboxRepaymentPostedResponse {
  obligation: SharedObligationSummary;
  repayment: SandboxRepaymentSummary;
  servicingAction?: SandboxServicingActionSummary;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "tenant_sandbox_repayment_posted.v1";
}

export interface SandboxServicingBalances {
  outstandingPrincipalMinor: string;
  outstandingInterestMinor: string;
  outstandingFeesMinor: string;
  totalRepaidMinor: string;
}

export interface SandboxServicingActionSummary {
  servicingActionId: string;
  servicingActionHash: string;
  obligationId: string;
  subjectId: string;
  actionType: "advance" | "cure" | "restructure" | "repurchase" | "write_off";
  previousStatus: string;
  nextStatus: string;
  previousClassification: string;
  nextClassification: string;
  daysPastDue: number;
  oldestUnpaidInstallmentId: string | null;
  reasonCode: string;
  source: "system_worker" | "repayment" | "dual_control";
  policyVersion: "sandbox-servicing-policy.v1";
  scheduleSequenceBefore: number;
  scheduleSequenceAfter: number;
  balancesBefore: SandboxServicingBalances;
  balancesAfter: SandboxServicingBalances;
  approvalProposalId?: string;
  approvalExecutionId?: string;
  effectiveAt: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  schemaVersion: "sandbox_servicing_action.v1";
}

export interface SandboxServicingResultResponse {
  obligation: SharedObligationSummary;
  servicingStateHash: string;
  servicingAction?: SandboxServicingActionSummary;
  writeOffLedgerTransactionId?: string;
  approvalExecutionId?: string;
  approvalExecutionHash?: string;
  changed?: boolean;
  sandboxOnly: true;
  productionFundsMoved: false;
  schemaVersion:
    | "tenant_sandbox_obligation_restructured.v1"
    | "tenant_sandbox_obligation_repurchased.v1"
    | "tenant_sandbox_obligation_written_off.v1"
    | "tenant_sandbox_servicing_advanced.v1";
}

export interface HumanSubjectView {
  subjectId: string;
  subjectHash: string;
  subjectType: "human";
  displayName: "Human Credit Profile";
  primaryPrincipalId: string;
  status: SubjectStatus;
  riskTier: "unrated" | "tier_1" | "tier_2" | "tier_3" | "tier_4";
  metadataRef?: string;
  prototypeOnly: true;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "subject.v1";
}

export interface HumanConsentSummary {
  consentId: string;
  consentHash: string;
  termsHash: string;
  dataUsageHash: string;
  status: "active" | "revoked" | "expired";
  purposes: string[];
  allowedAssetIds: string[];
  allowedCreditPurposeCodes: string[];
  allowedRepaymentFrequencies: Array<"weekly" | "biweekly" | "monthly" | "end_of_term">;
  maxRequestedPrincipalMinor: string;
  maxRequestedTermDays: number;
  maxInstallmentCount: number;
  validFrom: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface HumanIdentityReferenceSummary {
  identityReferenceId: string;
  identityReferenceHash: string;
  referenceEvidenceHash: string;
  consentId: string;
  consentHash: string;
  referenceType: "kyc_reference" | "verifiable_credential_reference";
  providerVersion: string;
  assuranceLevel: "synthetic_self_asserted" | "synthetic_provider_asserted";
  purposeCodes: string[];
  validFrom: string;
  expiresAt: string;
  syntheticOnly: true;
  productionVerified: false;
  status: "active" | "revoked" | "expired";
  createdAt: string;
  updatedAt: string;
}

export interface HumanSubjectViewResponse {
  subject: HumanSubjectView;
  consents: HumanConsentSummary[];
  identityReferences: HumanIdentityReferenceSummary[];
  hasMoreConsents: boolean;
  hasMoreIdentityReferences: boolean;
  schemaVersion: "tenant_human_subject_view.v1";
}

export interface WorkspaceResumeResource {
  resourceType: "subject" | "consent" | "credit_intent" | "mandate" | "obligation";
  resourceId: string;
  relationship: "owner" | "controller" | "subject";
}

export interface WorkspaceResumeViewResponse {
  workspaceKind: "human_borrower" | "principal_controller";
  resources: WorkspaceResumeResource[];
  hasMore: boolean;
  serverTruth: true;
  schemaVersion: "tenant_workspace_resume_view.v1";
}

export interface HumanConsentCreatedResponse {
  subjectId: string;
  consent: HumanConsentSummary;
  schemaVersion: "tenant_consent_created.v1";
}

export interface HumanConsentViewResponse {
  consent: HumanConsentSummary;
  schemaVersion: "tenant_consent_view.v1";
}

export interface HumanConsentRevokedResponse {
  consent: HumanConsentSummary;
  reasonCode: "human_withdrawal";
  schemaVersion: "tenant_consent_revoked.v1";
}

export interface HumanIdentityReferenceViewResponse {
  identityReference: HumanIdentityReferenceSummary;
  schemaVersion: "tenant_human_identity_reference_view.v1";
}

export interface MandateView {
  mandateId: string;
  mandateHash: string;
  termsHash: string;
  principalId: string;
  subjectId: string;
  capabilities: MandateCapability[];
  allowedProviderIds: string[];
  allowedCategories: string[];
  assetIds: string[];
  perActionLimitMinor: string;
  aggregateLimitMinor: string;
  utilizedMinor: string;
  validFrom: string;
  expiresAt: string;
  nonce: string;
  termsRef: string;
  sandboxOnly: true;
  productionAuthority: false;
  activationAcknowledgement?: {
    expectedMandateHash: string;
    acknowledgedTermsHash: string;
    acknowledgementCode: "principal_authorizes_sandbox_credit_v1";
    activatedByActorId: string;
    activatedAt: string;
    evidenceHash: string;
  };
  status: MandateStatus;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "mandate.v3";
}

export interface SandboxMandateActivatedResponse {
  mandate: MandateView;
  activationEvidenceHash: string;
  schemaVersion: "tenant_sandbox_mandate_activated.v1";
}

export interface MandateViewResponse {
  mandate: MandateView;
  schemaVersion: "tenant_mandate_view.v1";
}

export interface TenantRiskSubjectSummary {
  totalCount: number;
  pendingCount: number;
  activeCount: number;
  suspendedCount: number;
  closedCount: number;
}

export interface TenantRiskCreditLineSummary {
  totalCount: number;
  requestedCount: number;
  approvedCount: number;
  rejectedCount: number;
  frozenCount: number;
  closedCount: number;
  limitMinor: string;
  utilizedMinor: string;
}

export interface TenantRiskObligationSummary {
  totalCount: number;
  openCount: number;
  createdCount: number;
  activeCount: number;
  partiallyRepaidCount: number;
  fullyRepaidCount: number;
  overdueCount: number;
  defaultedCount: number;
  delinquentCount: number;
  restructuredCount: number;
  repurchasedCount: number;
  writtenOffCount: number;
  closedCount: number;
  principalMinor: string;
  outstandingPrincipalMinor: string;
  accruedFeesMinor: string;
  repaidAmountMinor: string;
  writtenOffPrincipalMinor: string;
  writtenOffInterestMinor: string;
  writtenOffFeesMinor: string;
}

export interface TenantRiskAssetExposure {
  assetId: string;
  creditLineCount: number;
  approvedCreditLineCount: number;
  frozenCreditLineCount: number;
  limitMinor: string;
  utilizedMinor: string;
  obligationCount: number;
  openObligationCount: number;
  overdueObligationCount: number;
  defaultedObligationCount: number;
  delinquentObligationCount: number;
  restructuredObligationCount: number;
  repurchasedObligationCount: number;
  writtenOffObligationCount: number;
  outstandingPrincipalMinor: string;
  writtenOffPrincipalMinor: string;
}

export interface TenantRiskPortfolioViewResponse {
  portfolioId: string;
  asOf: string;
  subjects: TenantRiskSubjectSummary;
  creditLines: TenantRiskCreditLineSummary;
  obligations: TenantRiskObligationSummary;
  assetExposures: TenantRiskAssetExposure[];
  hasMoreAssetExposures: boolean;
  schemaVersion: "tenant_risk_portfolio_view.v1";
}

export interface TenantPilotHealthViewResponse {
  portfolioId: string;
  asOf: string;
  entryModes: {
    humanIntentCount: number;
    agentIntentCount: number;
    dualNativeObserved: boolean;
  };
  funnel: {
    intentCount: number;
    offeredIntentCount: number;
    acceptedIntentCount: number;
    executedIntentCount: number;
    repaidIntentCount: number;
    fullyRepaidIntentCount: number;
  };
  conversionBps: {
    offer: number;
    acceptance: number;
    execution: number;
    repayment: number;
    fullRepayment: number;
  };
  positions: {
    obligationCount: number;
    openPositionCount: number;
    adversePositionCount: number;
  };
  readiness: {
    stage: "empty" | "application" | "obligation" | "execution" | "repayment" | "verified";
    dualNativeObserved: boolean;
    fullLifecycleObserved: boolean;
  };
  safety: {
    readOnly: true;
    piiIncluded: false;
    thirdPartyAnalytics: false;
    sandboxOnly: true;
    productionFundsMoved: false;
  };
  schemaVersion: "tenant_pilot_health_view.v1";
}

export interface PilotFeedbackRecordedResponse {
  entryMode: "human" | "agent";
  surface: PilotFeedbackSurface;
  lifecycleStage: PilotFeedbackLifecycleStage;
  sentiment: PilotFeedbackSentiment;
  outcome: PilotFeedbackOutcome;
  blockerCode: PilotFeedbackBlockerCode;
  recordedAt: string;
  safety: {
    categoricalOnly: true;
    piiIncluded: false;
    thirdPartyAnalytics: false;
    sandboxOnly: true;
    productionAuthority: false;
  };
  schemaVersion: "tenant_pilot_feedback_recorded.v1";
}

export interface TenantPilotFeedbackSummaryViewResponse {
  asOf: string;
  totalCount: number;
  entryModes: { humanCount: number; agentCount: number };
  surfaces: {
    humanPortfolioCount: number;
    humanApplicationCount: number;
    humanOfferCount: number;
    humanPaymentsCount: number;
    agentProtocolCount: number;
    agentSdkCount: number;
    agentMcpCount: number;
    evidenceCount: number;
    servicingCount: number;
  };
  lifecycleStages: {
    onboardingCount: number;
    applicationCount: number;
    offerCount: number;
    obligationCount: number;
    executionCount: number;
    repaymentCount: number;
    servicingCount: number;
    evidenceCount: number;
  };
  sentiments: {
    blockedCount: number;
    difficultCount: number;
    neutralCount: number;
    easyCount: number;
    valuableCount: number;
  };
  outcomes: { incompleteCount: number; completedCount: number; needsSupportCount: number };
  blockerCodes: {
    noneCount: number;
    unclearCopyCount: number;
    missingCapabilityCount: number;
    authenticationCount: number;
    authoritySetupCount: number;
    identityProofCount: number;
    creditTermsCount: number;
    executionCount: number;
    repaymentCount: number;
    servicingCount: number;
    evidenceCount: number;
    integrationCount: number;
    otherNoTextCount: number;
  };
  safety: {
    aggregateOnly: true;
    piiIncluded: false;
    identifiersIncluded: false;
    thirdPartyAnalytics: false;
    sandboxOnly: true;
    productionFundsMoved: false;
  };
  schemaVersion: "tenant_pilot_feedback_summary_view.v1";
}

export interface ServicingQueueActionSummary {
  servicingActionId: string;
  actionType: "advance" | "cure" | "restructure" | "repurchase" | "write_off";
  nextStatus: string;
  nextClassification: string;
  daysPastDue: number;
  reasonCode: string;
  source: "system_worker" | "repayment" | "dual_control";
  effectiveAt: string;
  schemaVersion: "servicing_queue_action_summary.v1";
}

export interface ServicingQueueCase {
  obligationId: string;
  subjectId: string;
  assetId: string;
  status: "delinquent" | "defaulted";
  servicingClassification: ServicingQueueClassification;
  daysPastDue: number;
  priority: "critical" | "high" | "elevated" | "watch" | "monitor";
  reviewCode:
    | "default_resolution_review"
    | "pre_default_review"
    | "late_stage_review"
    | "early_delinquency_review"
    | "grace_monitor";
  outstandingPrincipalMinor: string;
  outstandingInterestMinor: string;
  outstandingFeesMinor: string;
  outstandingTotalMinor: string;
  pastDuePrincipalMinor: string;
  pastDueInterestMinor: string;
  pastDueFeesMinor: string;
  pastDueTotalMinor: string;
  oldestUnpaidInstallmentId: string;
  oldestDueAt: string;
  servicingEffectiveAt: string;
  scheduleSequence: number;
  servicingOwnerCode: "sandbox_platform" | "sandbox_originator";
  latestServicingAction?: ServicingQueueActionSummary;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "servicing_queue_case.v1";
}

export interface TenantServicingQueueViewResponse {
  queueId: string;
  asOf: string;
  filters: { classifications: ServicingQueueClassification[] };
  cases: ServicingQueueCase[];
  page: { limit: number; hasMore: boolean; nextCursor?: string };
  safety: {
    readOnly: true;
    piiIncluded: false;
    dispositionAuthority: false;
    sandboxOnly: true;
    productionFundsMoved: false;
    withdrawable: false;
  };
  schemaVersion: "tenant_servicing_queue_view.v1";
}

export interface ObligationEvidenceSummary {
  evidenceId: string;
  evidenceHash: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  obligationId: string;
  sourceFinality: "pending" | "confirmed" | "finalized" | "reorged" | "invalidated";
  payloadHash: string;
  occurredAt: string;
  recordedAt: string;
  schemaVersion: "obligation_evidence_summary.v1";
}

export interface ObligationEvidenceViewResponse {
  obligationId: string;
  asOf: string;
  items: ObligationEvidenceSummary[];
  hasMore: boolean;
  nextCursor?: string;
  schemaVersion: "tenant_obligation_evidence_view.v1";
}

export interface OwnedObligationEvidenceViewResponse {
  obligationId: string;
  asOf: string;
  items: ObligationEvidenceSummary[];
  hasMore: boolean;
  nextCursor?: string;
  schemaVersion: "tenant_owned_obligation_evidence_view.v1";
}

export interface OwnedObligationViewResponse {
  obligation: SharedObligationSummary;
  latestServicingAction?: SandboxServicingActionSummary;
  asOf: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "tenant_owned_obligation_view.v1";
}

export interface DraftMandateRevokedResponse {
  mandateId: string;
  mandateHash: string;
  subjectId: string;
  status: "revoked";
  reasonCode: "credential_compromise" | "operator_request" | "security_incident";
  updatedAt: string;
  schemaVersion: "tenant_draft_mandate_revoked.v1";
}

export interface ProviderIntentViewResponse {
  deliveryId: string;
  deliveryHash: string;
  transferIntentId: string;
  transferIntentHash: string;
  providerId: string;
  purposeCode: string;
  sourceAssetId: string;
  sourceAmountMinor: string;
  destinationAssetId: string;
  status: "pending" | "acknowledged" | "callback_completed";
  issuedAt: string;
  expiresAt: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "provider_intent_view.v1";
}

export interface ProviderIntentAcknowledgementResponse {
  acknowledgementId: string;
  deliveryId: string;
  deliveryHash: string;
  transferIntentId: string;
  providerId: string;
  acknowledgedAt: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "provider_intent_acknowledgement.v1";
}

export interface ProviderSandboxCallbackResultResponse {
  callbackId: string;
  transferIntentId: string;
  providerId: string;
  deliveryHash: string;
  payloadHash: string;
  nonceHash: string;
  keyId: string;
  outcome: "accepted" | "rejected";
  reasonCode: "provider_accepted" | "provider_policy_rejected";
  providerEventRefHash: string;
  processedAt: string;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "provider_sandbox_callback_result.v1";
}

export interface TenantProtocolResultBase<
  OperationId extends TenantProtocolOperationId,
  Response
> {
  operationId: OperationId;
  replayed: boolean;
  response: Response;
  schemaVersion: TenantProtocolResultSchemaVersion;
}

export type TenantProtocolResult =
  | TenantProtocolResultBase<"pilotAcceptCreditOffer", CreditOfferAcceptedResponse>
  | TenantProtocolResultBase<"pilotAcknowledgeProviderIntent", ProviderIntentAcknowledgementResponse>
  | TenantProtocolResultBase<"pilotExecuteSandboxObligation", SandboxObligationExecutedResponse>
  | TenantProtocolResultBase<"pilotPostSandboxRepayment", SandboxRepaymentPostedResponse>
  | TenantProtocolResultBase<"pilotRestructureSandboxObligation", SandboxServicingResultResponse>
  | TenantProtocolResultBase<"pilotRepurchaseSandboxObligation", SandboxServicingResultResponse>
  | TenantProtocolResultBase<"pilotWriteOffSandboxObligation", SandboxServicingResultResponse>
  | TenantProtocolResultBase<"workerAdvanceSandboxServicing", SandboxServicingResultResponse>
  | TenantProtocolResultBase<"pilotActivateSandboxMandate", SandboxMandateActivatedResponse>
  | TenantProtocolResultBase<"pilotCreateAgentAccountChallenge", AgentAccountChallengeCreatedResponse>
  | TenantProtocolResultBase<"pilotCreateAgentSubject", AgentSubjectCreatedResponse>
  | TenantProtocolResultBase<"pilotCreateConsent", HumanConsentCreatedResponse>
  | TenantProtocolResultBase<"pilotCreateHumanSubject", HumanSubjectCreatedResponse>
  | TenantProtocolResultBase<"pilotCreateDraftMandate", DraftMandateCreatedResponse>
  | TenantProtocolResultBase<"pilotEvaluateCreditApplication", CreditApplicationEvaluatedResponse>
  | TenantProtocolResultBase<"pilotFreezeSubject", AgentSubjectFrozenResponse>
  | TenantProtocolResultBase<"pilotRequestCredit", CreditIntentCreatedResponse>
  | TenantProtocolResultBase<"pilotReadAgentSelf", AgentSubjectViewResponse>
  | TenantProtocolResultBase<"pilotReadAgentAccountBinding", AgentAccountBindingViewResponse>
  | TenantProtocolResultBase<"pilotReadCreditApplication", CreditApplicationViewResponse>
  | TenantProtocolResultBase<"pilotReadConsent", HumanConsentViewResponse>
  | TenantProtocolResultBase<"pilotReadHumanSelf", HumanSubjectViewResponse>
  | TenantProtocolResultBase<"pilotReadWorkspaceResume", WorkspaceResumeViewResponse>
  | TenantProtocolResultBase<"pilotReadIdentityReference", HumanIdentityReferenceViewResponse>
  | TenantProtocolResultBase<"pilotReadMandate", MandateViewResponse>
  | TenantProtocolResultBase<"pilotReadTenantRisk", TenantRiskPortfolioViewResponse>
  | TenantProtocolResultBase<"pilotReadPilotHealth", TenantPilotHealthViewResponse>
  | TenantProtocolResultBase<"pilotReadPilotFeedbackSummary", TenantPilotFeedbackSummaryViewResponse>
  | TenantProtocolResultBase<"pilotReadServicingQueue", TenantServicingQueueViewResponse>
  | TenantProtocolResultBase<"pilotReadEvidence", ObligationEvidenceViewResponse>
  | TenantProtocolResultBase<"pilotReadOwnObligation", OwnedObligationViewResponse>
  | TenantProtocolResultBase<"pilotReadOwnObligationEvidence", OwnedObligationEvidenceViewResponse>
  | TenantProtocolResultBase<"pilotReadProviderIntent", ProviderIntentViewResponse>
  | TenantProtocolResultBase<"pilotRevokeConsent", HumanConsentRevokedResponse>
  | TenantProtocolResultBase<"pilotRevokeDraftMandate", DraftMandateRevokedResponse>
  | TenantProtocolResultBase<"pilotSubmitAgentAccountProof", AgentAccountProofVerifiedResponse>
  | TenantProtocolResultBase<"pilotSubmitPilotFeedback", PilotFeedbackRecordedResponse>
  | TenantProtocolResultBase<"workerProcessInbox", ProviderSandboxCallbackResultResponse>;

export type TenantProtocolResultFor<OperationId extends TenantProtocolOperationId> = Extract<
  TenantProtocolResult,
  { operationId: OperationId }
>;

export type TenantProtocolActorType =
  | "human"
  | "agent"
  | "provider"
  | "risk_operator"
  | "operations_operator"
  | "auditor"
  | "system_worker";

export interface TenantProtocolOperationBase<
  OperationId extends TenantProtocolOperationId,
  Kind extends "command" | "query",
  ActorTypes extends readonly TenantProtocolActorType[],
  ResourceType extends "subject" | "consent" | "credit_intent" | "credit_offer" | "evidence" | "human_identity_reference" | "inbox_message" | "mandate" | "obligation" | "risk_portfolio" | "servicing_queue" | "transfer_intent" | "workspace",
  Capability extends string,
  Idempotency extends "required" | "prohibited",
  QuotaClass extends "read" | "mutation" | "economic" | "credential" | "privileged" | "worker",
  ResponseSchemaVersion extends string
> {
  readonly operationId: OperationId;
  readonly kind: Kind;
  readonly actorTypes: ActorTypes;
  readonly resourceType: ResourceType;
  readonly requiredCapability: Capability;
  readonly idempotency: Idempotency;
  readonly quotaClass: QuotaClass;
  readonly requestSchemaVersion: TenantProtocolRequestSchemaVersion;
  readonly responseSchemaVersion: ResponseSchemaVersion;
  readonly public: false;
  readonly fundsAuthority: false;
}

export type TenantProtocolOperation =
  | TenantProtocolOperationBase<
      "pilotAcceptCreditOffer",
      "command",
      readonly ["human", "agent"],
      "credit_offer",
      "credit.offer.accept.self",
      "required",
      "economic",
      "tenant_credit_offer_accepted.v1"
    >
  | TenantProtocolOperationBase<
      "pilotExecuteSandboxObligation",
      "command",
      readonly ["human", "agent"],
      "obligation",
      "credit.execute.sandbox.self",
      "required",
      "economic",
      "tenant_sandbox_obligation_executed.v1"
    >
  | TenantProtocolOperationBase<
      "pilotPostSandboxRepayment",
      "command",
      readonly ["human", "agent"],
      "obligation",
      "repayment.post.sandbox.self",
      "required",
      "economic",
      "tenant_sandbox_repayment_posted.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRestructureSandboxObligation",
      "command",
      readonly ["operations_operator"],
      "obligation",
      "servicing.restructure.sandbox",
      "required",
      "privileged",
      "tenant_sandbox_obligation_restructured.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRepurchaseSandboxObligation",
      "command",
      readonly ["operations_operator"],
      "obligation",
      "servicing.repurchase.sandbox",
      "required",
      "privileged",
      "tenant_sandbox_obligation_repurchased.v1"
    >
  | TenantProtocolOperationBase<
      "pilotWriteOffSandboxObligation",
      "command",
      readonly ["operations_operator"],
      "obligation",
      "servicing.writeoff.sandbox",
      "required",
      "privileged",
      "tenant_sandbox_obligation_written_off.v1"
    >
  | TenantProtocolOperationBase<
      "workerAdvanceSandboxServicing",
      "command",
      readonly ["system_worker"],
      "obligation",
      "servicing.advance.sandbox",
      "required",
      "worker",
      "tenant_sandbox_servicing_advanced.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateAgentAccountChallenge",
      "command",
      readonly ["human"],
      "subject",
      "agent_account.challenge.create.owned",
      "required",
      "credential",
      "tenant_agent_account_challenge_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotActivateSandboxMandate",
      "command",
      readonly ["human"],
      "mandate",
      "mandate.activate.owned",
      "required",
      "mutation",
      "tenant_sandbox_mandate_activated.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateAgentSubject",
      "command",
      readonly ["human"],
      "subject",
      "agent.create",
      "required",
      "mutation",
      "tenant_agent_subject_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadAgentAccountBinding",
      "query",
      readonly ["human", "agent"],
      "subject",
      "agent_account.binding.read.self",
      "prohibited",
      "read",
      "tenant_agent_account_binding_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateConsent",
      "command",
      readonly ["human"],
      "subject",
      "consent.create.self",
      "required",
      "mutation",
      "tenant_consent_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateHumanSubject",
      "command",
      readonly ["human"],
      "subject",
      "human_subject.create.self",
      "required",
      "mutation",
      "tenant_human_subject_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateDraftMandate",
      "command",
      readonly ["human"],
      "subject",
      "mandate.draft.create",
      "required",
      "mutation",
      "tenant_draft_mandate_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotEvaluateCreditApplication",
      "command",
      readonly ["human", "agent"],
      "credit_intent",
      "credit.evaluate.self",
      "required",
      "economic",
      "tenant_credit_application_evaluated.v2"
    >
  | TenantProtocolOperationBase<
      "pilotFreezeSubject",
      "command",
      readonly ["risk_operator", "operations_operator"],
      "subject",
      "risk.freeze",
      "required",
      "privileged",
      "tenant_agent_subject_frozen.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadAgentSelf",
      "query",
      readonly ["agent"],
      "subject",
      "subject.read.self",
      "prohibited",
      "read",
      "tenant_agent_subject_view.v2"
    >
  | TenantProtocolOperationBase<
      "pilotRequestCredit",
      "command",
      readonly ["human", "agent"],
      "subject",
      "credit.request",
      "required",
      "economic",
      "tenant_credit_intent_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadCreditApplication",
      "query",
      readonly ["human", "agent"],
      "credit_intent",
      "credit.read.self",
      "prohibited",
      "read",
      "tenant_credit_application_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadConsent",
      "query",
      readonly ["human"],
      "consent",
      "consent.read.self",
      "prohibited",
      "read",
      "tenant_consent_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadHumanSelf",
      "query",
      readonly ["human"],
      "subject",
      "subject.read.self",
      "prohibited",
      "read",
      "tenant_human_subject_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadWorkspaceResume",
      "query",
      readonly ["human"],
      "workspace",
      "workspace.resume.self",
      "prohibited",
      "read",
      "tenant_workspace_resume_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadIdentityReference",
      "query",
      readonly ["human"],
      "human_identity_reference",
      "identity_reference.read.self",
      "prohibited",
      "read",
      "tenant_human_identity_reference_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadMandate",
      "query",
      readonly ["human"],
      "mandate",
      "integration.read.owned",
      "prohibited",
      "read",
      "tenant_mandate_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadTenantRisk",
      "query",
      readonly ["risk_operator", "auditor"],
      "risk_portfolio",
      "risk.read.tenant",
      "prohibited",
      "read",
      "tenant_risk_portfolio_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadPilotHealth",
      "query",
      readonly ["risk_operator", "operations_operator", "auditor"],
      "risk_portfolio",
      "pilot.health.read",
      "prohibited",
      "read",
      "tenant_pilot_health_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadPilotFeedbackSummary",
      "query",
      readonly ["risk_operator", "operations_operator", "auditor"],
      "risk_portfolio",
      "pilot.feedback.read.tenant",
      "prohibited",
      "read",
      "tenant_pilot_feedback_summary_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotSubmitPilotFeedback",
      "command",
      readonly ["human", "agent"],
      "subject",
      "pilot.feedback.submit.self",
      "required",
      "mutation",
      "tenant_pilot_feedback_recorded.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadServicingQueue",
      "query",
      readonly ["risk_operator", "operations_operator"],
      "servicing_queue",
      "servicing.queue.read",
      "prohibited",
      "read",
      "tenant_servicing_queue_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadEvidence",
      "query",
      readonly ["auditor"],
      "evidence",
      "evidence.read",
      "prohibited",
      "read",
      "tenant_obligation_evidence_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadOwnObligation",
      "query",
      readonly ["human", "agent"],
      "obligation",
      "obligation.read.owned",
      "prohibited",
      "read",
      "tenant_owned_obligation_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadOwnObligationEvidence",
      "query",
      readonly ["human", "agent"],
      "evidence",
      "evidence.read.owned",
      "prohibited",
      "read",
      "tenant_owned_obligation_evidence_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRevokeConsent",
      "command",
      readonly ["human"],
      "consent",
      "consent.revoke.self",
      "required",
      "mutation",
      "tenant_consent_revoked.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRevokeDraftMandate",
      "command",
      readonly ["human"],
      "mandate",
      "mandate.draft.revoke",
      "required",
      "mutation",
      "tenant_draft_mandate_revoked.v1"
    >
  | TenantProtocolOperationBase<
      "pilotSubmitAgentAccountProof",
      "command",
      readonly ["agent"],
      "subject",
      "agent_account.proof.submit.self",
      "required",
      "credential",
      "tenant_agent_account_proof_verified.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadProviderIntent",
      "query",
      readonly ["provider"],
      "transfer_intent",
      "provider.intent.read",
      "prohibited",
      "read",
      "provider_intent_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotAcknowledgeProviderIntent",
      "command",
      readonly ["provider"],
      "transfer_intent",
      "provider.intent.acknowledge",
      "required",
      "mutation",
      "provider_intent_acknowledgement.v1"
    >
  | TenantProtocolOperationBase<
      "workerProcessInbox",
      "command",
      readonly ["system_worker"],
      "inbox_message",
      "worker.inbox.process",
      "required",
      "worker",
      "provider_sandbox_callback_result.v1"
    >;

export interface TenantProtocolCatalog {
  protocol: "IPO.ONE";
  protocolVersion: "tenant_protocol.v1";
  maturity: "local_non_funds";
  availability: {
    enabledTransports: readonly ["local_in_process", "authenticated_http_loopback", "mcp_stdio_local"];
    publicEndpointEnabled: false;
    authenticatedHttpEnabled: true;
    authenticatedHttpProfile: "loopback_test_only";
    mcpStdioLocalEnabled: true;
    mcpA2aEnabled: false;
    authenticationContextSource: "trusted_transport_adapter";
    networkContextSource: "trusted_ingress_adapter";
  };
  compatibility: {
    acceptedRequestSchemaVersions: readonly [TenantProtocolRequestSchemaVersion];
    emittedResultSchemaVersions: readonly [TenantProtocolResultSchemaVersion];
    unknownFieldsRejected: true;
    unknownOperationsRejected: true;
    breakingChangeRequiresNewSchemaVersion: true;
    minimumProductionDeprecationDays: 90;
  };
  operations: readonly TenantProtocolOperation[];
  safety: {
    realFundsEnabled: false;
    productionCreditEnabled: false;
    humanCreditEnabled: false;
    humanCreditIntentEnabled: true;
    agentCreditIntentEnabled: true;
    humanCreditDecisionEnabled: true;
    agentCreditDecisionEnabled: true;
    offerAcceptanceEnabled: true;
    sandboxExecutionEnabled: true;
    sandboxRepaymentEnabled: true;
    sandboxServicingEnabled: true;
    sandboxResolutionEnabled: true;
    agentAccountProofEnabled: true;
    mandateActivationEnabled: true;
    providerSandboxEnabled: true;
    productionIdentityEnabled: false;
    rawPiiAllowed: false;
  };
  schemaVersion: TenantProtocolCatalogSchemaVersion;
}

export const TENANT_PROTOCOL_REQUEST_SCHEMA_VERSION: TenantProtocolRequestSchemaVersion;
export const TENANT_PROTOCOL_RESULT_SCHEMA_VERSION: TenantProtocolResultSchemaVersion;
export const TENANT_PROTOCOL_CATALOG_SCHEMA_VERSION: TenantProtocolCatalogSchemaVersion;
export const AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION: AgentHandoffManifestSchemaVersion;
export const TENANT_PROTOCOL_OPERATIONS: readonly TenantProtocolOperation[];
export const TENANT_PROTOCOL_CATALOG: Readonly<TenantProtocolCatalog>;

export function isTenantProtocolRequest(value: unknown): value is TenantProtocolRequest;
export function assertTenantProtocolRequest(value: unknown): asserts value is TenantProtocolRequest;
export function isTenantProtocolResult(value: unknown): value is TenantProtocolResult;
export function assertTenantProtocolResult(value: unknown): asserts value is TenantProtocolResult;
export function isTenantProtocolCatalog(value: unknown): value is TenantProtocolCatalog;
export function assertTenantProtocolCatalog(value: unknown): asserts value is TenantProtocolCatalog;
export function isAgentHandoffManifest(value: unknown): value is AgentHandoffManifest;
export function assertAgentHandoffManifest(value: unknown): asserts value is AgentHandoffManifest;

export class ApiBoundaryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly headers: Record<string, string>;
}

export function createRequestId(headers?: Record<string, string | string[]>): string;
export function createProblemDetails(error: unknown, input: { requestId: string }): Record<string, unknown>;
export function isValidRequestId(value: unknown): value is string;
