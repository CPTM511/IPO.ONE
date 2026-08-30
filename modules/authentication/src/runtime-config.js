import { authenticationError } from "./security-utils.js";

const AUTHENTICATION_MODES = new Set([
  "disabled",
  "local_test",
  "closed_pilot",
  "public_beta"
]);
const REFERENCE_HASH_MODES = new Set([
  "single_v1",
  "overlap_v2_write_v1_lookup",
  "single_v2"
]);
const IMMUTABLE_SECRET_REFERENCE = /^(?:projects\/[a-z][a-z0-9-]{4,61}\/secrets\/[A-Za-z0-9_-]{1,255}\/versions\/[1-9][0-9]*|vercel:\/\/environment\/production\/[A-Z][A-Z0-9_]{2,127}@sha256:[0-9a-f]{64})$/;
const trustedRuntimeConfigs = new WeakSet();

function trustedConfig(value) {
  const config = Object.freeze(value);
  trustedRuntimeConfigs.add(config);
  return config;
}

export function loadAuthenticationRuntimeConfig(environment = process.env) {
  const mode = environment.IPO_ONE_AUTHENTICATION_MODE ?? "disabled";
  const referenceHashMode = environment.IPO_ONE_AUTH_REFERENCE_HASH_MODE ?? "single_v1";
  if (!AUTHENTICATION_MODES.has(mode)) {
    throw authenticationError("invalid_authentication_configuration", "authentication mode is invalid");
  }
  const deployedProtectedMode = new Set(["closed_pilot", "public_beta"]).has(mode);
  if (deployedProtectedMode) {
    if (!REFERENCE_HASH_MODES.has(referenceHashMode)) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "deployed authentication reference hash mode is invalid"
      );
    }
    if (mode === "public_beta" && referenceHashMode !== "single_v2") {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "public Beta authentication requires the current single-v2 reference hash boundary"
      );
    }
    if (
      environment.IPO_ONE_IDP_DEPLOYMENT_APPROVAL !== "APPROVED" ||
      !/^[a-z][a-z0-9_-]{2,63}$/.test(environment.IPO_ONE_IDP_VENDOR_ID ?? "") ||
      !/^[0-9a-f]{40}$/.test(environment.IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA ?? "")
    ) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "deployed authentication requires an external IdP deployment approval"
      );
    }
    const requiredSecretReferences = [
      "IPO_ONE_IDP_CONFIGURATION_REF",
      "IPO_ONE_AUTH_ENCRYPTION_KEY_REF"
    ];
    if (referenceHashMode === "single_v1") {
      requiredSecretReferences.push("IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF");
      if (environment.IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF !== undefined) {
        throw authenticationError(
          "authentication_deployment_gate_closed",
          "single-v1 authentication rejects a next reference hash key"
        );
      }
    } else if (referenceHashMode === "overlap_v2_write_v1_lookup") {
      requiredSecretReferences.push(
        "IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF",
        "IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF"
      );
    } else {
      requiredSecretReferences.push("IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF");
      if (environment.IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF !== undefined) {
        throw authenticationError(
          "authentication_deployment_gate_closed",
          "single-v2 authentication rejects a legacy reference hash key"
        );
      }
    }
    if (environment.IPO_ONE_IDP_VENDOR_ID !== "wallet_only") {
      requiredSecretReferences.push("IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF");
    }
    for (const name of requiredSecretReferences) {
      const value = environment[name];
      if (
        typeof value !== "string" ||
        !IMMUTABLE_SECRET_REFERENCE.test(value)
      ) {
        throw authenticationError(
          "authentication_deployment_gate_closed",
          "deployed authentication requires approved immutable secret references"
        );
      }
    }
    if (
      referenceHashMode === "overlap_v2_write_v1_lookup" &&
      environment.IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF ===
        environment.IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF
    ) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "reference hash rotation keys require distinct immutable references"
      );
    }
  }
  if (mode === "local_test" && environment.NODE_ENV === "production") {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "local test authentication cannot run in production"
    );
  }
  return trustedConfig({
    enabled: mode !== "disabled",
    mode,
    deploymentGateSatisfied: deployedProtectedMode,
    publicBetaSelfService: mode === "public_beta",
    ...(deployedProtectedMode
      ? {
          vendorId: environment.IPO_ONE_IDP_VENDOR_ID,
          approvalSha: environment.IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA,
          idpConfigurationRef: environment.IPO_ONE_IDP_CONFIGURATION_REF,
          ...(environment.IPO_ONE_IDP_VENDOR_ID === "wallet_only"
            ? {}
            : { oidcClientCredentialRef: environment.IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF }),
          referenceHashMode,
          referenceHashKeyRef: referenceHashMode === "single_v1"
            ? environment.IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF
            : environment.IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF,
          ...(referenceHashMode === "overlap_v2_write_v1_lookup"
            ? {
                legacyReferenceHashKeyRef:
                  environment.IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF
              }
            : {}),
          encryptionKeyRef: environment.IPO_ONE_AUTH_ENCRYPTION_KEY_REF
        }
      : {})
  });
}

export function assertAuthenticationRuntimeConfig(value) {
  if (!value || typeof value !== "object" || !trustedRuntimeConfigs.has(value)) {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "authentication runtime configuration must come from the reviewed loader"
    );
  }
  return value;
}
