import { createAgentSubjectHandlers } from "./agent-subject-handlers.js";
import { createMandateHandlers } from "./mandate-handlers.js";

export function createTenantFoundationHandlers() {
  return Object.freeze([
    ...createAgentSubjectHandlers(),
    ...createMandateHandlers()
  ]);
}
