import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { summarizeSharedObligation } from "./credit-acceptance-handlers.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

function runtime(value) {
  if (!value) throw new DomainError("local_approval_unavailable", "The reviewed local servicing workspace is not configured.");
  return value;
}
function empty(payload) {
  if (!payload || Object.keys(payload).length) throw new DomainError("invalid_tenant_command_payload", "This read accepts an empty payload.");
}
function response(version, proposal, decisions, draft) {
  return { schemaVersion:version, proposal, decisions, command:draft.command, planSnapshot:draft.planSnapshot, sandboxOnly:true, productionFundsMoved:false };
}

export function createLocalReviewHandlers() {
  return Object.freeze([
    {
      operationId:"pilotProposeApproval", kind:"command",
      async plan(input) {
        const r = runtime(input.approvalRuntime);
        const preparation = await r.prepare(input.payload.command, input);
        const result = await r.service.propose({ approvalPreparation:preparation,
          authenticationContext:input.authenticationContext, idempotencyKey:input.idempotencyKey,
          expiresAt:input.payload.expiresAt, now:input.now });
        const plan = r.takePlan();
        return { ...plan,
          authorizationResource:{ resourceType:"approval_proposal", resourceId:result.proposal.approvalProposalId,
            actorBindings:[{ actorId:input.authenticationContext.actorId, actorType:input.authenticationContext.actorType, relationship:"owner" }] },
          response:response("tenant_approval_proposed.v1",result.proposal,result.decisions,{command:input.payload.command,
            planSnapshot:summarizeSharedObligation(await input.coreRepository.getProjectionInTransaction(input.client,CoreProjectionType.OBLIGATION,input.payload.command.resource.resourceId))}) };
      }
    },
    ...[
      ["pilotDecideApproval","decide","tenant_approval_decided.v1"],
      ["pilotCancelApproval","cancel","tenant_approval_canceled.v1"]
    ].map(([operationId,method,version]) => ({
      operationId, kind:"command",
      async plan(input) {
        const r = runtime(input.approvalRuntime);
        const result = await r.service[method]({ approvalProposalId:input.authorizationDecision.resourceId,
          expectedVersion:input.payload.expectedVersion,
          ...(method === "decide" ? { decision:input.payload.decision } : {}),
          reasonCode:input.reasonCode, authenticationContext:input.authenticationContext,
          idempotencyKey:input.idempotencyKey, now:input.now });
        return { ...r.takePlan(), response:response(version,result.proposal,result.decisions,await r.readCommand(result.proposal)) };
      }
    })),
    {
      operationId:"pilotReadApproval", kind:"query",
      async execute(input) {
        empty(input.payload);
        const r = runtime(input.approvalRuntime);
        const proposal = await r.repository.getApprovalProposal(input.authorizationDecision.resourceId);
        return response("tenant_approval_view.v1",proposal,await r.repository.listApprovalDecisions(proposal.approvalProposalId),await r.readCommand(proposal));
      }
    },
    {
      operationId:"pilotReadApprovalInbox", kind:"query",
      async execute(input) {
        empty(input.payload); runtime(input.approvalRuntime);
        const rows = await input.client.query(`SELECT id,operation_id,resource_id,status,version,expires_at,created_at
          FROM approval_proposals WHERE tenant_id=$1 AND command_actor_id='actor_web027m_operations'
          ORDER BY created_at DESC,id DESC LIMIT 26`, [input.authenticationContext.tenantId]);
        return { schemaVersion:"tenant_approval_inbox.v1", asOf:input.now.toISOString(), readOnly:true, serverTruth:true,
          hasMore:rows.rows.length > 25, proposals:rows.rows.slice(0,25).map(row => ({
            proposalId:row.id, operationId:row.operation_id, obligationId:row.resource_id, status:row.status,
            version:Number(row.version), expiresAt:new Date(row.expires_at).toISOString(), createdAt:new Date(row.created_at).toISOString()
          })) };
      }
    },
    {
      operationId:"pilotReadRiskAgentDirectory", kind:"query",
      async execute(input) {
        empty(input.payload); runtime(input.approvalRuntime);
        const rows = await input.client.query(`SELECT id FROM subjects WHERE tenant_id=$1 AND subject_type='agent'
          AND status IN ('active','pending') ORDER BY created_at DESC,id DESC LIMIT 26`, [input.authenticationContext.tenantId]);
        const agents = [];
        for (const row of rows.rows.slice(0,25)) {
          const s = await input.coreRepository.getProjectionInTransaction(input.client,CoreProjectionType.SUBJECT,row.id);
          if (!s || s.subjectType !== "agent" || !["active","pending"].includes(s.status)) continue;
          agents.push({ subjectId:s.subjectId, status:s.status, createdAt:s.createdAt,
            reference:hashId("local_agent_review_reference",s.subjectId).slice(2,10) });
        }
        return { schemaVersion:"tenant_risk_agent_directory.v1", agents, hasMore:rows.rows.length > 25,
          asOf:input.now.toISOString(), readOnly:true, serverTruth:true, piiIncluded:false };
      }
    }
  ]);
}
