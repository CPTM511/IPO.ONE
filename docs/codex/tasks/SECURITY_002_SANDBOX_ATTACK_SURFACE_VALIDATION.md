# SECURITY-002: Sandbox Attack-Surface Validation

Status: Implemented local launch candidate; hosted edge gate remains open
Date: 2026-07-11

## Context

The public beta needs a repeatable security claim that is narrower and more
honest than “no vulnerabilities.” Existing protocol checks covered business
invariants, but the live HTTP process still needed explicit resource, parser,
method, media-type, path, and retained-state attack tests.

## Scope

- Publish a sandbox-specific threat model and trust boundaries.
- Harden HTTP parsing, methods, media types, request targets, body structure,
  static-file containment, identifiers, timeouts, and resource budgets.
- Serialize same-session operations and bound retained mutation history.
- Add a live adversarial suite covering malformed HTTP and hostile API input.
- Add the suite to the immutable, read-only GitHub quality workflow.
- Keep all controls no-real-funds and dependency-light.

## Non-Goals

- No production AuthN, tenant, RBAC, KYC/KYP, custody, fund movement, wallet
  signature verification, cloud edge, TLS termination, or deployment approval.
- No claim of formal verification, independent penetration testing, or zero
  unknown vulnerabilities.
- No application limit may be represented as a replacement for hosted edge
  DDoS protection.

## Likely Files

- `apps/api/src/server.js`
- `packages/api-contract/src/index.js`
- `packages/domain/src/validators.js`
- `security/test/server-security.test.mjs`
- `.github/workflows/quality.yml`
- `docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`
- `SECURITY.md`
- `README.md`

## Acceptance Criteria

- [x] Unsafe methods, media types, encodings, targets, JSON roots, unknown
  fields, prototype keys, and over-limit values fail with closed Problem Details.
- [x] Request bytes, target length, JSON complexity, amount width, headers,
  timeouts, connections, concurrency, process request rate, sessions, and
  mutations are bounded.
- [x] Same-session API operations are serialized and different sessions remain
  isolated in the tested process.
- [x] Encoded path traversal and hostile Host input cannot expose repository files.
- [x] Unexpected errors remain redacted and unsafe correlation IDs are replaced.
- [x] CI runs the adversarial suite in addition to protocol, PostgreSQL, smoke,
  demo, migration, schema, OpenAPI, and dependency gates.
- [x] Residual production and hosting risks are stated as explicit no-go items.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] No secret, raw PII, real credential, or production endpoint introduced.
- [x] No dynamic plugin code or new runtime dependency introduced.
- [x] Error bodies omit stack, filesystem, database, and raw unexpected details.
- [x] Every retained in-memory collection exposed to an anonymous visitor has a
  practical process or workflow bound.
- [x] CI permissions remain `contents: read`; third-party actions use full SHAs.
- [ ] Hosted TLS, edge abuse controls, origin policy, monitoring, rollback, and
  incident ownership approved by Founder/CTO/Security.
- [ ] Independent penetration test completed before any private data or value path.

## Local Verification Evidence

Verified on 2026-07-11 against the launch-candidate worktree:

| Gate | Result |
| --- | --- |
| Repository quality | 72/72 database-free tests; 8 schemas; 21/21 OpenAPI paths/operations; 2 migration pairs |
| Adversarial HTTP | 7/7 tests covering headers, methods, media, JSON, values, targets, parser failures, isolation, and state bounds |
| PostgreSQL recovery | 8/8 tests covering migration, atomic rollback, replay conflict, concurrency, outbox, inbox, and restart reconstruction |
| Vertical slice | Fully repaid obligation, zero outstanding/utilized amount, balanced Ledger, finalized and replayable Rail |
| Live SDK/API | Complete workflow settled with stable request/session correlation |
| Browser | Human and Agent modes at 1440x1000 and 390x844; no horizontal overflow; 0 console errors/warnings |
| Supply chain and repository | Frozen install succeeded; production audit reported no known advisories; secret/legacy-host scans and `git diff --check` passed |
