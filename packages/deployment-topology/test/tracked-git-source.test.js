import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { materializeTrackedGitSource } from "../../../scripts/tracked-git-source.mjs";

const SHA = "a".repeat(40);

test("tracked source materialization delegates only to git archive and tar", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-tracked-source-test-"));
  const parent = join(root, ".ipo-one/local-stack/exact-source");
  const destination = join(parent, SHA);
  const calls = [];
  await materializeTrackedGitSource({
    root,
    revision: SHA,
    destination,
    allowedParent: parent,
    async execute(command, args, options) {
      calls.push({ command, args, options });
      if (command === "git") {
        const archivePath = args.find((entry) => entry.startsWith("--output=")).slice(9);
        await writeFile(archivePath, "test archive");
      } else {
        await writeFile(join(destination, "tracked.txt"), "tracked\n");
      }
    }
  });
  assert.deepEqual(calls.map(({ command }) => command), ["git", "tar"]);
  assert.deepEqual(calls[0].args.slice(0, 2), ["archive", "--format=tar"]);
  assert.equal(calls[0].args.at(-1), SHA);
  assert.equal(await readFile(join(destination, "tracked.txt"), "utf8"), "tracked\n");
});

test("tracked source materialization rejects destinations outside the isolated parent", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-tracked-source-boundary-"));
  const parent = join(root, ".ipo-one/local-stack/exact-source");
  await assert.rejects(
    materializeTrackedGitSource({
      root,
      revision: SHA,
      destination: join(parent, "..", "escape"),
      allowedParent: parent
    }),
    /child of its isolated allowed parent/
  );
});

test("tracked source materialization refuses a symlink destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-tracked-source-symlink-"));
  const parent = join(root, ".ipo-one/local-stack/exact-source");
  await mkdir(parent, { recursive: true });
  const target = join(parent, "target");
  await mkdir(target);
  const destination = join(parent, SHA);
  await symlink(target, destination);
  await assert.rejects(
    materializeTrackedGitSource({
      root,
      revision: SHA,
      destination,
      allowedParent: parent
    }),
    /must not be a symbolic link/
  );
});

test("tracked source materialization rejects arbitrary workspace deletion parents", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-tracked-source-arbitrary-"));
  const arbitraryParent = join(root, "apps");
  await assert.rejects(
    materializeTrackedGitSource({
      root,
      revision: SHA,
      destination: join(arbitraryParent, SHA),
      allowedParent: arbitraryParent
    }),
    /not an approved exact-source location/
  );
});

test("tracked source materialization rejects a symlinked approved parent", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-tracked-source-parent-link-"));
  const target = await mkdtemp(join(tmpdir(), "ipo-one-tracked-source-parent-target-"));
  await mkdir(join(root, ".ipo-one/local-stack"), { recursive: true });
  const parent = join(root, ".ipo-one/local-stack/exact-source");
  await symlink(target, parent);
  await assert.rejects(
    materializeTrackedGitSource({
      root,
      revision: SHA,
      destination: join(parent, SHA),
      allowedParent: parent
    }),
    /symbolic-link path components/
  );
});
