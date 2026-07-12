export const MAX_LAUNCH_JSON_BYTES = 128 * 1024;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/-]*@[s]ha256:[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const PLACEHOLDER_PATTERN = /(?:\[[^\]]*\]|<[^>]*>|\b(?:todo|tbd|pending|changeme|placeholder)\b)/i;
const SECRET_PATTERN = /(?:ghp_|github_pat_|AIza[0-9A-Za-z_-]{20,}|-----BEGIN |\bBearer\s+)/;
const SENSITIVE_QUERY_KEY_PATTERN = /(?:token|secret|signature|credential|api[_-]?key|x-goog|sig$|^key$)/i;

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

function capabilities(value, path, issues) {
  const keys = [
    "realFundsEnabled",
    "humanCreditEnabled",
    "privateTenantDataEnabled",
    "externalProviderExecutionEnabled"
  ];
  if (!exactKeys(value, keys, path, issues)) return;
  for (const key of keys) {
    if (typeof value[key] !== "boolean") issues.push(`${path}.${key} must be a boolean.`);
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
      if (
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
          if (!exactKeys(gate, ["id", "ownerRole", "maxAgeHours"], gatePath, issues)) return;
          if (!boundedString(gate.id, `${gatePath}.id`, issues, { max: 64, pattern: ID_PATTERN })) return;
          if (gateIds.has(gate.id)) issues.push(`${path}.gates duplicates ${gate.id}.`);
          gateIds.add(gate.id);
          boundedString(gate.ownerRole, `${gatePath}.ownerRole`, issues, { max: 128 });
          if (!Number.isInteger(gate.maxAgeHours) || gate.maxAgeHours < 1 || gate.maxAgeHours > 8760) {
            issues.push(`${gatePath}.maxAgeHours must be an integer from 1 to 8760.`);
          }
        });
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
    boundedString(evidence.release.imageUri, "evidence.release.imageUri", issues, {
      max: 512,
      pattern: DIGEST_IMAGE_PATTERN
    });
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
    if (evidence.externalAuthorization.system !== "protected_environment") {
      issues.push("evidence.externalAuthorization.system must be protected_environment.");
    }
    if (profile && evidence.externalAuthorization.environment !== profile.environment) {
      issues.push("evidence.externalAuthorization.environment does not match the profile.");
    }
    immutableGitHubRunUrl(
      evidence.externalAuthorization.approvalUrl,
      "evidence.externalAuthorization.approvalUrl",
      issues,
      policy.repository
    );
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
    const requiredById = new Map(profile.gates.map((gate) => [gate.id, gate]));
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
