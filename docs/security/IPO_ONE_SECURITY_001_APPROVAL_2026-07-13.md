# IPO.ONE SECURITY-001 Approval Record

Date: 2026-07-13
Status: Approved for local non-funds implementation only
Decision pack: `IPO_ONE_TENANT_AUTHORIZATION_DECISION_PACK_v0.1.md`

## Approved Decisions

The project owner approved SECURITY-001 v0.1, SEC-D01 through SEC-D09, for
local non-funds implementation.

| Field | Recorded value |
| --- | --- |
| Pilot jurisdiction | United States |
| Legal retention owner | IPO Consulting |
| Human IdP vendor | Unselected; remains a deployment gate |
| Break-glass custodians and review owner | Unselected; remains a deployment gate |

## Authorized Scope

- Local Tenant, Actor, Membership, AccessGrant, authentication-contract,
  authorization, dual-control, audit, resource-control, and durable command
  implementation.
- Deterministic local test issuers, synthetic tenant fixtures, PostgreSQL RLS,
  negative tests, and non-funds Human/Agent interface integration.
- Public no-real-funds sandbox infrastructure only under a separate deployment
  approval and executable release-evidence gate.

## Explicitly Not Authorized

- Real funds, custody, lending, production credit, Human credit, or capital.
- Production KYC/KYP or raw PII processing.
- Production IdP/client credentials, signing keys, break-glass elevation, or
  privileged production roles.
- Provider execution, payment execution, chain contracts, wallet custody, or
  arbitrary withdrawals.
- Private-data or real-value launch-policy activation.

Any production identity, credential, permission, private-data, fund, KYC/KYP,
or deployment activation still requires its named approval and evidence.
