import {
  DomainError,
  assertConsentAuthorizesCreditOfferAcceptance
} from "../../../packages/domain/src/index.js";
import { RoleBundle } from "../../authorization/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  summarizeCreditDecision,
  summarizeCreditOffer
} from "./credit-decision-handlers.js";
import { summarizeCreditIntent } from "./credit-intent-handlers.js";

const RESOURCE_TYPES = Object.freeze([
  "subject",
  "consent",
  "credit_intent",
  "mandate",
  "obligation"
]);
const RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const PAGE_SIZE = 32;
const CONTROLLED_AGENT_LIMIT = 8;

function assertEmptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "Workspace recovery payload must be empty");
  }
}

function workspaceKind(authenticationContext) {
  const kinds = [
    authenticationContext.roles.includes(RoleBundle.HUMAN_BORROWER) && "human_borrower",
    authenticationContext.roles.includes(RoleBundle.PRINCIPAL_CONTROLLER) && "principal_controller",
    authenticationContext.roles.includes(RoleBundle.AGENT_RUNTIME) && "agent_runtime"
  ].filter(Boolean);
  if (kinds.length !== 1) {
    throw new DomainError(
      "workspace_recovery_unavailable",
      "Workspace recovery is unavailable for this authenticated role"
    );
  }
  return kinds[0];
}

function normalizeRow(row) {
  if (
    !row || typeof row !== "object" ||
    !RESOURCE_TYPES.includes(row.resource_type) ||
    typeof row.resource_id !== "string" || !IDENTIFIER.test(row.resource_id) ||
    !RELATIONSHIPS.has(row.relationship)
  ) {
    throw new DomainError("workspace_recovery_unavailable", "Workspace recovery state is invalid");
  }
  return Object.freeze({
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    relationship: row.relationship
  });
}

async function controlledAgentActorIds({ client, authenticationContext, kind, now }) {
  if (kind !== "principal_controller") return [];
  const result = await client.query(
    `SELECT m.actor_id
       FROM memberships AS m
       JOIN actors AS a ON a.id = m.actor_id
      WHERE m.tenant_id = $1
        AND m.controller_actor_id = $2
        AND m.status = 'active'
        AND a.status = 'active'
        AND a.actor_type = 'agent'
        AND m.valid_from <= $3
        AND (m.expires_at IS NULL OR m.expires_at > $3)
      ORDER BY m.actor_id ASC
      LIMIT $4`,
    [
      authenticationContext.tenantId,
      authenticationContext.actorId,
      now,
      CONTROLLED_AGENT_LIMIT + 1
    ]
  );
  if (result.rows.length > CONTROLLED_AGENT_LIMIT) {
    throw new DomainError(
      "workspace_recovery_unavailable",
      "Controlled Agent recovery exceeds the bounded workspace limit"
    );
  }
  const actorIds = result.rows.map((row) => row?.actor_id);
  if (
    actorIds.some((actorId) => typeof actorId !== "string" || !IDENTIFIER.test(actorId)) ||
    new Set(actorIds).size !== actorIds.length
  ) {
    throw new DomainError(
      "workspace_recovery_unavailable",
      "Controlled Agent recovery state is invalid"
    );
  }
  return actorIds;
}

async function continuationReceiptsForWorkspace({
  client,
  coreRepository,
  authenticationContext,
  kind,
  controlledAgents,
  now
}) {
  const actorIds = kind === "agent_runtime"
    ? [authenticationContext.actorId]
    : kind === "principal_controller"
      ? controlledAgents
      : [];
  const receipts = [];
  for (const actorId of actorIds) {
    receipts.push(...await coreRepository.listActiveWorkspaceContinuationReceiptsInTransaction(
      client,
      { actorId, now, limit: 16 }
    ));
  }
  return receipts
    .sort((left, right) => (
      left.expiresAt.localeCompare(right.expiresAt) ||
      left.continuationReceiptId.localeCompare(right.continuationReceiptId)
    ))
    .slice(0, 16);
}

async function actionableHumanOfferReview({
  client,
  coreRepository,
  directory,
  authenticationContext,
  intentResource,
  now
}) {
  try {
    const intentState = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.CREDIT_INTENT,
      intentResource.resourceId,
      { lock: false }
    );
    const intent = intentState?.value;
    if (
      !intent ||
      intent.creditIntentId !== intentResource.resourceId ||
      intent.status !== "decided" ||
      intent.authorityType !== "consent" ||
      intent.sandboxOnly !== true ||
      intent.productionFundsRequested !== false
    ) return null;

    const decision = await coreRepository.findRiskDecisionByCreditIntentInTransaction(
      client,
      intent.creditIntentId,
      { lock: false }
    );
    const offer = await coreRepository.findCreditOfferByIntentInTransaction(
      client,
      intent.creditIntentId,
      { lock: false }
    );
    const consentState = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.CONSENT_RECORD,
      intent.authorityRef,
      { lock: false }
    );
    if (!decision || !offer || !consentState?.value) return null;
    const decisionState = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.RISK_DECISION,
      decision.riskDecisionId,
      { lock: false }
    );
    const offerState = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.CREDIT_OFFER,
      offer.creditOfferId,
      { lock: false }
    );
    const offerResource = await directory.resolveResource({
      resourceType: "credit_offer",
      resourceId: offer.creditOfferId,
      tenantId: authenticationContext.tenantId,
      actorId: authenticationContext.actorId
    });
    const subjectResource = await directory.resolveResource({
      resourceType: "subject",
      resourceId: intent.subjectId,
      tenantId: authenticationContext.tenantId,
      actorId: authenticationContext.actorId
    });
    const consent = consentState.value;
    const consentResource = await directory.resolveResource({
      resourceType: "consent",
      resourceId: consent.consentId,
      tenantId: authenticationContext.tenantId,
      actorId: authenticationContext.actorId
    });
    const offerVersionMatchesTerms =
      (offer.schemaVersion === "credit_offer.v1" && offer.termsVersion === "credit_terms.v1") ||
      (offer.schemaVersion === "credit_offer.v2" && offer.termsVersion === "credit_terms.v2");
    if (
      decisionState?.value?.riskDecisionId !== decision.riskDecisionId ||
      offerState?.value?.creditOfferId !== offer.creditOfferId ||
      !Number.isSafeInteger(offerState.aggregateVersion) ||
      offerState.aggregateVersion < 1 ||
      offerResource?.status !== "active" ||
      offerResource.actorAuthorized !== true ||
      offerResource.bindingRelationship !== "owner" ||
      subjectResource?.status !== "active" ||
      subjectResource.actorAuthorized !== true ||
      subjectResource.bindingRelationship !== "owner" ||
      consentResource?.status !== "active" ||
      consentResource.actorAuthorized !== true ||
      consentResource.bindingRelationship !== "owner" ||
      decision.status !== "approved" ||
      decision.creditIntentId !== intent.creditIntentId ||
      decision.subjectId !== intent.subjectId ||
      decision.authorityType !== "consent" ||
      decision.authorityRef !== intent.authorityRef ||
      offer.status !== "offered" ||
      offer.creditIntentId !== intent.creditIntentId ||
      offer.riskDecisionId !== decision.riskDecisionId ||
      offer.subjectId !== intent.subjectId ||
      offer.assetId !== intent.assetId ||
      offer.sandboxOnly !== true ||
      offer.productionFundsApproved !== false ||
      !offerVersionMatchesTerms ||
      new Date(offer.validUntil).getTime() <= now.getTime()
    ) return null;
    assertConsentAuthorizesCreditOfferAcceptance(consent, { offer, intent, now });

    return {
      subjectId: intent.subjectId,
      consentId: consent.consentId,
      creditIntent: summarizeCreditIntent(intent),
      decision: summarizeCreditDecision(decision),
      offer: summarizeCreditOffer(offer),
      offerSchemaVersion: offer.schemaVersion,
      offerAggregateVersion: offerState.aggregateVersion,
      serverTruth: true,
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsApproved: false,
      fundsAuthority: false,
      schemaVersion: "human_offer_review_recovery.v1"
    };
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
}

async function humanOfferReviewForWorkspace({
  client,
  coreRepository,
  directory,
  authenticationContext,
  kind,
  resources,
  now
}) {
  if (kind !== "human_borrower") return undefined;
  if (!coreRepository || !directory) return null;
  const intents = resources.filter(({ resourceType }) => resourceType === "credit_intent");
  const candidates = [];
  for (const intentResource of intents) {
    const candidate = await actionableHumanOfferReview({
      client,
      coreRepository,
      directory,
      authenticationContext,
      intentResource,
      now
    });
    if (candidate) candidates.push(candidate);
    if (candidates.length > 1) return null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function readWorkspaceResumeQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadWorkspaceResume",
    kind: "query",
    async execute({ client, coreRepository, directory, payload, authenticationContext, now }) {
      assertEmptyPayload(payload);
      const kind = workspaceKind(authenticationContext);
      const result = await client.query(
        `WITH authorized_resources AS (
           SELECT b.resource_type, b.resource_id, b.relationship, b.updated_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY b.resource_type
                    ORDER BY b.updated_at DESC, b.resource_id ASC
                  ) AS type_rank,
                  b.resource_type = 'credit_intent' AND EXISTS (
                    SELECT 1
                      FROM credit_intents AS i
                      JOIN risk_decisions AS d
                        ON d.tenant_id = i.tenant_id
                       AND d.credit_intent_id = i.id
                       AND d.status = 'approved'
                      JOIN credit_offers AS o
                        ON o.tenant_id = i.tenant_id
                       AND o.credit_intent_id = i.id
                       AND o.risk_decision_id = d.id
                       AND o.status = 'offered'
                       AND o.valid_until > $5
                      JOIN consent_records AS c
                        ON c.tenant_id = i.tenant_id
                       AND c.id = i.authority_ref
                       AND c.status = 'active'
                       AND c.valid_from <= $5
                       AND c.expires_at > $5
                      JOIN authorization_resources AS offer_r
                        ON offer_r.tenant_id = o.tenant_id
                       AND offer_r.resource_type = 'credit_offer'
                       AND offer_r.resource_id = o.id
                       AND offer_r.status = 'active'
                      JOIN authorization_resource_bindings AS offer_b
                        ON offer_b.tenant_id = offer_r.tenant_id
                       AND offer_b.resource_type = offer_r.resource_type
                       AND offer_b.resource_id = offer_r.resource_id
                       AND offer_b.actor_id = $2
                       AND offer_b.status = 'active'
                     WHERE i.tenant_id = b.tenant_id
                       AND i.id = b.resource_id
                       AND i.status = 'decided'
                       AND i.authority_type = 'consent'
                  ) AS potentially_actionable
             FROM authorization_resource_bindings AS b
             JOIN authorization_resources AS r
               ON r.tenant_id = b.tenant_id
              AND r.resource_type = b.resource_type
              AND r.resource_id = b.resource_id
            WHERE b.tenant_id = $1
              AND b.actor_id = $2
              AND b.status = 'active'
              AND r.status = 'active'
              AND b.resource_type = ANY($3::text[])
         )
         SELECT resource_type, resource_id, relationship
           FROM authorized_resources
          WHERE potentially_actionable OR type_rank = 1
          ORDER BY potentially_actionable DESC, type_rank ASC,
                   updated_at DESC, resource_type ASC, resource_id ASC
          LIMIT $4`,
        [
          authenticationContext.tenantId,
          authenticationContext.actorId,
          RESOURCE_TYPES,
          PAGE_SIZE + 1,
          now
        ]
      );
      const rows = result.rows.map(normalizeRow);
      const controlledAgents = await controlledAgentActorIds({
        client,
        authenticationContext,
        kind,
        now
      });
      const continuationReceipts = await continuationReceiptsForWorkspace({
        client,
        coreRepository,
        authenticationContext,
        kind,
        controlledAgents,
        now
      });
      const resources = rows.slice(0, PAGE_SIZE);
      const humanOfferReview = await humanOfferReviewForWorkspace({
        client,
        coreRepository,
        directory,
        authenticationContext,
        kind,
        resources,
        now
      });
      return {
        workspaceKind: kind,
        resources,
        ...(kind === "principal_controller"
          ? { controlledAgentActorIds: controlledAgents }
          : {}),
        ...(kind === "human_borrower" ? { humanOfferReview } : {}),
        continuationReceipts: continuationReceipts.map((receipt) => ({
          continuationReceiptId: receipt.continuationReceiptId,
          receiptHash: receipt.receiptHash,
          subjectId: receipt.subjectId,
          mandateId: receipt.mandateId,
          creditOfferId: receipt.creditOfferId,
          creditOfferHash: receipt.creditOfferHash,
          offerAggregateVersion: receipt.offerAggregateVersion,
          expiresAt: receipt.expiresAt,
          receipt: receipt.receiptPayload,
          serverTruth: true,
          schemaVersion: "workspace_continuation_receipt_view.v1"
        })),
        hasMore: rows.length > PAGE_SIZE,
        serverTruth: true,
        schemaVersion: "tenant_workspace_resume_view.v2"
      };
    }
  });
}

export function createWorkspaceResumeHandlers() {
  return Object.freeze([readWorkspaceResumeQueryHandler()]);
}
