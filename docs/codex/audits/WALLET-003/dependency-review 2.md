# WALLET-003 connector dependency review

Date: 2026-07-23  
Owner: IPO.ONE Founder  
Approval expiry: 2026-09-22  
Status: `BLOCKED_ENVIRONMENT`

## Approved candidate

- package: `@walletconnect/ethereum-provider`
- exact version: `2.23.10`
- range/caret/canary allowed: no
- intended adapter:
  `apps/web/src/mobile-wallet-connector.js`
- intended profiles: Base Sepolia `84532` and X Layer Testnet `1952` only

## Installation attempt

Command attempted with the repository's exact Node 24 runtime:

```text
pnpm add --save-exact @walletconnect/ethereum-provider@2.23.10
```

The external-write approval infrastructure rejected the command before pnpm
ran because its internal review model was unsupported:

```text
This model is not supported when using
X-OpenAI-Internal-Codex-Responses-Lite.
```

This is not a package audit result. The package remains absent from
`node_modules`, `package.json`, and `pnpm-lock.yaml`. No alternate registry,
curl download, copied bundle, CDN import, or unreviewed loader was used.

After the Founder stated `批准所有的内容，开始继续下一步`, the exact same
approved install was retried. The approval infrastructure returned the same
unsupported-model error before pnpm executed. This remains an environment
blocker, not evidence for or against the dependency.

## Completed static boundary review

The IPO.ONE adapter:

- requires the loader to attest the exact package name and `2.23.10`;
- requires `storageApplied: true` for an IPO.ONE memory-only storage instance;
- rejects runtime Origin drift and expires after 2026-09-22;
- never includes the Project ID in snapshots, storage, logs, Events, Evidence,
  or analytics;
- exposes only the seven approved account/network/sign methods;
- denies transaction, transfer, approval, balance/history, and arbitrary RPC
  methods;
- exposes only account, chain, connect, and disconnect lifecycle events;
- maps only account/chain changes from bounded session events;
- joins the same explicit Provider selection and server invalidation lifecycle
  as a desktop EIP-1193 Provider;
- remains unreferenced by the production browser bootstrap and therefore
  disabled.

## Unfinished dependency gates

These gates cannot be truthfully completed until the exact package is locally
resolved:

1. record `pnpm-lock.yaml` resolution URL and integrity;
2. enumerate the complete resolved dependency graph;
3. inspect every resolved license and WalletConnect community-license term;
4. run `pnpm audit --prod`;
5. identify the package's exact supported custom-storage hook and prove the
   memory-only store actually replaces all persistent browser storage;
6. build the fixed local browser artifact without a CDN or arbitrary module
   URL;
7. review exact WalletConnect relay/CSP egress before enabling the adapter.

Until all seven pass, the connector is `IMPLEMENTED_UNVERIFIED` and
`SPECIFIED_DISABLED`; it is not an installed, enabled, or production-approved
dependency.

## Rollback

Delete the isolated adapter/test/registry additions, retain this failed-attempt
record, and keep `wallet_permissions.mobile_qr_contract_wallet` classified as
`SPECIFIED_DISABLED`. No Project ID exists in this repository to revoke.
