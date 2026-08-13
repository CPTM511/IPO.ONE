import { execFile } from "node:child_process";
import { lstat, mkdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_SHA = /^[0-9a-f]{40}$/;

function sourceError(message) {
  return new Error(`Exact tracked source: ${message}`);
}

export async function materializeTrackedGitSource({
  root,
  revision,
  destination,
  allowedParent,
  execute = execFileAsync
}) {
  if (
    typeof root !== "string" ||
    typeof destination !== "string" ||
    typeof allowedParent !== "string" ||
    !GIT_SHA.test(revision ?? "")
  ) {
    throw sourceError(
      "root, destination, allowed parent, and lowercase 40-character revision are required"
    );
  }
  const absoluteRoot = resolve(root);
  const canonicalRoot = await realpath(absoluteRoot);
  const absoluteAllowedParent = resolve(allowedParent);
  const allowedWorkspaceParent = resolve(
    absoluteRoot,
    ".ipo-one/local-stack/exact-source"
  );
  const allowedTemporaryParent = "/private/tmp";
  if (
    absoluteAllowedParent !== allowedWorkspaceParent &&
    absoluteAllowedParent !== allowedTemporaryParent
  ) {
    throw sourceError("allowed parent is not an approved exact-source location");
  }
  await mkdir(absoluteAllowedParent, { recursive: true });
  const canonicalAllowedParent = await realpath(absoluteAllowedParent);
  const expectedCanonicalParent = absoluteAllowedParent === allowedTemporaryParent
    ? allowedTemporaryParent
    : resolve(canonicalRoot, ".ipo-one/local-stack/exact-source");
  if (canonicalAllowedParent !== expectedCanonicalParent) {
    throw sourceError("allowed parent must not contain symbolic-link path components");
  }
  const requestedDestination = resolve(destination);
  const relativeDestination = relative(
    absoluteAllowedParent,
    requestedDestination
  );
  if (
    relativeDestination === "" ||
    relativeDestination.startsWith("..") ||
    isAbsolute(relativeDestination) ||
    (
      absoluteAllowedParent === allowedTemporaryParent &&
      !/^ipo-one-m1-b-vercel-bundle-[A-Za-z0-9._-]+-tracked-source$/.test(
        relativeDestination
      )
    ) ||
    (
      absoluteAllowedParent === allowedWorkspaceParent &&
      relativeDestination !== revision
    )
  ) {
    throw sourceError("destination must be a child of its isolated allowed parent");
  }
  const absoluteDestination = resolve(
    canonicalAllowedParent,
    relativeDestination
  );
  const existing = await lstat(absoluteDestination).catch((error) => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing?.isSymbolicLink()) {
    throw sourceError("destination must not be a symbolic link");
  }

  await rm(absoluteDestination, { recursive: true, force: true });
  await mkdir(absoluteDestination, { recursive: false });
  const archivePath = `${absoluteDestination}.tar`;
  await rm(archivePath, { force: true });
  try {
    await execute(
      "git",
      ["archive", "--format=tar", `--output=${archivePath}`, revision],
      { cwd: absoluteRoot }
    );
    await execute(
      "tar",
      ["-xf", archivePath, "-C", absoluteDestination],
      { cwd: absoluteRoot }
    );
  } catch (error) {
    await rm(absoluteDestination, { recursive: true, force: true });
    throw sourceError(error?.message ?? "tracked source extraction failed");
  } finally {
    await rm(archivePath, { force: true });
  }
  return absoluteDestination;
}
