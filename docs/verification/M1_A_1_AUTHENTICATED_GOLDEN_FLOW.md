# M1-A.1 Authenticated Golden Flow Verification

Audit date: 2026-08-04

Overall result: `AUTHENTICATED_CORE_LIFECYCLES_VERIFIED_WITH_CANONICAL_STOPS`

The verification used the current rebuilt local stack, the Founder's existing
Chrome profile, the installed OKX Wallet, one-use SIWE messages, PostgreSQL
server truth, and the protected local reference Agent. No browser Provider was
injected. Unit tests, fixture browser hosts, UI presence, and test names were
not used as substitutes for this runtime evidence.

## Safety boundary

- Human workspace: `http://127.0.0.1:8787/`
- Principal and Agent workspace: `http://127.0.0.1:8788/`
- Chain profile shown to the wallet: Base Sepolia, `eip155:84532`
- Wallet operations: account access, SIWE, and explicit `personal_sign`
  confirmations only
- Transactions, gas, token approvals, custody, withdrawals, mainnet writes,
  external Provider writes, and real funds: none
- Every executed credit action was `sandboxOnly=true`, non-withdrawable, and
  reported `productionFundsMoved=false`.

## Human entry

| Canonical step | Result | Current runtime evidence |
| --- | --- | --- |
| Subject | `IMPLEMENTED` | Authenticated Human Subject created and recovered from server truth. |
| Consent | `IMPLEMENTED` | Exact bounded Consent created before the credit request. |
| Evidence | `IMPLEMENTED` | Synthetic identity, decision, lifecycle, repayment, and Credit Outcome Evidence loaded. |
| Credit Intent | `IMPLEMENTED` | `$120.00`, 60 days, two monthly installments. |
| Decision | `IMPLEMENTED` | Approved at 9%; deterministic explanation and finalized Evidence were visible. |
| Offer | `IMPLEMENTED` | Exact `$120.00` no-funds Offer displayed with a zero runtime fee. The approved Fee Policy remains frozen. |
| Acceptance | `IMPLEMENTED` | Exact Offer acknowledgement confirmed with the SIWE session wallet. |
| Authorization | `IMPLEMENTED` | Consent-bound authorization was rechecked by the Gateway. |
| Obligation | `IMPLEMENTED` | `obligation_5511f521-6873-4b64-8979-f2a009894d97`. |
| Funding state | `IMPLEMENTED` | Synthetic non-withdrawable execution only; no funding or withdrawal authority. |
| Repayment | `IMPLEMENTED` | Full `$120.00` synthetic repayment posted through explicit wallet confirmation. |
| CreditState | `IMPLEMENTED` | Fully repaid state and ten durable events recovered after refresh. |
| Dispute/Correction | `NOT_IMPLEMENTED` | No durable dispute, appeal, or additive correction case workflow exists. |

Human runtime artifact:
`artifacts/m1-a-1/browser/human-golden-flow-complete.png`.

The authenticated Human core lifecycle is executable. `REQ-UX-001` remains
`IMPLEMENTED_UNVERIFIED` because the Founder-defined canonical journey includes
Dispute/Correction and that terminal capability is absent.

## Agent entry

| Canonical step | Result | Current runtime evidence |
| --- | --- | --- |
| Principal/Operator | `IMPLEMENTED` | Role switch invalidated the Borrower session and required a Principal SIWE session on port 8788. |
| Agent binding | `IMPLEMENTED` | Exact active Subject `subject_34e295de-98ef-4fd8-a9a2-d3324513fbf7` restored with verified CAIP-10 proof. |
| Mandate | `IMPLEMENTED` | Exact purpose-bound Mandate created, acknowledged, activated, and recovered. |
| Credit Intent | `IMPLEMENTED` | Registered reference Agent submitted the request using its server-held revocable credential. |
| Plan validation | `IMPLEMENTED` | Draft-only application scope and exact Mandate limits were enforced. |
| Offer | `IMPLEMENTED` | `$100.00` no-funds Offer returned through the versioned Agent workflow. |
| Authorization | `IMPLEMENTED` | Principal acknowledgement and active Mandate were rechecked before execution. |
| Lockbox/Execution | `IMPLEMENTED` | Purpose-bound, provider-restricted, non-withdrawable sandbox execution completed. |
| Obligation | `IMPLEMENTED` | Browser lifecycle recovered `obligation_bedf465…222736c6`; independent CLI acceptance later created `obligation_e28493a5-6ece-4a08-8e83-fb2631e82e6f`. |
| Settlement | `IMPLEMENTED` | Synthetic execution and principal accounting completed without real settlement authority. |
| Repayment | `IMPLEMENTED` | Full `$100.00` repayment persisted; browser reload showed `$0.00` principal remaining. |
| Agent and Principal CreditState | `IMPLEMENTED` | Browser showed `Lifecycle verified` and fourteen latest verified Evidence events. |

Agent runtime artifacts:

- `artifacts/m1-a-1/browser/agent-golden-flow-complete.png`
- `artifacts/m1-a-1/browser/agent-golden-flow-recovered.png`
- `artifacts/m1-a-1/logs/local-agent-acceptance-20260804-rerun.log`

## Recovery defects found and bounded remediation

The first full-page reload failed closed because workspace recovery selected the
first Subject independently from the selected Mandate. The implementation now
loads the exact Mandate first and reads the AccountBinding for that Mandate's
`subjectId`. A second recovery defect treated the in-memory repayment receipt
as mandatory even when the server Obligation and complete Evidence timeline
proved repayment. The UI now derives the recovered repayment summary from the
durable Obligation and requires a matching `repayment_posted` Evidence event.

The independent Agent acceptance initially failed because the authenticated
Principal had 35 active workspace resources while the bounded resume endpoint
returned 32 newest resources. The query now ranks the latest authorized item
from every available resource type before filling the remaining bounded
window. The first failure is retained at
`artifacts/m1-a-1/logs/local-agent-acceptance-20260804.log`; the exact rerun
passes with thirteen Evidence events.

## Remaining recovery limitation

Subject, AccountBinding, Mandate, Obligation, repayment totals, and Evidence are
server-derived after a same-tab reload. The Agent Offer workflow receipt remains
in same-tab `sessionStorage` for browser continuation. It is non-authorizing and
the Gateway still rechecks every exact command, but a fresh browser session
cannot yet reconstruct the complete Agent next action solely from server truth.
Therefore `REQ-UX-005` remains `IMPLEMENTED_UNVERIFIED`.

## Reproduction commands

```text
pnpm run local:up
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run check:m1-requirements
```

M1-B remains blocked. No branch, commit, tag, or Release Candidate was created.
