# PROVIDER-001A signed Provider sandbox implementation audit

Date: 2026-07-17
Scope: approved local no-funds Provider permissions, process boundary,
signature/replay/crash behavior, durable PostgreSQL state, reconciliation, UI
status and desktop/mobile design QA.

## Outcome

Passed for the approved local boundary. IPO.ONE now has a separately running,
fixed-loopback Provider sandbox that verifies a signed immutable delivery,
supports exact Provider read/acknowledgement through an AccessGrant, returns a
signed callback, and commits one durable callback result without duplicating
canonical state.

This is not a public or remote Provider integration and does not enable a
production credential, KYP decision, settlement account, custody, capital,
mainnet or real funds. The Payments UI reports capability status only and
explicitly states that its current Obligation has no Provider execution.

## Security and recovery evidence

- Ed25519 canonical binding covers fixed method/path, schema, Provider,
  TransferIntent, payload hash, nonce and issued/expiry time.
- Signature and resource binding preflight occurs before database admission.
- Provider read and acknowledgement require one exact current
  `provider_intent_delivery` AccessGrant and expose a redacted view.
- The separate process uses fixed `127.0.0.1`, a fixed path, bounded bodies and
  time, at most three retries, no redirects or dynamic URL, and a circuit
  breaker.
- Exact replay returns the prior result; conflicting replay fails closed.
- Real child-process tests cover crash before commit, crash after commit,
  restart, delivery mutation, retry exhaustion and circuit opening.
- Durable state stores no private key, raw nonce, raw signature, credential,
  settlement account or PII.
- The Agent MCP registry remains exactly ten tools and exposes none of the
  three Provider operations.

## Verification matrix

| Gate | Result |
| --- | --- |
| Node runtime | Node 24.18.0 / pnpm 11.1.3 |
| Full repository | 276/276 |
| PostgreSQL 17 fresh disposable database | 55/55 |
| Security | 21/21 |
| Human/Agent transport | 35/35 |
| Provider real-process conformance | 5/5 |
| Schemas | 41 contracts |
| Migrations | 21 up/down pairs |
| Private protocol | 32 operations, 48 request fixtures, 39 result fixtures |
| Agent MCP | exactly 10 tools |
| Diff whitespace | clean |

The PostgreSQL run includes migration up/down/up, forced RLS, exact
AccessGrant binding, invalid-signature rejection, replay, callback atomicity,
redaction and full reconciliation.

## Product and visual QA

The existing Aave-grounded IPO.ONE design system was reused: high-contrast
workspace context, white operational cards, compact table-like metrics,
lavender state hierarchy and restrained status indicators. No new visual
language or Provider-specific navigation fork was introduced.

Human and Agent Payments both expose the same Provider capability card over the
shared kernel. At 1440x1000 the delivery, acknowledgement, callback, replay and
reconciliation states remain scannable beside the boundary explanation. At
390x844 they stack into one column, keep the safety disclaimer visible and
produce `scrollWidth === clientWidth === 390`. Browser diagnostics were empty.

Current-run captures:

- `artifacts/product-design-audit/2026-07-17-provider-sandbox/01-provider-human-desktop.png`
- `artifacts/product-design-audit/2026-07-17-provider-sandbox/02-provider-human-mobile-390.png`
- `artifacts/product-design-audit/2026-07-17-provider-sandbox/03-provider-card-mobile-390.png`

## Commercialization conflict rule

Historical demo behavior and copy are not compatibility requirements. Where a
demo route, fixture, screen or process-local state conflicts with Product
Charter v1.1 or an approved commercialization requirement, the newer formal
requirement wins. Retained demo infrastructure must remain isolated, labelled
as test/educational infrastructure and unable to supply authenticated product
truth.
