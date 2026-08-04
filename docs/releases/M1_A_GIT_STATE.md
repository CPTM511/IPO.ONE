# M1-A Git and Workspace State

Audit ID: `M1-A-20260803T132413Z`

Capture time: `2026-08-03T13:24:13Z`

## Immutable Git references

| Field | Captured value |
| --- | --- |
| Branch | `codex/checkpoint-20260727-pre-strategy` |
| Upstream | none configured |
| HEAD commit | `4b0e41dde352283e0d27228d51d1fb99f04c97a8` |
| HEAD tree | `907820553598ff50ff0446c1c4c365247a074fe8` |
| Existing tag pointing at HEAD | `ipo-one-v1-checkpoint-20260731` |
| Submodules | none; `git submodule status --recursive` returned no entries |
| Staged files | 0 |
| Tracked modified files | 16 |
| Untracked files | 202 |

The existing tag predates M1-A and does not include the dirty worktree. The
worktree was dirty before M1-A. No reset, clean, restore, stash deletion,
checkout, merge, stage, commit, tag, format, or dependency update was performed.

## Diff evidence

The staged diff is empty. Its SHA-256 is:

```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

The exact audit-start unstaged binary patch is stored at
`artifacts/m1-a/unstaged-at-start.patch`. Its SHA-256 is:

```text
6a7c65d57bddd9414034ff7b0df441aa34a60ef41ad49b1241d27eca2eeae4a4
```

The exact audit-start untracked file manifest is stored at
`artifacts/m1-a/untracked-files-at-start.txt`. It contains 202 paths and has
SHA-256:

```text
3af32de7be72be3e2f5884b4285f1b63a334afff808492d020c49858a5adff7f
```

These are evidence copies only. They are not a Git commit, stash, or working
backup and must not be treated as authorization to overwrite the worktree.

## Audit-start `git status --porcelain=v2`

The 16 tracked modifications were:

```text
.github/ISSUE_TEMPLATE/codex_task.md
AGENTS.md
apps/tenant-api/src/tenant-web-assets.js
apps/tenant-api/test/transport-conformance.test.mjs
apps/web/src/app.js
apps/web/src/index.html
apps/web/src/servicing-case-presentation.js
apps/web/test/manual-primary-actions.v1.json
apps/web/test/servicing-case-presentation.test.js
apps/web/test/static-ui.test.js
apps/web/test/support/agent-console-browser-host.mjs
apps/web/test/support/human-lifecycle-browser-host.mjs
docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md
docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md
modules/tenant-command-gateway/src/tenant-command-clients.js
modules/tenant-command-gateway/test/tenant-command-gateway.test.js
```

All entries were worktree-only (`.M`); none was staged. The diff summary was
1,194 insertions and 262 deletions.

The complete untracked list is intentionally not collapsed into directory
names; use the checksum-protected artifact cited above.

## Lockfiles and package roots

| File | SHA-256 |
| --- | --- |
| `package.json` | `2ac9949346d548376b9f4f064ebcf78fc07dd16aa7ca83be9fe2d643aa98aebb` |
| `pnpm-workspace.yaml` | `c653b4488b9f0c55a74b79ce50af0cdb8f5da00e85fa9a8a0a335062a9c18f21` |
| `pnpm-lock.yaml` | `38d1699e9f52f6acd8e611598a0f2573c32447d79063485a7d0655250e311a0f` |
| `prototypes/ipo-one-capital-partners-film/package-lock.json` | `fd2e15106cc9b6da8dc7c6fb8748a8035a3417a6bd225d40835d59f342c501dc` |

The prototype lockfile belongs to an untracked experimental prototype and is
not part of the proposed product RC.

## Toolchain

| Tool | Version |
| --- | --- |
| macOS | `26.5.2` |
| Darwin | `25.5.0 arm64` |
| Git | `2.39.3 (Apple Git-146)` |
| Node.js | `v26.5.0` |
| npm | `11.17.0` |
| pnpm | `11.1.3` |
| PostgreSQL used for integration audit | `17.10` |

`package.json` requires Node `>=26.5.0 <27` and pnpm `11.1.3`.

## Environment variable name inventory

Values were not read or printed. Names referenced by executable source include:

```text
BASE_URL
CI
DATABASE_URL
GITHUB_ACTIONS
IPO_ONE_ADMIN_DATABASE_URL
IPO_ONE_AGENT_ACCESS_TOKEN_FILE
IPO_ONE_AGENT_API_ORIGIN
IPO_ONE_AGENT_HANDOFF_FILE
IPO_ONE_AGENT_MTLS_CA_FILE
IPO_ONE_AGENT_MTLS_CERT_FILE
IPO_ONE_AGENT_MTLS_KEY_FILE
IPO_ONE_ALLOW_DB_RESET
IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY
IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ
IPO_ONE_APPROVE_LOCAL_EVIDENCE_ANCHOR_WRITES
IPO_ONE_APPROVE_LOCAL_EVIDENCE_ATTESTOR
IPO_ONE_AUTH_DATABASE_PASSWORD_FILE
IPO_ONE_AUTH_REFERENCE_HASH_KEY_FILE
IPO_ONE_BOOTSTRAP_CONFIG_FILE
IPO_ONE_BROWSER_QA_DISABLE_AUTH_DISCOVERY
IPO_ONE_BROWSER_QA_EVIDENCE_SCENARIO
IPO_ONE_CREDIT_REGISTRY_OBSERVATION_ARTIFACT
IPO_ONE_EVIDENCE_ANCHOR_CONTRACT_ADDRESS
IPO_ONE_EVIDENCE_ATTESTOR_KEY_FILE
IPO_ONE_GATEWAY_DATABASE_PASSWORD_FILE
IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS
IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ROLE
IPO_ONE_LOCAL_AGENT_KEY_FILE
IPO_ONE_LOCAL_AUTH_INVITATION_FILE
IPO_ONE_LOCAL_AUTH_SERVER_FILE
IPO_ONE_PILOT_DB_SECRET_FILE
IPO_ONE_PILOT_PORT
IPO_ONE_PILOT_PROFILE_FILE
IPO_ONE_PROVIDER_CALLBACK_KEY_ID
IPO_ONE_PROVIDER_CALLBACK_PRIVATE_KEY_B64
IPO_ONE_PROVIDER_DELIVERY_KEY_ID
IPO_ONE_PROVIDER_DELIVERY_PUBLIC_KEY_B64
IPO_ONE_PROVIDER_SANDBOX_PORT
IPO_ONE_PROVIDER_STATE_FILE
IPO_ONE_PROVIDER_TEST_CRASH_POINT
IPO_ONE_RELEASE_ID
IPO_ONE_TC403_DRILL_APPROVAL
IPO_ONE_TC403_DRILL_PRINT_EVIDENCE
IPO_ONE_TESTNET_AMOUNT_MINOR
IPO_ONE_TESTNET_ASSET_ID
IPO_ONE_TESTNET_CHAIN_ID
IPO_ONE_TESTNET_CONTRACT_ADDRESS
IPO_ONE_TESTNET_EVIDENCE_HASH
IPO_ONE_TESTNET_KEY_FILE
IPO_ONE_TESTNET_OBLIGATION_ID
IPO_ONE_TESTNET_PAYMENT_ID
IPO_ONE_TESTNET_PROVIDER_SLOT
IPO_ONE_TESTNET_RECOVERY_CONTRACT_ADDRESS
IPO_ONE_TESTNET_RUN_ID
NODE_ENV
PG_DUMP_BIN
PG_RESTORE_BIN
```

`.env.example` exposes only these names: `DEMO_MODE`, `HOST`,
`IPO_ONE_DEPLOYMENT_MODE`, `IPO_ONE_HSTS_MAX_AGE`, `IPO_ONE_PUBLIC_ORIGIN`,
`IPO_ONE_RELEASE_SHA`, `IPO_ONE_TRUST_PROXY`, and `PORT`.

## Ignored operationally relevant state

The ignored set was large because it included dependency stores, browser
automation output, generated media, and local runtime state. Major categories
at capture were approximately:

| Category | Observed count | RC disposition |
| --- | ---: | --- |
| `.ipo-one/` | 53,528 | exclude; local runtime and secret-bearing state |
| `node_modules/` | 50,072 | exclude; installed dependencies |
| `.pnpm-store/` | 30,960 | exclude; package cache |
| ignored prototype/generated files | 2,281 | exclude |
| `.playwright-cli/` | 557 | exclude; browser audit state |
| ignored `output/` files | 198 | exclude; generated media/evidence |

Secret-bearing operational paths were inventoried by path, mode, and size only.
Their values were not opened. Relevant examples under `.ipo-one/local-stack/`
include `agent-key.v1.json`, `evidence-attestor.key`,
`private-pilot-db-secret`, `stack.env`, authentication invitation/server files,
and workflow receipts. One observed `private-pilot-db-secret` path had mode
`0644`; this is reported as a security-review item, not changed by M1-A.

## Safe backup checklist for M1-B review

Before any approved M1-B action, the operator must:

1. verify the three evidence hashes in this report;
2. independently copy the entire dirty workspace to an owner-controlled,
   access-restricted location without resolving or rewriting symlinks;
3. separately preserve secret-bearing ignored runtime state using an approved
   encrypted procedure; never add it to Git or the RC bundle;
4. confirm the 16 tracked changes and 202 original untracked paths against the
   inclusion manifest;
5. preserve any existing stash entries without modification or deletion;
6. record the new pre-M1-B `git status --porcelain=v2` and stop on drift;
7. do not use `git add -A`; stage only the exact Founder-approved paths.

This checklist is a proposal. No backup copy, stash, stage, commit, or branch
was created by M1-A.
