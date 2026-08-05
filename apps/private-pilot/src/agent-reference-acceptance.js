import { randomUUID } from "node:crypto";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import { HumanTenantCommandClient } from "../../../modules/tenant-command-gateway/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createApplicationReadyAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "../../web/src/agent-handoff-manifest.js";
import {
  runLocalAgentApplicationWorkflow,
  runLocalAgentRuntimeWorkflow
} from "./agent-reference-workflows.js";
import { createDurableLocalAgentSession } from "./local-agent-session.js";
import { createPrivatePilotGateway } from "./private-pilot-runtime.js";

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

async function findBoundAgentSubject(client) {
  const workspace = await client.resumeWorkspace({
    requestId: identifier("request-agent-acceptance-resume"),
    correlationId: identifier("correlation-agent-acceptance")
  });
  const candidates = workspace.response.resources.filter(
    (resource) =>
      resource.resourceType === "subject" &&
      resource.relationship === "controller"
  );
  for (const resource of candidates) {
    try {
      const binding = await client.getAgentAccountBinding({
        subjectId: resource.resourceId,
        requestId: identifier("request-agent-acceptance-binding"),
        correlationId: identifier("correlation-agent-acceptance")
      });
      if (
        binding.response.subjectStatus === "active" &&
        binding.response.accountBinding
      ) {
        return resource.resourceId;
      }
    } catch {
      // Human Subjects and inaccessible resources are not Agent candidates.
    }
  }
  throw new Error(
    "no active Agent Subject with a verified account binding is available"
  );
}

const humanRuntime = await createPrivatePilotGateway(
  process.env.DATABASE_URL
);
let agentSession;
try {
  const controller = humanRuntime.authentication.identities.controller;
  const humanClient = new HumanTenantCommandClient({
    gateway: humanRuntime.gateway,
    authenticationContextProvider: async () => controller.createContext(),
    networkContextProvider: async () => createTrustedNetworkContext({
      networkRefHash: hashId(
        "private_pilot_network",
        "local_agent_reference_acceptance"
      ),
      source: "local_test"
    })
  });
  const subjectId = await findBoundAgentSubject(humanClient);
  const now = new Date();
  const mandateResult = await humanClient.createDraftMandate({
    subjectId,
    payload: {
      capabilities: [
        "request_credit",
        "accept_credit_offer",
        "execute_sandbox_credit",
        "provider_spend",
        "capture_revenue",
        "route_repayment"
      ],
      allowedProviderIds: ["provider_gateway_compute"],
      allowedCategories: ["compute"],
      assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      perActionLimitMinor: "10000",
      aggregateLimitMinor: "25000",
      validFrom: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + 30 * 86_400_000
      ).toISOString(),
      nonce: identifier("local-agent-reference"),
      termsRef: "urn:ipo.one:terms:agent-credit-sandbox:v1"
    },
    idempotencyKey: identifier("idempotency-agent-mandate"),
    requestId: identifier("request-agent-mandate"),
    correlationId: identifier("correlation-agent-acceptance")
  });
  const mandateId = mandateResult.response.mandateId;
  const mandateRead = await humanClient.getMandate({
    mandateId,
    requestId: identifier("request-agent-mandate-read"),
    correlationId: identifier("correlation-agent-acceptance")
  });
  const applicationHandoff =
    createApplicationReadyAgentHandoffManifest(
      mandateRead.response.mandate
    );
  if (!applicationHandoff) {
    throw new Error("application handoff was not created");
  }
  agentSession = await createDurableLocalAgentSession({
    databaseUrl: process.env.DATABASE_URL,
    manifest: applicationHandoff,
    networkSource: "local_reference_agent_application"
  });
  const offerReceipt = await runLocalAgentApplicationWorkflow({
    manifest: applicationHandoff,
    session: agentSession
  });
  await agentSession.close();
  agentSession = undefined;
  if (
    offerReceipt.status !== "offer_ready" ||
    offerReceipt.mandateId !== mandateId
  ) {
    throw new Error("Agent Offer receipt did not match the Draft Mandate");
  }
  const activation = await humanClient.activateSandboxMandate({
    mandateId,
    payload: {
      expectedMandateHash: mandateRead.response.mandate.mandateHash,
      acknowledgedTermsHash: mandateRead.response.mandate.termsHash,
      acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
    },
    idempotencyKey: identifier("idempotency-agent-activate"),
    requestId: identifier("request-agent-activate"),
    correlationId: identifier("correlation-agent-acceptance")
  });
  const runtimeHandoff = createReadyAgentHandoffManifest(
    activation.response.mandate
  );
  if (!runtimeHandoff) throw new Error("runtime handoff was not created");

  agentSession = await createDurableLocalAgentSession({
    databaseUrl: process.env.DATABASE_URL,
    manifest: runtimeHandoff,
    networkSource: "local_reference_agent_runtime"
  });
  const lifecycle = await runLocalAgentRuntimeWorkflow({
    manifest: runtimeHandoff,
    offerReceipt,
    session: agentSession
  });
  if (
    lifecycle.status !== "evidence_read" ||
    lifecycle.workflowReceipt.status !== "repayment_posted" ||
    lifecycle.workflowReceipt.mandateId !== mandateId ||
    lifecycle.evidence.obligationId !==
      lifecycle.workflowReceipt.obligation.obligationId ||
    lifecycle.evidence.items.length < 1 ||
    lifecycle.productionFundsMoved !== false
  ) {
    throw new Error(
      "Agent runtime result did not complete the no-funds Evidence loop"
    );
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "local_agent_reference_acceptance.v1",
    status: "passed",
    subjectId,
    mandateId,
    obligationId: lifecycle.workflowReceipt.obligation.obligationId,
    evidenceEventCount: lifecycle.evidence.items.length,
    applicationHandoff,
    offerReceipt,
    runtimeHandoff,
    lifecycle,
    sandboxOnly: true,
    productionFundsMoved: false
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `Local Agent acceptance failed: ${error?.code ?? error?.message ?? "unknown"}\n`
  );
  process.exitCode = 1;
} finally {
  await agentSession?.close();
  await humanRuntime.pool.end();
}
