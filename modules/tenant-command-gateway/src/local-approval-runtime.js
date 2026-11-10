import { checkedHostedFeeGovernance, assertSyntheticFeeLoanContext } from "./synthetic-fee-context.js";
import { hostedSyntheticFeeActorRole } from "../../../packages/domain/src/hosted-synthetic-fee-governance.js";
import { normalizeSyntheticFeeCorrectionPayload,loadSyntheticFeeCorrectionReview } from "./synthetic-fee-source-handlers.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { ApprovalService, ApprovalProjectionType } from "../../approval/src/index.js";
import { AuthorizationService } from "../../authorization/src/index.js";
import { normalizeResolutionPayload } from "./servicing-handlers.js";

export const LOCAL_SERVICING_REASONS = Object.freeze({
  pilotRestructureSandboxObligation: "sandbox_hardship_restructure",
  pilotRepurchaseSandboxObligation: "sandbox_contractual_repurchase",
  pilotCorrectSyntheticFeeSource: "synthetic_fee_source_correction",
  pilotWriteOffSandboxObligation: "sandbox_uncollectible_writeoff"
});
const unavailable = () => { throw new DomainError("local_approval_unavailable", "The reviewed local approval service or exact proposal is unavailable."); };

// The approval artifact proves authority over the command; it is not part of
// that command's payload hash. The separate transport identity still binds it.
export function authorizationCommandPayloadHash(envelope) {
  return hashId("tenant_command_payload", {
    operationId: envelope.operationId, schemaVersion: envelope.schemaVersion,
    payload: envelope.payload, resource: envelope.resource ?? null,
    purpose: envelope.purpose ?? null, reasonCode: envelope.reasonCode ?? null,
    approvalArtifact: null
  });
}

export function createLocalApprovalRuntimeFactory(options) { return createApprovalRuntimeFactory(options); }
export function createHostedApprovalRuntimeFactory({governance,...options}) {
  const hostedGovernance=checkedHostedFeeGovernance(governance);
  if(!hostedGovernance || typeof options.verifyRecordedProof!=="function")unavailable();
  return createApprovalRuntimeFactory({...options,hostedGovernance});
}
function createApprovalRuntimeFactory({ verifyRecordedProof,syntheticFeeCorrectionsEnabled=false,hostedGovernance }) {
  return async function createRuntime({ client, coreRepository, directory, authenticationContext,
    policyRegistry, credentialRegistry, referenceHasher, auditStore, handlers, livePolicyAdapterFactory }) {
    let feeScope;
    const commandActorId=hostedGovernance?.operationsActorId??"actor_web027m_operations";
    if(hostedGovernance) {
      const role=hostedSyntheticFeeActorRole(hostedGovernance,authenticationContext.actorId);
      if(authenticationContext.tenantId!==hostedGovernance.tenantId || !role || role==="capital_partner_operator")return undefined;
      if(authenticationContext.actorType!==role)unavailable();
      feeScope=syntheticFeeCorrectionsEnabled===true;
    } else {
      const database=(await client.query("SELECT current_database() AS name")).rows[0]?.name;
      feeScope=syntheticFeeCorrectionsEnabled===true && ["ipo_one_b4_fee_review","b4_fee_browser_test_20261109","b4_fee_integration_test_20261109"].includes(database);
      if(database!=="ipo_one_web027_candidate" && !feeScope)unavailable();
    }
    const allowedOperation=operation=>hostedGovernance?operation==="pilotCorrectSyntheticFeeSource":!!LOCAL_SERVICING_REASONS[operation];
    const recorded = new Map();
    let planned;
    const get = async (type, id) => (await coreRepository.getProjectionStateInTransaction(client, type, id, { lock: true }))?.value;
    const repository = {
      // Gateway admission and idempotency run before this adapter in this same transaction.
      async findCommand() { return undefined; },
      async commitCommand(plan) {
        if (planned) unavailable();
        planned = plan;
        return { response: plan.response, replayed: false };
      },
      async getApprovalProposal(id) {
        const proposal = await get(ApprovalProjectionType.APPROVAL_PROPOSAL, id);
        if (!proposal || proposal.tenantId !== authenticationContext.tenantId ||
            proposal.commandActorId !== commandActorId || !allowedOperation(proposal.operationId)) unavailable();
        return proposal;
      },
      async listApprovalDecisions(id) {
        const rows = await client.query("SELECT id FROM approval_decisions WHERE tenant_id=$1 AND proposal_id=$2 ORDER BY created_at,id", [authenticationContext.tenantId, id]);
        const decisions = [];
        for (const { id: decisionId } of rows.rows) {
          const decision = await get(ApprovalProjectionType.APPROVAL_DECISION, decisionId);
          if (!decision || decision.approvalProposalId !== id || decision.tenantId !== authenticationContext.tenantId) unavailable();
          recorded.set(decision.approverActorId, decision);
          decisions.push(decision);
        }
        return decisions;
      }
    };
    const approvalDirectory = {
      async requireActiveMembership(input) {
        if (input.actorId === authenticationContext.actorId) return directory.requireActiveMembership(input);
        // This path may inspect only the exact immutable approver already read
        // from this proposal. It never authorizes another actor's command.
        const d = recorded.get(input.actorId);
        if(hostedGovernance && ![hostedGovernance.riskReviewerActorId,hostedGovernance.operationsReviewerActorId].includes(input.actorId))unavailable();
        if (!d || input.tenantId !== authenticationContext.tenantId || input.tenantId !== d.tenantId ||
            input.actorType !== d.approverActorType || input.clientId !== d.approverClientId ||
            input.policyVersion !== d.policyVersion || !verifyRecordedProof || !(await verifyRecordedProof(d, input.now))) unavailable();
        const rows = await client.query(`SELECT m.*,a.actor_type FROM memberships m JOIN actors a ON a.id=m.actor_id
          WHERE m.tenant_id=$1 AND m.actor_id=$2 AND m.id=$3 AND m.role_bundle=$4 AND m.policy_version=$5
            AND m.client_ids ? $6 AND a.actor_type::text=$4 AND a.status='active' AND m.status='active'
            AND m.valid_from <= $7 AND (m.expires_at IS NULL OR m.expires_at > $7) FOR SHARE OF m,a`,
        [d.tenantId,d.approverActorId,d.approverMembershipId,d.approverRoleBundle,d.policyVersion,d.approverClientId,input.now]);
        if (rows.rowCount !== 1) unavailable();
        const m = rows.rows[0];
        return { membershipId:m.id, tenantId:m.tenant_id, actorId:m.actor_id, actorType:m.actor_type,
          roleBundle:m.role_bundle, capabilities:m.capabilities, clientIds:m.client_ids,
          policyVersion:m.policy_version, version:Number(m.version), status:m.status };
      }
    };
    const service = new ApprovalService({ repository, policyRegistry, directory: approvalDirectory, credentialRegistry, referenceHasher });
    return Object.freeze({
      service,
      repository,
      commandActorId,
      ...(hostedGovernance?{operationId:"pilotCorrectSyntheticFeeSource"}:{}),
      assertMutable() { if(hostedGovernance && !feeScope)unavailable(); },
      takePlan() { if (!planned) unavailable(); const plan = planned; planned = undefined; return plan; },
      async prepare(command, { requestId, correlationId, now }) {
        if (authenticationContext.actorId !== commandActorId || !allowedOperation(command.operationId) ||
            command.reasonCode !== LOCAL_SERVICING_REASONS[command.operationId]) unavailable();
        if(command.operationId==="pilotCorrectSyntheticFeeSource") {
          if(!feeScope)unavailable();
          normalizeSyntheticFeeCorrectionPayload(command.payload);
          const data=await loadSyntheticFeeCorrectionReview({client,coreRepository,payload:command.payload,authorizationDecision:{resourceId:command.resource.resourceId},now});
          if(hostedGovernance)assertSyntheticFeeLoanContext(hostedGovernance,{authenticationContext},data.obligation);
          if(data.review.expectedFeeStateHash!==command.payload.expectedFeeStateHash || data.review.expectedEffectsHash!==command.payload.expectedEffectsHash)throw new DomainError("synthetic_fee_correction_stale","Review the current source credit before proposing");
        } else {
          if(feeScope)unavailable();
          normalizeResolutionPayload(command.operationId, command.payload);
        }
        const handler = handlers.require(command.operationId);
        const authorization = new AuthorizationService({ policyRegistry, directory, credentialRegistry, auditStore, referenceHasher,
          livePolicyAdapter: livePolicyAdapterFactory({ client, coreRepository, handler, payload: command.payload }) });
        return authorization.prepareApproval({ authenticationContext, operationId:command.operationId,
          resource:command.resource, reasonCode:command.reasonCode, idempotencyKey:command.idempotencyKey,
          commandPayloadHash:authorizationCommandPayloadHash({ ...command, schemaVersion:"tenant_protocol_request.v1" }),
          requestId, correlationId, now });
      },
      async readCommand(proposal) {
        const rows = await client.query(`SELECT response_json,response_hash FROM command_idempotency WHERE tenant_id=$1
          AND aggregate_type='approval_proposal' AND aggregate_id=$2 AND status='completed'
          AND response_json->>'schemaVersion'='tenant_approval_proposed.v1'`, [authenticationContext.tenantId,proposal.approvalProposalId]);
        if (rows.rowCount !== 1) unavailable();
        const response = rows.rows[0].response_json;
        if (rows.rows[0].response_hash !== hashId("command_response",response) ||
            response.proposal?.proposalHash !== proposal.proposalHash || !response.command || !response.planSnapshot) unavailable();
        return {command:response.command,planSnapshot:response.planSnapshot,...(response.sourceCorrectionReview?{sourceCorrectionReview:response.sourceCorrectionReview}:{})};
      }
    });
  };
}
