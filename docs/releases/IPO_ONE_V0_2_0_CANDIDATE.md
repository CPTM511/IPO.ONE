# IPO.ONE v0.2.0 engineering candidate

Status: `PASS — DEPLOYED AND USER-VERIFIED`

Candidate: `M2A-009-V0.2.0-RC-20260825-001`

Exact code SHA: `25921f008f260d2d8a39524603cd1a6f2512fd63`

Local product experience:
<http://127.0.0.1:8787/#request-credit>

## Outcome

The bounded M2A recovery implementation is an exact engineering candidate. It
binds the already finalized Base Sepolia test Pool and Adapter, seven immutable
Evidence digests, 65 migrations, deterministic restart/reorg/reconciliation
drills, dual-role local recovery control and an explicit rollback posture. It
adds no signer, wallet client, signing method, transaction preparation or
broadcast primitive.

The exact-SHA Founder-signed visible-click session is complete. The Founder
confirmed an independently participating engineer reviewed the candidate
offline, accepted responsibility for that bounded review and waived publication
of the engineer's identity or a separate report. PR #53 is merged, post-merge
CI passed and the merge SHA was rebuilt and visibly rechecked. The final bounded
decision is recorded in `docs/releases/IPO_ONE_V0_2_0_REVIEW.md`.

## Truthful completion states

| State | Result | Evidence |
| --- | --- | --- |
| CODE | Yes | candidate schema, validator, runner and regression suite at the exact code SHA |
| RUNTIME | Yes, local | exact OCI image revision and worker/pilot identity equal the code SHA |
| DEPLOYED | Base Sepolia contracts only | Pool and Adapter are the finalized M2A-008 test-assets deployment; this candidate adds no deployment |
| REACHABLE | Yes, local | loopback product is healthy at the URL above; no public-production claim |
| VERIFIED | Yes at the bounded M2A testnet/local boundary | browser 8/8, exact local acceptance, signed visible-click review, Founder-accepted offline independent engineering review, PR merge and post-merge CI pass |

## Exact Base Sepolia boundary

- Chain: `eip155:84532`
- Pool: `0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da`
- Adapter: `0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19`
- Pool deployment block: `45908863`
- Adapter deployment block: `45907914`
- Common finalized configuration observation block: `45940709`
- Pause Guardian: `0x8a1E62C539B802c8a204382442cA7a8caC31f19E`
- Recovery Authority: `0x730766ff23D3c4366f3314c8895330fC589AA546`
- Current observed state: oracle deviation halt `false`; new-risk pause
  `false`
- Access: two public RPC reads only; no new transaction and no funds movement

The primary and secondary RPCs agreed on finalized receipts, current runtime
bytecode and Pool configuration. One public RPC had pruned historical state at
the deployment height; the runner was corrected to bind deployment through
finalized receipts and compare current configuration at the latest common
finalized height.

## Recovery and rollback Evidence

The deterministic drill proves:

- restart and duplicate replay preserve the identical projection hash;
- one non-final reorg observation is invalidated additively;
- RPC disagreement and oracle/projection drift freeze Borrow/new risk;
- protective repayment remains available during the local freeze;
- a later zero-discrepancy read does not automatically unfreeze;
- one recovery-owner role is rejected; two distinct role-bound hashes are
  required for the local recovery transition; and
- rollback stops ingestion, preserves Evidence and rebuilds from finalized
  authenticated logs without practicing an onchain pause/unpause transaction.

The two role hashes are non-secret local drill bindings. They are not wallet
signatures, private keys, external assurance or authorization for an onchain
pause/unpause.

## Defects found and repaired

1. The production bootstrap downgrade test attempted to run against the shared
   integration database while append-only Pool Obligation Evidence existed.
   Migration `0065` correctly blocked the destructive rollback. The test now
   uses an isolated database; the protection remains unchanged and the full
   PostgreSQL suite passes 90/90.
2. The secondary RPC had pruned contract state at the historical deployment
   height. Configuration comparison now uses the latest common finalized
   height while deployment identity remains bound to finalized transaction
   receipts. The two-RPC live read then passed.

No unresolved P0 or P1 defect is known at candidate creation.

## Verification inventory

- M2A-009 focused tests: 7/7
- Pool adapter/indexer/reorg tests: 15/15
- Security tests: 34/34
- Tenant/Agent transport tests: 84/84
- PostgreSQL restore/replay tests in the isolated Lima database network: 90/90
- Visible browser click paths: 8/8, including Borrower, Capital Partner, Risk
  and 200-percent zoom
- Base Sepolia fork dry run: 2/2
- Aggregate Node tests: 1173/1173
- Foundry formatting, build, sizes and local contract suites: passed
- Exact local-stack acceptance: passed with 65 migrations, forced RLS, worker
  heartbeat, reconciliation and empty pending outbox
- Git diff whitespace check: passed at report preparation

The repository gate is compositional because the PostgreSQL listener remains
inside the Lima network by design. All non-database checks ran on the host;
the exact PostgreSQL suite ran in the read-only source-mounted Lima test
container. No database listener was widened to make one shell command green.

## Explicitly excluded authority

- mainnet;
- real funds or Human cash lending;
- custody, KYC or PII storage expansion;
- public/production deployment of this candidate;
- Agent venue writes or Hyperliquid execution;
- new chain transactions or reuse of any M2A-008 signer; and
- automatic recovery/unfreeze.

## Closed gates

1. ~~Founder re-signs the exact local SHA and visibly refreshes/reviews the Pool
   action without transaction submission.~~ Completed and recorded in
   `docs/codex/audits/M2A-009/founder-visible-acceptance-and-review-attestation.md`.
2. The Founder accepted the offline review performed with an independently
   participating engineer and waived public identity/report publication for
   this exact M2A testnet/no-funds boundary.
3. PR #53 merged as `ad5cce4c3477cb5732f4601d892e13e223382abe`;
   post-merge CI, exact OCI rebuild, local acceptance and signed visible-click
   recheck passed.

The truthful bounded verdict is `PASS — DEPLOYED AND USER-VERIFIED`.
