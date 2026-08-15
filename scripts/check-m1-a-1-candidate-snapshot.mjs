import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { M1_A_1_INCLUDED_PATHS } from "./m1-a-1-candidate-paths.mjs";

const manifestPath = "deploy/local/m1-a-1-candidate-snapshot.v1.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

assert.equal(manifest.schemaVersion, "ipo_one_m1_a_1_candidate_snapshot.v1");
assert.equal(manifest.status, "PRESEAL_DIRTY_WORKTREE_EVIDENCE_ONLY");
assert.deepEqual(manifest.authorization, {
  releaseCandidateCreated: false,
  commitAuthorized: false,
  tagAuthorized: false,
  m1BEntryAuthorized: false
});
assert.equal(manifest.sourceBinding.branch, git("branch", "--show-current"));
assert.equal(manifest.sourceBinding.headCommit, git("rev-parse", "HEAD"));
assert.equal(manifest.sourceBinding.headTree, git("rev-parse", "HEAD^{tree}"));
assert.equal(manifest.sourceBinding.worktreeClean, false);

const manifestPaths = manifest.includedFiles.map(({ path }) => path);
assert.deepEqual(manifestPaths, M1_A_1_INCLUDED_PATHS);
assert.equal(manifest.includedPathCount, M1_A_1_INCLUDED_PATHS.length);

for (const entry of manifest.includedFiles) {
  assert.match(entry.path, /^[A-Za-z0-9_./-]+$/);
  const contents = await readFile(entry.path);
  assert.equal(entry.bytes, contents.byteLength, `${entry.path} size drifted`);
  assert.equal(
    entry.sha256,
    createHash("sha256").update(contents).digest("hex"),
    `${entry.path} hash drifted`
  );
}

const candidateContentRoot = createHash("sha256")
  .update(
    manifest.includedFiles
      .map(({ path, sha256 }) => `${path}\0${sha256}\n`)
      .join("")
  )
  .digest("hex");
assert.equal(manifest.candidateContentRoot, candidateContentRoot);

console.log("M1-A.1 pre-seal candidate snapshot is internally consistent.");
console.log(`Candidate content root: ${candidateContentRoot}`);
console.log("M1-B authorization remains false.");
