# EXEC-002 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED_UNVERIFIED` — Phase 2 Founder review required

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Authority and boundary

The Founder authorized EXEC-002 after accepting the narrower Phase 1 and
EXEC-001 Evidence. This delivery authorizes local deterministic construction,
simulation contracts, permission/data checks and immutable Evidence only. It
does not authorize an external simulator, wallet or Provider call, signing,
transaction or UserOperation submission, chain write, deployment, production
operation, real value or funds movement.

Every fresh `ALLOW` receipt still terminates at
`execution_submission_disabled_l0_local_no_funds`. No execution adapter is
composed in this delivery profile.

## Delivered control path

1. Resolve one canonical `TransferIntent` and current Tenant authority.
2. Construct one exact EVM payload server-side and bind its selector to the
   calldata prefix.
3. Bind chain, target, code/proxy snapshots, grant, policy, Authorization,
   exposure reservation, session epoch, ExpectedEffects and expiry into one
   immutable `PreparedExecution` hash.
4. Invoke a closed simulation port with that exact object and normalize native,
   asset and allowance effects.
5. Compare the simulation, code/proxy snapshot and ExpectedEffects without
   accepting caller-authored effect claims.
6. emit exactly one `ALLOW`, `STEP_UP`, `DENY` or `QUARANTINE` decision with
   stable reason codes and a short-lived immutable receipt.
7. Recheck the complete authority, payload, receipt, reservation and freshness
   context at the submission guard, then fail closed locally.

## Security acceptance

| Required case | Result | Enforced outcome |
| --- | --- | --- |
| Malicious unlimited approval | PASS | `DENY / unlimited_approval_denied`; current policy has no broad-approval step-up exception |
| Unknown selector | PASS | `DENY / unknown_selector` |
| Proxy or code change | PASS | `QUARANTINE` on code-hash or implementation drift |
| Wrong chain | PASS | `DENY / wrong_chain` |
| Revoked grant | PASS | `DENY / grant_not_active` |
| Stale simulation | PASS | `stale_agentic_execution_simulation` before a receipt can authorize anything |
| Stale preflight receipt | PASS | `stale_transaction_preflight`; submit is unavailable |
| ExpectedEffects mismatch | PASS | `QUARANTINE` with normalized effect-drift reason |

`STEP_UP` remains a closed decision for an otherwise eligible exact action that
needs separately authorized Human confirmation. A deny or quarantine condition
always takes precedence, so a malicious unlimited approval cannot be converted
into step-up by the current policy.

## Persistence and Evidence

Migration `0056_agentic_execution_preflight` adds three additive Tenant-scoped
tables:

1. `wallet_prepared_executions`
2. `wallet_simulation_reports`
3. `wallet_transaction_preflight_receipts`

They use Tenant-composite references, forced RLS, write-context guards and
immutable database triggers. The PostgreSQL repository commits execution
projection, simulation, decision receipt, domain Event, Evidence and outbox in
one transaction. The integration test proves a denied wrong-chain preflight is
queryable, immutable and invisible to a second Tenant under a non-superuser,
non-bypass role.

No raw signature, reusable credential, Provider response, private key or
secret is persisted. The local simulator result explicitly records that no
external call was performed.

## Verification results

- `pnpm test`: PASS — 767 tests, 0 failures.
- `pnpm run test:postgres`: PASS — 85 tests, 0 failures.
- EXEC-002 focused domain tests: PASS — 9 tests, including the eight required
  malicious/stale cases and exact simulator-port binding.
- `pnpm run check:schemas`: PASS — 93 closed contracts.
- `pnpm run check:migrations`: PASS — 56 ordered up/down pairs.
- source lint, boundary lint and TypeScript declaration parity: PASS.
- authorization, abuse-control and product-traceability policy gates: PASS.

The aggregate `pnpm run check` is not green because the pre-existing sealed
M1-A.1 candidate snapshot records branch
`codex/checkpoint-20260727-pre-strategy`, while the current branch is
`codex/m1-b-deployable-sandbox`. The command reached and passed runtime, lint,
types, schemas, OpenAPI, migrations, deployment topology, Provider selection,
closed-pilot operations, local-stack and all 44 Constitution requirement gates
before that exact historical snapshot assertion. EXEC-002 did not modify or
reseal the candidate artifact.

## Rollback

Remove the local preflight domain/repository and the three additive schemas,
then apply the guarded 0056 down migration only after confirming no later
execution receipt depends on these rows. There is no wallet, Provider, chain or
funds state to unwind.

## Review gate

EXEC-002 is implemented, not Founder-accepted. External simulation, adapter
composition, signing and submission remain outside authority. Review this
Evidence together with `docs/codex/audits/EXEC-003/audit.md`; do not start the
next phase without a new named authorization.
