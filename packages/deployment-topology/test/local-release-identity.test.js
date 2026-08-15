import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertExactLocalReleaseSource,
  resolveLocalReviewPorts,
  resolveLocalReleaseIdentity
} from "../../../scripts/local-release-identity.mjs";

const compose = await readFile(
  new URL("../../../deploy/local/compose.yaml", import.meta.url),
  "utf8"
);
const localStack = await readFile(
  new URL("../../../scripts/local-stack.mjs", import.meta.url),
  "utf8"
);
const acceptance = await readFile(
  new URL("../../../scripts/local-stack-acceptance.mjs", import.meta.url),
  "utf8"
);

test("M1-B local stack requires an optional exact source revision", () => {
  assert.match(
    compose,
    /BUILD_REVISION:\s*\$\{IPO_ONE_M1_B_RELEASE_SHA:-local-stack\}/
  );
  assert.match(localStack, /resolveLocalReleaseIdentity/);
  assert.match(localStack, /assertExactLocalReleaseSource/);
  assert.match(localStack, /IPO_ONE_M1_B_RELEASE_SHA=/);
  assert.match(compose, /IPO_ONE_M1_B_BUILD_CONTEXT/);
  assert.match(compose, /IPO_ONE_M1_B_PORT_BASE/);
  assert.match(localStack, /prepareLocalReleaseBuildContext/);
});

test("M1-B local review ports retain defaults and validate isolated bases", () => {
  assert.deepEqual(
    resolveLocalReviewPorts({ environment: {} }),
    {
      basePort: 8787,
      ports: [8787, 8788, 8789, 8790],
      isolated: false
    }
  );
  const sha = "a".repeat(40);
  assert.deepEqual(
    resolveLocalReviewPorts({
      environment: {
        IPO_ONE_M1_B_RELEASE_SHA: sha,
        IPO_ONE_M1_B_PORT_BASE: "18887"
      }
    }),
    {
      basePort: 18887,
      ports: [18887, 18888, 18889, 18890],
      isolated: true
    }
  );
  assert.deepEqual(
    resolveLocalReviewPorts({
      environment: { IPO_ONE_M1_B_PORT_BASE: "18887" }
    }),
    {
      basePort: 18887,
      ports: [18887, 18888, 18889, 18890],
      isolated: true
    }
  );
  for (const value of ["01024", "1023", "65533", "abc", "18887 "]) {
    assert.throws(
      () => resolveLocalReviewPorts({
        environment: { IPO_ONE_M1_B_PORT_BASE: value }
      }),
      /IPO_ONE_M1_B_PORT_BASE/
    );
  }
});

test("M1-B local acceptance verifies running OCI revision identity", () => {
  assert.match(acceptance, /org\.opencontainers\.image\.revision/);
  assert.match(acceptance, /releaseIdentity\.exactCandidate/);
  assert.match(acceptance, /currentActiveAuthenticationCredentialCount/);
  assert.match(acceptance, /currentActiveAuthenticationActorCount/);
  assert.match(acceptance, /cannot satisfy M1-B P0-5 exact-commit acceptance/);
});

test("M1-B local release identity is closed and lowercase", () => {
  assert.deepEqual(
    resolveLocalReleaseIdentity({ environment: {} }),
    { revision: "local-stack", exactCandidate: false }
  );
  const sha = "a".repeat(40);
  assert.deepEqual(
    resolveLocalReleaseIdentity({
      environment: { IPO_ONE_M1_B_RELEASE_SHA: sha }
    }),
    { revision: sha, exactCandidate: true }
  );
  for (const value of ["HEAD", "A".repeat(40), "a".repeat(39), `${sha}\n`]) {
    assert.throws(
      () => resolveLocalReleaseIdentity({
        environment: { IPO_ONE_M1_B_RELEASE_SHA: value }
      }),
      /lowercase 40-character Git SHA/
    );
  }
});

test("M1-B exact local source requires matching HEAD and a clean tree", () => {
  const sha = "b".repeat(40);
  const identity = { revision: sha, exactCandidate: true };
  assert.equal(
    assertExactLocalReleaseSource(identity, {
      root: "/repo",
      git: (args) => args[0] === "rev-parse" ? sha : ""
    }),
    identity
  );
  assert.throws(
    () => assertExactLocalReleaseSource(identity, {
      root: "/repo",
      git: (args) => args[0] === "rev-parse" ? "c".repeat(40) : ""
    }),
    /does not match current HEAD/
  );
  assert.throws(
    () => assertExactLocalReleaseSource(identity, {
      root: "/repo",
      git: (args) => args[0] === "rev-parse" ? sha : " M changed.js"
    }),
    /requires a clean source worktree/
  );
});

test("M1-B source cleanliness ignores unrelated untracked user work only", () => {
  const sha = "d".repeat(40);
  const calls = [];
  assertExactLocalReleaseSource(
    { revision: sha, exactCandidate: true },
    {
      root: "/repo",
      git(args) {
        calls.push(args);
        return args[0] === "rev-parse" ? sha : "";
      }
    }
  );
  assert.deepEqual(calls[1], [
    "status",
    "--porcelain=v1",
    "--untracked-files=no"
  ]);
});
