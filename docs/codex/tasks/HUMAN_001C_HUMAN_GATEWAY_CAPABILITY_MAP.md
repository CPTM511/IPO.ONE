# HUMAN-001C: Human Self-Service Gateway Capability Map

Status: Permission boundary approved by the project owner on 2026-07-15;
local implementation and verification are complete. Approval grants only the role, capability, and
local Gateway surface documented below. It does not approve an endpoint,
deployment, production identity, credit decision, funds, or custody authority.

## Context

HUMAN-001A/B now provide durable sandbox Consent and synthetic KYC/VC Identity
Reference objects, but no authenticated Human can operate them through the
Tenant Gateway. Product Charter v1.1 requires Human and Agent entry modes to
converge on the same credit kernel. The existing Human Actor fixtures use the
`developer` role, whose Agent/Mandate permissions are not an acceptable
borrower permission model. Extending every Developer would silently broaden
authority, while reusing Agent capabilities would make audit meaning
ambiguous.

This issue proposes a dedicated least-privilege Human Borrower role before any
permission code is changed. Under the repository guidance, this map requires
named human approval.

## Approved Role

`human_borrower`

The role is assignable only to an authenticated `ActorType.HUMAN`. It receives
no Tenant administration, Agent creation, Mandate management, Provider, Risk,
Operations, audit export, worker, production identity, contract, capital,
custody, or funds capability.

## Approved Capabilities

| Capability | Purpose | Reuse/New |
| --- | --- | --- |
| `human_subject.create.self` | Create one synthetic Human Subject bound to the authenticated Human Principal | New |
| `subject.read.self` | Read the exact owned Human Subject | Existing, currently used by Agent self-read |
| `consent.create.self` | Create one bounded sandbox Consent for the owned Human Subject | New |
| `consent.read.self` | Read owned Consent summaries and immutable terms/data hashes | New |
| `consent.revoke.self` | Withdraw one owned active Consent with reason and Evidence | New |
| `identity_reference.read.self` | Read bounded synthetic reference metadata, never claims or payloads | New |

`credit.request` is deliberately excluded from this issue. It will be proposed
in CREDIT-001C only after the Human Gateway can resolve current Consent and
Identity Reference state inside the same serializable transaction.

## Approved Gateway Operations

| Operation | Kind | Resource / ownership | Capability | Live checks |
| --- | --- | --- | --- | --- |
| `pilotCreateHumanSubject` | Idempotent mutation | New `subject`; server binds authenticated Human as owner | `human_subject.create.self` | Membership, Principal uniqueness, one self Subject |
| `pilotReadHumanSelf` | Query | Owned `subject` | `subject.read.self` | Subject state; bounded Consent/reference summaries |
| `pilotCreateConsent` | Idempotent mutation | Owned `subject` | `consent.create.self` | Subject/Principal state; sandbox terms and validity |
| `pilotReadConsent` | Query | Owned `consent` | `consent.read.self` | Object ownership and Tenant RLS |
| `pilotRevokeConsent` | Idempotent mutation | Owned `consent` | `consent.revoke.self` | Active Consent; reason `human_withdrawal` |
| `pilotReadIdentityReference` | Query | Owned `human_identity_reference` | `identity_reference.read.self` | Exact Human/Consent ownership; bounded metadata only |

All mutations remain `fundsAuthority = false`, `productionCreditEnabled =
false`, and `humanCreditEnabled = false`. No public anonymous route is added.

## Required Implementation After Approval

- Add `RoleBundle.HUMAN_BORROWER` and the five new capabilities to the closed
  authorization constants and membership schema.
- Add exact deny-by-default authorization policies and abuse-control classes
  for the six proposed operations.
- Add Human-only Gateway handlers, clients, protocol request/result/catalog
  branches, conformance fixtures, and durable PostgreSQL tests.
- Create one deterministic `PrincipalType.HUMAN_SELF` per Tenant/Human Actor and
  one self-owned Human Subject; concurrent duplicates must converge or fail
  without partial state.
- Require current object ownership, forced RLS, idempotency, audited allow/deny,
  restart replay, and TOCTOU revalidation.
- Return only bounded references/hashes/status/timestamps; reject raw PII/KYC,
  arbitrary URLs, claims, credentials, and unknown fields before authorization.

## Non-Goals

- No `credit.request`, Offer acceptance, Obligation creation, payment,
  collection, wallet signature, chain transaction, real KYC provider, raw PII,
  legal contract, capital, custody, or real funds.
- No Developer-to-Borrower permission inheritance and no Agent capability reuse
  except the already generic `subject.read.self` read capability.
- No public endpoint or production deployment.

## Approval Gate

The project owner approved all three points in the current Codex task on
2026-07-15:

- [x] Approve the dedicated `human_borrower` role rather than extending
  `developer`.
- [x] Approve the six-capability surface and the deliberate exclusion of
  `credit.request` until CREDIT-001C.
- [x] Approve the six local Tenant Gateway operations with no authenticated
  HTTP/MCP exposure and no production/funds authority.

## Acceptance Criteria After Approval

- [x] A Human Borrower can create and read only their own synthetic Human
  Subject, with concurrent duplicate creation bounded and idempotent.
- [x] The Human can create, read, and revoke only owned Consent and read only
  owned synthetic Identity Reference metadata.
- [x] Developer, Agent, Risk, Operator, Auditor, other Human, and cross-Tenant
  access fail closed unless separately authorized by an existing policy.
- [x] Catalog, handler, authorization, abuse-control, schemas, fixtures, SDK
  types, audit, RLS, restart, reconciliation, and migration gates agree exactly.
- [x] No raw PII/KYC, production identity, public endpoint, real credit, or fund
  capability is introduced.

## Implementation Progress

- [x] Approval is recorded as a three-layer boundary: dedicated role, six
  capabilities, and six local Gateway operations.
- [x] `RoleBundle.HUMAN_BORROWER` is Human-only and contains exactly the six
  approved capabilities; `credit.request` remains excluded.
- [x] All six operations have closed authorization policies, allow/deny audit
  requirements, Actor ownership rules, idempotency where mutating, and exact
  abuse-control classifications.
- [x] Membership schema and both in-memory and PostgreSQL membership readers
  reject an Actor/role mismatch.
- [x] Authorization, abuse-control, schema, policy-drift, and full unit checks
  pass locally.
- [x] `pilotCreateHumanSubject` and `pilotReadHumanSelf` are implemented across
  the Tenant protocol, handlers, Human client, conformance fixtures, durable
  projections, authorization-resource ownership, and bounded summary reads.
- [x] Fresh PostgreSQL 17 integration proves exact replay, concurrent duplicate
  convergence, one Subject/Principal per Actor and Tenant, same-Tenant and
  cross-Tenant denial, Developer denial, RLS, restart-safe reads, immutable
  Evidence, and clean reconciliation.
- [x] `pilotCreateConsent`, `pilotReadConsent`, `pilotRevokeConsent`, and
  `pilotReadIdentityReference` are implemented as Human-only, owned-resource
  operations with durable projections, live-state revalidation, exact replay,
  bounded summaries, and no authorization-resource closure on Consent
  revocation so the immutable audit record remains readable.
- [x] The private Tenant protocol, Human client, TypeScript declarations,
  catalog, closed request/result schemas, and conformance fixtures now agree on
  all 13 local non-funds operations.
- [x] Fresh PostgreSQL 17 integration proves Consent replay, concurrent
  duplicate convergence, same-Tenant and cross-Tenant isolation, Developer
  denial, irreversible withdrawal, post-revocation audit reads, synthetic
  Identity Reference minimization, RLS, restart safety, and clean
  reconciliation.

Current local evidence: `pnpm run check` passes 185 tests, 28 schemas, 12
migration pairs, 35 authenticated operation classifications, and the
13-operation Tenant protocol. `pnpm run test:postgres` passes 51 PostgreSQL
17 integration tests from an empty database. The shell is running Node.js 26
and therefore emits the repository engine warning; review must rerun on Node.js
24.18.x.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```
