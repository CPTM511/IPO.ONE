# M1-B Known Limitations

Status: `OPEN_PENDING_EXACT_ACCEPTANCE_EVIDENCE`

This list describes the unsealed M1-B implementation branch. It is not an RC
known-gaps list or a production-readiness claim.

Deployment-specific items below are conditional limitations, not mandatory
M1-B closure blockers. The Founder amendment explicitly permits
`deployment_pending` when it carries no deployed SHA, surfaces, or hosted
browser rows.

## Current M1-B limitations

1. If exact-candidate deployment acceptance is performed, the invited-wallet
   flow still needs proof against that exact Vercel deployment.
2. If exact-candidate deployment acceptance is performed, an authenticated
   browser trace is still needed for its primary Vercel URL.
3. Vercel/Neon deployment identifiers, migration/seed output, and deployed
   logs remain absent while deployment is explicitly pending.
4. The full privileged `REQ-UX-004` Risk/Operations journey is deferred by the
   Founder release-closure amendment to `M1_C_L2_CLOSED_NO_FUNDS`, where it
   requires a separately approved phishing-resistant OIDC or WebAuthn
   topology. M1-B still lacks the exact-candidate, post-restart split-provenance
   receipt: an exhaustive exact-source/policy regression proving all 21 current
   recent-MFA operations fail closed for server-trusted SIWE-only contexts,
   plus a real fresh SIWE runtime session proving the exposed protected read and
   valid protected mutation attempt both deny with zero state change, economic
   effect, or fallback. It must not claim that all 21 were live attempts.
5. `REQ-UX-005` has durable PostgreSQL tests and local signed-in UI evidence;
   deployed fresh-browser and cold-Function recovery proof remains conditional
   on selecting deployment acceptance.
6. `REQ-CREDIT-009` has event/replay/PostgreSQL parity tests; Neon projection
   proof remains conditional on selecting deployment acceptance, while exact-
   candidate local binding is still required.
7. Vercel Cron requires a production target; that Vercel label is not evidence
   that IPO.ONE is a production financial service.
8. Neon Free can scale to zero, so cold database requests can have additional
   wake-up latency.
9. The retained local database contains one historical `credit_line.v1`; the
   current code correctly fails closed and does not rewrite that audit state.
10. The Vercel-specific Agent authentication path uses existing asymmetric
    access JWT and DPoP semantics because Vercel is not a trusted mTLS
    terminator. This path is locally tested but not yet deployed and evidenced.
11. A Risk/Admin Vercel origin must not be created, exposed, or promoted for
    M1-B while the required strong-MFA topology is unavailable. Current M1-B
    hosted Evidence is primary-only when deployed; a pending deployment must
    claim no deployed SHA. A privileged Risk origin is an M1-C decision.
12. The v2 live-negative attempt receipt keeps the exact safe request,
    supporting critical-artifact links, denial audit, zero-effect counters, and
    equal protected-state digests, but it does not persist Tenant, actor, client,
    or session identifiers and does not expand the protected-state manifest.
    The exact-image producer verifies those bindings through the application
    role before sealing the receipt; the later file verifier cannot independently
    recompute the repository idempotency key or re-identify the session from the
    receipt alone. Expired-Offer state is additionally cross-bound to its sealed
    setup digest; the unauthorized-subject and cross-role digests remain opaque.
13. The expired Human Offer setup intentionally omits the raw `disclosureRef`.
    The same-origin collector recomputes the complete wallet acknowledgement and
    action payload before capture, while the later file verifier independently
    rechecks the exact Offer/terms/resource, wallet method, denial, and no-signature
    persistence/no-chain-submission flags. It must not claim to rederive the
    disclosure-bearing acknowledgement from the redacted artifact.

## Deferred or absent by design

- Protocol fees are disabled; `REQ-PAY-002` remains deferred.
- Full Human dispute/appeal and controlled-pilot operations remain deferred.
- Broader Capital Partner marketplace expansion remains deferred, but the
  existing synthetic authenticated workspace, Passport review, Offer
  author/replace/withdraw flow, stale-Offer denial, and borrower recovery of
  only the current PostgreSQL Offer remain required M1-B acceptance Evidence.
- External account Evidence remains read-only.
- No signer, order, transaction, transfer, withdrawal, custody, venue write,
  real KYC, real funds, mainnet, public signup, new chain, or production
  lending authority exists.

## Non-blocking technical observation

`pg@8.22.0` reports a deprecation warning in one concurrent query path. The
verified behavior remains correct in the current tests. A broad concurrency
refactor is outside M1-B and is not authorized.
