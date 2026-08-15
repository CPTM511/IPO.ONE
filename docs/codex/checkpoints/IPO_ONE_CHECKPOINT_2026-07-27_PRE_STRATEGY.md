# IPO.ONE checkpoint — 2026-07-27 pre-strategy dialogue

Checkpoint status: `VERIFIED_CHECKPOINT`  
Requested by: `IPO.ONE Founder`  
Recorded at: `2026-07-27T06:51:18Z`  
Purpose: preserve the exact engineering state before the Founder and Codex begin
adversarial/product-strategy dialogue that may change product scope,
architecture, sequencing, or implementation.

This checkpoint is a recovery marker. It is not a production-readiness,
real-value, legal, risk, custody, capital, Hyperliquid-write, or launch
approval.

## Recovery identifiers

- Main repository:
  `/Users/cptmao/Documents/IPO.ONE`
- Parent baseline before the accumulated implementation:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- Checkpoint branch:
  `codex/checkpoint-20260727-pre-strategy`
- Annotated tag:
  `ipo-one-checkpoint-20260727-pre-strategy-v1`
- Independent nested repository:
  `/Users/cptmao/Documents/IPO.ONE/cdp-app-react`
- Nested checkpoint branch:
  `codex/checkpoint-20260727-pre-strategy`
- Nested commit:
  `6a5343d8c13f0517bdf797270ed14c7a473b20fd`
- Nested annotated tag:
  `ipo-one-cdp-checkpoint-20260727-pre-strategy-v1`

The immutable commit is the commit referenced by the annotated checkpoint tag.
Resolve it without trusting a copied hash:

```bash
git rev-parse ipo-one-checkpoint-20260727-pre-strategy-v1^{}
```

## Current hosted state

The temporary public, synthetic, no-real-funds application is deployed on
Vercel:

- stable URL: `https://ipo-one-internal.vercel.app`
- Vercel project: `ipo-one-internal`
- project ID: `prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y`
- production deployment ID: `dpl_5GkjnPJrJ2YLUqqv9nJNaYz6KpNH`
- observed deployment state: `READY`
- production domain `ipo.one`: intentionally not attached

The former GCP runtime has been materially offboarded:

- Cloud SQL `ipo-one-closed-pilot-db`: `STOPPED`,
  `activationPolicy=NEVER`, deletion protection retained;
- public and closed-pilot Cloud Run services: deleted;
- migration Job: deleted;
- global load balancer, reserved address, Cloud Armor, certificate, uptime
  check, and alert policies: deleted;
- database backups, Artifact Registry images, secrets, service accounts, and
  build storage: retained for recovery and may continue to incur storage cost.

See:

- `docs/codex/audits/REALVALUE-001/vercel-migration-001/audit.md`
- `docs/codex/audits/REALVALUE-001/gcp-offboarding-001/inventory.md`

## Capability mark

### Public no-funds product

- Fourteen primary product destinations and eight Trading Capital views.
- Twenty-one public Agent Lockbox OpenAPI operations.
- Synthetic Subject, Mandate, credit, spend, settlement, repayment, Ledger,
  reconciliation, timeline, and Evidence lifecycle.
- Explicit `productionFundsMoved=false` boundary.
- Process-local bounded sandbox sessions; state is intentionally ephemeral.

### Shared private Human and Agent product

Implemented and verified locally, but not currently deployed on Vercel:

- one PostgreSQL-backed, forced-RLS, multi-Tenant obligation kernel;
- Human Subject, Consent, synthetic identity reference, Credit Intent,
  Decision, Offer, Obligation, execution, repayment, servicing, Evidence,
  Credit Passport, reports, and multiple positions;
- Agent Subject, Principal, account proof, Mandate, Offer, Obligation,
  execution, repayment, owned-state, and Evidence;
- seventy-one closed private Tenant operations;
- eleven local stdio MCP tools and typed SDK workflows;
- Risk/Operations aggregate, freeze, servicing, reconciliation, alert, and
  disaster-recovery controls;
- signed out-of-process sandbox Provider boundary.

### Wallet and chain

- EIP-6963 discovery, explicit Provider choice, SIWE, EOA verification,
  ERC-1271, session invalidation, replay protection, and cross-tab quarantine.
- Base Sepolia EOA, Agent EIP-712, and minimal ERC-1271 test evidence passed.
- X Layer remains portability/conformance evidence rather than an
  authentication-authorizing live proof.
- WalletConnect dependency and lifecycle are reviewed, but real mobile/QR E2E
  and hosted wallet authentication remain disabled.

### Trading Capital and Hyperliquid

- Twenty-five closed Trading Capital operations pass local no-funds contracts.
- Facility, collateral/funding records, Order Intent, risk, pause,
  reduce-only/flatten, reconciliation, close, settlement, performance proof,
  nonce, replay, unknown-result, restart, and disaster-recovery models exist.
- Hyperliquid Testnet Info reachability and the read-only adapter passed with
  no credential or signer.
- A Founder-controlled master/subaccount pair, non-empty history, API Wallet,
  signed Testnet order/fill, live flatten, Facility funding/close/settlement,
  and real signer rotation remain `UNVERIFIED`.
- Mainnet, real funds, withdrawals, external transfers, custody, and
  authority-expanding Exchange actions remain absent and locked.

## Known incomplete work

1. Deploy a Vercel-compatible PostgreSQL service and the authenticated private
   Pilot instead of the current process-local public sandbox.
2. Select and deploy production Human IdP/MFA, Agent workload credentials,
   Tenant provisioning, secrets, and protected remote transport.
3. Publish the private Agent API and a reviewed remote MCP/A2A transport;
   current authenticated MCP is local stdio only.
4. Add protected backup/restore, scheduled reconciliation and synthetics,
   hosted alert delivery, named incident ownership, and operational escalation.
5. Complete formal assistive-technology/WCAG acceptance and independently
   attributable security review evidence.
6. Close retained P2
   `TC403-REV-P2-002 runtime_alert_provenance_not_composed`.
7. Complete the real Hyperliquid Testnet master/subaccount and signed Exchange
   E2E only under a new bounded human approval.
8. Keep REALVALUE-001 rejected and locked until its Legal, Security, Risk,
   Custody, Finance, Compliance, Infrastructure, Operations, capital, pricing,
   Provider, and launch decisions are independently completed.

## Excluded local material

The following are intentionally outside Git commits and Bundles:

- `.env` and `.env.*` except reviewed examples;
- `.ipo-one/` local database/runtime secrets;
- `deploy/approvals/*.local.json`;
- private keys, seeds, reusable signatures, wallet credentials, and bearer
  tokens;
- `node_modules`, pnpm stores, generated builds, caches, logs, and temporary
  browser output;
- `cdp-app-react/.env`;
- the nested repository's internal `.git` directory.

`cdp-app-react` is checkpointed independently so the parent repository does not
record it as an accidental gitlink. Its ignored environment file and
dependencies are not included.

## Restore procedure

Restore in the existing main repository:

```bash
git switch codex/checkpoint-20260727-pre-strategy
```

Inspect the immutable checkpoint:

```bash
git switch --detach ipo-one-checkpoint-20260727-pre-strategy-v1
```

Restore the nested CDP experiment:

```bash
git -C cdp-app-react switch codex/checkpoint-20260727-pre-strategy
```

If the working repository is unavailable, clone:

```bash
git clone /Users/cptmao/Documents/IPO.ONE-checkpoints/2026-07-27-pre-strategy/IPO.ONE-checkpoint.bundle IPO.ONE-restored
```

Restore the nested source repository independently:

```bash
git clone /Users/cptmao/Documents/IPO.ONE-checkpoints/2026-07-27-pre-strategy/cdp-app-react-checkpoint.bundle cdp-app-react-restored
```

The Bundle SHA-256 values are stored beside those Bundles in
`CHECKSUMS.sha256`. Restoring hosted infrastructure remains a separate reviewed
deployment action; checking out this commit does not restart GCP, change DNS,
create credentials, or enable funds.

## Final verification

- exact runtime: Node `v24.18.0`, pnpm `11.1.3`;
- complete repository gate: `545/545 PASS`;
- security gate: `33/33 PASS`;
- isolated PostgreSQL 17 integration gate: `77/77 PASS`;
- temporary PostgreSQL stopped; final readiness check returned `no response`;
- tracked implementation diff check before adding the historical audit
  artifacts: `PASS`;
- the final staged diff intentionally preserves historical Markdown hard-break
  whitespace, a small number of existing audit-file end blanks, and the fixed
  third-party WalletConnect bundle byte-for-byte; these produce non-functional
  `git diff --cached --check` notices and were not mechanically rewritten in a
  recovery checkpoint;
- high-confidence credential-pattern scan over checkpoint candidates:
  no match;
- nested `cdp-app-react` TypeScript/Vite production build: `PASS`;
- nested `cdp-app-react` ESLint: `PASS`;
- generated nested build, dependency directory, and `.env`: excluded.

Vite reported one non-blocking bundle-size warning for the generated
`cdp-app-react` JavaScript chunk. The build completed successfully; optimization
is future work and the generated `dist` output is not part of the checkpoint.
