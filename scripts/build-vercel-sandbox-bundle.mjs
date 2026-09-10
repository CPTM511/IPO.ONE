import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import { materializeTrackedGitSource } from "./tracked-git-source.mjs";
import { readMigrationSet } from "./migrate.mjs";
import { selectVercelMigrations, VERCEL_MIGRATION_PROFILE } from "./vercel-migration-profile.mjs";

const execFileAsync = promisify(execFile);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function files(root, relative = "") {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await files(root, path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const output = resolve(argument("--output") ?? "");
const releaseId = argument("--release");
const deploymentRole = argument("--role");
const allowDirtyTest = process.argv.includes("--allow-dirty-test");
if (
  !output.startsWith("/private/tmp/") ||
  !basename(output).startsWith("ipo-one-m1-b-vercel-bundle-") ||
  !/^[0-9a-f]{40}$/.test(releaseId ?? "") ||
  !new Set(["primary", "risk"]).has(deploymentRole)
) {
  throw new Error(
    "--output must be an exact /private/tmp/ipo-one-m1-b-vercel-bundle-* path, --release must be a full Git SHA, and --role must be primary or risk"
  );
}
const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
if (stdout.trim() !== releaseId) {
  throw new Error("--release must match the current Git HEAD");
}
const { stdout: status } = await execFileAsync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"]
);
if (status.trim() !== "" && !allowDirtyTest) {
  throw new Error("Deployment bundles require a clean exact source worktree");
}
const { stdout: treeStdout } = await execFileAsync(
  "git",
  ["rev-parse", `${releaseId}^{tree}`]
);
const sourceTree = treeStdout.trim();
if (!/^[0-9a-f]{40}$/.test(sourceTree)) {
  throw new Error("Deployment bundle source tree is invalid");
}

await rm(output, { recursive: true, force: true });
const trackedSource = `${output}-tracked-source`;
try {
  await materializeTrackedGitSource({
    root: process.cwd(),
    revision: releaseId,
    destination: trackedSource,
    allowedParent: "/private/tmp"
  });
  await execFileAsync(
    "pnpm",
    ["install", "--frozen-lockfile", "--ignore-scripts"],
    { cwd: trackedSource }
  );
  await mkdir(join(output, "api"), { recursive: true });
  const entryPoints = deploymentRole === "primary"
    ? {
        "vercel-sandbox": "api/vercel-sandbox.mjs",
        "vercel-sandbox-cron": "api/vercel-sandbox-cron.mjs"
      }
    : { "vercel-sandbox": "api/vercel-sandbox.mjs" };
  await build({
    absWorkingDir: trackedSource,
    nodePaths: [resolve(trackedSource, "node_modules")],
    entryPoints,
    outdir: join(output, "api"),
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    sourcemap: "external",
    sourcesContent: false,
    legalComments: "none",
    logLevel: "warning",
    banner: {
      js: "import { createRequire as __ipoOneCreateRequire } from 'node:module'; const require = __ipoOneCreateRequire(import.meta.url);"
    },
    define: {
      "process.env.IPO_ONE_BUNDLED_RELEASE_ID": JSON.stringify(releaseId)
    }
  });
  const allMigrations = await readMigrationSet(join(trackedSource, "db/migrations"));
  const hostedMigrations = selectVercelMigrations(allMigrations);
  await mkdir(join(output, "db/migrations"), { recursive: true });
  await Promise.all(hostedMigrations.flatMap(({ name }) => ["up", "down"].map(direction =>
    cp(join(trackedSource, "db/migrations", `${name}.${direction}.sql`), join(output, "db/migrations", `${name}.${direction}.sql`))
  )));
  await Promise.all([
    cp(join(trackedSource, "apps/web/src"), join(output, "apps", "web", "src"), { recursive: true }),
    cp(join(trackedSource, "deploy/vercel/package.m1-b-sandbox.json"), join(output, "package.json")),
    cp(
      join(
        trackedSource,
        deploymentRole === "primary"
          ? "deploy/vercel/vercel.m1-b-sandbox.json"
          : "deploy/vercel/vercel.m1-b-sandbox-risk.json"
      ),
      join(output, "vercel.json")
    )
  ]);

  // One browser entry avoids a cold, no-store request for every source module.
  // Compile the exact tracked tree with the existing locked esbuild dependency.
  const browserBuild = await build({
    absWorkingDir: trackedSource,
    entryPoints: ["apps/web/src/app.js"],
    outfile: join(output, "apps/web/src/app.js"),
    bundle: true, minify: true, platform: "browser", format: "esm",
    target: "es2022", legalComments: "none", metafile: true
  });
  const browserOutput = Object.values(browserBuild.metafile.outputs)[0];
  if (browserOutput.imports.length !== 0) {
    throw new Error("Hosted browser entry must have no unresolved module requests");
  }
  const artifactFiles = await files(output);
  const artifacts = [];
  for (const path of artifactFiles) {
    artifacts.push({ path, sha256: await sha256(join(output, path)) });
  }
  await writeFile(join(output, "deployment-artifact-manifest.json"), `${JSON.stringify({
    schemaVersion: "ipo.one.vercel-deployment-artifact/v1",
    sourceCommit: releaseId,
    sourceTree,
    sourceMaterialization: "tracked_git_archive",
    untrackedInputIncluded: false,
    dirtyCompatibilityBuild: allowDirtyTest,
    nodeRuntime: "24.x",
    productProfile: "deployable_sandbox_vertical_slice",
    deploymentRole,
    browserEntry: { bundled: true, sourceModules: Object.keys(browserBuild.metafile.inputs).length, bytes: browserOutput.bytes },
    migrationProfile: {
      ...VERCEL_MIGRATION_PROFILE,
      excludedLocalMigrations: allMigrations.filter(item => VERCEL_MIGRATION_PROFILE.localOnly.includes(item.name)).map(({ name, checksum }) => ({ name, checksum })),
      runtimeMigrationCheck: "exact_set_and_checksums_unchanged",
      productionDatabaseMutation: false
    },
    releaseClaim: false,
    realFundsEnabled: false,
    artifacts
  }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    status: "built",
    output,
    sourceCommit: releaseId,
    sourceTree,
    sourceMaterialization: "tracked_git_archive",
    untrackedInputIncluded: false,
    deploymentRole,
    dirtyCompatibilityBuild: allowDirtyTest,
    artifactCount: artifacts.length
  })}\n`);
} finally {
  await rm(trackedSource, { recursive: true, force: true });
}
