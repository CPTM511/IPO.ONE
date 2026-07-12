# IPO.ONE Public Beta Launch Readiness v0.3

Version: v0.3
Date: 2026-07-12
Status: Repository hosting baseline complete; hosted release requires a green
CI run plus explicit cloud, edge, monitoring, security, and DNS approval

This gate applies only to the public, no-real-funds sandbox. It does not approve
production credit, custody, KYC processing, contracts, external Providers,
capital, or Human lending.

## Launch Definition

The public beta demonstrates one complete Agent Lockbox obligation lifecycle to
two audiences over one state model:

1. A Human Operator can inspect and execute Agent setup, Mandate, Lockbox,
   Credit, Provider Spend, Settlement, Revenue, Repayment, Evidence, and Risk.
2. An Agent developer can use the same surface through OpenAPI 3.1.2 and the
   zero-dependency JavaScript SDK with stable problems and request correlation.

## Verified Gates

| Gate | Local launch-candidate result |
| --- | --- |
| Product flow | Agent -> Lockbox -> Credit -> Spend -> Settlement -> Revenue -> Repayment -> Evidence completes through the UI and SDK. |
| Human/Agent UX | Operator Console and Agent Runtime are separate modes over shared state. |
| Responsive UI | 1440x1000 and 390x844 inspected with no horizontal overflow, clipped controls, or blank primary surface. |
| Accessibility baseline | Landmarks, labels, focus visibility, live status, reduced motion, inert mobile drawer, Escape close, and focus loop are implemented. |
| API contract | 21/21 implemented routes match OpenAPI and SDK mappings. |
| Browser safety | CSP, frame denial, MIME protection, no-referrer, permissions policy, and same-origin isolation are returned by the live server. |
| Visitor isolation | High-entropy sandbox partitions use a 30-minute TTL, 128-entry LRU, serialized operations, and a 32-mutation budget; SDK/browser clients retain one partition per session. |
| Adversarial HTTP boundary | Strict methods/media types, 64 KiB bodies, bounded JSON/amounts/targets, parser and path hardening, timeouts, connection/concurrency/request limits, and redacted problems pass a live attack suite. |
| Protocol correctness | Schema, boundary, migration, domain, Ledger, Mandate, Rail, Evidence, risk, and vertical-slice checks pass. |
| Durable Rail proof | PostgreSQL migration, rollback, idempotency, concurrency, outbox/inbox, and restart replay suite passes. |
| Supply chain | Locked pnpm install, production audit, and a GitHub Actions quality gate are present. |
| Production runtime | Invalid public mode, origin, Host, HTTPS proxy, HSTS, release, or no-real-funds configuration fails closed. |
| Container boundary | Digest-pinned Node 24 LTS image, non-root runtime, health check, and CI read-only/no-capability smoke are defined. |
| Machine discovery | Human/Agent endpoints and disabled real-funds/Human-credit capabilities are explicit at `/.well-known/ipo-one.json`. |

Sandbox session IDs are isolation hints, not credentials. Knowledge of an ID
must never be treated as identity, authorization, or tenant membership.

## Hosted Release Checklist

- [ ] GitHub Actions quality workflow passes on the exact release commit.
- [x] Repository production configuration, Host/HTTPS enforcement, probes, and
  immutable release metadata are implemented and adversarially tested.
- [x] Proposed Cloud Run origin is load-balancer-only with its default URL disabled.
- [ ] Hosting target, TLS, domain, origin, proxy trust, and rollback owner are approved.
- [ ] Edge request/body limits and coarse abuse protection are enabled.
- [x] Application logs retain request IDs but exclude request bodies, queries,
  sandbox session IDs, raw IPs, secrets, and raw PII.
- [ ] Hosted edge and cloud log fields/retention are reviewed and approved.
- [ ] Availability monitoring checks `/healthz` and the full smoke path.
- [ ] Public copy continues to state no real lending, no real funds, no financial advice, and demo score only.
- [ ] Analytics remains disabled unless privacy review explicitly approves it.
- [ ] Incident contact and takedown procedure are documented before sharing broadly.

## Production No-Go

The following remain blockers for any real value or private multi-tenant launch:

- AuthN, tenant model, RBAC, object authorization, dual control, and break-glass.
- Durable non-Rail state, backup/restore, reconciliation, and operator replay.
- Signed Mandates, nonce/key rotation, wallet verification, and remote attestations.
- Certified Provider workers, signed webhooks, custody/fund-path review, and caps.
- Legal, risk, security, privacy, and jurisdiction approval.

Those controls remain sequenced in `SECURITY-001`, `DATA-002`, `RECON-001`,
`AUTH-002`, `PROVIDER-001`, and `OPS-001`. A public beta success must not be
relabelled as production financial readiness.

The repository-level attack model and residual-risk register are maintained in
`docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`. Application limits are
defense in depth and do not close the hosted edge checklist above.

The proposed hosting boundary and operator sequence are maintained in
`docs/architecture/ADR-014-public-sandbox-hosting-boundary.md` and
`deploy/gcp/README.md`. Neither document is deployment evidence until the
external controls are applied and verified.
