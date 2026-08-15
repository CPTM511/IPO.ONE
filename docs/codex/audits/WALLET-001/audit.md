# WALLET-001 audit

Date: 2026-07-23  
Status: `IMPLEMENTED_UNVERIFIED`  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

`WALLET-001` is implemented and locally verified. It has not received the
required independent review, so this record does not approve `WALLET-002`,
mobile or QR connectors, ERC-1271, new signing or funds authority, Testnet
mutation, mainnet, deployment, production credit, or real funds.

## Accepted pre-change drift

The package branch and commit matched. The source-drift command returned
nonzero only because the worktree contained the user-accepted, uncommitted
output of `AUDIT-001` and `PRODUCT-002`. The exact pre-change record is
`docs/codex/audits/WALLET-001/source-drift.md`.

Those prerequisite changes were preserved. In particular, this task did not
relabel the accepted dependency override, PRODUCT-002 manifest, or PRODUCT-002
audit as WALLET-001 work.

## Delivered diff

Added:

- `schemas/v2/wallet-provider-registry.schema.json`;
- `apps/web/src/wallet-provider-registry.js`;
- `apps/web/test/wallet-provider-registry.test.js`;
- `apps/web/test/support/wallet-provider-browser-host.mjs`;
- `apps/web/test/support/wallet-provider-browser-init.js`;
- `docs/codex/audits/WALLET-001/source-drift.md`;
- `docs/codex/audits/WALLET-001/audit.md`.

Modified:

- `apps/web/src/app.js` integrates registry discovery, explicit selection,
  selected-Provider EIP-1193 requests, and listener disposal;
- `apps/web/src/index.html` adds the explicit wallet picker and untrusted-data
  disclosure;
- `apps/web/src/styles.css` adds accessible responsive picker styles;
- `apps/tenant-api/src/tenant-web-assets.js` serves the checked-in registry
  module;
- `apps/tenant-api/test/transport-conformance.test.mjs` verifies the new module
  is part of the exact private web asset set;
- `apps/web/test/static-ui.test.js` adds browser-boundary assertions;
- `scripts/check-schemas.mjs` makes the registry schema a required versioned
  contract;
- `product/traceability/ipo-one.v9-product-traceability.v1.json` splits the
  previous grouped wallet action into implemented EIP-6963 discovery and
  still-disabled mobile/QR/ERC-1271 work;
- `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md` reflects the same split.

No package dependency, lockfile, workspace override, Tenant operation,
handler, AuthZ policy, admission policy, database composition, OpenAPI,
deployment, launch-policy, approval-policy, chain profile, pricing, capital,
signer, or release change belongs to this task.

## Versioned registry contract

`wallet_provider_registry.v1` is a closed no-authority browser snapshot:

- maximum 16 Providers;
- Provider IDs are bounded EIP-6963 UUID-v4 identifiers or the one fixed
  legacy identifier;
- selection is optional and explicit;
- status is `discovering`, `ready`, or `disposed`;
- names are normalized and bounded to 80 display characters;
- icons accept only bounded base64 PNG, JPEG, GIF, or WebP data URIs;
- external URLs and SVG are rejected;
- reverse-DNS metadata is normalized and bounded;
- `nonAuthorizing: true`, `credentialsIncluded: false`,
  `fundsAuthority: false`, and `storage: memory_only` are invariant.

Unknown announcement fields, property accessors, malformed UUIDs, duplicate
Provider references, duplicate IDs, invalid icons, and registry overflow fail
closed.

## Acceptance evidence

Explicit selection:

- discovery never selects a Provider;
- account, network, and SIWE controls remain disabled until one Provider is
  explicitly selected;
- selecting Alpha in the browser fixture left total Provider requests at zero;
- switching explicitly from Alpha to Beta also left requests at zero;
- the selected ID is kept only in the page-session registry and is never
  written to browser storage.

Untrusted rendering:

- the hostile name
  `</button><script data-hostile>window.__injected=true</script>` rendered as
  literal text;
- `window.__injected` remained false and no hostile script node existed;
- Provider rows are created with DOM nodes and `textContent`, not raw HTML;
- the hostile external SVG icon was rejected and replaced by the local
  fallback mark.

Listener lifecycle:

- after Alpha selection, Alpha had two listeners and Beta had zero;
- after explicit Beta selection, Alpha had zero and Beta had two;
- `pagehide` disposes the registry and selected-Provider listeners;
- unit tests cover disposal, selected removal, replacement, and the requirement
  to reselect a replacement explicitly.

Selected request routing:

- connecting the no-network fixture after selecting Beta sent exactly
  `eth_requestAccounts`, `wallet_switchEthereumChain`, and `eth_chainId` to
  Beta;
- Alpha and the hostile Provider received zero requests;
- the returned fixture address and Base Sepolia chain were verified before the
  UI marked the connection complete.

Legacy compatibility:

- the fixed `globalThis.ethereum` fallback appears only after the bounded
  discovery window and only when no EIP-6963 announcement exists;
- the legacy Provider still requires explicit selection;
- current EIP-1193 account, chain-switch, chain-verification, and existing SIWE
  behavior are preserved after selection.

The final browser run reported zero console errors and zero warnings.

## Catalog, authorization, admission, migrations, and data

- Tenant catalog operations: unchanged at 38.
- New or modified handlers: none.
- AuthZ policy changes: none.
- Admission or quota changes: none.
- OpenAPI changes: none.
- Migrations: none; the ordered set remains 25 up/down pairs.
- Database writes or backfill: none.
- External network calls: none.
- Production or private data accessed: none.
- Raw KYC, PII, credentials, reusable signatures, seed phrases, private keys,
  or live wallet material added: none.

The V9 traceability gate now reports 60 material actions: 26 `REAL_LOCAL`,
zero `REAL_TESTNET_READ`, 14 `SIMULATION_ONLY`, 9 `SPECIFIED_DISABLED`, and 11
`ABSENT`. Mobile/QR and ERC-1271 remain `SPECIFIED_DISABLED`; provider-change
session invalidation remains `ABSENT` for WALLET-002.

## Commands and results

Exact required runtime:

```sh
env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin pnpm check
```

Passed the runtime contract with Node `v24.18.0` and pnpm `11.1.3`, all static
gates, 48 schemas, 38 Tenant operations, the 60-action traceability gate, and
351 tests with zero failures.

Focused browser tests:

```sh
env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin node --test apps/web/test/*.test.js
```

Passed 27 tests with zero failures, including no Provider, one Provider,
multiple Providers, duplicate announcement, malicious metadata,
removal/replacement, legacy fallback, and listener disposal.

Affected Tenant transport:

```sh
env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin node --test apps/tenant-api/test/transport-conformance.test.mjs
```

Passed 6 tests with zero failures.

Security:

```sh
env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin pnpm test:security
```

Passed 24 tests with zero failures.

Browser E2E fixture:

```sh
node apps/web/test/support/wallet-provider-browser-host.mjs
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh --session wallet001 open
```

The local loopback-only host declared `realFundsEnabled: false`. Playwright
loaded `wallet-provider-browser-init.js`, opened the picker, selected Alpha,
switched to Beta, connected the simulated Base Sepolia Provider, inspected
request/listener counts and hostile DOM state, and closed the session. No real
Provider, RPC endpoint, account, credential, signature, or funds path was used.

Syntax and repository hygiene:

```sh
node --check apps/web/src/wallet-provider-registry.js
node --check apps/web/src/app.js
node --check apps/web/test/support/wallet-provider-browser-host.mjs
node --check apps/web/test/support/wallet-provider-browser-init.js
git diff --check
```

Passed.

## Failures encountered and resolved

1. The first browser fixture returned 404 for the private Tenant catalog, which
   produced one expected browser resource error unrelated to wallet discovery.
   The test-only host now returns a closed empty catalog without a session,
   capability, mutation, or authority. The final browser run had zero console
   errors and warnings.
2. One diagnostic Playwright expression called a nonexistent fixture helper.
   It made no product request or mutation. The expression was corrected to
   inspect the Provider's bounded in-memory request arrays.

Open test failures: none.

## Security and product-boundary proof

- Provider discovery and selection are not authentication, authorization,
  Mandate, credit, signing, allowance, transaction, custody, or funds
  authority.
- Provider metadata cannot supply HTML, scripts, an external image request, a
  chain profile, account truth, Tenant, Actor, role, capability, or financial
  state.
- The approved Base Sepolia and X Layer Testnet choices remain fixed
  application profiles; Provider-supplied chain state is verified by an
  explicit `eth_chainId` request before use.
- No Provider request occurs during discovery, rendering, or selection.
- Account and chain events are treated as browser state only. Server-session
  invalidation on account, chain, or Provider changes is deliberately not
  claimed here and remains WALLET-002.
- No browser storage contains Provider objects, Provider selection, secrets, or
  signing material.
- The shared Human/Agent obligation kernel, Ledger, Event, Evidence, outbox,
  reconciliation, and deny-by-default Tenant boundaries are unchanged.
- The only release-enabled launch profile remains `public_sandbox`; no
  deployment or release approval was made.

## Rollback

Rollback is code-only and requires no data or external-system restoration:

1. remove the registry schema, module, unit test, and browser fixture files;
2. remove the picker integration and styles;
3. remove the registry module from the Tenant web asset set and transport test;
4. remove the registry schema from the required schema set;
5. restore the grouped wallet traceability action as
   `SPECIFIED_DISABLED`;
6. preserve the separately accepted AUDIT-001 and PRODUCT-002 work;
7. rerun `pnpm check`, the affected transport test, and
   `pnpm test:security`.

There is no migration rollback, session migration, Provider revocation, wallet
transaction reversal, fund movement reversal, deployment rollback, or release
rollback.

## Independent review and next task

Use the package `CODEX_REVIEW_PROMPT.md` for an independent review of
`WALLET-001`. The reviewer should attempt to:

- replace a selected Provider through a duplicate UUID or object reference;
- inject accessors, Unicode direction controls, oversized names, SVG, or
  external icon URLs;
- trigger account, network, or signature requests before explicit selection;
- find leaked Provider references or selection in storage;
- demonstrate duplicate selected-Provider listeners after switching;
- confirm only the selected Provider receives EIP-1193 calls;
- confirm legacy fallback never silently selects itself;
- confirm WALLET-002 session invalidation and WALLET-003 connector/contract
  wallet work were not smuggled into this task.

Next manifest task: `WALLET-002`. Status: `NOT_STARTED`, pending independent
review and explicit human acceptance of WALLET-001. This audit does not
authorize it to start automatically.
