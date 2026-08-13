import {
  IpoOneAgentEvidenceClient,
  IpoOneAgentMcpClient,
  IpoOneAgentSandboxObligationClient
} from "../../../packages/sdk/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";

function workflowSuffix(manifest) {
  return manifest.mandateHash.slice(2, 26);
}

export function createLocalAgentApplicationInput(manifest) {
  const principal = [
    BigInt(manifest.authority.perActionLimitMinor),
    BigInt(manifest.authority.aggregateLimitMinor),
    10_000n
  ].reduce((minimum, value) => value < minimum ? value : minimum);
  return {
    creditRequest: {
      assetId: manifest.authority.assetIds[0],
      requestedPrincipalMinor: principal.toString(),
      purposeCode: "compute",
      requestedTermDays: 30,
      repaymentFrequency: "end_of_term",
      installmentCount: 1
    },
    workflowId: `local-agent-application-${workflowSuffix(manifest)}`
  };
}

export function createLocalAgentRuntimeInput(
  manifest,
  offerReceipt
) {
  return {
    acknowledgementHash: hashId(
      "agent_offer_acknowledgement",
      `${manifest.mandateHash}:${offerReceipt.offer.creditOfferHash}`
    ),
    offerReceipt,
    repayment: {
      amountMinor: offerReceipt.offer.approvedPrincipalMinor,
      sourceCode: "synthetic_revenue"
    },
    workflowId: `local-agent-obligation-${workflowSuffix(manifest)}`
  };
}

export async function runLocalAgentApplicationWorkflow({
  manifest,
  session
}) {
  const client = new IpoOneAgentMcpClient({
    handle: session.host.handle,
    manifest,
    transportProfile: "mcp_stdio_local"
  });
  return client.runCreditOfferWorkflow(
    createLocalAgentApplicationInput(manifest)
  );
}

export async function persistLocalAgentContinuationReceipt({
  receipt,
  session
}) {
  if (
    receipt?.status !== "offer_ready" ||
    typeof receipt?.offer?.creditOfferId !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(receipt?.offer?.creditOfferHash ?? "") ||
    typeof receipt?.correlationId !== "string"
  ) {
    throw new Error("Agent Offer receipt is not eligible for durable continuation");
  }
  return session.client.persistContinuationReceipt({
    creditOfferId: receipt.offer.creditOfferId,
    receipt,
    idempotencyKey:
      `reference-agent-continuation-${receipt.offer.creditOfferHash}`,
    requestId:
      `request-reference-agent-persist-${receipt.offer.creditOfferHash.slice(2, 26)}`,
    correlationId: receipt.correlationId
  });
}

export async function runLocalAgentRuntimeWorkflow({
  manifest,
  offerReceipt,
  session
}) {
  const execute = session.client.execute.bind(session.client);
  const client = new IpoOneAgentSandboxObligationClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const receipt = await client.runObligationWorkflow(
    createLocalAgentRuntimeInput(manifest, offerReceipt)
  );
  const evidenceClient = new IpoOneAgentEvidenceClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const suffix = workflowSuffix(manifest);
  const evidence = await evidenceClient.readObligationEvidence({
    obligationId: receipt.obligation.obligationId,
    limit: 50,
    requestId: `request-agent-evidence-${suffix}`,
    correlationId: `correlation-agent-evidence-${suffix}`
  });
  return {
    schemaVersion: "local_agent_reference_workflow_result.v1",
    status: "evidence_read",
    sandboxOnly: true,
    productionFundsMoved: false,
    workflowReceipt: receipt,
    evidence
  };
}
