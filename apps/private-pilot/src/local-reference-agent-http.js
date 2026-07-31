import { randomUUID } from "node:crypto";
import { RoleBundle } from "../../../modules/authorization/src/index.js";
import {
  HumanTenantCommandClient
} from "../../../modules/tenant-command-gateway/src/index.js";
import {
  DomainError
} from "../../../packages/domain/src/index.js";
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
  runtime: "/local/v1/reference-agent/runtime"
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function invalid(message) {
  throw new DomainError("local_reference_agent_request_invalid", message);
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
  const required = route === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtime
    ? ["mandateId", "offerReceipt"]
    : ["mandateId"];
  if (
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    invalid("Reference Agent request fields are invalid");
  }
  if (
    route === LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtime &&
    (
      !value.offerReceipt ||
      typeof value.offerReceipt !== "object" ||
      Array.isArray(value.offerReceipt) ||
      value.offerReceipt.schemaVersion !==
        "agent_credit_offer_workflow_receipt.v1" ||
      value.offerReceipt.status !== "offer_ready" ||
      value.offerReceipt.mandateId !== value.mandateId
    )
  ) {
    invalid("The exact Agent Offer receipt is required");
  }
  return value;
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
