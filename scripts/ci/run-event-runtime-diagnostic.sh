#!/usr/bin/env bash
set -euo pipefail

# One manual job, one shared budget, four serial cases, no retries or artifacts.
baseline=bbd7ba2276b2ed295a72c2a2f965c191a62de391
candidate=5cb16868a05fa23b9bec62975766e18b212492f2
branch=refs/heads/codex/event-runtime-diagnostic-20261012
image=postgres:17.10-alpine3.23@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193
test_path=modules/persistence/test-postgres/postgres-event-runtime.test.mjs
run_label="${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
diagnostic_root="${RUNNER_TEMP:?}/ipo-one-event-diagnostic-$run_label"
deadline="${IPO_ONE_DIAGNOSTIC_DEADLINE:?}"
[[ "$deadline" =~ ^[0-9]+$ ]] || exit 1
test "${GITHUB_EVENT_NAME:?}" = workflow_dispatch
test "${GITHUB_REF:?}" = "$branch"
test "$(git rev-parse HEAD)" = "${GITHUB_SHA:?}"
test -z "$(git status --porcelain)"
git merge-base --is-ancestor "$candidate" HEAD
git merge-base --is-ancestor "$baseline" "$candidate"
test "$(node --version)" = v26.5.0
test ! -e "$diagnostic_root"
mkdir -p "$diagnostic_root"

container=""
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$container" ]]; then docker rm --force "$container" >/dev/null 2>&1 || true; fi
  git worktree remove --force "$diagnostic_root/baseline" >/dev/null 2>&1 || true
  git worktree remove --force "$diagnostic_root/candidate" >/dev/null 2>&1 || true
  rm -rf "$diagnostic_root"
  exit "$result"
}
trap cleanup EXIT
bounded() {
  maximum=$1
  shift
  remaining=$(( deadline - $(date +%s) - 5 ))
  if (( remaining <= 0 )); then
    printf 'Shared diagnostic budget exhausted. No additional case or retry.\n' >&2
    exit 124
  fi
  if (( maximum > remaining )); then maximum=$remaining; fi
  timeout --signal=TERM --kill-after=5s "${maximum}s" "$@"
}
source_checkpoint() {
  python3 - <<'PY'
import hashlib, json, pathlib, subprocess
names = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
entries = [{'path': name, 'sha256': hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest()}
           for name in names if name and pathlib.Path(name).is_file()]
encoded = json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()
print(json.dumps({'head': subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),
                  'status': subprocess.check_output(['git','status','--porcelain']).decode(),
                  'trackedFiles': len(entries), 'trackedManifestSHA256': hashlib.sha256(encoded).hexdigest()}, sort_keys=True))
PY
}

node --input-type=module - <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("vercel.json", "utf8"));
assert.deepEqual(config.git.deploymentEnabled, { "codex/event-runtime-diagnostic-20261012": false });
JS
source_checkpoint > "$diagnostic_root/diagnostic-source-before.json"
printf 'Published diagnostic source: '
cat "$diagnostic_root/diagnostic-source-before.json"
cp scripts/ci/observe-event-runtime.mjs "$diagnostic_root/observer.mjs"
sha256sum "$diagnostic_root/observer.mjs"

printf '::group::Reviewed tools and locked dependencies\n'
tool_prefix="$diagnostic_root/pnpm-11.11.0"
bounded 120 npm install --prefix "$tool_prefix" --save-exact --ignore-scripts \
  --registry=https://registry.npmjs.org pnpm@11.11.0
node --input-type=module - "$tool_prefix/package-lock.json" <<'JS'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const installer = JSON.parse(readFileSync(process.argv[2], "utf8")).packages["node_modules/pnpm"];
assert.equal(installer.version, "11.11.0");
assert.equal(installer.resolved, "https://registry.npmjs.org/pnpm/-/pnpm-11.11.0.tgz");
assert.equal(installer.integrity, "sha512-RGP2X9gO2A1pvB1L8WPulPYFxzgPwxi7Wy6+FfjNEtScUaTVnpUbQB52TTtsp1HL9RvFDtcAGmvLSTXmhMNIgg==");
JS
bounded 90 npm audit --prefix "$tool_prefix" --audit-level=moderate
export PATH="$tool_prefix/node_modules/.bin:$PATH"
test "$(pnpm --version)" = 11.11.0
bounded 180 pnpm install --frozen-lockfile
bounded 60 sudo install -d -m 1777 /private/tmp
bounded 90 docker pull "$image"
git worktree add --detach "$diagnostic_root/baseline" "$baseline"
git worktree add --detach "$diagnostic_root/candidate" "$candidate"
cmp "$diagnostic_root/baseline/pnpm-lock.yaml" "$diagnostic_root/candidate/pnpm-lock.yaml"
cmp "$diagnostic_root/baseline/package.json" "$diagnostic_root/candidate/package.json"
ln -s "$GITHUB_WORKSPACE/node_modules" "$diagnostic_root/baseline/node_modules"
ln -s "$GITHUB_WORKSPACE/node_modules" "$diagnostic_root/candidate/node_modules"
printf '::endgroup::\n'
printf '| Case | Commit | Test exit | Passed / failed / cancelled | Root seconds | Migration invocation sum seconds | Reset query sum seconds |\n| --- | --- | --- | --- | --- | --- | --- |\n' >> "$GITHUB_STEP_SUMMARY"

failed=0
for case_name in baseline-cold candidate-cold baseline-migrated candidate-migrated; do
  printf '::group::%s\n' "$case_name"
  revision=${case_name%%-*}
  condition=${case_name#*-}
  case_root="$diagnostic_root/$revision"
  container="ipo-one-event-$run_label-$case_name"
  bounded 30 docker run --detach --name "$container" \
    --label "ipo-one-event-diagnostic=$run_label" --read-only \
    --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=2g \
    --tmpfs /var/run/postgresql:rw,nosuid,nodev --tmpfs /tmp:rw,nosuid,nodev \
    --env POSTGRES_DB=ipo_one_test --env POSTGRES_USER=postgres \
    --env POSTGRES_PASSWORD=postgres --publish 127.0.0.1:5432:5432 "$image"
  ready=false
  for attempt in {1..80}; do
    if bounded 3 docker exec "$container" pg_isready -U postgres -d ipo_one_test >/dev/null 2>&1; then ready=true; break; fi
    sleep .25
  done
  test "$ready" = true
  export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ipo_one_test
  export IPO_ONE_DIAG_NAME="$case_name"
  cd "$case_root"
  source_checkpoint > "$diagnostic_root/$case_name-source-before.json"
  test "$(git status --porcelain)" = ""
  if [[ "$condition" = migrated ]]; then
    bounded 120 node scripts/migrate.mjs up
    prefix=$(bounded 10 docker exec "$container" psql -U postgres -d ipo_one_test -At -c \
      "SELECT jsonb_build_object('appliedMigrations',count(*),'checksums',md5(string_agg(name || checksum,',' ORDER BY name))) FROM schema_migrations;")
    printf '%s\n' "$prefix" > "$diagnostic_root/$case_name-prefix.json"
    python3 - "$diagnostic_root/$case_name-prefix.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['appliedMigrations'] == 89
PY
    cat "$diagnostic_root/$case_name-prefix.json"
  fi
  bounded 10 docker exec "$container" psql -U postgres -d ipo_one_test -At -c \
    "SELECT jsonb_build_object('version',version(),'roles',(SELECT count(*) FROM pg_roles),'migrationTable',to_regclass('schema_migrations'),'settings',(SELECT jsonb_object_agg(name,setting) FROM pg_settings WHERE name IN ('shared_buffers','fsync','synchronous_commit','jit','max_connections','statement_timeout')));" \
    > "$diagnostic_root/$case_name-condition.json"
  cat "$diagnostic_root/$case_name-condition.json"
  if [[ "$revision" = candidate ]]; then
    cmp "$diagnostic_root/baseline-$condition-condition.json" "$diagnostic_root/$case_name-condition.json"
    if [[ "$condition" = migrated ]]; then
      cmp "$diagnostic_root/baseline-migrated-prefix.json" "$diagnostic_root/$case_name-prefix.json"
    fi
  fi
  if [[ "$condition" = cold ]]; then
    python3 - "$diagnostic_root/$case_name-condition.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['migrationTable'] is None
PY
  fi
  printf 'Source before: '
  cat "$diagnostic_root/$case_name-source-before.json"
  set +e
  bounded 90 node --import "$diagnostic_root/observer.mjs" --test --test-reporter=tap "$test_path" \
    > "$diagnostic_root/$case_name-test.log" 2>&1
  test_exit=$?
  set -e
  cat "$diagnostic_root/$case_name-test.log"
  source_checkpoint > "$diagnostic_root/$case_name-source-after.json"
  cmp "$diagnostic_root/$case_name-source-before.json" "$diagnostic_root/$case_name-source-after.json"
  printf 'Source after: '
  cat "$diagnostic_root/$case_name-source-after.json"
  shopt -s nullglob
  traces=("$case_root/.ipo-one/event-diagnostics/$case_name".*.jsonl)
  test "${#traces[@]}" -eq 1
  trace=${traces[0]}
  sha256sum "$trace" "$diagnostic_root/$case_name-test.log"
  # Print raw synthetic diagnostic evidence to job logs; never upload artifacts.
  cat "$trace"
  if ! python3 - "$case_name" "$test_exit" "$trace" "$diagnostic_root/$case_name-test.log" "$GITHUB_STEP_SUMMARY" <<'PY'
import json, pathlib, re, sys
name, exit_code, trace, log, summary_path = sys.argv[1:]
lines = pathlib.Path(trace).read_text().splitlines()
summaries = [json.loads(line.removeprefix('DIAG_SUMMARY ')) for line in lines if line.startswith('DIAG_SUMMARY ')]
assert len(summaries) == 1 and summaries[0]['originEpochMs']
summary = summaries[0]
assert all(item.get('endMs') and item['fileReads'] == 178 for item in summary['invocations'])
events = [json.loads(line.removeprefix('DIAG_EVENT ')) for line in lines if line.startswith('DIAG_EVENT ')]
assert not any(item['kind'] in ['sampler-error', 'migration-read-error'] for item in events)
text = pathlib.Path(log).read_text()
def count(field):
    match = re.search(r'^# ' + field + r' (\d+)$', text, re.MULTILINE)
    return int(match[1]) if match else None
root = re.search(r'^(?:not )?ok \d+ - PostgreSQL event runtime proves atomicity, recovery, and replay\n\s*---\n\s*duration_ms: ([\d.]+)', text, re.MULTILINE)
root_seconds = float(root[1]) / 1000 if root else None
reset = sum(item['elapsedMs'] for item in events if item['kind'] == 'query' and item['category'] == 'fixture-reset') / 1000
migration = sum(item['elapsedMs'] for item in summary['invocations']) / 1000
result = {'case': name, 'exitCode': int(exit_code), 'tests': count('tests'), 'passed': count('pass'), 'failed': count('fail'), 'cancelled': count('cancelled'), 'rootSeconds': root_seconds, 'migrationSeconds': migration, 'resetQuerySeconds': reset, 'observerOverhead': True}
print('CASE_RESULT ' + json.dumps(result, sort_keys=True))
sha = 'bbd7ba2276b2ed295a72c2a2f965c191a62de391' if name.startswith('baseline') else '5cb16868a05fa23b9bec62975766e18b212492f2'
with open(summary_path, 'a') as out:
    out.write(f"| {name} | `{sha}` | {exit_code} | {result['passed']} / {result['failed']} / {result['cancelled']} | {root_seconds} | {migration:.3f} | {reset:.3f} |\n")
assert int(exit_code) == 0 and result['tests'] == 28 and result['passed'] == 28 and result['failed'] == 0 and result['cancelled'] == 0
assert root_seconds is not None and root_seconds < 60
PY
  then failed=1; fi
  cd "$GITHUB_WORKSPACE"
  bounded 10 docker rm --force "$container" >/dev/null
  container=""
  printf '::endgroup::\n'
done
cmp "$diagnostic_root/baseline-cold-condition.json" "$diagnostic_root/candidate-cold-condition.json"
cmp "$diagnostic_root/baseline-migrated-condition.json" "$diagnostic_root/candidate-migrated-condition.json"
cmp "$diagnostic_root/baseline-migrated-prefix.json" "$diagnostic_root/candidate-migrated-prefix.json"
source_checkpoint > "$diagnostic_root/diagnostic-source-after.json"
cmp "$diagnostic_root/diagnostic-source-before.json" "$diagnostic_root/diagnostic-source-after.json"
printf '\nAll cases preserve the original 60-second root and assertions. Invocation/query sums include client and scheduling time and can overlap; they are not exclusive wall-clock phases. Observer overhead qualifies timing; this event-only diagnostic is not a full Quality Gate or deployed identity acceptance. No artifacts or remote caches were created.\n' >> "$GITHUB_STEP_SUMMARY"
exit "$failed"
