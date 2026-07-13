import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  InMemoryReplayCache,
  MachineAuthenticator,
  PinnedJwksResolver,
  SenderConstraintMethod,
  assertAuthenticationContext,
  createReferenceHasher,
  createTrustedMtlsSenderEvidence
} from "../src/index.js";
import { LocalTestIssuer, createDpopFixture } from "./support/local-test-issuer.js";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const ISSUER = "https://issuer.local.test";
const AUDIENCE = "https://api.ipo.one";
const REQUEST_URL = "https://api.ipo.one/v1/credit/requests";

async function createFixture({ senderMethod = SenderConstraintMethod.DPOP } = {}) {
  const issuer = await LocalTestIssuer.create({ issuer: ISSUER });
  const dpop = await createDpopFixture();
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  actorDirectory.register({ actorId: "actor_agent_alpha", actorType: ActorType.AGENT });
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore,
    actorDirectory
  });
  const replayCache = new InMemoryReplayCache({ referenceHasher });
  let clock = NOW.getTime();
  let keySourceFailure = false;
  let fetchCount = 0;
  const resolver = new PinnedJwksResolver({
    issuer: ISSUER,
    allowedAlgorithms: ["ES256"],
    fetchJwks: async () => {
      fetchCount += 1;
      if (keySourceFailure) throw new Error("simulated key source failure");
      return issuer.jwks();
    },
    cacheTtlMs: 100,
    now: () => clock
  });
  const thumbprint = senderMethod === SenderConstraintMethod.DPOP ? dpop.thumbprint : "m".repeat(43);
  const credential = credentialRegistry.register({
    tenantId: "tenant_alpha",
    actorId: "actor_agent_alpha",
    actorType: ActorType.AGENT,
    issuer: ISSUER,
    externalSubject: "agent-runtime-alpha",
    clientId: "agent_client_alpha",
    clientAuthenticationMethod: ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraint: { method: senderMethod, thumbprint },
    roles: ["agent_runtime"],
    allowedCapabilities: ["credit.request", "repayment.route"],
    policyVersion: "security_001.v1",
    performedByActorId: "actor_security_admin",
    reasonCode: "local_test_registration",
    now: NOW
  });
  const authenticator = new MachineAuthenticator({
    issuer: ISSUER,
    audience: AUDIENCE,
    resolver,
    credentialRegistry,
    replayCache,
    referenceHasher
  });

  async function accessToken(overrides = {}) {
    const {
      audience = AUDIENCE,
      expiresAt = NOW_SECONDS + 300,
      issuedAt = NOW_SECONDS,
      notBefore = issuedAt,
      jti = "access-jti-alpha-0001",
      kid,
      subject = "agent-runtime-alpha",
      typ = "at+jwt",
      ...claimOverrides
    } = overrides;
    return issuer.sign({
      audience,
      subject,
      jti,
      issuedAt,
      notBefore,
      expiresAt,
      typ,
      kid,
      claims: {
        tenant_id: "tenant_alpha",
        actor_type: ActorType.AGENT,
        client_id: "agent_client_alpha",
        roles: ["external_admin_role_is_ignored"],
        capabilities: ["credit.request"],
        policy_version: "security_001.v1",
        cnf: senderMethod === SenderConstraintMethod.DPOP
          ? { jkt: thumbprint }
          : { "x5t#S256": thumbprint },
        ...claimOverrides
      }
    });
  }

  async function proof(token, overrides = {}) {
    return dpop.sign({
      accessToken: token,
      method: overrides.method ?? "POST",
      url: overrides.url ?? REQUEST_URL,
      jti: overrides.jti ?? "dpop-jti-alpha-0001",
      issuedAt: overrides.issuedAt ?? NOW_SECONDS
    });
  }

  return {
    accessToken,
    authenticator,
    actorDirectory,
    credential,
    credentialRegistry,
    dpop,
    issuer,
    proof,
    resolver,
    setClock(value) { clock = value; },
    setKeySourceFailure(value) { keySourceFailure = value; },
    get fetchCount() { return fetchCount; },
    thumbprint
  };
}

test("Agent authentication binds token, internal credential, DPoP sender, and non-authorizing context", async () => {
  const fixture = await createFixture();
  const token = await fixture.accessToken();
  const context = await fixture.authenticator.authenticate({
    accessToken: token,
    dpopProof: await fixture.proof(token),
    requestMethod: "POST",
    requestUrl: REQUEST_URL,
    now: NOW
  });
  assert.equal(assertAuthenticationContext(context), context);
  assert.equal(context.tenantId, "tenant_alpha");
  assert.equal(context.actorId, "actor_agent_alpha");
  assert.deepEqual(context.capabilities, ["credit.request"]);
  assert.deepEqual(context.roles, ["agent_runtime"]);
  assert.equal(context.roles.includes("external_admin_role_is_ignored"), false);
  assert.equal(context.authorizationDecision, "not_evaluated");
  assert.equal(context.senderConstraintMethod, "dpop");
});

test("closed machine claims reject unknown fields, wrong audience, type, lifetime, tenant, policy, and capability", async () => {
  for (const overrides of [
    { unexpected_claim: "rejected" },
    { audience: "https://other-api.example" },
    { typ: "JWT" },
    { typ: 42 },
    { expiresAt: NOW_SECONDS + 301 },
    { issuedAt: NOW_SECONDS - 600, notBefore: NOW_SECONDS - 600, expiresAt: NOW_SECONDS - 300 },
    { notBefore: NOW_SECONDS + 60 },
    { tenant_id: "tenant_beta" },
    { policy_version: "stale_policy.v0" },
    { capabilities: ["credential.create"] },
    { cnf: undefined }
  ]) {
    const fixture = await createFixture();
    const token = await fixture.accessToken(overrides);
    await assert.rejects(
      () => fixture.authenticator.authenticate({
        accessToken: token,
        dpopProof: fixture.proof(token),
        requestMethod: "POST",
        requestUrl: REQUEST_URL,
        now: NOW
      }),
      (error) => error.name === "DomainError"
    );
  }
});

test("unknown issuer, algorithm, and critical protected headers fail closed", async () => {
  const fixture = await createFixture();
  const token = await fixture.accessToken();
  const rewriteHeader = (patch) => {
    const segments = token.split(".");
    const header = JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8"));
    segments[0] = Buffer.from(JSON.stringify({ ...header, ...patch })).toString("base64url");
    return segments.join(".");
  };
  for (const altered of [
    rewriteHeader({ alg: "HS256" }),
    rewriteHeader({ crit: ["unrecognized"] })
  ]) {
    await assert.rejects(
      () => fixture.authenticator.authenticate({
        accessToken: altered,
        dpopProof: undefined,
        requestMethod: "POST",
        requestUrl: REQUEST_URL,
        now: NOW
      }),
      (error) => error.name === "DomainError"
    );
  }

  const foreignIssuer = await LocalTestIssuer.create({ issuer: "https://other-issuer.local.test" });
  const foreignToken = await foreignIssuer.sign({
    audience: AUDIENCE,
    subject: "agent-runtime-alpha",
    jti: "foreign-issuer-token-0001",
    issuedAt: NOW_SECONDS,
    notBefore: NOW_SECONDS,
    expiresAt: NOW_SECONDS + 300,
    typ: "at+jwt",
    claims: {
      tenant_id: "tenant_alpha",
      actor_type: ActorType.AGENT,
      client_id: "agent_client_alpha",
      capabilities: ["credit.request"],
      policy_version: "security_001.v1",
      cnf: { jkt: fixture.thumbprint }
    }
  });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: foreignToken,
      dpopProof: undefined,
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.name === "DomainError"
  );
});

test("DPoP proof is request-bound and one-time", async () => {
  const fixture = await createFixture();
  const token = await fixture.accessToken();
  const proof = await fixture.proof(token);
  await fixture.authenticator.authenticate({
    accessToken: token,
    dpopProof: proof,
    requestMethod: "POST",
    requestUrl: REQUEST_URL,
    now: NOW
  });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      dpopProof: proof,
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "authentication_replay_rejected"
  );
  const wrongMethodProof = await fixture.proof(token, {
    jti: "dpop-jti-alpha-0002",
    method: "GET"
  });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      dpopProof: wrongMethodProof,
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "dpop_method_rejected"
  );
  const wrongTargetProof = await fixture.proof(token, {
    jti: "dpop-jti-alpha-0003",
    url: "https://api.ipo.one/v1/other"
  });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      dpopProof: wrongTargetProof,
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "dpop_target_rejected"
  );
  const queryClaimProof = await fixture.proof(token, {
    jti: "dpop-jti-alpha-0004",
    url: `${REQUEST_URL}?resource=one`
  });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      dpopProof: queryClaimProof,
      requestMethod: "POST",
      requestUrl: `${REQUEST_URL}?resource=one`,
      now: NOW
    }),
    (error) => error.code === "dpop_target_rejected"
  );
});

test("DPoP proof from another key and revoked credentials fail closed", async () => {
  const fixture = await createFixture();
  const token = await fixture.accessToken();
  const otherDpop = await createDpopFixture();
  const foreignProof = await otherDpop.sign({
    accessToken: token,
    method: "POST",
    url: REQUEST_URL,
    jti: "foreign-dpop-proof-0001",
    issuedAt: NOW_SECONDS
  });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      dpopProof: foreignProof,
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "dpop_sender_rejected"
  );
  fixture.actorDirectory.setStatus({ actorId: "actor_agent_alpha", status: "suspended" });
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      dpopProof: fixture.proof(token, { jti: "dpop-jti-actor-suspended" }),
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "authentication_actor_rejected"
  );
  assert.throws(
    () => fixture.actorDirectory.setStatus({ actorId: "actor_agent_alpha", status: "active" }),
    (error) => error.code === "authentication_actor_rejected"
  );
  const revokedFixture = await createFixture();
  const revokedToken = await revokedFixture.accessToken({ jti: "access-jti-revoked-0001" });
  revokedFixture.credentialRegistry.revoke({
    credentialId: revokedFixture.credential.credentialId,
    performedByActorId: "actor_security_admin",
    reasonCode: "compromise_response",
    now: NOW
  });
  await assert.rejects(
    () => revokedFixture.authenticator.authenticate({
      accessToken: revokedToken,
      dpopProof: revokedFixture.proof(revokedToken, { jti: "dpop-jti-after-revoke" }),
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "authentication_credential_rejected"
  );
});

test("mTLS sender evidence must come from the trusted termination adapter", async () => {
  const fixture = await createFixture({ senderMethod: SenderConstraintMethod.MTLS });
  const token = await fixture.accessToken();
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: token,
      mtlsEvidence: {
        certificateThumbprint: fixture.thumbprint,
        source: "trusted_mtls_terminator"
      },
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "mtls_evidence_rejected"
  );
  const context = await fixture.authenticator.authenticate({
    accessToken: token,
    mtlsEvidence: createTrustedMtlsSenderEvidence({
      certificateThumbprint: fixture.thumbprint,
      source: "trusted_mtls_terminator"
    }),
    requestMethod: "POST",
    requestUrl: REQUEST_URL,
    now: NOW
  });
  assert.equal(context.senderConstraintMethod, "mtls");
});

test("JWKS rollover accepts overlap, rejects withdrawal, and does not use stale keys on fetch failure", async () => {
  const fixture = await createFixture();
  const firstToken = await fixture.accessToken({ jti: "access-jti-first-0001" });
  await fixture.authenticator.authenticate({
    accessToken: firstToken,
    dpopProof: await fixture.proof(firstToken, { jti: "dpop-jti-first-0001" }),
    requestMethod: "POST",
    requestUrl: REQUEST_URL,
    now: NOW
  });
  await fixture.issuer.rotate({ kid: "local-key-2" });
  const secondToken = await fixture.accessToken({ kid: "local-key-2", jti: "access-jti-second-0001" });
  await fixture.authenticator.authenticate({
    accessToken: secondToken,
    dpopProof: await fixture.proof(secondToken, { jti: "dpop-jti-second-0001" }),
    requestMethod: "POST",
    requestUrl: REQUEST_URL,
    now: NOW
  });
  fixture.issuer.withdraw("local-key-1");
  fixture.setClock(NOW.getTime() + 101);
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: firstToken,
      dpopProof: fixture.proof(firstToken, { jti: "dpop-jti-withdrawn-0001" }),
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "authentication_signing_key_rejected"
  );
  fixture.setKeySourceFailure(true);
  fixture.setClock(NOW.getTime() + 202);
  await assert.rejects(
    () => fixture.authenticator.authenticate({
      accessToken: secondToken,
      dpopProof: fixture.proof(secondToken, { jti: "dpop-jti-network-fail" }),
      requestMethod: "POST",
      requestUrl: REQUEST_URL,
      now: NOW
    }),
    (error) => error.code === "authentication_key_source_unavailable"
  );
  assert.equal(fixture.fetchCount, 4);
});

test("JWKS resolution has a bounded network wait", async () => {
  const resolver = new PinnedJwksResolver({
    issuer: ISSUER,
    allowedAlgorithms: ["ES256"],
    fetchJwks: async () => new Promise(() => {}),
    fetchTimeoutMs: 100
  });
  await assert.rejects(
    () => resolver.resolve({ alg: "ES256", kid: "unavailable-key" }),
    (error) => error.code === "authentication_key_source_unavailable"
  );
});

test("unknown JWKS key IDs are refresh-cooled to prevent key-source amplification", async () => {
  const fixture = await createFixture();
  const token = await fixture.accessToken();
  await fixture.authenticator.authenticate({
    accessToken: token,
    dpopProof: await fixture.proof(token),
    requestMethod: "POST",
    requestUrl: REQUEST_URL,
    now: NOW
  });
  assert.equal(fixture.fetchCount, 1);
  await assert.rejects(
    () => fixture.resolver.resolve({ alg: "ES256", kid: "unknown-key-1" }),
    (error) => error.code === "authentication_signing_key_rejected"
  );
  assert.equal(fixture.fetchCount, 2);
  await assert.rejects(
    () => fixture.resolver.resolve({ alg: "ES256", kid: "unknown-key-2" }),
    (error) => error.code === "authentication_signing_key_rejected"
  );
  assert.equal(fixture.fetchCount, 2);
});

test("JWKS rejects oversized sets and any private key material", async () => {
  const issuer = await LocalTestIssuer.create({ issuer: ISSUER });
  const publicKey = issuer.jwks().keys[0];
  const oversized = new PinnedJwksResolver({
    issuer: ISSUER,
    allowedAlgorithms: ["ES256"],
    maximumKeys: 2,
    fetchJwks: async () => ({
      keys: [
        publicKey,
        { ...publicKey, kid: "local-key-2" },
        { ...publicKey, kid: "local-key-3" }
      ]
    })
  });
  await assert.rejects(
    () => oversized.resolve({ alg: "ES256", kid: publicKey.kid }),
    (error) => error.code === "authentication_key_set_rejected"
  );

  const privateMaterial = new PinnedJwksResolver({
    issuer: ISSUER,
    allowedAlgorithms: ["ES256"],
    fetchJwks: async () => ({ keys: [{ ...publicKey, d: "forbidden-private-component" }] })
  });
  await assert.rejects(
    () => privateMaterial.resolve({ alg: "ES256", kid: publicKey.kid }),
    (error) => error.code === "authentication_key_set_rejected"
  );
});
