import {
  MachineAuthenticator,
  createReferenceHashKeyring
} from "../../../modules/authentication/src/index.js";
import { AuthorizationPolicyRegistry } from "../../../modules/authorization/src/index.js";
import { assertTenantDatabaseRole } from "../../../modules/persistence/src/index.js";
import {
  TenantCommandGateway,
  TenantCommandHandlerRegistry,
  createPostgresTenantLivePolicyAdapter,
  createTenantFoundationHandlers
} from "../../../modules/tenant-command-gateway/src/index.js";
import {
  HyperliquidBindingProofVerifier,
  HyperliquidTestnetInfoAdapter
} from "../../../modules/hyperliquid-info/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { createSecuredPoolV1ReadAdapter } from "../../../modules/chain-adapter/src/index.js";
import {
  getLiveTestnetConfig,
  resolveApprovedRpc
} from "../../../modules/event-indexer/src/index.js";
import {
  migrationChecksumMatches,
  readMigrationSet
} from "../../../scripts/migrate.mjs";
import {
  createDisabledChainCapability,
  createPostgresHumanAccessComposition,
  createProductionTenantHost
} from "../../tenant-api/src/index.js";
import {
  createProductionSyntheticIdentityProvider,
  createSyntheticIdentityGateway
} from "./local-synthetic-identity-provider.js";
import {
  createPostgresSecuredPoolMarketProvider
} from "./secured-pool-market-provider.js";
import { PRODUCTION_BOOTSTRAP_PROFILES } from "./production-bootstrap.js";
import { createPublicBetaAuthenticationLimiter } from "./public-beta-authentication-limiter.js";
import {
  createHostedMeteredSystemBoundary,
  createHostedSyntheticMeteredResourceService
} from "./hosted-synthetic-metered-provider.js";
import launchPolicy from "../../../deploy/launch-policy.v1.json" with { type: "json" };

const CONFIG_KEYS = new Set([
  "agentAccountAddress",
  "authenticationPool",
  "browserOrigin",
  "clock",
  "createNetworkContext",
  "deploymentRole",
  "encryptionKey",
  "encryptionKeyRef",
  "gatewayPool",
  "getTrustedMtlsEvidence",
  "legacyReferenceHashKey",
  "legacyReferenceHashKeyRef",
  "machineAudience",
  "machineIssuer",
  "machineResolver",
  "meteredUsageProvider",
  "oidcProviders",
  "policyVersion",
  "port",
  "proofAdapters",
  "referenceHashKey",
  "referenceHashKeyRef",
  "referenceHashMode",
  "releaseId",
  "runtimeConfig",
  "systemActorId",
  "tenantId",
  "verifyEdgeRequest",
  "wallet"
]);
const EVM_ACCOUNT = /^0x[a-fA-F0-9]{40}$/;
const DEPLOYMENT_ROLES = new Set(["container", "primary", "risk"]);
const PRODUCTION_WORKSPACE_BY_DEPLOYMENT_ROLE = Object.freeze({
  risk: "risk"
});

function createProductionSecuredPoolReadBoundary() {
  const profile = launchPolicy.profiles.live_testnet_secured_pool;
  if (
    profile?.releaseEnabled !== true ||
    profile.capabilities?.realFundsEnabled !== false ||
    profile.capabilities?.testAssetsEnabled !== true ||
    profile.capabilities?.securedPoolEnabled !== true ||
    profile.capabilities?.marketCreationEnabled !== false ||
    profile.exactProfile?.realValueClassification !== "test_assets_only"
  ) return Object.freeze({ deploymentProfile: undefined, readAdapter: undefined });
  const liveConfig = getLiveTestnetConfig(profile.exactProfile.chainId);
  const providers = ["primary", "secondary"].map((providerSlot) =>
    resolveApprovedRpc({
      chainId: profile.exactProfile.chainId,
      providerSlot,
      rpcUrl: liveConfig.rpcSlots[providerSlot]
    })
  );
  return Object.freeze({
    deploymentProfile: profile.exactProfile,
    readAdapter: createSecuredPoolV1ReadAdapter({
      deploymentProfile: profile.exactProfile,
      providers
    })
  });
}

export function productionWorkspaceNameForDeploymentRole(deploymentRole) {
  return PRODUCTION_WORKSPACE_BY_DEPLOYMENT_ROLE[deploymentRole];
}

function invalidConfig(message = "Production closed-pilot runtime configuration is invalid") {
  return new DomainError("invalid_production_runtime_config", message);
}

function assertClosedConfig(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) throw invalidConfig();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(descriptors).some((key) => !CONFIG_KEYS.has(key))
  ) throw invalidConfig();
}

async function assertExactMigrationSet(pool) {
  const expected = await readMigrationSet();
  const result = await pool.query(
    "SELECT name, checksum FROM schema_migrations ORDER BY name"
  );
  if (
    result.rowCount !== expected.length ||
    expected.some((migration, index) => (
      result.rows[index]?.name !== migration.name ||
      !migrationChecksumMatches({
        name: migration.name,
        recordedChecksum: result.rows[index]?.checksum,
        releaseChecksum: migration.checksum
      })
    ))
  ) {
    throw new DomainError(
      "production_database_migration_mismatch",
      "Production database does not match the exact release migration set"
    );
  }
}

async function composeProductionClosedPilotRuntime(input) {
  assertClosedConfig(input);
  const referenceHashMode = input.referenceHashMode ??
    input.runtimeConfig?.referenceHashMode ?? "single_v1";
  if (
    !input.gatewayPool?.connect ||
    !input.gatewayPool?.query ||
    !input.authenticationPool?.connect ||
    !input.authenticationPool?.query ||
    !input.machineResolver?.keyResolver ||
    !DEPLOYMENT_ROLES.has(input.deploymentRole) ||
    (input.agentAccountAddress !== undefined &&
      !EVM_ACCOUNT.test(input.agentAccountAddress)) ||
    typeof input.createNetworkContext !== "function" ||
    typeof input.getTrustedMtlsEvidence !== "function" ||
    typeof input.verifyEdgeRequest !== "function"
  ) throw invalidConfig();

  await assertExactMigrationSet(input.gatewayPool);
  const gatewayRole = await assertTenantDatabaseRole(input.gatewayPool);
  const humanAccess = await createPostgresHumanAccessComposition({
    browserOrigin: input.browserOrigin,
    encryptionKey: input.encryptionKey,
    encryptionKeyRef: input.encryptionKeyRef,
    oidcProviders: input.oidcProviders,
    policyVersion: input.policyVersion,
    profile: "public_authenticated_no_funds_beta",
    pool: input.authenticationPool,
    referenceHashKey: input.referenceHashKey,
    referenceHashKeyRef: input.referenceHashKeyRef,
    referenceHashMode,
    ...(input.legacyReferenceHashKey === undefined
      ? {}
      : { legacyReferenceHashKey: input.legacyReferenceHashKey }),
    ...(input.legacyReferenceHashKeyRef === undefined
      ? {}
      : { legacyReferenceHashKeyRef: input.legacyReferenceHashKeyRef }),
    runtimeConfig: input.runtimeConfig,
    systemActorId: input.systemActorId,
    tenantId: input.tenantId,
    ...(input.runtimeConfig.publicBetaSelfService === true
      ? {
          publicBetaWalletRoleProfiles: Object.freeze({
            human_borrower:
              PRODUCTION_BOOTSTRAP_PROFILES.human_borrower.capabilities,
            principal_controller:
              PRODUCTION_BOOTSTRAP_PROFILES.principal_controller.capabilities
          })
        }
      : {}),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.wallet === undefined ? {} : { wallet: input.wallet })
  });

  const referenceHasher = createReferenceHashKeyring({
    mode: referenceHashMode,
    primary: {
      keyVersion: referenceHashMode === "single_v1" ? "v1" : "v2",
      secret: input.referenceHashKey
    },
    ...(referenceHashMode === "overlap_v2_write_v1_lookup"
      ? {
          legacy: {
            keyVersion: "v1",
            secret: input.legacyReferenceHashKey
          }
        }
      : {})
  });
  const policyRegistry = new AuthorizationPolicyRegistry({
    policyVersion: input.policyVersion
  });
  const securedPool = createProductionSecuredPoolReadBoundary();
  const authenticationLimiter = createPublicBetaAuthenticationLimiter({
    pool: input.gatewayPool,
    tenantId: input.tenantId,
    systemActorId: input.systemActorId,
    policyVersion: input.policyVersion,
    createNetworkContext: input.createNetworkContext
  });
  const meteredUsageEnabled = launchPolicy.profiles
    .public_authenticated_no_funds_beta.capabilities
    .syntheticMeteredResourceEnabled === true;
  const meteredUsageDeployment =
    input.deploymentRole === "primary" || input.deploymentRole === "container";
  if (
    meteredUsageEnabled !== (meteredUsageDeployment &&
      input.meteredUsageProvider !== undefined)
  ) throw invalidConfig("Synthetic Metered Resource configuration does not match the launch policy and deployment role");
  const meteredSystemBoundary = meteredUsageEnabled
    ? createHostedMeteredSystemBoundary({
        credentialRegistry: humanAccess.credentialRegistry,
        referenceHasher,
        tenantId: input.tenantId,
        systemActorId: input.systemActorId,
        systemClientId: humanAccess.systemClientId,
        policyVersion: input.policyVersion,
        ...(input.clock === undefined ? {} : { clock: input.clock })
      })
    : undefined;
  const durableGateway = new TenantCommandGateway({
    pool: input.gatewayPool,
    handlers: new TenantCommandHandlerRegistry(createTenantFoundationHandlers({
      proofAdapters: input.proofAdapters,
      hyperliquidInfoAdapter: new HyperliquidTestnetInfoAdapter(),
      hyperliquidBindingProofVerifier:
        new HyperliquidBindingProofVerifier(),
      securedPoolDeploymentProfile: securedPool.deploymentProfile,
      securedPoolReadAdapter: securedPool.readAdapter,
      ...(meteredUsageEnabled ? {
        meteredUsagePolicyResolver: input.meteredUsageProvider.resolvePolicy,
        meteredUsageSignatureVerifier: input.meteredUsageProvider.verifySignature
      } : {})
    })),
    policyRegistry,
    credentialRegistry: meteredSystemBoundary?.credentialRegistry ?? humanAccess.credentialRegistry,
    referenceHasher,
    livePolicyAdapterFactory: createPostgresTenantLivePolicyAdapter
  });
  const gateway = createSyntheticIdentityGateway({
    gateway: durableGateway,
    syntheticIdentity: createProductionSyntheticIdentityProvider({
      pool: input.gatewayPool
    })
  });
  const syntheticMeteredResourceService = meteredUsageEnabled
    ? createHostedSyntheticMeteredResourceService({
        gateway,
        pool: input.gatewayPool,
        provider: input.meteredUsageProvider,
        systemBoundary: meteredSystemBoundary,
        ...(input.clock === undefined ? {} : { clock: input.clock })
      })
    : undefined;
  const machineAuthenticator = new MachineAuthenticator({
    issuer: input.machineIssuer,
    audience: input.machineAudience,
    resolver: input.machineResolver,
    credentialRegistry: humanAccess.credentialRegistry,
    replayCache: humanAccess.machineReplayCache,
    referenceHasher,
    allowedAlgorithms: input.machineResolver.allowedAlgorithms
  });
  const readinessCheck = async () => {
    const [gatewayCheck, authenticationCheck] = await Promise.all([
      input.gatewayPool.query("SELECT 1 AS ready"),
      input.authenticationPool.query("SELECT 1 AS ready")
    ]);
    return (
      gatewayCheck.rows[0]?.ready === 1 &&
      authenticationCheck.rows[0]?.ready === 1
    );
  };
  const host = createProductionTenantHost({
    authenticationReferenceHash: {
      mode: referenceHasher.mode,
      writeKeyVersion: referenceHasher.keyVersion,
      legacyLookupKeyVersion: referenceHasher.legacyKeyVersion ?? null
    },
    admitAuthenticationRequest: authenticationLimiter.admit,
    gateway,
    humanBff: humanAccess.humanSessionBff,
    machineAuthenticator,
    createNetworkContext: input.createNetworkContext,
    csrfTokenProvider: humanAccess.csrfTokenProvider,
    ...(input.agentAccountAddress === undefined ? {} : {
      localAgentAccountProvider: async () => input.agentAccountAddress
    }),
    getTrustedMtlsEvidence: input.getTrustedMtlsEvidence,
    serveAuthentication: humanAccess.serveAuthentication,
    readinessCheck,
    verifyEdgeRequest: input.verifyEdgeRequest,
    publicOrigin: input.browserOrigin,
    port: input.port,
    profile: "public_authenticated_no_funds_beta",
    releaseId: input.releaseId,
    deploymentRole: input.deploymentRole,
    chainCapabilityProvider: async () =>
      createDisabledChainCapability({ releaseId: input.releaseId }),
    securedPoolMarketProvider: createPostgresSecuredPoolMarketProvider({
      pool: input.gatewayPool,
      deploymentProfile: securedPool.deploymentProfile,
      readAdapter: securedPool.readAdapter,
      ...(input.clock === undefined ? {} : { clock: input.clock })
    }),
    ...(syntheticMeteredResourceService === undefined ? {} : {
      syntheticMeteredResourceService
    }),
    ...(productionWorkspaceNameForDeploymentRole(input.deploymentRole) === undefined
      ? {}
      : {
          workspaceNameProvider: async () =>
            productionWorkspaceNameForDeploymentRole(input.deploymentRole)
        }),
    ...(input.clock === undefined ? {} : { clock: input.clock })
  });

  let started = false;
  return Object.freeze({
    profile: "public_authenticated_no_funds_beta",
    realFundsEnabled: false,
    gatewayRole: Object.freeze({
      roleName: gatewayRole.roleName,
      superuser: false,
      bypassRls: false,
      ownsRlsTable: false
    }),
    authenticationBoundary: humanAccess.deploymentBoundary,
    handleRequest: host.handleRequest,
    async listen() {
      if (started) throw new DomainError("production_runtime_already_started", "Production runtime is already active");
      const address = await host.listen();
      started = true;
      return address;
    },
    async close() {
      await host.close();
      await Promise.allSettled([
        input.gatewayPool.end(),
        input.authenticationPool.end()
      ]);
      started = false;
    }
  });
}

export async function createProductionClosedPilotRuntime(input) {
  try {
    return await composeProductionClosedPilotRuntime(input);
  } catch (error) {
    await Promise.allSettled([
      input?.gatewayPool?.end?.(),
      input?.authenticationPool?.end?.()
    ]);
    throw error;
  }
}
