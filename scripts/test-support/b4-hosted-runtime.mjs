import {calculateJwkThumbprint,importJWK} from "jose";
import {request as httpRequest} from "node:http";
import {createVercelGoldenFlowAgentClient} from "../../apps/private-pilot/src/vercel-golden-flow-agent.js";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:net";
import pg from "pg";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createB4HostedTestDatabase } from "./b4-hosted-database.mjs";
import { rehearseB4HostedAtomicMigration } from "../b4-hosted-local-migration.mjs";
import { bootstrapProductionDatabase, PRODUCTION_BOOTSTRAP_PROFILES } from "../../apps/private-pilot/src/production-bootstrap.js";
import { createProductionClosedPilotRuntime } from "../../apps/private-pilot/src/production-runtime.js";
import { createHostedSyntheticMeteredProvider } from "../../apps/private-pilot/src/local-synthetic-metered-provider.js";
import { createReferenceHashKeyring, loadAuthenticationRuntimeConfig } from "../../modules/authentication/src/index.js";
import { EvmWalletSignatureVerifier, EvmAccountProofAdapter, BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE } from "../../modules/chain-adapter/src/index.js";
import { createTenantSecurityContext, setTenantTransactionContext } from "../../modules/persistence/src/index.js";
import { createTrustedNetworkContext, abuseHash } from "../../modules/abuse-control/src/index.js";
import { PilotCapability as C } from "../../modules/authorization/src/index.js";
import { hashId, createOperationalId, createHostedSyntheticFeeGovernance, HOSTED_SYNTHETIC_FEE_POLICY_HASH, HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH } from "../../packages/domain/src/index.js";

const origin="https://ipo.one";
const secretRef="vercel://environment/production/B4_H_TEST_SECRET@sha256:"+"a".repeat(64);

// Invocation persists disposable test identities. Execution remains gated by
// the explicit local-fixture approval; this module never enrolls production.
export async function createB4HostedTestRuntime({feesEnabled=true,correctionsEnabled=true,withAgent=false}={}) {
  const db=await createB4HostedTestDatabase();
  const suffix=randomBytes(6).toString("hex");
  const tenantId=`tenant_b4h_${suffix}`,systemActorId=`actor_b4h_system_${suffix}`,walletClientId=`client_b4h_wallet_${suffix}`;
  const gatewayRole=`b4h_gateway_${suffix}`,authenticationRole=`b4h_auth_${suffix}`;
  const gatewayPassword=randomBytes(32).toString("base64url"),authenticationPassword=randomBytes(32).toString("base64url");
  const referenceHashKey=randomBytes(32),encryptionKey=randomBytes(32),edgeAssertion=randomBytes(32).toString("base64url");
  const accounts=Object.fromEntries(["borrower","capitalPartner","operations","riskReviewer","operationsReviewer","auditor",...(withAgent?["controller","agent"]:[])].map(key=>[key,privateKeyToAccount(generatePrivateKey())]));
  const actors=Object.fromEntries(Object.keys(accounts).map(key=>[key,`actor_b4h_${key}_${suffix}`]));
  const hasher=createReferenceHashKeyring({mode:"single_v2",primary:{keyVersion:"v2",secret:referenceHashKey}});
  let workloadPrivateJwk,workloadPublicKey,senderThumbprint;
  const agentClientId=`client_b4h_agent_${suffix}`,agentSubject=`urn:ipo-one:test:agent:${suffix}`;
  if(withAgent) {
    const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
    workloadPrivateJwk={...pair.privateKey.export({format:"jwk"}),alg:"ES256",kid:`b4h_${suffix}`};
    const publicJwk={...pair.publicKey.export({format:"jwk"}),alg:"ES256",kid:workloadPrivateJwk.kid};
    senderThumbprint=await calculateJwkThumbprint(publicJwk,"sha256");workloadPublicKey=await importJWK(publicJwk,"ES256");
  }
  let runtime,gatewayPool,authenticationPool;
  const close=async()=>{
    await Promise.allSettled([runtime?.close(),gatewayPool?.end(),authenticationPool?.end()]);await db.close();
    const admin=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
    try {await admin.query(`DROP ROLE IF EXISTS ${gatewayRole}; DROP ROLE IF EXISTS ${authenticationRole}`);}finally{await admin.end();}
  };
  try {
    await rehearseB4HostedAtomicMigration({pool:db.pool});
    await bootstrapProductionDatabase({adminConnectionString:db.connectionString,hostedMigrationDirectory:db.targetDirectory,
      gatewayPassword,authenticationPassword,referenceHashKey,
      config:{schemaVersion:"ipo_one_production_bootstrap.v2",gatewayRole,authenticationRole,
        tenant:{tenantId,organizationRef:`urn:ipo.one:test:b4h:${suffix}`,displayName:"B4-H isolated synthetic fixture",pilotJurisdiction:"PRIVATE_NO_FUNDS",retentionOwnerRef:`urn:ipo.one:test:retention:${suffix}`},
        systemActor:{actorId:systemActorId,clientId:`client_b4h_system_${suffix}`},policyVersion:"security_001.v1",
        credentials:["borrower","capitalPartner",...(withAgent?["controller"]:[])].map(key=>({kind:"human_wallet",profile:key==="borrower"?"human_borrower":key==="controller"?"principal_controller":"capital_partner_operator",actorId:actors[key],clientId:walletClientId,
          issuer:origin,externalSubject:`eip155:84532:${privateKeyToAccount(generatePrivateKey()).address.toLowerCase()}`,
          invitationId:`invite_b4h_${key}_${suffix}`,expiresAt:new Date(Date.now()+86400000).toISOString()}))}});
    const client=await db.pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client,createTenantSecurityContext({tenantId,actorId:systemActorId,policyVersion:"security_001.v1",source:"system_worker"}));
      const now=new Date(),expires=new Date(now.getTime()+86400000);
      const specs={capitalPartner:{type:"human",role:"capital_partner_operator",capabilities:PRODUCTION_BOOTSTRAP_PROFILES.capital_partner_operator.capabilities},
        operations:{type:"operations_operator",role:"operations_operator",capabilities:[C.APPROVAL_PROPOSE,C.APPROVAL_READ,C.APPROVAL_CANCEL,C.SERVICING_WRITEOFF_SANDBOX]},
        riskReviewer:{type:"risk_operator",role:"risk_operator",capabilities:[C.APPROVAL_READ,C.APPROVAL_DECIDE]},
        operationsReviewer:{type:"operations_operator",role:"operations_operator",capabilities:[C.APPROVAL_READ,C.APPROVAL_DECIDE]},
        auditor:{type:"auditor",role:"auditor",capabilities:[C.APPROVAL_READ]}};
      if(withAgent)Object.assign(specs,{
        controller:{type:"human",role:"principal_controller",capabilities:PRODUCTION_BOOTSTRAP_PROFILES.principal_controller.capabilities},
        agent:{type:"agent",role:"agent_runtime",capabilities:PRODUCTION_BOOTSTRAP_PROFILES.agent_runtime.capabilities}
      });
      for(const [key,spec] of Object.entries(specs)) {
        const actorId=actors[key],credentialId=createOperationalId("credential");
        if(!["capitalPartner","controller"].includes(key)) {
          await client.query("INSERT INTO actors(id,actor_hash,actor_type,status,created_at,updated_at,schema_version) VALUES($1,$2,$3,'active',$4,$4,'actor.v1')",[actorId,hashId("b4h_fixture_actor",actorId),spec.type,now]);
          await client.query("INSERT INTO memberships(id,membership_hash,tenant_id,actor_id,role_bundle,capabilities,client_ids,policy_version,controller_actor_id,status,valid_from,created_at,updated_at,version,schema_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'security_001.v1',$9,'active',$8,$8,$8,1,'membership.v1')",[createOperationalId("membership"),hashId("b4h_fixture_membership",actorId),tenantId,actorId,spec.role,JSON.stringify(spec.capabilities),JSON.stringify([key==="agent"?agentClientId:walletClientId]),now,key==="agent"?actors.controller:null]);
        }
        await client.query("INSERT INTO authentication_credentials(id,tenant_id,actor_id,actor_type,issuer,subject_ref_hash,client_id,client_authentication_method,sender_constraint_method,sender_constraint_ref_hash,roles,allowed_capabilities,policy_version,status,version,expires_at,created_at,updated_at,schema_version,reference_hash_key_version) VALUES($1,$2,$3,$4,$5,$6,$7,$13,$14,$8,$9::jsonb,$10::jsonb,'security_001.v1','active',1,$11,$12,$12,'authentication_credential.v1','v2')",[credentialId,tenantId,actorId,spec.type,key==="agent"?"https://workload.ipo.one":origin,hasher.hash("subject",key==="agent"?`https://workload.ipo.one\0${agentSubject}`:`${origin}\0eip155:84532:${accounts[key].address.toLowerCase()}`),key==="agent"?agentClientId:walletClientId,hasher.hash("sender.constraint",key==="agent"?senderThumbprint:hasher.hash("test.host-session",actorId)),JSON.stringify([spec.role]),JSON.stringify(spec.capabilities),expires,now,key==="agent"?"private_key_jwt":"siwe",key==="agent"?"dpop":"host_session"]);
        if(key!=="agent")await client.query("INSERT INTO authentication_role_enrollments(id,tenant_id,actor_id,credential_id,role_bundle,capabilities,client_ids,policy_version,status,valid_from,expires_at,version,created_at,updated_at,schema_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'security_001.v1','active',$8,$9,1,$8,$8,'authentication_role_enrollment.v1')",[createOperationalId("role_enrollment"),tenantId,actorId,credentialId,spec.role,JSON.stringify(spec.capabilities),JSON.stringify([walletClientId]),now,expires]);
        await client.query("INSERT INTO authentication_events(id,tenant_id,event_type,actor_id,credential_id,reason_code,occurred_at,payload,schema_version) VALUES($1,$2,'credential_registered',$3,$4,'isolated_b4h_test_fixture',$5,$6::jsonb,'authentication_event.v1')",[createOperationalId("auth_event"),tenantId,systemActorId,credentialId,now,JSON.stringify({actorType:spec.type,clientAuthenticationMethod:key==="agent"?"private_key_jwt":"siwe",senderConstraintMethod:key==="agent"?"dpop":"host_session",version:1})]);
      }
      await client.query("COMMIT");
    } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    const gatewayUrl=new URL(db.connectionString);gatewayUrl.username=gatewayRole;gatewayUrl.password=gatewayPassword;
    const authUrl=new URL(db.connectionString);authUrl.username=authenticationRole;authUrl.password=authenticationPassword;
    const governance=createHostedSyntheticFeeGovernance({schemaVersion:"hosted_synthetic_fee_governance.v1",tenantId,
      institutionId:`urn:ipo-one:hosted:synthetic-capital-partner:${tenantId}:primary`,institutionOperatorActorId:actors.capitalPartner,
      operationsActorId:actors.operations,riskReviewerActorId:actors.riskReviewer,operationsReviewerActorId:actors.operationsReviewer,auditorActorId:actors.auditor,
      browserOrigin:origin,rpId:"ipo.one",feePolicyHash:HOSTED_SYNTHETIC_FEE_POLICY_HASH,sourcePolicyHash:HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH,approvalReference:"isolated_B4_H_test_fixture"});
    const verifier=new EvmWalletSignatureVerifier({fetchImpl:async(_url,options)=>{
      const request=JSON.parse(options.body);let result;
      if(request.method==="eth_chainId")result="0x14a34";
      else if(request.method==="eth_getBlockByNumber")result={number:"0x123",hash:"0x"+"77".repeat(32),timestamp:"0x"+Math.floor(Date.now()/1000).toString(16)};
      else if(request.method==="eth_getCode")result="0x";else throw new Error(`Unexpected read-only EOA fixture RPC: ${request.method}`);
      return new Response(JSON.stringify({jsonrpc:"2.0",id:request.id,result}),{headers:{"content-type":"application/json"}});
    }});
    const {privateKey,publicKey}=generateKeyPairSync("ed25519"),publicKeyDer=publicKey.export({format:"der",type:"spki"}).toString("base64url");
    const meteredUsageProvider=createHostedSyntheticMeteredProvider({keyMaterial:{privateKeyDer:privateKey.export({format:"der",type:"pkcs8"}).toString("base64url"),publicKeyDer,providerKeyId:`hosted_metered_${hashId("hosted_metered_provider_key",publicKeyDer).slice(2,34)}`,schemaVersion:"ipo_one_hosted_synthetic_metered_provider_key.v1"}});
    const probe=createServer();await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const input={gatewayPool,authenticationPool,browserOrigin:origin,deploymentRole:"primary",tenantId,systemActorId,
      meteredUsageProvider,policyVersion:"security_001.v1",releaseId:"b".repeat(40),port,referenceHashKey,referenceHashKeyRef:secretRef,encryptionKey,encryptionKeyRef:secretRef,
      runtimeConfig:loadAuthenticationRuntimeConfig({NODE_ENV:"production",IPO_ONE_AUTHENTICATION_MODE:"public_beta",IPO_ONE_IDP_DEPLOYMENT_APPROVAL:"APPROVED",IPO_ONE_IDP_VENDOR_ID:"wallet_only",IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA:"a".repeat(40),IPO_ONE_IDP_CONFIGURATION_REF:secretRef,IPO_ONE_AUTH_REFERENCE_HASH_MODE:"single_v2",IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF:secretRef,IPO_ONE_AUTH_ENCRYPTION_KEY_REF:secretRef}),
      oidcProviders:[],proofAdapters:[BASE_SEPOLIA_PROFILE,X_LAYER_TESTNET_PROFILE].map(profile=>new EvmAccountProofAdapter({profile,signatureVerifier:verifier})),
      wallet:{issuer:origin,clientId:walletClientId,domain:"ipo.one",uri:origin,signatureVerifier:{verify:request=>verifier.verifyMessage(request)}},
      machineIssuer:"https://workload.ipo.one",machineAudience:origin,machineResolver:{issuer:"https://workload.ipo.one",allowedAlgorithms:["ES256"],keyResolver(){return async(header)=>{if(!workloadPublicKey || header.kid!==workloadPrivateJwk.kid)throw new Error("Unconfigured machine key in Human browser fixture");return workloadPublicKey;};}},
      verifyEdgeRequest:request=>request.headers["x-ipo-one-edge-assertion"]===edgeAssertion,getTrustedMtlsEvidence:()=>undefined,
      createNetworkContext:()=>createTrustedNetworkContext({networkRefHash:abuseHash("verified_proxy_network",hasher.hash("network.b4h","127.0.0.1")),source:"verified_proxy"}),
      syntheticCollateralEnabled:true,syntheticFeesEnabled:feesEnabled,syntheticFeeCorrectionsEnabled:correctionsEnabled,hostedSyntheticFeeGovernance:governance};
    const start=async(overrides={})=>{
      gatewayPool=overrides.gatewayPool??new pg.Pool({connectionString:gatewayUrl.toString(),max:4});
      authenticationPool=overrides.authenticationPool??new pg.Pool({connectionString:authUrl.toString(),max:4});
      input.gatewayPool=gatewayPool;input.authenticationPool=authenticationPool;
      runtime=await createProductionClosedPilotRuntime({...input,...overrides});await runtime.listen();return runtime;
    };
    await start();
    const localOrigin=`http://127.0.0.1:${port}`;
    const proxy=async context=>{
      await context.route("**/*",async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!==origin)return route.abort("blockedbyclient");
        try {
          const response=await context.request.fetch(`${localOrigin}${url.pathname}${url.search}`,{method:request.method(),headers:{...await request.allHeaders(),host:"ipo.one","x-forwarded-proto":"https","x-ipo-one-edge-assertion":edgeAssertion},data:request.postDataBuffer()??undefined,maxRedirects:0});
          await route.fulfill({response});
        } catch(error) {
          // A controlled real process restart can interrupt an asset request.
          // Preserve a real browser network failure, not a synthetic response
          // or retry, instead of throwing outside the browser test's awaits.
          if(/ECONNREFUSED/.test(error.message)) {await route.abort('connectionrefused');return;}
          if(context.pages().every(page=>page.isClosed()) && /disposed|closed/.test(error.message))return;
          throw error;
        }
      });
    };
    const agent=withAgent?await createVercelGoldenFlowAgentClient({origin,
      bootstrap:{tenant:{tenantId},policyVersion:"security_001.v1",credentials:[{kind:"agent_dpop",profile:"agent_runtime",clientId:agentClientId,issuer:"https://workload.ipo.one",externalSubject:agentSubject,senderThumbprint}]},
      workloadPrivateJwk,request:(_url,options,callback)=>httpRequest(`${localOrigin}/tenant/v1/operations`,{...options,headers:{...options.headers,host:"ipo.one","x-forwarded-proto":"https","x-ipo-one-edge-assertion":edgeAssertion}},callback)
    }):undefined;
    return {db,accounts,actors,governance,input,origin,localOrigin,proxy,agent,close,start,async stop(){await runtime.close();},async restart(overrides={}){await runtime.close();return start(overrides);}};
  } catch(error){await close();throw error;}
}
