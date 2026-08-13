import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  verifyM1BArtifactFiles,
  verifyM1BCurrentGitSource
} from "../../../scripts/m1-b-acceptance-evidence-files.mjs";
import { M1BAcceptanceEvidenceError } from "../../release-governance/src/m1-b-acceptance-evidence.js";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);

function artifact(path, content) {
  return {
    id: "artifact_test",
    relativePath: path,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function issue(fragment) {
  return (error) =>
    error instanceof M1BAcceptanceEvidenceError &&
    error.issues.some((entry) => entry.includes(fragment));
}

test("artifact verifier opens and hashes a contained regular file", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-"));
  const content = Buffer.from("durable receipt\n");
  await mkdir(join(root, "receipts"));
  await writeFile(join(root, "receipts", "runtime.json"), content);
  assert.equal(
    await verifyM1BArtifactFiles(
      [artifact("receipts/runtime.json", content)],
      { evidenceRoot: root }
    ),
    true
  );
});

test("artifact verifier rejects missing and tampered files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-tamper-"));
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("missing.json", "expected")],
      { evidenceRoot: root }
    ),
    issue("does not exist")
  );
  await writeFile(join(root, "tampered.json"), "actual");
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("tampered.json", "expected")],
      { evidenceRoot: root }
    ),
    issue("SHA-256")
  );
});

test("artifact verifier rejects symlink files and symlink roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-link-"));
  const outside = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-outside-"));
  await writeFile(join(outside, "receipt.json"), "outside");
  await symlink(join(outside, "receipt.json"), join(root, "receipt.json"));
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("receipt.json", "outside")],
      { evidenceRoot: root }
    ),
    issue("symbolic-link")
  );
  const rootLink = `${root}-link`;
  await symlink(root, rootLink);
  await assert.rejects(
    verifyM1BArtifactFiles([], { evidenceRoot: rootLink }),
    issue("Evidence root")
  );
});

test("Git verifier binds HEAD, tree, and tracked cleanliness", () => {
  const evidence = { source: { commitSha: SHA, treeSha: TREE } };
  const cleanGit = (args) => {
    if (args[0] === "status") return "";
    return args[1] === "HEAD" ? SHA : TREE;
  };
  assert.equal(
    verifyM1BCurrentGitSource(evidence, SHA, {
      root: "/repo",
      git: cleanGit
    }),
    true
  );
  assert.throws(
    () => verifyM1BCurrentGitSource(
      { source: { commitSha: SHA, treeSha: "c".repeat(40) } },
      SHA,
      { root: "/repo", git: cleanGit }
    ),
    issue("treeSha")
  );
  assert.throws(
    () => verifyM1BCurrentGitSource(evidence, SHA, {
      root: "/repo",
      git: (args) => args[0] === "status" ? " M tracked.js" : cleanGit(args)
    }),
    issue("not clean")
  );
});
