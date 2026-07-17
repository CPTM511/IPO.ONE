# WEB-002: Dual-Native Product Shell and Borrow Journey

Status: In progress. Aave.com was approved as the primary UI
reference on 2026-07-15, and the project owner supplied three desktop captures
covering the bright consumer hero, dark professional Borrow workspace, and
market-summary/data-table application shell. The existing control plane remains
the functional baseline and must not be degraded.

The 2026-07-15 authenticated-application increment wires the Human browser
surface to the approved loopback Tenant protocol through Offer. Agent entry
uses the same canonical operations through the local MCP adapter. Acceptance,
Obligation, execution, and repayment remain separately gated.

The Principal-controlled Agent-authority increment also wires the approved
Agent Subject, Draft Mandate, exact read, and sandbox Activation operations into
the Human browser surface. Newly created Subjects remain `pending`; the UI does
not invent the still-unapproved durable CAIP-10 proof and Subject activation
transition recorded in `IDENTITY-001`.

## Context

WEB-001 delivered a strong Agent-oriented operator console. Product Charter
v1.1 requires a formal borrower product with Human and Agent as first-class
entry modes. The new shell should use Aave as a benchmark for portfolio/risk
hierarchy and Goldfinch as a benchmark for facility terms and repayment
Evidence, while retaining IPO.ONE identity and protocol semantics.

The approved primary reference is <https://aave.com/>. Its official current
information architecture puts product entry ahead of protocol explanation and
organizes lending choices as named market/strategy surfaces with recognizable
asset objects and explicit trust indicators. IPO.ONE should translate those
patterns into available credit, current obligations, repayment performance,
Evidence, and risk controls. It must not copy Aave branding, imagery, wording,
or over-collateralized market semantics.

The approved captures establish the selected visual target: a calm white and
lavender entry surface, a high-contrast graphite workspace, restrained rounded
controls, large financial numerals, explicit market/risk summaries, and a
spacious data card that remains scannable at high density. IPO.ONE will apply
that hierarchy to Human/Agent identity, available sandbox capacity, Credit
Intent, obligations, Evidence, and risk state without copying Aave marks,
product claims, assets, or over-collateralized market semantics.

## Scope

- Establish Home/Portfolio, Borrow, Activity/Evidence, Developers/Agents, and
  permissioned Risk Operations destinations.
- Provide distinct Human and Agent entry/authentication presentation over the
  same application protocol.
- Build a guided Credit Intent -> Decision -> Offer -> Acceptance -> Execution
  -> Repayment journey with explicit sandbox disclosures.
- Make available capacity, obligations, next payment, performance, reason codes,
  and risk posture understandable without protocol expertise.
- Preserve Agent capability catalog, SDK/OpenAPI setup, request IDs, and
  Evidence inspection.
- Cover loading, empty, error, stale Offer, frozen Subject, DPD/default, success,
  and offline states.
- Meet desktop, tablet, mobile, keyboard, screen-reader, contrast, reduced-motion,
  and no-horizontal-overflow requirements.

## Non-Goals

- No copy of Aave/Goldfinch branding, assets, token-market economics, or DAO UI.
- No real wallet signing, KYC upload, capital, fund movement, or withdrawal.
- No visual-only fake action for the core lifecycle.
- No production deployment in the design/implementation issue.

## Likely Files

- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/app.js`
- `apps/web/src/icons.svg`
- `apps/web/test/static-ui.test.js`
- `apps/api/src/server.js`
- `packages/api-contract/*`
- `docs/design/IPO_ONE_DUAL_NATIVE_UX_SPEC_v0.1.md`

## Acceptance Criteria

- [x] A selected and documented visual target exists before implementation.
- [x] Human and Agent users each reach their primary action within one top-level
  navigation decision.
- [ ] Both entry modes complete the same real no-funds lifecycle API.
- [x] Every visible financial value through Offer maps to canonical API state;
  the shell does not calculate or invent Decision/Offer terms.
- [x] Core Subject, Consent, Intent, Decision, and Offer interactions,
  validation, errors, and disconnected-session recovery are functional.
- [x] The Human Principal can create an Agent Subject, draft/read the exact
  bounded Mandate, and activate it only when the server recognizes an eligible
  active Subject; pending Subjects remain visibly blocked.
- [x] A draft Mandate enables the credential-free application handoff and an
  active Mandate enables the post-application runtime handoff; both expose
  exactly four local MCP tools while public OpenAPI/SDK, private Tenant protocol,
  and local stdio MCP remain visibly separate trust boundaries.
- [x] 1440x1024, 834x1194, 390x844, and 360x732 pass visual and overflow QA.
- [x] Keyboard-only and assistive-technology landmarks/status pass static and
  desktop/mobile browser checks, including mobile menu focus handoff and Escape
  restoration.
- [x] The page clearly distinguishes simulated from real capabilities.

## Test Commands

```sh
pnpm run check
pnpm run smoke:api
pnpm run demo
git diff --check
```

Browser verification must exercise Human and Agent flows, capture each core
state at desktop and mobile widths, inspect console errors, and assert
`scrollWidth <= innerWidth`.

## Security Checklist

- [x] No API value is inserted with `innerHTML`.
- [x] No credentials, private keys, raw signatures, or PII are rendered/stored.
- [x] CSP and existing browser-security headers remain restrictive.
- [x] UI state never grants authority or bypasses server policy.
- [x] Errors remain bounded and retain request correlation without internals.
- [x] No real funds or production-credit claim is introduced.

## Current Implementation Evidence

- Human and Agent entry modes, Aave-informed product hierarchy, and the updated
  information architecture are implemented in the existing static app without
  degrading the public Agent lifecycle.
- The Human surface now discovers the authenticated private catalog, creates a
  Human Subject and scoped Consent, submits a canonical Credit Intent, invokes
  deterministic evaluation, and renders only returned Decision/Offer values.
  Tenant/actor/permission context remains transport-injected and never appears
  in the form payload.
- Human POST operations also require the BFF-issued CSRF token. The loopback
  host injects the per-session token into a fixed no-store bootstrap meta field;
  the UI sends it in `x-csrf-token` and stays disabled when bootstrap is absent.
- `createTenantWebAssetHandler()` lets an approved loopback composition serve
  the Human shell and private API from one origin using a fixed asset allowlist,
  restrictive browser headers, and no synthesized authentication.
- Offer acceptance is a disabled control labeled `CREDIT-001E`; no Obligation
  or funds effect is implied by an approved Offer.
- The Principal-controlled Agent workbench calls only
  `pilotCreateAgentSubject`, `pilotCreateDraftMandate`, `pilotReadMandate`, and
  `pilotActivateSandboxMandate`. Capabilities are the approved closed set;
  server Mandate/terms hashes are read-only; activation requires an explicit
  checkbox and the exact acknowledgement code.
- A newly created Agent Subject remains `pending`, can create a Draft Mandate,
  and cannot acknowledge or activate it. An already provisioned active Subject
  can complete exact-hash activation and exposes the returned Evidence hash for
  MCP handoff.
- Agent API consumes the exact loaded Mandate state to produce a non-authorizing
  `agent_handoff_manifest.v1` packet. It exposes no Tenant/actor selection,
  credential, remote endpoint, or funds authority; copy remains disabled without
  an eligible draft or active Mandate and each ready phase contains exactly the
  four TRANSPORT-001 tool/operation pairs.
- The versioned machine contract also distinguishes an `application_ready`
  draft-Mandate packet from the post-activation `ready` runtime packet. The
  former now completes the four existing MCP calls through durable Offer; the
  active runtime Host fails closed if asked to start a new application. The
  Human Principal UI now exposes the draft-only `Open application handoff`
  control and the active-only runtime control with distinct phase, authority,
  scope, and tool-readiness copy.
- The packet is governed by a closed JSON Schema, valid/invalid conformance
  fixtures, an immutable browser constructor, and CI parity against the MCP
  registry rather than by duplicated presentation copy alone.
- Public sandbox SDK/OpenAPI facts, the 17-operation private Tenant catalog, and
  the four-tool local MCP surface are labeled independently. The public current
  origin is not described as a private MCP endpoint.
- `IDENTITY_001_DURABLE_AGENT_ACCOUNT_BINDING.md` specifies—but does not
  authorize—the missing Human challenge, Agent CAIP-10 proof, and atomic
  pending-to-active transition needed for self-contained Agent onboarding.
- `docs/design/IPO_ONE_DUAL_NATIVE_UX_SPEC_v0.1.md` records the selected design
  language, navigation model, product-state rules, and remaining authority gates.
- `design-qa.md` records desktop and responsive screenshots, side-by-side
  reference comparison, fixed visual issues, exact viewport measurements, and
  mobile navigation focus behavior.
- Current regression counts are recorded in `design-qa.md` after each visual
  and interaction QA cycle.
- Current authenticated increment: `pnpm run check` 208/208,
  `pnpm run test:transport` 14/14, `pnpm run test:security` 21/21, and
  PostgreSQL integration 53/53.
- `pnpm run test:security`: 21/21 tests pass with localhost binding allowed.
- 1440x1024 Human entry and completed Agent lifecycle pass visual, interaction,
  overflow, and console checks. Chrome also verifies 834x1194, 390x844, and
  360x732 with no horizontal overflow; the 390px Agent lifecycle reaches 6/6,
  balanced Ledger, replay v5, and zero outstanding principal.
- Mobile menu focus/inert/Escape behavior passes, and 360px primary controls
  now expose at least 44px target height.
