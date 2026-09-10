import assert from "node:assert/strict";
import test from "node:test";
import { readMigrationSet } from "../../../scripts/migrate.mjs";
import { selectVercelMigrations, VERCEL_MIGRATION_PROFILE } from "../../../scripts/vercel-migration-profile.mjs";

test("hosted bundle retains the exact approved schema and excludes only local review migrations", async () => {
  const migrations = await readMigrationSet();
  const hosted = selectVercelMigrations(migrations);
  assert.equal(hosted.length, 76);
  assert.equal(hosted.at(-1).name, "0084_verified_ordinary_wallet_expiry_recovery");
  assert.deepEqual(migrations.filter(item => !hosted.includes(item)).map(item => item.name), VERCEL_MIGRATION_PROFILE.localOnly);
  assert.throws(() => selectVercelMigrations(migrations.slice(1)), /profile changed/);
  assert.throws(() => selectVercelMigrations([{ ...migrations[0], checksum: "modified" }, ...migrations.slice(1)]), /profile changed/);
  assert.throws(() => selectVercelMigrations([...migrations, { name: "0085_unreviewed", checksum: "unknown" }]), /profile changed/);
});
