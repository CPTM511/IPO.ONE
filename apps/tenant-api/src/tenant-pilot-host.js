import { DomainError } from "../../../packages/domain/src/index.js";
import { createTenantAuthenticationResolver } from "./tenant-authentication-resolver.js";
import { createTenantHttpServer } from "./tenant-http-adapter.js";
import { createTenantWebAssetHandler } from "./tenant-web-assets.js";

const CONFIG_KEYS = new Set([
  "clock",
  "createNetworkContext",
  "csrfTokenProvider",
  "gateway",
  "getTrustedMtlsEvidence",
  "humanBff",
  "machineAuthenticator",
  "port",
  "serveAuthentication",
  "sessionHandleProvider"
]);

function assertClosedConfig(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new DomainError("invalid_tenant_pilot_host_config", "Tenant pilot Host configuration is invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set) ||
    Object.keys(descriptors).some((key) => !CONFIG_KEYS.has(key))
  ) {
    throw new DomainError("invalid_tenant_pilot_host_config", "Tenant pilot Host configuration is invalid");
  }
}

export function createTenantPilotHost(input) {
  assertClosedConfig(input);
  const {
    gateway,
    humanBff,
    machineAuthenticator,
    createNetworkContext,
    csrfTokenProvider,
    getTrustedMtlsEvidence,
    serveAuthentication,
    sessionHandleProvider,
    clock,
    port = 0
  } = input;
  if (
    !gateway?.execute ||
    !humanBff?.authenticateSession ||
    !machineAuthenticator?.authenticate ||
    typeof createNetworkContext !== "function" ||
    typeof csrfTokenProvider !== "function"
  ) {
    throw new DomainError("invalid_tenant_pilot_host_config", "Tenant pilot Host adapters are required");
  }
  const resolveAuthenticationContext = createTenantAuthenticationResolver({
    humanBff,
    machineAuthenticator,
    getTrustedMtlsEvidence,
    clock
  });
  return createTenantHttpServer({
    gateway,
    resolveAuthenticationContext,
    createNetworkContext,
    port,
    host: "127.0.0.1",
    trustProxy: false,
    environment: "development",
    credentialSource: "local_test",
    serveAuthentication,
    serveWebAsset: createTenantWebAssetHandler({
      csrfTokenProvider,
      sessionHandleProvider
    })
  });
}
