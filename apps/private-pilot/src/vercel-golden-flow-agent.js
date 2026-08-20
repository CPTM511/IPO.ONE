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
  createAuthenticatedProtocolActionConfirmation,
  economicActionTypeForOperation
} from "../../../modules/tenant-command-gateway/src/economic-action-confirmation.js";
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
  audience,
  bootstrap,
  workloadPrivateJwk,
  clock = () => new Date(),
  request
}) {
  const baseUrl = exactOrigin(origin);
  const accessTokenAudience = audience === undefined
    ? baseUrl
    : exactOrigin(audience);
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
      .setAudience(accessTokenAudience)
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
  const applicationInput = createLocalAgentApplicationInput(manifest);
  const receipt = await workflow.runCreditOfferWorkflow(applicationInput);
  const replay = await workflow.runCreditOfferWorkflow(applicationInput);
  if (
    replay.creditIntent.creditIntentId !== receipt.creditIntent.creditIntentId ||
    replay.decision.riskDecisionId !== receipt.decision.riskDecisionId ||
    replay.offer?.creditOfferId !== receipt.offer?.creditOfferId ||
    replay.steps[1].replayed !== true ||
    replay.steps[3].replayed !== true
  ) {
    throw new TypeError("Agent application retry did not replay exact durable state");
  }
  let outOfScopeRejection;
  try {
    await client.execute({
      schemaVersion: "tenant_protocol_request.v1",
      operationId: "pilotRequestCredit",
      payload: {
        authorityId: manifest.mandateId,
        ...applicationInput.creditRequest,
        requestedPrincipalMinor:
          (BigInt(manifest.authority.aggregateLimitMinor) + 1n).toString()
      },
      resource: { resourceType: "subject", resourceId: manifest.subjectId },
      idempotencyKey: `vercel-agent-out-of-scope-${manifest.mandateHash.slice(2, 26)}`,
      requestId: identifier("request-agent-out-of-scope"),
      correlationId: receipt.correlationId
    });
  } catch (error) {
    outOfScopeRejection = error;
  }
  if (!outOfScopeRejection) {
    throw new TypeError("Out-of-scope Agent credit request was not rejected server-side");
  }
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
    applicationReplayConfirmed: true,
    outOfScopeRejectionCode:
      outOfScopeRejection.code ?? "agent_request_rejected",
    sandboxOnly: true,
    productionFundsMoved: false
  });
}

export function resolveVercelAgentOfferReceipt(input) {
  if (input?.schemaVersion !== "vercel_golden_flow_agent_application.v1") {
    return input;
  }
  if (
    input.status !== "offer_persisted" ||
    input.sandboxOnly !== true ||
    input.productionFundsMoved !== false ||
    input.offerReceipt?.schemaVersion !== "agent_credit_offer_workflow_receipt.v1"
  ) {
    throw new TypeError("Golden Flow Agent application output is not an eligible Offer receipt source");
  }
  return input.offerReceipt;
}

export function confirmVercelAgentEconomicCommand(command) {
  if (
    !economicActionTypeForOperation(command?.operationId) ||
    command.payload?.actionConfirmation
  ) return command;
  return {
    ...command,
    payload: {
      ...command.payload,
      actionConfirmation: createAuthenticatedProtocolActionConfirmation({
        operationId: command.operationId,
        payload: command.payload,
        resource: command.resource,
        requestId: command.requestId
      })
    }
  };
}

export async function runVercelAgentRuntime({ client, manifest, offerReceipt }) {
  const exactOfferReceipt = resolveVercelAgentOfferReceipt(offerReceipt);
  const approvedMinor = BigInt(exactOfferReceipt?.offer?.approvedPrincipalMinor ?? "0");
  if (approvedMinor < 2n) {
    throw new TypeError("Agent Offer must support distinct partial and full repayment evidence");
  }
  let failedCommand;
  const execute = async (command) => {
    const confirmedCommand = confirmVercelAgentEconomicCommand(command);
    try {
      return await client.execute(confirmedCommand);
    } catch (error) {
      failedCommand = Object.freeze({
        operationId: command.operationId,
        code: error?.code ?? "agent_operation_failed",
        requestId: error?.requestId
      });
      throw error;
    }
  };
  const runtime = new IpoOneAgentSandboxObligationClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const baseInput = createLocalAgentRuntimeInput(manifest, exactOfferReceipt);
  const partialMinor = (approvedMinor / 2n).toString();
  let workflowReceipt;
  try {
    workflowReceipt = await runtime.runObligationWorkflow({
      ...baseInput,
      repayment: {
        amountMinor: partialMinor,
        sourceCode: "synthetic_revenue"
      }
    });
  } catch (error) {
    if (failedCommand) {
      const failure = new TypeError(
        `Golden Flow Agent ${failedCommand.operationId} failed with ${failedCommand.code}`,
        { cause: error }
      );
      failure.code = failedCommand.code;
      failure.requestId = failedCommand.requestId;
      throw failure;
    }
    throw error;
  }
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
  const fullRepayment = await execute(fullRepaymentCommand);
  const duplicateRepayment = await execute(fullRepaymentCommand);
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
  const recovery = await runVercelAgentRecovery({
    client,
    manifest,
    obligationId: workflowReceipt.obligation.obligationId
  });
  return Object.freeze({
    schemaVersion: "vercel_golden_flow_agent_runtime.v1",
    status: "fully_repaid_with_evidence",
    workflowReceipt,
    fullRepayment: fullRepayment.response,
    duplicateRepaymentReplayed: true,
    evidence,
    creditState: recovery.creditState,
    recoveredObligation: recovery.obligation,
    terminalOutcomeConfirmed: recovery.terminalOutcomeConfirmed,
    sandboxOnly: true,
    productionFundsMoved: false
  });
}

async function readCreditStateWithRetry({ client, manifest, correlationId }) {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      return await client.execute({
        schemaVersion: "tenant_protocol_request.v1",
        operationId: "pilotReadOwnCreditState",
        payload: {},
        resource: { resourceType: "subject", resourceId: manifest.subjectId },
        requestId: identifier(`request-agent-credit-state-${attempt}`),
        correlationId
      });
    } catch (error) {
      lastError = error;
      if (attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  throw lastError;
}

export async function runVercelAgentRecovery({
  client,
  manifest,
  obligationId,
  passportArtifactId
}) {
  if (!IDENTIFIER.test(obligationId ?? "")) {
    throw new TypeError("Agent recovery Obligation is invalid");
  }
  const correlationId = identifier("correlation-agent-recovery");
  const [obligationResult, creditStateResult] = await Promise.all([
    client.execute({
      schemaVersion: "tenant_protocol_request.v1",
      operationId: "pilotReadOwnObligation",
      payload: {},
      resource: { resourceType: "obligation", resourceId: obligationId },
      requestId: identifier("request-agent-obligation-recovery"),
      correlationId
    }),
    readCreditStateWithRetry({ client, manifest, correlationId })
  ]);
  const obligation = obligationResult.response?.obligation;
  const creditState = creditStateResult.response?.creditState;
  if (
    obligation?.obligationId !== obligationId ||
    obligation.subjectId !== manifest.subjectId ||
    obligation.authorityId !== manifest.mandateId ||
    obligation.status !== "fully_repaid" ||
    obligation.outstandingPrincipalMinor !== "0" ||
    obligation.outstandingInterestMinor !== "0" ||
    obligation.outstandingFeesMinor !== "0" ||
    creditState?.subjectId !== manifest.subjectId ||
    creditState.latestOutcome?.obligationId !== obligationId ||
    creditState.latestOutcome?.outcomeLabel !== "on_time_repaid" ||
    creditState.metrics?.completedCycleCount < 1 ||
    creditState.trackRecord?.filter((entry) => entry.obligationId === obligationId).length !== 1
  ) {
    throw new TypeError("Agent terminal Obligation and Credit State recovery are inconsistent");
  }
  const evidenceClient = new IpoOneAgentEvidenceClient({
    execute: client.execute.bind(client),
    manifest,
    transportProfile: "local_in_process"
  });
  const evidence = await evidenceClient.readObligationEvidence({
    obligationId,
    limit: 50,
    requestId: identifier("request-agent-recovery-evidence"),
    correlationId
  });
  if (!Array.isArray(evidence.items) || evidence.items.length < 1) {
    throw new TypeError("Agent recovery Evidence is unavailable");
  }
  let passport;
  if (passportArtifactId !== undefined) {
    if (!IDENTIFIER.test(passportArtifactId)) {
      throw new TypeError("Agent Credit Passport artifact is invalid");
    }
    const passportResult = await client.execute({
      schemaVersion: "tenant_protocol_request.v1",
      operationId: "pilotReadOwnCreditPassportArtifact",
      payload: {},
      resource: {
        resourceType: "credit_passport_artifact",
        resourceId: passportArtifactId
      },
      requestId: identifier("request-agent-passport-recovery"),
      correlationId
    });
    passport = passportResult.response?.artifact;
    if (
      passport?.creditPassportArtifactId !== passportArtifactId ||
      passport.subjectId !== manifest.subjectId ||
      passport.sandboxOnly !== true ||
      passport.productionAuthority !== false ||
      passport.piiIncluded !== false
    ) {
      throw new TypeError("Agent Credit Passport recovery is inconsistent");
    }
  }
  return Object.freeze({
    schemaVersion: "vercel_golden_flow_agent_recovery.v1",
    status: "terminal_state_recovered",
    obligation,
    creditState,
    evidence,
    ...(passport === undefined ? {} : { passport }),
    terminalOutcomeConfirmed: true,
    retrySafe: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    privateKeyIncluded: false
  });
}
