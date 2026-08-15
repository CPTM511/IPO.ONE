import { createTenantHttpServer, createTenantWebAssetHandler } from "../../src/index.js";
import { DomainError } from "../../../../packages/domain/src/index.js";

const obligationId = "obligation_auditor_demo_001";
const csrfToken = "auditor_visual_qa_csrf_token_20260716_001";

function event(version, eventType, recordedAt, sourceFinality = "finalized") {
  return {
    evidenceId: `evidence_auditor_demo_${String(version).padStart(2, "0")}`,
    evidenceHash: `0x${String(version).padStart(64, String(version % 10))}`,
    eventType,
    aggregateType: "obligation",
    aggregateId: obligationId,
    aggregateVersion: version,
    obligationId,
    sourceFinality,
    payloadHash: `0x${String(version + 4).padStart(64, String((version + 4) % 10))}`,
    occurredAt: recordedAt,
    recordedAt,
    schemaVersion: "obligation_evidence_summary.v1"
  };
}

const firstPage = [
  event(1, "ObligationCreated", "2026-07-16T08:00:00.000Z"),
  event(2, "SandboxExecutionRecorded", "2026-07-16T08:02:10.000Z", "sandbox_confirmed"),
  event(3, "LedgerBalanced", "2026-07-16T08:02:11.000Z"),
  event(4, "RepaymentPosted", "2026-07-16T09:20:00.000Z")
];
const secondPage = [
  event(5, "DelinquencyEvaluated", "2026-07-16T10:00:00.000Z"),
  event(6, "ObligationCured", "2026-07-16T10:05:00.000Z")
];

const listener = createTenantHttpServer({
  port: 4187,
  gateway: {
    async execute(command) {
      if (command.operationId !== "pilotReadEvidence") {
        throw Object.assign(new Error("Preview operation is unavailable"), { code: "not_found" });
      }
      if (command.resource.resourceId === "obligation_denied_demo") {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const pageTwo = Boolean(command.payload.cursor);
      return {
        operationId: command.operationId,
        replayed: false,
        response: {
          obligationId,
          asOf: "2026-07-16T10:06:00.000Z",
          items: pageTwo ? secondPage : firstPage,
          hasMore: !pageTwo,
          ...(!pageTwo ? { nextCursor: "preview_cursor_page_2" } : {}),
          schemaVersion: "tenant_obligation_evidence_view.v1"
        },
        schemaVersion: "tenant_protocol_result.v1"
      };
    }
  },
  resolveAuthenticationContext: async () => ({
    tenantId: "tenant_visual_qa",
    actorId: "auditor_visual_qa",
    actorType: "human",
    roles: ["auditor"],
    capabilities: ["evidence.read"]
  }),
  createNetworkContext: async () => ({ source: "visual_qa" }),
  serveWebAsset: createTenantWebAssetHandler({ csrfTokenProvider: async () => csrfToken })
});

await listener.listen();
console.log("IPO.ONE Auditor Evidence preview: http://127.0.0.1:4187/#evidence");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await listener.close();
    process.exit(0);
  });
}

await new Promise(() => {});
