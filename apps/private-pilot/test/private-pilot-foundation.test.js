import assert from "node:assert/strict";
import test from "node:test";
import { ActorType, assertAuthenticationContext } from "../../../modules/authentication/src/index.js";
import { PilotCapability, RoleBundle } from "../../../modules/authorization/src/index.js";
import {
  createAgentAccountBindingTypedData,
  normalizeEvmCaip10
} from "../../../modules/chain-adapter/src/index.js";
import {
  LOCAL_PILOT_RISK_PORTFOLIO_ID,
  LOCAL_PILOT_SERVICING_QUEUE_ID,
  LOCAL_PILOT_TENANT_ID,
  createLocalPilotIdentities
} from "../src/local-pilot-identities.js";
import {
  derivePrivatePilotAgentAccount,
  preparePrivatePilotAgentProof
} from "../src/private-pilot-agent-account.js";
import {
  DEFAULT_PRIVATE_PILOT_PROFILE,
  assertPrivatePilotProfile,
  parsePrivatePilotProfile,
  privatePilotProfileSummary
} from "../src/private-pilot-profile.js";

const ACCOUNT_PROOF_NOW = new Date("2026-07-17T04:00:00.000Z");

function agentAccountChallenge(account, overrides = {}) {
  const chainId = "eip155:84532";
  const normalized = normalizeEvmCaip10(account.accountIds[chainId], chainId);
  const issuedAt = ACCOUNT_PROOF_NOW.toISOString();
  const expiresAt = new Date(ACCOUNT_PROOF_NOW.getTime() + 300_000).toISOString();
  const prepared = createAgentAccountBindingTypedData({
    chainId,
    tenantHash: `0x${"11".repeat(32)}`,
    subjectHash: `0x${"22".repeat(32)}`,
    accountHash: normalized.accountHash,
    purpose: "primary",
    nonce: `0x${"33".repeat(32)}`,
    issuedAt,
    expiresAt,
    protocolVersion: "1.1"
  });
  return {
    challengeId: "agent_account_challenge_11111111-1111-4111-8111-111111111111",
    subjectId: "subject_22222222-2222-4222-8222-222222222222",
    chainId,
    accountHash: normalized.accountHash,
    purpose: "primary",
    nonce: `0x${"33".repeat(32)}`,
    issuedAt,
    expiresAt,
    protocolVersion: "1.1",
    typedDataHash: prepared.typedDataHash,
    typedData: {
      ...prepared.typedData,
      message: {
        ...prepared.typedData.message,
        issuedAt: prepared.typedData.message.issuedAt.toString(),
        expiresAt: prepared.typedData.message.expiresAt.toString()
      }
    },
    oneUse: true,
    schemaVersion: "tenant_agent_account_challenge_created.v1",
    ...overrides
  };
}

test("private pilot identities are role-separated over one Tenant", () => {
  const runtime = createLocalPilotIdentities();
  const { borrower, controller, agent, risk } = runtime.identities;

  assert.equal(borrower.actorType, ActorType.HUMAN);
  assert.equal(borrower.roleBundle, RoleBundle.HUMAN_BORROWER);
  assert.ok(borrower.capabilities.includes(PilotCapability.CREDIT_OFFER_ACCEPT_SELF));
  assert.ok(borrower.capabilities.includes(PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF));
  assert.equal(borrower.capabilities.includes(PilotCapability.RISK_READ_TENANT), false);
  assert.equal(borrower.capabilities.includes(PilotCapability.PILOT_HEALTH_READ), false);

  assert.equal(controller.roleBundle, RoleBundle.PRINCIPAL_CONTROLLER);
  assert.ok(controller.capabilities.includes(PilotCapability.MANDATE_ACTIVATE_OWNED));
  assert.equal(controller.capabilities.includes(PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF), false);

  assert.equal(agent.actorId, "actor_agent_pilot_alpha");
  assert.equal(agent.controllerActorId, controller.actorId);
  assert.equal(agent.actorType, ActorType.AGENT);
  assert.ok(agent.capabilities.includes(PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF));

  assert.equal(risk.actorType, ActorType.RISK_OPERATOR);
  assert.ok(risk.capabilities.includes(PilotCapability.PILOT_HEALTH_READ));
  assert.ok(risk.capabilities.includes(PilotCapability.PILOT_FEEDBACK_READ_TENANT));
  assert.ok(risk.capabilities.includes(PilotCapability.SERVICING_QUEUE_READ));
  assert.equal(risk.capabilities.includes(PilotCapability.CREDIT_REQUEST), false);

  for (const identity of Object.values(runtime.identities)) {
    const context = assertAuthenticationContext(identity.createContext());
    assert.equal(context.tenantId, LOCAL_PILOT_TENANT_ID);
    assert.equal(context.actorId, identity.actorId);
    assert.equal(context.roles[0], identity.roleBundle);
  }
});

test("private pilot uses fixed opaque Risk resources and no funds capability", () => {
  assert.equal(LOCAL_PILOT_RISK_PORTFOLIO_ID, "risk_portfolio_local_private_pilot");
  assert.equal(LOCAL_PILOT_SERVICING_QUEUE_ID, "servicing_queue_local_private_pilot");
  const identities = createLocalPilotIdentities().identities;
  for (const identity of Object.values(identities)) {
    assert.equal(identity.capabilities.includes("funds.withdraw"), false);
    assert.equal(identity.capabilities.includes("production.credit.execute"), false);
  }
});

test("private pilot accepts a closed design-partner Tenant profile without configurable permissions", () => {
  const profile = assertPrivatePilotProfile({
    ...DEFAULT_PRIVATE_PILOT_PROFILE,
    tenantId: "tenant_design_partner_01",
    riskPortfolioId: "risk_portfolio_design_partner_01",
    servicingQueueId: "servicing_queue_design_partner_01",
    identities: {
      borrower: { actorId: "actor_dp01_borrower" },
      controller: { actorId: "actor_dp01_controller" },
      agent: { actorId: "actor_dp01_agent" },
      risk: { actorId: "actor_dp01_risk" }
    }
  });
  const runtime = createLocalPilotIdentities({ profile });

  assert.equal(runtime.profile.tenantId, profile.tenantId);
  assert.equal(runtime.identities.agent.controllerActorId, "actor_dp01_controller");
  assert.equal(runtime.identities.borrower.createContext().tenantId, profile.tenantId);
  assert.equal(runtime.identities.borrower.capabilities.includes(PilotCapability.RISK_READ_TENANT), false);
  assert.deepEqual(privatePilotProfileSummary(profile), {
    schemaVersion: "private_pilot_profile_check.v1",
    tenantId: "tenant_design_partner_01",
    mode: "local_no_funds",
    identityCount: 4,
    roleNames: ["agent", "borrower", "controller", "risk"],
    syntheticDataOnly: true,
    realFundsEnabled: false,
    remoteAccessEnabled: false,
    credentialsIncluded: false,
    privateDataIncluded: false,
    valid: true
  });
});

test("private pilot profile fails closed on authority flags, permission injection, duplicate keys, or shared actors", () => {
  const source = JSON.stringify(DEFAULT_PRIVATE_PILOT_PROFILE);
  for (const invalid of [
    { ...DEFAULT_PRIVATE_PILOT_PROFILE, realFundsEnabled: true },
    { ...DEFAULT_PRIVATE_PILOT_PROFILE, remoteAccessEnabled: true },
    { ...DEFAULT_PRIVATE_PILOT_PROFILE, capabilities: ["funds.withdraw"] },
    {
      ...DEFAULT_PRIVATE_PILOT_PROFILE,
      identities: {
        ...DEFAULT_PRIVATE_PILOT_PROFILE.identities,
        agent: DEFAULT_PRIVATE_PILOT_PROFILE.identities.controller
      }
    }
  ]) {
    assert.throws(
      () => assertPrivatePilotProfile(invalid),
      (error) => error.code === "invalid_private_pilot_profile"
    );
  }
  assert.throws(
    () => parsePrivatePilotProfile(source.replace(
      '"mode":"local_no_funds"',
      '"mode":"local_no_funds","mode":"local_no_funds"'
    )),
    (error) => error.code === "invalid_private_pilot_profile"
  );
});

test("private pilot derives a stable public Agent account without exporting its key", async () => {
  const account = derivePrivatePilotAgentAccount("s".repeat(43));
  const replay = derivePrivatePilotAgentAccount("s".repeat(43));

  assert.equal(account.address, replay.address);
  assert.equal(account.accountIds["eip155:84532"], `eip155:84532:${account.address.toLowerCase()}`);
  assert.equal(Object.hasOwn(account, "privateKey"), false);
  assert.equal(JSON.stringify(account).includes("privateKey"), false);

  const challenge = agentAccountChallenge(account);
  const proof = preparePrivatePilotAgentProof(challenge, account, { now: ACCOUNT_PROOF_NOW });
  const signature = await account.signTypedData(proof.typedData);
  assert.match(signature, /^0x[0-9a-f]{130}$/);
  assert.equal(proof.subjectId, challenge.subjectId);
  assert.equal(proof.accountId, account.accountIds[challenge.chainId]);
});

test("default Tenant preserves the existing Agent account derivation", () => {
  const implicit = derivePrivatePilotAgentAccount("v".repeat(43));
  const explicit = derivePrivatePilotAgentAccount("v".repeat(43), {
    tenantId: LOCAL_PILOT_TENANT_ID
  });
  assert.equal(implicit.address, explicit.address);
});

test("private pilot derives unlinkable Agent accounts for distinct Tenant profiles", () => {
  const secret = "u".repeat(43);
  const first = derivePrivatePilotAgentAccount(secret, { tenantId: "tenant_private_01" });
  const second = derivePrivatePilotAgentAccount(secret, { tenantId: "tenant_private_02" });
  assert.notEqual(first.address, second.address);
});

test("private pilot refuses drifted or expired Agent proof requests before signing", () => {
  const account = derivePrivatePilotAgentAccount("t".repeat(43));
  const challenge = agentAccountChallenge(account);

  assert.throws(
    () => preparePrivatePilotAgentProof(
      { ...challenge, accountHash: `0x${"ff".repeat(32)}` },
      account,
      { now: ACCOUNT_PROOF_NOW }
    ),
    (error) => error.code === "invalid_private_pilot_agent_challenge"
  );
  assert.throws(
    () => preparePrivatePilotAgentProof(challenge, account, {
      now: new Date(challenge.expiresAt)
    }),
    (error) => error.code === "invalid_private_pilot_agent_challenge"
  );
});
