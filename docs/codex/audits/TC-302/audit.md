# TC-302 audit

Status: `IMPLEMENTED_UNVERIFIED`

Completed at: `2026-07-25T13:44:58.687Z`

## Source identity and human gate

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The Founder accepted TC-301 and directed Codex to continue development.
- The accepted stacked worktree remains intentionally uncommitted. Existing
  changes were preserved; no reset, checkout, commit, push, deployment,
  credential operation, API Wallet operation, live Exchange write, mainnet
  action, or funds movement was performed.
- The broad continuation instruction was not interpreted as authority for a
  live signer, live Testnet transport, API Wallet, mainnet, deployment,
  withdrawals, transfers, or real funds.
- Pre-change mapping:
  `docs/codex/audits/TC-302/pre-change-mapping.md`.

## Outcome

TC-302 implements the offline, simulation-only enforcement boundary for:

`NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`

The new Risk Guardian provides:

- a closed, hash-bound, server-timed venue state;
- explicit `FRESH`, `STALE`, and `UNKNOWN` freshness;
- a versioned `hyperliquid_testnet_risk_simulation_fixture.v1` policy
  boundary;
- monotonic effective risk state;
- runtime aging of a previously fresh policy snapshot before TC-301 admits an
  action;
- fail-closed handling for stale/future venue state, a closed
  risk-increasing kill switch, and an unknown external write;
- immutable WARNING notification evidence without contacting an external
  notification service;
- cancellation of risk-increasing orders in `REDUCE_ONLY`;
- cancellation of all observed orders when venue classification is stale;
- ordered cancel-before-close planning in `FLATTEN`;
- only `reduceOnly: true`, bounded position-close actions;
- post-action verification with terminal `VERIFIED`, `INCOMPLETE`, or
  `UNKNOWN` outcomes;
- no automatic retry or less-restrictive recovery; and
- an independently hash-bound record for every snapshot, request, action,
  action result, verification, and transition.

The TC-301 gateway now supplies its normalized typed action to the server
policy evaluator. The Guardian policy bridge therefore proves:

- generic `order` and non-reducing `modify` are impossible in
  `REDUCE_ONLY`;
- `FLATTEN` admits only cancel and reduce-only order shapes;
- `SETTLEMENT` admits no execution action; and
- a denied action fails before nonce reservation.

The narrow simulated executor has no generic order, strategy, withdrawal,
transfer, account-administration, signer-provisioning, or API Wallet method.
It has no network capability and never submits an external order.

## Threshold and policy boundary

TC-302 does not approve a production:

- maximum Evidence age;
- polling or hysteresis interval;
- liquidation buffer;
- leverage, exposure, loss, price, size, or rate threshold;
- automatic recovery rule; or
- interest or economic repricing rule.

The liquidation-buffer values exercised by the tests are explicitly
test-owned synthetic scenario fixtures. They are not exported by the module,
are not a production policy, and cannot authorize capital or risk.

## Contract, catalog, AuthZ, admission, and dependencies

- New closed contract:
  `schemas/v2/hyperliquid-testnet-protective-control.schema.json`.
- Schema version:
  `hyperliquid_testnet_simulated_protective_control.v1`.
- New internal module:
  `modules/hyperliquid-risk-guardian`.
- New migration pair:
  `0035_trading_testnet_risk_guardian`.
- Trading Capital Tenant operation count: unchanged at 25.
- Total Tenant operation count: unchanged at 71.
- OpenAPI paths/operations: unchanged at 21/21.
- AuthZ capability or actor change: none.
- Tenant admission/quota change: none.
- Approval-policy change: none.
- SDK/UI/browser/MCP change: none.
- Runtime dependency change: none.

The Guardian is not connected to a Tenant, SDK, MCP, browser, strategy, or
production composition. That keeps the current offline work behind the human
gate. There is consequently no new externally reachable state mutation,
notification delivery, or outbox producer in TC-302.

A live success path cannot be enabled by swapping the simulated executor. It
requires a separately reviewed Tenant/AuthZ/admission/idempotency/Event/
Evidence/outbox/reconciliation design, exact rate policy, independent
security review, and precise human approval.

## State/action matrix

| Effective state | Generic order | Reduce-only order | Cancel | Reduce-only modify | Non-reducing modify |
| --- | --- | --- | --- | --- | --- |
| `NORMAL` | simulation policy only | yes | yes | yes | simulation policy only |
| `WARNING` | existing simulation policy only | yes | yes | yes | existing simulation policy only |
| `REDUCE_ONLY` | denied | yes | yes | yes | denied |
| `FLATTEN` | denied | yes | yes | denied | denied |
| `SETTLEMENT` | denied | denied | denied | denied | denied |

If a previously fresh snapshot ages beyond its test-fixture maximum age before
policy evaluation, its current effective state is forced to at least
`REDUCE_ONLY`; generic order admission is denied.

## Durable state and recovery

Migration 0035 adds:

1. `trading_testnet_protective_controls`
   - unique Tenant idempotency, request, and control identities;
   - exact Facility, risk snapshot, venue state, target state, and action
     bindings;
   - only `PLANNED -> EXECUTING -> terminal` transitions;
   - simulation-only and no-authority database checks;
   - legal-transition mutation guard; and
   - no deletion.
2. `trading_testnet_protective_transitions`
   - append-only sequence 1 through 3;
   - unique control/status and control/sequence identities;
   - immutable transition and result hashes.

Both tables use forced RLS, the existing Tenant context write guard, and a
Tenant-qualified Facility foreign key. The repository uses the existing
Tenant-scoped serializable transaction boundary, a bounded retry, and an
idempotency-scoped transaction lock.

Repository restart returns the exact terminal record and does not execute a
second protective action. A process interruption after `EXECUTING` remains
visible and cannot be silently resumed. `INCOMPLETE` and `UNKNOWN` cannot
become authorization for less restrictive risk.

## Test evidence

PASS:

1. Task-specific state/action, staleness, kill-switch, idempotency, failure,
   evidence, schema, and authority tests:

   `npx -y node@24.18.0 --test modules/hyperliquid-risk-guardian/test/hyperliquid-risk-guardian.test.js modules/hyperliquid-execution/test/hyperliquid-execution-gateway.test.js`

   - 18/18 passed: 8 TC-302 tests plus the 10 accepted TC-301 regression
     tests.
   - The complete five-action matrix was checked across all five states.
   - A previously fresh snapshot aged at policy-use time and blocked new risk.
   - WARNING, fresh and stale REDUCE_ONLY, and FLATTEN plans were verified.
   - Concurrent identical flatten calls performed one action sequence.
   - Restart replay performed zero additional actions.
   - Rejection became `INCOMPLETE`; interruption became `UNKNOWN`.
   - Corrupted action evidence was rejected on repository reconstruction.
   - TC-301 reserved no nonce for a denied risk-increasing action.

2. Security gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security`

   - 29/29 passed.
   - Includes unchanged 25-operation Trading Capital catalog, no network or
     secret access, no withdrawal/transfer/strategy authority, simulation-only
     schema flags, forced RLS, idempotency uniqueness, legal control
     transitions, and immutable transition Evidence.

3. PostgreSQL:

   `DATABASE_URL='postgresql://postgres@localhost:55436/ipo_one_tc302_final_test?host=/private/tmp/ipo-one-tc302-final-pg.FWdYtm' npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres`

   - 75/75 passed.
   - Migration up/down/up passed for 35 ordered pairs.
   - The TC-302 integration persisted one flatten control and three immutable
     ordered transitions.
   - Concurrent replay executed exactly one cancel and one reduce-only close.
   - Repository restart returned the exact result with zero new actions.
   - Immutable-field mutation, transition deletion, and cross-Tenant reads
     failed closed.
   - PostgreSQL 17.10 was physically stopped and restarted; 75/75 passed again
     after restart.

4. Contract and migration checks:

   - `pnpm run check:schemas`: 69/69 contracts passed.
   - `pnpm run check:migrations`: 35 ordered up/down pairs passed.

5. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 69 schemas, 21 OpenAPI operations, 35 migration pairs, deploy,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, web-bundle, and 506/506 repository tests passed.

6. `git diff --check`, JavaScript syntax, and JSON parsing passed.

FAIL:

- None remaining.

Resolved intermediate failures:

- Strict AJV required an explicit array type on conditional `maxItems`
  branches; the schema was corrected.
- The first RLS coverage run exposed PostgreSQL's 63-character identifier
  truncation on the original transition-table name. The table and trigger were
  shortened to `trading_testnet_protective_transitions`, after which the
  generic Tenant write-guard coverage passed.
- The first final PostgreSQL run exposed JSONB key canonicalization against a
  key-order-sensitive action-plan comparison. The repository now compares
  canonical plan hashes, and both the initial and physical-restart PostgreSQL
  runs passed 75/75.
- Downstream failures in those runs were cascades from the initial failed
  parent subtest; they passed after the root issue was fixed.

## UNVERIFIED and prohibited

- Founder-controlled qualified Hyperliquid Testnet master/subaccount,
  non-empty history, and the deferred TC-203 real-account E2E.
- A real per-Facility Hyperliquid API Wallet.
- API Wallet registration, rotation, revocation, emergency retirement, or
  pruning behavior.
- A selected HSM/KMS/non-exportable custody product and independent
  non-exportability evidence.
- Official signing bytes and a real live signer.
- Real Hyperliquid Testnet warning delivery, order cancellation, reduce-only
  execution, flattening, post-action Info reconciliation, and liquidation
  buffer behavior.
- Approved maximum ages, polling, hysteresis, exposure, leverage, loss,
  liquidation, price, size, and rate limits.
- Live Tenant Gateway/AuthZ/admission/Event/Evidence/outbox integration.
- Independent security review and acceptance of TC-302.
- Deployment, mainnet, production, real capital, or real funds.

No checked-in simulation, unit test, PostgreSQL test, clickable interface, or
audit statement is evidence for an item above.

## Temporary PostgreSQL cleanup

The temporary PostgreSQL 17.10 process was stopped. Its exact directory was
moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc302-final-pg.FWdYtm`

It remains recoverable from the user's Trash. `pg_isready` reported no
response after shutdown.

An earlier disposable debugging instance was also stopped and moved to:

`/Users/cptmao/.Trash/ipo-one-tc302-pg.Ozykng`

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `docs/codex/audits/TC-302/pre-change-mapping.md` | `0452ceff3d1e6dbccb9f0b95d40e25dae1ba812f83b556d4a0feb48f30cb708c` |
| `schemas/v2/hyperliquid-testnet-protective-control.schema.json` | `a3963ff550e4b8b6b5c521a12a37c8fc9a35b29a1126b6fe46ef8fb69333a6c5` |
| `modules/hyperliquid-risk-guardian/src/index.js` | `ff332af8d09f306ea21510002d385c3f5eb2c9e16c394d211e64493bddc7f02a` |
| `modules/hyperliquid-risk-guardian/README.md` | `8dbad0593d9498933b55a81db1a6bdd9315cdb61dd5c44bd5835a4a25c02abd5` |
| `modules/hyperliquid-risk-guardian/test/hyperliquid-risk-guardian.test.js` | `c50d771683b86c82842ba0762b4499465e6543b8fa1754dc747c52af51b129bf` |
| `db/migrations/0035_trading_testnet_risk_guardian.up.sql` | `ac642285cda95c2eb94bce7b9d5ccb868234d7ee34219b155d417702ecc5d45b` |
| `db/migrations/0035_trading_testnet_risk_guardian.down.sql` | `be108a5618769a3a8dc96d2f1af12d0f15b990a5ef681b1ee96b8b504178fd86` |
| `modules/hyperliquid-execution/src/index.js` | `b370d6ed2b3fb3018bff8e9651c953957c752449141bed34d798bbff4c6ddc7f` |

## Rollback

No shared database or external system was changed.

For an environment with no TC-302 rows, roll back only migration 0035, remove
the Risk Guardian module/contract/tests/audit, remove the normalized action
from the TC-301 policy-evaluator input, and revert the specific schema,
migration, security, production-bootstrap, and PostgreSQL-test registration
hunks.

If protective-control rows exist in an isolated test database, the down
migration refuses deletion. Preserve the Evidence, review it, and use a
separately approved forward migration or explicitly destroy only the
disposable test database.

Because this worktree contains accepted stacked tasks, never use a broad reset
or checkout as rollback.

## Next task gate

TC-302 stops here at `IMPLEMENTED_UNVERIFIED`.

TC-303 is not started. Real Testnet Exchange writes, API Wallets, signers,
deployment, mainnet, and real funds remain
`BLOCKED_PENDING_NEW_HUMAN_APPROVAL_AND_INDEPENDENT_REVIEW`.
