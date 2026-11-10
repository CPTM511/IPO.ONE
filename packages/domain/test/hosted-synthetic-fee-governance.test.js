import assert from "node:assert/strict";
import test from "node:test";
import {createHostedSyntheticFeeGovernance,assertHostedSyntheticFeeGovernance,assertHostedSyntheticFeeActor,
  HOSTED_SYNTHETIC_FEE_POLICY_HASH,HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH} from "../src/index.js";
const input={schemaVersion:"hosted_synthetic_fee_governance.v1",tenantId:"tenant_hosted",institutionId:"urn:ipo-one:hosted:synthetic-capital-partner:tenant_hosted:primary",institutionOperatorActorId:"actor_institution",operationsActorId:"actor_ops",riskReviewerActorId:"actor_risk",operationsReviewerActorId:"actor_other_ops",auditorActorId:null,browserOrigin:"https://ipo.one",rpId:"ipo.one",feePolicyHash:HOSTED_SYNTHETIC_FEE_POLICY_HASH,sourcePolicyHash:HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH,approvalReference:"local_fixture_B4_H_20261110"};
test("B4-H deployment-owned governance binds one Tenant, institution, canonical origin and independent actors",()=>{
  const value=createHostedSyntheticFeeGovernance(input);
  assert.equal(assertHostedSyntheticFeeGovernance(value,{tenantId:"tenant_hosted"}).governanceHash,value.governanceHash);
  assertHostedSyntheticFeeActor(value,{tenantId:"tenant_hosted",actorId:"actor_ops",actorType:"operations_operator"});
  assertHostedSyntheticFeeActor(value,{tenantId:"tenant_hosted",actorId:"actor_institution",actorType:"human"},{institution:true});
  for(const update of [{browserOrigin:"https://other.example"},{rpId:"localhost"},{operationsReviewerActorId:"actor_ops"},{institutionId:input.institutionId.replace("tenant_hosted:","other_tenant:")},{feePolicyHash:"0x00"},{extra:true}])assert.throws(()=>createHostedSyntheticFeeGovernance({...input,...update}));
  assert.throws(()=>assertHostedSyntheticFeeGovernance({...value,operationsActorId:"actor_other"},{tenantId:"tenant_hosted"}));
  assert.throws(()=>assertHostedSyntheticFeeGovernance(value,{tenantId:"other_tenant"}));
  for(const update of [{actorId:"actor_outside"},{actorType:"human"},{tenantId:"other_tenant"}])assert.throws(()=>assertHostedSyntheticFeeActor(value,{tenantId:"tenant_hosted",actorId:"actor_ops",actorType:"operations_operator",...update}));
});

test("Tenant punctuation cannot broaden the institution namespace",()=>{
  assert.throws(()=>createHostedSyntheticFeeGovernance({...input,tenantId:"tenant.with_dot",institutionId:"urn:ipo-one:hosted:synthetic-capital-partner:tenantXwith_dot:primary"}));
  assert.doesNotThrow(()=>createHostedSyntheticFeeGovernance({...input,tenantId:"tenant.with_dot",institutionId:"urn:ipo-one:hosted:synthetic-capital-partner:tenant.with_dot:primary"}));
});
