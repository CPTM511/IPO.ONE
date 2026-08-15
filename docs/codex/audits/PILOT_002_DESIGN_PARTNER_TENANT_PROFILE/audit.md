# PILOT-002 Audit — Design-partner Tenant profile

Date: 2026-07-17

Result: Passed for local synthetic no-funds Tenant provisioning.

## Evidence

- `private_pilot_tenant_profile.v1` is a closed contract with exactly four
  opaque Actor identifiers and fixed synthetic/local/no-funds controls.
- Profile data cannot carry roles, capabilities, credentials, keys, private
  identity claims, Provider authority, remote access, or funds authority.
- Authentication contexts, PostgreSQL memberships, forced-RLS resources, and
  the Agent account derivation are bound to the selected Tenant.
- Distinct Tenant IDs derive distinct Agent accounts from the same local secret,
  reducing cross-pilot account correlation.
- The original default Tenant retains its v1 account derivation, so existing
  bindings and completed lifecycle records do not drift after this upgrade.
- `pilot:profile:check` validates the checked-in design-partner example and
  emits no Actor IDs or credential material.

## Verification

- Private-pilot tests: 8 passed.
- Profile validator: passed for
  `deploy/private-pilot/tenant-profile.example.json`.
- PostgreSQL runtime: custom Tenant provisioned with forced-RLS application
  role, started three loopback workspaces, returned the Tenant-bound Agent
  address, and closed cleanly.
- Full repository gate: passed; 314 tests, 46 schemas, 21 OpenAPI operations,
  23 migration pairs, and 34 private Tenant operations.

## Residual gates

This is a provisioning foundation, not a protected deployment approval.
Production IdP/Credential provisioning, remote authenticated transport,
distributed edge/quota control, backup/restore, named operators and incident
owners, legal/security/privacy review, and all real-value authority remain
closed.
