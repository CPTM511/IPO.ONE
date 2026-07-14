# IPO.ONE Public Beta Launch Readiness v0.3

Version: v0.3
Date: 2026-07-14
Status: Public no-real-funds sandbox hosted at `https://ipo.one`; private-data,
real-value, protected-release, notification, and named incident-owner gates
remain open

This gate applies only to the public, no-real-funds sandbox. It does not approve
production credit, custody, KYC processing, contracts, external Providers,
capital, or Human lending.

## Hosted Deployment Checkpoint (2026-07-13)

The approved public-sandbox boundary is now deployed in GCP project
`ipo-one-public-sandbox-cptm511`, region `asia-southeast1`, at release
`00598584f437f71ebb1dd8a3517585ad8fc96ce9`.

Verified hosted controls:

- GoDaddy remains authoritative; only the root A value changed to the reserved
  load-balancer IP `136.68.214.66`. NS, MX, SPF/TXT, `www`, and `apiv1` were
  preserved.
- Google-managed certificates for `ipo.one` and `www.ipo.one` are active;
  HTTP redirects to HTTPS and the edge requires minimum TLS 1.2.
- Cloud Armor rejects unknown hosts, applies a per-IP throttle, records denies,
  and keeps SQLi/XSS rules in preview pending false-positive review.
- Cloud Run accepts only internal/load-balancer ingress, exposes no default
  `run.app` URL, runs the immutable digest-pinned image as the zero-role runtime
  identity, and reports the exact release SHA.
- Three-region certificate-validating readiness monitoring and alert policies
  for readiness, 5xx, P99 latency, and instance saturation are enabled.
- Live SDK and Human UI flows completed the full no-funds obligation lifecycle;
  the UI was inspected at 1440x900 and 390x844.

This checkpoint is hosted public-sandbox evidence only. It does not satisfy the
policy's protected-environment approval, named alert-recipient, incident-owner,
independent penetration-test, private-data, or real-value gates. Detailed
resource identifiers, test evidence, scanner results, and rollback state are in
`docs/security/IPO_ONE_PUBLIC_SANDBOX_DEPLOYMENT_EVIDENCE_v0.1.md`.

## Local Security-Control Checkpoint (2026-07-14)

Tenant/RLS, provider-neutral AuthN, deny-by-default object AuthZ, durable
exact-command dual control, and a disabled-by-default protective break-glass
state machine plus atomic rate/resource/cost admission are now implemented and
tested as local non-funds boundaries. A separate durable Tenant Command Gateway
now composes Agent Subject creation, unsigned non-executable draft Mandate
creation, Human owner read, terminal reason-coded draft revocation, and bounded
Agent self-read with domain-anchored resource caps. DATA-003C adds a strong-MFA,
reason-coded, idempotent Risk/Operations protective Subject freeze with exact
replay and concurrent single-transition proof; unfreeze remains absent and
dual-control gated. DATA-003D adds a recent-MFA Risk/Auditor aggregate portfolio
read over one serializable, forced-RLS view of Agent Subject, CreditLine, and
Obligation state. It returns complete exact totals plus at most 50 asset rows,
omits entity identity and PII, and writes only audit/admission evidence. API-002
publishes and enforces a closed versioned request/result/catalog contract for
exactly those seven operations. Caller data
excludes Authentication Context and trusted network facts; malformed requests
fail before admission and malformed handler results fail before commit.
These controls are deliberately not deployed over the anonymous public sandbox.
Human IdP selection, production Credential provisioning and identity adapters,
remaining DATA-003 lifecycle handlers, a production distributed quota/edge
provider, production roles, named break-glass owners/notifications, private-data
approval, and any real-value authority remain open gates.

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
| Local Tenant resource admission | SEC-D08 Actor/client/Tenant/operation/network/account limits, bounded resources/cost, resource-blind problems, atomic PostgreSQL races, restart leases, and forced RLS pass local tests; this is not deployed on the anonymous sandbox. |
| Local Tenant Gateway | Human-controlled Agent Subject creation, unsigned draft Mandate create/read/revoke, bounded Agent self-read, and one-way Risk/Operations protective Subject freeze commit through one PostgreSQL authority boundary; no public route, unfreeze, or executable Mandate is enabled. |
| Protocol correctness | Schema, boundary, migration, domain, Ledger, Mandate, Rail, Evidence, risk, and vertical-slice checks pass. |
| Durable Rail proof | PostgreSQL migration, rollback, idempotency, concurrency, outbox/inbox, and restart replay suite passes. |
| Supply chain | Locked pnpm install, production audit, and a GitHub Actions quality gate are present. |
| Production runtime | Invalid public mode, origin, Host, HTTPS proxy, HSTS, release, or no-real-funds configuration fails closed. |
| Container boundary | Digest-pinned Node 24 LTS image, non-root runtime, health check, and CI read-only/no-capability smoke are defined. |
| Machine discovery | Human/Agent endpoints and disabled real-funds/Human-credit capabilities are explicit at `/.well-known/ipo-one.json`. |
| Launch governance | Versioned profiles require canonical fresh evidence, exact commit and image digest, complete named gates, and protected-environment authorization; private-data and real-value profiles are policy-locked. |

Sandbox session IDs are isolation hints, not credentials. Knowledge of an ID
must never be treated as identity, authorization, or tenant membership.

## Hosted Release Checklist

- [x] GitHub Actions quality workflow passes on the exact release commit.
- [ ] `launch:verify` passes against private evidence for the exact release SHA;
  the committed pending template continues to fail.
- [x] Repository production configuration, Host/HTTPS enforcement, probes, and
  immutable release metadata are implemented and adversarially tested.
- [x] Cloud Run origin is load-balancer-only with its default URL disabled.
- [x] Hosting target, TLS, domain, origin, proxy trust, and DNS rollback are approved and verified.
- [x] Edge request limits and coarse abuse protection are enabled; application body limits remain fail-closed.
- [x] Application logs retain request IDs but exclude request bodies, queries,
  sandbox session IDs, raw IPs, secrets, and raw PII.
- [ ] Hosted edge and cloud log fields/30-day default retention are formally reviewed and approved.
- [ ] Continuous monitoring covers readiness; a one-time full smoke passed, but a scheduled full synthetic lifecycle is not yet configured.
- [x] Public copy states no real lending, no real funds, no financial advice, and demo score only.
- [x] Analytics remains disabled unless privacy review explicitly approves it.
- [ ] Incident contact and takedown procedure are documented before sharing broadly.

## Production No-Go

The following remain blockers for any real value or private multi-tenant launch:

- Production Human IdP, Credential provisioning, identity/authorization/audit
  transport adapters, completion of authenticated Tenant command composition,
  and a
  reviewed production distributed quota/edge provider using ABUSE-001.
- Production role assignment, named dual-control operators, break-glass
  custodians/review owner/notification delivery, and protected activation.
- Production database backup/restore, scheduled reconciliation, authorized
  operator replay, and reviewed deployment of the durable Tenant Gateway.
- Signed Mandates, nonce/key rotation, wallet verification, and remote attestations.
- Certified Provider workers, signed webhooks, custody/fund-path review, and caps.
- Legal, risk, security, privacy, and jurisdiction approval.

The remaining controls are sequenced in `DATA-003`, `AUTH-002`, `PROVIDER-001`,
and `OPS-001`; completed local SECURITY-001, APPROVAL-001, ABUSE-001, DATA-002,
and RECON-001 foundations do not satisfy the production operations
gate. A public beta success must not be
relabelled as production financial readiness.

The repository-level attack model and residual-risk register are maintained in
`docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`. Application limits are
defense in depth and do not close the hosted edge checklist above.

The implemented hosting boundary and operator sequence are maintained in
`docs/architecture/ADR-014-public-sandbox-hosting-boundary.md` and
`deploy/gcp/README.md`. The external control record is maintained separately in
`docs/security/IPO_ONE_PUBLIC_SANDBOX_DEPLOYMENT_EVIDENCE_v0.1.md`.

`deploy/launch-policy.v1.json` and its verifier make release evidence
machine-checkable, but do not replace protected-environment review, cloud IAM,
edge validation, or DNS change authorization. Only the public no-real-funds,
no-private-data profile is currently enabled.
