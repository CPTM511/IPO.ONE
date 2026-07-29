import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryReplayCache,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import {
  createLocalAuthenticationMaterial
} from "../src/local-authentication-material.js";
import {
  LocalDurableAgentAuthenticator,
  createLocalAgentProof
} from "../src/local-durable-agent-authentication.js";

const TENANT_ID = "tenant_local_authentication_test";
const ACTOR_ID = "actor_local_agent_test";
const CLIENT_ID = "client_local_agent_test";
const POLICY_VERSION = "security_001.v1";
const AUDIENCE = "urn:ipo.one:local:test";

test("local authentication material separates the invited wallet and Agent private key", async () => {
  const material = await createLocalAuthenticationMaterial({
    invitedWalletAddress:
      "0x8c2cbe747578c03c385dfd4d2e45774e5541217e"
  });
  assert.equal(
    material.invitation.walletAddress,
    "0x8C2cbE747578c03c385Dfd4D2E45774E5541217e"
  );
  assert.equal(Object.hasOwn(material.invitation.agentPublicJwk, "d"), false);
  assert.equal(Object.hasOwn(material.agent.agentPrivateJwk, "d"), true);
  assert.equal(
    material.invitation.agentThumbprint,
    material.agent.agentThumbprint
  );
  assert.equal(JSON.stringify(material.invitation).includes("signature"), false);
});

test("local Agent proof is one-use, expiry-bound, key-bound, and Credential-revocable", async () => {
  const now = new Date("2026-07-29T00:00:00.000Z");
  const material = await createLocalAuthenticationMaterial({
    invitedWalletAddress:
      "0x8c2cbe747578c03c385dfd4d2e45774e5541217e",
    now
  });
  const referenceHasher = createReferenceHasher(
    Buffer.from(material.server.referenceHashKey, "base64url")
  );
  let active = true;
  const credential = Object.freeze({
    credentialId: "credential_11111111-1111-4111-8111-111111111111",
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorType: "agent",
    clientId: CLIENT_ID,
    clientAuthenticationMethod: "private_key_jwt",
    senderConstraint: Object.freeze({
      method: "dpop",
      thumbprint: referenceHasher.hash(
        "sender.constraint",
        material.agent.agentThumbprint
      ),
      referenceProtected: true
    }),
    roles: Object.freeze(["agent_runtime"]),
    allowedCapabilities: Object.freeze(["credit.request"]),
    policyVersion: POLICY_VERSION,
    status: "active",
    version: 1
  });
  const credentialRegistry = {
    async findBySubject(input) {
      assert.equal(input.tenantId, TENANT_ID);
      assert.equal(input.clientId, CLIENT_ID);
      if (!active) {
        const error = new Error("credential revoked");
        error.code = "authentication_credential_rejected";
        throw error;
      }
      return credential;
    }
  };
  const replayCache = new InMemoryReplayCache({ referenceHasher });
  const authenticator = new LocalDurableAgentAuthenticator({
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    policyVersion: POLICY_VERSION,
    audience: AUDIENCE,
    credentialRegistry,
    replayCache,
    referenceHasher
  });
  const proof = await createLocalAgentProof({
    keyMaterial: material.agent,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    policyVersion: POLICY_VERSION,
    audience: AUDIENCE,
    now,
    jti: "local-agent-proof-0001"
  });
  const context = await authenticator.authenticate({ proof, now });
  assert.equal(context.actorId, ACTOR_ID);
  assert.equal(context.credentialVersion, 1);
  assert.equal(context.senderConstraintMethod, "dpop");
  await assert.rejects(
    () => authenticator.authenticate({ proof, now }),
    (error) => error.code === "authentication_replay_rejected"
  );

  const expiredProof = await createLocalAgentProof({
    keyMaterial: material.agent,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    policyVersion: POLICY_VERSION,
    audience: AUDIENCE,
    now,
    jti: "local-agent-proof-expired-0001"
  });
  await assert.rejects(
    () => authenticator.authenticate({
      proof: expiredProof,
      now: new Date(now.getTime() + 120_000)
    }),
    (error) => error.code === "local_agent_proof_rejected"
  );

  const foreign = await createLocalAuthenticationMaterial({
    invitedWalletAddress:
      "0x1111111111111111111111111111111111111111",
    now
  });
  const foreignProof = await createLocalAgentProof({
    keyMaterial: foreign.agent,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    policyVersion: POLICY_VERSION,
    audience: AUDIENCE,
    now,
    jti: "local-agent-proof-foreign-0001"
  });
  await assert.rejects(
    () => authenticator.authenticate({ proof: foreignProof, now }),
    (error) => error.code === "authentication_binding_rejected"
  );

  active = false;
  const revokedProof = await createLocalAgentProof({
    keyMaterial: material.agent,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    policyVersion: POLICY_VERSION,
    audience: AUDIENCE,
    now,
    jti: "local-agent-proof-revoked-0001"
  });
  await assert.rejects(
    () => authenticator.authenticate({ proof: revokedProof, now }),
    (error) => error.code === "authentication_credential_rejected"
  );
});
