# PROD-CUTOVER-001 — Integrated Product Deployment and Production Cutover

Status: `IN_PROGRESS — DEPLOYMENT PREFLIGHT; REAL-VALUE GATES LOCKED`

Owner: IPO.ONE Founder / Release Owner

Date opened: 2026-08-11

Target verdict: `PASS — PRODUCTION RELEASED` or
`BLOCKED — NOT PRODUCTION RELEASED`

## Context and current baseline

The Founder-directed cutover instruction accepts the completed AECL Phase 0-5,
real-wallet signing, EIP-712, ERC-1271/6492, Hyperliquid Testnet execution,
testnet USDC execution, reconciliation, dual-native AccountBinding, exact
TransferIntent resolution and Gateway-owned atomic AECL persistence. This issue
must not reopen those implementation phases.

The accepted integrated product state is `PASS — L0_LOCAL_NO_FUNDS`. The only
outstanding integrated-wallet check is one Founder/invited-wallet regression of
the newly composed Human AccountBinding path.

Initial cutover preflight on 2026-08-11 recorded:

- branch `codex/m1-b-deployable-sandbox` at `dfba8d7` with a materially dirty
  stacked worktree;
- the integrated AccountBinding, exact resolver and atomic Gateway changes are
  not represented by the checked-in HEAD;
- sealed local RC v3 predates the 2026-08-11 integration and is limited to
  `local_no_funds`;
- the checked-in launch policy enables only `public_sandbox`; its controlled
  real-value profile remains disabled;
- Product Constitution v1.1 records `L4_CONTROLLED_REAL_VALUE` as disabled and
  `L5_PRODUCTION` as not approved;
- existing Vercel configuration and runtime contracts explicitly enforce
  no-real-funds behavior and disable external wallet/Venue submission; and
- the previously deployed Vercel stable URL timed out and `https://ipo.one`
  reset the connection from the current observation point.

The minimum successor candidate now binds integration commit
`285cc74aadd65e147fe223f032516635138979f5` and tree
`171ec9d9df83a01ba8a25cd40df1c5d8142221c6`. Repository tests passed
899/899 and isolated PostgreSQL 17 tests passed 85/85. Browser preflight reached
the real-wallet boundary with zero console errors; the controlled browser
announced no compatible wallet Provider, so the invited-wallet signature and
reload recovery remain pending without a synthetic substitution.

The Founder cutover instruction authorizes this issue to perform read-only
production inspection, exact-candidate preparation, approved no-funds
deployment work and post-deployment verification. It does not silently fill in
missing chain, asset, account, capital, custody, signer, limit, legal, privacy,
operations or independent-review decisions. Any exact value-moving action must
stop at a transaction-specific Founder confirmation boundary.

## Scope

1. Run the one outstanding integrated Human AccountBinding browser regression:
   existing Login -> Wallet & Permissions -> connect invited wallet -> real
   signature -> canonical Human AccountBinding -> reload from server truth.
2. Determine whether a current RC/seal covers the three 2026-08-11 integration
   changes. Reuse it if it does; otherwise create only the minimum new candidate
   needed to bind the exact integrated source.
3. Reuse the existing approved deployment topology. Do not split AECL into a
   separately deployed product.
4. Deploy one IPO.ONE product only after the candidate, migration, runtime,
   environment and rollback gates pass against an exact clean source identity.
5. Classify each Provider/Venue independently as `AVAILABLE`,
   `BLOCKED_EXTERNAL_DEPENDENCY`, `PAUSED` or `DISABLED` from deployed evidence.
6. Verify Human, Agent and Risk/Operations journeys against the actual deployed
   product, including no localhost dependency and Web/API/runtime/database
   version parity.
7. Prepare production activation only through reviewed configuration. Do not
   reinterpret sandbox or testnet credentials as production authority.
8. If every production decision and exact transaction input is approved, stop
   once at the final value-moving confirmation and present the exact target,
   network, asset, amount, maximum exposure, fee estimate, signer and rollback
   or recovery consequence before submission.

## Non-goals

- No AECL, wallet, signature, Hyperliquid Testnet or release-engineering
  redesign.
- No second product, obligation kernel, Ledger, Evidence store, provider
  registry or execution abstraction.
- No bulk staging of the dirty worktree and no mutation of historical seals.
- No fabricated production credential, Provider availability, signer,
  account, capital source, limit, legal approval or independent review.
- No arbitrary withdrawal, unrestricted transfer, real Human cash lending,
  public LP/vault, token/DAO or automatic model authority.
- No real-value action from a generic instruction when the exact transaction
  and current exposure have not been confirmed.

## Likely files

- `docs/codex/tasks/PROD_CUTOVER_001_INTEGRATED_PRODUCT_DEPLOYMENT_AND_PRODUCTION_CUTOVER.md`
- `docs/codex/audits/PROD-CUTOVER-001/`
- the minimum current release candidate/seal manifest, if required
- existing Vercel deployment manifests and environment validators, only if an
  approved target profile is already available
- focused browser acceptance support, only if the current integrated path
  cannot complete the defined regression

Production execution modules, launch policy, Product Constitution, custody,
signer, risk limits and mainnet profiles are not likely files until their
separate named decision packages are complete and approved.

## Acceptance criteria

1. Given the existing invited Human identity and real wallet, when the wallet
   signs the AccountBinding challenge, then the same canonical binding is
   recovered after reload from authenticated PostgreSQL truth and no login,
   Subject, credit or execution authority is implicitly created.
2. Given the current integrated source, when release coverage is inspected,
   then the candidate either proves inclusion of the three integration changes
   or a minimum successor candidate is created without rewriting any historical
   seal.
3. Given an exact clean candidate, when deployment begins, then the primary
   product and private Risk surface bind to the same source commit, migration
   head and canonical database, with a documented rollback target.
4. Given any stale, unknown, denied, quarantined or unreconciled execution
   state, when submission is requested, then no new risk or blind retry occurs.
5. Given an optional Provider without approved credentials, when IPO.ONE is
   deployed, then that Provider is independently blocked or disabled without a
   false `AVAILABLE` claim and without taking healthy product surfaces down.
6. Given the deployed product, Human, Agent and Operations acceptance complete
   through the actual HTTPS origins with zero localhost dependency and with
   matching Web/API/runtime/database release identity.
7. Given a proposed real-value action, submission remains impossible until the
   current Constitution/launch policy and all applicable `REALVALUE-001`
   decisions approve the exact production profile and the Founder confirms the
   exact transaction.
8. The final report uses only `PASS — PRODUCTION RELEASED` or
   `BLOCKED — NOT PRODUCTION RELEASED`, and identifies concrete deployment or
   production blockers without reopening completed architecture phases.

## Test commands

Run only against the exact candidate and an ephemeral PostgreSQL 17 database:

```sh
pnpm run check:runtime
pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run check:product-traceability
pnpm run test:security
pnpm run test:transport
pnpm test
DATABASE_URL='<ephemeral-postgresql-17-url>' pnpm run test:postgres
pnpm run check
git diff --check
```

Deployment-specific checks reuse the existing topology validators and run only
after the source is clean and the approved target environment is available.

## Security checklist

- [ ] Authentication, wallet connection, AccountBinding and execution authority
      remain four distinct states.
- [ ] Exact payload and ExpectedEffects are server-resolved from canonical
      intent and current registry truth.
- [ ] Exposure reservation, preflight, submission result, finality,
      reconciliation, Ledger and Evidence remain one fail-closed pipeline.
- [ ] `DENY` and `QUARANTINE` never submit; `UNKNOWN` never blind-retries.
- [ ] Production secrets, signer material, raw signatures, PII and private
      policy are absent from source, browser storage, logs and Evidence.
- [ ] Provider authority cannot widen canonical IPO.ONE authority.
- [ ] Numerical caps, pause, revoke, freeze, stop-loss and recovery ownership
      are approved and observable before value movement.
- [ ] The exact deployed artifact, environment and database migration head are
      content-addressed and rollback-tested.

## Permission boundary

This issue may inspect current external state, prepare the exact candidate, run
local and deployed no-funds acceptance, and execute a separately approved
deployment using existing infrastructure and credentials already placed within
scope by the Founder.

It may not invent or infer approval for real capital, beneficial ownership,
loss allocation, legal roles, custody, signer governance, mainnet/production
chain, production asset/contracts/accounts, Provider participants, numerical
risk limits, pricing, tax/accounting, SLO/on-call, independent security review
or the final exact release profile. Those decisions remain governed by Product
Constitution v1.1, `deploy/launch-policy.v1.json` and `REALVALUE-001` until a
named approved revision records them.

Any real-value mutation requires a final, transaction-specific Founder
confirmation after all upstream gates are green.

## Data and migration impact

Preflight adds documentation and Evidence only. No production schema or data
migration is authorized by opening this issue. The integrated source currently
defines migration 0061; deployment must prove the full ordered up/down set and
the actual database head before traffic promotion.

## Rollback plan

- Before deployment: discard only PROD-CUTOVER-001-specific candidate metadata;
  do not reset the stacked worktree or rewrite historical seals.
- Deployment: retain the currently serving deployment and database backup until
  health, identity, migration and acceptance pass; promote only the verified
  artifact; on failure restore the previous alias and leave new mutations
  paused.
- Configuration: revert to the previous reviewed no-funds profile and disable
  the affected Provider independently.
- Real value: do not submit unless the exact recovery/compensation procedure is
  already approved; unknown outcome pauses new exposure pending reconciliation.

## Required Evidence

- exact branch, commit, tree, candidate manifest and dirty-path disposition;
- release-coverage comparison proving whether the integrated changes are bound;
- test and PostgreSQL results for the exact candidate;
- signed-browser AccountBinding regression receipt and reload recovery;
- deployment IDs, URLs, runtime versions, migration head and configuration
  digests without secret values;
- Provider/Venue activation matrix;
- Human, Agent and Operations post-deployment acceptance;
- health, logs, alerting, rollback and reconciliation evidence; and
- for any real-value action, the exact Founder-confirmed transaction plus
  finality, Ledger and Evidence reconciliation.

## Dependencies and sequencing

Completed AECL Phase 0-5, SIG-003, Hyperliquid Testnet execution and
PRODUCT-INTEGRATION-001 are immutable inputs. Exact candidate identity precedes
deployment. Deployment precedes production activation. Post-deployment
acceptance precedes release. Real-value confirmation is last and cannot repair
an earlier missing approval.

## Completion Evidence

Preflight Evidence is recorded in
`docs/codex/audits/PROD-CUTOVER-001/preflight.md`. Deployment, invited-wallet
signature, post-deployment acceptance, policy revision and exact real-value
confirmation remain pending.
