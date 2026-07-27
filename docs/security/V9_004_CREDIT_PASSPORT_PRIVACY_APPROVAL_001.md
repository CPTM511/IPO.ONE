# V9-004 Credit Passport privacy approval 001

Decision ID: `V9-004-PASSPORT-PRIVACY-001`  
Decision: `APPROVED`  
Approver and role: `IPO.ONE Founder`  
Approval timestamp: `2026-07-24T10:00:39.987Z`  
Approval expiry: `2026-09-22T23:59:59.999Z`  
Source branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Approved immutable source

- decision pack:
  `docs/security/V9_004_CREDIT_PASSPORT_PRIVACY_DECISION_PACK_v0.1.md`
- approved SHA-256:
  `427f0a95d52b78e463a50d20c377a36d8893d68f8301fb98b52a5164741bad30`
- approved decision-pack version: `v0.1`

The approved source file remains unchanged so its hash continues to identify
the exact reviewed scope.

## Approved fields

- Issuer type approved: `yes`
- Issuer version approved: `yes`
- Same-Tenant exact-Actor verifier only: `yes`
- Purpose `private_credit_review` only: `yes`
- Human and Agent subject controllers approved: `yes`
- 15-minute default lifetime approved: `yes`
- 24-hour maximum lifetime approved: `yes`
- Existing append-only hash-only Evidence retention interpretation approved:
  `yes`
- Selective-disclosure allowlist approved: `yes`
- Mandatory safety fields approved: `yes`
- No numeric score in v1 approved: `yes`
- Terminal revoke/supersede behavior approved: `yes`
- Four Tenant operations approved: `yes`
- Four AuthZ capabilities approved: `yes`
- One forced-RLS migration approved: `yes`
- No public/cross-Tenant/external artifact confirmed: `yes`
- V9-004 implementation unlocked: `yes`

## Named owners

- Privacy owner: `IPO.ONE Founder`
- Evidence custodian: `IPO.ONE Founder`
- Rollback owner: `IPO.ONE Founder`

## Scope effect

This approval unlocks implementation of V9-004 exactly as bounded by the
approved decision pack. It does not authorize:

- a different issuer, verifier, purpose, lifetime, disclosure set, score,
  permission, operation, migration, retention interpretation, or rollback;
- public, anonymous, bearer, cross-Tenant, external, signed, downloadable, or
  production credentials;
- production underwriting, KYC/PII export, real Human lending, pricing,
  capital, custody, funds, contracts, chain writes, mainnet, external network,
  dependency, deployment, or launch-policy changes;
- V9-005 or any later task.

Expiry of this approval prevents new V9-004 implementation scope from being
added after the deadline. It does not extend artifact lifetime or make an
expired artifact verifiable.
