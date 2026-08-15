# WALLET-003 connector dependency review

Date: 2026-07-24  
Owner: IPO.ONE Founder  
Approval expiry: 2026-09-22  
Status: `INSTALLED_REVIEWED_DISABLED_LEGAL_AND_RUNTIME_BLOCK`

## Approved candidate and resolved artifact

- package: `@walletconnect/ethereum-provider`;
- exact version: `2.23.10`;
- range/caret/canary allowed: no;
- npm registry: `https://registry.npmjs.org/`;
- lockfile integrity:
  `sha512-OpmTS2s+zrqK7cr8yfGu62tCv6Dsoe/TI1SFYQd2tKyAaBYjrKVzZPfqbRYesgbtNKcCn8KK5Y6PrKIK52U7RQ==`;
- install scripts: ignored;
- intended adapter:
  `apps/web/src/mobile-wallet-connector.js`;
- intended profiles: Base Sepolia `84532` and X Layer Testnet `1952` only.

The exact package was installed at the workspace root and a subsequent
`pnpm install --frozen-lockfile --ignore-scripts` passed. The install resolved
233 packages and reported one deprecated transitive package,
`@safe-global/safe-gateway-typescript-sdk@3.23.1`. No alternate registry,
copied bundle, CDN import, dynamic module URL, or install script was used.

`pnpm list --prod --depth Infinity --json` completed against the resolved
lockfile. The final production graph contains 170 regular plus 94 optional
dependencies, 264 total.

## Security audit: pass after a bounded root override

The first `pnpm audit --prod --json` returned one high and nine moderate
Axios findings through the optional AppKit/Coinbase branch. Every advisory
reported a patched floor of Axios `1.18.0`, while
`@coinbase/cdp-sdk@1.54.0` requested `axios: 1.16.0`.

The workspace now applies two exact, reviewable root overrides:

```yaml
fast-uri: 3.1.4
axios: 1.18.0
```

The Axios override replaces only the vulnerable transitive version. The
`fast-uri` override preserves the already reviewed schema-validation runtime
after the lockfile recomputation. `pnpm why axios` resolves one production
version, `axios@1.18.0`, through both `@coinbase/cdp-sdk@1.54.0` and
`axios-retry`.

The final `pnpm audit --prod --json` result is:

- critical: 0;
- high: 0;
- moderate: 0;
- low/info: 0.

The resolved branch remains:

```text
@walletconnect/ethereum-provider
  -> @reown/appkit
  -> @reown/appkit-pay / @reown/appkit-utils
  -> @base-org/account
  -> @coinbase/cdp-sdk@1.54.0
  -> axios@1.18.0 (workspace security override)
```

The exact-runtime connector tests and the complete 378-test repository gate
pass with this graph. Installation and a clean audit still do not authorize
bundling, production use, relay egress, or a Project ID.

## License review: accepted human/legal gate

`pnpm licenses list --prod --json` completed, but the WalletConnect/Reown
packages report a non-SPDX marker, `SEE LICENSE IN LICENSE.md`, which the
automated inventory classifies as unknown.

The installed `@walletconnect/ethereum-provider@2.23.10` artifact contains the
WalletConnect Community License Agreement released 20 August 2025. Its terms
include proprietary Reown network use, attribution and license-copy
requirements, commercial thresholds stated in the installed text as
2,500,000 monthly RPCs or 500 monthly active users, modification terms,
termination terms, and binding dispute provisions.

Engineering did not interpret those terms as legal approval. On
`2026-07-24T00:04:37Z`, the IPO.ONE Founder explicitly accepted the installed
WalletConnect Community License for the approved no-real-funds
Testnet/private-pilot scope, with expiry
`2026-09-22T23:59:59.999Z`. This closes the named human/legal gate but does not
create a Project ID, activate the connector, or approve a production release.

## Real storage-hook verification

Package source and types were inspected after exact resolution:

- `EthereumProviderOptions` accepts `storage?: IKeyValueStorage`;
- the installed runtime forwards `storage` into the Universal Provider;
- the real interface requires `getKeys`, `getEntries`, `getItem`, `setItem`,
  and `removeItem`.

This review found and fixed a real adapter gap: the original IPO.ONE
memory-only store lacked `getEntries` and accepted only string values. It now:

- implements the full resolved interface;
- accepts bounded JSON-compatible values;
- limits storage to 256 keys and 64 KiB per value;
- clones returned values;
- clears and disposes without persistence.

`apps/web/src/walletconnect-ethereum-provider-loader.js` imports the exact
installed package, passes the exact memory store, disables Provider ping and
telemetry, and accepts initialization only when the real provider retains the
same object at `provider.signer.client.core.storage`. Tests prove the exact
instance is retained and fail closed on substitution.

The exact package and IPO.ONE loader now have a deterministic same-origin
browser bundle built with exact `esbuild@0.28.1`:

- bundle bytes: `1998764`;
- bundle SHA-256:
  `b1b3761ef4ceb33f080bea9b91dec8eca47f1a39e4a88f1736f95f0340c5be1b`;
- input modules: `1548`;
- source map: absent;
- embedded Project ID: absent;
- served license-copy SHA-256:
  `1cb6f8cfe21f54ab1105105717eaa2ba08343037a2a9c41dfd5ab09e3ce270fc`.

The Tenant asset allowlist serves both files from the existing same-origin
`script-src 'self'` policy, so no CDN or broader script CSP is required. The
production browser bootstrap still does not activate the bundle. The adapter
now accepts only `https://ipo.one` and passes the exact package-default relay
`wss://relay.walletconnect.org` instead of inheriting an implicit SDK default.
The repository CSP admits only that Relay plus the two already approved
Testnet RPC endpoints. There is no Project ID or real mobile wallet session in
the repository, and no release was deployed.

## Current decision

The dependency security review now passes, but connector enablement does not:

1. exact resolution, integrity, graph, license inventory, audit, and real
   storage-hook inspection are complete;
2. the production dependency audit reports zero vulnerabilities;
3. the Founder accepted the Community License and fixed the only approved
   Origin and Relay through `2026-09-22T23:59:59.999Z`;
4. the fixed same-origin browser bundle, exact Origin, static Relay pin and
   closed CSP are complete, but runtime Project ID injection and real mobile
   E2E remain absent.

The connector remains `SPECIFIED_DISABLED` and WALLET-003 remains
`IMPLEMENTED_UNVERIFIED`.

## Rollback

Remove the exact root dependency, lockfile graph, isolated loader and
connector tests; retain this audit record; and keep
`wallet_permissions.mobile_qr_contract_wallet` classified as
`SPECIFIED_DISABLED`. No Project ID or production connector session exists to
revoke.
