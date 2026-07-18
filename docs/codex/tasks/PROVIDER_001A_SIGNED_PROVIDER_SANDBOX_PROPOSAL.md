# PROVIDER-001A: Signed out-of-process Provider sandbox

Status: Approved and implemented locally on 2026-07-17. The project owner
explicitly approved all three permissions below, including the loopback-only
Provider process and conformance harness. Public/remote Provider access,
deployment, custody, production credentials, real funds, and mainnet remain
unapproved.

## Context

Product Charter v1.1 requires Provider execution to leave the in-process demo
before IPO.ONE can claim design-partner readiness. The repository already has
allowlisted Provider, SpendPolicy, TransferIntent, sandbox Rail, settlement,
outbox/inbox persistence, AccessGrant, authorization, abuse-control, and
reconciliation primitives. The missing product boundary is an independently
running Provider sandbox that can receive one assigned intent, acknowledge it,
and return one signed callback without duplicating economic state.

This proposal activates only policy entries that are already deny-by-default
in the authorization model. It does not authorize a production Provider,
internet endpoint, custody, disbursement, or real funds.

## Approved three-part permission plan

1. **Provider intent read permission** — add `pilotReadProviderIntent` to the
   closed private Tenant protocol. An authenticated `provider` Actor may read
   only one exact `transfer_intent` assigned through a current
   `provider_intent_delivery` AccessGrant. The response is bounded, redacted,
   no-PII, non-authorizing, and contains no destination credential or secret.
2. **Provider intent acknowledgement permission** — add
   `pilotAcknowledgeProviderIntent` to the closed private Tenant protocol. The
   same authenticated Provider may idempotently acknowledge only that exact
   assigned intent and immutable delivery hash. Acknowledgement records
   receipt state and Evidence; it cannot settle, redirect, withdraw, change
   amount, change Provider, or create an Obligation.
3. **Signed callback inbox permission** — activate `workerProcessInbox` only
   for a fixed `provider_sandbox_callback.v1` envelope. A separately
   authenticated System Worker verifies an Ed25519 signature, key ID,
   timestamp window, Provider/intent binding, payload hash, nonce, and inbox
   dedupe before one atomic callback transition. Duplicate delivery replays the
   prior result; conflicting replay, stale signature, unknown key, or terminal
   state fails closed.

Approval of these three permissions also authorizes one loopback-only local
Provider worker and conformance harness needed to prove them. It does not
authorize any configurable or public remote host.

## Implemented scope

- Define closed `provider_intent_view.v1`,
  `provider_intent_acknowledgement.v1`, and
  `provider_sandbox_callback.v1` contracts with adversarial fixtures.
- Add the three reviewed operations to the private catalog, request/result
  schemas, clients, authorization/abuse drift gates, and PostgreSQL runtime.
- Persist one delivery attempt/acknowledgement and one inbox result with exact
  replay semantics; reuse the existing Event/Evidence/outbox/reconciliation
  transaction pattern.
- Add an injected Ed25519 signer/verifier boundary. Only key IDs and public-key
  references may enter durable state; no private key or raw credential may
  enter a request, Event, Evidence envelope, log, fixture, or repository file.
- Add a loopback-only `apps/provider-sandbox` worker with a fixed local profile,
  bounded body/time/retry limits, no redirect following, no dynamic URL, and a
  circuit breaker.
- Add Provider conformance receipts and a Human-readable Provider Sandbox
  status surface showing delivery, acknowledgement, callback, replay, and
  reconciliation state.

## Non-goals

- No public or remote Provider API, DNS, cloud deployment, webhook URL input,
  provider self-registration, dynamic plugin loading, or production key
  management.
- No settlement-account creation/change, arbitrary destination, withdrawal,
  custody, capital, real asset, mainnet, bridge, swap, token, or funds movement.
- No Agent MCP tool or Agent Mandate capability change.
- No automatic retry of an economic mutation. Delivery retry is bounded and
  reuses the exact immutable intent, signature context, and idempotency key.
- No production SLA, pricing, provider contract, KYP decision, legal role, or
  operational on-call approval.

## Implementation files

- `apps/provider-sandbox/**`
- `modules/tenant-command-gateway/src/provider-*.js`
- `modules/persistence/src/postgres-*.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/abuse-control/src/abuse-*.js`
- `packages/api-contract/**`
- `schemas/v2/provider-*.schema.json`
- `api/tenant-protocol/**`
- `db/migrations/0021_*.sql`
- `security/test/gateway-security.test.mjs`
- `docs/security/IPO_ONE_PROVIDER_SANDBOX_THREAT_MODEL_v0.1.md`

## Acceptance criteria

- [x] Only the exact assigned Provider can read and acknowledge one intent;
  cross-Tenant, cross-Provider, missing-grant, expired-grant, and stale-Actor
  requests share one non-enumerating denial contract.
- [x] Provider acknowledgement cannot mutate amount, asset, Provider,
  destination, Obligation, settlement, Ledger, or funds state.
- [x] Callback processing verifies signature and binding before database access,
  then commits inbox, state, Event, Evidence, outbox, audit, and response
  atomically.
- [x] Identical callback replay returns the prior result without new economic
  state; payload/signature/nonce conflicts fail closed.
- [x] Worker crash before/after commit, retry exhaustion, timeout, circuit-open,
  and restart recovery are deterministic and reconciliable.
- [x] One happy path and adversarial paths run across a real loopback process
  boundary; no test substitutes an in-process function call for the transport.
- [x] Human/Agent Obligation, Ledger, repayment, Evidence, and ten-tool MCP
  invariants remain unchanged.
- [x] Full Node 24.18.0, PostgreSQL, security, transport, reconciliation, and
  repository gates pass.

## Test commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
pnpm run test:provider
git diff --check
```

## Security checklist

- [x] Provider and Worker identity are Host-derived and sender-constrained;
  callers cannot supply Tenant, Actor, Credential, Authentication Context,
  AccessGrant, key material, URL, or Network Context.
- [x] Ed25519 verification covers method, intent ID, Provider ID, payload hash,
  nonce, issued/expiry time, and schema version using canonical bytes.
- [x] Inbox/outbox, retry, circuit breaker, quotas, and payload limits fail
  closed and expose only coarse operational metadata.
- [x] No raw Provider credential, settlement account, PII, request body, or
  signature material is logged or placed into Evidence.
- [x] The anonymous public sandbox and Agent MCP cannot address these private
  operations.

## Approval gate

- [x] Approve `pilotReadProviderIntent`.
- [x] Approve `pilotAcknowledgeProviderIntent`.
- [x] Approve `workerProcessInbox` restricted to
  `provider_sandbox_callback.v1`.

## Verification evidence

- The private catalog contains 32 closed operations; the Agent MCP registry
  remains exactly ten tools and exposes none of the Provider operations.
- Provider transport conformance passes five real-process tests covering exact
  replay, conflicting replay, before/after-commit crash recovery, signed
  delivery mutation, bounded retry, and circuit opening.
- PostgreSQL runtime passes 55 tests including 21 up/down migration pairs,
  forced-RLS posture, exact AccessGrant binding, callback atomicity, replay,
  redaction, and clean reconciliation.
- The full repository, security, transport, schema, and diff gates are recorded
  after every implementation change; these are local no-funds results, not a
  production launch approval.
