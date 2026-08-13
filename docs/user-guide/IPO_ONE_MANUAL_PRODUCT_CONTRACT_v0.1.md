# IPO.ONE Manual-to-Product Contract v0.1

Status: Local Closed Pilot acceptance contract
Applies to: `IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`

This compact contract turns the user manual into a testable product
requirement. A documented action is accepted only when the named role can reach
the page, satisfy the visible prerequisite, click the exact control, and read
the server-derived result. A backend-only success does not satisfy this
contract.

## Account access

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Signed-out Home | `Sign in` | Authentication options check finished | Access dialog opens and contains only methods verified for the host and current browser |
| Access dialog | `Check for wallets again` | Wallet authentication enabled, no compatible browser Provider found | One bounded client-side Provider rediscovery runs; no account, network, signature or authority is requested |
| Access dialog | `Check sign-in again` | Authentication options unavailable | Exactly one read-only options request runs; success replaces the recovery state and failure remains explicitly retryable |
| Access dialog | `Copy access details` | Authentication options unavailable | A privacy-safe diagnostic is copied for the existing invitation channel with no credential, account address or private resource identity |

Unavailable OIDC and wallet methods must be absent, not permanently disabled.
Network choices appear only after an exact compatible wallet is selected.
Authentication and Provider selection create no credit, Mandate, chain, funds
or business authority. A named ordinary-support channel remains an L2 pilot
gate and must not be inferred from this local recovery path.

Permanently unavailable product capabilities are status, not controls. Deposit,
capital allocation, funding, withdrawal, public-pool entry, production pricing,
worker settlement and transaction submission must appear only as
non-interactive phase-boundary rows with an exact reason. They must not be
buttons, links, tab stops or hidden request paths. State-dependent buttons may
remain temporarily disabled only while a real, visible prerequisite is
incomplete and must become actionable when current server truth satisfies it.

## Human borrowing

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Home | `Start Human application` | Authenticated Human session | Credit opens in Human Workspace |
| Credit | `Create Human Subject` | Active session | Opaque Subject is loaded |
| Credit | `Create scoped Consent` | Subject loaded | Consent is ready |
| Credit | `Request & evaluate credit` | Subject and Consent loaded | Decision, reasons, and exact Offer appear |
| Credit | `Confirm & create sandbox Obligation` → `Confirm with account` | Current Offer acknowledged | Shared Obligation and schedule appear |
| Credit | `Confirm sandbox execution` → account confirmation | Obligation created | Approved sandbox use is executed |
| Credit | `Confirm early or scheduled repayment` → account confirmation | Execution complete and balance positive | Partial or full repayment and outstanding balance update |
| Credit | `Load timeline` | Obligation exists | Owner-authorized Evidence events load |

## Agent borrowing

The Principal Agent-authority page derives its sole Agent, Subject and Mandate
locators from authenticated `pilotReadWorkspaceResume` server truth. Actor,
Subject and Mandate IDs are not editable prerequisites. Exactly one assignment
auto-opens; zero or ambiguous assignments expose a non-interactive safe state,
dispatch no mutation and never fall back to browser storage or a default ID.
Identifiers and hashes remain queryable only under collapsed technical details.
Completed setup stages are progressively hidden: the normal screen exposes only
the current next action and never a duplicate handoff action or a previous
stage's permanently disabled controls.

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Home | `Open Agent credit` | Authenticated session and Agent Workspace | Agent Console opens |
| Credit / Principal | `Create Agent Subject` | Exactly one server-assigned Agent and no existing Subject | Pending Agent Subject appears without entering an actor or Subject ID |
| Credit / Principal | `Create signing request` | Automatically restored pending Agent Subject | Short-lived account proof challenge appears |
| Credit / Principal | `Ask registered test Agent to prove` | Open challenge | Server-held Agent account binding becomes active |
| Credit / Principal | `Create Draft Mandate` | Automatically restored bound Agent Subject and no existing Mandate | Exact Draft Mandate appears and becomes the transient current locator |
| Agent Console | `Run local Agent application` | Local no-funds profile, verified Agent identity, and Draft Mandate | Registered server-held Agent creates and persists the deterministic Decision and Offer receipt; no credential enters the browser |
| Agent Console | `Check for Agent Offer` | Verified Agent identity and Draft Mandate | Persisted Decision and Offer workflow receipt appear after the external Agent application |
| Agent Console | `Review and activate this Mandate` | Offer ready | Principal review opens |
| Credit / Principal | `Activate exact Sandbox Mandate` | Exact Mandate acknowledged | Mandate becomes active |
| Agent Console | `Complete sandbox Agent lifecycle` | Local no-funds profile, active matching Mandate, and exact persisted Offer | One registered Agent goal run creates the Obligation, executes allowlisted sandbox use, posts synthetic repayment, and reads current Evidence; no real funds move |
| Agent Console | `Check for Agent Obligation` | Active matching Mandate and Offer | Shared Agent Obligation appears after the external Agent accepts the Offer |
| Agent Console | `Check Agent progress` | Active Mandate with no currently recovered exact Offer or Obligation | Read-only server refresh returns the exact Offer, exact Mandate-bound Obligation, stable waiting/unknown state, or one retryable error; no authority or lifecycle mutation occurs |
| Agent Console | `Check Provider spend` | Obligation created | Current purpose-bound, non-withdrawable Provider-spend state is restored |
| Agent Console | `Check automatic repayment` | Provider spend complete | Current deterministic repayment projection is restored |
| Agent Console | `Check Agent Evidence` | Repayment posted | Owner-authorized immutable Evidence timeline is restored |
| Agent Console | `Review Agent obligations` | Agent Obligation exists | Agent-owned position opens in Obligations |

The Closed Pilot reference Agent uses a registered server-held, revocable
credential. The browser does not need to download or hold that credential,
private key, or raw signature.

The local no-funds browser profile exposes the two explicit goal-level actions
above. Non-local closed-pilot and production profiles remain read-only from the
Principal browser: their external Agent performs mutations through its own
protected credential, while the visible `Check ...` actions recover server
truth. CLI commands, proof exports, handoff downloads, and OpenAPI examples live
only inside collapsed Developer details.

## Shared credit record

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Obligations | `Refresh owned positions` | Authenticated Subject | Human or Agent positions load from server truth |
| Credit Passport | `Load my latest Decision` | Current Subject has a Decision | Current Decision Passport is ready |
| Credit Passport | `Share private Passport` | Optional advanced sharing opened, Decision loaded, and an exact invited reviewer supplied | Time-bounded private artifact appears |
| Credit Track Record | `Load verified record` | Decision or owned Obligation Evidence exists | Finalized and non-final event counts appear |

`Obligations`, repayment, Credit Passport, and Credit Track Record remain
available from role-authorized lifecycle context. Primary navigation exposes
no more than four role-relevant destinations; contextual next actions open the
remaining lifecycle views without advertising cross-role tools.

## Risk read-only workspace

The Risk page derives its Portfolio and Servicing Queue locators only from two
authenticated, role-specific server reference queries. Each reference is
non-authorizing: the following exact detail read rechecks the existing
capability, Tenant ownership, recent phishing-resistant MFA and exact resource.
Zero, ambiguous, malformed or denied truth clears prior browser data and never
falls back to storage, URL, DOM metadata, fixture constants or the first row.

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Risk & Operations | `Refresh Risk workspace` | Authenticated Risk workspace | Previous transient state clears; unique server-derived Portfolio and Queue references are independently recovered and exact read-only details reload |
| Risk & Operations | `Apply stage` | Unique Queue restored and a stage selected | One fresh authorized Queue page loads with deterministic stage filtering |
| Risk & Operations | `Load supporting insights` | Unique Portfolio restored | Lifecycle health and feedback aggregate run only after this explicit action |
| Risk & Operations | `Freeze Subject` | One current authorized Queue case selected, approved reason chosen, acknowledgement checked, and recent MFA valid | Exact protective suspension is recorded once with immutable Evidence; selecting the case alone never mutates state |

Editable Portfolio/Queue/Subject ID fields and prerequisite-only Load buttons must not
exist in the normal journey. Initial recovery is bounded to two reference reads,
one Portfolio read and one Queue first-page read. Queue rows never prefill or
dispatch `Freeze Agent Subject`; that command retains its exact Subject, reason,
acknowledgement, recent-MFA and server-authorization requirements.

## Capital Partner authorized workspace

The Capital Partner page derives the current operator's own Profile and its
borrower-authorized Passport Inbox only from authenticated server truth. The
normal journey has no editable Profile, Passport, Credit Intent, hash, or
version locator. Those values may appear only in collapsed read-only technical
details and never replace command authorization.

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Capital Partners | `Refresh workspace` | Authenticated invited Partner | Prior transient state clears; own Profile, authorized Inbox and exact Portfolio are freshly recovered |
| Capital Partners | `Issue exact sandbox Offer` | One current authorized application selected and exact tuple revalidated | Explicit synthetic Offer receipt appears; no production funds move |
| Capital Partners | `Withdraw unaccepted Offer` | Current Partner-owned Offer remains offered | Exact unaccepted Offer is withdrawn and borrower acceptance is blocked |

One authorized application may be selected automatically. Multiple applications
require a labeled keyboard-accessible choice; empty, denied, stale, malformed or
ambiguous truth hides the economic form. Offer submission first rereads the
Inbox and exact-matches the selected artifact, Intent, hash and version; drift
dispatches no Offer mutation.

## Safety truth

- All credit and repayment in this contract use the local no-real-funds rail.
- Agent use is purpose-bound and non-withdrawable.
- Object hashes and server Evidence digests are not blockchain transactions.
- A BaseScan link may appear only after a verified Base Sepolia transaction
  receipt exists.
- Raw KYC/PII, private keys, Agent credentials, and raw signatures must not be
  rendered in the browser.

The machine-readable action inventory is
`apps/web/test/manual-primary-actions.v1.json`; automated tests enforce current
control IDs, labels, page reachability, navigation visibility, and the key
safety statements above.
