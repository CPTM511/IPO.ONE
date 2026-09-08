import assert from "node:assert/strict";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import { authorizationCommandPayloadHash } from "../src/local-approval-runtime.js";
import { createLocalReviewHandlers } from "../src/local-review-handlers.js";
import { readFile } from "node:fs/promises";
import { isTenantProtocolResult, isTenantProtocolRequest } from "../../../packages/api-contract/src/index.js";

test("the authorization payload stays bound to the proposed command when its approval artifact is attached", () => {
  const command={operationId:"pilotRestructureSandboxObligation",schemaVersion:"tenant_protocol_request.v1",
    resource:{resourceType:"obligation",resourceId:"obligation_local"},payload:{expectedServicingStateHash:"0x"+"a".repeat(64),additionalTermDays:30},reasonCode:"sandbox_hardship_restructure"};
  const approved={...command,approvalArtifact:{proposalId:"approval_proposal_local",proposalVersion:3}};
  assert.equal(authorizationCommandPayloadHash(command),authorizationCommandPayloadHash(approved));
  assert.notEqual(hashId("tenant_transport_identity",command),hashId("tenant_transport_identity",approved));
  for(const changed of [{...approved,payload:{...command.payload,additionalTermDays:31}},
    {...approved,resource:{...command.resource,resourceId:"obligation_other"}},{...approved,reasonCode:"sandbox_uncollectible_writeoff"}]) {
    assert.notEqual(authorizationCommandPayloadHash(command),authorizationCommandPayloadHash(changed));
  }
});

test("proposals cannot contain approval, identity, arbitrary commands or hidden fields", () => {
  const base={operationId:"pilotProposeApproval",schemaVersion:"tenant_protocol_request.v1",requestId:"request_review_contract",correlationId:"correlation_review_contract",idempotencyKey:"propose_contract_fixture",
    payload:{expiresAt:"2026-09-07T12:10:00.000Z",command:{operationId:"pilotWriteOffSandboxObligation",resource:{resourceType:"obligation",resourceId:"obligation_fixture"},payload:{expectedServicingStateHash:"0x"+"a".repeat(64)},reasonCode:"sandbox_uncollectible_writeoff",idempotencyKey:"execute_contract_fixture"}}};
  assert.ok(isTenantProtocolRequest(base));
  for(const command of [{...base.payload.command,approvalArtifact:{proposalId:"approval_a",proposalVersion:1}},
    {...base.payload.command,actorId:"actor_other"},{...base.payload.command,operationId:"pilotUnfreezeSubject"},
    {...base.payload.command,payload:{...base.payload.command.payload,amountMinor:"100"}}]) {
    assert.equal(isTenantProtocolRequest({...base,payload:{...base.payload,command}}),false);
  }
});

test("local review adapters fail closed when no exact local runtime was composed", async () => {
  for(const handler of createLocalReviewHandlers()) await assert.rejects(
    handler.kind==="query" ? handler.execute({payload:{}}) : handler.plan({payload:{}}),
    error=>error.code==="local_approval_unavailable");
});

test("the versioned servicing queue accepts the domain's zero-day grace state", async () => {
  const fixtures=JSON.parse(await readFile(new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",import.meta.url)));
  const result=structuredClone(fixtures.validResults.find(r=>r.operationId==="pilotReadServicingQueue"));
  const item=result.response.cases[0];
  Object.assign(item,{status:"delinquent",servicingClassification:"grace_period",daysPastDue:0,priority:"monitor",reviewCode:"grace_monitor"});
  delete item.latestServicingAction;
  result.response.filters.classifications=["grace_period"];
  assert.equal(isTenantProtocolResult(result),true);
  item.daysPastDue=-1;assert.equal(isTenantProtocolResult(result),false);
});
