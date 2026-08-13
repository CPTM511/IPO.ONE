import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrustedNetworkContext } from "../../../modules/abuse-control/src/index.js";
import {
  createEvidenceAnchorObserver,
  createEvidenceAnchorNonceReader
} from "../../../modules/event-indexer/src/index.js";
import {
  ActorType,
  assertAuthenticationContext,
  createReferenceHasher,
  loadAuthenticationRuntimeConfig
} from "../../../modules/authentication/src/index.js";
import {
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";
import {
  TenantCommandGateway,
  TenantCommandHandlerRegistry,
  AgentTenantCommandClient,
  createPostgresTenantLivePolicyAdapter,
  createTenantFoundationHandlers
} from "../../../modules/tenant-command-gateway/src/index.js";
import {
  HyperliquidBindingProofVerifier,
  HyperliquidTestnetInfoAdapter
} from "../../../modules/hyperliquid-info/src/index.js";
import {
  createPostgresVenueExecutionApplication
} from "../../../modules/hypercore-venue-adapter/src/index.js";
import {
  EVIDENCE_ANCHOR_HTTP_ROUTES,
  createEvidenceAnchorHttpHandler,
  createPostgresHumanAccessComposition,
  createTenantPilotHost
} from "../../tenant-api/src/index.js";
import {
  EvmWalletSignatureVerifier
} from "../../../modules/chain-adapter/src/index.js";
import {
  createPostgresWalletExecutionApplication
} from "../../../modules/agentic-execution/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { createAgentMcpHost } from "../../agent-mcp/src/index.js";
import { createLocalPilotIdentities } from "./local-pilot-identities.js";
import {
  loadOrCreatePrivatePilotDatabaseSecret,
  provisionPrivatePilotAuthentication,
  provisionPrivatePilotDatabase
} from "./private-pilot-database.js";
import { createLocalSyntheticIdentityProvider } from "./local-synthetic-identity-provider.js";
import {
  loadLocalAgentKeyMaterial,
  loadLocalAuthenticationInvitation,
  loadLocalAuthenticationServerMaterial
} from "./local-authentication-material.js";
import {
  LocalDurableAgentAuthenticator,
  createLocalAgentProof
} from "./local-durable-agent-authentication.js";
import {
  createLocalReferenceAgentHttpService
} from "./local-reference-agent-http.js";
import {
  derivePrivatePilotAgentAccount,
  preparePrivatePilotAgentProof
} from "./private-pilot-agent-account.js";
import { loadPrivatePilotProfile } from "./private-pilot-profile.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_AUTHENTICATION_SERVER_FILE = resolve(
  MODULE_DIRECTORY,
  "../../../.ipo-one/local-stack/authentication-server.v1.json"
);
const DEFAULT_AUTHENTICATION_INVITATION_FILE = resolve(
  MODULE_DIRECTORY,
  "../../../.ipo-one/local-stack/authentication-invitation.v1.json"
);
const DEFAULT_AGENT_KEY_FILE = resolve(
  MODULE_DIRECTORY,
  "../../../.ipo-one/local-stack/agent-key.v1.json"
);
const LOCAL_AGENT_STDIO_AUDIENCE =
  "urn:ipo.one:local:agent-stdio";

function createGateway(
  pool,
  authentication,
  {
    credentialRegistry = authentication.credentialRegistry,
    referenceHasher = authentication.referenceHasher
  } = {}
) {
  const durableGateway = new TenantCommandGateway({
    pool,
    handlers: new TenantCommandHandlerRegistry(
      createTenantFoundationHandlers({
        hyperliquidInfoAdapter: new HyperliquidTestnetInfoAdapter(),
        hyperliquidBindingProofVerifier:
          new HyperliquidBindingProofVerifier(),
        walletExecutionApplication: createPostgresWalletExecutionApplication(),
        venueExecutionApplication: createPostgresVenueExecutionApplication()
      })
    ),
    policyRegistry: authentication.policyRegistry,
    credentialRegistry,
    referenceHasher,
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

async function loadLocalDurableAuthenticationMaterial() {
  return Promise.all([
    loadLocalAuthenticationServerMaterial(
      process.env.IPO_ONE_LOCAL_AUTH_SERVER_FILE ||
        DEFAULT_AUTHENTICATION_SERVER_FILE
    ),
    loadLocalAuthenticationInvitation(
      process.env.IPO_ONE_LOCAL_AUTH_INVITATION_FILE ||
        DEFAULT_AUTHENTICATION_INVITATION_FILE
    )
  ]);
}

function localRuntimeConfig() {
  return loadAuthenticationRuntimeConfig({
    NODE_ENV: "development",
    IPO_ONE_AUTHENTICATION_MODE: "local_test"
  });
}

async function createLocalHumanAccess({
  authenticationPool,
  authenticationMaterial,
  identity,
  port,
  profile
}) {
  const browserOrigin = `http://127.0.0.1:${port}`;
  const secureOrigin = `https://127.0.0.1:${port}`;
  const walletSignatureVerifier = new EvmWalletSignatureVerifier();
  return createPostgresHumanAccessComposition({
    browserOrigin,
    encryptionKey: authenticationMaterial.encryptionKey,
    encryptionKeyRef: "local-secret://authentication/encryption-key",
    oidcProviders: [],
    policyVersion: identity.createContext().policyVersion,
    pool: authenticationPool,
    profile: "local_no_funds",
    referenceHashKey: authenticationMaterial.referenceHashKey,
    referenceHashKeyRef:
      "local-secret://authentication/reference-hash-key",
    runtimeConfig: localRuntimeConfig(),
    systemActorId: authenticationMaterial.systemActorId,
    tenantId: profile.tenantId,
    wallet: {
      issuer: secureOrigin,
      clientId: identity.clientId,
      domain: `127.0.0.1:${port}`,
      uri: secureOrigin,
      signatureVerifier: {
        verify: (input) => walletSignatureVerifier.verifyMessage(input)
      }
    }
  });
}

export async function createPrivatePilotRuntime({
  ownerConnectionString,
  basePort = 8787,
  profile,
  creditRegistryObservationArtifactPath =
    process.env.IPO_ONE_CREDIT_REGISTRY_OBSERVATION_ARTIFACT,
  evidenceAnchorContractAddress =
    process.env.IPO_ONE_EVIDENCE_ANCHOR_CONTRACT_ADDRESS
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
  const [serverMaterial, invitation] =
    await loadLocalDurableAuthenticationMaterial();
  const localAgentKey = await loadLocalAgentKeyMaterial(
    process.env.IPO_ONE_LOCAL_AGENT_KEY_FILE || DEFAULT_AGENT_KEY_FILE
  );
  const localAgentAccount = derivePrivatePilotAgentAccount(password, {
    tenantId: authentication.profile.tenantId
  });
  const pool = await provisionPrivatePilotDatabase({
    ownerConnectionString,
    identities: authentication.identities,
    password,
    profile: authentication.profile,
    creditRegistryObservationArtifactPath
  });
  const durableAuthentication = await provisionPrivatePilotAuthentication({
    ownerConnectionString,
    identities: authentication.identities,
    profile: authentication.profile,
    basePort,
    serverMaterial,
    invitation
  });
  const networkContext = createTrustedNetworkContext({
    networkRefHash: hashId("private_pilot_network", "127.0.0.1"),
    source: "local_test"
  });
  const profiles = [
    { name: "borrower", identity: authentication.identities.borrower, port: basePort, hash: "#request-credit" },
    { name: "controller", identity: authentication.identities.controller, port: basePort + 1, hash: "#request-credit" },
    { name: "risk", identity: authentication.identities.risk, port: basePort + 2, hash: "#risk-operations" },
    {
      name: "capitalPartner",
      identity: authentication.identities.capitalPartner,
      port: basePort + 3,
      hash: "#capital-partners"
    }
  ];
  const hosts = [];
  let gateway;
  try {
    const humanAccessProfiles = [];
    for (const profile of profiles) {
      const humanAccess = await createLocalHumanAccess({
        authenticationPool: durableAuthentication.pool,
        authenticationMaterial: durableAuthentication,
        identity: profile.identity,
        port: profile.port,
        profile: authentication.profile
      });
      humanAccessProfiles.push({ profile, humanAccess });
    }
    gateway = createGateway(pool, authentication, {
      credentialRegistry:
        humanAccessProfiles[0].humanAccess.credentialRegistry,
      referenceHasher: createReferenceHasher(
        durableAuthentication.referenceHashKey
      )
    });
    const evidenceAnchors = evidenceAnchorContractAddress
      ? Object.freeze({
          routes: EVIDENCE_ANCHOR_HTTP_ROUTES,
          handle: createEvidenceAnchorHttpHandler({
            pool,
            contractAddress: evidenceAnchorContractAddress,
            nonceReader: createEvidenceAnchorNonceReader({
              contractAddress: evidenceAnchorContractAddress
            }),
            observer: createEvidenceAnchorObserver({
              contractAddress: evidenceAnchorContractAddress
            }),
            systemAttestorConfigured:
              Boolean(process.env.IPO_ONE_EVIDENCE_ATTESTOR_KEY_FILE)
          })
        })
      : undefined;
    for (const { profile, humanAccess } of humanAccessProfiles) {
      const localAgentAudience =
        `urn:ipo.one:local:tenant-http:${profile.port}`;
      const localAgentAuthenticator = new LocalDurableAgentAuthenticator({
        tenantId: authentication.profile.tenantId,
        clientId: authentication.identities.agent.clientId,
        policyVersion: authentication.identities.agent.createContext()
          .policyVersion,
        audience: localAgentAudience,
        credentialRegistry: humanAccess.credentialRegistry,
        replayCache: humanAccess.machineReplayCache,
        referenceHasher: createReferenceHasher(
          durableAuthentication.referenceHashKey
        )
      });
      const verifyAgentSubjectBinding =
        createAgentSubjectBindingVerifier(pool);
      async function authenticateLocalAgent() {
        return assertAuthenticationContext(
          await localAgentAuthenticator.authenticate({
            proof: await createLocalAgentProof({
              keyMaterial: localAgentKey,
              tenantId: authentication.profile.tenantId,
              clientId: authentication.identities.agent.clientId,
              policyVersion: authentication.identities.agent.createContext()
                .policyVersion,
              audience: localAgentAudience
            })
          })
        );
      }
      function createLocalAgentClient(authenticationContextProvider) {
        return new AgentTenantCommandClient({
          gateway,
          authenticationContextProvider,
          networkContextProvider: async () => networkContext
        });
      }
      const createAgentSession = async (manifest) => {
        async function authenticationContextProvider() {
          const context = await authenticateLocalAgent();
          if (
            context.actorType !== ActorType.AGENT ||
            await verifyAgentSubjectBinding({
              authenticationContext: context,
              subjectId: manifest.subjectId
            }) !== true
          ) {
            throw new DomainError(
              "local_agent_session_identity_mismatch",
              "Authenticated Agent is not bound to the requested Subject"
            );
          }
          return context;
        }
        const client = createLocalAgentClient(authenticationContextProvider);
        return Object.freeze({
          client,
          host: createAgentMcpHost({ client, manifest }),
          async close() {
            // The reference Agent reuses the bounded local runtime pools.
          }
        });
      };
      const referenceAgent = profile.name === "controller"
        ? createLocalReferenceAgentHttpService({
            createAgentSession,
            gateway,
            networkContext,
            async proveAccount(challenge) {
              const proof = preparePrivatePilotAgentProof(
                challenge,
                localAgentAccount
              );
              const signature = await localAgentAccount.signTypedData(
                proof.typedData
              );
              const client = createLocalAgentClient(authenticateLocalAgent);
              const result = await client.submitAccountProof({
                subjectId: proof.subjectId,
                payload: {
                  challengeId: proof.challengeId,
                  accountId: proof.accountId,
                  signature
                },
                idempotencyKey:
                  `reference-agent-account-proof-${proof.challengeId}`,
                requestId:
                  `request-reference-agent-account-proof-${proof.challengeId}`,
                correlationId:
                  `correlation-reference-agent-account-proof-${proof.challengeId}`
              });
              return result.response;
            }
          })
        : undefined;
      const host = createTenantPilotHost({
        gateway,
        humanBff: humanAccess.humanSessionBff,
        machineAuthenticator: {
          async authenticate({ accessToken, dpopProof, mtlsEvidence, now }) {
            if (dpopProof !== undefined || mtlsEvidence !== undefined) {
              throw new DomainError(
                "authentication_required",
                "local Agent proof must use exactly one bearer credential"
              );
            }
            return localAgentAuthenticator.authenticate({
              proof: accessToken,
              now
            });
          }
        },
        createNetworkContext: async () => networkContext,
        csrfTokenProvider: humanAccess.csrfTokenProvider,
        localAgentAccountProvider: () => localAgentAccount.address,
        workspaceNameProvider: () => profile.name,
        serveAuthentication: humanAccess.serveAuthentication,
        ...(evidenceAnchors === undefined
          ? {}
          : { serveEvidenceAnchors: evidenceAnchors }),
        ...(referenceAgent === undefined
          ? {}
          : { serveReferenceAgent: referenceAgent }),
        port: profile.port
      });
      const address = await host.listen();
      hosts.push({ ...profile, host, address });
    }
  } catch (error) {
    await Promise.allSettled(hosts.map(({ host }) => host.close()));
    await Promise.allSettled([
      pool.end(),
      durableAuthentication.pool.end()
    ]);
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
      await Promise.allSettled([
        pool.end(),
        durableAuthentication.pool.end()
      ]);
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

export async function createPrivatePilotGateway(
  ownerConnectionString,
  {
    profile,
    creditRegistryObservationArtifactPath =
      process.env.IPO_ONE_CREDIT_REGISTRY_OBSERVATION_ARTIFACT
  } = {}
) {
  const checkedProfile = profile ?? await loadPrivatePilotProfile();
  const authentication = createLocalPilotIdentities({ profile: checkedProfile });
  const password = await loadOrCreatePrivatePilotDatabaseSecret();
  const pool = await provisionPrivatePilotDatabase({
    ownerConnectionString,
    identities: authentication.identities,
    password,
    profile: authentication.profile,
    creditRegistryObservationArtifactPath
  });
  return Object.freeze({
    authentication,
    gateway: createGateway(pool, authentication),
    pool
  });
}

export async function createPrivatePilotDurableAgentGateway(
  ownerConnectionString,
  {
    profile,
    basePort = 8787,
    audience = LOCAL_AGENT_STDIO_AUDIENCE,
    creditRegistryObservationArtifactPath =
      process.env.IPO_ONE_CREDIT_REGISTRY_OBSERVATION_ARTIFACT
  } = {}
) {
  const checkedProfile = profile ?? await loadPrivatePilotProfile();
  const authentication = createLocalPilotIdentities({
    profile: checkedProfile
  });
  const password = await loadOrCreatePrivatePilotDatabaseSecret();
  const [serverMaterial, invitation] =
    await loadLocalDurableAuthenticationMaterial();
  const pool = await provisionPrivatePilotDatabase({
    ownerConnectionString,
    identities: authentication.identities,
    password,
    profile: authentication.profile,
    creditRegistryObservationArtifactPath
  });
  const durableAuthentication = await provisionPrivatePilotAuthentication({
    ownerConnectionString,
    identities: authentication.identities,
    profile: authentication.profile,
    basePort,
    serverMaterial,
    invitation
  });
  try {
    const humanAccess = await createLocalHumanAccess({
      authenticationPool: durableAuthentication.pool,
      authenticationMaterial: durableAuthentication,
      identity: authentication.identities.controller,
      port: basePort + 1,
      profile: authentication.profile
    });
    return Object.freeze({
      authentication,
      gateway: createGateway(pool, authentication, {
        credentialRegistry: humanAccess.credentialRegistry,
        referenceHasher: createReferenceHasher(
          durableAuthentication.referenceHashKey
        )
      }),
      pool,
      authenticationPool: durableAuthentication.pool,
      agentAuthenticator: new LocalDurableAgentAuthenticator({
        tenantId: authentication.profile.tenantId,
        clientId: authentication.identities.agent.clientId,
        policyVersion: authentication.identities.agent.createContext()
          .policyVersion,
        audience,
        credentialRegistry: humanAccess.credentialRegistry,
        replayCache: humanAccess.machineReplayCache,
        referenceHasher: createReferenceHasher(
          durableAuthentication.referenceHashKey
        )
      }),
      audience
    });
  } catch (error) {
    await Promise.allSettled([
      pool.end(),
      durableAuthentication.pool.end()
    ]);
    throw error;
  }
}

export { createProductionClosedPilotRuntime } from "./production-runtime.js";
