import { createAgentSubjectHandlers } from "./agent-subject-handlers.js";
import { createMandateHandlers } from "./mandate-handlers.js";
import { createSubjectRiskHandlers } from "./subject-risk-handlers.js";
import { createTenantRiskQueryHandlers } from "./tenant-risk-query-handlers.js";

export function createTenantFoundationHandlers() {
  return Object.freeze([
    ...createAgentSubjectHandlers(),
    ...createMandateHandlers(),
    ...createSubjectRiskHandlers(),
    ...createTenantRiskQueryHandlers()
  ]);
}
