import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";
import pg from "pg";
import {
  generatePrivateKey,
  privateKeyToAccount
} from "viem/accounts";
import {
  CSRF_BOOTSTRAP_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  createReferenceHasher,
  loadAuthenticationRuntimeConfig
} from "../../../modules/authentication/src/index.js";
import {
  abuseHash,
  createTrustedNetworkContext
} from "../../../modules/abuse-control/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  EvmAccountProofAdapter,
  EvmWalletSignatureVerifier,
  X_LAYER_TESTNET_PROFILE
} from "../../../modules/chain-adapter/src/index.js";
import { createPostgresPool } from "../../../modules/persistence/src/index.js";
import {
  assertProductionBootstrapConfig,
  bootstrapProductionDatabase
} from "../src/production-bootstrap.js";
import { createProductionClosedPilotRuntime } from "../src/production-runtime.js";

const { Pool } = pg;
const CONNECTION_STRING = process.env.DATABASE_URL;
const SECRET_REF =
  "projects/ipo-one-public-sandbox-cptm511/secrets/predeploy/versions/1";

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  await new Promise((resolve, reject) =>
    probe.close((error) => error ? reject(error) : resolve())
  );
  assert.ok(address && typeof address !== "string");
  return address.port;
}

function cookieValue(cookies, name) {
  const prefix = `${name}=`;
  const cookie = cookies.find((value) => value.startsWith(prefix));
  assert.ok(cookie, `${name} cookie is required`);
  return cookie.slice(prefix.length).split(";", 1)[0];
}

test(
  "production closed pilot executes a durable Human command, logs out, and signs in again with real EIP-191 signatures",
  { timeout: 30_000 },
  async () => {
    assert.ok(
      CONNECTION_STRING,
      "DATABASE_URL must be provided by scripts/run-postgres-tests.mjs"
    );
    const suffix = randomBytes(6).toString("hex");
    const gatewayRole = `ipo_predeploy_gateway_${suffix}`;
    const authenticationRole = `ipo_predeploy_auth_${suffix}`;
    const gatewayPassword = randomBytes(32).toString("base64url");
    const authenticationPassword = randomBytes(32).toString("base64url");
    const referenceHashKey = randomBytes(32);
    const encryptionKey = randomBytes(32);
    const edgeAssertion = randomBytes(32).toString("base64url");
    const account = privateKeyToAccount(generatePrivateKey());
    const port = await availablePort();
    const browserOrigin = `https://127.0.0.1:${port}`;
    const tenantId = `tenant_predeploy_${suffix}`;
    const systemActorId = `actor_predeploy_system_${suffix}`;
    const policyVersion = "security_001.v1";
    const walletClientId = `client_predeploy_wallet_${suffix}`;
    const config = assertProductionBootstrapConfig({
      schemaVersion: "ipo_one_production_bootstrap.v2",
      gatewayRole,
      authenticationRole,
      tenant: {
        tenantId,
        organizationRef: `urn:ipo.one:organization:predeploy-${suffix}`,
        displayName: `Predeploy ${suffix}`,
        pilotJurisdiction: "PRIVATE_NO_FUNDS",
        retentionOwnerRef: `urn:ipo.one:retention:predeploy-${suffix}`
      },
      systemActor: {
        actorId: systemActorId,
        clientId: `client_predeploy_system_${suffix}`
      },
      policyVersion,
      credentials: [{
        kind: "human_wallet",
        profile: "human_borrower",
        actorId: `actor_predeploy_borrower_${suffix}`,
        clientId: walletClientId,
        issuer: browserOrigin,
        externalSubject:
          `eip155:84532:${account.address.toLowerCase()}`,
        invitationId: `invite_predeploy_borrower_${suffix}`,
        expiresAt:
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString()
      }]
    });
    const bootstrap = await bootstrapProductionDatabase({
      adminConnectionString: CONNECTION_STRING,
      config,
      gatewayPassword,
      authenticationPassword,
      referenceHashKey
    });
    assert.equal(bootstrap.insertedCredentials, 1);

    const gatewayUrl = new URL(CONNECTION_STRING);
    gatewayUrl.username = gatewayRole;
    gatewayUrl.password = gatewayPassword;
    const authenticationUrl = new URL(CONNECTION_STRING);
    authenticationUrl.username = authenticationRole;
    authenticationUrl.password = authenticationPassword;
    const gatewayPool = createPostgresPool({
      connectionString: gatewayUrl.toString(),
      max: 4,
      applicationName: "ipo-one-predeploy-production-gateway"
    });
    const authenticationPool = createPostgresPool({
      connectionString: authenticationUrl.toString(),
      max: 4,
      applicationName: "ipo-one-predeploy-production-authentication"
    });
    const runtimeConfig = loadAuthenticationRuntimeConfig({
      NODE_ENV: "production",
      IPO_ONE_AUTHENTICATION_MODE: "closed_pilot",
      IPO_ONE_IDP_DEPLOYMENT_APPROVAL: "APPROVED",
      IPO_ONE_IDP_VENDOR_ID: "wallet_only",
      IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA: "a".repeat(40),
      IPO_ONE_IDP_CONFIGURATION_REF: SECRET_REF,
      IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF: SECRET_REF,
      IPO_ONE_AUTH_ENCRYPTION_KEY_REF: SECRET_REF
    });
    const walletSignatureVerifier = new EvmWalletSignatureVerifier();
    const referenceHasher = createReferenceHasher(referenceHashKey);
    let runtime;
    const ownerPool = new Pool({
      connectionString: CONNECTION_STRING,
      max: 1
    });
    try {
      runtime = await createProductionClosedPilotRuntime({
        gatewayPool,
        authenticationPool,
        browserOrigin,
        deploymentRole: "primary",
        tenantId,
        systemActorId,
        policyVersion,
        releaseId: "b".repeat(40),
        port,
        runtimeConfig,
        referenceHashKey,
        referenceHashKeyRef: SECRET_REF,
        encryptionKey,
        encryptionKeyRef: SECRET_REF,
        oidcProviders: [],
        proofAdapters: [
          BASE_SEPOLIA_PROFILE,
          X_LAYER_TESTNET_PROFILE
        ].map((profile) => new EvmAccountProofAdapter({
          profile,
          signatureVerifier: walletSignatureVerifier
        })),
        wallet: {
          issuer: browserOrigin,
          clientId: walletClientId,
          domain: `127.0.0.1:${port}`,
          uri: browserOrigin,
          signatureVerifier: {
            verify: (input) =>
              walletSignatureVerifier.verifyMessage(input)
          }
        },
        machineIssuer: "https://workload.ipo.one",
        machineAudience: browserOrigin,
        machineResolver: {
          issuer: "https://workload.ipo.one",
          allowedAlgorithms: ["ES256"],
          async keyResolver() {
            throw new Error("workload issuer is not used by this Human E2E");
          }
        },
        verifyEdgeRequest(request) {
          return request.headers["x-ipo-one-edge-assertion"] === edgeAssertion;
        },
        getTrustedMtlsEvidence() {
          return undefined;
        },
        createNetworkContext() {
          return createTrustedNetworkContext({
            networkRefHash: abuseHash(
              "verified_proxy_network",
              referenceHasher.hash(
                "network.predeploy",
                "127.0.0.1"
              )
            ),
            source: "verified_proxy"
          });
        }
      });
      const address = await runtime.listen();
      assert.deepEqual(address, { host: "0.0.0.0", port });
      const baseUrl = `http://127.0.0.1:${port}`;
      const edgeHeaders = {
        "x-forwarded-proto": "https",
        "x-forwarded-for": "127.0.0.1",
        "x-ipo-one-edge-assertion": edgeAssertion
      };

      const ready = await fetch(`${baseUrl}/readyz`);
      assert.equal(ready.status, 200);
      assert.equal((await ready.json()).realFundsEnabled, false);

      const options = await fetch(`${baseUrl}/auth/v1/options`, {
        headers: edgeHeaders
      });
      assert.equal(options.status, 200);
      assert.deepEqual(
        await options.json(),
        {
          schemaVersion: "ipo_one_authentication_options.v1",
          profile: "closed_non_funds_pilot",
          enabled: true,
          sessionActive: false,
          sessionAuthenticationMethod: null,
          oidcProviders: [],
          walletAuthentication: true,
          supportedChains: ["eip155:84532", "eip155:1952"],
          boundary:
            "Authentication proves presence; internal policy and Mandates separately decide authority."
        }
      );

      const challengeResponse = await fetch(
        `${baseUrl}/auth/v1/wallet/challenge`,
        {
          method: "POST",
          headers: {
            ...edgeHeaders,
            "content-type": "application/json",
            origin: browserOrigin
          },
          body: JSON.stringify({
            address: account.address,
            chainId: 84532
          })
        }
      );
      assert.equal(challengeResponse.status, 201);
      const challenge = await challengeResponse.json();
      const signature = await account.signMessage({
        message: challenge.message
      });
      const verifyResponse = await fetch(
        `${baseUrl}/auth/v1/wallet/verify`,
        {
          method: "POST",
          headers: {
            ...edgeHeaders,
            "content-type": "application/json",
            origin: browserOrigin
          },
          body: JSON.stringify({
            transactionHandle: challenge.handle,
            signature
          })
        }
      );
      assert.equal(verifyResponse.status, 200);
      const setCookies = verifyResponse.headers.getSetCookie();
      assert.equal(setCookies.length, 2);
      const cookieHeader = setCookies
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      const csrfToken = cookieValue(
        setCookies,
        CSRF_BOOTSTRAP_COOKIE_NAME
      );

      const catalog = await fetch(`${baseUrl}/tenant/v1/catalog`, {
        headers: {
          ...edgeHeaders,
          cookie: cookieHeader
        }
      });
      assert.equal(catalog.status, 200);
      const catalogBody = await catalog.json();
      assert.equal(catalogBody.safety.realFundsEnabled, false);
      assert.ok(catalogBody.operations.length >= 71);

      const command = await fetch(`${baseUrl}/tenant/v1/operations`, {
        method: "POST",
        headers: {
          ...edgeHeaders,
          "content-type": "application/json",
          cookie: cookieHeader,
          origin: browserOrigin,
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          operationId: "pilotCreateHumanSubject",
          payload: {},
          idempotencyKey: `predeploy-create-human-${suffix}`,
          requestId: `request-predeploy-${suffix}`,
          correlationId: `correlation-predeploy-${suffix}`,
          schemaVersion: "tenant_protocol_request.v1"
        })
      });
      const commandText = await command.text();
      assert.equal(command.status, 200, commandText);
      const result = JSON.parse(commandText);
      assert.equal(result.operationId, "pilotCreateHumanSubject");
      assert.equal(result.replayed, false);
      assert.equal(result.response.subjectType, "human");
      assert.equal(result.response.prototypeOnly, true);
      assert.equal(result.response.schemaVersion, "tenant_human_subject_created.v1");

      const logout = await fetch(`${baseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          ...edgeHeaders,
          cookie: cookieHeader,
          "idempotency-key":
            `predeploy-wallet-logout-idempotency-${suffix}`,
          origin: browserOrigin,
          "x-csrf-token": csrfToken
        }
      });
      assert.equal(logout.status, 200);
      assert.equal((await logout.json()).status, "logged_out");
      const logoutCookies = logout.headers.getSetCookie();
      assert.equal(logoutCookies.length, 2);
      assert.match(logoutCookies[0], new RegExp(`^${SESSION_COOKIE_NAME}=;`));
      assert.match(
        logoutCookies[1],
        new RegExp(`^${CSRF_BOOTSTRAP_COOKIE_NAME}=;`)
      );

      const signedOutOptions = await fetch(`${baseUrl}/auth/v1/options`, {
        headers: {
          ...edgeHeaders,
          cookie: cookieHeader
        }
      });
      assert.equal(signedOutOptions.status, 200);
      assert.equal((await signedOutOptions.json()).sessionActive, false);

      const secondChallengeResponse = await fetch(
        `${baseUrl}/auth/v1/wallet/challenge`,
        {
          method: "POST",
          headers: {
            ...edgeHeaders,
            "content-type": "application/json",
            origin: browserOrigin
          },
          body: JSON.stringify({
            address: account.address,
            chainId: 84532
          })
        }
      );
      assert.equal(secondChallengeResponse.status, 201);
      const secondChallenge = await secondChallengeResponse.json();
      assert.notEqual(secondChallenge.handle, challenge.handle);
      assert.notEqual(secondChallenge.message, challenge.message);
      const secondSignature = await account.signMessage({
        message: secondChallenge.message
      });
      const secondVerifyResponse = await fetch(
        `${baseUrl}/auth/v1/wallet/verify`,
        {
          method: "POST",
          headers: {
            ...edgeHeaders,
            "content-type": "application/json",
            origin: browserOrigin
          },
          body: JSON.stringify({
            transactionHandle: secondChallenge.handle,
            signature: secondSignature
          })
        }
      );
      assert.equal(secondVerifyResponse.status, 200);
      const secondSetCookies = secondVerifyResponse.headers.getSetCookie();
      assert.equal(secondSetCookies.length, 2);
      const secondCookieHeader = secondSetCookies
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      const signedInAgainOptions = await fetch(
        `${baseUrl}/auth/v1/options`,
        {
          headers: {
            ...edgeHeaders,
            cookie: secondCookieHeader
          }
        }
      );
      assert.equal(signedInAgainOptions.status, 200);
      const signedInAgainAuthentication = await signedInAgainOptions.json();
      assert.equal(signedInAgainAuthentication.sessionActive, true);
      assert.equal(signedInAgainAuthentication.sessionAuthenticationMethod, "siwe");
      const signedInAgainCatalog = await fetch(
        `${baseUrl}/tenant/v1/catalog`,
        {
          headers: {
            ...edgeHeaders,
            cookie: secondCookieHeader
          }
        }
      );
      assert.equal(signedInAgainCatalog.status, 200);
      assert.ok((await signedInAgainCatalog.json()).operations.length >= 71);
    } finally {
      await runtime?.close().catch(() => {});
      await Promise.allSettled([
        gatewayPool.end(),
        authenticationPool.end()
      ]);
      await ownerPool.query(
        "TRUNCATE TABLE actors, tenants RESTART IDENTITY CASCADE"
      ).catch(() => {});
      for (const role of [gatewayRole, authenticationRole]) {
        await ownerPool.query(`DROP OWNED BY ${role}`).catch(() => {});
        await ownerPool.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
      }
      await ownerPool.end();
    }
  }
);
