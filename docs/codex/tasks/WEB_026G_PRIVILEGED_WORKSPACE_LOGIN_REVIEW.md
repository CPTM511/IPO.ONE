# WEB-026G — Existing privileged workspace login repair proposal

Status: REVIEW REQUIRED — not implemented or activated by WEB-026F.

## Problem and evidence

The local Capital Partner and Risk hosts render the new assets, but do not have an operable wallet login. On the restored real database, an invited synthetic QA wallet gets a valid challenge and then `authentication_role_rejected` on both hosts. These remain fixtures-only Founder previews, not verified authenticated workspaces.

The selected-role model in migration 0063, wallet transaction stores, Human wallet BFF, role enrollment resolver, options route and UI supports only Human Borrower / Principal Controller. Local startup still seeds separate Capital Partner and Risk credentials, which that sign-in path cannot select. Moving navigation or changing frontend labels alone cannot resolve the database and authentication constraints.

## Proposed bounded correction

Keep public self-service restricted to the two existing ordinary roles. Design an explicit pre-enrolled privileged sign-in path for local invited Capital Partner and Risk operators. The server must bind the exact tenant, host/client, credential, membership and one role before issuing a session. No role union, self-service privileged provisioning, browser-assigned role, new capability or bypass of current authority checks is allowed. Disabled/unconfigured login must explain its reason and recovery visibly.

## Likely files

`modules/authentication/src/{human-wallet-bff,postgres-human-authentication,wallet-login-transaction-store}.js`, `apps/tenant-api/src/{human-access-routes,postgres-human-access-composition}.js`, `apps/private-pilot/src/{private-pilot-runtime,private-pilot-database}.js`, selected-role migrations, and the existing access UI. Determine whether to extend the versioned selected-role schema or implement a distinct pre-enrolled path; record the ADR before writing a migration.

## Acceptance / test commands

Actual visible wallet login reaches Capital Inbox and Risk Queue. Refresh/re-login/restart recover the same authorized workspace. An ordinary public wallet cannot obtain either role by choosing a button, editing a request, replaying a signature or switching hosts. Revocation, role downgrade, tenant mismatch, expired enrollment and capability union fail closed. Existing Human/Principal login remains unchanged. Run security, transport, PostgreSQL and visible browser tests against one exact source SHA, then Founder acceptance.

## Authority / migration / rollback

This changes selectable authentication roles and possibly database constraints, beyond WEB-026F's explicit 0071–0073 reconciliation. AGENTS.md requires human review for permission changes. The current proposal is concrete review material and grants no new privilege or deployment permission. Preserve the completed WEB-026F backup/restore boundary; prepare an additive migration on an isolated copy, verify a rollback-compatible baseline, and do not mutate real-value/cloud profiles.

## Completion

BLOCKED — NOT COMPLETE. No management-role login is represented as operational. Implementation, migration, exact local activation and user verification remain outstanding.
