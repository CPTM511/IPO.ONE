export type TenantProtocolOperationId =
  | "pilotAcceptCreditOffer"
  | "pilotAcknowledgeProviderIntent"
  | "pilotActivateSandboxMandate"
  | "pilotCreateAgentAccountChallenge"
  | "pilotCreateAgentSubject"
  | "pilotCreateConsent"
  | "pilotCreateHumanSubject"
  | "pilotCreateDraftMandate"
  | "pilotCreateCreditPassportArtifact"
  | "pilotCreateOfficialReport"
  | "pilotEvaluateCreditApplication"
  | "pilotPersistAgentContinuationReceipt"
  | "pilotExecuteSandboxObligation"
  | "pilotFreezeSubject"
  | "pilotPostSandboxRepayment"
  | "pilotRepurchaseSandboxObligation"
  | "pilotRestructureSandboxObligation"
  | "pilotRequestCredit"
  | "pilotReadAgentSelf"
  | "pilotReadAgentAccountBinding"
  | "pilotReadCreditApplication"
  | "pilotReadCreditRegistryEvidence"
  | "pilotReadOwnCreditPassportArtifact"
  | "pilotReadOfficialReport"
  | "pilotRetrieveOfficialReport"
  | "pilotVerifyCreditPassportArtifact"
  | "pilotReadConsent"
  | "pilotReadHumanSelf"
  | "pilotReadWorkspaceResume"
  | "pilotReadCapitalPartnerSelf"
  | "pilotReadCapitalPartnerPassportInbox"
  | "pilotReadTenantRiskPortfolioReference"
  | "pilotReadServicingQueueReference"
  | "pilotReadIdentityReference"
  | "pilotReadMandate"
  | "pilotReadTenantRisk"
  | "pilotReadPilotHealth"
  | "pilotReadPilotFeedbackSummary"
  | "pilotReadServicingQueue"
  | "pilotReadEvidence"
  | "pilotReadOwnObligation"
  | "pilotReadOwnCreditState"
  | "pilotReadOwnObligationEvidence"
  | "pilotReadProviderIntent"
  | "pilotRevokeConsent"
  | "pilotRevokeDraftMandate"
  | "pilotRevokeCreditPassportArtifact"
  | "pilotRevokeOfficialReport"
  | "pilotAuthorCapitalPartnerOffer"
  | "pilotTransitionCapitalPartnerOffer"
  | "pilotReadCapitalPartnerFacility"
  | "pilotReadCapitalPartnerPortfolio"
  | "pilotSubmitAgentAccountProof"
  | "pilotSubmitPilotFeedback"
  | "pilotWriteOffSandboxObligation"
  | "workerAdvanceSandboxServicing"
  | "workerProcessInbox"
  | "tradingCreateAccountBindingChallenge"
  | "tradingImportHyperliquidHistory"
  | "tradingFinalizeEvidenceSnapshot"
  | "tradingReadCreditProfile"
  | "tradingCreateCapitalRequest"
  | "tradingCreateProviderMandate"
  | "tradingListCompatibleMandates"
  | "tradingCreateMatchProposal"
  | "tradingAcceptMatchAsProvider"
  | "tradingAcceptMatchAsSubject"
  | "tradingCreateFacility"
  | "tradingContributeSubjectCollateral"
  | "tradingRecordProviderFunding"
  | "tradingActivateFacility"
  | "tradingSubmitOrderIntent"
  | "tradingCancelOrderIntent"
  | "tradingReadFacilityState"
  | "tradingEvaluateRisk"
  | "tradingPauseNewRisk"
  | "tradingFlattenFacility"
  | "tradingRequestClose"
  | "tradingRunSettlement"
  | "tradingReadSettlement"
  | "tradingIssuePerformanceProof"
  | "tradingReadFacilityEvidence"
  | "walletPrepareAccountBinding"
  | "walletSubmitAccountBinding"
  | "walletReadAccountBindings"
  | "walletRevokeAccountBinding"
  | "walletDiscoverCapabilities"
  | "walletPrepareGrant"
  | "walletActivateGrant"
  | "walletReadGrant"
  | "walletRevokeGrant"
  | "walletPrepareExecution"
  | "walletApproveExecution"
  | "walletSubmitExecution"
  | "walletReadExecution"
  | "venueDiscoverCapabilities"
  | "venueReadBinding"
  | "venuePrepareDelegate"
  | "venueActivateDelegate"
  | "venueRevokeDelegate"
  | "venuePrepareExecution"
  | "venueSubmitExecution"
  | "venueReadExecution"
  | "pilotReadOwnSecuredPool"
  | "pilotReviewSecuredPoolAction"
  | "pilotReadSecuredPoolRisk";

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
    | "ipo_one_post_sandbox_repayment"
    | "ipo_one_read_credit_registry_evidence"
    | "ipo_one_read_credit_state";
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
    | "pilotPostSandboxRepayment"
    | "pilotReadCreditRegistryEvidence"
    | "pilotReadOwnCreditState";
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
    allowedProviderIds: string[];
    allowedCategories: string[];
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
    allowedProviderIds: string[];
    allowedCategories: string[];
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
    | "tenant_credit_application_view.v2"
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
    | "tenant_credit_application_view.v2"
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
  resourceType: "subject" | "consent" | "credit_intent" | "credit_offer" | "credit_passport_artifact" | "delegated_wallet_grant" | "evidence" | "human_identity_reference" | "inbox_message" | "mandate" | "obligation" | "risk_portfolio" | "servicing_queue" | "trading_facility" | "trading_order_intent" | "trading_match_proposal" | "transfer_intent" | "wallet_adapter" | "wallet_execution";
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

export interface PersistAgentContinuationReceiptRequest extends TenantProtocolRequestBase {
  operationId: "pilotPersistAgentContinuationReceipt";
  payload: { receipt: AgentCreditOfferWorkflowReceipt };
  resource: { resourceType: "credit_offer"; resourceId: string };
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
  payload: {
    providerId?: string;
    providerCategory?: string;
  };
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
  payload: { selectedAgentActorId?: string };
}

export interface ReadTenantRiskPortfolioReferenceRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadTenantRiskPortfolioReference";
  payload: Record<string, never>;
}

export interface ReadServicingQueueReferenceRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadServicingQueueReference";
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

export interface ReadCreditRegistryEvidenceRequest
  extends TenantProtocolRequestBase {
  operationId: "pilotReadCreditRegistryEvidence";
  payload: Record<string, never>;
  resource: {
    resourceType: "credit_registry_evidence";
    resourceId: `0x${string}`;
  };
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

export interface ReadOwnCreditStateRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadOwnCreditState";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
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

export interface CreateTradingAccountBindingChallengeRequest extends TenantProtocolRequestBase {
  operationId: "tradingCreateAccountBindingChallenge";
  payload: {
    environment: "hyperliquid_testnet";
    masterAccountAddress: `0x${string}`;
    subaccountAddress: `0x${string}`;
  };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ImportTradingHistoryRequest extends TenantProtocolRequestBase {
  operationId: "tradingImportHyperliquidHistory";
  payload: {
    masterAccountAddress: `0x${string}`;
    subaccountAddress: `0x${string}`;
    signature: `0x${string}`;
  };
  resource: { resourceType: "trading_credit_profile"; resourceId: string };
  idempotencyKey: string;
}

export interface FinalizeTradingEvidenceSnapshotRequest extends TenantProtocolRequestBase {
  operationId: "tradingFinalizeEvidenceSnapshot";
  payload: Record<string, never>;
  resource: { resourceType: "trading_credit_profile"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadTradingCreditProfileRequest extends TenantProtocolRequestBase {
  operationId: "tradingReadCreditProfile";
  payload: Record<string, never>;
  resource: { resourceType: "trading_credit_profile"; resourceId: string };
}

export type TradingCapitalTemplateType =
  | "credit"
  | "performance_participation"
  | "hybrid";
export type TradingStrategyClass =
  | "market_neutral"
  | "directional"
  | "liquidity_provision";

export interface CreateTradingCapitalRequestRequest extends TenantProtocolRequestBase {
  operationId: "tradingCreateCapitalRequest";
  payload: {
    templateType: TradingCapitalTemplateType;
    strategyClass: TradingStrategyClass;
    assetId: "urn:ipo-one:sandbox-asset:usd-cent";
    requestedAmountMinor: string;
    durationDays: number;
  };
  resource: { resourceType: "trading_credit_profile"; resourceId: string };
  idempotencyKey: string;
}

export interface CreateTradingProviderMandateRequest extends TenantProtocolRequestBase {
  operationId: "tradingCreateProviderMandate";
  payload: {
    supportedTemplateTypes: TradingCapitalTemplateType[];
    allowedSubjectTypes: ("human" | "agent")[];
    allowedStrategyClasses: TradingStrategyClass[];
    assetId: "urn:ipo-one:sandbox-asset:usd-cent";
    minAmountMinor: string;
    maxAmountMinor: string;
    minDurationDays: number;
    maxDurationDays: number;
  };
  resource: { resourceType: "provider"; resourceId: string };
  idempotencyKey: string;
}

export interface ListCompatibleTradingMandatesRequest extends TenantProtocolRequestBase {
  operationId: "tradingListCompatibleMandates";
  payload: Record<string, never>;
  resource: { resourceType: "trading_capital_request"; resourceId: string };
}

export interface CreateTradingMatchProposalRequest extends TenantProtocolRequestBase {
  operationId: "tradingCreateMatchProposal";
  payload: {
    providerMandateId: string;
    requestHash: string;
    mandateHash: string;
  };
  resource: { resourceType: "trading_capital_request"; resourceId: string };
  idempotencyKey: string;
}

export interface AcceptTradingMatchAsProviderRequest extends TenantProtocolRequestBase {
  operationId: "tradingAcceptMatchAsProvider";
  payload: { proposalHash: string; termsHash: string };
  resource: { resourceType: "trading_match_proposal"; resourceId: string };
  idempotencyKey: string;
}

export interface AcceptTradingMatchAsSubjectRequest extends TenantProtocolRequestBase {
  operationId: "tradingAcceptMatchAsSubject";
  payload: { proposalHash: string; termsHash: string };
  resource: { resourceType: "trading_match_proposal"; resourceId: string };
  idempotencyKey: string;
}

export interface TradingExpectedFacilityState {
  expectedStateHash: string;
  expectedVersion: number;
}

export interface CreateTradingFacilityRequest extends TenantProtocolRequestBase {
  operationId: "tradingCreateFacility";
  payload: { obligationId: string; proposalHash: string };
  resource: { resourceType: "trading_match_proposal"; resourceId: string };
  idempotencyKey: string;
}

export interface ContributeTradingSubjectCollateralRequest extends TenantProtocolRequestBase {
  operationId: "tradingContributeSubjectCollateral";
  payload: TradingExpectedFacilityState & { amountMinor: string };
  resource: { resourceType: "trading_facility"; resourceId: string };
  idempotencyKey: string;
}

export interface RecordTradingProviderFundingRequest extends TenantProtocolRequestBase {
  operationId: "tradingRecordProviderFunding";
  payload: TradingExpectedFacilityState & { amountMinor: string };
  resource: { resourceType: "trading_facility"; resourceId: string };
  idempotencyKey: string;
}

export interface ActivateTradingFacilityRequest extends TenantProtocolRequestBase {
  operationId: "tradingActivateFacility";
  payload: TradingExpectedFacilityState;
  resource: { resourceType: "trading_facility"; resourceId: string };
  idempotencyKey: string;
}

export interface SubmitTradingOrderIntentRequest extends TenantProtocolRequestBase {
  operationId: "tradingSubmitOrderIntent";
  payload: TradingExpectedFacilityState & {
    direction: "long" | "short";
    syntheticNotionalMinor: string;
  };
  resource: { resourceType: "trading_facility"; resourceId: string };
  idempotencyKey: string;
}

export interface CancelTradingOrderIntentRequest extends TenantProtocolRequestBase {
  operationId: "tradingCancelOrderIntent";
  payload: {
    expectedFacilityStateHash: string;
    expectedFacilityVersion: number;
    expectedOrderIntentHash: string;
    expectedOrderVersion: 1 | 2;
  };
  resource: { resourceType: "trading_order_intent"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadTradingFacilityStateRequest extends TenantProtocolRequestBase {
  operationId: "tradingReadFacilityState";
  payload: Record<string, never>;
  resource: { resourceType: "trading_facility"; resourceId: string };
}

export interface EvaluateTradingFacilityRiskRequest extends TenantProtocolRequestBase {
  operationId: "tradingEvaluateRisk";
  payload: TradingExpectedFacilityState;
  resource: { resourceType: "trading_facility"; resourceId: string };
  idempotencyKey: string;
}

export interface PauseTradingFacilityNewRiskRequest extends TenantProtocolRequestBase {
  operationId: "tradingPauseNewRisk";
  payload: TradingExpectedFacilityState;
  resource: { resourceType: "trading_facility"; resourceId: string };
  reasonCode: string;
  approvalArtifact: { proposalId: string; proposalVersion: number };
  idempotencyKey: string;
}

export interface FlattenTradingFacilityRequest extends TenantProtocolRequestBase {
  operationId: "tradingFlattenFacility";
  payload: TradingExpectedFacilityState;
  resource: { resourceType: "trading_facility"; resourceId: string };
  reasonCode: string;
  approvalArtifact: { proposalId: string; proposalVersion: number };
  idempotencyKey: string;
}

export interface RequestTradingFacilityCloseRequest extends TenantProtocolRequestBase {
  operationId: "tradingRequestClose";
  payload: TradingExpectedFacilityState;
  resource: { resourceType: "trading_facility"; resourceId: string };
  idempotencyKey: string;
}

export interface RunTradingSettlementRequest extends TenantProtocolRequestBase {
  operationId: "tradingRunSettlement";
  payload: {
    expectedCloseRequestHash: string;
    expectedFacilityStateHash: string;
    expectedFacilityVersion: number;
  };
  resource: {
    resourceType: "trading_facility_close_request";
    resourceId: string;
  };
  idempotencyKey: string;
}

export interface ReadTradingSettlementRequest extends TenantProtocolRequestBase {
  operationId: "tradingReadSettlement";
  payload: Record<string, never>;
  resource: { resourceType: "trading_settlement"; resourceId: string };
}

export interface IssueTradingPerformanceProofRequest extends TenantProtocolRequestBase {
  operationId: "tradingIssuePerformanceProof";
  payload: { expectedSettlementHash: string };
  resource: { resourceType: "trading_settlement"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadTradingFacilityEvidenceRequest extends TenantProtocolRequestBase {
  operationId: "tradingReadFacilityEvidence";
  payload: Record<string, never>;
  resource: { resourceType: "trading_facility"; resourceId: string };
}

export type CreditPassportClaim =
  | "decision_outcome"
  | "factor_authority"
  | "factor_subject_principal"
  | "factor_identity_or_principal_binding"
  | "factor_adverse_obligation"
  | "factor_sandbox_policy_fit"
  | "canonical_reason_codes"
  | "reason_to_feature_lineage"
  | "source_evidence_lineage";

export interface CreateCreditPassportArtifactRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateCreditPassportArtifact";
  payload: {
    creditIntentId: string;
    verifierActorId: string;
    claimSelectors: CreditPassportClaim[];
    lifetimeSeconds: number;
    schemaVersion: "credit_passport_artifact_create.v1";
  };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadOwnCreditPassportArtifactRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadOwnCreditPassportArtifact";
  payload: Record<string, never>;
  resource: { resourceType: "credit_passport_artifact"; resourceId: string };
}

export interface VerifyCreditPassportArtifactRequest extends TenantProtocolRequestBase {
  operationId: "pilotVerifyCreditPassportArtifact";
  payload: {
    artifactHash: string;
    artifactVersion: number;
    purpose: "private_credit_review";
    schemaVersion: "credit_passport_verification_request.v1";
  };
  resource: { resourceType: "credit_passport_artifact"; resourceId: string };
  purpose: "private_credit_review";
}

export interface RevokeCreditPassportArtifactRequest extends TenantProtocolRequestBase {
  operationId: "pilotRevokeCreditPassportArtifact";
  payload: Record<string, never>;
  resource: { resourceType: "credit_passport_artifact"; resourceId: string };
  reasonCode:
    | "owner_withdrawal"
    | "verifier_access_no_longer_required"
    | "source_disclosure_error"
    | "security_concern";
  idempotencyKey: string;
}

export type CapitalPartnerOfferCondition =
  | "passport_current_at_acceptance"
  | "authority_current_at_acceptance"
  | "no_adverse_obligation_at_acceptance";

export type CapitalPartnerSelfViewSchemaVersion = "tenant_capital_partner_self_view.v1";
export type CapitalPartnerPassportInboxViewSchemaVersion = "tenant_capital_partner_passport_inbox_view.v1";

export interface ReadCapitalPartnerSelfRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadCapitalPartnerSelf";
  payload: Record<string, never>;
}

export interface ReadCapitalPartnerPassportInboxRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadCapitalPartnerPassportInbox";
  payload: Record<string, never>;
}

export interface AuthorCapitalPartnerOfferRequest extends TenantProtocolRequestBase {
  operationId: "pilotAuthorCapitalPartnerOffer";
  payload: {
    creditIntentId: string;
    artifactHash: string;
    artifactVersion: number;
    underwritingSnapshotHash: string;
    assetId: string;
    facilityLimitMinor: string;
    approvedPrincipalMinor: string;
    perDrawCapMinor: string;
    annualRateBps: number;
    originationFeeMinor: string;
    repaymentFrequency: RepaymentFrequency;
    installmentCount: number;
    firstPaymentAt: string;
    maturityAt: string;
    permittedPurposeCode: string;
    conditions: CapitalPartnerOfferCondition[];
    undrawnRevocationRule:
      | "capital_partner_before_acceptance"
      | "irrevocable_until_expiry";
    validUntil: string;
    reasonCodes: string[];
    disclosureRef: string;
    schemaVersion: "capital_partner_offer_authoring.v1";
  };
  resource: { resourceType: "credit_passport_artifact"; resourceId: string };
  idempotencyKey: string;
}

export interface TransitionCapitalPartnerOfferRequest extends TenantProtocolRequestBase {
  operationId: "pilotTransitionCapitalPartnerOffer";
  payload: {
    nextStatus: "expired" | "withdrawn" | "superseded";
    supersedingOfferId: string | null;
    schemaVersion: "capital_partner_offer_transition.v1";
  };
  resource: { resourceType: "credit_offer"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadCapitalPartnerFacilityRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadCapitalPartnerFacility";
  payload: Record<string, never>;
  resource: { resourceType: "obligation"; resourceId: string };
}

export interface ReadCapitalPartnerPortfolioRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadCapitalPartnerPortfolio";
  payload: Record<string, never>;
  resource: { resourceType: "capital_partner_profile"; resourceId: string };
}

export interface CreateOfficialReportRequest extends TenantProtocolRequestBase {
  operationId: "pilotCreateOfficialReport";
  payload: {
    format: "json" | "csv";
    lifetimeSeconds: number;
    schemaVersion: "official_report_create.v1";
  };
  resource: { resourceType: "obligation"; resourceId: string };
  idempotencyKey: string;
}

export interface ReadOfficialReportRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadOfficialReport";
  payload: Record<string, never>;
  resource: { resourceType: "official_report"; resourceId: string };
}

export interface RetrieveOfficialReportRequest extends TenantProtocolRequestBase {
  operationId: "pilotRetrieveOfficialReport";
  payload: Record<string, never>;
  resource: { resourceType: "official_report"; resourceId: string };
}

export interface RevokeOfficialReportRequest extends TenantProtocolRequestBase {
  operationId: "pilotRevokeOfficialReport";
  payload: Record<string, never>;
  resource: { resourceType: "official_report"; resourceId: string };
  reasonCode: "owner_withdrawal" | "source_disclosure_error" | "security_concern";
  idempotencyKey: string;
}

export interface WalletDiscoverCapabilitiesRequest extends TenantProtocolRequestBase {
  operationId: "walletDiscoverCapabilities";
  payload: Record<string, never>;
  resource: { resourceType: "wallet_adapter"; resourceId: string };
}

export interface WalletPrepareAccountBindingRequest extends TenantProtocolRequestBase {
  operationId: "walletPrepareAccountBinding";
  payload: { accountId: string };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletSubmitAccountBindingRequest extends TenantProtocolRequestBase {
  operationId: "walletSubmitAccountBinding";
  payload: { challengeId: string; accountId: string; signature: string };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletReadAccountBindingsRequest extends TenantProtocolRequestBase {
  operationId: "walletReadAccountBindings";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
}

export interface WalletRevokeAccountBindingRequest extends TenantProtocolRequestBase {
  operationId: "walletRevokeAccountBinding";
  payload: { accountBindingId: string };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletPrepareGrantRequest extends TenantProtocolRequestBase {
  operationId: "walletPrepareGrant";
  payload: {
    providerId: string;
    accountBindingId: string;
    chainId: "eip155:84532" | "eip155:1952";
    requestedExpiresAt: string;
    sessionEpoch: number;
    nonce: string;
  };
  resource: { resourceType: "subject"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletActivateGrantRequest extends TenantProtocolRequestBase {
  operationId: "walletActivateGrant";
  payload: { expectedGrantHash: string };
  resource: { resourceType: "delegated_wallet_grant"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletReadGrantRequest extends TenantProtocolRequestBase {
  operationId: "walletReadGrant";
  payload: Record<string, never>;
  resource: { resourceType: "delegated_wallet_grant"; resourceId: string };
}

export interface WalletRevokeGrantRequest extends TenantProtocolRequestBase {
  operationId: "walletRevokeGrant";
  payload: Record<string, never>;
  resource: { resourceType: "delegated_wallet_grant"; resourceId: string };
  reasonCode: "credential_compromise" | "operator_request" | "security_incident";
  idempotencyKey: string;
}

export interface WalletPrepareExecutionRequest extends TenantProtocolRequestBase {
  operationId: "walletPrepareExecution";
  payload: { transferIntentId: string };
  resource: { resourceType: "delegated_wallet_grant"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletApproveExecutionRequest extends TenantProtocolRequestBase {
  operationId: "walletApproveExecution";
  payload: { preflightHash: string; approvalArtifactHash: string };
  resource: { resourceType: "wallet_execution"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletSubmitExecutionRequest extends TenantProtocolRequestBase {
  operationId: "walletSubmitExecution";
  payload: { preflightHash: string };
  resource: { resourceType: "wallet_execution"; resourceId: string };
  idempotencyKey: string;
}

export interface WalletReadExecutionRequest extends TenantProtocolRequestBase {
  operationId: "walletReadExecution";
  payload: Record<string, never>;
  resource: { resourceType: "wallet_execution"; resourceId: string };
}

export interface VenueDiscoverCapabilitiesRequest extends TenantProtocolRequestBase {
  operationId: "venueDiscoverCapabilities";
  payload: Record<string, never>;
  resource: { resourceType: "venue_adapter"; resourceId: string };
}

export interface VenueReadBindingRequest extends TenantProtocolRequestBase {
  operationId: "venueReadBinding";
  payload: Record<string, never>;
  resource: { resourceType: "venue_binding"; resourceId: string };
}

export interface VenuePrepareDelegateRequest extends TenantProtocolRequestBase {
  operationId: "venuePrepareDelegate";
  payload: { delegateAddressHash: string; signerReferenceHash: string; requestedExpiresAt: string };
  resource: { resourceType: "venue_binding"; resourceId: string };
  idempotencyKey: string;
}

export interface VenueActivateDelegateRequest extends TenantProtocolRequestBase {
  operationId: "venueActivateDelegate";
  payload: { expectedDelegateHash: string };
  resource: { resourceType: "venue_delegate"; resourceId: string };
  idempotencyKey: string;
}

export interface VenueRevokeDelegateRequest extends TenantProtocolRequestBase {
  operationId: "venueRevokeDelegate";
  payload: Record<string, never>;
  resource: { resourceType: "venue_delegate"; resourceId: string };
  reasonCode: "credential_compromise" | "operator_request" | "security_incident" | "scheduled_rotation" | "delegate_expired";
  idempotencyKey: string;
}

export interface VenuePrepareExecutionRequest extends TenantProtocolRequestBase {
  operationId: "venuePrepareExecution";
  payload: { orderIntentId: string; orderIntentHash: string };
  resource: { resourceType: "venue_delegate"; resourceId: string };
  idempotencyKey: string;
}

export interface VenueSubmitExecutionRequest extends TenantProtocolRequestBase {
  operationId: "venueSubmitExecution";
  payload: { preparedExecutionHash: string };
  resource: { resourceType: "venue_execution"; resourceId: string };
  idempotencyKey: string;
}

export interface VenueReadExecutionRequest extends TenantProtocolRequestBase {
  operationId: "venueReadExecution";
  payload: Record<string, never>;
  resource: { resourceType: "venue_execution"; resourceId: string };
}

export type SecuredPoolActionType =
  | "supply"
  | "withdraw"
  | "deposit_collateral"
  | "borrow"
  | "repay"
  | "release_collateral";

export interface ReadOwnSecuredPoolRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadOwnSecuredPool";
  payload: Record<string, never>;
  resource: { resourceType: "subject"; resourceId: string };
}

export interface ReviewSecuredPoolActionRequest extends TenantProtocolRequestBase {
  operationId: "pilotReviewSecuredPoolAction";
  payload: { actionType: SecuredPoolActionType; amountAssets: string };
  resource: { resourceType: "subject"; resourceId: string };
}

export interface ReadSecuredPoolRiskRequest extends TenantProtocolRequestBase {
  operationId: "pilotReadSecuredPoolRisk";
  payload: Record<string, never>;
  resource: { resourceType: "risk_portfolio"; resourceId: string };
}

export type TenantProtocolRequest =
  | ReadOwnSecuredPoolRequest
  | ReviewSecuredPoolActionRequest
  | ReadSecuredPoolRiskRequest
  | WalletPrepareAccountBindingRequest
  | WalletSubmitAccountBindingRequest
  | WalletReadAccountBindingsRequest
  | WalletRevokeAccountBindingRequest
  | WalletDiscoverCapabilitiesRequest
  | WalletPrepareGrantRequest
  | WalletActivateGrantRequest
  | WalletReadGrantRequest
  | WalletRevokeGrantRequest
  | WalletPrepareExecutionRequest
  | WalletApproveExecutionRequest
  | WalletSubmitExecutionRequest
  | WalletReadExecutionRequest
  | VenueDiscoverCapabilitiesRequest
  | VenueReadBindingRequest
  | VenuePrepareDelegateRequest
  | VenueActivateDelegateRequest
  | VenueRevokeDelegateRequest
  | VenuePrepareExecutionRequest
  | VenueSubmitExecutionRequest
  | VenueReadExecutionRequest
  | AcceptCreditOfferRequest
  | AcknowledgeProviderIntentRequest
  | ActivateSandboxMandateRequest
  | CreateAgentAccountChallengeRequest
  | CreateAgentSubjectRequest
  | CreateConsentRequest
  | CreateHumanSubjectRequest
  | CreateDraftMandateRequest
  | CreateCreditPassportArtifactRequest
  | CreateOfficialReportRequest
  | EvaluateCreditApplicationRequest
  | PersistAgentContinuationReceiptRequest
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
  | ReadOwnCreditPassportArtifactRequest
  | ReadOfficialReportRequest
  | RetrieveOfficialReportRequest
  | VerifyCreditPassportArtifactRequest
  | ReadConsentRequest
  | ReadHumanSelfRequest
  | ReadWorkspaceResumeRequest
  | ReadTenantRiskPortfolioReferenceRequest
  | ReadServicingQueueReferenceRequest
  | ReadHumanIdentityReferenceRequest
  | ReadMandateRequest
  | ReadTenantRiskRequest
  | ReadPilotHealthRequest
  | ReadPilotFeedbackSummaryRequest
  | ReadServicingQueueRequest
  | ReadObligationEvidenceRequest
  | ReadCreditRegistryEvidenceRequest
  | ReadOwnObligationRequest
  | ReadOwnCreditStateRequest
  | ReadOwnObligationEvidenceRequest
  | ReadProviderIntentRequest
  | RevokeConsentRequest
  | RevokeDraftMandateRequest
  | RevokeCreditPassportArtifactRequest
  | ReadCapitalPartnerSelfRequest
  | ReadCapitalPartnerPassportInboxRequest
  | AuthorCapitalPartnerOfferRequest
  | TransitionCapitalPartnerOfferRequest
  | ReadCapitalPartnerFacilityRequest
  | ReadCapitalPartnerPortfolioRequest
  | RevokeOfficialReportRequest
  | SubmitAgentAccountProofRequest
  | SubmitPilotFeedbackRequest
  | ProcessProviderInboxRequest
  | CreateTradingAccountBindingChallengeRequest
  | ImportTradingHistoryRequest
  | FinalizeTradingEvidenceSnapshotRequest
  | ReadTradingCreditProfileRequest
  | CreateTradingCapitalRequestRequest
  | CreateTradingProviderMandateRequest
  | ListCompatibleTradingMandatesRequest
  | CreateTradingMatchProposalRequest
  | AcceptTradingMatchAsProviderRequest
  | AcceptTradingMatchAsSubjectRequest
  | CreateTradingFacilityRequest
  | ContributeTradingSubjectCollateralRequest
  | RecordTradingProviderFundingRequest
  | ActivateTradingFacilityRequest
  | SubmitTradingOrderIntentRequest
  | CancelTradingOrderIntentRequest
  | ReadTradingFacilityStateRequest
  | EvaluateTradingFacilityRiskRequest
  | PauseTradingFacilityNewRiskRequest
  | FlattenTradingFacilityRequest
  | RequestTradingFacilityCloseRequest
  | RunTradingSettlementRequest
  | ReadTradingSettlementRequest
  | IssueTradingPerformanceProofRequest
  | ReadTradingFacilityEvidenceRequest;

export interface AgentAccountBindingSummary {
  accountBindingId: string;
  accountHash: string;
  chainId: "eip155:84532" | "eip155:1952";
  purpose: AgentAccountPurpose;
  proofHash: string;
  verificationMethod:
    | "eip712_eoa_v1"
    | "eip1271_eip712_v1"
    | "eip6492_eip712_v1";
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

export interface CreditApplicationViewResponseV1 {
  creditIntent: CreditIntentSummary;
  decision: CreditDecisionSummary | null;
  offer: CreditOfferSummary | null;
  schemaVersion: "tenant_credit_application_view.v1";
}

export interface CreditApplicationViewResponseV2 {
  creditIntent: CreditIntentSummary;
  decision: CreditDecisionSummary | null;
  offer: CreditOfferSummary | CapitalPartnerCreditOffer | null;
  schemaVersion: "tenant_credit_application_view.v2";
}

export type CreditApplicationViewResponse = CreditApplicationViewResponseV2;

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

export interface HumanOfferReviewRecovery {
  subjectId: string;
  consentId: string;
  creditIntent: CreditIntentSummary;
  decision: CreditDecisionSummary;
  offer: CreditOfferSummary | CapitalPartnerCreditOffer;
  offerSchemaVersion: "credit_offer.v1" | "credit_offer.v2";
  offerAggregateVersion: number;
  serverTruth: true;
  nonAuthorizing: true;
  sandboxOnly: true;
  productionFundsApproved: false;
  fundsAuthority: false;
  schemaVersion: "human_offer_review_recovery.v1";
}

export interface CreditApplicationEvaluatedResponse {
  creditIntent: CreditIntentSummary;
  decision: CreditDecisionSummary & { decisionPassport: CreditDecisionPassportSummary };
  offer: CreditOfferSummary | null;
  schemaVersion: "tenant_credit_application_evaluated.v2";
}

export interface AgentContinuationReceiptPersistedResponse {
  continuationReceiptId: string;
  receiptHash: string;
  subjectId: string;
  mandateId: string;
  creditOfferId: string;
  offerAggregateVersion: number;
  expiresAt: string;
  persisted: true;
  nonAuthorizing: true;
  sandboxOnly: true;
  productionAuthority: false;
  schemaVersion: "tenant_agent_continuation_receipt_persisted.v1";
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
  providerId?: string;
  providerCategory?: string;
  purposeCode?: string;
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
  revenueCapture?: LockboxRevenueCaptureReceipt;
  servicingAction?: SandboxServicingActionSummary;
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "tenant_sandbox_repayment_posted.v1";
}

export interface LockboxRevenueCaptureReceipt {
  revenueCaptureId: string;
  revenueCaptureHash: string;
  lockboxId: string;
  obligationId: string;
  subjectId: string;
  assetId: string;
  providerScopeHash: string;
  capturedMinor: string;
  automaticRepaymentId: string;
  ledgerTransactionId: string;
  occurredAt: string;
  cashflowRoute: "automatic_repayment_only";
  sandboxOnly: true;
  productionFundsMoved: false;
  withdrawable: false;
  schemaVersion: "lockbox_revenue_capture_receipt.v1";
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

export interface ControlledAgentWorkspaceOption {
  actorId: string;
  label: string;
  setupStatus: "configured" | "setup_required";
}

export interface WorkspaceResumeViewResponseV1 {
  workspaceKind: "human_borrower" | "principal_controller" | "agent_runtime";
  resources: WorkspaceResumeResource[];
  controlledAgentActorIds?: string[];
  continuationReceipts?: WorkspaceContinuationReceiptView[];
  hasMore: boolean;
  serverTruth: true;
  schemaVersion: "tenant_workspace_resume_view.v1";
}

export interface WorkspaceResumeViewResponseV2 {
  workspaceKind: "human_borrower" | "principal_controller" | "agent_runtime";
  resources: WorkspaceResumeResource[];
  controlledAgentActorIds?: string[];
  controlledAgentOptions?: ControlledAgentWorkspaceOption[];
  selectedAgentActorId?: string | null;
  continuationReceipts?: WorkspaceContinuationReceiptView[];
  humanOfferReview?: HumanOfferReviewRecovery | null;
  hasMore: boolean;
  serverTruth: true;
  schemaVersion: "tenant_workspace_resume_view.v2";
}

export type WorkspaceResumeViewResponse = WorkspaceResumeViewResponseV2;

export interface TenantRiskPortfolioReferenceViewResponse {
  resource: { resourceType: "risk_portfolio"; resourceId: string } | null;
  serverTruth: true;
  readOnly: true;
  schemaVersion: "tenant_risk_portfolio_reference_view.v1";
}

export interface TenantServicingQueueReferenceViewResponse {
  resource: { resourceType: "servicing_queue"; resourceId: string } | null;
  serverTruth: true;
  readOnly: true;
  schemaVersion: "tenant_servicing_queue_reference_view.v1";
}

export interface WorkspaceContinuationReceiptView {
  continuationReceiptId: string;
  receiptHash: string;
  subjectId: string;
  mandateId: string;
  creditOfferId: string;
  creditOfferHash: string;
  offerAggregateVersion: number;
  expiresAt: string;
  receipt: AgentCreditOfferWorkflowReceipt;
  serverTruth: true;
  schemaVersion: "workspace_continuation_receipt_view.v1";
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

export interface CreditRegistryTransactionEvidenceSummary {
  kind: "publication" | "proof_update" | "close" | "pause";
  transactionHash: `0x${string}`;
  blockNumber: string;
  blockHash: `0x${string}`;
  observationStatus: "safe" | "finalized";
  confirmations: number;
  schemaVersion: "credit_registry_transaction_evidence_summary.v1";
}

export interface CreditRegistryEvidenceViewResponse {
  chainId: "eip155:84532";
  contractAddress: `0x${string}`;
  authorizationHash: `0x${string}`;
  observationHash: `0x${string}`;
  finalityProofHash: `0x${string}`;
  finalCreditStateHash: `0x${string}`;
  finalObligationProofHash: `0x${string}`;
  finalStatus: "closed";
  finalVersion: 3;
  registryPaused: true;
  authorizationActive: false;
  transactions: readonly [
    CreditRegistryTransactionEvidenceSummary,
    CreditRegistryTransactionEvidenceSummary,
    CreditRegistryTransactionEvidenceSummary,
    CreditRegistryTransactionEvidenceSummary
  ];
  safeBlock: { number: string; hash: `0x${string}` };
  finalizedBlock: { number: string; hash: `0x${string}` };
  observedAt: string;
  recordedAt: string;
  asOf: string;
  readOnly: true;
  liveTestnetObservation: true;
  syntheticOnly: true;
  authorizing: false;
  productionFundsMoved: false;
  fundsAuthority: false;
  rawAccountIncluded: false;
  rawProviderPayloadIncluded: false;
  schemaVersion: "tenant_credit_registry_evidence_view.v1";
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

export interface CreditTrackRecordEntry {
  creditOutcomeId: string;
  outcomeHash: `0x${string}`;
  obligationId: string;
  outcomeLabel: "on_time_repaid" | "late_or_modified_repaid" | "written_off";
  creditImpact:
    | "positive_repayment_history"
    | "modified_or_late_repayment_history"
    | "loss_history";
  maxDaysPastDue: number;
  restructured: boolean;
  repurchased: boolean;
  originalPrincipalMinor: string;
  totalRepaidMinor: string;
  lossMinor: string;
  repaymentRatioBps: number;
  sourceEvidenceHashes: `0x${string}`[];
  outcomeFinalizedAt: string;
  recordedAt: string;
  schemaVersion: "credit_track_record_entry.v1";
}

export interface CreditStateProjection {
  creditStateHash: `0x${string}`;
  subjectId: string;
  principalId: string;
  projectionVersion: number;
  metrics: {
    completedCycleCount: number;
    outcomeCounts: {
      onTimeRepaid: number;
      lateOrModifiedRepaid: number;
      writtenOff: number;
    };
    maximumDaysPastDue: number;
    totalOriginalPrincipalMinor: string;
    totalRepaidMinor: string;
    totalLossMinor: string;
    schemaVersion: "credit_state_metrics.v1";
  };
  factors: {
    repaymentReliability:
      | "verified_on_time_history"
      | "mixed_repayment_history"
      | "adverse_loss_recorded";
    servicingPerformance:
      | "no_delinquency_or_modification_recorded"
      | "delinquency_or_modification_recorded";
    lossExperience: "no_loss_recorded" | "loss_recorded";
    evidenceBasis: "finalized_credit_outcomes_only";
    schemaVersion: "credit_state_factors.v1";
  };
  latestOutcome: CreditTrackRecordEntry;
  trackRecord: CreditTrackRecordEntry[];
  updatedAt: string;
  authorizing: false;
  automaticLimitChange: false;
  fundsAuthority: false;
  piiIncluded: false;
  productionAuthority: false;
  productionFundsMoved: false;
  rawTransactionDataIncluded: false;
  sandboxOnly: true;
  scoreAuthoritative: false;
  schemaVersion: "credit_state_projection.v1";
}

export interface OwnedCreditStateViewResponse {
  creditState: CreditStateProjection;
  asOf: string;
  schemaVersion: "tenant_owned_credit_state_view.v1";
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

export interface CreditPassportReasonLineage {
  reasonCode: string;
  featureKeys: string[];
  sourceRoles: string[];
}

export interface CreditPassportEvidenceLineage {
  kind: "evidence" | "risk_state_attestation";
  role: string;
  evidenceHash: string;
  entityHash: string;
  aggregateVersion: number;
  sourceFinality: "finalized";
}

export interface CreditPassportDisclosure {
  claim: CreditPassportClaim;
  grade: "verified" | "not_verified" | "not_applicable" | "not_disclosed";
  value:
    | null
    | string
    | string[]
    | CreditPassportReasonLineage[]
    | CreditPassportEvidenceLineage[];
  reasonCodes: string[];
  reasonLineage: CreditPassportReasonLineage[];
  evidenceLineage: CreditPassportEvidenceLineage[];
}

export interface CreditPassportArtifact {
  creditPassportArtifactId: string;
  artifactHash: string;
  sourceRiskDecisionId: string;
  sourceRiskDecisionPassportId: string;
  sourceDecisionHash: string;
  sourceDecisionPassportHash: string;
  sourceFeatureSnapshotHash: string;
  subjectId: string;
  authorityType: "consent" | "mandate";
  controllerActorRefHash: string;
  verifierActorRefHash: string;
  purpose: "private_credit_review";
  selectedClaims: CreditPassportClaim[];
  disclosures: CreditPassportDisclosure[];
  claimManifestHash: string;
  issuer: {
    type: "ipo_one_tenant_gateway";
    version: "ipo-one-credit-passport-local-no-funds.v1";
  };
  issuedAt: string;
  expiresAt: string;
  status: "active" | "revoked";
  effectiveStatus: "active" | "revoked" | "expired" | "superseded";
  version: number;
  supersedesArtifactHash?: string;
  supersedesVersion?: number;
  revokedAt?: string;
  revocationReasonCode?:
    | "owner_withdrawal"
    | "verifier_access_no_longer_required"
    | "source_disclosure_error"
    | "security_concern";
  onlineVerificationRequired: true;
  sameTenantOnly: true;
  pointInTime: true;
  nonAuthorizing: true;
  sandboxOnly: true;
  productionAuthority: false;
  piiIncluded: false;
  rawTransactionDataIncluded: false;
  scoreAuthoritative: false;
  asOf: string;
  schemaVersion: "credit_passport_artifact.v1";
}

export interface CreditPassportArtifactCreatedResponse {
  artifact: CreditPassportArtifact;
  replaced: boolean;
  schemaVersion: "tenant_credit_passport_artifact_created.v1";
}

export interface OwnedCreditPassportArtifactViewResponse {
  artifact: CreditPassportArtifact;
  schemaVersion: "tenant_owned_credit_passport_artifact_view.v1";
}

export interface CreditPassportVerificationResultResponse {
  verification: {
    verified: boolean;
    status: "active" | "revoked" | "expired" | "superseded";
    sourceCurrent: boolean;
    checkedAt: string;
    artifactHash: string;
    artifactVersion: number;
    onlineVerificationRequired: true;
    schemaVersion: "credit_passport_verification.v1";
  };
  artifact?: CreditPassportArtifact;
  schemaVersion: "tenant_credit_passport_verification_result.v1";
}

export interface CreditPassportArtifactRevokedResponse {
  artifact: CreditPassportArtifact;
  schemaVersion: "tenant_credit_passport_artifact_revoked.v1";
}

export interface CapitalPartnerCreditOffer {
  creditOfferId: string;
  creditOfferHash: string;
  termsHash: string;
  creditIntentId: string;
  subjectId: string;
  riskDecisionId: string;
  capitalPartnerId: string;
  capitalPartnerOperatorId: string;
  creditPassportArtifactId: string;
  creditPassportArtifactHash: string;
  creditPassportArtifactVersion: number;
  passportVerificationHash: string;
  underwritingSnapshotHash: string;
  assetId: string;
  facilityLimitMinor: string;
  approvedPrincipalMinor: string;
  perDrawCapMinor: string;
  annualRateBps: number;
  originationFeeMinor: string;
  repaymentFrequency: RepaymentFrequency;
  installmentCount: number;
  firstPaymentAt: string;
  maturityAt: string;
  permittedPurposeCode: string;
  conditions: CapitalPartnerOfferCondition[];
  undrawnRevocationRule:
    | "capital_partner_before_acceptance"
    | "irrevocable_until_expiry";
  disclosureRef: string;
  termsVersion: "credit_terms.v2";
  validUntil: string;
  reasonCodes: string[];
  sandboxOnly: true;
  productionFundsApproved: false;
  status: "offered" | "accepted" | "declined" | "expired" | "withdrawn" | "superseded";
  acceptanceId?: string;
  acceptedAt?: string;
  supersedingOfferId?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: "credit_offer.v2";
}

export interface CapitalPartnerOfferAuthoredResponse {
  offer: CapitalPartnerCreditOffer;
  capitalPartner: {
    capitalPartnerId: string;
    displayName: string;
  };
  fundsAuthority: false;
  schemaVersion: "tenant_capital_partner_offer_authored.v1";
}

export interface CapitalPartnerOfferTransitionedResponse {
  offer: CapitalPartnerCreditOffer;
  schemaVersion: "tenant_capital_partner_offer_transitioned.v1";
}

export interface CapitalPartnerFacilityViewResponse {
  facility: {
    facilityId: string;
    capitalPartnerId: string;
    creditOfferId: string;
    obligationId: string;
    subjectId: string;
    assetId: string;
    facilityLimitMinor: string;
    utilizedMinor: string;
    outstandingMinor: string;
    repaidMinor: string;
    availableMinor: string;
    status: string;
    servicingClassification: string;
    daysPastDue: number;
    nextPayment: Record<string, unknown> | null;
    scheduleHash: string;
    evidenceCoverage: Record<string, unknown>;
    asOf: string;
    sandboxOnly: true;
    productionFundsMoved: false;
    schemaVersion: "facility_view.v1";
  };
  schemaVersion: "tenant_capital_partner_facility_view.v1";
}

export interface CapitalPartnerSelfViewResponse {
  resource: {
    resourceType: "capital_partner_profile";
    resourceId: string;
  };
  profile: {
    capitalPartnerId: string;
    displayName: string;
  };
  fundsAuthority: false;
  serverTruth: true;
  readOnly: true;
  schemaVersion: "tenant_capital_partner_self_view.v1";
}

export interface CapitalPartnerPassportInboxViewResponse {
  items: Array<{
    resource: {
      resourceType: "credit_passport_artifact";
      resourceId: string;
    };
    reviewContext: {
      creditIntentId: string;
      artifactHash: string;
      artifactVersion: number;
    };
    summary: {
      claimCount: number;
      purpose: "private_credit_review";
      issuedAt: string;
      expiresAt: string;
    };
  }>;
  count: number;
  hasMore: false;
  fundsAuthority: false;
  serverTruth: true;
  readOnly: true;
  schemaVersion: "tenant_capital_partner_passport_inbox_view.v1";
}

export interface CapitalPartnerPortfolioViewResponse {
  profile: {
    capitalPartnerId: string;
    displayName: string;
    operatorActorId: string;
    tenantId: string;
    sandboxOnly: true;
    productionFundsAuthority: false;
    schemaVersion: "capital_partner_profile.v1";
    [key: string]: unknown;
  };
  portfolio: {
    capitalPartnerId: string;
    committedMinor: string;
    availableMinor: string;
    utilizedMinor: string;
    outstandingMinor: string;
    repaidMinor: string;
    overdueMinor: string;
    writtenOffMinor: string;
    offers: Array<Record<string, unknown> & {
      creditOfferId: string;
      creditIntentId: string;
      status: "offered" | "accepted" | "declined" | "expired" | "withdrawn" | "superseded";
    }>;
    facilities: Array<Record<string, unknown>>;
    schemaVersion: "capital_partner_portfolio.v1";
    [key: string]: unknown;
  };
  schemaVersion: "tenant_capital_partner_portfolio_view.v1";
}

export interface OfficialReportArtifact {
  officialReportId: string;
  reportKind: "obligation_activity";
  format: "json" | "csv";
  contentType: "application/json" | "text/csv; charset=utf-8";
  fileName: string;
  contentSha256: string;
  artifactHash: string;
  sourceObligationId: string;
  sourceEvidenceCount: number;
  sourceEvidenceHeadHash: string;
  sourceEvidenceTailHash: string;
  controllerActorRefHash: string;
  generatedAt: string;
  expiresAt: string;
  status: "active" | "revoked";
  effectiveStatus: "active" | "expired" | "revoked";
  version: 1 | 2;
  revokedAt?: string;
  revocationReasonCode?: "owner_withdrawal" | "source_disclosure_error" | "security_concern";
  authorizationRevalidationRequired: true;
  objectAccessExpires: true;
  signedUrlIssued: false;
  sameTenantOnly: true;
  sandboxOnly: true;
  productionAuthority: false;
  piiIncluded: false;
  secretsIncluded: false;
  rawTransactionDataIncluded: false;
  browserAuthored: false;
  feeAuditPolicy: {
    schemaVersion: "fee_audit_policy.v1";
    availability: "unavailable";
    productionPolicyAvailable: false;
    feeCalculationAuthorized: false;
    principalAsFeeBaseAllowed: false;
    unrealizedPnlAsFeeBaseAllowed: false;
    reasonCode: "production_fee_policy_not_approved";
  };
  asOf: string;
  schemaVersion: "official_report_artifact.v1";
}

export interface OfficialReportCreatedResponse {
  report: OfficialReportArtifact;
  schemaVersion: "tenant_official_report_created.v1";
}

export interface OfficialReportViewResponse {
  report: OfficialReportArtifact;
  schemaVersion: "tenant_official_report_view.v1";
}

export interface OfficialReportRetrievalResponse {
  report: OfficialReportArtifact;
  contentBase64: string;
  integrityVerified: true;
  authorizationRevalidatedAt: string;
  schemaVersion: "tenant_official_report_retrieval.v1";
}

export interface OfficialReportRevokedResponse {
  report: OfficialReportArtifact;
  schemaVersion: "tenant_official_report_revoked.v1";
}

export interface TradingCreditProfile {
  tradingCreditProfileId: string;
  subjectId: string;
  principalId: string;
  subjectType: "human" | "agent";
  operatorType: "human_trader" | "agent_operator";
  requestedByActorHash: string;
  accountReferenceHash: string;
  stage: "challenge_pending" | "history_imported" | "finalized";
  bindingChallenge: {
    challengeId: string;
    challengeHash: string;
    nonceHash: string;
    issuedAt: string;
    expiresAt: string;
    status: "pending" | "consumed";
    consumedAt?: string;
    oneUse: true;
    bindingMethod: "synthetic_no_funds_fixture";
    accountOwnershipVerified: false;
    reusableSignatureIncluded: false;
  };
  historyImport?: {
    historyImportId: string;
    historyHash: string;
    sourceType: "synthetic_fixture";
    fixtureId: "tc_synthetic_human_history_v1" | "tc_synthetic_agent_history_v1";
    dataQuality: {
      completeness: "complete";
      confidence: "synthetic_only";
      freshness: "unknown";
      stalenessReason: "external_venue_not_queried";
      sourceFinality: "synthetic_final";
      selfReportedSignalsAccepted: false;
    };
    importedAt: string;
  };
  evidenceSnapshot?: {
    evidenceSnapshotId: string;
    snapshotHash: string;
    sourceProjectionHash: string;
    sourceEventIds: readonly [string, string];
    sourceEvidenceHashes: readonly [string, string];
    sourceFinality: "finalized";
    pointInTime: true;
    finalizedAt: string;
  };
  factorScorecard?: {
    scorecardId: string;
    scorecardHash: string;
    factors: readonly unknown[];
    compositeScore: { available: false; reasonCode: "universal_score_prohibited" };
    creditDecision: { performed: false; reasonCode: "credit_approval_out_of_scope" };
    recommendedLimit: { available: false; reasonCode: "risk_limit_not_approved" };
    pricing: { available: false; reasonCode: "pricing_not_approved" };
    newRiskAuthority: false;
    fundsAuthority: false;
  };
  version: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
  sandboxOnly: true;
  syntheticOnly: true;
  productionAuthority: false;
  fundsAuthority: false;
  creditApproval: false;
  universalScoreAvailable: false;
  externalSystemQueried: false;
  rawStrategyIncluded: false;
  rawTransactionsIncluded: false;
  piiIncluded: false;
  secretsIncluded: false;
  schemaVersion: "trading_credit_profile.v1";
}

export interface TradingCreditProfileResponse {
  profile: TradingCreditProfile;
  schemaVersion:
    | "tenant_trading_account_binding_challenge_created.v1"
    | "tenant_trading_history_imported.v1"
    | "tenant_trading_evidence_snapshot_finalized.v1"
    | "tenant_trading_credit_profile_view.v1";
}

export interface TradingRealShadowRiskFeature {
  featureId:
    | "net_realized_pnl"
    | "net_return_on_traded_notional"
    | "positive_realized_fill_rate"
    | "fee_to_traded_notional"
    | "market_count"
    | "traded_notional"
    | "current_withdrawable_ratio"
    | "current_position_count"
    | "current_open_order_count"
    | "risk_adjusted_return"
    | "maximum_drawdown"
    | "tail_loss"
    | "current_leverage"
    | "liquidation_discipline"
    | "strategy_capacity"
    | "regime_stability";
  state: "observed" | "insufficient" | "unknown" | "stale";
  value?: string;
  unit?: "venue_quote_asset" | "ratio" | "count";
  reasonCodes: readonly string[];
  authorizing: false;
  definitionVersion: `trading_shadow_feature.${string}.v1`;
}

export interface TradingRealShadowRiskProfile {
  shadowRiskProfileId: string;
  shadowRiskProfileHash: `0x${string}`;
  policyVersion: "trading_real_shadow_risk_policy.v1";
  featureDefinitionsVersion: "trading_shadow_feature_definitions.v1";
  historyHash: `0x${string}`;
  evidenceSnapshotHash: `0x${string}`;
  pointInTime: {
    observedStartsAt: string;
    observedEndsAt: string;
    generatedAt: string;
    sourceFreshness: "fresh" | "stale";
    temporalState: "unknown" | "stale";
    maxAgePolicyApproved: false;
    antiLeakagePassed: true;
    reasonCodes: readonly string[];
    schemaVersion: "trading_shadow_point_in_time.v1";
  };
  features: readonly TradingRealShadowRiskFeature[];
  stressWindows: readonly {
    windowId: "observed_history" | "out_of_time" | "tail_stress";
    state: "observed" | "insufficient";
    startsAt: string | null;
    endsAt: string | null;
    reasonCodes: readonly string[];
  }[];
  driftMonitor: {
    state: "insufficient";
    priorSnapshotAvailable: false;
    approvedBaselineAvailable: false;
    reasonCodes: readonly string[];
    authorizing: false;
    schemaVersion: "trading_shadow_drift_monitor.v1";
  };
  modelOutput: false;
  recommendationOnly: true;
  authorizing: false;
  economicStateMutation: false;
  newRiskAuthority: false;
  fundsAuthority: false;
  schemaVersion: "trading_real_shadow_risk_profile.v1";
}

export interface TradingRealFactorScorecardV2 {
  scorecardId: string;
  scorecardHash: `0x${string}`;
  policyVersion: "trading_real_shadow_risk_policy.v1";
  factors: readonly {
    factorId:
      | "alpha_quality"
      | "risk_reliability"
      | "strategy_capacity"
      | "mandate_compliance"
      | "evidence_confidence";
    assessment: "limited" | "insufficient";
    reasonCodes: readonly string[];
    inputMetricIds: readonly string[];
    numericScoreAvailable: false;
    authorizing: false;
    schemaVersion: "trading_factor_assessment.v1";
  }[];
  shadowRisk: TradingRealShadowRiskProfile;
  compositeScore: {
    available: false;
    reasonCode: "universal_score_prohibited";
  };
  creditDecision: {
    performed: false;
    reasonCode: "single_snapshot_capital_decision_prohibited";
  };
  recommendedLimit: {
    available: false;
    reasonCode: "risk_limit_not_approved";
  };
  pricing: { available: false; reasonCode: "pricing_not_approved" };
  newRiskAuthority: false;
  fundsAuthority: false;
  generatedAt: string;
  schemaVersion: "trading_real_factor_scorecard.v2";
}

export interface TradingRealCreditProfile {
  tradingCreditProfileId: string;
  subjectId: string;
  principalId: string;
  subjectType: "human" | "agent";
  operatorType: "human_trader" | "agent_operator";
  requestedByActorHash: `0x${string}`;
  accountReferenceHash: `0x${string}`;
  bindingEpoch: number;
  stage: "challenge_pending" | "history_imported" | "finalized";
  bindingChallenge: {
    challengeId: string;
    challengeHash: `0x${string}`;
    nonceHash: `0x${string}`;
    typedDataHash: `0x${string}`;
    tenantHash: `0x${string}`;
    subjectHash: `0x${string}`;
    principalHash: `0x${string}`;
    masterAddressHash: `0x${string}`;
    subaccountAddressHash: `0x${string}`;
    chainId: "eip155:998";
    environment: "hyperliquid_testnet";
    infoProfileId: "hyperliquid_testnet_info.v1";
    bindingEpoch: number;
    issuedAt: string;
    expiresAt: string;
    status: "pending" | "consumed";
    consumedAt?: string;
    oneUse: true;
    bindingMethod: "eip712_eoa_master_v1";
    accountOwnershipVerified: boolean;
    relationshipVerified: boolean;
    reusableSignatureIncluded: false;
    rawSignaturePersisted: false;
    schemaVersion: "trading_real_binding_challenge.v1";
  };
  accountBinding?: Readonly<Record<string, unknown>>;
  historyImport?: Readonly<Record<string, unknown>>;
  evidenceSnapshot?: Readonly<Record<string, unknown>>;
  factorScorecard?:
    | Readonly<Record<string, unknown>>
    | TradingRealFactorScorecardV2;
  evidenceAuthority: {
    bindingEpoch: number;
    active: boolean;
    authorizing: false;
    scope?: "read_only_evidence_reference";
    evidenceSnapshotHash?: `0x${string}`;
    activatedAt?: string;
    reasonCode: string;
    schemaVersion: "trading_evidence_authority.v1";
  };
  priorEvidenceInvalidation?: Readonly<Record<string, unknown>>;
  version: number;
  createdAt: string;
  updatedAt: string;
  sandboxOnly: true;
  syntheticOnly: false;
  testnetOnly: true;
  realFunds: false;
  productionAuthority: false;
  fundsAuthority: false;
  creditApproval: false;
  universalScoreAvailable: false;
  externalSystemQueried: boolean;
  rawStrategyIncluded: false;
  rawTransactionsIncluded: false;
  piiIncluded: false;
  secretsIncluded: false;
  schemaVersion: "trading_credit_profile.v2";
}

export interface HyperliquidBindingRequest {
  typedData: Readonly<{
    domain: Readonly<{
      name: "IPO.ONE Hyperliquid Account Binding";
      version: "1";
      chainId: 998;
    }>;
    types: Readonly<Record<string, readonly Readonly<{
      name: string;
      type: string;
    }>[]>>;
    primaryType: "HyperliquidAccountBindingProof";
    message: Readonly<Record<string, string>>;
  }>;
  typedDataHash: `0x${string}`;
  chainId: "eip155:998";
  environment: "hyperliquid_testnet";
  expiresAt: string;
  reusableSignature: false;
  schemaVersion: "hyperliquid_binding_typed_data.v1";
}

export interface TradingRealBindingChallengeResponse {
  profile: TradingRealCreditProfile;
  bindingRequest: HyperliquidBindingRequest;
  schemaVersion: "tenant_trading_account_binding_challenge_created.v2";
}

export interface TradingRealCreditProfileResponse {
  profile: TradingRealCreditProfile;
  schemaVersion:
    | "tenant_trading_history_imported.v2"
    | "tenant_trading_evidence_snapshot_finalized.v2"
    | "tenant_trading_credit_profile_view.v2";
}

export interface TradingNoFundsTerms {
  templateType: TradingCapitalTemplateType;
  syntheticPrincipalMinor: string;
  assetId: "urn:ipo-one:sandbox-asset:usd-cent";
  durationDays: number;
  repaymentMode:
    | "synthetic_fixed_credit"
    | "synthetic_performance_participation"
    | "synthetic_hybrid";
  fixedReturnBps: number;
  performanceParticipationBps: number;
  economicPolicyVersion: "trading_no_funds_template_policy.v1";
  termsHash: string;
  illustrativeOnly: true;
  immutable: true;
  realPrice: false;
  fundsAuthority: false;
  schemaVersion: "trading_no_funds_template_terms.v1";
}

export interface TradingCapitalRequest {
  tradingCapitalRequestId: string;
  requestHash: string;
  subjectId: string;
  principalId: string;
  subjectType: "human" | "agent";
  operatorType: "human_trader" | "agent_operator";
  tradingCreditProfileId: string;
  evidenceEligibility: Record<string, unknown>;
  requestedByActorHash: string;
  templateType: TradingCapitalTemplateType;
  strategyClass: TradingStrategyClass;
  assetId: "urn:ipo-one:sandbox-asset:usd-cent";
  requestedAmountMinor: string;
  durationDays: number;
  termsBlueprint: TradingNoFundsTerms;
  status: "open";
  version: 1;
  createdAt: string;
  expiresAt: string;
  riskClassCallerSupplied: false;
  autoMatch: false;
  autoAccept: false;
  sandboxOnly: true;
  syntheticOnly: true;
  productionAuthority: false;
  fundsAuthority: false;
  realPricing: false;
  realFunding: false;
  externalSystemQueried: false;
  piiIncluded: false;
  secretsIncluded: false;
  schemaVersion: "trading_capital_request.v1";
}

export interface TradingProviderMandate {
  tradingProviderMandateId: string;
  mandateHash: string;
  providerId: string;
  providerHash: string;
  providerActorHash: string;
  supportedTemplateTypes: TradingCapitalTemplateType[];
  allowedSubjectTypes: ("human" | "agent")[];
  allowedStrategyClasses: TradingStrategyClass[];
  assetId: "urn:ipo-one:sandbox-asset:usd-cent";
  minAmountMinor: string;
  maxAmountMinor: string;
  minDurationDays: number;
  maxDurationDays: number;
  evidenceEligibilityClass: "synthetic_restricted";
  createdAt: string;
  expiresAt: string;
  policyVersion: "trading_matching_policy.v1";
  status: "open";
  version: 1;
  hardFiltersOnly: true;
  selfDeclaredRiskClassAccepted: false;
  providerRankingAuthority: false;
  autoAccept: false;
  sandboxOnly: true;
  syntheticOnly: true;
  productionAuthority: false;
  fundsAuthority: false;
  realPricing: false;
  realFunding: false;
  externalSystemQueried: false;
  piiIncluded: false;
  secretsIncluded: false;
  schemaVersion: "trading_provider_mandate.v1";
}

export interface TradingMatchAcceptance {
  acceptanceId: string;
  actorHash: string;
  proposalHash: string;
  termsHash: string;
  acceptedAt: string;
  exactTerms: true;
  automatic: false;
  fundsAuthority: false;
  schemaVersion:
    | "trading_match_provider_acceptance.v1"
    | "trading_match_subject_acceptance.v1";
}

export interface TradingMatchProposal {
  tradingMatchProposalId: string;
  proposalHash: string;
  capitalRequestId: string;
  requestHash: string;
  requestVersion: 1;
  providerMandateId: string;
  mandateHash: string;
  mandateVersion: 1;
  subjectId: string;
  principalId: string;
  subjectType: "human" | "agent";
  providerId: string;
  subjectActorHash: string;
  providerActorHash: string;
  compatibilityHash: string;
  termsHash: string;
  createdAt: string;
  expiresAt: string;
  matchingPolicyVersion: "trading_matching_policy.v1";
  terms: TradingNoFundsTerms;
  hardFilterReasonCodes: string[];
  status:
    | "proposed"
    | "provider_accepted"
    | "subject_accepted"
    | "bilaterally_accepted";
  providerAcceptance: TradingMatchAcceptance | null;
  subjectAcceptance: TradingMatchAcceptance | null;
  version: 1 | 2 | 3;
  updatedAt: string;
  immutableTerms: true;
  autoAccepted: false;
  bilateralAcceptanceRequired: true;
  requestAndMandateRevalidationRequired: true;
  sandboxOnly: true;
  syntheticOnly: true;
  productionAuthority: false;
  fundsAuthority: false;
  realPricing: false;
  realFunding: false;
  externalSystemQueried: false;
  piiIncluded: false;
  secretsIncluded: false;
  schemaVersion: "trading_match_proposal.v1";
}

export interface TradingCompatibleMandate {
  providerMandateId: string;
  mandateHash: string;
  mandateVersion: 1;
  providerReferenceHash: string;
  compatibilityHash: string;
  hardFilterReasonCodes: string[];
  rank: number;
  rankReason: "hard_filters_then_created_at_mandate_hash_and_id";
  termsPreview: TradingNoFundsTerms;
  autoAccepted: false;
  fundsAuthority: false;
  schemaVersion: "trading_compatible_mandate.v1";
}

export interface TradingCapitalRequestCreatedResponse {
  capitalRequest: TradingCapitalRequest;
  schemaVersion: "tenant_trading_capital_request_created.v1";
}

export interface TradingProviderMandateCreatedResponse {
  providerMandate: TradingProviderMandate;
  schemaVersion: "tenant_trading_provider_mandate_created.v1";
}

export interface TradingCompatibleMandateListResponse {
  tradingCapitalRequestId: string;
  requestHash: string;
  requestVersion: 1;
  evaluatedCandidateCount: number;
  compatibleMandateCount: number;
  matches: TradingCompatibleMandate[];
  hardFiltersAppliedBeforeRanking: true;
  rankingAuthorizing: false;
  providerIdentityEnumerated: false;
  crossTenantDiscovery: false;
  asOf: string;
  sandboxOnly: true;
  productionAuthority: false;
  fundsAuthority: false;
  schemaVersion: "trading_compatible_mandate_list.v1";
}

export interface TradingMatchProposalResponse {
  matchProposal: TradingMatchProposal;
  schemaVersion:
    | "tenant_trading_match_proposal_created.v1"
    | "tenant_trading_match_provider_accepted.v1"
    | "tenant_trading_match_subject_accepted.v1";
}

export interface TradingFacilitySafety {
  sandboxOnly: true;
  syntheticOnly: true;
  nonRedeemable: true;
  withdrawable: false;
  transferable: false;
  externalSystemQueried: false;
  externalOrderSubmitted: false;
  productionAuthority: false;
  fundsAuthority: false;
  realCollateral: false;
  realFunding: false;
  realEquity: false;
  realPricing: false;
  productionFundsMoved: false;
  piiIncluded: false;
  secretsIncluded: false;
}

export type TradingFacilityLifecycleStatus =
  | "awaiting_contributions"
  | "awaiting_subject_collateral"
  | "awaiting_provider_funding"
  | "ready_for_activation"
  | "active"
  | "flattened";

export type TradingFacilityRiskState =
  | "NORMAL"
  | "WARNING"
  | "REDUCE_ONLY"
  | "FLATTEN"
  | "SETTLEMENT";

export interface TradingFacility extends TradingFacilitySafety {
  tradingFacilityId: string;
  facilityHash: string;
  stateHash: string;
  matchProposalId: string;
  proposalHash: string;
  proposalVersion: 3;
  obligationId: string;
  obligationHash: string;
  subjectId: string;
  principalId: string;
  providerId: string;
  subjectActorHash: string;
  providerActorHash: string;
  templateType: TradingCapitalTemplateType;
  termsHash: string;
  assetId: "urn:ipo-one:sandbox-asset:usd-cent";
  syntheticPrincipalMinor: string;
  requiredSubjectCollateralMinor: string;
  requiredProviderFundingMinor: string;
  subjectCollateralMinor: string;
  providerFundingMinor: string;
  syntheticCapitalMinor: string;
  syntheticExposureMinor: string;
  syntheticEquityMinor: string;
  openOrderCount: number;
  subjectCollateralRecorded: boolean;
  providerFundingRecorded: boolean;
  lifecycleStatus: TradingFacilityLifecycleStatus;
  riskState: TradingFacilityRiskState;
  riskReasonCodes: string[];
  latestRiskEvaluationId: string | null;
  latestRiskEvaluationHash: string | null;
  riskObservation: Record<string, unknown>;
  activationDeadlineAt: string;
  maturityAt: string;
  activatedAt: string | null;
  flattenedAt: string | null;
  linkedCanonicalObligation: true;
  secondLedgerCreated: false;
  callerEquityAccepted: false;
  createdByActorHash: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  facilityPolicyVersion: "trading_no_funds_facility_policy.v1";
  riskPolicyVersion: "trading_shadow_risk_policy.v1";
  schemaVersion: "trading_facility.v1";
}

export interface TradingOrderIntent extends TradingFacilitySafety {
  tradingOrderIntentId: string;
  orderIntentHash: string;
  orderStateHash: string;
  facilityId: string;
  facilityHash: string;
  subjectId: string;
  principalId: string;
  submittedByActorHash: string;
  direction: "long" | "short";
  syntheticNotionalMinor: string;
  createdAt: string;
  orderPolicyVersion: "trading_no_funds_facility_policy.v1";
  status: "open" | "canceled" | "flattened";
  cancelReasonCode: string | null;
  canceledAt: string | null;
  flattenedAt: string | null;
  version: 1 | 2;
  updatedAt: string;
  serverRiskEvaluated: true;
  rawVenueActionAccepted: false;
  schemaVersion: "trading_order_intent.v1";
}

export interface TradingFacilityRiskEvaluation extends TradingFacilitySafety {
  tradingFacilityRiskEvaluationId: string;
  evaluationHash: string;
  facilityId: string;
  facilityHash: string;
  facilityVersionBefore: number;
  facilityStateHashBefore: string;
  observationHash: string;
  previousRiskState: TradingFacilityRiskState;
  evaluatedRiskState: TradingFacilityRiskState;
  freshness: "fresh" | "stale" | "unknown";
  reasonCodes: string[];
  syntheticCapitalMinor: string;
  syntheticExposureMinor: string;
  syntheticEquityMinor: string;
  utilizationBps: number;
  evaluatorActorHash: string;
  evaluatedAt: string;
  riskPolicyVersion: "trading_shadow_risk_policy.v1";
  monotonicProtection: true;
  authorizing: false;
  callerEquityAccepted: false;
  automaticRecovery: false;
  schemaVersion: "trading_facility_risk_evaluation.v1";
}

export interface TradingFacilityResponse {
  facility: TradingFacility;
  schemaVersion:
    | "tenant_trading_facility_created.v1"
    | "tenant_trading_subject_collateral_recorded.v1"
    | "tenant_trading_provider_funding_recorded.v1"
    | "tenant_trading_facility_activated.v1"
    | "tenant_trading_facility_new_risk_paused.v1";
}

export interface TradingFacilityOrderResponse {
  facility: TradingFacility;
  orderIntent: TradingOrderIntent;
  schemaVersion:
    | "tenant_trading_order_intent_submitted.v1"
    | "tenant_trading_order_intent_canceled.v1";
}

export interface TradingFacilityStateResponse {
  facility: TradingFacility;
  orderIntents: TradingOrderIntent[];
  page: { count: number; limit: 20; truncated: false };
  schemaVersion: "trading_facility_state.v1";
}

export interface TradingFacilityRiskResponse {
  facility: TradingFacility;
  riskEvaluation: TradingFacilityRiskEvaluation;
  schemaVersion: "tenant_trading_facility_risk_evaluated.v1";
}

export interface TradingFacilityFlattenResponse {
  facility: TradingFacility;
  flattenedOrderIntents: TradingOrderIntent[];
  schemaVersion: "tenant_trading_facility_flattened.v1";
}

export interface TradingFacilityCloseRequest extends TradingFacilitySafety {
  tradingFacilityCloseRequestId: string;
  requestHash: string;
  facilityId: string;
  facilityHash: string;
  facilityStateHash: string;
  facilityVersion: number;
  obligationId: string;
  obligationHash: string;
  subjectId: string;
  principalId: string;
  providerId: string;
  subjectActorHash: string;
  providerActorHash: string;
  requestedByActorHash: string;
  reasonCode: "operator_request";
  status: "requested";
  immutable: true;
  requestedAt: string;
  version: 1;
  closePolicyVersion: "trading_no_funds_conservation_settlement_policy.v1";
  schemaVersion: "trading_facility_close_request.v1";
}

export interface TradingSettlement extends TradingFacilitySafety {
  tradingSettlementId: string;
  settlementHash: string;
  closeRequestId: string;
  closeRequestHash: string;
  facilityId: string;
  facilityHash: string;
  facilityStateHashBefore: string;
  facilityVersionBefore: number;
  facilityStateHashAfter: string;
  facilityVersionAfter: number;
  obligationId: string;
  obligationHash: string;
  subjectId: string;
  principalId: string;
  providerId: string;
  assetId: "urn:ipo-one:sandbox-asset:usd-cent";
  finalSyntheticEquityMinor: string;
  subjectContributionMinor: string;
  providerContributionMinor: string;
  subjectReturnMinor: string;
  providerPrincipalReturnMinor: string;
  realizedPnlMinor: "0";
  venueCostMinor: "0";
  closingCostMinor: "0";
  fixedReturnMinor: "0";
  performanceParticipationMinor: "0";
  ipoOneFeeMinor: "0";
  totalAllocatedMinor: string;
  waterfallBalanced: true;
  zeroExposureVerified: true;
  canonicalObligationUnchanged: true;
  canonicalLedgerMutationCreated: false;
  secondLedgerCreated: false;
  officialSettlement: false;
  status: "finalized";
  version: 1;
  settledByActorHash: string;
  settledAt: string;
  settlementPolicyVersion: "trading_no_funds_conservation_settlement_policy.v1";
  schemaVersion: "trading_settlement.v1";
}

export interface TradingPerformanceProofClaims {
  facilityFinalized: true;
  zeroExposure: true;
  contributionConservation: true;
  canonicalObligationLinked: true;
  realProfitClaimed: false;
  finalSyntheticEquityMinor: string;
  subjectReturnMinor: string;
  providerPrincipalReturnMinor: string;
  realizedPnlMinor: "0";
  ipoOneFeeMinor: "0";
}

export interface TradingPerformanceProof extends TradingFacilitySafety {
  tradingPerformanceProofId: string;
  proofHash: string;
  settlementId: string;
  settlementHash: string;
  facilityId: string;
  facilityHash: string;
  obligationId: string;
  obligationHash: string;
  subjectId: string;
  principalId: string;
  providerId: string;
  claims: TradingPerformanceProofClaims;
  claimSetHash: string;
  status: "active";
  proofVersion: 1;
  revocable: true;
  revoked: false;
  externalVerificationAvailable: false;
  officialReport: false;
  universalScore: false;
  strategyDataIncluded: false;
  rawHistoryIncluded: false;
  issuedByActorHash: string;
  issuedAt: string;
  expiresAt: string;
  proofPolicyVersion: "trading_performance_proof_policy.v1";
  schemaVersion: "trading_performance_proof.v1";
}

export interface TradingFacilityCloseResponse {
  closeRequest: TradingFacilityCloseRequest;
  schemaVersion: "tenant_trading_facility_close_requested.v1";
}

export interface TradingSettlementFinalizedResponse {
  facility: TradingFacility;
  settlement: TradingSettlement;
  schemaVersion: "tenant_trading_settlement_finalized.v1";
}

export interface TradingSettlementViewResponse {
  settlement: TradingSettlement;
  schemaVersion: "trading_settlement_view.v1";
}

export interface TradingPerformanceProofResponse {
  performanceProof: TradingPerformanceProof;
  schemaVersion: "tenant_trading_performance_proof_issued.v1";
}

export interface TradingFacilityEvidenceSummary {
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
  schemaVersion: "trading_facility_evidence_summary.v1";
}

export interface TradingFacilityEvidenceResponse {
  facility: TradingFacility;
  closeRequest: TradingFacilityCloseRequest | null;
  settlement: TradingSettlement | null;
  performanceProof: TradingPerformanceProof | null;
  items: TradingFacilityEvidenceSummary[];
  page: { count: number; limit: 50; truncated: false };
  asOf: string;
  strategyDataIncluded: false;
  rawHistoryIncluded: false;
  piiIncluded: false;
  sandboxOnly: true;
  syntheticOnly: true;
  nonRedeemable: true;
  productionAuthority: false;
  fundsAuthority: false;
  schemaVersion: "trading_facility_evidence.v1";
}

export interface WalletSafetyFields {
  transactionsAllowed: false;
  sandboxOnly: true;
  productionAuthority: false;
  fundsAuthority: false;
}

export interface ExecutionAccountBindingView {
  accountBindingId: string;
  subjectId: string;
  accountHash: string;
  chainId: "eip155:84532" | "eip155:1952";
  purpose: "execution";
  bindingKind: "execution";
  proofHash: string;
  verificationMethod:
    | "eip712_eoa_v1"
    | "eip1271_eip712_v1"
    | "eip6492_eip712_v1";
  status: "active" | "revoked";
  boundAt: string;
  revokedAt?: string;
  protocolVersion: "1.2";
  createsAuthenticationSession: false;
  createsExecutionAuthority: false;
}

export interface ExecutionAccountBindingChallengeResponse {
  challengeId: string;
  subjectId: string;
  chainId: "eip155:84532" | "eip155:1952";
  accountHash: string;
  purpose: "execution";
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  protocolVersion: "1.2";
  typedDataHash: string;
  typedData: Record<string, unknown>;
  createsAuthenticationSession: false;
  createsExecutionAuthority: false;
  oneUse: true;
  schemaVersion: "tenant_execution_account_binding_challenge_created.v1";
}

export interface ExecutionAccountBindingMutationResponse {
  subjectId: string;
  accountBinding: ExecutionAccountBindingView;
  challengeConsumed?: true;
  authenticationSessionChanged: false;
  executionAuthorityGranted: false;
  productionAuthority?: false;
  schemaVersion:
    | "tenant_execution_account_binding_verified.v1"
    | "tenant_execution_account_binding_revoked.v1";
}

export interface ExecutionAccountBindingsViewResponse {
  subjectId: string;
  accounts: ExecutionAccountBindingView[];
  authenticationSessionChanged: false;
  executionAuthorityGranted: false;
  schemaVersion: "tenant_execution_account_bindings_view.v1";
}

export interface WalletConnectorDescriptor {
  schemaVersion: "evm_wallet_connector_descriptor.v1";
  providerId: string;
  source: "eip6963" | "legacy_eip1193" | "mobile_walletconnect";
  name: string;
  walletTransport: "eip1193" | "walletconnect";
  enabledChains: ["eip155:84532", "eip155:1952"];
  explicitSelectionRequired: true;
  capabilityNegotiated: true;
  rawProviderExposed: false;
  arbitraryCalldataAccepted: false;
  preparedExecutionSubmission: false;
  sandboxOnly: true;
  productionApproved: false;
  fundsAuthority: false;
}

export interface WalletCapabilityDescriptorListResponse extends WalletSafetyFields {
  items: WalletConnectorDescriptor[];
  count: number;
  schemaVersion: "wallet_capability_descriptor_list.v1";
}

export interface WalletGrantResponse extends WalletSafetyFields {
  grantId: string;
  grantHash: string;
  status: "prepared" | "active" | "revoked" | "expired" | "quarantined";
  pendingExposureMinor: string;
  version: number;
  schemaVersion:
    | "tenant_wallet_grant_prepared.v1"
    | "tenant_wallet_grant_activated.v1"
    | "tenant_wallet_grant_view.v1"
    | "tenant_wallet_grant_revoked.v1";
}

export type WalletExecutionDecision = "ALLOW" | "STEP_UP" | "DENY" | "QUARANTINE";

export interface WalletExecutionPreparedResponse extends WalletSafetyFields {
  executionId: string;
  preparedExecutionHash: string;
  exactPayloadHash: string;
  preflightHash: string;
  decision: WalletExecutionDecision;
  expiresAt: string;
  schemaVersion: "tenant_wallet_execution_prepared.v1";
}

export interface WalletExecutionApprovedResponse extends WalletSafetyFields {
  executionId: string;
  preflightHash: string;
  approvalArtifactHash: string;
  status: "recorded_local_no_funds";
  approvedAt: string;
  expiresAt: string;
  submissionAllowed: false;
  schemaVersion: "tenant_wallet_execution_approved.v1";
}

export interface WalletExecutionSubmissionBlockedResponse extends WalletSafetyFields {
  executionId: string;
  preflightHash: string;
  blocked: true;
  reasonCode: "execution_submission_disabled_l0_local_no_funds";
  adapterInvoked: false;
  schemaVersion: "tenant_wallet_execution_submission_blocked.v1";
}

export interface WalletExecutionViewResponse extends WalletSafetyFields {
  executionId: string;
  preparedExecutionHash: string;
  latestPreflightHash: string | null;
  decision: WalletExecutionDecision | null;
  stale: boolean;
  schemaVersion: "tenant_wallet_execution_view.v1";
}

export interface VenueSafetyFields extends WalletSafetyFields {}

export interface VenueCapabilityDescriptorListResponse extends VenueSafetyFields {
  items: Record<string, unknown>[];
  count: number;
  schemaVersion: "venue_capability_descriptor_list.v1";
}

export interface VenueBindingViewResponse extends VenueSafetyFields {
  bindingId: string;
  status: "unverified" | "verified" | "revoked" | "quarantined";
  schemaVersion: "tenant_venue_binding_view.v1";
}

export interface VenueDelegatePreparedResponse extends VenueSafetyFields {
  delegateId: string;
  delegateHash: string;
  status: "prepared";
  activationAllowed: false;
  schemaVersion: "tenant_venue_delegate_prepared.v1";
}

export interface VenueDelegateActivationBlockedResponse extends VenueSafetyFields {
  delegateId: string;
  blocked: true;
  reasonCode: "venue_delegate_activation_disabled_l0_local_no_funds";
  adapterInvoked: false;
  schemaVersion: "tenant_venue_delegate_activation_blocked.v1";
}

export interface VenueDelegateRevocationBlockedResponse extends VenueSafetyFields {
  delegateId: string;
  blocked: true;
  reasonCode: "venue_delegate_revocation_disabled_l0_local_no_funds";
  adapterInvoked: false;
  schemaVersion: "tenant_venue_delegate_revocation_blocked.v1";
}

export interface VenueExecutionPreparedResponse extends VenueSafetyFields {
  executionId: string;
  preparedExecutionHash: string;
  orderIntentHash: string;
  status: "prepared";
  submissionAllowed: false;
  schemaVersion: "tenant_venue_execution_prepared.v1";
}

export interface VenueExecutionSubmissionBlockedResponse extends VenueSafetyFields {
  executionId: string;
  preparedExecutionHash: string;
  blocked: true;
  reasonCode: "venue_execution_submission_disabled_l0_local_no_funds";
  adapterInvoked: false;
  schemaVersion: "tenant_venue_execution_submission_blocked.v1";
}

export interface VenueExecutionViewResponse extends VenueSafetyFields {
  executionId: string;
  preparedExecutionHash: string;
  status: "prepared" | "blocked" | "submitted" | "reconciled" | "quarantined";
  submissionAllowed: false;
  schemaVersion: "tenant_venue_execution_view.v1";
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

export interface SecuredPoolWorkspaceResponse {
  subjectId: string;
  market: Record<string, unknown>;
  position: Record<string, unknown> | null;
  accountBindingAvailable: boolean;
  obligation: Record<string, unknown> | null;
  actions: Record<string, "review_only">;
  submission: {
    state: "unavailable";
    reasonCode: "pool_submission_unavailable";
    recoveryCondition: string;
    transactionHash: null;
    finality: "not_applicable";
  };
  serverDerived: true;
  syntheticOnly: true;
  productionFundsMoved: false;
  schemaVersion: "tenant_secured_pool_workspace.v1";
}

export interface SecuredPoolActionReviewResponse {
  actionType: SecuredPoolActionType;
  amountAssets: string;
  chainId: string | null;
  contractAddress: string | null;
  marketId: string | null;
  position: Record<string, unknown> | null;
  preview: {
    supplySharesDelta: string | null;
    collateralAssetsAfter: string | null;
    debtAssetsAfter: string | null;
    healthAfter: Record<string, unknown> | null;
  };
  blockerReasonCodes: string[];
  reviewedAt: string;
  reviewHash: string;
  reviewState: "blocked_before_submission";
  submittable: false;
  transactionState: "not_submitted";
  finality: "not_applicable";
  recoveryCondition: string;
  syntheticOnly: true;
  productionFundsMoved: false;
  schemaVersion: "tenant_secured_pool_action_review.v1";
}

export interface SecuredPoolRiskViewResponse {
  portfolioId: string;
  market: Record<string, unknown>;
  positionCount: number;
  liquidatablePositionCount: number;
  discrepancyCount: number;
  controls: Record<string, boolean>;
  submission: Record<string, unknown>;
  serverDerived: true;
  syntheticOnly: true;
  productionFundsMoved: false;
  schemaVersion: "tenant_secured_pool_risk_view.v1";
}

export type TenantProtocolResult =
  | TenantProtocolResultBase<"pilotReadOwnSecuredPool", SecuredPoolWorkspaceResponse>
  | TenantProtocolResultBase<"pilotReviewSecuredPoolAction", SecuredPoolActionReviewResponse>
  | TenantProtocolResultBase<"pilotReadSecuredPoolRisk", SecuredPoolRiskViewResponse>
  | TenantProtocolResultBase<"walletPrepareAccountBinding", ExecutionAccountBindingChallengeResponse>
  | TenantProtocolResultBase<"walletSubmitAccountBinding", ExecutionAccountBindingMutationResponse>
  | TenantProtocolResultBase<"walletReadAccountBindings", ExecutionAccountBindingsViewResponse>
  | TenantProtocolResultBase<"walletRevokeAccountBinding", ExecutionAccountBindingMutationResponse>
  | TenantProtocolResultBase<"walletDiscoverCapabilities", WalletCapabilityDescriptorListResponse>
  | TenantProtocolResultBase<"walletPrepareGrant", WalletGrantResponse>
  | TenantProtocolResultBase<"walletActivateGrant", WalletGrantResponse>
  | TenantProtocolResultBase<"walletReadGrant", WalletGrantResponse>
  | TenantProtocolResultBase<"walletRevokeGrant", WalletGrantResponse>
  | TenantProtocolResultBase<"walletPrepareExecution", WalletExecutionPreparedResponse>
  | TenantProtocolResultBase<"walletApproveExecution", WalletExecutionApprovedResponse>
  | TenantProtocolResultBase<"walletSubmitExecution", WalletExecutionSubmissionBlockedResponse>
  | TenantProtocolResultBase<"walletReadExecution", WalletExecutionViewResponse>
  | TenantProtocolResultBase<"venueDiscoverCapabilities", VenueCapabilityDescriptorListResponse>
  | TenantProtocolResultBase<"venueReadBinding", VenueBindingViewResponse>
  | TenantProtocolResultBase<"venuePrepareDelegate", VenueDelegatePreparedResponse>
  | TenantProtocolResultBase<"venueActivateDelegate", VenueDelegateActivationBlockedResponse>
  | TenantProtocolResultBase<"venueRevokeDelegate", VenueDelegateRevocationBlockedResponse>
  | TenantProtocolResultBase<"venuePrepareExecution", VenueExecutionPreparedResponse>
  | TenantProtocolResultBase<"venueSubmitExecution", VenueExecutionSubmissionBlockedResponse>
  | TenantProtocolResultBase<"venueReadExecution", VenueExecutionViewResponse>
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
  | TenantProtocolResultBase<"pilotCreateCreditPassportArtifact", CreditPassportArtifactCreatedResponse>
  | TenantProtocolResultBase<"pilotCreateOfficialReport", OfficialReportCreatedResponse>
  | TenantProtocolResultBase<"pilotEvaluateCreditApplication", CreditApplicationEvaluatedResponse>
  | TenantProtocolResultBase<"pilotPersistAgentContinuationReceipt", AgentContinuationReceiptPersistedResponse>
  | TenantProtocolResultBase<"pilotFreezeSubject", AgentSubjectFrozenResponse>
  | TenantProtocolResultBase<"pilotRequestCredit", CreditIntentCreatedResponse>
  | TenantProtocolResultBase<"pilotReadAgentSelf", AgentSubjectViewResponse>
  | TenantProtocolResultBase<"pilotReadAgentAccountBinding", AgentAccountBindingViewResponse>
  | TenantProtocolResultBase<"pilotReadCreditApplication", CreditApplicationViewResponse>
  | TenantProtocolResultBase<"pilotReadOwnCreditPassportArtifact", OwnedCreditPassportArtifactViewResponse>
  | TenantProtocolResultBase<"pilotReadOfficialReport", OfficialReportViewResponse>
  | TenantProtocolResultBase<"pilotRetrieveOfficialReport", OfficialReportRetrievalResponse>
  | TenantProtocolResultBase<"pilotVerifyCreditPassportArtifact", CreditPassportVerificationResultResponse>
  | TenantProtocolResultBase<"pilotReadConsent", HumanConsentViewResponse>
  | TenantProtocolResultBase<"pilotReadHumanSelf", HumanSubjectViewResponse>
  | TenantProtocolResultBase<"pilotReadWorkspaceResume", WorkspaceResumeViewResponse>
  | TenantProtocolResultBase<"pilotReadTenantRiskPortfolioReference", TenantRiskPortfolioReferenceViewResponse>
  | TenantProtocolResultBase<"pilotReadServicingQueueReference", TenantServicingQueueReferenceViewResponse>
  | TenantProtocolResultBase<"pilotReadIdentityReference", HumanIdentityReferenceViewResponse>
  | TenantProtocolResultBase<"pilotReadMandate", MandateViewResponse>
  | TenantProtocolResultBase<"pilotReadTenantRisk", TenantRiskPortfolioViewResponse>
  | TenantProtocolResultBase<"pilotReadPilotHealth", TenantPilotHealthViewResponse>
  | TenantProtocolResultBase<"pilotReadPilotFeedbackSummary", TenantPilotFeedbackSummaryViewResponse>
  | TenantProtocolResultBase<"pilotReadServicingQueue", TenantServicingQueueViewResponse>
  | TenantProtocolResultBase<"pilotReadEvidence", ObligationEvidenceViewResponse>
  | TenantProtocolResultBase<"pilotReadCreditRegistryEvidence", CreditRegistryEvidenceViewResponse>
  | TenantProtocolResultBase<"pilotReadOwnObligation", OwnedObligationViewResponse>
  | TenantProtocolResultBase<"pilotReadOwnCreditState", OwnedCreditStateViewResponse>
  | TenantProtocolResultBase<"pilotReadOwnObligationEvidence", OwnedObligationEvidenceViewResponse>
  | TenantProtocolResultBase<"pilotReadProviderIntent", ProviderIntentViewResponse>
  | TenantProtocolResultBase<"pilotRevokeConsent", HumanConsentRevokedResponse>
  | TenantProtocolResultBase<"pilotRevokeDraftMandate", DraftMandateRevokedResponse>
  | TenantProtocolResultBase<"pilotRevokeCreditPassportArtifact", CreditPassportArtifactRevokedResponse>
  | TenantProtocolResultBase<"pilotReadCapitalPartnerSelf", CapitalPartnerSelfViewResponse>
  | TenantProtocolResultBase<"pilotReadCapitalPartnerPassportInbox", CapitalPartnerPassportInboxViewResponse>
  | TenantProtocolResultBase<"pilotAuthorCapitalPartnerOffer", CapitalPartnerOfferAuthoredResponse>
  | TenantProtocolResultBase<"pilotTransitionCapitalPartnerOffer", CapitalPartnerOfferTransitionedResponse>
  | TenantProtocolResultBase<"pilotReadCapitalPartnerFacility", CapitalPartnerFacilityViewResponse>
  | TenantProtocolResultBase<"pilotReadCapitalPartnerPortfolio", CapitalPartnerPortfolioViewResponse>
  | TenantProtocolResultBase<"pilotRevokeOfficialReport", OfficialReportRevokedResponse>
  | TenantProtocolResultBase<"pilotSubmitAgentAccountProof", AgentAccountProofVerifiedResponse>
  | TenantProtocolResultBase<"pilotSubmitPilotFeedback", PilotFeedbackRecordedResponse>
  | TenantProtocolResultBase<"workerProcessInbox", ProviderSandboxCallbackResultResponse>
  | TenantProtocolResultBase<"tradingCreateAccountBindingChallenge", TradingRealBindingChallengeResponse>
  | TenantProtocolResultBase<"tradingImportHyperliquidHistory", TradingRealCreditProfileResponse>
  | TenantProtocolResultBase<"tradingFinalizeEvidenceSnapshot", TradingRealCreditProfileResponse>
  | TenantProtocolResultBase<"tradingReadCreditProfile", TradingRealCreditProfileResponse>
  | TenantProtocolResultBase<"tradingCreateCapitalRequest", TradingCapitalRequestCreatedResponse>
  | TenantProtocolResultBase<"tradingCreateProviderMandate", TradingProviderMandateCreatedResponse>
  | TenantProtocolResultBase<"tradingListCompatibleMandates", TradingCompatibleMandateListResponse>
  | TenantProtocolResultBase<"tradingCreateMatchProposal", TradingMatchProposalResponse>
  | TenantProtocolResultBase<"tradingAcceptMatchAsProvider", TradingMatchProposalResponse>
  | TenantProtocolResultBase<"tradingAcceptMatchAsSubject", TradingMatchProposalResponse>
  | TenantProtocolResultBase<"tradingCreateFacility", TradingFacilityResponse>
  | TenantProtocolResultBase<"tradingContributeSubjectCollateral", TradingFacilityResponse>
  | TenantProtocolResultBase<"tradingRecordProviderFunding", TradingFacilityResponse>
  | TenantProtocolResultBase<"tradingActivateFacility", TradingFacilityResponse>
  | TenantProtocolResultBase<"tradingSubmitOrderIntent", TradingFacilityOrderResponse>
  | TenantProtocolResultBase<"tradingCancelOrderIntent", TradingFacilityOrderResponse>
  | TenantProtocolResultBase<"tradingReadFacilityState", TradingFacilityStateResponse>
  | TenantProtocolResultBase<"tradingEvaluateRisk", TradingFacilityRiskResponse>
  | TenantProtocolResultBase<"tradingPauseNewRisk", TradingFacilityResponse>
  | TenantProtocolResultBase<"tradingFlattenFacility", TradingFacilityFlattenResponse>
  | TenantProtocolResultBase<"tradingRequestClose", TradingFacilityCloseResponse>
  | TenantProtocolResultBase<"tradingRunSettlement", TradingSettlementFinalizedResponse>
  | TenantProtocolResultBase<"tradingReadSettlement", TradingSettlementViewResponse>
  | TenantProtocolResultBase<"tradingIssuePerformanceProof", TradingPerformanceProofResponse>
  | TenantProtocolResultBase<"tradingReadFacilityEvidence", TradingFacilityEvidenceResponse>;

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
  ResourceType extends "subject" | "consent" | "credit_intent" | "credit_offer" | "credit_passport_artifact" | "delegated_wallet_grant" | "evidence" | "human_identity_reference" | "inbox_message" | "mandate" | "obligation" | "official_report" | "provider" | "risk_portfolio" | "servicing_queue" | "trading_capital_request" | "trading_credit_profile" | "trading_facility" | "trading_facility_close_request" | "trading_order_intent" | "trading_match_proposal" | "trading_settlement" | "transfer_intent" | "wallet_adapter" | "wallet_execution" | "venue_adapter" | "venue_binding" | "venue_delegate" | "venue_execution" | "workspace",
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
      "walletPrepareAccountBinding",
      "command",
      readonly ["human", "agent"],
      "subject",
      "wallet.account_binding.prepare.owned",
      "required",
      "credential",
      "tenant_execution_account_binding_challenge_created.v1"
    >
  | TenantProtocolOperationBase<
      "walletSubmitAccountBinding",
      "command",
      readonly ["human", "agent"],
      "subject",
      "wallet.account_binding.submit.owned",
      "required",
      "credential",
      "tenant_execution_account_binding_verified.v1"
    >
  | TenantProtocolOperationBase<
      "walletReadAccountBindings",
      "query",
      readonly ["human", "agent"],
      "subject",
      "wallet.account_binding.read.owned",
      "prohibited",
      "read",
      "tenant_execution_account_bindings_view.v1"
    >
  | TenantProtocolOperationBase<
      "walletRevokeAccountBinding",
      "command",
      readonly ["human", "agent"],
      "subject",
      "wallet.account_binding.revoke.owned",
      "required",
      "credential",
      "tenant_execution_account_binding_revoked.v1"
    >
  | TenantProtocolOperationBase<
      "walletDiscoverCapabilities",
      "query",
      readonly ["human", "agent"],
      "wallet_adapter",
      "wallet.capabilities.discover",
      "prohibited",
      "read",
      "wallet_capability_descriptor_list.v1"
    >
  | TenantProtocolOperationBase<
      "walletPrepareGrant",
      "command",
      readonly ["human"],
      "subject",
      "wallet.grant.prepare.owned",
      "required",
      "privileged",
      "tenant_wallet_grant_prepared.v1"
    >
  | TenantProtocolOperationBase<
      "walletActivateGrant",
      "command",
      readonly ["human"],
      "delegated_wallet_grant",
      "wallet.grant.activate.owned",
      "required",
      "privileged",
      "tenant_wallet_grant_activated.v1"
    >
  | TenantProtocolOperationBase<
      "walletReadGrant",
      "query",
      readonly ["human", "agent"],
      "delegated_wallet_grant",
      "wallet.grant.read.owned",
      "prohibited",
      "read",
      "tenant_wallet_grant_view.v1"
    >
  | TenantProtocolOperationBase<
      "walletRevokeGrant",
      "command",
      readonly ["human"],
      "delegated_wallet_grant",
      "wallet.grant.revoke.owned",
      "required",
      "privileged",
      "tenant_wallet_grant_revoked.v1"
    >
  | TenantProtocolOperationBase<
      "walletPrepareExecution",
      "command",
      readonly ["human", "agent"],
      "delegated_wallet_grant",
      "wallet.execution.prepare.owned",
      "required",
      "economic",
      "tenant_wallet_execution_prepared.v1"
    >
  | TenantProtocolOperationBase<
      "walletApproveExecution",
      "command",
      readonly ["human"],
      "wallet_execution",
      "wallet.execution.approve.owned",
      "required",
      "privileged",
      "tenant_wallet_execution_approved.v1"
    >
  | TenantProtocolOperationBase<
      "walletSubmitExecution",
      "command",
      readonly ["human", "agent"],
      "wallet_execution",
      "wallet.execution.submit.owned",
      "required",
      "economic",
      "tenant_wallet_execution_submission_blocked.v1"
    >
  | TenantProtocolOperationBase<
      "walletReadExecution",
      "query",
      readonly ["human", "agent"],
      "wallet_execution",
      "wallet.execution.read.owned",
      "prohibited",
      "read",
      "tenant_wallet_execution_view.v1"
    >
  | TenantProtocolOperationBase<
      "tradingCreateAccountBindingChallenge",
      "command",
      readonly ["human", "agent"],
      "subject",
      "trading.account_challenge.create.self",
      "required",
      "mutation",
      "tenant_trading_account_binding_challenge_created.v2"
    >
  | TenantProtocolOperationBase<
      "tradingImportHyperliquidHistory",
      "command",
      readonly ["human", "agent"],
      "trading_credit_profile",
      "trading.history_import.self",
      "required",
      "mutation",
      "tenant_trading_history_imported.v2"
    >
  | TenantProtocolOperationBase<
      "tradingFinalizeEvidenceSnapshot",
      "command",
      readonly ["human", "agent"],
      "trading_credit_profile",
      "trading.evidence_finalize.self",
      "required",
      "mutation",
      "tenant_trading_evidence_snapshot_finalized.v2"
    >
  | TenantProtocolOperationBase<
      "tradingReadCreditProfile",
      "query",
      readonly ["human", "agent"],
      "trading_credit_profile",
      "trading.credit_profile.read.self",
      "prohibited",
      "read",
      "tenant_trading_credit_profile_view.v2"
    >
  | TenantProtocolOperationBase<
      "tradingCreateCapitalRequest",
      "command",
      readonly ["human", "agent"],
      "trading_credit_profile",
      "trading.capital_request.create.self",
      "required",
      "mutation",
      "tenant_trading_capital_request_created.v1"
    >
  | TenantProtocolOperationBase<
      "tradingCreateProviderMandate",
      "command",
      readonly ["provider"],
      "provider",
      "trading.provider_mandate.create.owned",
      "required",
      "mutation",
      "tenant_trading_provider_mandate_created.v1"
    >
  | TenantProtocolOperationBase<
      "tradingListCompatibleMandates",
      "query",
      readonly ["human", "agent"],
      "trading_capital_request",
      "trading.compatible_mandate.list.self",
      "prohibited",
      "read",
      "trading_compatible_mandate_list.v1"
    >
  | TenantProtocolOperationBase<
      "tradingCreateMatchProposal",
      "command",
      readonly ["human", "agent"],
      "trading_capital_request",
      "trading.match_proposal.create.self",
      "required",
      "mutation",
      "tenant_trading_match_proposal_created.v1"
    >
  | TenantProtocolOperationBase<
      "tradingAcceptMatchAsProvider",
      "command",
      readonly ["provider"],
      "trading_match_proposal",
      "trading.match.accept.provider",
      "required",
      "mutation",
      "tenant_trading_match_provider_accepted.v1"
    >
  | TenantProtocolOperationBase<
      "tradingAcceptMatchAsSubject",
      "command",
      readonly ["human", "agent"],
      "trading_match_proposal",
      "trading.match.accept.subject",
      "required",
      "mutation",
      "tenant_trading_match_subject_accepted.v1"
    >
  | TenantProtocolOperationBase<
      "tradingCreateFacility",
      "command",
      readonly ["human", "agent"],
      "trading_match_proposal",
      "trading.facility.create.self",
      "required",
      "mutation",
      "tenant_trading_facility_created.v1"
    >
  | TenantProtocolOperationBase<
      "tradingContributeSubjectCollateral",
      "command",
      readonly ["human", "agent"],
      "trading_facility",
      "trading.facility.collateral.record.self",
      "required",
      "mutation",
      "tenant_trading_subject_collateral_recorded.v1"
    >
  | TenantProtocolOperationBase<
      "tradingRecordProviderFunding",
      "command",
      readonly ["provider"],
      "trading_facility",
      "trading.facility.funding.record.provider",
      "required",
      "mutation",
      "tenant_trading_provider_funding_recorded.v1"
    >
  | TenantProtocolOperationBase<
      "tradingActivateFacility",
      "command",
      readonly ["human", "agent"],
      "trading_facility",
      "trading.facility.activate.self",
      "required",
      "mutation",
      "tenant_trading_facility_activated.v1"
    >
  | TenantProtocolOperationBase<
      "tradingSubmitOrderIntent",
      "command",
      readonly ["human", "agent"],
      "trading_facility",
      "trading.order_intent.submit.self",
      "required",
      "mutation",
      "tenant_trading_order_intent_submitted.v1"
    >
  | TenantProtocolOperationBase<
      "tradingCancelOrderIntent",
      "command",
      readonly ["human", "agent"],
      "trading_order_intent",
      "trading.order_intent.cancel.self",
      "required",
      "mutation",
      "tenant_trading_order_intent_canceled.v1"
    >
  | TenantProtocolOperationBase<
      "tradingReadFacilityState",
      "query",
      readonly ["human", "agent", "provider"],
      "trading_facility",
      "trading.facility.read.bound",
      "prohibited",
      "read",
      "trading_facility_state.v1"
    >
  | TenantProtocolOperationBase<
      "tradingEvaluateRisk",
      "command",
      readonly ["risk_operator", "operations_operator"],
      "trading_facility",
      "trading.facility.risk.evaluate.tenant",
      "required",
      "privileged",
      "tenant_trading_facility_risk_evaluated.v1"
    >
  | TenantProtocolOperationBase<
      "tradingPauseNewRisk",
      "command",
      readonly ["risk_operator", "operations_operator"],
      "trading_facility",
      "trading.facility.pause.tenant",
      "required",
      "privileged",
      "tenant_trading_facility_new_risk_paused.v1"
    >
  | TenantProtocolOperationBase<
      "tradingFlattenFacility",
      "command",
      readonly ["risk_operator", "operations_operator"],
      "trading_facility",
      "trading.facility.flatten.tenant",
      "required",
      "privileged",
      "tenant_trading_facility_flattened.v1"
    >
  | TenantProtocolOperationBase<
      "tradingRequestClose",
      "command",
      readonly ["human", "agent"],
      "trading_facility",
      "trading.facility.close_request.self",
      "required",
      "mutation",
      "tenant_trading_facility_close_requested.v1"
    >
  | TenantProtocolOperationBase<
      "tradingRunSettlement",
      "command",
      readonly ["system_worker"],
      "trading_facility_close_request",
      "trading.settlement.run.worker",
      "required",
      "worker",
      "tenant_trading_settlement_finalized.v1"
    >
  | TenantProtocolOperationBase<
      "tradingReadSettlement",
      "query",
      readonly ["human", "agent", "provider"],
      "trading_settlement",
      "trading.settlement.read.bound",
      "prohibited",
      "read",
      "trading_settlement_view.v1"
    >
  | TenantProtocolOperationBase<
      "tradingIssuePerformanceProof",
      "command",
      readonly ["human", "agent", "provider"],
      "trading_settlement",
      "trading.performance_proof.issue.bound",
      "required",
      "mutation",
      "tenant_trading_performance_proof_issued.v1"
    >
  | TenantProtocolOperationBase<
      "tradingReadFacilityEvidence",
      "query",
      readonly ["human", "agent", "provider"],
      "trading_facility",
      "trading.facility.evidence.read.bound",
      "prohibited",
      "read",
      "trading_facility_evidence.v1"
    >
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
      "tenant_credit_application_view.v2"
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
      readonly ["human", "agent"],
      "workspace",
      "workspace.resume.self",
      "prohibited",
      "read",
      "tenant_workspace_resume_view.v2"
    >
  | TenantProtocolOperationBase<
      "pilotReadTenantRiskPortfolioReference",
      "query",
      readonly ["risk_operator", "auditor"],
      "workspace",
      "risk.read.tenant",
      "prohibited",
      "read",
      "tenant_risk_portfolio_reference_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadServicingQueueReference",
      "query",
      readonly ["risk_operator", "operations_operator"],
      "workspace",
      "servicing.queue.read",
      "prohibited",
      "read",
      "tenant_servicing_queue_reference_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotPersistAgentContinuationReceipt",
      "command",
      readonly ["agent"],
      "credit_offer",
      "workspace.resume.self",
      "required",
      "economic",
      "tenant_agent_continuation_receipt_persisted.v1"
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
      "pilotReadCreditRegistryEvidence",
      "query",
      readonly [
        "human",
        "agent",
        "risk_operator",
        "operations_operator",
        "auditor"
      ],
      "credit_registry_evidence",
      "credit_registry.evidence.read.tenant",
      "prohibited",
      "read",
      "tenant_credit_registry_evidence_view.v1"
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
      "pilotReadOwnCreditState",
      "query",
      readonly ["human", "agent"],
      "subject",
      "credit_passport.read.self",
      "prohibited",
      "read",
      "tenant_owned_credit_state_view.v1"
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
      "pilotCreateCreditPassportArtifact",
      "command",
      readonly ["human"],
      "subject",
      "credit_passport.create.self",
      "required",
      "mutation",
      "tenant_credit_passport_artifact_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadOwnCreditPassportArtifact",
      "query",
      readonly ["human", "agent"],
      "credit_passport_artifact",
      "credit_passport.read.self",
      "prohibited",
      "read",
      "tenant_owned_credit_passport_artifact_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotVerifyCreditPassportArtifact",
      "query",
      readonly ["human", "agent", "risk_operator", "operations_operator", "auditor"],
      "credit_passport_artifact",
      "credit_passport.verify.bound",
      "prohibited",
      "read",
      "tenant_credit_passport_verification_result.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRevokeCreditPassportArtifact",
      "command",
      readonly ["human"],
      "credit_passport_artifact",
      "credit_passport.revoke.self",
      "required",
      "mutation",
      "tenant_credit_passport_artifact_revoked.v1"
    >
  | TenantProtocolOperationBase<
      "pilotCreateOfficialReport",
      "command",
      readonly ["human", "agent"],
      "obligation",
      "official_report.create.owned",
      "required",
      "mutation",
      "tenant_official_report_created.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadOfficialReport",
      "query",
      readonly ["human", "agent"],
      "official_report",
      "official_report.read.owned",
      "prohibited",
      "read",
      "tenant_official_report_view.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRetrieveOfficialReport",
      "query",
      readonly ["human", "agent"],
      "official_report",
      "official_report.retrieve.owned",
      "prohibited",
      "read",
      "tenant_official_report_retrieval.v1"
    >
  | TenantProtocolOperationBase<
      "pilotRevokeOfficialReport",
      "command",
      readonly ["human", "agent"],
      "official_report",
      "official_report.revoke.owned",
      "required",
      "mutation",
      "tenant_official_report_revoked.v1"
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
    >
  | TenantProtocolOperationBase<
      "pilotReadOwnSecuredPool",
      "query",
      readonly ["human", "agent"],
      "subject",
      "pool.read.self",
      "prohibited",
      "read",
      "tenant_secured_pool_workspace.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReviewSecuredPoolAction",
      "query",
      readonly ["human", "agent"],
      "subject",
      "pool.action.review.self",
      "prohibited",
      "read",
      "tenant_secured_pool_action_review.v1"
    >
  | TenantProtocolOperationBase<
      "pilotReadSecuredPoolRisk",
      "query",
      readonly ["risk_operator", "operations_operator", "auditor"],
      "risk_portfolio",
      "pool.risk.read.tenant",
      "prohibited",
      "read",
      "tenant_secured_pool_risk_view.v1"
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
    creditPassportArtifactsEnabled: true;
    officialReportArtifactsEnabled: true;
    tradingCapitalNoFundsEvidenceEnabled: true;
    tradingCapitalNoFundsMatchingEnabled: true;
    tradingCapitalNoFundsSettlementEnabled: true;
    agenticWalletPreflightEnabled: true;
    walletSubmissionEnabled: false;
    securedPoolWorkspaceEnabled: true;
    securedPoolSubmissionEnabled: false;
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
