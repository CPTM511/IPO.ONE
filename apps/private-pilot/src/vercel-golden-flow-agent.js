import { createHash, randomUUID } from "node:crypto";
import {
  SignJWT,
  calculateJwkThumbprint,
  importJWK
} from "jose";
import { privateKeyToAccount } from "viem/accounts";
import {
  IpoOneAgentEvidenceClient,
  IpoOneAgentMcpClient,
  IpoOneAgentSandboxObligationClient
} from "../../../packages/sdk/src/index.js";
import { ProductionAgentClient } from "../../../packages/sdk/src/production-agent-client.js";
import {
  preparePrivatePilotAgentProof
} from "./private-pilot-agent-account.js";
import {
  createLocalAgentApplicationInput,
  createLocalAgentRuntimeInput
} from "./agent-reference-workflows.js";
import { PRODUCTION_BOOTSTRAP_PROFILES } from "./production-bootstrap.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const PRIVATE_KEY = /^0x[0-9a-f]{64}$/;
const AGENT_PROFILE = PRODUCTION_BOOTSTRAP_PROFILES.agent_runtime;
const MCP_OPERATION_BY_TOOL = Object.freeze({
  ipo_one_read_self: "pilotReadAgentSelf",
  ipo_one_request_credit: "pilotRequestCredit",
  ipo_one_read_credit_application: "pilotReadCreditApplication",
  ipo_one_evaluate_credit_application: "pilotEvaluateCreditApplication"
});

function exactOrigin(value) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash
  ) throw new TypeError("Agent API origin must be one exact HTTPS origin");
  return parsed.origin;
}

function exactAgentCredential(value) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    value.kind !== "agent_dpop" || value.profile !== "agent_runtime" ||
    !IDENTIFIER.test(value.clientId ?? "") ||
    !IDENTIFIER.test(value.externalSubject ?? "") ||
    typeof value.issuer !== "string" ||
    typeof value.senderThumbprint !== "string"
  ) throw new TypeError("Agent DPoP bootstrap credential is invalid");
  return value;
}

function publicJwk(privateJwk) {
  if (
    !privateJwk || typeof privateJwk !== "object" || Array.isArray(privateJwk) ||
    privateJwk.kty !== "EC" || privateJwk.crv !== "P-256" ||
    privateJwk.alg !== "ES256" || typeof privateJwk.d !== "string" ||
    typeof privateJwk.kid !== "string"
  ) throw new TypeError("Agent workload private JWK is invalid");
  const { d: _private, key_ops: _operations, ...publicMaterial } = privateJwk;
  return Object.freeze({ ...publicMaterial, key_ops: ["verify"] });
}

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export async function createVercelGoldenFlowAgentClient({
  origin,
  bootstrap,
  workloadPrivateJwk,
  clock = () => new Date(),
  request
}) {
  const baseUrl = exactOrigin(origin);
  const credential = exactAgentCredential(
    bootstrap?.credentials?.find((entry) => entry?.kind === "agent_dpop")
  );
  if (bootstrap?.tenant?.tenantId === undefined || bootstrap?.policyVersion === undefined) {
    throw new TypeError("Agent bootstrap profile is incomplete");
  }
  const publicMaterial = publicJwk(workloadPrivateJwk);
  const thumbprint = await calculateJwkThumbprint(publicMaterial, "sha256");
  if (thumbprint !== credential.senderThumbprint) {
    throw new TypeError("Agent workload key does not match the bootstrapped sender constraint");
  }
  const signingKey = await importJWK(workloadPrivateJwk, "ES256");
  async function accessTokenProvider() {
    const now = Math.floor(clock().getTime() / 1_000);
    return new SignJWT({
      tenant_id: bootstrap.tenant.tenantId,
      actor_type: AGENT_PROFILE.actorType,
      client_id: credential.clientId,
      roles: [AGENT_PROFILE.roleBundle],
      capabilities: [...AGENT_PROFILE.capabilities],
      policy_version: bootstrap.policyVersion,
      cnf: { jkt: thumbprint }
    })
      .setProtectedHeader({ alg: "ES256", typ: "at+jwt", kid: workloadPrivateJwk.kid })
      .setIssuer(credential.issuer)
      .setSubject(credential.externalSubject)
      .setAudience(baseUrl)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .setJti(identifier("access"))
      .sign(signingKey);
  }
  async function dpopProofProvider({ accessToken, method, url }) {
    const now = Math.floor(clock().getTime() / 1_000);
    return new SignJWT({
      htm: method,
      htu: url,
      ath: createHash("sha256").update(accessToken).digest("base64url")
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicMaterial })
      .setIssuedAt(now)
      .setJti(identifier("dpop"))
      .sign(signingKey);
  }
  return new ProductionAgentClient({
    baseUrl,
    accessTokenProvider,
    dpopProofProvider,
    clock,
    ...(request === undefined ? {} : { request })
  });
}

function tenantRequest(operationId, args) {
  const base = {
    schemaVersion: "tenant_protocol_request.v1",
    operationId,
    requestId: args.requestId,
    correlationId: args.correlationId
  };
  if (operationId === "pilotReadAgentSelf") {
    return {
      ...base,
      payload: {},
      resource: { resourceType: "subject", resourceId: args.subjectId }
    };
  }
  if (operationId === "pilotRequestCredit") {
    return {
      ...base,
      payload: args.payload,
      resource: { resourceType: "subject", resourceId: args.subjectId },
      idempotencyKey: args.idempotencyKey
    };
  }
  if (operationId === "pilotReadCreditApplication") {
    return {
      ...base,
      payload: {},
      resource: { resourceType: "credit_intent", resourceId: args.creditIntentId }
    };
  }
  if (operationId === "pilotEvaluateCreditApplication") {
    return {
      ...base,
      payload: {},
      resource: { resourceType: "credit_intent", resourceId: args.creditIntentId },
      idempotencyKey: args.idempotencyKey
    };
  }
  throw new TypeError("Agent MCP tool is outside the production Golden Flow subset");
}

export function createProductionMcpHandle(client) {
  if (typeof client?.execute !== "function") throw new TypeError("Agent API client is required");
  return async (message) => {
    const name = message?.params?.name;
    const operationId = MCP_OPERATION_BY_TOOL[name];
    if (!operationId) throw new TypeError("Agent MCP tool is unavailable");
    const result = await client.execute(tenantRequest(
      operationId,
      message.params.arguments
    ));
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        isError: false,
        structuredContent: result
      }
    };
  };
}

export async function submitVercelAgentAccountProof({
  client,
  challenge,
  accountPrivateKey
}) {
  if (!PRIVATE_KEY.test(accountPrivateKey ?? "")) {
    throw new TypeError("Agent account proof private key is invalid");
  }
  const account = privateKeyToAccount(accountPrivateKey);
  const prepared = preparePrivatePilotAgentProof(challenge, {
    accountIds: {
      [challenge.chainId]: `${challenge.chainId}:${account.address.toLowerCase()}`
    }
  });
  const signature = await account.signTypedData(prepared.typedData);
  return client.execute({
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotSubmitAgentAccountProof",
    payload: {
      challengeId: prepared.challengeId,
      accountId: prepared.accountId,
      signature
    },
    resource: { resourceType: "subject", resourceId: prepared.subjectId },
    idempotencyKey: `vercel-agent-proof-${prepared.challengeId}`,
    requestId: identifier("request-agent-proof"),
    correlationId: identifier("correlation-agent-proof")
  });
}

export async function runVercelAgentApplication({ client, manifest }) {
  const workflow = new IpoOneAgentMcpClient({
    handle: createProductionMcpHandle(client),
    manifest,
    transportProfile: "mcp_stdio_local"
  });
  const receipt = await workflow.runCreditOfferWorkflow(
    createLocalAgentApplicationInput(manifest)
  );
  const continuation = await client.execute({
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotPersistAgentContinuationReceipt",
    payload: { receipt },
    resource: {
      resourceType: "credit_offer",
      resourceId: receipt.offer.creditOfferId
    },
    idempotencyKey: `vercel-agent-continuation-${manifest.mandateHash.slice(2, 26)}`,
    requestId: identifier("request-agent-continuation"),
    correlationId: receipt.correlationId
  });
  return Object.freeze({
    schemaVersion: "vercel_golden_flow_agent_application.v1",
    status: "offer_persisted",
    offerReceipt: receipt,
    continuation: continuation.response,
    sandboxOnly: true,
    productionFundsMoved: false
  });
}

export async function runVercelAgentRuntime({ client, manifest, offerReceipt }) {
  const approvedMinor = BigInt(offerReceipt?.offer?.approvedPrincipalMinor ?? "0");
  if (approvedMinor < 2n) {
    throw new TypeError("Agent Offer must support distinct partial and full repayment evidence");
  }
  const execute = client.execute.bind(client);
  const runtime = new IpoOneAgentSandboxObligationClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const baseInput = createLocalAgentRuntimeInput(manifest, offerReceipt);
  const partialMinor = (approvedMinor / 2n).toString();
  const workflowReceipt = await runtime.runObligationWorkflow({
    ...baseInput,
    repayment: {
      amountMinor: partialMinor,
      sourceCode: "synthetic_revenue"
    }
  });
  const outstandingMinor = (
    BigInt(workflowReceipt.obligation.outstandingPrincipalMinor) +
    BigInt(workflowReceipt.obligation.outstandingInterestMinor) +
    BigInt(workflowReceipt.obligation.outstandingFeesMinor)
  ).toString();
  if (outstandingMinor === "0") {
    throw new TypeError("Partial repayment unexpectedly closed the Agent Obligation");
  }
  const fullRepaymentCommand = {
    schemaVersion: "tenant_protocol_request.v1",
    operationId: "pilotPostSandboxRepayment",
    payload: {
      amountMinor: outstandingMinor,
      sourceCode: "synthetic_revenue"
    },
    resource: {
      resourceType: "obligation",
      resourceId: workflowReceipt.obligation.obligationId
    },
    idempotencyKey: `vercel-agent-full-repayment-${manifest.mandateHash.slice(2, 26)}`,
    requestId: identifier("request-agent-full-repayment"),
    correlationId: workflowReceipt.correlationId
  };
  const fullRepayment = await client.execute(fullRepaymentCommand);
  const duplicateRepayment = await client.execute(fullRepaymentCommand);
  if (duplicateRepayment.replayed !== true) {
    throw new TypeError("Duplicate repayment did not replay idempotently");
  }
  const evidenceClient = new IpoOneAgentEvidenceClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const evidence = await evidenceClient.readObligationEvidence({
    obligationId: workflowReceipt.obligation.obligationId,
    limit: 50,
    requestId: identifier("request-agent-evidence"),
    correlationId: workflowReceipt.correlationId
  });
  return Object.freeze({
    schemaVersion: "vercel_golden_flow_agent_runtime.v1",
    status: "fully_repaid_with_evidence",
    workflowReceipt,
    fullRepayment: fullRepayment.response,
    duplicateRepaymentReplayed: true,
    evidence,
    sandboxOnly: true,
    productionFundsMoved: false
  });
}
