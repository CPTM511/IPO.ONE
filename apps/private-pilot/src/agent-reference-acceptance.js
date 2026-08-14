import { randomUUID } from "node:crypto";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import {
  AgentTenantCommandClient,
  HumanTenantCommandClient
} from "../../../modules/tenant-command-gateway/src/index.js";
import { normalizeEvmCaip10 } from "../../../modules/chain-adapter/src/index.js";
import {
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  createApplicationReadyAgentHandoffManifest,
  createReadyAgentHandoffManifest
} from "../../web/src/agent-handoff-manifest.js";
import {
  persistLocalAgentContinuationReceipt,
  runLocalAgentApplicationWorkflow,
  runM1BAgentForeignOfferApplicationWorkflow,
  runLocalAgentRuntimeWorkflow
} from "./agent-reference-workflows.js";
import {
  deriveReferenceAgentAcceptanceSecret,
  loadReferenceAgentAcceptanceScope,
  requireReferenceAgentAcceptanceAction
} from "./agent-reference-acceptance-scope.js";
import { createDurableLocalAgentSession } from "./local-agent-session.js";
import { loadLocalAgentKeyMaterial } from "./local-authentication-material.js";
import { createLocalAgentProof } from "./local-durable-agent-authentication.js";
import {
  derivePrivatePilotAgentAccount,
  preparePrivatePilotAgentProof
} from "./private-pilot-agent-account.js";
import { loadOrCreatePrivatePilotDatabaseSecret } from "./private-pilot-database.js";
import {
  createPrivatePilotDurableAgentGateway,
  createPrivatePilotGateway
} from "./private-pilot-runtime.js";

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function foreignOfferMandateNonce(candidateReleaseId) {
  return `m1b.agent.foreign_offer.${candidateReleaseId}`;
}

async function findM1BAgentForeignOfferMandate({
  humanRuntime,
  controller,
  agentActorId,
  scope,
  subjectId
}) {
  if (scope.mode !== "exact_release") return null;
  const client = await humanRuntime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await setTenantTransactionContext(client, createTenantSecurityContext({
      tenantId: humanRuntime.authentication.profile.tenantId,
      actorId: controller.actorId,
      policyVersion: controller.createContext().policyVersion,
      source: "local_test"
    }));
    const result = await client.query(
      `SELECT m.id AS mandate_id
         FROM mandates m
         JOIN authorization_resource_bindings controller_binding
           ON controller_binding.tenant_id = m.tenant_id
          AND controller_binding.resource_type = 'mandate'
          AND controller_binding.resource_id = m.id
          AND controller_binding.actor_id = $1
          AND controller_binding.relationship = 'controller'
          AND controller_binding.status = 'active'
         JOIN authorization_resource_bindings agent_binding
           ON agent_binding.tenant_id = m.tenant_id
          AND agent_binding.resource_type = 'mandate'
          AND agent_binding.resource_id = m.id
          AND agent_binding.actor_id = $2
          AND agent_binding.relationship = 'subject'
          AND agent_binding.status = 'active'
        WHERE m.subject_id = $3 AND m.nonce = $4
        ORDER BY m.id
        LIMIT 2`,
      [
        controller.actorId,
        agentActorId,
        subjectId,
        foreignOfferMandateNonce(scope.candidateReleaseId)
      ]
    );
    await client.query("ROLLBACK");
    if (result.rowCount > 1) {
      throw new DomainError(
        "reference_agent_foreign_offer_ambiguous",
        "More than one foreign Agent Offer Mandate is bound to the candidate"
      );
    }
    return result.rows[0]?.mandate_id ?? null;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve read failure. */ }
    throw error;
  } finally {
    client.release();
  }
}

function safePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new DomainError(
      "reference_agent_foreign_offer_state_invalid",
      `Foreign Agent Offer ${name} is invalid`
    );
  }
  return number;
}

async function readM1BAgentForeignOfferSetupState({
  humanRuntime,
  agentIdentity,
  controllerActorId,
  scope,
  subjectId,
  canonicalMandateId,
  expectedWorkflowReceipt
}) {
  if (scope.mode !== "exact_release") return null;
  const tenantId = humanRuntime.authentication.profile.tenantId;
  const client = await humanRuntime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await setTenantTransactionContext(client, createTenantSecurityContext({
      tenantId,
      actorId: agentIdentity.actorId,
      policyVersion: agentIdentity.createContext().policyVersion,
      source: "local_test"
    }));
    const result = await client.query(
      `SELECT m.id AS mandate_id, m.status AS mandate_status,
              m.created_at AS mandate_created_at,
              ci.id AS credit_intent_id,
              rd.id AS risk_decision_id,
              o.id AS credit_offer_id, o.offer_hash, o.terms_hash,
              o.disclosure_ref, o.status AS offer_status,
              o.schema_version AS offer_schema_version, o.valid_until,
              o.created_at AS offer_created_at, o.accepted_at,
              o.sandbox_only, o.production_funds_approved,
              canonical.status AS canonical_mandate_status,
              canonical.updated_at AS canonical_mandate_updated_at,
              pg_postmaster_start_time() AS database_started_at,
              clock_timestamp() AS observed_at
         FROM mandates m
         JOIN credit_intents ci
           ON ci.tenant_id = m.tenant_id
          AND ci.subject_id = m.subject_id
          AND ci.authority_type = 'mandate'
          AND ci.authority_ref = m.id
         JOIN risk_decisions rd
           ON rd.tenant_id = ci.tenant_id
          AND rd.credit_intent_id = ci.id
         JOIN credit_offers o
           ON o.tenant_id = ci.tenant_id
          AND o.credit_intent_id = ci.id
          AND o.risk_decision_id = rd.id
         JOIN mandates canonical
           ON canonical.tenant_id = m.tenant_id AND canonical.id = $4
        WHERE m.tenant_id = $1 AND m.subject_id = $2 AND m.nonce = $3
        ORDER BY o.id
        LIMIT 2`,
      [
        tenantId,
        subjectId,
        foreignOfferMandateNonce(scope.candidateReleaseId),
        canonicalMandateId
      ]
    );
    if (result.rowCount !== 1) {
      throw new DomainError(
        "reference_agent_foreign_offer_state_invalid",
        "Exactly one foreign Agent offered-v1 application is required"
      );
    }
    const row = result.rows[0];
    const references = Object.freeze({
      agentActorId: agentIdentity.actorId,
      subjectId,
      canonicalMandateId,
      mandateId: row.mandate_id,
      creditIntentId: row.credit_intent_id,
      riskDecisionId: row.risk_decision_id,
      creditOfferId: row.credit_offer_id
    });
    if (
      row.mandate_status !== "draft" || row.offer_status !== "offered" ||
      row.offer_schema_version !== "credit_offer.v1" ||
      row.accepted_at !== null || row.sandbox_only !== true ||
      row.production_funds_approved !== false ||
      new Date(row.valid_until).getTime() <= new Date(row.observed_at).getTime() ||
      (
        row.canonical_mandate_status !== "draft" &&
        new Date(row.offer_created_at).getTime() >=
          new Date(row.canonical_mandate_updated_at).getTime()
      )
    ) {
      throw new DomainError(
        "reference_agent_foreign_offer_state_invalid",
        "Foreign Agent Offer is not an unaccepted pre-activation offered-v1 resource"
      );
    }
    if (expectedWorkflowReceipt && (
      expectedWorkflowReceipt.subjectId !== subjectId ||
      expectedWorkflowReceipt.mandateId !== row.mandate_id ||
      expectedWorkflowReceipt.creditIntent?.creditIntentId !== row.credit_intent_id ||
      expectedWorkflowReceipt.decision?.riskDecisionId !== row.risk_decision_id ||
      expectedWorkflowReceipt.offer?.creditOfferId !== row.credit_offer_id ||
      expectedWorkflowReceipt.offer?.creditOfferHash !== row.offer_hash ||
      expectedWorkflowReceipt.offer?.termsHash !== row.terms_hash
    )) {
      throw new DomainError(
        "reference_agent_foreign_offer_workflow_mismatch",
        "Foreign Agent application MCP receipt does not match PostgreSQL truth"
      );
    }
    const membershipResult = await client.query(
      `SELECT id, membership_hash, controller_actor_id, status, version,
              valid_from, expires_at, current_timestamp AS observed_at
         FROM memberships
        WHERE tenant_id = $1 AND actor_id = $2`,
      [tenantId, agentIdentity.actorId]
    );
    if (
      membershipResult.rowCount !== 1 ||
      membershipResult.rows[0].status !== "active" ||
      membershipResult.rows[0].controller_actor_id !== controllerActorId ||
      new Date(membershipResult.rows[0].valid_from).getTime() >
        new Date(membershipResult.rows[0].observed_at).getTime() ||
      (
        membershipResult.rows[0].expires_at !== null &&
        new Date(membershipResult.rows[0].expires_at).getTime() <=
          new Date(membershipResult.rows[0].observed_at).getTime()
      )
    ) {
      throw new DomainError(
        "reference_agent_foreign_offer_ownership_invalid",
        "Foreign Agent actor does not have one active membership"
      );
    }
    const resourceTargets = [
      ["subject", subjectId, "subject"],
      ["mandate", row.mandate_id, "subject"],
      ["credit_intent", row.credit_intent_id, "owner"],
      ["credit_offer", row.credit_offer_id, "owner"]
    ];
    const ownedResources = [];
    for (const [resourceType, resourceId, relationship] of resourceTargets) {
      const resourceResult = await client.query(
        `SELECT r.status, r.version AS resource_version,
                b.relationship, b.status AS binding_status,
                b.version AS binding_version
           FROM authorization_resources r
           JOIN authorization_resource_bindings b
             ON b.tenant_id = r.tenant_id
            AND b.resource_type = r.resource_type
            AND b.resource_id = r.resource_id
          WHERE r.tenant_id = $1 AND b.actor_id = $2
            AND r.resource_type = $3 AND r.resource_id = $4`,
        [tenantId, agentIdentity.actorId, resourceType, resourceId]
      );
      const resource = resourceResult.rows[0];
      if (
        resourceResult.rowCount !== 1 || resource.status !== "active" ||
        resource.binding_status !== "active" ||
        resource.relationship !== relationship
      ) {
        throw new DomainError(
          "reference_agent_foreign_offer_ownership_invalid",
          `Foreign Agent ownership is missing for ${resourceType}`
        );
      }
      ownedResources.push(Object.freeze({
        resourceType,
        resourceRefHash: hashId("m1_b_agent_foreign_offer_resource_reference", {
          resourceType,
          resourceId
        }),
        relationship,
        resourceVersion: safePositiveInteger(
          resource.resource_version,
          `${resourceType} resource version`
        ),
        bindingVersion: safePositiveInteger(
          resource.binding_version,
          `${resourceType} binding version`
        ),
        status: "active"
      }));
    }
    const countsResult = await client.query(
      `SELECT
         (SELECT count(*)::int FROM credit_offer_acceptances
           WHERE tenant_id = $1 AND credit_offer_id = $2) AS acceptance_count,
         (SELECT count(*)::int FROM obligations
           WHERE tenant_id = $1 AND credit_offer_id = $2) AS obligation_count,
         (SELECT count(*)::int FROM sandbox_execution_receipts r
           JOIN obligations o ON o.tenant_id = r.tenant_id AND o.id = r.obligation_id
          WHERE r.tenant_id = $1 AND o.credit_offer_id = $2) AS execution_count,
         (SELECT count(*)::int FROM repayment_events r
           JOIN obligations o ON o.tenant_id = r.tenant_id AND o.id = r.obligation_id
          WHERE r.tenant_id = $1 AND o.credit_offer_id = $2) AS repayment_count,
         (SELECT count(*)::int FROM ledger_transactions t
          WHERE t.tenant_id = $1 AND (
            (t.reference_type = 'obligation' AND t.reference_id IN (
              SELECT id FROM obligations WHERE tenant_id = $1 AND credit_offer_id = $2
            )) OR
            (t.reference_type = 'repayment' AND t.reference_id IN (
              SELECT r.id FROM repayment_events r JOIN obligations o
                ON o.tenant_id = r.tenant_id AND o.id = r.obligation_id
               WHERE r.tenant_id = $1 AND o.credit_offer_id = $2
            )))) AS ledger_transaction_count`,
      [tenantId, row.credit_offer_id]
    );
    const counts = countsResult.rows[0];
    const lifecycleAbsence = Object.freeze({
      acceptanceCount: safePositiveInteger(counts.acceptance_count, "acceptance count"),
      obligationCount: safePositiveInteger(counts.obligation_count, "obligation count"),
      executionCount: safePositiveInteger(counts.execution_count, "execution count"),
      repaymentCount: safePositiveInteger(counts.repayment_count, "repayment count"),
      ledgerTransactionCount: safePositiveInteger(
        counts.ledger_transaction_count,
        "ledger transaction count"
      )
    });
    if (Object.values(lifecycleAbsence).some((value) => value !== 0)) {
      throw new DomainError(
        "reference_agent_foreign_offer_lifecycle_continued",
        "Foreign Agent Offer has an acceptance or downstream economic effect"
      );
    }
    await client.query("ROLLBACK");
    const membership = membershipResult.rows[0];
    return Object.freeze({
      databaseStartedAt: new Date(row.database_started_at).toISOString(),
      observedAt: new Date(row.observed_at).toISOString(),
      references,
      ownershipProof: Object.freeze({
        agentActorRefHash: hashId("m1_b_agent_foreign_offer_actor_reference", {
          actorId: agentIdentity.actorId
        }),
        membershipRefHash: hashId("m1_b_agent_foreign_offer_membership_reference", {
          membershipId: membership.id,
          membershipHash: membership.membership_hash,
          controllerActorId: membership.controller_actor_id,
          version: safePositiveInteger(membership.version, "membership version")
        }),
        resourceManifestHash: hashId(
          "m1_b_agent_foreign_offer_resource_manifest",
          ownedResources
        ),
        ownedResources: Object.freeze(ownedResources),
        activeAgentOwnership: true
      }),
      offer: Object.freeze({
        creditOfferHash: row.offer_hash,
        termsHash: row.terms_hash,
        disclosureRef: row.disclosure_ref,
        status: "offered",
        schemaVersion: row.offer_schema_version,
        validUntil: new Date(row.valid_until).toISOString(),
        acceptedAt: null,
        sandboxOnly: true,
        productionFundsApproved: false
      }),
      lifecycleAbsence,
      canonicalMandateStatusAtSetup: "draft"
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve read failure. */ }
    throw error;
  } finally {
    client.release();
  }
}

function projectM1BAgentForeignOfferApplicationMcp(receipt) {
  if (
    receipt?.schemaVersion !== "agent_credit_offer_workflow_receipt.v1" ||
    receipt.status !== "offer_ready" ||
    receipt.transportProfile !== "mcp_stdio_local" ||
    receipt.nonAuthorizing !== true || receipt.fundsAuthority !== false ||
    receipt.credentialsIncluded !== false || receipt.remoteMcpEnabled !== false ||
    !Array.isArray(receipt.steps) || receipt.steps.length !== 4
  ) {
    throw new DomainError(
      "reference_agent_foreign_offer_mcp_invalid",
      "Foreign Agent Offer did not execute the exact four application MCP operations"
    );
  }
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    status: receipt.status,
    transportProfile: receipt.transportProfile,
    workflowId: receipt.workflowId,
    correlationId: receipt.correlationId,
    operationCount: receipt.steps.length,
    operations: Object.freeze(receipt.steps.map((step) => Object.freeze({
      sequence: step.sequence,
      tool: step.tool,
      operationId: step.operationId,
      requestId: step.requestId,
      replayed: step.replayed,
      responseSchemaVersion: step.responseSchemaVersion
    }))),
    nonAuthorizing: true,
    fundsAuthority: false,
    credentialsIncluded: false,
    remoteMcpEnabled: false
  });
}

async function createOrReconcileM1BAgentForeignOfferSetup({
  humanClient,
  humanRuntime,
  controller,
  agentIdentity,
  scope,
  subjectId,
  subjectCreatedAt,
  canonicalMandate
}) {
  if (scope.mode !== "exact_release" || scope.acceptancePhase !== "before_restart") {
    return null;
  }
  const existingMandateId = await findM1BAgentForeignOfferMandate({
    humanRuntime,
    controller,
    agentActorId: agentIdentity.actorId,
    scope,
    subjectId
  });
  let foreignMandate;
  if (existingMandateId) {
    const read = await humanClient.getMandate({
      mandateId: existingMandateId,
      requestId: `request-m1b-agent-foreign-mandate-read-${scope.candidateReleaseId.slice(0, 16)}`,
      correlationId: `correlation-m1b-agent-foreign-${scope.candidateReleaseId.slice(0, 20)}`
    });
    foreignMandate = read.response.mandate;
  } else {
    const now = new Date(subjectCreatedAt);
    const created = await humanClient.createDraftMandate({
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
        expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        nonce: foreignOfferMandateNonce(scope.candidateReleaseId),
        termsRef: "urn:ipo.one:terms:agent-credit-sandbox:v1"
      },
      idempotencyKey: `m1b-agent-foreign-mandate-${scope.candidateReleaseId}`,
      requestId: `request-m1b-agent-foreign-mandate-${scope.candidateReleaseId.slice(0, 20)}`,
      correlationId: `correlation-m1b-agent-foreign-${scope.candidateReleaseId.slice(0, 20)}`
    });
    const read = await humanClient.getMandate({
      mandateId: created.response.mandateId,
      requestId: `request-m1b-agent-foreign-mandate-read-${scope.candidateReleaseId.slice(0, 16)}`,
      correlationId: `correlation-m1b-agent-foreign-${scope.candidateReleaseId.slice(0, 20)}`
    });
    foreignMandate = read.response.mandate;
  }
  if (
    foreignMandate.status !== "draft" ||
    !new Set(["draft", "active"]).has(canonicalMandate.status) ||
    (canonicalMandate.status === "active" && !existingMandateId)
  ) {
    throw new DomainError(
      "reference_agent_foreign_offer_order_invalid",
      "Foreign Agent offered-v1 setup must occur before canonical Mandate activation"
    );
  }
  const handoff = createApplicationReadyAgentHandoffManifest(foreignMandate);
  if (!handoff) {
    throw new DomainError(
      "reference_agent_foreign_offer_handoff_invalid",
      "Foreign Agent draft Mandate did not create an application handoff"
    );
  }
  const session = await createDurableLocalAgentSession({
    databaseUrl: process.env.DATABASE_URL,
    manifest: handoff,
    networkSource: "m1_b_agent_foreign_offer_application"
  });
  let applicationReceipt;
  try {
    applicationReceipt = await runM1BAgentForeignOfferApplicationWorkflow({
      candidateReleaseId: scope.candidateReleaseId,
      manifest: handoff,
      session
    });
  } finally {
    await session.close();
  }
  const state = await readM1BAgentForeignOfferSetupState({
    humanRuntime,
    agentIdentity,
    controllerActorId: controller.actorId,
    scope,
    subjectId,
    canonicalMandateId: canonicalMandate.mandateId,
    expectedWorkflowReceipt: applicationReceipt
  });
  return Object.freeze({
    ...state,
    applicationMcp: projectM1BAgentForeignOfferApplicationMcp(applicationReceipt),
    createdBeforeRestartAt: state.observedAt
  });
}

async function findCurrentReferenceSubject({
  humanRuntime,
  controller,
  agentActorId,
  scope,
  expectedAccountHash
}) {
  const client = await humanRuntime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await setTenantTransactionContext(client, createTenantSecurityContext({
      tenantId: humanRuntime.authentication.profile.tenantId,
      actorId: controller.actorId,
      policyVersion: controller.createContext().policyVersion,
      source: "local_test"
    }));
    const exactRelease = scope.mode === "exact_release";
    const result = await client.query(
      `SELECT s.id AS subject_id,
              s.status AS subject_status,
              s.display_name,
              s.created_at AS subject_created_at,
              account.id AS account_binding_id,
              account.account_hash,
              challenge.id AS pending_challenge_id,
              challenge.expires_at AS pending_challenge_expires_at,
              challenge.account_hash AS pending_challenge_account_hash,
              (SELECT count(*)::integer
                 FROM agent_account_challenges all_challenges
                WHERE all_challenges.tenant_id = s.tenant_id
                  AND all_challenges.subject_id = s.id) AS challenge_count,
              line.id AS credit_line_id,
              line.facility_id,
              line.mandate_id,
              line.credit_intent_id,
              line.credit_offer_id,
              line.obligation_id,
              pg_postmaster_start_time() AS database_started_at
         FROM subjects s
         JOIN authorization_resource_bindings controller
           ON controller.tenant_id = s.tenant_id
          AND controller.resource_type = 'subject'
          AND controller.resource_id = s.id
          AND controller.actor_id = $1
         AND controller.relationship = 'controller'
          AND controller.status = 'active'
         JOIN authorization_resource_bindings agent_subject
           ON agent_subject.tenant_id = s.tenant_id
          AND agent_subject.resource_type = 'subject'
          AND agent_subject.resource_id = s.id
          AND agent_subject.actor_id = $2
          AND agent_subject.relationship = 'subject'
          AND agent_subject.status = 'active'
         JOIN memberships agent_membership
           ON agent_membership.tenant_id = s.tenant_id
          AND agent_membership.actor_id = agent_subject.actor_id
          AND agent_membership.controller_actor_id = $1
    LEFT JOIN account_bindings account
           ON account.tenant_id = s.tenant_id
          AND account.subject_id = s.id
          AND account.status = 'active'
          AND account.chain_id = 'eip155:1952'
          AND account.purpose = 'primary'
    LEFT JOIN agent_account_challenges challenge
           ON challenge.tenant_id = s.tenant_id
          AND challenge.subject_id = s.id
          AND challenge.status = 'pending'
    LEFT JOIN credit_lines line
           ON line.tenant_id = s.tenant_id
          AND line.subject_id = s.id
          AND line.asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'
        WHERE s.subject_type = 'agent'
          AND ${exactRelease
            ? "s.display_name = $3 AND s.status IN ('pending', 'active')"
            : "s.status = 'active' AND account.id IS NOT NULL"}
          AND (line.id IS NULL OR line.schema_version = 'credit_line.v2')
        ORDER BY (line.id IS NOT NULL) DESC,
                 s.created_at DESC,
                 s.id
        LIMIT 2`,
      exactRelease
        ? [controller.actorId, agentActorId, scope.displayName]
        : [controller.actorId, agentActorId]
    );
    await client.query("ROLLBACK");
    if (exactRelease && result.rowCount > 1) {
      throw new DomainError(
        "reference_agent_candidate_ambiguous",
        "more than one Agent Subject is bound to the exact acceptance candidate"
      );
    }
    const row = result.rows[0];
    if (!row) return null;
    if (exactRelease) {
      const pendingShape = (
        row.subject_status === "pending" &&
        !row.account_binding_id &&
        (
          !row.pending_challenge_id ||
          row.pending_challenge_account_hash === expectedAccountHash
        )
      );
      const activeShape = (
        row.subject_status === "active" &&
        row.account_binding_id &&
        row.account_hash === expectedAccountHash &&
        !row.pending_challenge_id
      );
      if (!pendingShape && !activeShape) {
        throw new DomainError(
          "reference_agent_candidate_binding_mismatch",
          "the exact acceptance candidate has an inconsistent Subject, challenge, or X Layer binding"
        );
      }
    }
    return {
      subjectId: row.subject_id,
      subjectStatus: row.subject_status,
      subjectCreatedAt: new Date(row.subject_created_at).toISOString(),
      ...(row.account_hash ? { accountHash: row.account_hash } : {}),
      databaseStartedAt: new Date(row.database_started_at).toISOString(),
      challengeCount: Number(row.challenge_count),
      ...(row.pending_challenge_id
        ? {
            pendingChallengeId: row.pending_challenge_id,
            pendingChallengeExpiresAt:
              new Date(row.pending_challenge_expires_at).toISOString()
          }
        : {}),
      ...(row.credit_line_id
        ? {
          recovery: {
            creditLineId: row.credit_line_id,
            facilityId: row.facility_id,
            mandateId: row.mandate_id,
            creditIntentId: row.credit_intent_id,
            creditOfferId: row.credit_offer_id,
            obligationId: row.obligation_id
          }
        }
        : {})
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original read failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function findCandidateLifecycle({
  humanRuntime,
  controller,
  agentActorId,
  scope,
  subjectId,
  expectedAccountHash
}) {
  if (scope.mode !== "exact_release") return null;
  const client = await humanRuntime.pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await setTenantTransactionContext(client, createTenantSecurityContext({
      tenantId: humanRuntime.authentication.profile.tenantId,
      actorId: controller.actorId,
      policyVersion: controller.createContext().policyVersion,
      source: "local_test"
    }));
    const result = await client.query(
      `SELECT m.id AS mandate_id,
              m.status AS mandate_status,
              m.mandate_hash,
              m.terms_hash,
              m.schema_version AS mandate_schema_version,
              receipt.status AS continuation_status,
              receipt.receipt_payload,
              line.id AS credit_line_id,
              line.facility_id,
              line.credit_intent_id,
              line.credit_offer_id,
              line.obligation_id,
              pg_postmaster_start_time() AS database_started_at
         FROM subjects s
         JOIN account_bindings account
           ON account.tenant_id = s.tenant_id
          AND account.subject_id = s.id
          AND account.status = 'active'
          AND account.chain_id = 'eip155:1952'
          AND account.purpose = 'primary'
          AND account.account_hash = $4
         JOIN mandates m
           ON m.tenant_id = s.tenant_id
          AND m.subject_id = s.id
          AND m.nonce = $5
          AND m.schema_version = 'mandate.v3'
         JOIN authorization_resource_bindings mandate_controller
           ON mandate_controller.tenant_id = m.tenant_id
          AND mandate_controller.resource_type = 'mandate'
          AND mandate_controller.resource_id = m.id
          AND mandate_controller.actor_id = $1
          AND mandate_controller.relationship = 'controller'
          AND mandate_controller.status = 'active'
         JOIN authorization_resource_bindings mandate_agent
           ON mandate_agent.tenant_id = m.tenant_id
          AND mandate_agent.resource_type = 'mandate'
          AND mandate_agent.resource_id = m.id
          AND mandate_agent.actor_id = $2
          AND mandate_agent.relationship = 'subject'
          AND mandate_agent.status = 'active'
         JOIN memberships agent_membership
           ON agent_membership.tenant_id = m.tenant_id
          AND agent_membership.actor_id = mandate_agent.actor_id
          AND agent_membership.controller_actor_id = $1
    LEFT JOIN workspace_continuation_receipts receipt
           ON receipt.tenant_id = m.tenant_id
          AND receipt.mandate_id = m.id
          AND receipt.actor_id = $2
    LEFT JOIN credit_lines line
           ON line.tenant_id = m.tenant_id
          AND line.subject_id = s.id
          AND line.mandate_id = m.id
          AND line.asset_id = 'urn:ipo-one:sandbox-asset:usd-cent'
          AND line.schema_version = 'credit_line.v2'
        WHERE s.id = $3
          AND s.status = 'active'
          AND s.display_name = $6
        ORDER BY m.id
        LIMIT 2`,
      [
        controller.actorId,
        agentActorId,
        subjectId,
        expectedAccountHash,
        scope.mandateNonce,
        scope.displayName
      ]
    );
    await client.query("ROLLBACK");
    if (result.rowCount > 1) {
      throw new DomainError(
        "reference_agent_candidate_lifecycle_ambiguous",
        "more than one lifecycle is bound to the exact acceptance candidate"
      );
    }
    const row = result.rows[0];
    if (!row) return null;
    return {
      mandateId: row.mandate_id,
      mandateStatus: row.mandate_status,
      mandateHash: row.mandate_hash,
      termsHash: row.terms_hash,
      mandateSchemaVersion: row.mandate_schema_version,
      databaseStartedAt: new Date(row.database_started_at).toISOString(),
      ...(row.receipt_payload
        ? {
            continuationStatus: row.continuation_status,
            offerReceipt: structuredClone(row.receipt_payload)
          }
        : {}),
      ...(row.credit_line_id
        ? {
            recovery: {
              creditLineId: row.credit_line_id,
              facilityId: row.facility_id,
              mandateId: row.mandate_id,
              creditIntentId: row.credit_intent_id,
              creditOfferId: row.credit_offer_id,
              obligationId: row.obligation_id
            }
          }
        : {})
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original read failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function ensureCurrentBoundAgentSubject({
  humanClient,
  humanRuntime,
  databaseUrl,
  scope
}) {
  const controller = humanRuntime.authentication.identities.controller;
  const agentIdentity = humanRuntime.authentication.identities.agent;
  const secret = await loadOrCreatePrivatePilotDatabaseSecret();
  const accountSecret = scope.mode === "exact_release"
    ? deriveReferenceAgentAcceptanceSecret(
        secret,
        humanRuntime.authentication.profile.tenantId,
        scope.candidateReleaseId
      )
    : secret;
  const account = derivePrivatePilotAgentAccount(accountSecret, {
    tenantId: humanRuntime.authentication.profile.tenantId
  });
  const expectedAccountHash = normalizeEvmCaip10(
    account.accountIds["eip155:1952"],
    "eip155:1952"
  ).accountHash;
  const currentSubject = await findCurrentReferenceSubject({
    humanRuntime,
    controller,
    agentActorId: agentIdentity.actorId,
    scope,
    expectedAccountHash
  });
  const currentLifecycle = currentSubject?.subjectStatus === "active"
    ? await findCandidateLifecycle({
        humanRuntime,
        controller,
        agentActorId: agentIdentity.actorId,
        scope,
        subjectId: currentSubject.subjectId,
        expectedAccountHash
      })
    : null;
  const action = requireReferenceAgentAcceptanceAction(scope, {
    ...currentSubject,
    recovery: scope.mode === "exact_release"
      ? currentLifecycle?.recovery
      : currentSubject?.recovery
  });
  if (action === "recover") {
    return {
      ...currentSubject,
      ...currentLifecycle,
      expectedAccountHash
    };
  }
  if (currentSubject?.subjectStatus === "active") {
    const { recovery: _currentRecovery, ...activeSubject } = currentSubject;
    return {
      ...activeSubject,
      candidateLifecycle: currentLifecycle,
      expectedAccountHash
    };
  }
  let subjectId = currentSubject?.subjectId;
  if (!subjectId) {
    const subject = await humanClient.createAgentSubject({
      payload: {
        subjectActorId: agentIdentity.actorId,
        displayName: scope.displayName ?? `IPO.ONE Reference Agent ${randomUUID()}`,
        jurisdiction: "US"
      },
      idempotencyKey: scope.mode === "exact_release"
        ? `m1b-agent-subject-${scope.candidateReleaseId}`
        : identifier("idempotency-agent-current-subject"),
      requestId: scope.mode === "exact_release"
        ? `request-m1b-agent-subject-${scope.candidateReleaseId.slice(0, 24)}`
        : identifier("request-agent-current-subject"),
      correlationId: scope.mode === "exact_release"
        ? `correlation-m1b-agent-${scope.candidateReleaseId.slice(0, 24)}`
        : identifier("correlation-agent-current-subject")
    });
    subjectId = subject.response.subjectId;
  }
  let databaseStartedAt = currentSubject?.databaseStartedAt;
  let subjectCreatedAt = currentSubject?.subjectCreatedAt;
  if (!databaseStartedAt || !subjectCreatedAt) {
    const databaseClock = await findCurrentReferenceSubject({
      humanRuntime,
      controller,
      agentActorId: agentIdentity.actorId,
      scope,
      expectedAccountHash
    });
    databaseStartedAt = databaseClock?.databaseStartedAt;
    subjectCreatedAt = databaseClock?.subjectCreatedAt;
  }
  const binding = await humanClient.getAgentAccountBinding({
    subjectId,
    requestId: identifier("request-agent-acceptance-binding"),
    correlationId: identifier("correlation-agent-acceptance")
  });
  if (
    binding.response.subjectStatus === "active" &&
    binding.response.accountBinding
  ) {
    const candidateLifecycle = await findCandidateLifecycle({
      humanRuntime,
      controller,
      agentActorId: agentIdentity.actorId,
      scope,
      subjectId,
      expectedAccountHash
    });
    return {
      subjectId,
      accountHash: expectedAccountHash,
      expectedAccountHash,
      databaseStartedAt,
      subjectCreatedAt,
      candidateLifecycle
    };
  }
  if (binding.response.subjectStatus !== "pending") {
    throw new DomainError(
      "reference_agent_subject_unavailable",
      "current reference Agent Subject is neither pending nor active"
    );
  }
  const onboardingCorrelationId =
    `correlation-agent-reference-onboarding-${subjectId}`;
  const pendingChallengeIsCurrent =
    currentSubject?.pendingChallengeId &&
    new Date(currentSubject.pendingChallengeExpiresAt).getTime() > Date.now();
  const challengeAttempt = Math.max(
    1,
    (currentSubject?.challengeCount ?? 0) + (pendingChallengeIsCurrent ? 0 : 1)
  );
  const challenge = await humanClient.createAgentAccountChallenge({
    subjectId,
    payload: {
      accountId: account.accountIds["eip155:1952"],
      purpose: "primary"
    },
    idempotencyKey: scope.mode === "exact_release"
      ? `m1b-agent-challenge-${scope.candidateReleaseId}-${challengeAttempt}`
      : identifier("local-agent-reference-challenge"),
    requestId: scope.mode === "exact_release"
      ? `request-m1b-agent-challenge-${scope.candidateReleaseId.slice(0, 16)}-${challengeAttempt}`
      : identifier("request-agent-reference-challenge"),
    correlationId: onboardingCorrelationId
  });
  const prepared = preparePrivatePilotAgentProof(
    challenge.response,
    account
  );
  const agentKey = await loadLocalAgentKeyMaterial(
    process.env.IPO_ONE_LOCAL_AGENT_KEY_FILE
  );
  const agentRuntime = await createPrivatePilotDurableAgentGateway(
    databaseUrl,
    { basePort: Number(process.env.IPO_ONE_PILOT_PORT ?? 8787) }
  );
  try {
    const client = new AgentTenantCommandClient({
      gateway: agentRuntime.gateway,
      authenticationContextProvider: async () =>
        agentRuntime.agentAuthenticator.authenticate({
          proof: await createLocalAgentProof({
            keyMaterial: agentKey,
            tenantId: agentRuntime.authentication.profile.tenantId,
            clientId: agentRuntime.authentication.identities.agent.clientId,
            policyVersion: agentRuntime.authentication.identities.agent
              .createContext().policyVersion,
            audience: agentRuntime.audience
          })
        }),
      networkContextProvider: async () => createTrustedNetworkContext({
        networkRefHash: hashId(
          "private_pilot_network",
          "local_agent_reference_account_proof"
        ),
        source: "local_test"
      })
    });
    const proof = await client.submitAccountProof({
      subjectId,
      payload: {
        challengeId: prepared.challengeId,
        accountId: prepared.accountId,
        signature: await account.signTypedData(prepared.typedData)
      },
      idempotencyKey: `local-agent-reference-proof-${prepared.challengeId}`,
      requestId: `request-agent-reference-proof-${prepared.challengeId}`,
      correlationId: onboardingCorrelationId
    });
    if (
      proof.response.status !== "active" ||
      proof.response.accountBinding?.status !== "active"
    ) {
      throw new DomainError(
        "reference_agent_account_proof_failed",
        "fresh Agent Subject did not activate after account proof"
      );
    }
    return {
      subjectId,
      accountHash: expectedAccountHash,
      expectedAccountHash,
      databaseStartedAt,
      subjectCreatedAt
    };
  } finally {
    await Promise.allSettled([
      agentRuntime.pool.end(),
      agentRuntime.authenticationPool.end()
    ]);
  }
}

function requireCanonicalRecoveryIds(recovery) {
  for (const [name, value] of Object.entries({
    creditLineId: recovery?.creditLineId,
    facilityId: recovery?.facilityId,
    mandateId: recovery?.mandateId,
    creditIntentId: recovery?.creditIntentId,
    creditOfferId: recovery?.creditOfferId,
    obligationId: recovery?.obligationId
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new DomainError(
        "reference_agent_recovery_projection_incomplete",
        `current credit_line.v2 is missing ${name}`
      );
    }
  }
}

function recoveryProof({
  subjectId,
  recovery,
  mandate,
  workspace,
  self,
  accountBinding,
  creditApplication,
  ownedObligation,
  evidence
}) {
  requireCanonicalRecoveryIds(recovery);
  const obligation = ownedObligation.obligation;
  const eventTypes = new Set(evidence.items.map((item) => item.eventType));
  const liveContinuation = workspace.continuationReceipts?.find(
    (receipt) => receipt.creditOfferId === recovery.creditOfferId
  );
  const valid = (
    mandate.subjectId === subjectId &&
    mandate.mandateId === recovery.mandateId &&
    mandate.schemaVersion === "mandate.v3" &&
    mandate.status === "active" &&
    mandate.sandboxOnly === true &&
    mandate.productionAuthority === false &&
    workspace.workspaceKind === "agent_runtime" &&
    workspace.schemaVersion === "tenant_workspace_resume_view.v2" &&
    workspace.serverTruth === true &&
    liveContinuation === undefined &&
    self.subject?.subjectId === subjectId &&
    self.subject?.status === "active" &&
    self.schemaVersion === "tenant_agent_subject_view.v2" &&
    accountBinding.subjectId === subjectId &&
    accountBinding.subjectStatus === "active" &&
    accountBinding.accountBinding?.status === "active" &&
    accountBinding.accountBinding?.chainId === "eip155:1952" &&
    accountBinding.schemaVersion === "tenant_agent_account_binding_view.v1" &&
    creditApplication.creditIntent?.creditIntentId === recovery.creditIntentId &&
    creditApplication.creditIntent?.subjectId === subjectId &&
    creditApplication.creditIntent?.authorityId === recovery.mandateId &&
    creditApplication.decision?.status === "approved" &&
    creditApplication.offer?.creditOfferId === recovery.creditOfferId &&
    creditApplication.offer?.status === "accepted" &&
    creditApplication.offer?.sandboxOnly === true &&
    creditApplication.offer?.productionFundsApproved === false &&
    creditApplication.schemaVersion === "tenant_credit_application_view.v2" &&
    obligation?.obligationId === recovery.obligationId &&
    obligation?.subjectId === subjectId &&
    obligation?.authorityId === recovery.mandateId &&
    obligation?.creditIntentId === recovery.creditIntentId &&
    obligation?.creditOfferId === recovery.creditOfferId &&
    obligation?.executionStatus === "executed" &&
    obligation?.status === "fully_repaid" &&
    obligation?.outstandingPrincipalMinor === "0" &&
    obligation?.outstandingInterestMinor === "0" &&
    obligation?.outstandingFeesMinor === "0" &&
    BigInt(obligation?.totalRepaidMinor ?? "0") > 0n &&
    ownedObligation.sandboxOnly === true &&
    ownedObligation.productionFundsMoved === false &&
    ownedObligation.schemaVersion === "tenant_owned_obligation_view.v1" &&
    evidence.obligationId === recovery.obligationId &&
    evidence.items.length > 0 &&
    evidence.items.every((item) => item.obligationId === recovery.obligationId) &&
    evidence.schemaVersion === "tenant_owned_obligation_evidence_view.v1" &&
    [
      "obligation_sandbox_executed",
      "ledger_transaction_posted",
      "repayment_posted"
    ].every((eventType) => eventTypes.has(eventType))
  );
  if (!valid) {
    throw new DomainError(
      "reference_agent_recovery_failed",
      "canonical Agent lifecycle reads did not prove the completed no-funds workflow"
    );
  }
  return {
    schemaVersion: "local_agent_reference_recovery_receipt.v1",
    status: "recovered",
    subjectId,
    mandateId: recovery.mandateId,
    creditIntentId: recovery.creditIntentId,
    creditOfferId: recovery.creditOfferId,
    obligationId: recovery.obligationId,
    facilityId: recovery.facilityId,
    creditLineId: recovery.creditLineId,
    continuationStatus: "not_actionable_after_acceptance",
    obligationStatus: obligation.status,
    executionStatus: obligation.executionStatus,
    repaymentStatus: "posted",
    evidenceEventCount: evidence.items.length,
    canonicalReadOperations: [
      "pilotReadMandate",
      "pilotReadWorkspaceResume",
      "pilotReadAgentSelf",
      "pilotReadAgentAccountBinding",
      "pilotReadCreditApplication",
      "pilotReadOwnObligation",
      "pilotReadOwnObligationEvidence"
    ],
    serverTruth: true,
    canonicalLifecycleReadOnly: true,
    lifecycleMutationPerformed: false,
    sandboxOnly: true,
    productionFundsMoved: false
  };
}

async function recoverCurrentReferenceAcceptance({
  humanClient,
  databaseUrl,
  subjectId,
  recovery,
  scope,
  accountHash,
  databaseStartedAt
}) {
  requireCanonicalRecoveryIds(recovery);
  const mandateRead = await humanClient.getMandate({
    mandateId: recovery.mandateId,
    requestId: identifier("request-agent-recovery-mandate"),
    correlationId: identifier("correlation-agent-recovery")
  });
  const runtimeHandoff = createReadyAgentHandoffManifest(
    mandateRead.response.mandate
  );
  if (!runtimeHandoff) {
    throw new DomainError(
      "reference_agent_recovery_mandate_unavailable",
      "current Agent Mandate cannot produce an active runtime handoff"
    );
  }
  const session = await createDurableLocalAgentSession({
    databaseUrl,
    manifest: runtimeHandoff,
    networkSource: "local_reference_agent_recovery"
  });
  try {
    const correlationId = identifier("correlation-agent-recovery");
    const workspace = await session.client.resumeWorkspace({
      requestId: identifier("request-agent-recovery-workspace"),
      correlationId
    });
    const self = await session.client.getSelf({
      subjectId,
      requestId: identifier("request-agent-recovery-self"),
      correlationId
    });
    const accountBinding = await session.client.getAccountBinding({
      subjectId,
      requestId: identifier("request-agent-recovery-binding"),
      correlationId
    });
    const application = await session.client.getCreditApplication({
      creditIntentId: recovery.creditIntentId,
      requestId: identifier("request-agent-recovery-application"),
      correlationId
    });
    const owned = await session.client.getOwnObligation({
      obligationId: recovery.obligationId,
      requestId: identifier("request-agent-recovery-obligation"),
      correlationId
    });
    const evidence = await session.client.getOwnObligationEvidence({
      obligationId: recovery.obligationId,
      limit: 50,
      requestId: identifier("request-agent-recovery-evidence"),
      correlationId
    });
    const recoveryReceipt = recoveryProof({
      subjectId,
      recovery,
      mandate: mandateRead.response.mandate,
      workspace: workspace.response,
      self: self.response,
      accountBinding: accountBinding.response,
      creditApplication: application.response,
      ownedObligation: owned.response,
      evidence: evidence.response
    });
    const candidateBinding = scope.mode === "exact_release"
      ? {
          candidateReleaseId: scope.candidateReleaseId,
          acceptancePhase: scope.acceptancePhase
        }
      : {};
    const applicationHandoff = {
      schemaVersion: "local_agent_reference_application_recovery.v1",
      status: "accepted_recovered",
      subjectId,
      mandateId: recovery.mandateId,
      creditIntentId: recovery.creditIntentId,
      serverTruth: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionAuthority: false
    };
    const offerReceipt = {
      schemaVersion: "local_agent_reference_offer_recovery.v1",
      status: "accepted_recovered",
      subjectId,
      mandateId: recovery.mandateId,
      creditIntent: application.response.creditIntent,
      decision: application.response.decision,
      offer: application.response.offer,
      continuationStatus: "not_actionable_after_acceptance",
      serverTruth: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsApproved: false
    };
    return {
      schemaVersion: "local_agent_reference_acceptance.v1",
      status: "passed",
      acceptanceMode: scope.mode === "exact_release"
        ? "after_restart_recovered"
        : "developer_recovered",
      ...candidateBinding,
      ...(scope.mode === "exact_release"
        ? { candidateMarker: scope.mandateNonce }
        : {}),
      accountHash,
      databaseStartedAt,
      subjectId,
      mandateId: recovery.mandateId,
      creditIntentId: recovery.creditIntentId,
      creditOfferId: recovery.creditOfferId,
      obligationId: recovery.obligationId,
      facilityId: recovery.facilityId,
      creditLineId: recovery.creditLineId,
      evidenceEventCount: evidence.response.items.length,
      applicationHandoff,
      offerReceipt,
      runtimeHandoff,
      recoveryReceipt,
      canonicalLifecycleReadOnly: true,
      lifecycleMutationPerformed: false,
      canonicalRecovery: {
        workspace: workspace.response,
        subject: self.response,
        accountBinding: accountBinding.response,
        creditApplication: application.response,
        obligation: owned.response,
        evidence: evidence.response
      },
      sandboxOnly: true,
      productionFundsMoved: false
    };
  } finally {
    await session.close();
  }
}

const humanRuntime = await createPrivatePilotGateway(
  process.env.DATABASE_URL
);
let agentSession;
try {
  const scope = loadReferenceAgentAcceptanceScope(process.env);
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
  const reference = await ensureCurrentBoundAgentSubject({
    humanClient,
    humanRuntime,
    databaseUrl: process.env.DATABASE_URL,
    scope
  });
  const subjectId = reference.subjectId;
  if (reference.recovery) {
    const recoveredAcceptance = await recoverCurrentReferenceAcceptance({
      humanClient,
      databaseUrl: process.env.DATABASE_URL,
      subjectId,
      recovery: reference.recovery,
      scope,
      accountHash: reference.expectedAccountHash,
      databaseStartedAt: reference.databaseStartedAt ??
        reference.candidateLifecycle?.databaseStartedAt
    });
    const foreignOfferSetupReconciliation = scope.mode === "exact_release"
      ? await readM1BAgentForeignOfferSetupState({
          humanRuntime,
          agentIdentity: humanRuntime.authentication.identities.agent,
          controllerActorId: controller.actorId,
          scope,
          subjectId,
          canonicalMandateId: reference.recovery.mandateId
        })
      : null;
    const acceptance = foreignOfferSetupReconciliation
      ? {
          ...recoveredAcceptance,
          foreignOfferSetupReconciliation: Object.freeze({
            schemaVersion: "m1_b_agent_foreign_offer_reconciliation.v1",
            ...foreignOfferSetupReconciliation,
            canonicalLifecycleReadOnly: true,
            lifecycleMutationPerformed: false,
            sandboxOnly: true,
            productionFundsMoved: false
          })
        }
      : recoveredAcceptance;
    process.stdout.write(`${JSON.stringify(acceptance, null, 2)}\n`);
  } else {
  const existingCandidate = reference.candidateLifecycle;
  let mandateId = existingCandidate?.mandateId;
  let mandate;
  if (mandateId) {
    const existingRead = await humanClient.getMandate({
      mandateId,
      requestId: identifier("request-agent-mandate-read"),
      correlationId: identifier("correlation-agent-acceptance")
    });
    mandate = existingRead.response.mandate;
  } else {
    const now = scope.mode === "exact_release"
      ? new Date(reference.subjectCreatedAt)
      : new Date();
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
        nonce: scope.mandateNonce ?? identifier("local-agent-reference"),
        termsRef: "urn:ipo.one:terms:agent-credit-sandbox:v1"
      },
      idempotencyKey: scope.mode === "exact_release"
        ? `m1b-agent-mandate-${scope.candidateReleaseId}`
        : identifier("idempotency-agent-mandate"),
      requestId: scope.mode === "exact_release"
        ? `request-m1b-agent-mandate-${scope.candidateReleaseId.slice(0, 24)}`
        : identifier("request-agent-mandate"),
      correlationId: identifier("correlation-agent-acceptance")
    });
    mandateId = mandateResult.response.mandateId;
    const createdRead = await humanClient.getMandate({
      mandateId,
      requestId: identifier("request-agent-mandate-read"),
      correlationId: identifier("correlation-agent-acceptance")
    });
    mandate = createdRead.response.mandate;
  }
  let offerReceipt = existingCandidate?.offerReceipt;
  const applicationHandoff = mandate.status === "draft"
    ? createApplicationReadyAgentHandoffManifest(mandate)
    : null;
  if (!offerReceipt) {
    if (!applicationHandoff) {
      throw new DomainError(
        "reference_agent_candidate_offer_unavailable",
        "active exact-candidate Mandate is missing its persisted Offer receipt"
      );
    }
    agentSession = await createDurableLocalAgentSession({
      databaseUrl: process.env.DATABASE_URL,
      manifest: applicationHandoff,
      networkSource: "local_reference_agent_application"
    });
    offerReceipt = await runLocalAgentApplicationWorkflow({
      manifest: applicationHandoff,
      session: agentSession
    });
    await persistLocalAgentContinuationReceipt({
      receipt: offerReceipt,
      session: agentSession
    });
    await agentSession.close();
    agentSession = undefined;
  }
  if (
    offerReceipt.status !== "offer_ready" ||
    offerReceipt.mandateId !== mandateId
  ) {
    throw new Error("Agent Offer receipt did not match the Draft Mandate");
  }
  const foreignOfferSetup = await createOrReconcileM1BAgentForeignOfferSetup({
    humanClient,
    humanRuntime,
    controller,
    agentIdentity: humanRuntime.authentication.identities.agent,
    scope,
    subjectId,
    subjectCreatedAt: reference.subjectCreatedAt,
    canonicalMandate: mandate
  });
  const activation = mandate.status === "active"
    ? { response: { mandate } }
    : await humanClient.activateSandboxMandate({
        mandateId,
        payload: {
          expectedMandateHash: mandate.mandateHash,
          acknowledgedTermsHash: mandate.termsHash,
          acknowledgementCode: "principal_authorizes_sandbox_credit_v1"
        },
        idempotencyKey: scope.mode === "exact_release"
          ? `m1b-agent-activate-${scope.candidateReleaseId}`
          : identifier("idempotency-agent-activate"),
        requestId: scope.mode === "exact_release"
          ? `request-m1b-agent-activate-${scope.candidateReleaseId.slice(0, 24)}`
          : identifier("request-agent-activate"),
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
  const completedCandidate = scope.mode === "exact_release"
    ? await findCandidateLifecycle({
        humanRuntime,
        controller,
        agentActorId: humanRuntime.authentication.identities.agent.actorId,
        scope,
        subjectId,
        expectedAccountHash: reference.expectedAccountHash
      })
    : null;
  if (scope.mode === "exact_release") {
    requireCanonicalRecoveryIds(completedCandidate?.recovery);
    if (
      completedCandidate.mandateId !== mandateId ||
      completedCandidate.offerReceipt?.offer?.creditOfferId !==
        completedCandidate.recovery.creditOfferId ||
      completedCandidate.recovery.obligationId !==
        lifecycle.workflowReceipt.obligation.obligationId ||
      completedCandidate.recovery.creditIntentId !==
        lifecycle.workflowReceipt.creditIntentId ||
      completedCandidate.recovery.creditOfferId !==
        lifecycle.workflowReceipt.creditOfferId ||
      lifecycle.mcpReceipt?.status !== "evidence_read"
    ) {
      throw new DomainError(
        "reference_agent_candidate_lifecycle_mismatch",
        "MCP result does not match the exact candidate's durable CreditLine lifecycle"
      );
    }
  }
  const completedRecovery = completedCandidate?.recovery;
  const recoveredApplicationHandoff = applicationHandoff ?? {
    schemaVersion: "local_agent_reference_application_recovery.v1",
    status: "offer_recovered",
    subjectId,
    mandateId,
    creditIntentId: offerReceipt.creditIntent.creditIntentId,
    serverTruth: true,
    nonAuthorizing: true,
    sandboxOnly: true,
    productionAuthority: false
  };
    process.stdout.write(`${JSON.stringify({
    schemaVersion: "local_agent_reference_acceptance.v1",
    status: "passed",
    acceptanceMode: scope.mode === "exact_release"
      ? "before_restart_executed"
      : "developer_executed",
    ...(scope.mode === "exact_release"
      ? {
          candidateReleaseId: scope.candidateReleaseId,
          acceptancePhase: scope.acceptancePhase,
          candidateMarker: scope.mandateNonce,
          accountHash: reference.expectedAccountHash,
          databaseStartedAt: completedCandidate.databaseStartedAt
        }
      : {}),
    subjectId,
    mandateId,
    creditIntentId: completedRecovery?.creditIntentId ??
      lifecycle.workflowReceipt.creditIntentId,
    creditOfferId: completedRecovery?.creditOfferId ??
      lifecycle.workflowReceipt.creditOfferId,
    obligationId: completedRecovery?.obligationId ??
      lifecycle.workflowReceipt.obligation.obligationId,
    ...(completedRecovery
      ? {
          facilityId: completedRecovery.facilityId,
          creditLineId: completedRecovery.creditLineId
        }
      : {}),
    evidenceEventCount: lifecycle.evidence.items.length,
    applicationHandoff: recoveredApplicationHandoff,
    offerReceipt,
    runtimeHandoff,
    lifecycle,
    ...(foreignOfferSetup ? { foreignOfferSetup } : {}),
    sandboxOnly: true,
    productionFundsMoved: false
  }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(
    `Local Agent acceptance failed: ${error?.code ?? error?.message ?? "unknown"}\n`
  );
  process.exitCode = 1;
} finally {
  await agentSession?.close();
  await humanRuntime.pool.end();
}
