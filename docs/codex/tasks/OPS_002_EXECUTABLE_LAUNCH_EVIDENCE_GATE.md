# OPS-002: Executable Launch Evidence Gate

Status: Implemented locally for repository review. It grants no deployment or
production permission.

## Context

OPS-001 established a fail-closed public-sandbox runtime and a proposed GCP
boundary. The hosted checklist still depended on prose and could not reject a
stale approval, wrong commit, mutable image, missing gate, capability
escalation, or an evidence file that attempted to authorize a locked profile.

## Scope

- Add a versioned machine-readable release policy for public sandbox, closed
  non-funds pilot, and controlled Agent credit pilot boundaries.
- Keep private-data and real-value profiles policy-locked pending their named
  implementation and human approvals.
- Add a closed JSON evidence contract and canonical parser that rejects
  duplicate keys and non-canonical review representations.
- Require exact commit SHA, immutable image digest, immutable CI run, bounded
  approval age/expiry, explicit capability flags, every named gate, and a
  protected-environment authorization reference.
- Add a CLI that verifies private release evidence without granting access.
- Add positive and negative tests plus a committed pending template that must
  fail verification.

## Non-Goals

- No GCP, GoDaddy, GitHub Environment, IAM, DNS, or deployment mutation.
- No AuthN, tenant, RBAC, real funds, KYC/KYP, custody, Human lending, external
  Provider execution, or production database activation.
- No claim that a JSON file is a cryptographic approval or system of record.
- No committed approver identity, customer data, secret, credential, or token.

## Likely Files

- `deploy/launch-policy.v1.json`
- `deploy/launch-evidence.v1.schema.json`
- `deploy/approvals/public-sandbox.pending.json`
- `packages/release-governance/*`
- `scripts/check-launch-policy.mjs`
- `scripts/verify-launch-evidence.mjs`
- `package.json`
- deployment and launch-readiness documentation

## Acceptance Criteria

- The current public-sandbox profile can pass only with complete fresh
  synthetic evidence in tests.
- The committed pending template fails closed.
- Closed private and real-value profiles fail even if all evidence fields are
  syntactically approved.
- Missing, extra, duplicate, stale, future, expired, placeholder, wrong-owner,
  wrong-SHA, mutable-image, unsafe-URL, and capability-escalating inputs fail.
- Passing output contains release identity and gate count but no approval body,
  token, private customer data, or secret.
- Repository quality and deployment checks include the policy contract.

## Test Commands

```sh
pnpm run check:launch-policy
pnpm run launch:verify -- --evidence <private-file.local.json> \
  --profile public_sandbox --expected-sha <exact-green-sha>
pnpm run check
```

## Security Checklist

- [x] Evidence and policy objects are closed and size-bounded.
- [x] Canonical JSON rejects duplicate-key review ambiguity.
- [x] Approval age and expiry are bounded by policy.
- [x] URLs reject embedded credentials and credential-like query parameters.
- [x] Image references require a digest and release identity requires exact SHA.
- [x] Private-data and real-value profiles remain policy-locked.
- [x] Passing validation is documented as necessary, never sufficient.
- [x] No external permission or deployment is changed.
