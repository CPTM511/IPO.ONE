# RELEASE-001 audit

Status: `IMPLEMENTED_UNVERIFIED`

Human gate: `ACCEPTED_AS_IMPLEMENTED_UNVERIFIED`

Release owner: `IPO.ONE Founder`

Evaluation completed: `2026-07-26`

## Outcome

The complete private no-funds V9 + V10 product passes formal local release
acceptance. The protected Hyperliquid Testnet implementation remains
`IMPLEMENTED_UNVERIFIED` because the exact live master/subaccount, non-empty
history, API Wallet, signed Exchange write, order/fill, flatten, funding,
settlement, recovery, and real signer lifecycle were not executed.

External independent review evidence was expressly skipped by the Founder after
the Founder stated colleagues had reviewed the artifact with no issue. That is
recorded as `WAIVED_BY_FOUNDER / UNVERIFIED`, not as `PASS`.

No launch, mainnet, real funds, production signer, custody, withdrawal,
transfer, deployment, or real-value permission is unlocked.

## Source identity

- repository: `/Users/cptmao/Documents/IPO.ONE`
- branch: `codex/commercial-access-release`
- baseline HEAD:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- current candidate implementation artifact set:
  `0x88b8fccd24a4ecab4d3e2ba90bfed0fab641773398c1ea9cbe8ecd0f978c895d`
- content-addressed implementation files: `327`
- checked-in manifest SHA-256:
  `3514eb3c2b46ff4abc57431633bc8d0d45e456a4cde2e162aaf1d42e1b6cdf3c`
- TC-403 assurance:
  `0xa7bf78a2f4ab81bd10ad1be88509cb91209c05ca92c1077f2700fc7df0692269`
- TC-403 assurance state:
  `BLOCKED_INDEPENDENT_REVIEW`, `launchBlocked=true`, P0=`0`, P1=`0`
- pre-audit worktree inventory: `80` modified tracked paths and `257`
  untracked paths; this is the intentional stacked task worktree, not a clean
  commit.

The earlier TC-403 review set was
`0x19d3fb26a3343354cf0cd98e3433b30313fd132a715083198dc5361fe936ffd3`.
RELEASE-001 changed the TC-403 artifact builder/test so successor audit output
cannot retroactively mutate a frozen implementation set. The regenerated
candidate set is therefore not represented as the earlier reviewed set.

## RELEASE-001-specific changes

Changed implementation/test support:

- `scripts/build-tc403-artifact-manifest.mjs`
  - excludes `docs/codex/audits/RELEASE-001/` as successor audit output;
  - preserves exact hashing of every TC-403 implementation path; and
  - keeps the unrelated `cdp-app-react/` exclusion separate.
- `modules/hyperliquid-operability/test/hyperliquid-operability.test.js`
  - verifies the current stacked implementation exactly; and
  - verifies that successor audit output is not added to the frozen TC-403 set.

Regenerated:

- `docs/codex/audits/TC-403/reviewed-artifact-manifest.json`
- `docs/codex/audits/TC-403/operability-assurance.json`

Added RELEASE-001 evidence:

- `docs/codex/audits/RELEASE-001/pre-change-mapping.md`
- `docs/codex/audits/RELEASE-001/acceptance-matrix.md`
- `docs/codex/audits/RELEASE-001/hyperliquid-live-read-evidence.json`
- `docs/codex/audits/RELEASE-001/founder-release-decision.md`
- `docs/codex/audits/RELEASE-001/audit.md`

No RELEASE-001 migration, OpenAPI, Tenant catalog, AuthZ, admission, Ledger,
pricing, risk-limit, privacy, dependency-version, launch-policy, deployment, or
funds-authority change was made.

## Package and matrix evidence

The supplied development ZIP was rehashed:

`0a628994c948902953e831723be4c3b92ce904dfcbe7991b8f5c5e5f3f266fc1`

It matches the provided package identity.

Every prototype, V9 destination, Trading Capital operation, wallet, security,
Testnet E2E, human-approval, and final-stage row is classified in
`acceptance-matrix.md` as `PASS`, `PASS_LOCAL_NO_FUNDS`,
`PASS_REAL_TESTNET`, `PASS_SPECIFIED_DISABLED`, `UNVERIFIED`, or
`WAIVED_BY_FOUNDER`.

## Browser acceptance

Browser:

- Playwright CLI named sessions
- Chromium user agent:
  `HeadlessChrome/150.0.0.0`
- platform: `MacIntel`
- desktop viewport: `1440×1000`
- mobile viewport: `390×844`

Ephemeral loopback hosts used:

- Human lifecycle: `127.0.0.1:62119` and `127.0.0.1:64789`
- Wallet boundary: `127.0.0.1:62937`
- Risk & Operations: `127.0.0.1:63110`
- Agent Console: `127.0.0.1:63255`
- Capital Network: `127.0.0.1:63424`

All hosts and browser sessions were closed after acceptance.

Verified:

- all 13 V9 destinations;
- all eight Trading Capital views;
- Trading Capital `25 / 25` local catalog parity;
- Human and Agent mobile entry layouts;
- wallet sign-in modal, zero-wallet boundary, fixed Base Sepolia/X Layer
  profiles, and no-funds labels;
- Risk/Operations aggregate, PII-free, protective-only surface;
- Agent Console CAIP-10/Mandate/11-tool local contract;
- Capital Network exact assignment and disabled funding/withdrawal;
- skip-link keyboard activation (`Tab`, `Enter`);
- Trading Capital tab keyboard movement (`ArrowRight`);
- authenticated loopback catalog/operation requests returned `200`; and
- checked sessions returned 0 console errors and 0 warnings.

Full formal screen-reader/WCAG conformance remains `UNVERIFIED`.

Browser screenshot SHA-256:

| Evidence | SHA-256 |
| --- | --- |
| Human mobile | `5bbe04bdd97b151ea3dd06ef13893bf09b947646fb58d6472b7405c08b79f1fb` |
| Agent mobile | `78b53bc2b801ab5e3cef17eb74f255c234c44cbd26f55b1201f7254c63c6e485` |
| Trading Capital desktop | `d1a38cb5cc362686dd389c614037eb79b737a2147eddb434b80f5989758a567f` |
| Trading Capital mobile | `d4e8a24c300701cebe9c94f466ae15880f66718940ae9d4eb453719213017a5e` |
| Agent Console desktop | `d30c81b1c2f3549b9907097f74f887f951e1e43a90b2ad136df2f35568e89ef4` |
| Capital Network desktop | `1c1e755fe1ffad3acfc0c3ef61d54bb9eb3e711e2d0547b275a863d463e44a78` |
| Wallet boundary desktop | `f2f0222e157026b70907bd74e9003e74b248a9b7aee05d9ede9a23d2595f1200` |
| Risk & Operations desktop | `4ba08ff0bf1e188a05fd2b68e241f69bd29251bda3005156ab245e36d72031d3` |

## Runtime and dependency evidence

PASS:

- Node `v24.18.0`
- pnpm `11.1.3`
- frozen-lockfile offline install: up to date
- production dependency audit: no known vulnerabilities
- 73 JSON Schema contracts
- 21 OpenAPI paths/operations
- 38 ordered migration up/down pairs
- 71 Tenant protocol operations
- 91 request fixtures
- 79 result fixtures
- eight handoff fixtures
- 13 destinations
- 66 product actions
- 71 operation bindings
- one external browser module
- 24 authored browser modules
- 707 unique static IDs

Product maturity output:

- `REAL_LOCAL=38`
- `REAL_TESTNET_READ=1`
- `SIMULATION_ONLY=12`
- `SPECIFIED_DISABLED=7`
- `ABSENT=8`

This output is preserved as product truth; no `SIMULATION_ONLY`,
`SPECIFIED_DISABLED`, or `ABSENT` item was promoted by RELEASE-001.

## Automated test evidence

PASS:

1. Full repository gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check`

   Result: `544/544`.

2. Security:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security`

   Result: `33/33`.

3. TC-403 assurance:

   `npx -y node@24.18.0 --test
   modules/hyperliquid-operability/test/hyperliquid-operability.test.js`

   Result: `11/11`.

4. PostgreSQL integration and physical DR:

   `DATABASE_URL='postgresql://cptmao@127.0.0.1:55440/ipo_one_tc403_test'
   IPO_ONE_TC403_DRILL_APPROVAL='TC-403'
   PG_DUMP_BIN='/opt/homebrew/opt/postgresql@17/bin/pg_dump'
   PG_RESTORE_BIN='/opt/homebrew/opt/postgresql@17/bin/pg_restore'
   npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres`

   Result: `75/75`; the TC-402 settlement subtest asserted a mode-0600 physical
   `pg_dump`/ephemeral `pg_restore` exact match and cleanup.

5. Hyperliquid Testnet read-only contract:

   `IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ='TC-201'
   npx -y node@24.18.0 /opt/homebrew/bin/pnpm
   test:hyperliquid-info:live`

   Result: `1/1`, role `user`, positions/orders/fills/subaccounts all `0`,
   `freshness=stale`, `signerAvailable=false`,
   `exchangeEndpointAvailable=false`, `fundsAuthority=false`.

6. `git diff --check`: PASS.

## PostgreSQL and recovery

- PostgreSQL: Homebrew `17.10`
- listener: `127.0.0.1:55440`
- user: `cptmao`
- database: `ipo_one_tc403_test`
- migration/role/RLS/restart suite: `75/75`
- physical backup/restore: asserted `EXACT_MATCH`
- backup artifact retained: `false`
- restore database retained: `false`
- external system queried by DR: `false`
- Exchange write submitted by DR: `false`
- credentials used by DR: `false`
- production funds moved by DR: `false`

The temporary PostgreSQL process was stopped. Final `pg_isready`:
`127.0.0.1:55440 - no response`.

## Current Hyperliquid read truth

At `2026-07-26T06:01:49.973Z`, the fixed Testnet `/info` adapter created a
read-only snapshot:

- role verified: `user`
- positions: `0`
- open orders: `0`
- fills: `0`
- subaccounts: `0`
- freshness: `stale`
- credentials used: `false`
- signer available: `false`
- Exchange endpoint available: `false`
- external order submitted: `false`

This passes read-only reachability and SSRF/method/query boundaries. It does not
verify a master/subaccount pair, useful history, or Exchange execution.

## Security proof

- launch policy is unchanged and pending evidence fails closed;
- real-value policy remains locked;
- no key, seed, raw reusable signature, bearer session secret, or credential
  was created or recorded;
- no mainnet or real funds were used;
- no Exchange write, withdrawal, transfer, approval, custody, contract
  deployment, or production action was attempted;
- no client-supplied Tenant, role, identity, pricing, risk, PnL, fee, or
  settlement truth was added;
- cross-Tenant, forced-RLS, authorization, admission, idempotency, transaction,
  Event, Evidence, outbox, version, reconciliation, restart, and abuse bounds
  passed; and
- the current TC-403 assurance remains machine-blocked.

## Failures encountered and resolved

1. The first full gate produced `543/544` because the TC-403 test treated a new
   RELEASE-001 audit file as implementation drift. The manifest builder/test
   now excludes only successor audit output while continuing to hash the exact
   stacked implementation. The final gate passed `544/544`.
2. A direct DR command against the post-suite empty database failed closed
   because it contained no Facility/Ledger/Evidence/settlement truth. The
   approved DR was then run inside the TC-402 complete settlement fixture and
   passed through the full `75/75` suite.
3. The first live Hyperliquid command omitted the required explicit
   `IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ=TC-201` acknowledgement and failed
   before network access. The correctly acknowledged read-only command passed.
4. The browser CLI command is `requests`, not the older `network` alias. The
   evidence collection was corrected; this was not a product failure.

No unresolved P0 or P1 was introduced.

## Founder process waiver

At `2026-07-26T05:44:16.000Z`, the Founder explicitly directed Codex to skip
collecting the external review artifact, stated colleagues had reviewed with no
issue, and directed work to continue.

RELEASE-001 treatment:

- process instruction accepted for evaluation;
- external report/attestation state:
  `UNVERIFIED / WAIVED_BY_FOUNDER`;
- no review identity, report hash, or attestation was invented;
- no `PASS` was recorded for S-18; and
- no launch or funds permission was inferred.

## Rollback

RELEASE-001 created no migration, deployment, external account, key, contract,
funds movement, or irreversible state.

A scoped rollback would:

1. remove only the RELEASE-001 audit outputs and generated screenshots;
2. restore the prior TC-403 manifest-builder/test behavior and prior generated
   manifest/assurance together; and
3. rerun TC-403 `11/11`, security `33/33`, PostgreSQL `75/75`, and full
   `544/544`.

Do not reset the stacked worktree or delete unrelated user changes.

## Founder verdict

At `2026-07-26T12:31:18.000Z`, the Founder accepted RELEASE-001 as
`IMPLEMENTED_UNVERIFIED` using the exact matrix SHA-256
`1260226d1316bea2f6894acef15c725300b8bd9e9e2fae3a012b7d0e85e9a381`.

The verdict preserves every `UNVERIFIED` row, the open P2, and every real-funds,
mainnet, signer, Exchange-write, and deployment lock. It unlocks only
REALVALUE-001 decision-package preparation.

## Next task status

`REALVALUE_001_DECISION_PACKAGE_PREPARATION_UNLOCKED`

All real-value, mainnet, signer, Exchange-write, deployment, and funds
permissions remain locked.
