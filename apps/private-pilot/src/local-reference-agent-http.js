import { randomUUID } from "node:crypto";
import { RoleBundle } from "../../../modules/authorization/src/index.js";
import {
  HumanTenantCommandClient
} from "../../../modules/tenant-command-gateway/src/index.js";
import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  assertTenantProtocolResult
} from "../../../packages/api-contract/src/index.js";
import {
  IpoOneAgentEvidenceClient
} from "../../../packages/sdk/src/index.js";
import {
  createApplicationReadyAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "../../web/src/agent-handoff-manifest.js";
import {
  runLocalAgentApplicationWorkflow,
  runLocalAgentRuntimeWorkflow
} from "./agent-reference-workflows.js";

export const LOCAL_REFERENCE_AGENT_HTTP_ROUTES = Object.freeze({
  accountProof: "/local/v1/reference-agent/account-proof",
  application: "/local/v1/reference-agent/application",
  runtime: "/local/v1/reference-agent/runtime",
  runtimeStep: "/local/v1/reference-agent/runtime-step"
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;
const RUNTIME_STEP_ACTIONS = Object.freeze({
  ACCEPT_OFFER: "accept_offer",
  EXECUTE_ALLOWED_USE: "execute_allowed_use",
  POST_REPAYMENT: "post_repayment",
  READ_EVIDENCE: "read_evidence"
});
const REPAYMENT_SOURCES = new Set([
  "synthetic_wallet",
  "synthetic_bank",
  "synthetic_revenue"
]);

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function invalid(message) {
  throw new DomainError("local_reference_agent_request_invalid", message);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length &&
    actual.every((key, index) => key === required[index]);
}

function assertOfferReceipt(value, mandateId) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    value.schemaVersion !== "agent_credit_offer_workflow_receipt.v1" ||
    value.status !== "offer_ready" ||
    value.mandateId !== mandateId
  ) {
    invalid("The exact Agent Offer receipt is required");
  }
}

function assertRuntimeStepBody(value) {
  if (
    typeof value.action !== "string" ||
    !Object.values(RUNTIME_STEP_ACTIONS).includes(value.action) ||
    typeof value.mandateId !== "string" ||
    !IDENTIFIER.test(value.mandateId)
  ) {
    invalid("An exact Agent runtime action and Mandate ID are required");
  }
  if (value.action === RUNTIME_STEP_ACTIONS.ACCEPT_OFFER) {
    if (!exactKeys(value, ["action", "mandateId", "offerReceipt"])) {
      invalid("Reference Agent runtime-step fields are invalid");
    }
    assertOfferReceipt(value.offerReceipt, value.mandateId);
    return value;
  }
  if (
    typeof value.obligationId !== "string" ||
    !IDENTIFIER.test(value.obligationId)
  ) {
    invalid("An exact Agent Obligation ID is required");
  }
  if (value.action === RUNTIME_STEP_ACTIONS.POST_REPAYMENT) {
    if (
      !exactKeys(value, [
        "action",
        "amountMinor",
        "mandateId",
        "obligationId",
        "sourceCode"
      ]) ||
      typeof value.amountMinor !== "string" ||
      !POSITIVE_MINOR.test(value.amountMinor) ||
      !REPAYMENT_SOURCES.has(value.sourceCode)
    ) {
      invalid("Reference Agent repayment fields are invalid");
    }
    return value;
  }
  if (!exactKeys(value, ["action", "mandateId", "obligationId"])) {
    invalid("Reference Agent runtime-step fields are invalid");
  }
  return value;
}

function assertPrincipal(authenticationContext) {
  if (
    authenticationContext?.actorType !== "human" ||
    !authenticationContext.roles?.includes(RoleBundle.PRINCIPAL_CONTROLLER)
  ) {
    throw new DomainError(
      "authorization_denied",
      "Principal Controller access is required"
    );
  }
}

function assertBody(value, route) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid("Reference Agent request fields are invalid");
  }
  if (route === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.accountProof) {
    if (
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "subjectId") ||
      !Object.hasOwn(value, "challenge") ||
      typeof value.subjectId !== "string" ||
      !IDENTIFIER.test(value.subjectId) ||
      !value.challenge ||
      typeof value.challenge !== "object" ||
      Array.isArray(value.challenge) ||
      Object.getPrototypeOf(value.challenge) !== Object.prototype ||
      value.challenge.subjectId !== value.subjectId
    ) {
      invalid("The exact Agent Subject and account challenge are required");
    }
    return value;
  }
  if (
    typeof value.mandateId !== "string" ||
    !IDENTIFIER.test(value.mandateId)
  ) {
    invalid("An exact Mandate ID is required");
  }
  if (route === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtimeStep) {
    return assertRuntimeStepBody(value);
  }
  const required = route === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtime
    ? ["mandateId", "offerReceipt"]
    : ["mandateId"];
  if (
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    invalid("Reference Agent request fields are invalid");
  }
  if (route === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtime) {
    assertOfferReceipt(value.offerReceipt, value.mandateId);
  }
  return value;
}

function runtimeWorkflowId(manifest) {
  return `local-agent-obligation-${manifest.mandateHash.slice(2, 26)}`;
}

function runtimeIdentifier(workflowId, kind, step) {
  return `${kind}_agent_obligation:${workflowId}:${step}`;
}

function runtimeCommand(
  workflowId,
  sequence,
  operationId,
  resource,
  payload,
  { idempotent = true } = {}
) {
  const step = String(sequence).padStart(2, "0");
  return {
    schemaVersion: "tenant_protocol_request.v1",
    operationId,
    payload,
    resource,
    ...(idempotent
      ? {
          idempotencyKey: runtimeIdentifier(
            workflowId,
            "idempotency",
            step
          )
        }
      : {}),
    requestId: runtimeIdentifier(workflowId, "request", step),
    correlationId: runtimeIdentifier(workflowId, "correlation", "credit")
  };
}

function assertRuntimeStepResult(result, {
  obligationId,
  operationId,
  responseSchemaVersion,
  requireSandboxBoundary = true
}) {
  try {
    assertTenantProtocolResult(result);
  } catch {
    throw new DomainError(
      "local_reference_agent_response_invalid",
      "Reference Agent runtime response is invalid"
    );
  }
  if (
    result.operationId !== operationId ||
    result.response?.schemaVersion !== responseSchemaVersion ||
    (
      requireSandboxBoundary &&
      (
        result.response?.sandboxOnly !== true ||
        result.response?.productionFundsMoved !== false
      )
    ) ||
    (
      obligationId !== undefined &&
      result.response?.obligation?.obligationId !== obligationId
    )
  ) {
    throw new DomainError(
      "local_reference_agent_response_invalid",
      "Reference Agent runtime response is inconsistent"
    );
  }
  return result;
}

function runtimeStepReceipt(result, command) {
  return Object.freeze({
    operationId: result.operationId,
    requestId: command.requestId,
    replayed: result.replayed,
    responseSchemaVersion: result.response.schemaVersion
  });
}

async function runLocalAgentRuntimeStep({
  input,
  manifest,
  session
}) {
  const workflowId = runtimeWorkflowId(manifest);
  const execute = session.client.execute.bind(session.client);
  if (input.action === RUNTIME_STEP_ACTIONS.ACCEPT_OFFER) {
    const offer = input.offerReceipt.offer;
    const command = runtimeCommand(
      workflowId,
      1,
      "pilotAcceptCreditOffer",
      { resourceType: "credit_offer", resourceId: offer.creditOfferId },
      {
        expectedOfferHash: offer.creditOfferHash,
        expectedTermsHash: offer.termsHash,
        acknowledgementHash: hashId(
          "agent_offer_acknowledgement",
          `${manifest.mandateHash}:${offer.creditOfferHash}`
        )
      }
    );
    const result = assertRuntimeStepResult(await execute(command), {
      operationId: "pilotAcceptCreditOffer",
      responseSchemaVersion: "tenant_credit_offer_accepted.v1",
      requireSandboxBoundary: false
    });
    if (
      result.response.executionCreated !== false ||
      result.response.fundsAuthority !== false ||
      result.response.acceptance?.sandboxOnly !== true ||
      result.response.acceptance?.productionAuthority !== false ||
      result.response.obligation?.authorityId !== manifest.mandateId ||
      result.response.obligation?.subjectId !== manifest.subjectId ||
      result.response.obligation?.sandboxOnly !== true ||
      result.response.obligation?.productionFundsMoved !== false ||
      result.response.obligation?.executionStatus !== "pending"
    ) {
      throw new DomainError(
        "local_reference_agent_response_invalid",
        "Reference Agent Obligation creation response is inconsistent"
      );
    }
    return Object.freeze({
      status: "obligation_created",
      acceptance: result.response.acceptance,
      obligation: result.response.obligation,
      receipt: runtimeStepReceipt(result, command)
    });
  }
  if (input.action === RUNTIME_STEP_ACTIONS.EXECUTE_ALLOWED_USE) {
    const command = runtimeCommand(
      workflowId,
      2,
      "pilotExecuteSandboxObligation",
      { resourceType: "obligation", resourceId: input.obligationId },
      {}
    );
    const result = assertRuntimeStepResult(await execute(command), {
      obligationId: input.obligationId,
      operationId: "pilotExecuteSandboxObligation",
      responseSchemaVersion: "tenant_sandbox_obligation_executed.v1"
    });
    if (
      result.response.withdrawable !== false ||
      result.response.obligation?.executionStatus !== "executed" ||
      result.response.executionReceipt?.obligationId !== input.obligationId ||
      result.response.executionReceipt?.withdrawable !== false
    ) {
      throw new DomainError(
        "local_reference_agent_response_invalid",
        "Reference Agent allowed-use response is inconsistent"
      );
    }
    return Object.freeze({
      status: "approved_use_executed",
      executionReceipt: result.response.executionReceipt,
      obligation: result.response.obligation,
      principalLedgerTransactionId:
        result.response.principalLedgerTransactionId,
      receipt: runtimeStepReceipt(result, command)
    });
  }
  if (input.action === RUNTIME_STEP_ACTIONS.POST_REPAYMENT) {
    const command = runtimeCommand(
      workflowId,
      3,
      "pilotPostSandboxRepayment",
      { resourceType: "obligation", resourceId: input.obligationId },
      {
        amountMinor: input.amountMinor,
        sourceCode: input.sourceCode
      }
    );
    const result = assertRuntimeStepResult(await execute(command), {
      obligationId: input.obligationId,
      operationId: "pilotPostSandboxRepayment",
      responseSchemaVersion: "tenant_sandbox_repayment_posted.v1"
    });
    if (
      result.response.withdrawable !== false ||
      result.response.repayment?.obligationId !== input.obligationId ||
      result.response.repayment?.requestedMinor !== input.amountMinor
    ) {
      throw new DomainError(
        "local_reference_agent_response_invalid",
        "Reference Agent repayment response is inconsistent"
      );
    }
    return Object.freeze({
      status: "repayment_posted",
      obligation: result.response.obligation,
      repayment: result.response.repayment,
      receipt: runtimeStepReceipt(result, command)
    });
  }
  const evidenceClient = new IpoOneAgentEvidenceClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const evidence = await evidenceClient.readObligationEvidence({
    obligationId: input.obligationId,
    limit: 50,
    requestId: runtimeIdentifier(workflowId, "request", "04"),
    correlationId: runtimeIdentifier(workflowId, "correlation", "evidence")
  });
  return Object.freeze({
    status: "evidence_read",
    obligationId: input.obligationId,
    evidence
  });
}

export function createLocalReferenceAgentHttpService({
  createAgentSession,
  gateway,
  networkContext,
  proveAccount
}) {
  if (
    typeof createAgentSession !== "function" ||
    typeof gateway?.execute !== "function" ||
    !networkContext ||
    typeof proveAccount !== "function"
  ) {
    throw new DomainError(
      "invalid_local_reference_agent_service",
      "Local reference Agent service dependencies are invalid"
    );
  }

  return Object.freeze({
    routes: LOCAL_REFERENCE_AGENT_HTTP_ROUTES,
    async handle({
      request,
      url,
      authenticationContext,
      readJson,
      sendJson
    }) {
      if (!Object.values(LOCAL_REFERENCE_AGENT_HTTP_ROUTES).includes(url.pathname)) {
        return false;
      }
      if (request.method !== "POST") {
        throw new DomainError(
          "local_reference_agent_method_not_allowed",
          "Reference Agent actions require POST"
        );
      }
      assertPrincipal(authenticationContext);
      const input = assertBody(await readJson(), url.pathname);
      if (url.pathname === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.accountProof) {
        const proof = await proveAccount(input.challenge);
        return sendJson(200, {
          status: "account_bound",
          subjectId: proof.subjectId,
          subjectStatus: proof.subjectStatus,
          accountBinding: proof.accountBinding,
          challengeConsumed: proof.challengeConsumed,
          sandboxOnly: true,
          productionFundsMoved: false,
          credentialEnteredBrowser: false,
          signatureEnteredBrowser: false,
          schemaVersion: "local_reference_agent_account_proof_result.v1"
        });
      }
      const principalClient = new HumanTenantCommandClient({
        gateway,
        authenticationContextProvider: async () => authenticationContext,
        networkContextProvider: async () => networkContext
      });
      const mandateResult = await principalClient.getMandate({
        mandateId: input.mandateId,
        requestId: identifier("request-reference-agent-mandate"),
        correlationId: identifier("correlation-reference-agent")
      });
      const mandate = mandateResult.response.mandate;
      const manifest = url.pathname === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.application
        ? createApplicationReadyAgentHandoffManifest(mandate)
        : createReadyAgentHandoffManifest(mandate);
      if (!manifest) {
        throw new DomainError(
          "local_reference_agent_stage_invalid",
          url.pathname === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.application
            ? "A current Draft Mandate is required for the Agent application"
            : "A current active Mandate is required for the Agent runtime"
        );
      }

      const session = await createAgentSession(manifest);
      try {
        if (url.pathname === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.application) {
          const offerReceipt = await runLocalAgentApplicationWorkflow({
            manifest,
            session
          });
          return sendJson(200, {
            status: "offer_ready",
            mandateId: manifest.mandateId,
            subjectId: manifest.subjectId,
            offerReceipt,
            sandboxOnly: true,
            productionFundsMoved: false,
            credentialEnteredBrowser: false,
            schemaVersion: "local_reference_agent_application_result.v1"
          });
        }
        if (url.pathname === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtimeStep) {
          const step = await runLocalAgentRuntimeStep({
            input,
            manifest,
            session
          });
          return sendJson(200, {
            ...step,
            mandateId: manifest.mandateId,
            subjectId: manifest.subjectId,
            sandboxOnly: true,
            productionFundsMoved: false,
            withdrawable: false,
            credentialEnteredBrowser: false,
            schemaVersion: "local_reference_agent_runtime_step_result.v1"
          });
        }
        const lifecycle = await runLocalAgentRuntimeWorkflow({
          manifest,
          offerReceipt: input.offerReceipt,
          session
        });
        return sendJson(200, {
          status: lifecycle.status,
          mandateId: manifest.mandateId,
          subjectId: manifest.subjectId,
          obligationId: lifecycle.workflowReceipt.obligation.obligationId,
          evidenceEventCount: lifecycle.evidence.items.length,
          lifecycle,
          sandboxOnly: true,
          productionFundsMoved: false,
          credentialEnteredBrowser: false,
          schemaVersion: "local_reference_agent_runtime_result.v1"
        });
      } finally {
        await session.close();
      }
    }
  });
}
