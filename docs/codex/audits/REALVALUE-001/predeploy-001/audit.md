# PREDEPLOY-001 Real-environment readiness audit

Status: **BLOCKED — DO NOT CUT OVER**

Observed at: `2026-07-26T13:55:21.417Z`  
Target origin: `https://ipo.one`  
Target profile: `closed_non_funds_pilot`  
Branch: `codex/commercial-access-release`  
Baseline commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

This audit does not authorize deployment, real funds, a mainnet action,
Hyperliquid Exchange writes, an API Wallet, withdrawal, or external transfer.
It records what is actually working and what remains unavailable before an
internal-test cutover.

## Executive decision

The repository's production composition is executable against a real
PostgreSQL 17 server and passed a real cryptographic EIP-191 authentication
flow plus one durable Human product command. Unit, security, migration,
PostgreSQL, restart, replay, and physical recovery gates pass.

The cloud target is not ready and the current public origin is unavailable:

1. `https://ipo.one/`, `/livez`, and `/readyz` each return HTTP `503`.
2. Artifact Registry returns `BILLING_DISABLED` for project
   `ipo-one-public-sandbox-cptm511`.
3. The current load balancer still routes to `ipo-one-public-sandbox`, not the
   closed-pilot service.
4. The closed-pilot audit has fourteen failed checks: ten required secrets are
   absent, the running release is not the audited source release, the closed
   edge admission/WAF policy is absent, and no closed-pilot alert policy has a
   notification channel.
5. The worktree contains 283 changed or untracked paths. There is no immutable
   deployment candidate that represents the complete current source state.
6. Both known Hyperliquid Testnet addresses return `{"role":"missing"}`.
   Real master/subaccount reads, signed binding, non-empty history, and
   Exchange E2E are therefore unavailable.

No traffic cutover should occur until every P0 item below is independently
rechecked against the intended immutable release.

## P0 release blockers

| ID | Blocker | Current evidence | Exit condition |
| --- | --- | --- | --- |
| P0-01 | Public origin unavailable | Root, `/livez`, and `/readyz` returned `503` at `2026-07-26T13:53:46Z`; TLS verification passed. | Origin, liveness, readiness, discovery, and static application return the reviewed responses through the production load balancer. |
| P0-02 | GCP billing disabled | Artifact Registry API returned reason `BILLING_DISABLED`. | Billing is restored and Artifact Registry plus Cloud Run image resolution pass read-only checks. |
| P0-03 | Closed-pilot cloud prerequisites incomplete | Ten secrets missing; closed edge policy and closed alerts absent. | All checks in `scripts/audit-closed-pilot-cloud.mjs` pass against exact numeric secret versions and an immutable image digest. |
| P0-04 | No immutable current release | Cloud Run advertises release `20e142bb14690296eac754946a876ead879a45ca`; repository baseline is different and current worktree has 283 paths. | Reviewed source is committed, image is built from that exact commit, signed, scanned, pushed by digest, and the cloud audit matches both commit and digest. |
| P0-05 | Hyperliquid account unavailable | Both known addresses return role `missing`; the strict live test rejects the Founder address with `hyperliquid_info_account_role_denied`. | Founder supplies a real Testnet master and its real subaccount; relationship, non-empty history, and one-use EIP-712 binding pass. Any Exchange write remains a separate approval. |

## Production defects fixed during this audit

### Durable DPoP replay protection

The production runtime previously installed a rejecting placeholder, so every
Agent request carrying DPoP failed before product initialization. Migration
`0039_durable_authentication_replay` and `PostgresReplayCache` now provide:

- hash-only replay references;
- forced Tenant RLS;
- atomic one-use consumption;
- expiry pruning and bounded capacity;
- restart persistence;
- two-instance concurrency behavior with exactly one winner.

### Production abuse-control network reference

The trusted proxy network reference used a 43-character Base64URL value while
the Abuse Control contract requires `0x` plus 64 lowercase hexadecimal
characters. Every authenticated product command could therefore fail with
`invalid_abuse_control_input`. The reference is now a privacy-preserving keyed
hash wrapped in the exact Abuse Control hash contract.

### Real production-composition E2E

`apps/private-pilot/test-postgres/production-runtime-e2e.test.mjs` boots the
actual closed-pilot production runtime against PostgreSQL with non-superuser
gateway/authentication roles, creates an ephemeral EOA in memory, verifies a
real EIP-191/SIWE signature, obtains a cookie and CSRF context, reads the
authenticated operation catalog, and executes a durable
`pilotCreateHumanSubject` command. No private key is persisted.

### Hyperliquid live-evidence integrity

The Info adapter and live contract now reject the zero address and require an
explicit real address plus requested `master` or `subaccount` role. A zero
address can no longer produce a misleading live-verification receipt.

### Public-runtime browser startup

The browser now probes authentication capability before requesting the private
Tenant catalog. The public runtime no longer emits a startup 404 for a private
route and truthfully labels private access unavailable.

### Historical review boundary

The TC-403 frozen artifact test now verifies the historical artifact's own
content-addressed integrity. It no longer falsely requires every later
successor worktree to equal the earlier reviewed file set. This PREDEPLOY audit
must receive its own review before release.

## Verification results

| Gate | Result |
| --- | --- |
| Complete repository check | `544/544 PASS` |
| Security suite | `33/33 PASS` |
| PostgreSQL 17 integration suite | `77/77 PASS` |
| Migrations | `39` ordered up/down pairs `PASS` |
| Production PostgreSQL/EIP-191 E2E | `1/1 PASS` |
| Dependency audit | No known production vulnerabilities |
| Patch whitespace validation | `git diff --check PASS` |
| PostgreSQL physical DR | `EXACT_MATCH`; Tenant/event/Evidence/ledger/settlement state restored |
| Base Sepolia read-only head | `PASS` |
| X Layer Testnet read-only head | `PASS` |
| Hyperliquid Testnet transport | Reachable |
| Hyperliquid real account role | `FAIL`: `role=missing` |
| Hyperliquid Exchange writer/signer E2E | `UNAVAILABLE`; intentionally fail-closed |
| `ipo.one` browser/origin | `FAIL`: HTTP `503` |
| Closed-pilot cloud audit | `FAIL`: fourteen checks |

The temporary PostgreSQL cluster was stopped and moved to Trash after testing.
No production funds moved and no Testnet Exchange action was submitted.

## Browser evidence

- `screenshots/predeploy-local-trading-capital-locked.png` shows all eight
  Trading Capital views in the public runtime with private operations locked.
- `screenshots/predeploy-ipo-one-503.png` records the current origin failure.
- `live-heads-2026-07-26T13-18-57-200Z.json` records the two approved read-only
  Testnet head observations.

The local browser verified all fourteen primary product destinations and all
eight Trading Capital views. That proves the no-funds UI composition; it does
not prove cloud identity, Hyperliquid account ownership, or Exchange writes.

## Required next sequence

1. Founder restores billing for `ipo-one-public-sandbox-cptm511`.
2. Re-run origin, Artifact Registry, Cloud Run, Cloud SQL, and load-balancer
   observations; determine and remediate the exact source of the current 503.
3. Complete the ten closed-pilot secrets through a non-logging secret-entry
   path, with exact numeric versions and least-privilege access.
4. Create and verify the closed-pilot edge admission/WAF policy, alert policies,
   notification channels, zero-traffic service revision, database migration
   job, backup, and restore drill.
5. Consolidate and review the 283-path worktree, create an immutable commit and
   image digest, scan and sign it, then re-run every release gate against that
   exact identity.
6. Supply a real Hyperliquid Testnet master/subaccount pair and the approved
   one-use binding proof. Complete read-only history and relationship evidence.
7. If Exchange E2E is desired, issue a new Testnet-only decision that names the
   API Wallet signer, exact actions, notional cap, expiry, reduce-only/flatten
   rules, and human confirmation. Do not infer this authority from read access.
8. Cut over only after a fresh PREDEPLOY result is `READY` and rollback has
   been rehearsed against the exact candidate.

