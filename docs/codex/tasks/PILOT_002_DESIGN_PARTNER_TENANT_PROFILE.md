# PILOT-002 — Design-partner Tenant profile

Status: Implemented locally

## Context

The shared Human/Agent no-funds lifecycle is operable, but the private launcher
previously hard-coded one Tenant and four Actor identifiers. A closed pilot
needs repeatable, reviewable Tenant provisioning before production identity or
remote transport is considered.

## Scope

- add a strict versioned Tenant profile for the Borrower, Principal Controller,
  Agent Runtime, and Risk Operations workspaces;
- keep role bundles and capabilities in reviewed code rather than caller data;
- bind database memberships, RLS resources, authentication contexts, and Agent
  account derivation to the selected Tenant;
- provision an opaque synthetic Tenant root without asserting a real
  organization, jurisdiction, or retention owner;
- provide a PII-free example and one-command profile validation;
- preserve the existing default local profile.

## Non-goals

- production IdP or Credential provisioning;
- public or remote private transport;
- private customer data, KYC, custody, capital, or real funds;
- deployment, legal, security, privacy, or risk approval.

## Likely files

- `apps/private-pilot/src/private-pilot-profile.js`
- `apps/private-pilot/src/local-pilot-identities.js`
- `apps/private-pilot/src/private-pilot-database.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- `deploy/private-pilot/tenant-profile.example.json`

## Acceptance criteria

- a valid profile provisions one opaque Tenant and four distinct Actor IDs;
- unknown fields, duplicate JSON keys, duplicate actors, remote access, or real
  funds fail closed;
- capabilities cannot be supplied through the profile;
- Agent accounts are stable within a Tenant and distinct across Tenants;
- the existing default Tenant retains its prior stable Agent account derivation;
- default local launch behavior remains compatible;
- the profile validator emits only a bounded PII-free summary.

## Test command

```sh
pnpm run pilot:profile:check -- deploy/private-pilot/tenant-profile.example.json
node --test apps/private-pilot/test/private-pilot-foundation.test.js
pnpm run check
```

## Security checklist

- [x] No credential, key, token, raw identity claim, or PII field exists.
- [x] Permission and role assignment remain closed reviewed code.
- [x] Synthetic-only, local-only, and no-funds flags cannot be relaxed.
- [x] Tenant IDs are applied to authentication, RLS, resources, and Agent keys.
- [x] Strict JSON rejects duplicate and unknown fields.
- [x] This issue creates no remote route or production authority.
