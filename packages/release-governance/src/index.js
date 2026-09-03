export const MAX_LAUNCH_JSON_BYTES = 128 * 1024;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]*@[s]ha256:[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const PLACEHOLDER_PATTERN = /(?:\[[^\]]*\]|<[^>]*>|\b(?:todo|tbd|pending|changeme|placeholder)\b)/i;
const SECRET_PATTERN = /(?:ghp_|github_pat_|AIza[0-9A-Za-z_-]{20,}|-----BEGIN |\bBearer\s+)/;
const SENSITIVE_QUERY_KEY_PATTERN = /(?:token|secret|signature|credential|api[_-]?key|x-goog|sig$|^key$)/i;
export const M2A008_EFFECTIVE_GATES = Object.freeze({
  m2a_testnet_code_integrity: "pre_deployment",
  m2a_testnet_exact_configuration: "pre_deployment",
  m2a_testnet_authority_signer_safety: "pre_deployment",
  m2a_testnet_exact_deployment: "runtime_enforced",
  m2a_testnet_post_deployment_acceptance: "post_deployment"
});

export class LaunchEvidenceError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "LaunchEvidenceError";
    this.issues = issues;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseCanonicalJson(text, label = "JSON document") {
  if (typeof text !== "string") {
    throw new LaunchEvidenceError(`${label} must be UTF-8 text.`);
  }
  if (Buffer.byteLength(text, "utf8") > MAX_LAUNCH_JSON_BYTES) {
    throw new LaunchEvidenceError(`${label} exceeds the 128 KiB limit.`);
  }
  if (text.charCodeAt(0) === 0xfeff) {
    throw new LaunchEvidenceError(`${label} must not contain a byte-order mark.`);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LaunchEvidenceError(`${label} is not valid JSON.`);
  }

  if (canonicalJson(value) !== text) {
    throw new LaunchEvidenceError(
      `${label} must use canonical two-space JSON with one trailing newline; duplicate keys are rejected.`
    );
  }
  return value;
}

function exactKeys(value, expected, path, issues) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return false;
  }
  const actual = Object.keys(value);
  for (const key of expected) {
    if (!actual.includes(key)) issues.push(`${path}.${key} is required.`);
  }
  for (const key of actual) {
    if (!expected.includes(key)) issues.push(`${path}.${key} is not allowed.`);
  }
  return true;
}

function boundedString(value, path, issues, { max = 256, pattern } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    issues.push(`${path} must be a non-empty string no longer than ${max} characters.`);
    return false;
  }
  if (/\p{Cc}/u.test(value)) {
    issues.push(`${path} must not contain control characters.`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    issues.push(`${path} has an invalid format.`);
    return false;
  }
  return true;
}

function safeApprovalText(value, path, issues) {
  if (!boundedString(value, path, issues, { max: 128 })) return;
  if (PLACEHOLDER_PATTERN.test(value)) issues.push(`${path} contains a placeholder.`);
  if (SECRET_PATTERN.test(value)) issues.push(`${path} resembles secret material.`);
}

function httpsEvidenceUrl(value, path, issues, repository) {
  if (!boundedString(value, path, issues, { max: 2048 })) return;
  if (PLACEHOLDER_PATTERN.test(value)) {
    issues.push(`${path} contains a placeholder.`);
    return;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    issues.push(`${path} must be an absolute HTTPS URL.`);
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    issues.push(`${path} must be an HTTPS URL without embedded credentials.`);
  }
  if (url.hash) issues.push(`${path} must not contain a URL fragment.`);
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      issues.push(`${path} must not contain credential-like query parameters.`);
      break;
    }
  }
  if (SECRET_PATTERN.test(value)) issues.push(`${path} resembles secret material.`);
  if (url.hostname === "github.com" && !url.pathname.startsWith(`/${repository}/`)) {
    issues.push(`${path} must reference the configured repository when hosted on GitHub.`);
  }
}

function immutableGitHubRunUrl(value, path, issues, repository) {
  httpsEvidenceUrl(value, path, issues, repository);
  if (typeof value !== "string") return;
  let url;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const runPath = new RegExp(`^/${escapedRepository}/actions/runs/\\d+(?:/attempts/\\d+)?/?$`);
  if (url.hostname !== "github.com" || !runPath.test(url.pathname)) {
    issues.push(`${path} must identify an immutable GitHub Actions run for this repository.`);
  }
}

function immutableGitHubRevisionUrl(value, path, issues, repository) {
  httpsEvidenceUrl(value, path, issues, repository);
  if (typeof value !== "string") return;
  let url;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const revisionPath = new RegExp(
    `^/${escapedRepository}/(?:commit|blob)/[a-f0-9]{40}(?:/[^?#]+)?/?$`
  );
  if (url.hostname !== "github.com" || !revisionPath.test(url.pathname)) {
    issues.push(`${path} must identify an immutable GitHub commit or blob for this repository.`);
  }
}

function immutableVercelDeploymentUrl(value, path, issues, repository) {
  httpsEvidenceUrl(value, path, issues, repository);
  if (typeof value !== "string") return;
  let url;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(
      url.hostname
    ) ||
    url.pathname !== "/" ||
    url.search
  ) {
    issues.push(
      `${path} must identify one immutable Vercel deployment URL.`
    );
  }
}

function timestamp(value, path, issues, nowMs, { allowFuture = false } = {}) {
  if (!boundedString(value, path, issues, { max: 40 })) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    issues.push(`${path} must be an ISO 8601 UTC timestamp with millisecond precision.`);
    return null;
  }
  if (!allowFuture && milliseconds > nowMs + 5 * 60 * 1000) {
    issues.push(`${path} must not be in the future.`);
  }
  return milliseconds;
}

const CAPABILITY_KEYS = [
  "realFundsEnabled",
  "humanCreditEnabled",
  "testAssetsEnabled",
  "securedPoolEnabled",
  "publicPoolParticipationEnabled",
  "marketCreationEnabled",
  "privateTenantDataEnabled",
  "externalProviderExecutionEnabled",
  "syntheticMeteredResourceEnabled",
  "agentVenueExecutionEnabled",
  "mainnetAuthorized",
  "custodyAuthorized",
  "withdrawalAuthorized"
];

function capabilities(value, path, issues) {
  if (!exactKeys(value, CAPABILITY_KEYS, path, issues)) return;
  for (const key of CAPABILITY_KEYS) {
    if (typeof value[key] !== "boolean") issues.push(`${path}.${key} must be a boolean.`);
  }
}

function securedPoolExactProfile(value, path, issues) {
  const keys = [
    "chainId",
    "poolContract",
    "poolBytecodeHash",
    "adapterVersion",
    "wethCollateral",
    "testUsdcDebt",
    "oracleAddress",
    "oracleSource",
    "marketCount",
    "runOwner",
    "deploymentApprovalRef",
    "configurationHash",
    "realValueClassification"
  ];
  if (!exactKeys(value, keys, path, issues)) return;

  if (value.chainId !== "eip155:84532") {
    issues.push(`${path}.chainId must be eip155:84532.`);
  }
  for (const key of ["poolContract", "wethCollateral", "testUsdcDebt", "oracleAddress"]) {
    boundedString(value[key], `${path}.${key}`, issues, {
      max: 42,
      pattern: /^0x[0-9a-fA-F]{40}$/
    });
  }
  if (value.wethCollateral !== "0x4200000000000000000000000000000000000006") {
    issues.push(`${path}.wethCollateral must be the reviewed Base Sepolia WETH address.`);
  }
  for (const key of ["poolBytecodeHash", "configurationHash"]) {
    boundedString(value[key], `${path}.${key}`, issues, {
      max: 66,
      pattern: /^0x[0-9a-f]{64}$/
    });
  }
  boundedString(value.adapterVersion, `${path}.adapterVersion`, issues, {
    max: 64,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
  });
  safeApprovalText(value.oracleSource, `${path}.oracleSource`, issues);
  safeApprovalText(value.runOwner, `${path}.runOwner`, issues);
  safeApprovalText(value.deploymentApprovalRef, `${path}.deploymentApprovalRef`, issues);
  if (value.marketCount !== 1) issues.push(`${path}.marketCount must equal 1.`);
  if (value.realValueClassification !== "test_assets_only") {
    issues.push(`${path}.realValueClassification must be test_assets_only.`);
  }
}

export function validateLaunchPolicy(policy) {
  const issues = [];
  const topKeys = ["schemaVersion", "policyVersion", "repository", "evidenceSchemaVersion", "profiles"];
  if (!exactKeys(policy, topKeys, "policy", issues)) {
    throw new LaunchEvidenceError("Launch policy is invalid.", issues);
  }

  if (policy.schemaVersion !== "ipo.one.launch-policy/v1") {
    issues.push("policy.schemaVersion must be ipo.one.launch-policy/v1.");
  }
  boundedString(policy.policyVersion, "policy.policyVersion", issues, {
    max: 32,
    pattern: /^\d+\.\d+\.\d+$/
  });
  boundedString(policy.repository, "policy.repository", issues, {
    max: 128,
    pattern: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
  });
  if (policy.evidenceSchemaVersion !== "ipo.one.launch-evidence/v1") {
    issues.push("policy.evidenceSchemaVersion must be ipo.one.launch-evidence/v1.");
  }
  if (!isRecord(policy.profiles) || Object.keys(policy.profiles).length === 0) {
    issues.push("policy.profiles must define at least one profile.");
  } else {
    for (const [profileId, profile] of Object.entries(policy.profiles)) {
      if (!ID_PATTERN.test(profileId)) issues.push(`policy.profiles.${profileId} has an invalid ID.`);
      const path = `policy.profiles.${profileId}`;
      const keys = [
        "displayName",
        "releaseEnabled",
        "environment",
        "maxReleaseAgeHours",
        "capabilities",
        "exactProfile",
        "gates",
        "unlockRequirements"
      ];
      if (!exactKeys(profile, keys, path, issues)) continue;
      boundedString(profile.displayName, `${path}.displayName`, issues, { max: 128 });
      boundedString(profile.environment, `${path}.environment`, issues, {
        max: 64,
        pattern: /^[a-z][a-z0-9-]{2,63}$/
      });
      if (typeof profile.releaseEnabled !== "boolean") {
        issues.push(`${path}.releaseEnabled must be a boolean.`);
      }
      if (!Number.isInteger(profile.maxReleaseAgeHours) || profile.maxReleaseAgeHours < 1 || profile.maxReleaseAgeHours > 720) {
        issues.push(`${path}.maxReleaseAgeHours must be an integer from 1 to 720.`);
      }
      capabilities(profile.capabilities, `${path}.capabilities`, issues);
      if (profile.capabilities?.humanCreditEnabled !== false) {
        issues.push(`${path} must not enable Human credit under the current product charter.`);
      }
      if (profile.capabilities?.marketCreationEnabled !== false) {
        issues.push(`${path} must not enable market creation under the current Product Constitution.`);
      }
      if (
        profile.capabilities?.mainnetAuthorized !== false ||
        profile.capabilities?.custodyAuthorized !== false ||
        profile.capabilities?.withdrawalAuthorized !== false
      ) {
        issues.push(`${path} must not authorize mainnet, custody, or withdrawal under the current Product Constitution.`);
      }
      if (
        profile.capabilities?.publicPoolParticipationEnabled === true &&
        (profile.capabilities?.securedPoolEnabled !== true ||
          profile.capabilities?.testAssetsEnabled !== true)
      ) {
        issues.push(`${path} cannot enable public pool participation without secured test assets.`);
      }
      if (
        profile.capabilities?.realFundsEnabled === true &&
        profile.capabilities?.testAssetsEnabled === true
      ) {
        issues.push(`${path} must not conflate real funds with test assets.`);
      }
      if (
        profile.capabilities?.syntheticMeteredResourceEnabled === true &&
        (profile.capabilities?.realFundsEnabled !== false ||
          profile.capabilities?.externalProviderExecutionEnabled !== false)
      ) {
        issues.push(`${path} cannot combine the synthetic Metered Resource with real funds or external Provider execution.`);
      }

      if (profileId === "live_testnet_secured_pool") {
        if (
          profile.capabilities?.realFundsEnabled !== false ||
          profile.capabilities?.humanCreditEnabled !== false ||
          profile.capabilities?.testAssetsEnabled !== true ||
          profile.capabilities?.securedPoolEnabled !== true ||
          profile.capabilities?.publicPoolParticipationEnabled !== true ||
          profile.capabilities?.marketCreationEnabled !== false ||
          profile.capabilities?.privateTenantDataEnabled !== false ||
          profile.capabilities?.externalProviderExecutionEnabled !== false ||
          profile.capabilities?.syntheticMeteredResourceEnabled !== false ||
          profile.capabilities?.agentVenueExecutionEnabled !== false
        ) {
          issues.push(`${path} capability boundary drifted from the ratified M2A test-asset profile.`);
        }
        if (profile.exactProfile === null) {
          if (profile.releaseEnabled === true) {
            issues.push(`${path}.exactProfile must be complete before release can be enabled.`);
          }
        } else {
          securedPoolExactProfile(profile.exactProfile, `${path}.exactProfile`, issues);
        }
      } else {
        if (profile.exactProfile !== null) {
          issues.push(`${path}.exactProfile is reserved for an exact secured-pool profile.`);
        }
        if (
          profile.capabilities?.testAssetsEnabled !== false ||
          profile.capabilities?.securedPoolEnabled !== false ||
          profile.capabilities?.publicPoolParticipationEnabled !== false ||
          profile.capabilities?.agentVenueExecutionEnabled !== false
        ) {
          issues.push(`${path} must not inherit M2 secured-pool or Agent venue capabilities.`);
        }
      }
      if (profileId === "public_authenticated_no_funds_beta") {
        if (
          profile.releaseEnabled !== true ||
          profile.environment !== "public-authenticated-no-funds-beta" ||
          profile.capabilities?.realFundsEnabled !== false ||
          profile.capabilities?.humanCreditEnabled !== false ||
          profile.capabilities?.testAssetsEnabled !== false ||
          profile.capabilities?.securedPoolEnabled !== false ||
          profile.capabilities?.publicPoolParticipationEnabled !== false ||
          profile.capabilities?.marketCreationEnabled !== false ||
          profile.capabilities?.privateTenantDataEnabled !== true ||
          profile.capabilities?.externalProviderExecutionEnabled !== false ||
          profile.capabilities?.syntheticMeteredResourceEnabled !== true ||
          profile.capabilities?.agentVenueExecutionEnabled !== false ||
          profile.capabilities?.mainnetAuthorized !== false ||
          profile.capabilities?.custodyAuthorized !== false ||
          profile.capabilities?.withdrawalAuthorized !== false ||
          profile.gates?.some(({ id }) => id === "pilot_participant_approval") ||
          profile.unlockRequirements?.length !== 0
        ) {
          issues.push(`${path} drifted from the Founder-authorized public authenticated no-funds Beta.`);
        }
      } else if (
        profile.releaseEnabled === true &&
        (profile.capabilities?.realFundsEnabled === true ||
          profile.capabilities?.privateTenantDataEnabled === true ||
          profile.capabilities?.externalProviderExecutionEnabled === true)
      ) {
        issues.push(
          `${path} must remain policy-locked while private tenant data, real funds, or external provider execution is enabled.`
        );
      }

      if (!Array.isArray(profile.gates) || profile.gates.length === 0) {
        issues.push(`${path}.gates must be a non-empty array.`);
      } else {
        const gateIds = new Set();
        profile.gates.forEach((gate, index) => {
          const gatePath = `${path}.gates[${index}]`;
          const gateKeys = profileId === "live_testnet_secured_pool"
            ? ["id", "ownerRole", "maxAgeHours", "stage"]
            : ["id", "ownerRole", "maxAgeHours"];
          if (!exactKeys(gate, gateKeys, gatePath, issues)) return;
          if (!boundedString(gate.id, `${gatePath}.id`, issues, { max: 64, pattern: ID_PATTERN })) return;
          if (gateIds.has(gate.id)) issues.push(`${path}.gates duplicates ${gate.id}.`);
          gateIds.add(gate.id);
          boundedString(gate.ownerRole, `${gatePath}.ownerRole`, issues, { max: 128 });
          if (!Number.isInteger(gate.maxAgeHours) || gate.maxAgeHours < 1 || gate.maxAgeHours > 8760) {
            issues.push(`${gatePath}.maxAgeHours must be an integer from 1 to 8760.`);
          }
          if (
            profileId === "live_testnet_secured_pool" &&
            M2A008_EFFECTIVE_GATES[gate.id] !== gate.stage
          ) {
            issues.push(`${gatePath} does not match the exact M2A-008 gate stage.`);
          }
        });
        if (profileId === "live_testnet_secured_pool") {
          const expectedIds = Object.keys(M2A008_EFFECTIVE_GATES);
          for (const gateId of expectedIds) {
            if (!gateIds.has(gateId)) issues.push(`${path}.gates is missing ${gateId}.`);
          }
          for (const gateId of gateIds) {
            if (!expectedIds.includes(gateId)) issues.push(`${path}.gates must not add ${gateId}.`);
          }
        }
        const requiresIndependentReview =
          profile.capabilities?.realFundsEnabled === true ||
          /mainnet/.test(profileId) ||
          /mainnet/.test(profile.environment ?? "");
        if (
          requiresIndependentReview &&
          !profile.gates.some((gate) => gate.ownerRole === "Independent Security")
        ) {
          issues.push(`${path} requires an Independent Security gate before mainnet or real value.`);
        }
      }

      if (!Array.isArray(profile.unlockRequirements)) {
        issues.push(`${path}.unlockRequirements must be an array.`);
      } else {
        profile.unlockRequirements.forEach((requirement, index) =>
          boundedString(requirement, `${path}.unlockRequirements[${index}]`, issues, { max: 256 })
        );
      }
      if (profile.releaseEnabled === false && profile.unlockRequirements?.length === 0) {
        issues.push(`${path} is locked but has no unlock requirements.`);
      }
      if (profile.releaseEnabled === true && profile.unlockRequirements?.length !== 0) {
        issues.push(`${path} is enabled and must not retain unlock requirements.`);
      }
    }
  }

  if (issues.length > 0) throw new LaunchEvidenceError("Launch policy is invalid.", issues);
  return policy;
}

export function verifyLaunchEvidence(
  evidence,
  { policy, expectedProfile, expectedCommitSha, now = new Date() }
) {
  validateLaunchPolicy(policy);
  const issues = [];
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new LaunchEvidenceError("Verification time is invalid.");

  const topKeys = [
    "schemaVersion",
    "policyVersion",
    "profile",
    "release",
    "capabilities",
    "externalAuthorization",
    "gates"
  ];
  if (!exactKeys(evidence, topKeys, "evidence", issues)) {
    throw new LaunchEvidenceError("Launch evidence is invalid.", issues);
  }
  if (evidence.schemaVersion !== policy.evidenceSchemaVersion) {
    issues.push("evidence.schemaVersion does not match the policy.");
  }
  if (evidence.policyVersion !== policy.policyVersion) {
    issues.push("evidence.policyVersion does not match the policy.");
  }
  if (evidence.profile !== expectedProfile) {
    issues.push("evidence.profile does not match the explicitly requested profile.");
  }

  const profile = policy.profiles[evidence.profile];
  if (!profile) {
    issues.push("evidence.profile is not defined by policy.");
  } else if (profile.releaseEnabled !== true) {
    issues.push("evidence.profile is policy-locked and cannot authorize a release.");
  }

  const releaseKeys = ["repository", "commitSha", "ciRunUrl", "imageUri", "builtAt"];
  let builtAt = null;
  if (exactKeys(evidence.release, releaseKeys, "evidence.release", issues)) {
    if (evidence.release.repository !== policy.repository) {
      issues.push("evidence.release.repository does not match policy.");
    }
    if (!boundedString(evidence.release.commitSha, "evidence.release.commitSha", issues, { max: 40, pattern: SHA_PATTERN })) {
      // The format issue is already recorded.
    } else if (evidence.release.commitSha !== expectedCommitSha) {
      issues.push("evidence.release.commitSha does not match the expected immutable release commit.");
    }
    if (!SHA_PATTERN.test(expectedCommitSha ?? "")) {
      issues.push("expectedCommitSha must be an explicit lowercase 40-character Git SHA.");
    }
    immutableGitHubRunUrl(
      evidence.release.ciRunUrl,
      "evidence.release.ciRunUrl",
      issues,
      policy.repository
    );
    if (evidence.profile === "live_testnet_secured_pool") {
      if (evidence.release.imageUri !== null) {
        issues.push("evidence.release.imageUri must be null for the local closed M2A-008 runner.");
      }
    } else if (evidence.profile === "public_authenticated_no_funds_beta") {
      immutableVercelDeploymentUrl(
        evidence.release.imageUri,
        "evidence.release.imageUri",
        issues,
        policy.repository
      );
    } else {
      boundedString(evidence.release.imageUri, "evidence.release.imageUri", issues, {
        max: 512,
        pattern: DIGEST_IMAGE_PATTERN
      });
    }
    builtAt = timestamp(evidence.release.builtAt, "evidence.release.builtAt", issues, nowMs);
    if (builtAt !== null && profile && nowMs - builtAt > profile.maxReleaseAgeHours * 60 * 60 * 1000) {
      issues.push("evidence.release.builtAt is older than the profile release window.");
    }
  }

  capabilities(evidence.capabilities, "evidence.capabilities", issues);
  if (profile && isRecord(evidence.capabilities)) {
    for (const [key, requiredValue] of Object.entries(profile.capabilities)) {
      if (evidence.capabilities[key] !== requiredValue) {
        issues.push(`evidence.capabilities.${key} does not match the release profile.`);
      }
    }
  }

  const authorizationKeys = ["system", "environment", "approvalUrl", "approvedAt"];
  if (exactKeys(evidence.externalAuthorization, authorizationKeys, "evidence.externalAuthorization", issues)) {
    const m2aTestnet = evidence.profile === "live_testnet_secured_pool";
    const expectedSystem = m2aTestnet
      ? "founder_exact_testnet_decision"
      : "protected_environment";
    if (evidence.externalAuthorization.system !== expectedSystem) {
      issues.push(
        `evidence.externalAuthorization.system must be ${expectedSystem}.`
      );
    }
    if (profile && evidence.externalAuthorization.environment !== profile.environment) {
      issues.push("evidence.externalAuthorization.environment does not match the profile.");
    }
    if (m2aTestnet) {
      immutableGitHubRevisionUrl(
        evidence.externalAuthorization.approvalUrl,
        "evidence.externalAuthorization.approvalUrl",
        issues,
        policy.repository
      );
    } else {
      immutableGitHubRunUrl(
        evidence.externalAuthorization.approvalUrl,
        "evidence.externalAuthorization.approvalUrl",
        issues,
        policy.repository
      );
    }
    const authorizedAt = timestamp(
      evidence.externalAuthorization.approvedAt,
      "evidence.externalAuthorization.approvedAt",
      issues,
      nowMs
    );
    if (authorizedAt !== null && builtAt !== null && authorizedAt < builtAt) {
      issues.push("evidence.externalAuthorization.approvedAt must not precede the release build.");
    }
  }

  if (!Array.isArray(evidence.gates)) {
    issues.push("evidence.gates must be an array.");
  } else if (profile) {
    const requiredById = new Map(
      profile.gates
        .filter((gate) => gate.stage === undefined || gate.stage === "pre_deployment")
        .map((gate) => [gate.id, gate])
    );
    const observedIds = new Set();
    evidence.gates.forEach((gate, index) => {
      const path = `evidence.gates[${index}]`;
      const gateKeys = ["id", "status", "ownerRole", "approvedBy", "approvedAt", "expiresAt", "evidenceUrl"];
      if (!exactKeys(gate, gateKeys, path, issues)) return;
      if (!boundedString(gate.id, `${path}.id`, issues, { max: 64, pattern: ID_PATTERN })) return;
      if (observedIds.has(gate.id)) issues.push(`${path}.id duplicates another gate.`);
      observedIds.add(gate.id);
      const required = requiredById.get(gate.id);
      if (!required) {
        issues.push(`${path}.id is not defined by the selected profile.`);
        return;
      }
      if (gate.status !== "approved") issues.push(`${path}.status must be approved.`);
      if (gate.ownerRole !== required.ownerRole) issues.push(`${path}.ownerRole does not match policy.`);
      safeApprovalText(gate.approvedBy, `${path}.approvedBy`, issues);
      const approvedAt = timestamp(gate.approvedAt, `${path}.approvedAt`, issues, nowMs);
      const expiresAt = timestamp(gate.expiresAt, `${path}.expiresAt`, issues, nowMs, {
        allowFuture: true
      });
      if (approvedAt !== null && nowMs - approvedAt > required.maxAgeHours * 60 * 60 * 1000) {
        issues.push(`${path}.approvedAt is older than the gate approval window.`);
      }
      if (expiresAt !== null && expiresAt <= nowMs) issues.push(`${path}.expiresAt must be in the future.`);
      if (approvedAt !== null && expiresAt !== null && expiresAt <= approvedAt) {
        issues.push(`${path}.expiresAt must be later than approvedAt.`);
      }
      if (
        approvedAt !== null &&
        expiresAt !== null &&
        expiresAt - approvedAt > required.maxAgeHours * 60 * 60 * 1000
      ) {
        issues.push(`${path}.expiresAt exceeds the gate approval window.`);
      }
      httpsEvidenceUrl(gate.evidenceUrl, `${path}.evidenceUrl`, issues, policy.repository);
    });

    for (const requiredId of requiredById.keys()) {
      if (!observedIds.has(requiredId)) issues.push(`evidence.gates is missing ${requiredId}.`);
    }
  }

  if (issues.length > 0) throw new LaunchEvidenceError("Launch evidence is invalid.", issues);
  return {
    status: "verified",
    policyVersion: policy.policyVersion,
    profile: evidence.profile,
    repository: evidence.release.repository,
    commitSha: evidence.release.commitSha,
    imageUri: evidence.release.imageUri,
    gateCount: evidence.gates.length,
    externalAuthorization: evidence.externalAuthorization.system
  };
}
