# WEB-026F — Local no-funds runtime reconciliation

Status: REVIEW REQUIRED — no runtime, migration or credential mutation authorized by WEB-026.

## Context and evidence

WEB-026 UI source `12675dd` passes 24 workspace browser tests plus one public lifecycle/Whitepaper test, 203 web unit tests and 91 transport tests. Its independent synthetic review hosts remain available on 4191–4195.

The existing durable local service on 8895–8898 is container `ipo-one-pilot008a-review`, started 2026-08-29T12:14:10Z. Its image revision is `5a15daad...`, but `/app` is a mutable mount of a different worktree. Mounted HEAD is `4bdbabb7ac3782ce80e4c4b7df4f8f8abc5d8d90`, committed September 3. A changed private runtime file also postdates process start. There is no exact release environment value. Image revision is therefore not proof of loaded application source.

The database ends at `0069_auth_reference_hash_key_rotation`. Current mounted code automatically calls `migrateUp()` on startup. A restart would apply:

| Migration | Reviewed source intent | Additional impact requiring runtime review |
| --- | --- | --- |
| 0070_pilot_cases | Append-only cases/corrections and Tenant ownership | New durable case tables and policies |
| 0071_pilot_cases_runtime_privileges | Copy previously reviewed analogous CRUD grants to existing roles | Runtime database permissions |
| 0072_public_beta_self_service_identity | Narrow function for ordinary Human wallet enrollment | Identity / role provisioning boundary |
| 0073_metered_usage_evidence | Immutable synthetic usage and deterministic admission receipts | New Metered Evidence storage / permissions |

The post-August backend also loads local synthetic metered-provider material. Missing local material must not be silently created under this UI task. No external Provider integration is implied. Source changes between the image revision and mounted HEAD span authentication, authorization, persistence and execution; this is not a static-asset-only restart.

## Concrete proposed scope for a separately approved increment

1. Select one canonical immutable local backend SHA, preferably the latest approved functional base with WEB-026 presentation. Verify exact startup code, migration checksums, authentication grants and local synthetic profile against current guidance.
2. Inventory existing local configuration by presence/hash only. Reuse existing auth invitation and secrets; list any missing synthetic-only material for explicit review. No credential contents in evidence.
3. Back up the existing local PostgreSQL database and record a tested restore procedure in protected ignored storage before applying changes. Establish a maintenance window for the local ports and preserve the original runtime definition.
4. Validate all four migrations and permissions against a disposable copy first. Run applicable authentication/RLS, case, metered-Evidence and full Human/Agent persistence regression. Review diffs/results before applying to the existing local database.
5. Start the approved immutable candidate, then validate actual login, bootstrap, visible actions, denial paths, logout/login, process restart and durable server recovery. The Founder signs their own wallet login when required.
6. Keep the clickable local experience alive. Record CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED separately; local acceptance grants no cloud/production authority.

## Non-goals and permission boundary

No cloud deployment, mainnet, real funds, new economic rules, expanded Agent authority, external credentials, new KYC/provider vendors or cross-Tenant access. Do not treat `按你的建议来` for the UI alignment as approval to update identity or database privileges. These changes require human review under AGENTS.md: “Contracts, funds movement, risk controls, permissions, privacy boundaries, production dependencies, and deployment changes require human review.”

## Likely files and commands

Inspect current `apps/private-pilot`, `modules/authentication`, `modules/authorization`, `db/migrations/0070*` through `0073*`, `deploy/local`, and `scripts/local-stack.mjs`. Preserve protocol/schema authority; do not author substitute migrations merely to make the UI work.

Read-only diagnosis: `node scripts/web026-local-candidate.mjs audit`.

Required applicable checks include `pnpm run test:security`, `pnpm run test:transport`, `pnpm run test:postgres`, `pnpm run check:migrations`, `pnpm run check:local-stack`, `pnpm run test:browser:click-path`, and authenticated real-service browser acceptance. No command listed here grants execution authority over the existing database.

## Acceptance and rollback

Given an approved immutable candidate, when an authenticated Human or Principal follows visible controls, results must come from the actual server and survive refresh, re-login and applicable process restart. Duplicate requests must not duplicate mutations. Denied or unknown authority must fail closed. Agent operations must use the same versioned authorized protocol and queryable receipts.

Rollback restores the reviewed previous runtime plus matching database snapshot where schema/data compatibility requires it. Do not use destructive down migrations as an unreviewed shortcut. Restore must be proven in isolation before the existing local database changes.

## Completion evidence

Current verdict: BLOCKED — NOT COMPLETE. No container was created, stopped, restarted or replaced; no migration ran and no credential was created during WEB-026. The original local service and old WEB-012B review remain running. Audit output: main worktree `output/playwright/web-026-runtime/audit.json`.
