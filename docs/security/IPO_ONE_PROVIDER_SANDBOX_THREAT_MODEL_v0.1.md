# IPO.ONE Signed Provider Sandbox Threat Model v0.1

Version: v0.1
Date: 2026-07-17
Status: Implemented and adversarially verified for the approved local,
loopback-only, synthetic, no-funds PROVIDER-001A boundary. This document does
not approve a public/remote Provider, deployment, production credential, KYP,
settlement account, custody, capital, mainnet, or real funds.

## Scope and security claim

This model covers one separate Provider sandbox process, the closed
`pilotReadProviderIntent`, `pilotAcknowledgeProviderIntent`, and restricted
`workerProcessInbox` operations, Ed25519 delivery and callback envelopes,
durable delivery/acknowledgement/inbox projections, replay handling, bounded
retry/circuit behavior, crash recovery, and reconciliation.

The verified claim is narrow: an authenticated Provider with one exact current
`provider_intent_delivery` AccessGrant can receive and acknowledge only its
assigned immutable synthetic TransferIntent. A separately authenticated System
Worker can process only a valid `provider_sandbox_callback.v1` envelope, once,
without letting Provider bytes redirect value or mutate canonical economic
state twice.

## Protected assets and invariants

| Asset | Required property |
| --- | --- |
| Tenant and Provider isolation | Provider access is bound to one Tenant, Actor, AccessGrant, Provider ID, TransferIntent ID and delivery hash. |
| Economic identity | Amount, asset, Provider, purpose, destination, Obligation and delivery hash cannot change after delivery creation. |
| Callback authority | Only the Host-derived System Worker may submit the closed callback operation after signature preflight. |
| Replay safety | An identical command replays the prior result; a conflicting nonce, payload, signature context or immutable identity fails closed. |
| Canonical state | At-least-once transport produces at most one acknowledgement and callback transition and no duplicate economic state. |
| Key material | Private keys, credentials, raw nonces and signatures never enter durable Event/Evidence/projection state or repository fixtures. |
| Availability | Bodies, time, retry count and circuit state are bounded; redirects and dynamic endpoints are unavailable. |
| Auditability | Accepted transitions produce versioned Event, Evidence, outbox, audit and reconciliation state inside the Gateway transaction. |

## Trust boundaries

```text
Tenant Command Gateway
  -> exact AccessGrant and immutable Provider delivery
  -> canonical signed delivery envelope
  -> fixed 127.0.0.1 Provider process and fixed path
  -> Provider verifies delivery and signs callback
  -> System Worker verifies signature, time and binding before admission
  -> serializable Gateway transaction
  -> forced-RLS delivery, acknowledgement, inbox, Event, Evidence and outbox
```

- The Gateway owns authorization, resource resolution, idempotency, economic
  policy, Event/Evidence and commit authority.
- The Provider process can verify, acknowledge and sign a bounded result. It
  cannot discover Tenant resources, choose an endpoint, settle funds, post a
  Ledger entry or create an Obligation.
- The callback worker cannot impersonate the Provider and cannot bypass the
  closed schema or signature preflight.
- The network profile is fixed loopback. There is no DNS resolution, proxy
  trust, redirect following or caller-supplied URL.

## Attacker model

Assume a malicious or faulty Provider can replay, delay, truncate or alter a
delivery or callback; reuse a nonce with different bytes; submit a stale or
unknown key; crash before or after local commit; exceed body limits; cause
timeouts; and attempt cross-Tenant or cross-Provider access. Also assume a
caller may try to supply trusted Tenant, Actor, credential, AccessGrant, key,
network or endpoint context.

Do not assume compromise of the local operating-system account, injected
in-memory private key, PostgreSQL administrator, source tree, or deployment
platform. Those require separate environment and production threat models.

## Control matrix

| Threat | Control | Evidence |
| --- | --- | --- |
| Cross-Tenant/Provider enumeration | Host-derived Actor/Tenant context, exact AccessGrant, forced RLS and non-enumerating denial | Gateway unit and PostgreSQL integration tests |
| Delivery tampering | Ed25519 canonical bytes bind method, fixed path, schema, Provider, intent, payload hash, nonce and time window | Delivery mutation tests |
| Callback forgery or staleness | Signature/key/time/binding preflight occurs before database admission or resource work | Invalid-signature zero-admission tests |
| Duplicate delivery/callback | Immutable replay identity and stored idempotent result | Exact replay produces one acknowledgement and one callback row |
| Conflicting replay | Hash and immutable identity comparison fails closed with no business mutation | Conflicting replay process and Gateway tests |
| Crash before commit | No durable Provider state; a clean restart accepts the same immutable delivery | Real child-process crash test |
| Crash after commit | Persisted redacted state regenerates the same deterministic callback after restart | Real child-process recovery test |
| SSRF/redirect abuse | Fixed `127.0.0.1`, fixed route, no dynamic URL, no redirects or proxy trust | Constructor/source constraints and real transport tests |
| Resource exhaustion | 32 KiB request, 64 KiB response, bounded timeout, maximum three retries and circuit breaker | Oversize/retry/timeout/circuit tests |
| Secret/PII leakage | Closed schemas, redacted view, hash-only nonce result, persistence guards and coarse process errors | Invalid fixtures, database checks and source assertions |
| Economic mutation by Provider | Acknowledgement/callback transitions cannot change amount, asset, destination, Obligation, settlement, Ledger or funds | Domain invariants and PostgreSQL final-state checks |
| MCP privilege expansion | Provider operations are excluded from the exact ten-tool Agent MCP registry | Protocol/MCP drift gate |

## Failure and recovery contract

- Retry only the identical immutable delivery within the attempt budget.
- Return the prior result for exact Gateway idempotency replay.
- Preserve the first accepted result and reject any conflicting replay.
- Open the circuit after bounded failures; do not fabricate settlement,
  repayment or Evidence.
- After a crash, recover only redacted persisted Provider state; never persist a
  private key, raw signature or raw nonce.
- Reconciliation must prove the delivery stream, acknowledgement, callback,
  Event/Evidence/outbox and aggregate version agree.

## Residual risks and no-go boundaries

1. Loopback is a process-isolation proof, not internet-edge security or a
   production Provider integration.
2. Keys are injected for the local conformance run; production issuance,
   rotation, revocation, HSM/KMS custody and incident ownership are unapproved.
3. There is no production KYP, Provider contract, SLA, settlement account,
   custody, capital source, payment rail or real asset.
4. The UI reports system capability only. It does not prove that its current
   Obligation was delivered to or executed by a Provider.
5. Independent penetration testing and deployment-specific review remain
   mandatory before any external exposure.

## Verification commands

```sh
pnpm run test:provider
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check
git diff --check
```

## References

- `../codex/tasks/PROVIDER_001A_SIGNED_PROVIDER_SANDBOX_PROPOSAL.md`
- `../architecture/ADR-032-signed-provider-sandbox-boundary-proposal.md`
- `IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`
- `IPO_ONE_AUTHENTICATED_TRANSPORT_BOUNDARY_v0.1_DRAFT.md`
