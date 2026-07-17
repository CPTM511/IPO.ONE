import { createAgentSubjectHandlers } from "./agent-subject-handlers.js";
import { createAgentAccountProofHandlers } from "./agent-account-proof-handlers.js";
import { createCreditIntentHandlers } from "./credit-intent-handlers.js";
import { createCreditDecisionHandlers } from "./credit-decision-handlers.js";
import { createCreditAcceptanceHandlers } from "./credit-acceptance-handlers.js";
import { createCreditExecutionHandlers } from "./credit-execution-handlers.js";
import { createEvidenceQueryHandlers } from "./evidence-query-handlers.js";
import { createHumanConsentHandlers } from "./human-consent-handlers.js";
import { createHumanSubjectHandlers } from "./human-subject-handlers.js";
import { createMandateHandlers } from "./mandate-handlers.js";
import { createOwnedObligationQueryHandlers } from "./owned-obligation-query-handlers.js";
import { createPilotHealthQueryHandlers } from "./pilot-health-query-handlers.js";
import { createPilotFeedbackHandlers } from "./pilot-feedback-handlers.js";
import { createServicingQueueQueryHandlers } from "./servicing-queue-query-handlers.js";
import { createProviderHandlers } from "./provider-handlers.js";
import { createSandboxServicingHandlers } from "./servicing-handlers.js";
import { createSubjectRiskHandlers } from "./subject-risk-handlers.js";
import { createTenantRiskQueryHandlers } from "./tenant-risk-query-handlers.js";
import { createWorkspaceResumeHandlers } from "./workspace-resume-handlers.js";

export function createTenantFoundationHandlers(options) {
  return Object.freeze([
    ...createAgentSubjectHandlers(),
    ...createAgentAccountProofHandlers(),
    ...createCreditDecisionHandlers(),
    ...createCreditAcceptanceHandlers(),
    ...createCreditExecutionHandlers(options),
    ...createEvidenceQueryHandlers(),
    ...createOwnedObligationQueryHandlers(),
    ...createPilotHealthQueryHandlers(),
    ...createPilotFeedbackHandlers(),
    ...createServicingQueueQueryHandlers(),
    ...createCreditIntentHandlers(),
    ...createHumanSubjectHandlers(),
    ...createWorkspaceResumeHandlers(),
    ...createHumanConsentHandlers(),
    ...createMandateHandlers(),
    ...createProviderHandlers(options),
    ...createSandboxServicingHandlers(),
    ...createSubjectRiskHandlers(),
    ...createTenantRiskQueryHandlers()
  ]);
}
