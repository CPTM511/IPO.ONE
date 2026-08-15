# PILOT-001 — Private no-funds product composition

## Context

The durable Tenant Gateway, Human workspace, Agent MCP host, and Risk/Operations
queries exist, but the repository has no executable composition that mounts them
over one persistent kernel. The current `pnpm dev` command starts the separate
anonymous public sandbox, so evaluators can accidentally see legacy demo state.

## Scope

- Add one local-only command that migrates and provisions a PostgreSQL-backed
  private no-funds Tenant.
- Start role-separated Human Borrower, Principal Controller, and Risk/Operations
  loopback workspaces over the same Tenant Gateway and database.
- Bootstrap an HttpOnly local pilot session without putting credentials or
  authority in HTML or JavaScript.
- Keep the existing local Agent MCP boundary compatible with the same identity,
  obligation, ledger, risk, event, and Evidence kernel.
- Provide a short operator runbook and readiness output.

## Non-goals

- Real funds, withdrawals, production lending, custody, or mainnet execution.
- Public/remote private API exposure.
- Production IdP, KYC/PII processing, capital, legal, or servicing-provider
  approval.
- Replacing production authentication with the local bootstrap profile.

## Likely files

- `apps/private-pilot/src/*`
- `apps/tenant-api/src/tenant-pilot-host.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `package.json`
- `README.md`

## Acceptance criteria

1. `pnpm run pilot:start` fails closed without a reachable owner PostgreSQL URL.
2. The command migrates the database, provisions a non-owner `NOBYPASSRLS`
   application role, and verifies that role before serving requests.
3. Three loopback-only workspaces share one durable Gateway but use distinct
   least-privilege identities.
4. Opening a workspace in a browser establishes an HttpOnly, Secure, SameSite
   pilot session; no credential or Authentication Context is rendered.
5. Human lifecycle state survives page reload and process restart.
6. The launcher never enables real funds or a remote listener.

## Test command

```bash
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check
```

PostgreSQL smoke test when a local server is available:

```bash
DATABASE_URL=postgresql://127.0.0.1:5432/ipo_one_private_pilot pnpm run pilot:start
```

## Security checklist

- [x] Loopback bind and Host validation remain mandatory.
- [x] Runtime database role is non-owner and cannot bypass RLS.
- [x] Session and CSRF values are keyed, bounded, and never logged.
- [x] Role separation is enforced by Membership/capability policy.
- [x] Synthetic/redacted data only; no raw KYC/PII.
- [x] No real-funds, remote MCP, chain signing, or withdrawal authority.
- [x] Shutdown closes listeners and database pools cleanly.
