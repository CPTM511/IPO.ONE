import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostedSyntheticFeeGovernance,HOSTED_SYNTHETIC_FEE_POLICY_HASH,HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH,HOSTED_SYNTHETIC_FEE_PROFILE} from '../../../packages/domain/src/index.js';
import {checkedHostedSyntheticFeeConfiguration,hostedManagementAccessForFees,HOSTED_SYNTHETIC_SOURCE_PROFILE} from '../src/hosted-synthetic-fee-configuration.js';
import {checkedHostedManagementAccess} from '../../../modules/authentication/src/hosted-management-access.js';
const governance=createHostedSyntheticFeeGovernance({schemaVersion:'hosted_synthetic_fee_governance.v1',tenantId:'tenant_hosted_test',institutionId:'urn:ipo-one:hosted:synthetic-capital-partner:tenant_hosted_test:primary',institutionOperatorActorId:'actor_institution',operationsActorId:'actor_ops',riskReviewerActorId:'actor_risk',operationsReviewerActorId:'actor_other_ops',auditorActorId:null,browserOrigin:'https://ipo.one',rpId:'ipo.one',feePolicyHash:HOSTED_SYNTHETIC_FEE_POLICY_HASH,sourcePolicyHash:HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH,approvalReference:'isolated_B4_H_test'});
const input={governance,tenantId:governance.tenantId,browserOrigin:'https://ipo.one',deploymentRole:'primary',noRealFunds:true};
test('B4-H configuration is default-off; protected correction and positive assessment are independent',()=>{
  assert.deepEqual(checkedHostedSyntheticFeeConfiguration({}),{syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:false});
  const off=checkedHostedSyntheticFeeConfiguration(input);assert.equal(off.syntheticFeesEnabled,false);assert.equal(off.syntheticFeeCorrectionsEnabled,false);
  const repair=checkedHostedSyntheticFeeConfiguration({...input,sourceProfile:HOSTED_SYNTHETIC_SOURCE_PROFILE});assert.equal(repair.syntheticFeesEnabled,false);assert.equal(repair.syntheticFeeCorrectionsEnabled,true);
  const on=checkedHostedSyntheticFeeConfiguration({...input,feeProfile:HOSTED_SYNTHETIC_FEE_PROFILE});assert.equal(on.syntheticFeesEnabled,true);assert.equal(on.syntheticFeeCorrectionsEnabled,false);
});
test('B4-H configuration rejects missing governance, local policy relabelling, mismatched targets and real value',()=>{
  for(const update of [{governance:undefined,feeProfile:HOSTED_SYNTHETIC_FEE_PROFILE},{governance:undefined,sourceProfile:HOSTED_SYNTHETIC_SOURCE_PROFILE},{feeProfile:'synthetic_usd_platform_fee.v1'},{feeProfile:'unknown'},{sourceProfile:'unknown'},{tenantId:'another_tenant'},{browserOrigin:'http://localhost:8907'},{deploymentRole:'risk'},{deploymentRole:'container'},{noRealFunds:false},{governance:{...governance,operationsActorId:'someone_else'}}])assert.throws(()=>checkedHostedSyntheticFeeConfiguration({...input,...update}));
});
test('B4-H Human access binding maps existing roles and separates two Operations workspaces without granting capabilities',()=>{
  const access=hostedManagementAccessForFees(governance);
  assert.deepEqual(checkedHostedManagementAccess(access,{tenantId:governance.tenantId,origin:governance.browserOrigin}),access);
  assert.deepEqual(access.bindings.map(b=>b.workspace),['capitalPartner','operations','riskReviewer','operationsReviewer']);
  assert.equal(access.bindings.some(b=>'capabilities' in b),false);
  assert.throws(()=>checkedHostedManagementAccess({...access,bindings:access.bindings.map(b=>b.workspace==='operationsReviewer'?{...b,workspace:'operations'}:b)},{tenantId:governance.tenantId,origin:governance.browserOrigin}));
});
