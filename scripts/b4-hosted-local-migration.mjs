import { readMigrationSet, migrationChecksumMatches } from "./migrate.mjs";
import { selectVercelMigrations, LEGACY_VERCEL_MIGRATION_PROFILE } from "./vercel-migration-profile.mjs";

function exact(rows, migrations) {
  return rows.length===migrations.length && migrations.every((migration,index)=>rows[index]?.name===migration.name &&
    migrationChecksumMatches({name:migration.name,recordedChecksum:rows[index]?.checksum,releaseChecksum:migration.checksum}));
}

// Local rehearsal only. There is deliberately no production CLI. A separately
// approved cutover must review the exact frozen batch and execution identity.
export async function rehearseB4HostedAtomicMigration({pool,faultAfter}={}) {
  if(!pool?.connect || (faultAfter!==undefined && (!Number.isInteger(faultAfter) || faultAfter<1 || faultAfter>7)))throw new Error("Invalid B4-H local migration rehearsal");
  const all=await readMigrationSet();
  const baseline=selectVercelMigrations(all,{profile:LEGACY_VERCEL_MIGRATION_PROFILE});
  const target=selectVercelMigrations(all);
  const additional=target.filter(item=>!baseline.some(old=>old.name===item.name));
  const client=await pool.connect();
  let locked=false;
  try {
    const boundary=(await client.query("SELECT current_database() AS name,host(inet_server_addr()) AS address")).rows[0];
    if(!/^ipo_one_b4h_[a-z0-9_]+_test$/.test(boundary?.name??"") || !["127.0.0.1","::1",null].includes(boundary.address))throw new Error("B4-H rehearsal requires an explicitly isolated local test database");
    await client.query("SELECT pg_advisory_lock(hashtext($1),hashtext($2))",["ipo.one","schema_migrations"]);
    locked=true;
    await client.query("BEGIN");
    try {
      const rows=(await client.query("SELECT name,checksum FROM schema_migrations ORDER BY name FOR UPDATE")).rows;
      if(exact(rows,target)) { await client.query("COMMIT");return []; }
      if(!exact(rows,baseline))throw new Error("B4-H atomic migration requires the exact S79 baseline");
      const completed=[];
      for(const migration of additional) {
        await client.query(migration.up);
        await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",[migration.name,migration.checksum]);
        completed.push(migration.name);
        if(completed.length===faultAfter)throw new Error("B4-H injected local batch failure");
      }
      await client.query("COMMIT");
      return completed;
    } catch(error) { await client.query("ROLLBACK");throw error; }
  } finally {
    try { if(locked)await client.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))",["ipo.one","schema_migrations"]); }
    finally {client.release();}
  }
}
