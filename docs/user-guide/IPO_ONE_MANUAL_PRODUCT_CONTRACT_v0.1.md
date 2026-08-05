# IPO.ONE Manual-to-Product Contract v0.1

Status: Local Closed Pilot acceptance contract
Applies to: `IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`

This compact contract turns the user manual into a testable product
requirement. A documented action is accepted only when the named role can reach
the page, satisfy the visible prerequisite, click the exact control, and read
the server-derived result. A backend-only success does not satisfy this
contract.

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

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Home | `Open Agent credit` | Authenticated session and Agent Workspace | Agent Console opens |
| Credit / Principal | `Create signing request` | Pending Agent Subject | Short-lived account proof challenge appears |
| Credit / Principal | `Ask registered test Agent to prove` | Open challenge | Server-held Agent account binding becomes active |
| Credit / Principal | `Create Draft Mandate` | Bound Agent Subject | Exact Draft Mandate appears |
| Agent Console | `Request Agent credit and receive Offer` | Draft Mandate | Decision and Offer workflow receipt appear |
| Agent Console | `Review and activate this Mandate` | Offer ready | Principal review opens |
| Credit / Principal | `Activate exact Sandbox Mandate` | Exact Mandate acknowledged | Mandate becomes active |
| Agent Console | `Create Agent Obligation` | Active matching Mandate and Offer | Shared Agent Obligation appears |
| Agent Console | `Execute allowlisted Provider spend` | Obligation created | Purpose-bound, non-withdrawable Provider spend is executed |
| Agent Console | `Capture revenue and auto-repay` | Provider spend complete and balance positive | Synthetic revenue is captured and automatically routed through the deterministic repayment waterfall |
| Agent Console | `Verify Agent Evidence` | Repayment posted | Immutable Evidence timeline is verified |
| Agent Console | `Review Agent obligations` | Agent Obligation exists | Agent-owned position opens in Obligations |

The Closed Pilot reference Agent uses a registered server-held, revocable
credential. The browser does not need to download or hold that credential,
private key, or raw signature.

## Shared credit record

| Page | Exact action | Prerequisite | Required visible result |
| --- | --- | --- | --- |
| Obligations | `Refresh owned positions` | Authenticated Subject | Human or Agent positions load from server truth |
| Credit Passport | `Load my latest Decision` | Current Subject has a Decision | Current Decision Passport is ready |
| Credit Passport | `Share private Passport` | Decision loaded and reviewer selected | Time-bounded private artifact appears |
| Credit Track Record | `Load verified record` | Decision or owned Obligation Evidence exists | Finalized and non-final event counts appear |

`Obligations`, `Repay & Settle`, `Credit Passport`, and `Credit Track Record`
are core lifecycle destinations and must remain visible in the primary
navigation. Integration and operations tools may remain under `More tools`.

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
