import { createAgentSubjectHandlers } from "./agent-subject-handlers.js";
import { createAgentAccountProofHandlers } from "./agent-account-proof-handlers.js";
import { createExecutionAccountBindingHandlers } from "./execution-account-binding-handlers.js";
import { createAgentSecuredFacilityAuthorizationHandlers } from "./agent-secured-facility-authorization-handlers.js";
import { createCreditIntentHandlers } from "./credit-intent-handlers.js";
import { createCreditDecisionHandlers } from "./credit-decision-handlers.js";
import { createCreditPassportHandlers } from "./credit-passport-handlers.js";
import { createCreditStateQueryHandlers } from "./credit-state-query-handlers.js";
import { createCreditAcceptanceHandlers } from "./credit-acceptance-handlers.js";
import { createCreditExecutionHandlers } from "./credit-execution-handlers.js";
import { createCreditRegistryEvidenceHandlers } from "./credit-registry-evidence-handlers.js";
import { createEvidenceQueryHandlers } from "./evidence-query-handlers.js";
import { createHumanConsentHandlers } from "./human-consent-handlers.js";
import { createHumanSubjectHandlers } from "./human-subject-handlers.js";
import { createMandateHandlers } from "./mandate-handlers.js";
import { createOwnedObligationQueryHandlers } from "./owned-obligation-query-handlers.js";
import { createOfficialReportHandlers } from "./official-report-handlers.js";
import { createPilotHealthQueryHandlers } from "./pilot-health-query-handlers.js";
import { createPilotFeedbackHandlers } from "./pilot-feedback-handlers.js";
import { createPilotCaseHandlers } from "./pilot-case-handlers.js";
import { createClosedPilotReadinessHandlers } from "./closed-pilot-readiness-handlers.js";
import { createServicingQueueQueryHandlers } from "./servicing-queue-query-handlers.js";
import { createSecuredPoolWorkspaceHandlers } from "./secured-pool-workspace-handlers.js";
import { createProviderHandlers } from "./provider-handlers.js";
import { createMeteredUsageHandlers } from "./metered-usage-handlers.js";
import { createSandboxServicingHandlers } from "./servicing-handlers.js";
import { createSubjectRiskHandlers } from "./subject-risk-handlers.js";
import { createTenantRiskQueryHandlers } from "./tenant-risk-query-handlers.js";
import { createRiskWorkspaceReferenceHandlers } from "./risk-workspace-reference-handlers.js";
import { createTradingCapitalEvidenceHandlers } from "./trading-capital-evidence-handlers.js";
import { createTradingCapitalMatchingHandlers } from "./trading-capital-matching-handlers.js";
import { createTradingCapitalFacilityHandlers } from "./trading-capital-facility-handlers.js";
import { createTradingCapitalSettlementHandlers } from "./trading-capital-settlement-handlers.js";
import { createWorkspaceResumeHandlers } from "./workspace-resume-handlers.js";
import { createWorkspaceContinuationHandlers } from "./workspace-continuation-handlers.js";
import { createCapitalPartnerHandlers } from "./capital-partner-handlers.js";
import { createCapitalPartnerWorkspaceHandlers } from "./capital-partner-workspace-handlers.js";
import {
  createUnavailableWalletExecutionApplication,
  createWalletExecutionHandlers
} from "./wallet-execution-handlers.js";
import {
  createUnavailableVenueExecutionApplication,
  createVenueExecutionHandlers
} from "./venue-execution-handlers.js";

export function createTenantFoundationHandlers(options) {
  return Object.freeze([
    ...createAgentSubjectHandlers(),
    ...createAgentAccountProofHandlers(options),
    ...createExecutionAccountBindingHandlers(options),
    ...createAgentSecuredFacilityAuthorizationHandlers(),
    ...createCreditDecisionHandlers(),
    ...createCreditPassportHandlers(),
    ...createCreditStateQueryHandlers(),
    ...createCapitalPartnerHandlers(),
    ...createCapitalPartnerWorkspaceHandlers(),
    ...createCreditAcceptanceHandlers(),
    ...createCreditExecutionHandlers(options),
    ...createCreditRegistryEvidenceHandlers(),
    ...createEvidenceQueryHandlers(),
    ...createOwnedObligationQueryHandlers(),
    ...createOfficialReportHandlers(),
    ...createPilotHealthQueryHandlers(),
    ...createPilotFeedbackHandlers(),
    ...createPilotCaseHandlers(),
    ...createClosedPilotReadinessHandlers(),
    ...createServicingQueueQueryHandlers(),
    ...createSecuredPoolWorkspaceHandlers({
      deploymentProfile: options?.securedPoolDeploymentProfile,
      readAdapter: options?.securedPoolReadAdapter
    }),
    ...createCreditIntentHandlers(),
    ...createHumanSubjectHandlers(),
    ...createWorkspaceResumeHandlers(),
    ...createWorkspaceContinuationHandlers(),
    ...createHumanConsentHandlers(),
    ...createMandateHandlers(),
    ...createProviderHandlers(options),
    ...createMeteredUsageHandlers(options),
    ...createSandboxServicingHandlers(),
    ...createSubjectRiskHandlers(),
    ...createRiskWorkspaceReferenceHandlers(),
    ...createTenantRiskQueryHandlers(),
    ...createTradingCapitalEvidenceHandlers(options),
    ...createTradingCapitalMatchingHandlers(),
    ...createTradingCapitalFacilityHandlers(),
    ...createTradingCapitalSettlementHandlers(),
    ...createWalletExecutionHandlers({
      application: options?.walletExecutionApplication ??
        createUnavailableWalletExecutionApplication()
    }),
    ...createVenueExecutionHandlers({
      application: options?.venueExecutionApplication ??
        createUnavailableVenueExecutionApplication()
    })
  ]);
}
