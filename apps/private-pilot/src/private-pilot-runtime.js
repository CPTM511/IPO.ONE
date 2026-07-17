import { createHmac, timingSafeEqual } from "node:crypto";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import {
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import {
  TenantCommandGateway,
  TenantCommandHandlerRegistry,
  createPostgresTenantLivePolicyAdapter,
  createTenantFoundationHandlers
} from "../../../modules/tenant-command-gateway/src/index.js";
import { createTenantPilotHost } from "../../tenant-api/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { createLocalPilotIdentities } from "./local-pilot-identities.js";
import {
  loadOrCreatePrivatePilotDatabaseSecret,
  provisionPrivatePilotDatabase
} from "./private-pilot-database.js";
import { createLocalSyntheticIdentityProvider } from "./local-synthetic-identity-provider.js";
import { derivePrivatePilotAgentAccount } from "./private-pilot-agent-account.js";
import { loadPrivatePilotProfile } from "./private-pilot-profile.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sameSecret(actual, expected) {
  if (typeof actual !== "string") return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function createLocalHumanSession({ identity, port, sessionHandle, csrfToken }) {
  let authenticatedAt = new Date();
  const origin = `http://127.0.0.1:${port}`;
  return Object.freeze({
    humanBff: Object.freeze({
      authenticateSession({ sessionHandle: presented, requestMethod, requestOrigin, csrfToken: presentedCsrf }) {
        if (!sameSecret(presented, sessionHandle)) {
          throw new DomainError("authentication_required", "Private pilot session is not active");
        }
        const method = String(requestMethod ?? "").toUpperCase();
        if (!SAFE_METHODS.has(method) && (
          requestOrigin !== origin ||
          !sameSecret(presentedCsrf, csrfToken)
        )) {
          throw new DomainError("csrf_token_rejected", "Private pilot request origin or CSRF token is invalid");
        }
        return identity.createContext({ authenticatedAt });
      }
    }),
    sessionHandleProvider() {
      authenticatedAt = new Date();
      return sessionHandle;
    },
    csrfTokenProvider() {
      return csrfToken;
    }
  });
}

function createGateway(pool, authentication) {
  const durableGateway = new TenantCommandGateway({
    pool,
    handlers: new TenantCommandHandlerRegistry(createTenantFoundationHandlers()),
    policyRegistry: authentication.policyRegistry,
    credentialRegistry: authentication.credentialRegistry,
    referenceHasher: authentication.referenceHasher,
    livePolicyAdapterFactory: createPostgresTenantLivePolicyAdapter
  });
  const syntheticIdentity = createLocalSyntheticIdentityProvider({ pool });
  return Object.freeze({
    async execute(command) {
      if (
        command.operationId === "pilotRequestCredit" &&
        command.authenticationContext?.actorType === "human"
      ) {
        await syntheticIdentity.ensure({
          authenticationContext: command.authenticationContext,
          subjectId: command.resource.resourceId,
          consentId: command.payload.authorityId
        });
      }
      const result = await durableGateway.execute(command);
      if (
        command.operationId === "pilotCreateConsent" &&
        command.authenticationContext?.actorType === "human"
      ) {
        await syntheticIdentity.ensure({
          authenticationContext: command.authenticationContext,
          subjectId: result.response.subjectId,
          consentId: result.response.consent.consentId
        });
      }
      return result;
    }
  });
}

function assertPort(name, value) {
  if (!Number.isSafeInteger(value) || value < 1_024 || value > 65_533) {
    throw new DomainError("invalid_private_pilot_port", `${name} must be between 1024 and 65533`);
  }
  return value;
}

function dailySessionSecret(password, label, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", password)
    .update("IPO_ONE_PRIVATE_PILOT_SESSION_V1")
    .update("\0")
    .update(day)
    .update("\0")
    .update(label)
    .digest("base64url");
}

export async function createPrivatePilotRuntime({
  ownerConnectionString,
  basePort = 8787,
  profile
}) {
  if (typeof ownerConnectionString !== "string" || ownerConnectionString.length < 1) {
    throw new DomainError(
      "private_pilot_database_url_required",
      "DATABASE_URL must identify the owner database for the private pilot"
    );
  }
  assertPort("basePort", basePort);
  const checkedProfile = profile ?? await loadPrivatePilotProfile();
  const authentication = createLocalPilotIdentities({ profile: checkedProfile });
  const password = await loadOrCreatePrivatePilotDatabaseSecret();
  const localAgentAccount = derivePrivatePilotAgentAccount(password, {
    tenantId: authentication.profile.tenantId
  });
  const pool = await provisionPrivatePilotDatabase({
    ownerConnectionString,
    identities: authentication.identities,
    password,
    profile: authentication.profile
  });
  const gateway = createGateway(pool, authentication);
  const sessionHandle = dailySessionSecret(password, "session");
  const csrfToken = dailySessionSecret(password, "csrf");
  const networkContext = createTrustedNetworkContext({
    networkRefHash: hashId("private_pilot_network", "127.0.0.1"),
    source: "local_test"
  });
  const profiles = [
    { name: "borrower", identity: authentication.identities.borrower, port: basePort, hash: "#human" },
    { name: "controller", identity: authentication.identities.controller, port: basePort + 1, hash: "#human" },
    { name: "risk", identity: authentication.identities.risk, port: basePort + 2, hash: "#risk" }
  ];
  const hosts = [];
  try {
    for (const profile of profiles) {
      const session = createLocalHumanSession({
        identity: profile.identity,
        port: profile.port,
        sessionHandle,
        csrfToken
      });
      const host = createTenantPilotHost({
        gateway,
        humanBff: session.humanBff,
        machineAuthenticator: {
          async authenticate() {
            throw new DomainError("authentication_required", "Workload credentials are not accepted by a Human workspace");
          }
        },
        createNetworkContext: async () => networkContext,
        csrfTokenProvider: session.csrfTokenProvider,
        sessionHandleProvider: session.sessionHandleProvider,
        port: profile.port
      });
      const address = await host.listen();
      hosts.push({ ...profile, host, address });
    }
  } catch (error) {
    await Promise.allSettled(hosts.map(({ host }) => host.close()));
    await pool.end();
    throw error;
  }

  return Object.freeze({
    gateway,
    profile: authentication.profile,
    agentAccount: Object.freeze({
      address: localAgentAccount.address,
      accountIds: localAgentAccount.accountIds
    }),
    pool,
    workspaces: Object.freeze(hosts.map(({ name, address, hash }) => Object.freeze({
      name,
      url: `http://${address.host}:${address.port}/${hash}`
    }))),
    async close() {
      await Promise.allSettled(hosts.map(({ host }) => host.close()));
      await pool.end();
    }
  });
}

export function createAgentSubjectBindingVerifier(pool) {
  return async function verifyAgentSubjectBinding({ authenticationContext, subjectId }) {
    const context = createTenantSecurityContext({
      tenantId: authenticationContext.tenantId,
      actorId: authenticationContext.actorId,
      policyVersion: authenticationContext.policyVersion,
      source: "local_test"
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setTenantTransactionContext(client, context);
      const result = await client.query(
        `SELECT 1
           FROM authorization_resource_bindings
          WHERE tenant_id = $1
            AND resource_type = 'subject'
            AND resource_id = $2
            AND actor_id = $3
            AND relationship = 'subject'
            AND status = 'active'`,
        [authenticationContext.tenantId, subjectId, authenticationContext.actorId]
      );
      await client.query("COMMIT");
      return result.rowCount === 1;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

export async function createPrivatePilotGateway(ownerConnectionString, { profile } = {}) {
  const checkedProfile = profile ?? await loadPrivatePilotProfile();
  const authentication = createLocalPilotIdentities({ profile: checkedProfile });
  const password = await loadOrCreatePrivatePilotDatabaseSecret();
  const pool = await provisionPrivatePilotDatabase({
    ownerConnectionString,
    identities: authentication.identities,
    password,
    profile: authentication.profile
  });
  return Object.freeze({
    authentication,
    gateway: createGateway(pool, authentication),
    pool
  });
}
