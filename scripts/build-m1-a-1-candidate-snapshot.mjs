import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { M1_A_1_INCLUDED_PATHS } from "./m1-a-1-candidate-paths.mjs";

const outputPath = "deploy/local/m1-a-1-candidate-snapshot.v1.json";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const files = [];
for (const path of M1_A_1_INCLUDED_PATHS) {
  const contents = await readFile(path);
  files.push({
    path,
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex")
  });
}

const candidateContentRoot = createHash("sha256")
  .update(files.map(({ path, sha256: hash }) => `${path}\0${hash}\n`).join(""))
  .digest("hex");

const snapshot = {
  schemaVersion: "ipo_one_m1_a_1_candidate_snapshot.v1",
  status: "PRESEAL_DIRTY_WORKTREE_EVIDENCE_ONLY",
  authorization: {
    releaseCandidateCreated: false,
    commitAuthorized: false,
    tagAuthorized: false,
    m1BEntryAuthorized: false
  },
  sourceBinding: {
    branch: git("branch", "--show-current"),
    headCommit: git("rev-parse", "HEAD"),
    headTree: git("rev-parse", "HEAD^{tree}"),
    worktreeClean: git("status", "--porcelain=v2").length === 0
  },
  candidateContentRootAlgorithm: "sha256(sorted(path + NUL + sha256 + LF))",
  candidateContentRoot,
  includedPathCount: files.length,
  includedFiles: files,
  exclusions: [
    "local secrets and credentials under .ipo-one/",
    "dependency caches and node_modules/",
    "browser profile and .playwright-cli/ state",
    "marketing, prototype, generated media, and unrelated WIP",
    "artifacts and reports outside the explicit M1-A/M1-A.1 evidence scope"
  ],
  limitations: [
    "This snapshot does not identify a Git commit containing the dirty worktree.",
    "This snapshot is not a Release Candidate manifest.",
    "This snapshot does not authorize M1-B, a branch, a commit, a tag, or release publication."
  ]
};

await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(`Candidate content root: ${candidateContentRoot}`);
console.log(`Included paths: ${files.length}`);
