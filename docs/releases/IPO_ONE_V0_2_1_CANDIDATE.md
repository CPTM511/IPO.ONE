# IPO.ONE v0.2.1 local release candidate

Candidate: `M2B-005-V0.2.1-RC-20260826-001`

Release version: `0.2.1-rc.1`

Implementation SHA: `fd7ae2c06672dbee5aeb8becaf7dada4f8f1cfa7`

Verdict: `BLOCKED — NOT COMPLETE`

## Outcome

The v0.2.1 local engineering candidate is exact, reproducible and ready for
independent review and Founder candidate decision. It binds the Draft stacked
M2B-001 through M2B-004 commits, all 68 migrations, canonical terminal/loss
Evidence, historical M2A Testnet identity and the existing Base Pool and Venue
signer-closure records.

The candidate is not a remote/public deployment. It does not enable external
Agent execution, reuse or create a signer, send a Pool or Venue request, move a
Testnet asset, or authorize mainnet, real funds, custody, transfer or
withdrawal.

## Product truth

| State | Exact result |
| --- | --- |
| CODE | `EXACT_SHA_IMPLEMENTED` |
| RUNTIME | `LOCAL_EXACT_SHA` |
| DEPLOYED | `M2B_NOT_REMOTELY_DEPLOYED` |
| REACHABLE | `LOOPBACK_ONLY` |
| VERIFIED | `LOCAL_BROWSER_AGENT_RECOVERY` |

Historical Base Sepolia Pool and Adapter contracts remain M2A evidence only.
They are not evidence that the M2B Agent product or v0.2.1 candidate is
deployed.

## Verification

- 1,201 repository JavaScript tests passed; 0 failed, 0 skipped.
- 91 PostgreSQL tests passed against an isolated local VM test database.
- 34 security and 85 API/SDK/MCP transport tests passed.
- 25 Foundry tests passed; 2 live-fork tests remained deliberately skipped.
- 143 JSON Schemas, 21 OpenAPI operations, 109 Tenant operations and 68
  ordered migration pairs passed.
- Deployment topology, local stack, launch policy, closed-pilot operations,
  M2 contract toolchain and web-bundle checks passed.
- Real-browser visible-click acceptance passed all three Human actions:
  exact-candidate verification, read-only recovery drill and Agent release
  receipt. The browser reported 0 console errors and 0 warnings.

`check:product-traceability` remains a pre-existing baseline blocker. It reports
stale launch-policy and closed Tenant-catalog accounting. M2B-005 changes no
launch profile or Tenant operation catalog and does not claim to repair that
separate release obligation.

## Recovery and signer closure

The deterministic recovery receipt has projection hash
`4c6447f53a1be4c525657827cb51336e59fb5448fcc0acdb92be30a6f1f4fc24`.
It preserves canonical repayment, Outcome and Credit State across replay,
preserves the partial loss, freezes new risk on failure and leaves automatic
unfreeze disabled.

No signer was created, loaded, reused or invoked. The checker only verifies
digest-bound prior closure Evidence. Existing retired signer addresses remain
non-reusable.

## Remaining gates

1. Independent security review of the exact candidate remains `PENDING`.
2. Founder v0.2.1 candidate decision remains `PENDING`.
3. Any remote deployment requires a separate exact deployment authorization.
4. Any external Agent, signer, Pool/Venue write, Testnet asset movement,
   mainnet or real-value operation requires its own later gate.

## Rollback

Disable the local candidate profile and release-review runtime, keep all
external writes disabled, preserve canonical economic and Evidence truth, and
reconcile read-only. Never retry an unknown external outcome or reuse a retired
signer.

## Review experience

Founder/Risk local review: `http://127.0.0.1:4178/`.

This loopback URL is a local product experience, not a hosted, public,
production or real-value endpoint.
