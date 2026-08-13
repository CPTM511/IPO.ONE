import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { M1BAcceptanceEvidenceError } from "../packages/release-governance/src/m1-b-acceptance-evidence.js";

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;

export async function verifyM1BArtifactFiles(artifacts, { evidenceRoot }) {
  const rootStats = await lstat(resolve(evidenceRoot));
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new M1BAcceptanceEvidenceError([
      "Evidence root must be a real directory, not a symbolic link."
    ]);
  }
  const canonicalRoot = await realpath(resolve(evidenceRoot));
  for (const artifact of artifacts) {
    const requestedPath = resolve(canonicalRoot, artifact.relativePath);
    const relativePath = relative(canonicalRoot, requestedPath);
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} is outside the Evidence root.`
      ]);
    }
    let artifactPath;
    try {
      artifactPath = await realpath(requestedPath);
    } catch {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} does not exist.`
      ]);
    }
    if (artifactPath !== requestedPath) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} must not contain symbolic-link path components.`
      ]);
    }
    const canonicalRelative = relative(canonicalRoot, artifactPath);
    if (
      canonicalRelative === "" ||
      canonicalRelative.startsWith("..") ||
      isAbsolute(canonicalRelative)
    ) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} resolves outside the Evidence root.`
      ]);
    }
    const artifactStats = await stat(artifactPath);
    if (
      !artifactStats.isFile() ||
      artifactStats.size < 1 ||
      artifactStats.size > MAX_ARTIFACT_BYTES
    ) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} must be a non-empty regular file no larger than 64 MiB.`
      ]);
    }
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(artifactPath)) {
      digest.update(chunk);
    }
    if (digest.digest("hex") !== artifact.sha256) {
      throw new M1BAcceptanceEvidenceError([
        `Artifact ${artifact.id} SHA-256 does not match its Evidence record.`
      ]);
    }
  }
  return true;
}

export function verifyM1BCurrentGitSource(
  evidence,
  expectedCommitSha,
  {
    root,
    git = (args) => execFileSync("git", args, {
      cwd: root,
      encoding: "utf8"
    }).trim()
  }
) {
  const head = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", `${head}^{tree}`]);
  const trackedStatus = git([
    "status",
    "--porcelain=v1",
    "--untracked-files=no"
  ]);
  const issues = [];
  if (head !== expectedCommitSha) {
    issues.push(`Current Git HEAD ${head} does not match ${expectedCommitSha}.`);
  }
  if (evidence.source.commitSha !== head) {
    issues.push("evidence.source.commitSha does not match current Git HEAD.");
  }
  if (evidence.source.treeSha !== tree) {
    issues.push("evidence.source.treeSha does not match the current Git tree.");
  }
  if (trackedStatus !== "") {
    issues.push("Current tracked Git worktree is not clean.");
  }
  if (issues.length > 0) throw new M1BAcceptanceEvidenceError(issues);
  return true;
}
