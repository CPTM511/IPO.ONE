// WEB-026F: explicitly approved local-only reconciliation. Secrets stay in
// ignored protected storage and never enter command arguments or evidence.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationSet, migrationChecksumMatches } from './migrate.mjs';
import { loadOrCreateLocalSyntheticMeteredProviderMaterial } from '../apps/private-pilot/src/local-synthetic-metered-provider.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = '/Users/cptmao/Documents/IPO.ONE';
const state = resolve(main, '.ipo-one/web026-runtime');
const evidence = resolve(main, 'output/playwright/web-026-runtime');
const old = 'ipo-one-pilot008a-review';
const livePg = 'ipo-one-local-postgres-1';
const copyPg = 'ipo-one-web026-test-postgres-v2';
const db = 'ipo_one_pilot008a_review_20260829a';
const owner = 'ipo_one_owner';
const revision = 'd00f1ce';
function run(command, args, { input, binary = false, log } = {}) {
  const result = spawnSync(command, args, { cwd: root, input, encoding: binary ? undefined : 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (log) return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (output withheld; may contain protected configuration)`);
  return binary ? result.stdout : result.stdout.trim();
}
function docker(args, options) { return run('limactl', ['shell', '--workdir', main, 'ipo-one-local', 'docker', ...args], options); }
function sql(container, query, database = db) { return docker(['exec', container, 'psql', '-U', owner, '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', query]); }
async function protectedFile(name, value) { const path = resolve(state, name); await writeFile(path, value, { mode: 0o600 }); await chmod(path, 0o600); return path; }
async function report(name, value) { await writeFile(resolve(evidence, `${name}.json`), JSON.stringify(value, null, 2) + '\n'); console.log(JSON.stringify(value)); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inspect = name => JSON.parse(docker(['inspect', name]))[0];
const envMap = container => Object.fromEntries(container.Config.Env.map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
async function backup(prefix) {
  const definition = inspect(old);
  const effectiveDatabase = new URL(envMap(definition).DATABASE_URL).pathname.slice(1);
  if (effectiveDatabase !== db) throw new Error('Effective source database changed; refusing to back up or mutate another database.');
  await protectedFile(`${prefix}-runtime.json`, JSON.stringify(definition));
  const dump = docker(['exec', livePg, 'pg_dump', '-U', owner, '-d', db, '-Fc'], { binary: true });
  await protectedFile(`${prefix}.dump`, dump);
  const roles = docker(['exec', livePg, 'pg_dumpall', '-U', owner, '--roles-only'], { binary: true });
  await protectedFile(`${prefix}-roles.sql`, roles);
  const result = { timestamp: new Date().toISOString(), bytes: dump.length, sha256: hash(dump), rolesSha256: hash(roles), runtimeImage: definition.Image, latestMigration: sql(livePg, 'SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1') };
  result.database = effectiveDatabase;
  await report(`${prefix}-backup`, result);
}
async function restoreCopy(prefix) {
  const pg = inspect(livePg);
  const pgEnv = envMap(pg);
  const envPath = await protectedFile('test-postgres.env', ['POSTGRES_DB=' + db, 'POSTGRES_USER=' + owner, 'POSTGRES_PASSWORD=' + pgEnv.POSTGRES_PASSWORD, 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust'].join('\n') + '\n');
  const existing = docker(['ps', '-a', '--filter', `name=^/${copyPg}$`, '--format', '{{.Names}}']);
  if (existing) throw new Error('Isolated restore copy already exists; inspect before replacing.');
  docker(['run', '-d', '--name', copyPg, '--env-file', envPath, '-p', '127.0.0.2:55435:5432', '--security-opt', 'no-new-privileges:true', pg.Image]);
  for (let n=0;n<30;n++) {
    const ready = docker(['exec', copyPg, 'pg_isready', '-U', owner, '-d', db], { log: true });
    if (ready.status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (n===29) throw new Error('Isolated PostgreSQL did not become ready.');
  }
  const roles = (await readFile(resolve(state, `${prefix}-roles.sql`), 'utf8')).replace(/^CREATE ROLE ipo_one_owner;\n/m, '');
  docker(['exec', '-i', copyPg, 'psql', '-U', owner, '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: roles });
  docker(['exec', '-i', copyPg, 'pg_restore', '-U', owner, '-d', db, '--exit-on-error'], { input: await readFile(resolve(state, `${prefix}.dump`)) });
  const liveHistory = sql(livePg, 'SELECT name, checksum FROM schema_migrations ORDER BY name');
  const restoredHistory = sql(copyPg, 'SELECT name, checksum FROM schema_migrations ORDER BY name');
  if (liveHistory !== restoredHistory) throw new Error('Restore migration history mismatch.');
  const counts = container => sql(container, `SELECT count(*) FROM authentication_credentials; SELECT count(*) FROM authentication_sessions; SELECT count(*) FROM pg_tables WHERE schemaname='public'`);
  if (counts(livePg) !== counts(copyPg)) throw new Error('Restore authentication/table counts mismatch.');
  await report(`${prefix}-restore`, { restored: true, migrationHistoryIdentical: true, credentialSessionAndTableCountsIdentical: true, isolatedPort: 55435 });
}
async function migrationReview(container, apply) {
  const migrations = await readMigrationSet(resolve(root, 'db/migrations'));
  const rows = sql(container, 'SELECT name,checksum FROM schema_migrations ORDER BY name').split('\n').map(x => { const [name, checksum] = x.split('|'); return { name, checksum }; });
  for (let i=0;i<rows.length;i++) {
    if (rows[i].name !== migrations[i]?.name || !migrationChecksumMatches({ name: rows[i].name, recordedChecksum: rows[i].checksum, releaseChecksum: migrations[i].checksum })) throw new Error('Migration prefix/checksum mismatch.');
  }
  const pending = migrations.slice(rows.length);
  if (pending.length !== 3 || !pending.every((m,i) => m.name.startsWith(String(71+i).padStart(4,'0')))) throw new Error('Migration scope differs from reviewed 0070–0073.');
  if (apply) {
    // One transaction for this bounded migration set; history is already verified.
    const script = 'BEGIN; SELECT pg_advisory_xact_lock(hashtext(\'ipo.one\'),hashtext(\'schema_migrations\'));\n' + pending.map(m => `${m.up}\nINSERT INTO schema_migrations(name,checksum) VALUES ('${m.name}','${m.checksum}');`).join('\n') + '\nCOMMIT;';
    docker(['exec', '-i', container, 'psql', '-U', owner, '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: script });
  }
  await report(container === livePg ? 'live-migrations' : 'copy-migrations', { applied: apply, migrations: pending.map(({name,checksum}) => ({name,checksum})), checksumPrefixVerified: true });
}
async function prepareSource() {
  const sha = run('git', ['rev-parse', revision]);
  const source = resolve(state, `source-${sha}`);
  await mkdir(source, { recursive: true });
  const archive = run('git', ['archive', sha], { binary: true });
  run('tar', ['-xf', '-', '-C', source], { input: archive });
  await report('source', { sha, archiveSha256: hash(archive), source });
}
async function prepareConfig() {
  const runtime = inspect(old);
  const env = envMap(runtime);
  if (new URL(env.DATABASE_URL).pathname.slice(1) !== db) throw new Error('Effective database differs from the reviewed source.');
  const allowed = ['DATABASE_URL', 'IPO_ONE_CREDIT_REGISTRY_OBSERVATION_ARTIFACT', 'IPO_ONE_PILOT_PROFILE_FILE', 'IPO_ONE_PILOT_DB_SECRET_FILE', 'IPO_ONE_LOCAL_AUTH_INVITATION_FILE', 'IPO_ONE_LOCAL_AUTH_SERVER_FILE', 'IPO_ONE_LOCAL_AGENT_KEY_FILE'];
  const next = Object.fromEntries(allowed.filter(k => env[k]).map(k => [k, env[k]]));
  next.IPO_ONE_PILOT_PORT = '8895'; next.NODE_ENV = 'development';
  next.IPO_ONE_M1_B_RELEASE_SHA = run('git', ['rev-parse', revision]);
  next.IPO_ONE_LOCAL_METERED_PROVIDER_KEY_FILE = '/run/secrets/metered-provider-key.v1.json';
  const keyFile = resolve(state, 'metered-provider-key.v1.json');
  await loadOrCreateLocalSyntheticMeteredProviderMaterial(keyFile);
  await chmod(keyFile, 0o600);
  await protectedFile('candidate.env', Object.entries(next).map(([k,v]) => `${k}=${v}`).join('\n') + '\n');
  const mounts = runtime.Mounts.filter(m => m.Destination.startsWith('/run/secrets/')).map(m => ({ source: m.Source, target: m.Destination }));
  mounts.push({ source: keyFile, target: next.IPO_ONE_LOCAL_METERED_PROVIDER_KEY_FILE });
  await protectedFile('mounts.json', JSON.stringify(mounts));
  await report('configuration', { reused: mounts.filter(m => m.source !== keyFile).map(m => m.target), preparedSyntheticOnly: [next.IPO_ONE_LOCAL_METERED_PROVIDER_KEY_FILE], externalProviders: false, realFunds: false });
}
async function candidate(name, port, testCopy = false) {
  let env = await readFile(resolve(state, 'candidate.env'), 'utf8');
  env = env.replace(/^IPO_ONE_PILOT_PORT=.*$/m, `IPO_ONE_PILOT_PORT=${port}`);
  if (testCopy) env = env.replace(/^DATABASE_URL=(.*)$/m, (_, value) => { const url = new URL(value); url.port = '55435'; return 'DATABASE_URL=' + url.href; });
  const envPath = await protectedFile(`${name}.env`, env);
  const mounts = JSON.parse(await readFile(resolve(state, 'mounts.json')));
  if (testCopy) {
    const qaKeyFile = resolve(state, 'isolated-qa-wallet.json');
    let qa;
    try { qa = JSON.parse(await readFile(qaKeyFile)); } catch (error) { if(error.code !== 'ENOENT') throw error; qa = { privateKey: generatePrivateKey() }; await protectedFile('isolated-qa-wallet.json', JSON.stringify(qa)); }
    const invitationMount = mounts.find(m => m.target === '/run/secrets/authentication-invitation.v1.json');
    const invitation = JSON.parse(await readFile(invitationMount.source));
    invitation.walletAddress = privateKeyToAccount(qa.privateKey).address;
    invitationMount.source = await protectedFile('isolated-qa-invitation.json', JSON.stringify(invitation));
  }
  const args = ['create', '--name', name, '--network', 'host', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--restart', 'unless-stopped', '--env-file', envPath];
  for (const m of mounts) args.push('--mount', `type=bind,source=${m.source},target=${m.target},readonly`);
  args.push('ipo-one-web026:d00f1ce-runtime', 'apps/private-pilot/src/start.js');
  docker(args);
  docker(['start', name]);
  await report(name, { container: name, port, started: true, readOnlyRoot: true, sourceMount: false, isolatedCopy: testCopy });
}
async function worker(testCopy) {
  const name = testCopy ? 'ipo-one-web026-copy-worker' : 'ipo-one-web026-worker';
  const pilotEnvFile = testCopy ? 'ipo-one-web026-copy-v3.env' : 'ipo-one-web026-review.env';
  const allowed = new Set(['DATABASE_URL','IPO_ONE_PILOT_PROFILE_FILE','IPO_ONE_PILOT_DB_SECRET_FILE','IPO_ONE_LOCAL_METERED_PROVIDER_KEY_FILE','IPO_ONE_M1_B_RELEASE_SHA','NODE_ENV']);
  const entries = (await readFile(resolve(state,pilotEnvFile),'utf8')).trim().split('\n').filter(line=>allowed.has(line.split('=')[0]));
  entries.push('IPO_ONE_LOCAL_WORKER_ACK=I_UNDERSTAND_SYNTHETIC_OUTBOX_ONLY','IPO_ONE_LOCAL_WORKER_ID=ipo_one_web026_worker','IPO_ONE_LOCAL_WORKER_INTERVAL_MS=5000','IPO_ONE_LOCAL_RECONCILIATION_INTERVAL_MS=300000');
  const envPath=await protectedFile(name+'.env',entries.join('\n')+'\n');
  const mounts=JSON.parse(await readFile(resolve(state,'mounts.json'))).filter(m=>['/run/secrets/private-pilot-db-secret','/run/secrets/metered-provider-key.v1.json'].includes(m.target));
  const args=['create','--name',name,'--network','host','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges:true','--restart','unless-stopped','--env-file',envPath];
  for(const m of mounts)args.push('--mount',`type=bind,source=${m.source},target=${m.target},readonly`);
  args.push('ipo-one-web026:d00f1ce-runtime','apps/private-pilot/src/local-worker.js');
  docker(args);docker(['start',name]);
  await report(name,{container:name,started:true,source:run('git',['rev-parse',revision]),syntheticOutboxOnly:true,attestorConfigured:false,isolatedCopy:testCopy});
}
await mkdir(state, { recursive: true, mode: 0o700 }); await chmod(state,0o700);
await mkdir(evidence, { recursive: true });
const command = process.argv[2];
if (command === 'backup') await backup('preflight');
else if (command === 'restore-copy') await restoreCopy('preflight');
else if (command === 'migrate-copy') await migrationReview(copyPg,true);
else if (command === 'prepare-source') await prepareSource();
else if (command === 'prepare-config') await prepareConfig();
else if (command === 'candidate-copy') await candidate('ipo-one-web026-copy-v3',8915,true);
else if (command === 'candidate-live') await candidate('ipo-one-web026-review',8895);
else if (command === 'worker-copy') await worker(true);
else if (command === 'worker-live') {
  const copyWorker=inspect('ipo-one-web026-copy-worker');
  if(copyWorker.State.Health?.Status !== 'healthy') throw new Error('Isolated worker must be healthy first.');
  await worker(false);
}
else if (command === 'cutover') {
  const restore = JSON.parse(await readFile(resolve(evidence,'preflight-restore.json')));
  const acceptance = JSON.parse(await readFile(resolve(evidence,'copy-acceptance.json')));
  if (!restore.restored || !acceptance.passed) throw new Error('Isolated restore/acceptance must pass before cutover.');
  docker(['stop','--time','15',old]);
  await backup('cutover');
  await migrationReview(livePg,true);
  await candidate('ipo-one-web026-review',8895);
} else throw new Error('Expected scoped command: backup, restore-copy, migrate-copy, prepare-source, prepare-config, candidate-copy, cutover');
