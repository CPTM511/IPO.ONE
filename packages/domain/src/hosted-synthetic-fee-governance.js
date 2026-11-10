import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import { HOSTED_SYNTHETIC_FEE_POLICY_HASH } from "./synthetic-fees.js";
import { HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH } from "./synthetic-fee-source-policy.js";

const fields = ["schemaVersion","tenantId","institutionId","institutionOperatorActorId","operationsActorId",
  "riskReviewerActorId","operationsReviewerActorId","auditorActorId","browserOrigin","rpId",
  "feePolicyHash","sourcePolicyHash","approvalReference"];
const identifier = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(value);
const fail = () => { throw new DomainError("hosted_synthetic_fee_governance_invalid", "Exact reviewed hosted synthetic governance is required"); };

// A deployment-owned configuration document, never an operation payload. This
// validates its binding; it neither enrolls actors nor grants any capability.
export function createHostedSyntheticFeeGovernance(input) {
  if (!input || Object.getPrototypeOf(input)!==Object.prototype || Object.keys(input).length!==fields.length ||
      Object.values(Object.getOwnPropertyDescriptors(input)).some(d=>d.get||d.set) || fields.some(k=>!Object.hasOwn(input,k)) ||
      input.schemaVersion!=="hosted_synthetic_fee_governance.v1" || !(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(input.tenantId??"")) ||
      input.browserOrigin!=="https://ipo.one" || input.rpId!=="ipo.one" ||
      input.feePolicyHash!==HOSTED_SYNTHETIC_FEE_POLICY_HASH || input.sourcePolicyHash!==HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH ||
      !identifier(input.approvalReference) ||
      typeof input.institutionId!=="string" || !input.institutionId.startsWith(`urn:ipo-one:hosted:synthetic-capital-partner:${input.tenantId}:`) ||
      !/^[A-Za-z0-9_.-]{1,80}$/.test(input.institutionId.slice(`urn:ipo-one:hosted:synthetic-capital-partner:${input.tenantId}:`.length))) fail();
  const actors=[input.institutionOperatorActorId,input.operationsActorId,input.riskReviewerActorId,input.operationsReviewerActorId];
  if (input.auditorActorId!==null)actors.push(input.auditorActorId);
  if(actors.some(a=>!identifier(a)) || new Set(actors).size!==actors.length)fail();
  const core=Object.fromEntries(fields.map(k=>[k,input[k]]));
  return Object.freeze({...core,governanceHash:hashId("hosted_synthetic_fee_governance",core)});
}
export function assertHostedSyntheticFeeGovernance(input,{tenantId,browserOrigin="https://ipo.one"}={}) {
  if(!input || Object.getPrototypeOf(input)!==Object.prototype || Object.values(Object.getOwnPropertyDescriptors(input)).some(d=>d.get||d.set) || !Object.hasOwn(input,"governanceHash"))fail();
  const {governanceHash,...core}=input, expected=createHostedSyntheticFeeGovernance(core);
  if(governanceHash!==expected.governanceHash || tenantId!==expected.tenantId || browserOrigin!==expected.browserOrigin)fail();
  return expected;
}
export function hostedSyntheticFeeActorRole(governance,actorId) {
  if(actorId===governance.institutionOperatorActorId)return "capital_partner_operator";
  if(actorId===governance.operationsActorId || actorId===governance.operationsReviewerActorId)return "operations_operator";
  if(actorId===governance.riskReviewerActorId)return "risk_operator";
  if(governance.auditorActorId!==null && actorId===governance.auditorActorId)return "auditor";
  return undefined;
}
export function assertHostedSyntheticFeeActor(governance,authenticationContext,{institution=false}={}) {
  const expected=hostedSyntheticFeeActorRole(governance,authenticationContext.actorId);
  if(authenticationContext.tenantId!==governance.tenantId || !expected ||
      (institution ? authenticationContext.actorId!==governance.institutionOperatorActorId : expected==="capital_partner_operator") ||
      authenticationContext.actorType!==(expected==="capital_partner_operator"?"human":expected))throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
  return true;
}
