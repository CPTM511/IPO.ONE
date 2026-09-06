# ADR-WEB-027J — Explicit local role and Agent enrollment

Status: Accepted for the isolated WEB-027 local candidate, Founder approval 2026-09-06.

## Decision

Use the existing authentication, membership, Subject and Mandate models. Selected wallet roles include invited Capital Partner and Risk only on explicitly configured loopback hosts. Public self-registration retains exactly Human Borrower and Principal Controller. The one-use signed challenge binds the selected role and exact host; session creation and recovery require the exact live credential, membership and role enrollment. A wallet signature remains SIWE authentication and never claims phishing-resistant MFA.

Rotate active ordinary local credentials under a named WEB-027J generation, preserving actors, owners and domain data. Add only the four owned report operations and five existing owned execution-account operations enumerated in WEB_027J_LOCAL_ACCESS_REPAIR_REVIEW.md. Preserve inactive identities and immutable historical credentials, invalidate old sessions, and record a before/after manifest. Production bootstrap profiles remain unchanged.

Fresh Principals explicitly create a dedicated sandbox Agent with a server-held, scoped durable runtime credential. Account proof, exact Mandate review and activation remain separate. Every lookup binds tenant and controller. Existing Agent workflows and versioned gateway/MCP operations remain the shared protocol.

## Migration and recovery

0076 is additive: selected-role checks and event validation admit the two invited roles. Local provisioning enrolls only already-provisioned active invited identities, never ordinary self-registration. Keep the old runtime/image and candidate-only database backup. Downgrade is guarded when invited enrollment/events exist; prefer a forward-compatible runtime rollback that denies unsupported roles. Do not delete domain history or revive a credential. Runtime activation requires the exact candidate database allowlist and reviewed local flag.

0077 preserves the production ordinary-wallet provisioning contract, adding the exact nine grants only for the allowlisted local database, loopback issuer and named client generation. 0078 stores each local Principal's dedicated Agent runtime metadata and encrypted key material with tenant RLS and immutable ownership; the general application DB role has no access to the encrypted table. Normal credential revocation is durable and cannot be undone by startup.

Retain schema history and the rotated generation on rollback. Use a J-compatible source/image with the local flag and exact host binding. A pre-J image cannot safely be assumed compatible with selected invited roles or the rotated client IDs. Migration downs refuse removal where role/runtime history exists. Never restore old credentials to active or delete an Agent's business records.

The server capability response now uses the closed `wallet_adapter_descriptor.v1` item in the existing list envelope, separate from browser connector descriptors, with all external/funds flags false. The builder includes versioned schemas/API/security/product files and audits their hashes in the installed image. Binding revocation follows the projection's verified original challenge stream, retaining expected-version checks.

## Acceptance

Actual browser clicks and signed test-wallet challenges on durable local services, all four roles, restart/session recovery, JSON/CSV report digests and revocation, execution-account proof/read/revoke, fresh Principal Agent lifecycle and revocation, and cross-owner/role/host denial. Run authentication, transport, security and isolated PostgreSQL regression. Neither local success nor this ADR proves hosted availability.
