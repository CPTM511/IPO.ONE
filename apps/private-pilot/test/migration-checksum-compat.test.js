import assert from "node:assert/strict";
import test from "node:test";
import { migrationChecksumMatches } from "../../../scripts/migrate.mjs";

const MIGRATION = "0043_durable_credit_outcomes";
const LEGACY_CHECKSUM =
  "0291b691521508c6bdca2ed6d5a456f0cd9b413d25a34060efd14851e641790a";
const RELEASE_CHECKSUM =
  "c255594e3d419fc9f10bce2f9e6b959c466191c2c16ff8fddb94f4f0fdfe0449";
const PAUSE_MIGRATION = "0044_durable_tenant_command_pause";
const PAUSE_LEGACY_CHECKSUM =
  "b0f7a42a00c8359c6b5778f54b09480f5da492b34a8038f15679a3e5b2d1bfbe";
const PAUSE_RELEASE_CHECKSUM =
  "b238c78daeb7eca7a8477f18cfc3f72650ccfcca21aec2f666900b82e8092c09";

test("the exact whitespace-only 0043 and 0044 legacy checksums remain compatible", () => {
  assert.equal(
    migrationChecksumMatches({
      name: MIGRATION,
      recordedChecksum: LEGACY_CHECKSUM,
      releaseChecksum: RELEASE_CHECKSUM
    }),
    true
  );
  assert.equal(
    migrationChecksumMatches({
      name: MIGRATION,
      recordedChecksum: RELEASE_CHECKSUM,
      releaseChecksum: RELEASE_CHECKSUM
    }),
    true
  );
  assert.equal(
    migrationChecksumMatches({
      name: PAUSE_MIGRATION,
      recordedChecksum: PAUSE_LEGACY_CHECKSUM,
      releaseChecksum: PAUSE_RELEASE_CHECKSUM
    }),
    true
  );
});

test("migration checksum compatibility remains exact and fail-closed", () => {
  assert.equal(
    migrationChecksumMatches({
      name: "0042_invite_bound_authentication_credentials",
      recordedChecksum: LEGACY_CHECKSUM,
      releaseChecksum: RELEASE_CHECKSUM
    }),
    false
  );
  assert.equal(
    migrationChecksumMatches({
      name: MIGRATION,
      recordedChecksum: `${LEGACY_CHECKSUM.slice(0, -1)}b`,
      releaseChecksum: RELEASE_CHECKSUM
    }),
    false
  );
  assert.equal(
    migrationChecksumMatches({
      name: MIGRATION,
      recordedChecksum: RELEASE_CHECKSUM,
      releaseChecksum: LEGACY_CHECKSUM
    }),
    false
  );
});
