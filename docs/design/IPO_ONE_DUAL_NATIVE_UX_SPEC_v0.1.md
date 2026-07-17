# IPO.ONE Dual-Native UX Specification v0.1

Status: Implemented through the authenticated Intent -> Decision -> Offer cut
and the approved Principal-controlled Agent Mandate activation boundary on
2026-07-15. This specification does not broaden protocol permissions, add a
public Tenant endpoint, activate a newly created pending Agent Subject, accept
an Offer, create an Obligation, or enable real funds.

## Visual Direction

The project owner approved three Aave desktop captures as the primary visual
reference. IPO.ONE adopts their product qualities rather than their brand:

- a high-contrast graphite product header with one large financial headline;
- restrained lavender emphasis for the core proposition and active state;
- a spacious white data card that overlaps the portfolio header;
- large financial numerals, compact status chips, and scan-first tables;
- rounded but not decorative controls, with one clear primary action;
- a persistent professional navigation rail for dense protocol operations.

IPO.ONE does not copy Aave marks, product names, token assets, screenshots,
claims, market economics, or over-collateralized lending terminology.

## Information Architecture

| Destination | Human purpose | Agent purpose |
| --- | --- | --- |
| Human Pilot | Understand Consent, Credit Intent readiness, privacy, and locked gates | Inspect Human compatibility of the shared kernel |
| Portfolio | See capacity, outstanding balance, Lockbox, Evidence score, and risk tier | Run and verify the Agent obligation lifecycle |
| Agent Workspace | Read Subject, Principal, Mandate, account binding, and Lockbox state | Configure identity, authority, and cashflow routing |
| Borrow & Credit | Inspect credit capacity, policy reasons, and learning Evidence | Request the existing Agent sandbox Credit Line |
| Payments | Inspect provider spend, settlement, revenue capture, and repayment | Execute the existing no-funds Agent lifecycle |
| Evidence | Inspect versioned protocol events and replay state | Correlate requests, decisions, settlement, and repayment |
| Risk Operations | Inspect bounded controls and reset the sandbox | Inspect contracts and aggregate state without bypassing policy |
| Agent API | Distinguish public OpenAPI/SDK from private local MCP; inspect and copy a non-authorizing Principal handoff | Read four self-owned tools and continue from an active Subject/Mandate without browser credentials |

The Human/Agent switch is an entry-mode selector. Human opens the formal Human
Pilot product surface; Agent opens the operable Agent portfolio. Shared
Evidence and Risk views remain readable from either entry.

## Product-State Rules

- Human Credit Intent is available through the authenticated loopback Tenant
  Gateway because HUMAN-001C and CREDIT-001C are verified.
- Decision and Offer are available through the same private request envelope
  because CREDIT-001D is verified; visible values come only from its canonical
  response.
- The Human application composes self-read, Intent, application read, and
  evaluation under one correlation ID. It preflights the selected active
  Consent plus current synthetic Identity Reference and returns a closed,
  immutable `human_credit_offer_workflow_receipt.v1` after evaluation.
- The Offer console exposes one copy action for that Receipt. The copied JSON
  carries canonical Intent/Decision/Offer and step Evidence only; it is
  explicitly non-authorizing, credential-free, remote-disabled, and
  funds-disabled.
- Acceptance is explicitly labeled `CREDIT-001E locked`; execution remains
  disabled and the UI does not simulate either transition.
- Human Tenant/actor/permission context is supplied by the BFF composition and
  is never accepted from a browser field. Agent entry reaches the same Intent,
  Decision, and Offer operations through the local MCP adapter.
- Human mutations require the session-specific CSRF bootstrap supplied by the
  BFF host. A readable catalog without that token renders a blocked state and
  cannot submit Subject, Consent, Intent, or evaluation commands.
- Agent actions continue to call the existing session-isolated public sandbox
  API and show canonical API state after every mutation.
- The authenticated Human Principal surface can create an Agent Subject,
  draft/read its exact bounded Mandate, and activate only a server-eligible
  active Subject. The fixed UI capability set is `request_credit`,
  `accept_credit_offer`, and `execute_sandbox_credit`; this does not expose the
  corresponding acceptance or execution Gateway operations.
- Newly created Agent Subjects remain `pending`. The acknowledgement and
  activation controls remain disabled while that status is known. The UI may
  load an already provisioned Subject/Mandate but does not simulate CAIP-10
  proof, mint an Agent credential, or grant itself the missing Subject
  activation permission.
- Mandate and terms hashes are rendered from `pilotReadMandate`, remain
  non-editable, and are sent back only after explicit Principal confirmation.
  The returned activation Evidence hash is shown for audit and Agent MCP
  handoff.
- The Agent API handoff packet is presentation metadata, not a credential or
  protocol authorization. Its closed `agent_handoff_manifest.v1` contract
  distinguishes a draft `application_ready` phase from the active runtime
  `ready` phase and includes exact Subject/Mandate IDs, hashes, bounded authority, protocol/tool
  versions, and explicit `credentialsIncluded=false`, local-stdio,
  remote-disabled, and funds-disabled statements.
- Agent API renders exactly the four TRANSPORT-001 tools. Waiting state disables
  copy; ready state starts with `ipo_one_read_self`. Offer acceptance and
  execution capabilities may exist in the Mandate but remain unavailable as
  MCP tools until their separate Gateway permissions are approved.
- The visible UI derives the handoff phase from the exact loaded Mandate. A
  draft exposes `Open application handoff`, `application_ready`, draft authority,
  and four application-ready tools; an active Mandate exposes only the
  post-application `ready` runtime packet. Waiting state remains non-copyable.
- The 21-operation public demo OpenAPI/SDK and 17-operation private Tenant
  catalog are labeled separately. A public sandbox URL is never presented as
  the private Agent MCP endpoint.
- All values and actions remain labeled no-funds, synthetic, or sandbox-only.
- Raw KYC, PII, credentials, signatures, keys, and production identifiers never
  appear in the interface.

## Interaction and Accessibility

- The top-level mode switch reaches the Human or Agent primary workspace with
  one decision.
- Sidebar navigation uses buttons with `aria-current`; mobile navigation keeps
  its inert background and Escape/focus-trap behavior.
- The Human primary CTA focuses the authenticated application workbench without
  mutating the URL or implying that an application was submitted.
- The secondary Human CTA focuses the Principal-controlled Agent workbench.
  Its numbered Subject -> Draft -> exact review -> Activation stages preserve
  the same form, dark-result-console, helper, and disabled-state patterns as the
  Human credit application.
- A verified draft Mandate enables `Open application handoff`; successful
  activation changes the control to `Open Agent API handoff`. Agent API can
  return to the exact Principal setup. The copied JSON uses a versioned
  `agent_handoff_manifest.v1` shape, retains no credential, and exposes stable
  tool/operation pairs for machine ingestion.
- Mutation results use bounded status/toast messages and retain API request
  correlation.
- Keyboard focus, reduced motion, semantic landmarks, live regions, and the
  skip link remain part of the existing product shell.
- Mobile controls expose a minimum 44px target at 640px and below. Exact
  834x1194, 390x844, and 360x732 Chrome checks prove no horizontal overflow;
  the mobile navigation focus handoff and Escape restoration also pass.

## Remaining WEB-002 Gates

1. Durable CAIP-10 proof and newly created Agent Subject activation require
   explicit `IDENTITY-001` approval. This gate must land before a newly onboarded
   Agent can activate its own Principal-approved Mandate.
2. Offer acceptance and shared Obligation v2 require explicit `CREDIT-001E`
   approval; an offered status is not acceptance.
3. Execution and shared repayment require explicit `CREDIT-001F` approval.
4. Servicing transitions require separate `SERVICING-001` approval.
5. Remote/public transport and production identity/deployment remain disabled;
   the implemented browser host is loopback-only.

The responsive visual gate is rechecked with each authenticated increment in
`design-qa.md`. The gates above remain protocol requirements; presentation does
not make an unavailable lifecycle transition operable.
