import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readMigrationSet } from "../../../scripts/migrate.mjs";
import { selectVercelMigrations, VERCEL_MIGRATION_PROFILE } from "../../../scripts/vercel-migration-profile.mjs";

test("hosted bundle retains the exact approved schema and excludes only local review migrations", async () => {
  const migrations = await readMigrationSet();
  const hosted = selectVercelMigrations(migrations);
  assert.equal(hosted.length, 77);
  assert.equal(hosted.some(item => item.name === "0074_bnb_no_funds_wallet_networks"), false);
  assert.equal(hosted.some(item => /local_|invited_wallet/.test(item.name)), false);
  assert.equal(hosted.at(-1).name, "0087_hosted_bnb_no_funds_wallet_networks");
  assert.equal(createHash("sha256").update(JSON.stringify(hosted.slice(0,-1).map(({name,checksum})=>({name,checksum})))).digest("hex"), "3f986af76fe361af50a3a8401a55277f8e80903c9277d27255592ab84e33e15f", "the actual deployed schema must remain an exact prefix");
  assert.deepEqual(migrations.filter(item => !hosted.includes(item)).map(item => item.name), VERCEL_MIGRATION_PROFILE.localOnly);
  assert.throws(() => selectVercelMigrations(migrations.slice(1)), /profile changed/);
  assert.throws(() => selectVercelMigrations([{ ...migrations[0], checksum: "modified" }, ...migrations.slice(1)]), /profile changed/);
  assert.throws(() => selectVercelMigrations([...migrations, { name: "0085_unreviewed", checksum: "unknown" }]), /profile changed/);
});
