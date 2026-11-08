import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readMigrationSet } from "../../../scripts/migrate.mjs";
import { selectVercelMigrations, VERCEL_MIGRATION_PROFILE } from "../../../scripts/vercel-migration-profile.mjs";

test("hosted bundle retains the exact candidate schema and excludes only local review migrations", async () => {
  const migrations = await readMigrationSet();
  const hosted = selectVercelMigrations(migrations);
  assert.equal(hosted.length, 79);
  assert.equal(hosted.some(item => item.name === "0074_bnb_no_funds_wallet_networks"), false);
  assert.equal(hosted.some(item => /local_|invited_wallet/.test(item.name)), false);
  assert.equal(hosted.at(-1).name, "0089_synthetic_collateral_terms");
  assert.equal(createHash("sha256").update(JSON.stringify(hosted.slice(0,-1).map(({name,checksum})=>({name,checksum})))).digest("hex"), "8953e5caef5455d85a0bcb34a5ad117c59ebdfb84c193021a620536431e54275", "the actual deployed schema must remain an exact prefix");
  assert.deepEqual(migrations.filter(item => !hosted.includes(item)).map(item => item.name), VERCEL_MIGRATION_PROFILE.localOnly);
  assert.throws(() => selectVercelMigrations(migrations.slice(1)), /profile changed/);
  assert.throws(() => selectVercelMigrations([{ ...migrations[0], checksum: "modified" }, ...migrations.slice(1)]), /profile changed/);
  assert.throws(() => selectVercelMigrations([...migrations, { name: "0085_unreviewed", checksum: "unknown" }]), /profile changed/);
});
