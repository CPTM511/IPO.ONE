# PILOT-003 Audit — Server-truth workspace recovery

Date: 2026-07-17

Result: Passed for the local synthetic no-funds private pilot.

## Evidence

- `pilotReadWorkspaceResume` is the 35th closed private Tenant operation and is
  exposed only to the fixed Human Borrower and Principal Controller roles.
- The empty caller payload cannot select Tenant, Actor, role, resource, or
  relationship. The verified Authentication Context supplies Tenant and Actor.
- One parameterized PostgreSQL query joins active Actor bindings to active
  authorization resources, permits five fixed resource types, sorts
  deterministically, and returns at most 32 references.
- The response contains only resource type, opaque resource ID, reviewed
  relationship, workspace kind, server-truth flag, and schema version. It contains no
  PII, KYC, credential, claim, Evidence payload, economics, or authority.
- Browser storage is now only a convenience cache: the UI hydrates existing
  resources from PostgreSQL and then reuses the existing exact-resource reads.
- The operation is absent from the public API and Agent MCP registry and cannot
  mutate lifecycle state or move funds.

## Verification

- Workspace handler tests: 3 passed, including cap, role ambiguity, caller
  scope injection, and invalid durable-row rejection.
- Tenant protocol gate: 35 operations, 51 request fixtures, 42 result fixtures,
  8 handoff fixtures, 3 capability manifests plus 8 invalid mutations, and 5
  workflow receipts plus 33 invalid mutations.
- Full repository gate: passed; 317 tests, 46 schemas, 21 OpenAPI operations,
  and 23 ordered migration pairs.
- Real Human browser: after clearing `localStorage` and `sessionStorage`, reload
  restored the same Subject and Consent and displayed the authenticated
  PostgreSQL server-truth recovery state.
- Real Principal browser: a fresh loopback origin restored the bound Agent
  Subject and active Mandate from PostgreSQL server truth.
- Risk browser regression: private Gateway connected; console reported zero
  errors and zero warnings.

## Residual gates

This closes workspace continuity for the local pilot only. Production Human
IdP and workload Credentials, protected remote transport/deployment, backup and
disaster recovery, named operators and incident ownership, external security/
privacy/legal review, Provider/capital/custody integrations, live chain
certification, and every real-value permission remain closed.
