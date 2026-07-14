import { createAgentSubjectHandlers } from "./agent-subject-handlers.js";
import { createMandateHandlers } from "./mandate-handlers.js";
import { createSubjectRiskHandlers } from "./subject-risk-handlers.js";

export function createTenantFoundationHandlers() {
  return Object.freeze([
    ...createAgentSubjectHandlers(),
    ...createMandateHandlers(),
    ...createSubjectRiskHandlers()
  ]);
}
