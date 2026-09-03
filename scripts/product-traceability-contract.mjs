export const EXPECTED_ENABLED_RELEASE_PROFILES = Object.freeze([
  "public_sandbox",
  "public_authenticated_no_funds_beta",
  "live_testnet_secured_pool"
]);

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function validateTraceabilityReleaseMaturity({
  launchPolicy,
  releaseMaturity
}) {
  const failures = [];
  const enabledProfiles = Object.entries(launchPolicy?.profiles ?? {})
    .filter(([, profile]) => profile.releaseEnabled)
    .map(([profileId]) => profileId);

  if (!sameArray(enabledProfiles, EXPECTED_ENABLED_RELEASE_PROFILES)) {
    failures.push("the launch policy enabled-profile set drifted from the exact reviewed profiles");
  }
  if (!sameArray(releaseMaturity?.enabledReleaseProfiles, EXPECTED_ENABLED_RELEASE_PROFILES)) {
    failures.push("traceability enabled release profiles drifted");
  }
  if (releaseMaturity?.publicAuthenticatedNoFundsBetaEnabled !== true) {
    failures.push("traceability public authenticated no-funds Beta state drifted");
  }
  if (releaseMaturity?.controlledCreditReleaseEnabled !== false) {
    failures.push("traceability controlled-credit release state drifted");
  }

  const sandbox = launchPolicy?.profiles?.public_sandbox;
  if (
    sandbox?.releaseEnabled !== true ||
    sandbox?.capabilities?.realFundsEnabled !== false ||
    sandbox?.capabilities?.humanCreditEnabled !== false ||
    sandbox?.capabilities?.externalProviderExecutionEnabled !== false
  ) failures.push("public sandbox safety boundary drifted");

  const pool = launchPolicy?.profiles?.live_testnet_secured_pool;
  if (
    pool?.releaseEnabled !== true ||
    pool?.environment !== "live-testnet-secured-pool" ||
    pool?.capabilities?.realFundsEnabled !== false ||
    pool?.capabilities?.humanCreditEnabled !== false ||
    pool?.capabilities?.testAssetsEnabled !== true ||
    pool?.capabilities?.securedPoolEnabled !== true ||
    pool?.capabilities?.publicPoolParticipationEnabled !== true ||
    pool?.capabilities?.marketCreationEnabled !== false ||
    pool?.capabilities?.externalProviderExecutionEnabled !== false ||
    pool?.capabilities?.agentVenueExecutionEnabled !== false ||
    pool?.exactProfile?.chainId !== "eip155:84532" ||
    pool?.exactProfile?.realValueClassification !== "test_assets_only"
  ) failures.push("M2 secured-pool Testnet safety boundary drifted");

  const publicBeta = launchPolicy?.profiles?.public_authenticated_no_funds_beta;
  if (
    publicBeta?.releaseEnabled !== true ||
    publicBeta?.environment !== "public-authenticated-no-funds-beta" ||
    publicBeta?.capabilities?.realFundsEnabled !== false ||
    publicBeta?.capabilities?.humanCreditEnabled !== false ||
    publicBeta?.capabilities?.privateTenantDataEnabled !== true ||
    publicBeta?.capabilities?.externalProviderExecutionEnabled !== false ||
    publicBeta?.capabilities?.syntheticMeteredResourceEnabled !== true ||
    publicBeta?.capabilities?.agentVenueExecutionEnabled !== false ||
    publicBeta?.capabilities?.mainnetAuthorized !== false ||
    publicBeta?.capabilities?.custodyAuthorized !== false ||
    publicBeta?.capabilities?.withdrawalAuthorized !== false
  ) failures.push("public authenticated no-funds Beta safety boundary drifted");

  return Object.freeze(failures);
}

export function validateExactTenantCatalogCoverage({
  catalogIds,
  bindingIds,
  classifiedCatalogIds
}) {
  const failures = [];
  const expected = [...catalogIds].sort();
  const bindings = [...bindingIds].sort();
  const classified = [...classifiedCatalogIds].sort();

  if (!sameArray(bindings, expected)) {
    failures.push("operation bindings must cover the exact closed Tenant catalog");
  }
  if (!sameArray(classified, expected)) {
    failures.push("REAL_LOCAL V9 actions must account for every operation in the closed Tenant catalog");
  }
  return Object.freeze(failures);
}
