# EVIDENCE-001C — Credit Registry Evidence read

Status: Completed locally

## Context

CHAIN-001D produced one synthetic Base Sepolia Credit Authorization Registry
lifecycle. CHAIN-001E verifies and persists its redacted, read-only observation
behind Tenant RLS. Human, Agent, and Risk Operations product surfaces cannot
yet retrieve that durable chain Evidence.

The Registry observation is public-chain, hash-only Evidence. It is not an
Obligation event, a credit decision, or a permission to move funds. It must
therefore remain a separate read model instead of being inserted into the
canonical Obligation timeline.

## Scope

- Register every persisted Registry authorization hash as a Tenant-owned
  `credit_registry_evidence` authorization resource.
- Add one authenticated query shared by Human, Agent, Risk Operations,
  Operations, and Auditor actors.
- Return a bounded, redacted summary of the latest durable observation.
- Expose the same query through the typed Agent SDK, local MCP, and Human/Risk
  web surfaces.
- Preserve synthetic-only, read-only, non-authorizing, and no-funds flags.

## Non-goals

- No new chain transaction, signer, wallet prompt, Registry mutation, or RPC
  request.
- No credit decision, score, limit, pricing, capital, repayment, or policy
  promotion.
- No raw account address, calldata, RPC URL, provider payload, signature,
  credential, strategy data, KYC, or PII.
- No claim that the CHAIN-001D synthetic lifecycle belongs to a production
  Human, Agent, or Obligation.
- No mainnet or X Layer Registry claim.

## Likely files

- `db/migrations/0041_credit_registry_evidence_resource.*.sql`
- `packages/api-contract/src/tenant-protocol.js`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/tenant-command-gateway/src/credit-registry-evidence-handlers.js`
- `packages/sdk/src/agent-registry-evidence-client.js`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `schemas/v2/tenant-protocol-*.schema.json`

## Acceptance criteria

1. The query requires authentication, the dedicated read capability, an exact
   authorization hash, and a Tenant-owned authorization resource.
2. Human, Agent, Risk Operations, Operations, and Auditor role bundles may
   read; no Provider, anonymous, or worker capability is added.
3. Risk Operations, Operations, and Auditor actors retain recent-MFA
   enforcement.
4. The response is bounded to one latest observation and contains only
   redacted hashes, finality, lifecycle transaction references, and explicit
   safety flags.
5. A missing, cross-Tenant, malformed, or inconsistent observation fails
   closed without resource enumeration.
6. The Agent SDK and MCP return the same protocol result and do not receive
   credentials or funds authority.
7. Human and Risk Operations UI use the authenticated protocol operation and
   clear the result on sign-out.
8. Migration, schema, authorization, gateway, SDK, MCP, web, PostgreSQL, and
   complete repository checks pass under Node 26.

## Test commands

```sh
node --test modules/tenant-command-gateway/test/credit-registry-evidence-handlers.test.js
node --test packages/sdk/test/agent-registry-evidence-client.test.js
node --test apps/agent-mcp/test/agent-mcp.test.mjs
pnpm run check:migrations
pnpm run test:postgres
pnpm run check
git diff --check
```

## Completion evidence

Completed on 2026-07-28 under Node 26.5.0 and pnpm 11.1.3:

- Base Sepolia Registry:
  `0x88926c11185E94bd8e9dE33959b6316CDA7c3e4A`.
- Synthetic authorization hash:
  `0x218a06527a138313936e9a199104dfbabe73f1f1d16e7e5c8189a0ff2edca088`.
- Reviewed CHAIN-001E observation:
  `artifacts/testnet/eip155-84532-chain-001e-read-20260728-001-credit-registry-observation.json`.
- The rebuilt local stack passed with PostgreSQL 17, all 41 migrations,
  three authenticated Human/Agent/Risk workspaces, forced RLS, worker
  heartbeat, reconciliation, and an empty pending outbox.
- Human (`127.0.0.1:8787`) and Risk (`127.0.0.1:8789`) browser sessions both
  returned the same Closed v3, paused Registry lifecycle with four finalized
  BaseScan-linked transactions and the explicit no-credit/no-account/no-funds
  boundary.
- Browser sign-out removed the account session, released the wallet, hid the
  private workspace, and cleared the authorization hash and Registry Evidence
  result.
- Transport regression passed 54/54; PostgreSQL integration passed 78/78;
  complete repository regression passed 615/615.
- `pnpm run check:schemas`, `pnpm run check:migrations`,
  `pnpm run check:tenant-protocol`, `pnpm run check:product-traceability`,
  `pnpm run check:web-bundle`, `pnpm run local:acceptance`, and
  `git diff --check` passed.

## Security checklist

- [x] Tenant RLS and Tenant-owned authorization resource are both required.
- [x] Query is read-only and has no idempotency or funds authority.
- [x] Raw account, RPC, calldata, provider payload, credentials, and PII are
      excluded.
- [x] Operator and Auditor recent-MFA requirements remain enforced.
- [x] Synthetic and non-authorizing labels are preserved end to end.
- [x] Sign-out clears browser-held Registry Evidence.
- [x] Complete repository regression passes.
