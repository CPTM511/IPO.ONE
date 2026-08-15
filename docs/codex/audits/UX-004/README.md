# UX-004 Manual-to-Product Contract Audit

Date: 2026-07-31
Scope: Local Closed Pilot, no real funds

## Result

Pass after two confirmed defects were fixed:

1. `Obligations` and `Credit Track Record` were incorrectly hidden under
   `More tools`, although the user manual treated them as core lifecycle
   destinations. Both now remain visible in the primary navigation together
   with `Repay & Settle` and `Credit Passport`.
2. The Human browser acceptance fixture ignored the entered repayment amount
   and always applied $60.00. A requested $120.00 full early repayment now
   produces `Fully Repaid`, $0.00 outstanding, and $120.00 total repaid.

The manual and product are now bound by
`apps/web/test/manual-primary-actions.v1.json` and the UX-004 static contract
test. A missing primary action ID, stale label, missing view, hidden lifecycle
destination, or removed safety statement fails the web test suite.

## Numbered browser journey and health

| Step | Role | Browser action | Observed state | Health |
| --- | --- | --- | --- | --- |
| 1 | Human | `Start Human application` | Human Credit workspace opens | Pass |
| 2 | Human | Subject → Consent → `Request & evaluate credit` | Approved Decision and $120.00 exact Offer | Pass |
| 3 | Human | Offer acknowledgement → account confirmation | Shared Obligation created with $120.00 outstanding | Pass |
| 4 | Human | `Confirm sandbox execution` → account confirmation | Approved sandbox use executed | Pass |
| 5 | Human | Enter $120.00 → early repayment → account confirmation | Fully Repaid, $0.00 outstanding, $120.00 repaid | Pass |
| 6 | Human | `Load timeline` | 3 finalized PostgreSQL Evidence events | Pass |
| 7 | Human | `Load my latest Decision` → `Share private Passport` | Current Decision loaded and bounded artifact issued | Pass |
| 8 | Human | `Load verified record` | 3 finalized, 0 invalid Evidence events | Pass |
| 9 | Agent | `Run Agent application online` | Decision and $100.00 Offer ready | Pass |
| 10 | Principal | Review and activate exact Mandate | Mandate active | Pass |
| 11 | Agent | `Create Agent Obligation` | Agent-owned shared Obligation created | Pass |
| 12 | Agent | `Execute approved use` | $100.00 non-withdrawable use executed | Pass |
| 13 | Agent | `Repay Agent obligation` | Fully Repaid, $0.00 remaining | Pass |
| 14 | Agent | `Verify Agent Evidence` | Lifecycle verified | Pass |
| 15 | Agent | `Review Agent obligations` | Agent-owned position opens in Obligations | Pass |

Disabled actions were checked at their preceding stages: each named primary
action became enabled only after the prerequisite state was present.

## Screenshot evidence

- `01-human-entry.png`: Human entry and application surface before the
  navigation correction.
- `02-agent-lifecycle.png`: completed Agent lifecycle with staged browser
  controls.
- `03-human-full-repayment.jpg`: full-page Human lifecycle evidence after
  the repayment correction.
- `03-human-full-repayment-card.jpg`: current Human lifecycle completion view.
- `04-core-lifecycle-navigation.jpg`: Obligations, Repay & Settle, Credit
  Passport, and Credit Track Record visible while `More tools` is closed.

## Automated evidence

- Web tests: 108 passed.
- Full repository tests: 680 passed.
- Reference Agent acceptance: passed, 11 Evidence events, sandbox only,
  `productionFundsMoved: false`.
- Local stack: PostgreSQL, pilot, and worker healthy; loopback forwarding ready.
- `git diff --check`: passed.

## Safety limits

- No production deployment, external credential, contract deployment, signer,
  mainnet action, or Testnet write was performed.
- Every economic browser action remains synthetic and no-funds.
- The Agent credential and private key remain server-side.
- Agent use remains purpose-bound and non-withdrawable.
- PostgreSQL Evidence digests are explicitly described as integrity checks,
  not blockchain transactions.
- BaseScan visibility remains conditional on a separately verified Base
  Sepolia transaction receipt.

This is an unsealed successor to `LOCAL-RC-002`; its sealed manifest was not
changed.
