# WEB-026F — Local no-funds runtime reconciliation

Status: IN PROGRESS — Founder approved the scoped local no-funds reconciliation on 2026-09-05.

## Approval record

After reviewing the concrete WEB-026F proposal and runtime gap, the Founder stated: “好的，我觉得这么看下来应该是可以同意的，这个搞定这些问题。” This authorizes the six local steps below: protected backup, isolated restore and migration/permission validation, reuse of existing local authentication material, preparation of the required synthetic-only material, immutable local service cutover and real-service acceptance. It does not authorize cloud/production deployment, external credentials, mainnet or real funds.

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

The post-August backend also loads local synthetic metered-provider material. Required synthetic-only local material may now be prepared under this explicit WEB-026F approval. No external Provider integration is implied. Source changes between the image revision and mounted HEAD span authentication, authorization, persistence and execution; this is not a static-asset-only restart.

## Approved scope

1. Select one canonical immutable local backend SHA, preferably the latest approved functional base with WEB-026 presentation. Verify exact startup code, migration checksums, authentication grants and local synthetic profile against current guidance.
2. Inventory existing local configuration by presence/hash only. Reuse existing auth invitation and secrets; record any missing synthetic-only material and prepare it only for the existing approved L0 profile. No credential contents in evidence.
3. Back up the existing local PostgreSQL database and record a tested restore procedure in protected ignored storage before applying changes. Establish a maintenance window for the local ports and preserve the original runtime definition.
4. Validate all four migrations and permissions against a disposable copy first. Run applicable authentication/RLS, case, metered-Evidence and full Human/Agent persistence regression. Review diffs/results before applying to the existing local database.
5. Start the approved immutable candidate, then validate actual login, bootstrap, visible actions, denial paths, logout/login, process restart and durable server recovery. The Founder signs their own wallet login when required.
6. Keep the clickable local experience alive. Record CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED separately; local acceptance grants no cloud/production authority.

## Non-goals and permission boundary

No cloud deployment, mainnet, real funds, new economic rules, expanded Agent authority, external credentials, new KYC/provider vendors or cross-Tenant access. The earlier UI alignment alone did not authorize identity/database changes. The subsequent specific WEB-026F approval above supplies the required human review under AGENTS.md: “Contracts, funds movement, risk controls, permissions, privacy boundaries, production dependencies, and deployment changes require human review.”

## Likely files and commands

Inspect current `apps/private-pilot`, `modules/authentication`, `modules/authorization`, `db/migrations/0070*` through `0073*`, `deploy/local`, and `scripts/local-stack.mjs`. Preserve protocol/schema authority; do not author substitute migrations merely to make the UI work.

Read-only diagnosis: `node scripts/web026-local-candidate.mjs audit`.

Required applicable checks include `pnpm run test:security`, `pnpm run test:transport`, `pnpm run test:postgres`, `pnpm run check:migrations`, `pnpm run check:local-stack`, `pnpm run test:browser:click-path`, and authenticated real-service browser acceptance. Commands are bounded by the specific local approval above; destructive integration tests must use an isolated test database.

## Acceptance and rollback

Given an approved immutable candidate, when an authenticated Human or Principal follows visible controls, results must come from the actual server and survive refresh, re-login and applicable process restart. Duplicate requests must not duplicate mutations. Denied or unknown authority must fail closed. Agent operations must use the same versioned authorized protocol and queryable receipts.

Rollback restores the reviewed previous runtime plus matching database snapshot where schema/data compatibility requires it. Do not use destructive down migrations as an unreviewed shortcut. Restore must be proven in isolation before the existing local database changes.

## Completion evidence

Pre-reconciliation verdict: BLOCKED — NOT COMPLETE. Before WEB-026F approval, no container was created, stopped, restarted or replaced; no migration ran and no credential was created during WEB-026. The original local service and old WEB-012B review remain running. Audit output: main worktree `output/playwright/web-026-runtime/audit.json`.


## Executed reconciliation — 2026-09-05

The first read-only audit queried the default database. Docker inspection during the approved repair found duplicate `DATABASE_URL` entries: the final effective value points to `ipo_one_pilot008a_review_20260829a`, already at 0070. The default database was never mutated. The actual effective database was separately backed up/restored and only 0071–0073 were applied after validation. The helper now rejects an unexpected effective database and normalizes duplicate environment keys.

- Protected custom-format backups and role/runtime definitions are under ignored `.ipo-one/web026-runtime/` (directory 0700, files 0600). No credential values appear in repository evidence.
- The actual review backup restored successfully; migration history and authentication/session/table counts matched. A second restore of the cutover backup booted the exact canonical fallback `9636ec2d8edcf93dff8b5c73da83d5899b80b988` on isolated ports 8925–8928, with compatible forward migrations 70 → 73. The old mutable process is not claimed to be exactly reconstructible.
- 95/95 PostgreSQL tests, 35/35 security tests, 91/91 transport tests, migration/static local-stack checks passed. Three added tables force RLS; application/authentication roles retain safe flags and authentication cannot read cases. Agent catalog accepts a valid proof and rejects missing/replayed proofs.
- The restored-copy browser used a generated isolated test wallet, real signatures and real services with no API mocks. Visible Human request → accept → execute → repayment passed. Clear browser storage, refresh, logout/login and process restart recover the same server record. Principal login recovers Agent tasks.
- Final runtime source is `d00f1ce747e357e9df4e442e32417922f6e7411b`, a CSS-only runtime delta over `9d2caac`. It fixes invisible light-theme Obligation headings/amounts discovered during real-service screenshot inspection. Minimum measured text contrast: light 6.47:1, dark 8.08:1. The final source was separately browser-verified on the durable copy.
- The immutable image has no mutable `/app` mount. Root filesystem is read-only, capabilities dropped, no-new-privileges enabled, and only existing local secrets plus one synthetic metered-provider file are mounted. Distroless health checks directly invoke Node. Pilot and unsigned synthetic outbox/reconciliation worker are supervised by Docker restart policy.
- Actual local entry: http://127.0.0.1:8895/ ; Principal entry: http://127.0.0.1:8896/ . Existing review fixtures remain on 4191–4195 and old 4186/4187.

### Remaining acceptance

Founder wallet login is requested but not yet confirmed. Capital/Risk pre-enrolled credentials cannot use the existing two-role wallet login; real tests return `authentication_role_rejected`. WEB-026G records the bounded correction and permission review. These are not falsely reported as functioning authenticated roles.

### Rollback procedure

Prefer the tested immutable canonical baseline image `ipo-one-web026:rollback-9636ec2`, not restarting the original mutable worktree container. Preserve the current database and all post-cutover work first. For data rollback, restore the protected `cutover.dump` into a new isolated database, verify the 70-migration snapshot, point the exact fallback at that restored copy and allow the reviewed compatible 0071–0073 migrations. Validate login/health/roles before a separately reviewed cutover; never silently overwrite newer user activity. `web026-rollback-proof.mjs` records the completed isolated rehearsal. Original container definitions and snapshots remain available; no destructive down migration was used.

Verdict remains **BLOCKED — NOT COMPLETE** for the complete product, pending Founder verification and privileged-role login. The approved local runtime/database repair and Human/Principal service integration have been carried out.
