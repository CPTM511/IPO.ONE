import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { hashId } from "../packages/domain/src/index.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);

const EXCLUDED_PATHS = new Set([
  "docs/codex/audits/TC-403/audit.md",
  "docs/codex/audits/TC-403/ai-supplementary-review.md",
  "docs/codex/audits/TC-403/founder-acceptance-decision.md",
  "docs/codex/audits/TC-403/operability-assurance.json",
  "docs/codex/audits/TC-403/reviewed-artifact-manifest.json"
]);
const EXCLUDED_PREFIXES = Object.freeze([
  "cdp-app-react/"
]);
const EXCLUDED_SUCCESSOR_AUDIT_PREFIXES = Object.freeze([
  "docs/codex/audits/RELEASE-001/",
  "docs/codex/audits/REALVALUE-001/"
]);

function repositoryGit(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
}

function parseChangedPaths() {
  const output = repositoryGit([
    "status",
    "--porcelain=v1",
    "--untracked-files=all"
  ]);
  const entries = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const statusCode = line.slice(0, 2);
    const rawPath = line.slice(3);
    if (
      rawPath.includes(" -> ") ||
      rawPath.includes("\n") ||
      rawPath.includes("\r")
    ) {
      throw new Error("TC-403 manifest requires rename-free bounded paths");
    }
    const path = rawPath.replace(/^"|"$/g, "");
    if (
      !path ||
      path.startsWith("/") ||
      path.split("/").includes("..") ||
      path.includes("\\") ||
      EXCLUDED_PATHS.has(path) ||
      EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
      EXCLUDED_SUCCESSOR_AUDIT_PREFIXES.some((prefix) =>
        path.startsWith(prefix)
      )
    ) {
      if (
        EXCLUDED_PATHS.has(path) ||
        EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
        EXCLUDED_SUCCESSOR_AUDIT_PREFIXES.some((prefix) =>
          path.startsWith(prefix)
        )
      ) {
        continue;
      }
      throw new Error("TC-403 manifest encountered an unsafe path");
    }
    entries.push({ path, statusCode });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function fileIdentity({ path, statusCode }) {
  const absolutePath = resolve(repositoryRoot, path);
  if (
    absolutePath !== repositoryRoot &&
    !absolutePath.startsWith(`${repositoryRoot}${sep}`)
  ) {
    throw new Error("TC-403 manifest path escaped the repository");
  }
  if (statusCode.includes("D")) {
    return {
      path,
      statusCode,
      byteLength: 0,
      sha256: null
    };
  }
  const metadata = await stat(absolutePath);
  if (!metadata.isFile() || metadata.size > 16 * 1024 * 1024) {
    throw new Error(`TC-403 manifest file is invalid or oversized: ${path}`);
  }
  const content = await readFile(absolutePath);
  return {
    path,
    statusCode,
    byteLength: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

export async function buildTc403ArtifactManifest() {
  const releaseCommit = repositoryGit(["rev-parse", "HEAD"]).trim();
  if (!/^[0-9a-f]{40}$/.test(releaseCommit)) {
    throw new Error("TC-403 release commit is invalid");
  }
  const entries = await Promise.all(parseChangedPaths().map(fileIdentity));
  const manifestBody = {
    releaseCommit,
    worktreeMode: "content_addressed_dirty_worktree",
    excludedGeneratedArtifacts: [...EXCLUDED_PATHS].sort(),
    excludedUnrelatedPrefixes: [...EXCLUDED_PREFIXES],
    excludedSuccessorAuditPrefixes: [
      ...EXCLUDED_SUCCESSOR_AUDIT_PREFIXES
    ],
    entries
  };
  const artifactSetHash = hashId(
    "tc_403_reviewed_artifact_set",
    manifestBody
  );
  return {
    schemaVersion: "tc_403_reviewed_artifact_manifest.v1",
    artifactSetHash,
    fileCount: entries.length,
    ...manifestBody
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(
    `${JSON.stringify(await buildTc403ArtifactManifest(), null, 2)}\n`
  );
}
