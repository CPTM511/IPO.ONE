import {
  MachineAuthenticator,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import { AuthorizationPolicyRegistry } from "../../../modules/authorization/src/index.js";
import { assertTenantDatabaseRole } from "../../../modules/persistence/src/index.js";
import {
  TenantCommandGateway,
  TenantCommandHandlerRegistry,
  createPostgresTenantLivePolicyAdapter,
  createTenantFoundationHandlers
} from "../../../modules/tenant-command-gateway/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { readMigrationSet } from "../../../scripts/migrate.mjs";
import {
  createPostgresHumanAccessComposition,
  createProductionTenantHost
} from "../../tenant-api/src/index.js";

const CONFIG_KEYS = new Set([
  "authenticationPool",
  "browserOrigin",
  "clock",
  "createNetworkContext",
  "encryptionKey",
  "encryptionKeyRef",
  "gatewayPool",
  "getTrustedMtlsEvidence",
  "machineAudience",
  "machineIssuer",
  "machineResolver",
  "oidcProviders",
  "policyVersion",
  "port",
  "referenceHashKey",
  "referenceHashKeyRef",
  "releaseId",
  "runtimeConfig",
  "systemActorId",
  "tenantId",
  "verifyEdgeRequest",
  "wallet"
]);

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
      result.rows[index]?.checksum !== migration.checksum
    ))
  ) {
    throw new DomainError(
      "production_database_migration_mismatch",
      "Production database does not match the exact release migration set"
    );
  }
}

function rejectingDpopReplayCache() {
  return Object.freeze({
    consume() {
      throw new DomainError(
        "production_dpop_disabled",
        "Production DPoP is disabled until multi-instance durable replay protection is deployed"
      );
    }
  });
}

async function composeProductionClosedPilotRuntime(input) {
  assertClosedConfig(input);
  if (
    !input.gatewayPool?.connect ||
    !input.gatewayPool?.query ||
    !input.authenticationPool?.connect ||
    !input.authenticationPool?.query ||
    !input.machineResolver?.keyResolver ||
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
    pool: input.authenticationPool,
    referenceHashKey: input.referenceHashKey,
    referenceHashKeyRef: input.referenceHashKeyRef,
    runtimeConfig: input.runtimeConfig,
    systemActorId: input.systemActorId,
    tenantId: input.tenantId,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.wallet === undefined ? {} : { wallet: input.wallet })
  });

  const referenceHasher = createReferenceHasher(input.referenceHashKey);
  const policyRegistry = new AuthorizationPolicyRegistry({
    policyVersion: input.policyVersion
  });
  const gateway = new TenantCommandGateway({
    pool: input.gatewayPool,
    handlers: new TenantCommandHandlerRegistry(createTenantFoundationHandlers()),
    policyRegistry,
    credentialRegistry: humanAccess.credentialRegistry,
    referenceHasher,
    livePolicyAdapterFactory: createPostgresTenantLivePolicyAdapter
  });
  const machineAuthenticator = new MachineAuthenticator({
    issuer: input.machineIssuer,
    audience: input.machineAudience,
    resolver: input.machineResolver,
    credentialRegistry: humanAccess.credentialRegistry,
    replayCache: rejectingDpopReplayCache(),
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
    gateway,
    humanBff: humanAccess.humanSessionBff,
    machineAuthenticator,
    createNetworkContext: input.createNetworkContext,
    csrfTokenProvider: humanAccess.csrfTokenProvider,
    getTrustedMtlsEvidence: input.getTrustedMtlsEvidence,
    serveAuthentication: humanAccess.serveAuthentication,
    readinessCheck,
    verifyEdgeRequest: input.verifyEdgeRequest,
    publicOrigin: input.browserOrigin,
    port: input.port,
    releaseId: input.releaseId,
    ...(input.clock === undefined ? {} : { clock: input.clock })
  });

  let started = false;
  return Object.freeze({
    profile: "closed_non_funds_pilot",
    realFundsEnabled: false,
    gatewayRole: Object.freeze({
      roleName: gatewayRole.roleName,
      superuser: false,
      bypassRls: false,
      ownsRlsTable: false
    }),
    authenticationBoundary: humanAccess.deploymentBoundary,
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
