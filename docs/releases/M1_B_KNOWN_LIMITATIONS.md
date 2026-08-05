# M1-B Known Limitations

Status: `OPEN_PENDING_DEPLOYED_EVIDENCE`

This list describes the unsealed M1-B implementation branch. It is not an RC
known-gaps list or a production-readiness claim.

## Current M1-B limitations

1. The Founder completed real wallet SIWE in the current local browser, but the
   same invited wallet flow is not yet proven against the exact Vercel
   deployment.
2. No authenticated Playwright trace yet covers the deployed Vercel URL and
   real wallet session.
3. The Vercel/Neon deployment ID, URL, database environment identifiers,
   migration output, seed output, and deployed logs are still pending.
4. `REQ-UX-004` lacks the final deployed Risk/Admin exposure, repayment,
   freeze, and correlated rejected-spend evidence.
5. `REQ-UX-005` has durable PostgreSQL tests and local signed-in UI evidence,
   but still lacks deployed fresh-browser and cold-Function recovery proof.
6. `REQ-CREDIT-009` has event/replay/PostgreSQL parity tests, but still lacks
   proof bound to the deployed commit and Neon projection rows.
7. Vercel Cron requires a production target; that Vercel label is not evidence
   that IPO.ONE is a production financial service.
8. Neon Free can scale to zero, so cold database requests can have additional
   wake-up latency.
9. The retained local database contains one historical `credit_line.v1`; the
   current code correctly fails closed and does not rewrite that audit state.
10. The Vercel-specific Agent authentication path uses existing asymmetric
    access JWT and DPoP semantics because Vercel is not a trusted mTLS
    terminator. This path is locally tested but not yet deployed and evidenced.
11. The Risk/Admin origin is intentionally a second Vercel project. It is not
    yet created or deployed, and both projects must prove the same exact source
    commit and canonical database before M1-B can close.

## Deferred or absent by design

- Protocol fees are disabled; `REQ-PAY-002` remains deferred.
- Full Human dispute/appeal and controlled-pilot operations remain deferred.
- Capital Partner browser expansion remains deferred.
- External account Evidence remains read-only.
- No signer, order, transaction, transfer, withdrawal, custody, venue write,
  real KYC, real funds, mainnet, public signup, new chain, or production
  lending authority exists.

## Non-blocking technical observation

`pg@8.22.0` reports a deprecation warning in one concurrent query path. The
verified behavior remains correct in the current tests. A broad concurrency
refactor is outside M1-B and is not authorized.
