import { authenticationError } from "./security-utils.js";

const AUTHENTICATION_MODES = new Set(["disabled", "local_test", "closed_pilot"]);

export function loadAuthenticationRuntimeConfig(environment = process.env) {
  const mode = environment.IPO_ONE_AUTHENTICATION_MODE ?? "disabled";
  if (!AUTHENTICATION_MODES.has(mode)) {
    throw authenticationError("invalid_authentication_configuration", "authentication mode is invalid");
  }
  if (mode === "closed_pilot") {
    if (
      environment.IPO_ONE_IDP_DEPLOYMENT_APPROVAL !== "APPROVED" ||
      !/^[a-z][a-z0-9_-]{2,63}$/.test(environment.IPO_ONE_IDP_VENDOR_ID ?? "") ||
      !/^[0-9a-f]{40}$/.test(environment.IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA ?? "")
    ) {
      throw authenticationError(
        "authentication_deployment_gate_closed",
        "closed-pilot authentication requires an external IdP deployment approval"
      );
    }
    for (const name of [
      "IPO_ONE_IDP_CONFIGURATION_REF",
      "IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF",
      "IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF"
    ]) {
      const value = environment[name];
      if (
        typeof value !== "string" ||
        !/^projects\/[a-z][a-z0-9-]{4,61}\/secrets\/[A-Za-z0-9_-]{1,255}\/versions\/[1-9][0-9]*$/.test(value)
      ) {
        throw authenticationError(
          "authentication_deployment_gate_closed",
          "closed-pilot authentication requires approved secret-manager references"
        );
      }
    }
  }
  if (mode === "local_test" && environment.NODE_ENV === "production") {
    throw authenticationError(
      "authentication_deployment_gate_closed",
      "local test authentication cannot run in production"
    );
  }
  return Object.freeze({
    enabled: mode !== "disabled",
    mode,
    deploymentGateSatisfied: mode === "closed_pilot"
  });
}
