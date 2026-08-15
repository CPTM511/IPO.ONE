import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { materializeTrackedGitSource } from "./tracked-git-source.mjs";

const RELEASE_SHA = /^[0-9a-f]{40}$/;
const DEFAULT_PORT_BASE = 8787;

function releaseIdentityError(message) {
  return new Error(`M1-B local release identity: ${message}`);
}

export function resolveLocalReleaseIdentity({ environment = process.env } = {}) {
  const requested = environment.IPO_ONE_M1_B_RELEASE_SHA;
  if (requested === undefined || requested === "") {
    return Object.freeze({
      revision: "local-stack",
      exactCandidate: false
    });
  }
  if (typeof requested !== "string" || !RELEASE_SHA.test(requested)) {
    throw releaseIdentityError(
      "IPO_ONE_M1_B_RELEASE_SHA must be one lowercase 40-character Git SHA"
    );
  }
  return Object.freeze({
    revision: requested,
    exactCandidate: true
  });
}

export function resolveLocalReviewPorts({
  environment = process.env,
  releaseIdentity = resolveLocalReleaseIdentity({ environment })
} = {}) {
  const requested = environment.IPO_ONE_M1_B_PORT_BASE;
  if (requested === undefined || requested === "") {
    return Object.freeze({
      basePort: DEFAULT_PORT_BASE,
      ports: Object.freeze([8787, 8788, 8789, 8790]),
      isolated: false
    });
  }
  if (
    typeof requested !== "string" ||
    !/^[1-9][0-9]{3,4}$/.test(requested)
  ) {
    throw releaseIdentityError(
      "IPO_ONE_M1_B_PORT_BASE must be a canonical decimal port base"
    );
  }
  const basePort = Number(requested);
  if (!Number.isSafeInteger(basePort) || basePort < 1_024 || basePort > 65_532) {
    throw releaseIdentityError(
      "IPO_ONE_M1_B_PORT_BASE must leave four consecutive non-privileged TCP ports"
    );
  }
  return Object.freeze({
    basePort,
    ports: Object.freeze([0, 1, 2, 3].map((offset) => basePort + offset)),
    isolated: basePort !== DEFAULT_PORT_BASE
  });
}

export function assertExactLocalReleaseSource(
  releaseIdentity,
  {
    root,
    git = (args) => execFileSync("git", args, {
      cwd: root,
      encoding: "utf8"
    }).trim()
  } = {}
) {
  if (releaseIdentity?.exactCandidate !== true) return releaseIdentity;
  if (
    typeof root !== "string" ||
    root.length < 1 ||
    !RELEASE_SHA.test(releaseIdentity.revision)
  ) {
    throw releaseIdentityError("exact-candidate source input is invalid");
  }
  const head = git(["rev-parse", "HEAD"]);
  if (head !== releaseIdentity.revision) {
    throw releaseIdentityError(
      `requested SHA ${releaseIdentity.revision} does not match current HEAD ${head}`
    );
  }
  const status = git(["status", "--porcelain=v1", "--untracked-files=no"]);
  if (status !== "") {
    throw releaseIdentityError(
      "exact-candidate local runtime requires a clean source worktree"
    );
  }
  return releaseIdentity;
}

export async function prepareLocalReleaseBuildContext(
  releaseIdentity,
  { root }
) {
  if (releaseIdentity?.exactCandidate !== true) return resolve(root);
  assertExactLocalReleaseSource(releaseIdentity, { root });
  const destination = resolve(
    root,
    ".ipo-one/local-stack/exact-source",
    releaseIdentity.revision
  );
  const allowedParent = resolve(
    root,
    ".ipo-one/local-stack/exact-source"
  );
  await materializeTrackedGitSource({
    root,
    revision: releaseIdentity.revision,
    destination,
    allowedParent
  });
  return destination;
}
