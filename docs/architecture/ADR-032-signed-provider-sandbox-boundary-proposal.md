# ADR-032: Signed out-of-process Provider sandbox boundary

Status: Accepted and implemented locally on 2026-07-17 under the exact
PROVIDER-001A three-permission approval. Remote exposure, production deployment,
custody, real funds, mainnet, and production Provider credentials are not
approved.

## Problem

IPO.ONE has in-process Provider, SpendPolicy, Payment, Rail, settlement, and
reconciliation primitives, but an in-process demo cannot prove the boundary a
design partner will integrate. A real Provider integration must tolerate
duplicate delivery, callback replay, timeout, crash, signature failure, and
restart without changing the canonical Obligation or Ledger twice.

Publishing a generic webhook or allowing caller-selected URLs would create an
SSRF, credential, replay, and economic-integrity boundary before Provider,
network, and production approvals exist.

## Decision

Introduce one fixed local Provider sandbox profile with three private
operations:

1. Provider reads an exact AccessGrant-bound TransferIntent.
2. Provider acknowledges the exact immutable intent delivery.
3. A System Worker verifies and processes one signed Provider callback through
   the durable inbox.

The Provider worker runs as a separate loopback-only process. Business policy
remains in the Tenant Command Gateway. The worker may serialize, sign, verify,
deliver, retry, and report transport state; it may not decide authorization,
change economics, or post Ledger entries outside the Gateway transaction.

## Trust boundaries

- **IPO.ONE Gateway:** sole authority for Tenant resource ownership,
  AccessGrant, Provider assignment, intent state, idempotency, audit, Evidence,
  and economic transitions.
- **Provider adapter:** authenticated as one Provider Actor and pinned to a
  fixed local Provider identity. It receives no Tenant-wide discovery.
- **Callback worker:** authenticated as a System Worker, verifies canonical
  Ed25519 signatures before executing the closed inbox operation, and cannot
  impersonate the Provider.
- **Key boundary:** signers/verifiers are injected. Durable state stores key ID,
  algorithm, public-key reference/hash, and rotation version only. Private keys
  never enter the repository or protocol envelope.
- **Network boundary:** loopback only, fixed origin, no redirects, no proxy
  trust, no DNS resolution, and no caller-supplied endpoint.

## Canonical sequence

1. Gateway commits a TransferIntent and outbox delivery record.
2. Delivery worker signs canonical delivery bytes and sends them to the fixed
   local Provider process.
3. Provider verifies delivery, reads the exact intent through its AccessGrant,
   and idempotently acknowledges the delivery hash.
4. Provider signs one callback envelope bound to the same Provider and intent.
5. Callback worker verifies signature, time, nonce, payload hash, schema, and
   assignment before calling the Gateway.
6. Gateway processes the inbox exactly once and atomically records result,
   Event, Evidence, outbox, authorization audit, and reconciliation state.
7. An identical retry returns the stored result. Any conflicting retry is a
   terminal security error and creates no business mutation.

## Required invariants

- One Provider cannot observe or acknowledge another Provider's intent.
- An acknowledgement is not settlement and grants no funds authority.
- Provider callback bytes cannot select or change a destination.
- Signature verification precedes resource resolution and database mutation.
- At-least-once transport yields exactly-once canonical economic state.
- Circuit opening stops new delivery attempts but never rolls back committed
  domain state or deletes Evidence.
- Human and Agent continue to share the same Obligation, Payment, Ledger,
  servicing, and Evidence kernel.

## Failure model

- Timeout before Provider receipt: retry the identical signed delivery within a
  bounded attempt budget.
- Crash after Provider receipt but before acknowledgement response: replay the
  same idempotency key and return the stored acknowledgement.
- Duplicate callback: return the stored inbox result.
- Conflicting callback: reject, preserve the first result, and emit bounded
  security telemetry without payload disclosure.
- Stale/unknown/revoked key: fail closed before Gateway execution.
- Circuit open: stop delivery, retain outbox/inbox state, and require operator
  review; do not fabricate settlement or repayment.

## Rejected alternatives

- Generic public webhook endpoint: rejected because authentication, edge,
  deployment, and incident ownership are unapproved.
- Caller-provided Provider URL: rejected because it creates SSRF and endpoint
  authority.
- Shared HMAC secret in application configuration: rejected for the proposed
  contract because asymmetric verification provides cleaner Provider identity
  and rotation boundaries.
- In-process callback simulation as completion evidence: rejected because it
  cannot prove transport replay or process-failure behavior.
- Direct Provider Ledger writes: rejected because it forks canonical economic
  truth and bypasses Gateway authorization/reconciliation.

## Consequences

IPO.ONE can prove a design-partner-grade Provider boundary without real funds
or internet exposure. The private Tenant catalog grows by the reviewed Provider
and Worker operations; the Agent MCP registry remains exactly ten tools.

Production Provider credentials, public/remote transport, URLs, KYP, SLAs,
settlement accounts, custody, caps, legal agreements, deployment, and funds
remain separate named approvals.
