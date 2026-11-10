import assert from 'node:assert/strict';
import test from 'node:test';
import {createB4HostedTestRuntime} from '../../../scripts/test-support/b4-hosted-runtime.mjs';
import {createHostedSyntheticFeeGovernance} from '../../../packages/domain/src/index.js';
test('B4-H cannot enable from a governance document without actual current actor enrollments; compatible OFF and independent remediation remain available',async()=>{
 const fixture=await createB4HostedTestRuntime();
 try {
  const {governanceHash:ignored,...core}=fixture.governance;
  const missingRisk=createHostedSyntheticFeeGovernance({...core,riskReviewerActorId:'actor_b4h_missing_reviewer'});
  await assert.rejects(fixture.restart({hostedSyntheticFeeGovernance:missingRisk}),{code:'hosted_synthetic_fee_enrollment_unavailable'});
  await fixture.start({hostedSyntheticFeeGovernance:missingRisk,syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:false});
  assert.equal((await fetch(fixture.localOrigin+'/readyz')).status,200);
  const missingInstitution=createHostedSyntheticFeeGovernance({...core,institutionOperatorActorId:'actor_b4h_missing_institution'});
  await assert.rejects(fixture.restart({hostedSyntheticFeeGovernance:missingInstitution,syntheticFeeCorrectionsEnabled:false}),{code:'hosted_synthetic_fee_enrollment_unavailable'});
  await fixture.start({hostedSyntheticFeeGovernance:missingInstitution,syntheticFeesEnabled:false,syntheticFeeCorrectionsEnabled:true});
  assert.equal((await fetch(fixture.localOrigin+'/readyz')).status,200);
 } finally {await fixture.close();}
});
