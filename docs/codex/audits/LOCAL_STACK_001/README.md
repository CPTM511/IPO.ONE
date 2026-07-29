# LOCAL-STACK-001 Local Deployment Acceptance

Date: 2026-07-27
Result: PASS for local synthetic integration
Launch authority: NONE

## Proven boundary

IPO.ONE runs locally as a persistent multi-container product inside the
dedicated `ipo-one-local` Lima VM:

- Lima 2.2.0 using Apple Virtualization (`vz`), ARM64, 4 CPUs, 6 GiB RAM, and
  40 GiB disk;
- rootless Docker 29.6.2 with builtin seccomp and cgroup namespaces;
- Docker Compose v5.3.1;
- PostgreSQL 17.10 pinned as
  `postgres@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394`;
- IPO.ONE runtime image `sha256:40e07bd07604b64e400406169de631bac21cc30c874b31e20c95753272396bbc`;
- three authenticated loopback workspaces on ports 8787, 8788, and 8789; and
- one separate unsigned local worker with no external destination or signer.

PostgreSQL is published only to guest loopback `127.0.0.2:55432`. The verified
Lima host agent owns the three macOS loopback listeners. No database, product,
or Agent listener is exposed to the LAN or Internet.

## Live acceptance

`pnpm run local:acceptance` passed after initial startup and again after
`pnpm run local:restart`. It verified:

- PostgreSQL major version 17;
- all 39 ordered migrations;
- three authenticated local-only Human, Principal/Agent, and Risk workspaces;
- durable Tenant data;
- forced row-level security;
- a non-owner, `NOBYPASSRLS` application role;
- a healthy separate worker;
- successful reconciliation; and
- zero pending synthetic outbox messages.

All Compose services returned healthy after restart. Browser pages kept open
during the restart were refreshed only after health recovery, then rehydrated
their Actor-bound resources from PostgreSQL server truth.

## Human browser lifecycle

A real browser completed one no-real-funds Human lifecycle on
`http://127.0.0.1:8787`:

1. created a synthetic Human Subject and scoped Consent;
2. requested USD 120 for 60 days in two installments;
3. received and acknowledged the deterministic 9% sandbox Offer;
4. accepted and executed
   `obligation_43c9cc2b-ae6f-4173-80a6-2e1731c42f0b`;
5. received synthetic execution receipt
   `0xcd9991ea2540e83ede7ba89eefcde3943d2c34961154ecbf8c26fc2df9b69382`;
6. posted the full USD 120 repayment; and
7. observed Fully Repaid, USD 0 outstanding, both installments Paid, and nine
   finalized Evidence events.

After the full stack restart, the same Obligation ID, receipt, schedule,
repayment totals, and Fully Repaid state were restored. Browser console
verification reported zero errors and zero warnings.

Screenshot:
`output/playwright/local-stack-human-lifecycle.png`

## Agent browser lifecycle

A real browser and one isolated Compose proof container completed the local
Agent authority lifecycle on `http://127.0.0.1:8788`:

1. created Agent Subject
   `subject_34e295de-98ef-4fd8-a9a2-d3324513fbf7`;
2. signed the one-use challenge inside the VM boundary without publishing
   PostgreSQL or exporting a private key;
3. verified CAIP-10 chain `eip155:84532`, account hash
   `0x1d85393410de97128e5ae0ebf9b72d4bb8570b2df3157165d7cbcdb1862f4e06`,
   and proof hash
   `0x8a3edfe1ce0980ea6dc471b1202a5575a4b815409bb537ddf4c17be7a021fd8b`;
4. created exact sandbox Mandate
   `mandate_10e68660-5bd4-4652-918c-41150b764263`;
5. reviewed USD 250 per action, USD 1,000 aggregate, 180-day expiry,
   Mandate hash
   `0xcfc68f3a72e3a873b2d19518b2f60460da9992c12769536ec9643dc16ed28acf`,
   and terms hash
   `0xf07d3947ef04a961108bc53f018cc3a757860542f6e303659efe93a393e1d691`;
6. activated the exact Mandate through the authenticated Human Principal; and
7. received activation Evidence hash
   `0xf21e27ea3ce17599477a4801ff504bd877e5e69db1bef06523c5fafb2d036967`.

No private key or signature appeared in the proof receipt, and production or
funds authority remained false. After the full stack restart and browser
refresh, the same Subject, AccountBinding, and Mandate returned Active from
durable server state. Browser console verification reported zero errors and
zero warnings.

Screenshots:

- `output/playwright/local-stack-agent-activation.png`
- `output/playwright/local-stack-agent-recovery.png`

## Automated gates

All commands used the repository-pinned Node 26.5.0 and pnpm 11.1.3 runtime.

| Gate | Result |
| --- | --- |
| `pnpm run check` | PASS, 575/575 tests |
| `pnpm run test:security` | PASS, 33/33 tests |
| `pnpm run test:transport` | PASS, 52/52 tests |
| focused local stack and worker tests | PASS, 17/17 tests |
| `pnpm run check:local-stack` | PASS |
| `pnpm run local:acceptance` after restart | PASS |
| `git diff --check` | PASS |

## AUTHN-006 durable-authentication addendum

Date: 2026-07-29
Result: PASS for loopback durable authentication; Human signature remains
interactive

The local daily synthetic session and out-of-band Agent context were replaced
in the running stack:

- the invited Base Sepolia wallet is pre-provisioned by public address only;
- SIWE challenge/session/logout/invalidation rows are PostgreSQL-backed;
- a distinct non-owner, `NOBYPASSRLS`, `authentication_only` role owns no RLS
  table and has only the exact authentication allowlist;
- the Agent private key is kept in a separate ignored local secret file and is
  not mounted into the long-lived pilot container;
- every local Agent access uses a fresh 60-second one-use proof bound to the
  durable Credential; and
- key mismatch, replay, expiry, and Credential revocation fail closed.

The live stack passed before and after a full PostgreSQL/Pilot/worker restart
with 44 migrations, four active pre-provisioned Credentials, an empty pending
outbox, and no external authority. The repository gate passed `626/626`; the
fresh PostgreSQL 17 gate passed `80/80`.

A real Playwright browser confirmed that unauthenticated private views remain
locked and the wallet-only SIWE entry is available on Base Sepolia and X Layer
Testnet. Playwright intentionally had no injected wallet and therefore did not
forge the invited Human signature; that final signature is performed by the
wallet owner.

## Not proven

This acceptance does not prove or authorize managed database PITR, cloud IAM,
cloud autoscaling, remote participant access, public signup, external alert
delivery, Internet latency, Hyperliquid/Testnet writes, a production signer,
custody, lending, withdrawals, or real funds. Those remain separate reviewed
deployment and launch gates.
