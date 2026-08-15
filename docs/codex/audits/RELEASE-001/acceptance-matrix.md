# RELEASE-001 acceptance matrix

Evaluation window: `2026-07-26T05:44:16.000Z` to
`2026-07-26T06:05:16.254Z`

Release owner: `IPO.ONE Founder`

Candidate implementation identity:
`0x88b8fccd24a4ecab4d3e2ba90bfed0fab641773398c1ea9cbe8ecd0f978c895d`

Baseline commit:
`de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Status language

- `PASS`: the exact requirement has current evidence.
- `PASS_LOCAL_NO_FUNDS`: the exact local, synthetic, non-redeemable product
  requirement passed; it says nothing about a live Exchange write.
- `PASS_REAL_TESTNET`: a bounded real Testnet verification has historical or
  current evidence.
- `PASS_SPECIFIED_DISABLED`: the safety requirement passes because the
  capability is truthfully unavailable and fails closed.
- `UNVERIFIED`: implementation or evidence is incomplete for the exact claim.
- `WAIVED_BY_FOUNDER`: evidence collection was expressly skipped by the Founder.
  It remains `UNVERIFIED`; it is never converted to `PASS`.

There are no functional `FAIL` rows in this evaluation. The non-green rows are
explicitly `UNVERIFIED`.

## Final staged acceptance

| Stage | Result | Evidence and limit |
| --- | --- | --- |
| A. Complete private no-funds V9 + V10 | `PASS_LOCAL_NO_FUNDS` | 13 V9 destinations, eight Trading Capital views, 25 local operations, shared Human/Agent/Provider/Risk contract, 544/544 repository tests, 75/75 PostgreSQL tests, and real browser acceptance passed. |
| B. Real read-only Hyperliquid and Shadow Risk | `IMPLEMENTED_UNVERIFIED` | Current Testnet `/info` reachability and role read passed with zero positions/orders/fills/subaccounts and `freshness=stale`. A Founder-controlled real master/subaccount relationship and non-empty history remain `UNVERIFIED`. |
| C. Protected complete Hyperliquid Testnet | `IMPLEMENTED_UNVERIFIED` | Typed signer, nonce, action allowlist, risk, flatten, reconciliation, funding, settlement, and recovery pass local/durable tests. No real API Wallet, signed Exchange write, order/fill/flatten/funding/settlement E2E, or real signer rotation exists. |
| D. Formal release acceptance | `IMPLEMENTED_UNVERIFIED` | Runtime, dependency, browser, security, PostgreSQL, DR, exact identity, and launch-lock checks passed. External independent review evidence was waived by the Founder and full assistive-technology acceptance was not performed. Founder final RELEASE-001 verdict remains pending. |
| E. Real value | `PASS_SPECIFIED_DISABLED` | Launch policy remains locked. No mainnet, real funds, production signer, withdrawal, transfer, custody, or deployment authority was created. |

## Prototype/reference matrix

| ID | Result | Current evidence |
| --- | --- | --- |
| P-01 | `PASS` | Original V9 remains preserved in the verified development package. Package ZIP SHA-256 is `0a628994c948902953e831723be4c3b92ce904dfcbe7991b8f5c5e5f3f266fc1`. |
| P-02 | `PASS` | Original V10 remains preserved in the same verified package. |
| P-03 | `PASS` | Repaired reference evidence is retained; current authored web bundle rendered without raw JavaScript leakage. |
| P-04 | `PASS` | Every RELEASE-001 Chromium session checked reported 0 console errors and 0 warnings. |
| P-05 | `PASS` | All 13 V9 destinations plus Trading Capital were reached through the real browser host. |
| P-06 | `PASS` | The repaired reference retains the restored Trust & Execution pages; current runtime truth is separately catalog-bound. |
| P-07 | `PASS` | The five-tab reference requirement is superseded by, and compatible with, eight working product views. |
| P-08 | `PASS` | V9 destinations retain their names and server-operation mappings. |
| P-09 | `PASS` | Prototype/reference artifacts are not represented as production truth; the current UI says `No-funds sandbox`. |
| P-10 | `PASS_LOCAL_NO_FUNDS` | Overview, Profile, Marketplace, Setup, Live, Risk, Settle, and Proof all switched in Chromium. |
| P-11 | `PASS_LOCAL_NO_FUNDS` | Agent onboarding/Console entry, CAIP-10 proof status, bounded Mandate, 11/11 local tools, and three staged workflows rendered from authenticated fixtures. |
| P-12 | `UNVERIFIED` | 390×844 Human, Agent, and Trading Capital layouts passed; skip-link keyboard activation and tab ArrowRight behavior passed. No external screen-reader or formal WCAG conformance review was performed. |

## V9 destination traceability

All rows are `PASS_LOCAL_NO_FUNDS`; the browser and catalog do not imply
production funds authority.

| Destination | Result | Browser route / contract evidence |
| --- | --- | --- |
| Overview | `PASS_LOCAL_NO_FUNDS` | `#overview`; catalogued server operation available |
| Request Credit | `PASS_LOCAL_NO_FUNDS` | `#request-credit`; shared Human/Agent credit kernel |
| Repay & Settle | `PASS_LOCAL_NO_FUNDS` | `#repay-settle`; synthetic repayment and settlement |
| Credit Passport | `PASS_LOCAL_NO_FUNDS` | `#credit-passport`; privacy-safe artifact operations |
| Obligations | `PASS_LOCAL_NO_FUNDS` | `#obligations`; exact owned Obligation reads |
| Agent Console | `PASS_LOCAL_NO_FUNDS` | `#agent-console`; 11/11 local MCP registry |
| Capital Network | `PASS_LOCAL_NO_FUNDS` | `#capital-network`; Provider intent, no funding/withdrawal |
| Wallet & Permissions | `PASS_LOCAL_NO_FUNDS` | `#wallet-permissions`; server sign-in boundary |
| Activity & Proofs | `PASS_LOCAL_NO_FUNDS` | `#activity-proofs`; bounded Evidence reads |
| Credit Track Record | `PASS_LOCAL_NO_FUNDS` | `#credit-track-record`; report metadata and Evidence |
| Reports & Exports | `PASS_LOCAL_NO_FUNDS` | `#reports-exports`; integrity-checked official artifacts |
| Risk & Operations | `PASS_LOCAL_NO_FUNDS` | `#risk-operations`; aggregate, PII-free, protective-only |
| Architecture | `PASS_LOCAL_NO_FUNDS` | `#architecture`; 13/13 catalog traceability rendered |

## Trading Capital product views

| View | Result | Evidence |
| --- | --- | --- |
| Overview | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium; exact synthetic Facility loader |
| Profile | `PASS_LOCAL_NO_FUNDS` | Selected by click and ArrowRight keyboard navigation |
| Marketplace | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium |
| Setup | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium |
| Live | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium; label does not imply live Exchange execution |
| Risk | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium |
| Settle | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium |
| Proof | `PASS_LOCAL_NO_FUNDS` | Selected in Chromium; withdraw remains unavailable |

## Trading Capital operation matrix

Every operation below passed the exact closed local Tenant protocol, SDK, MCP,
role, schema, replay, and no-funds contract. A `PASS_LOCAL_NO_FUNDS` result is
not a live Hyperliquid Exchange-write result.

| # | Operation | Result |
| ---: | --- | --- |
| 1 | `tradingCreateAccountBindingChallenge` | `PASS_LOCAL_NO_FUNDS` |
| 2 | `tradingImportHyperliquidHistory` | `PASS_LOCAL_NO_FUNDS` |
| 3 | `tradingFinalizeEvidenceSnapshot` | `PASS_LOCAL_NO_FUNDS` |
| 4 | `tradingReadCreditProfile` | `PASS_LOCAL_NO_FUNDS` |
| 5 | `tradingCreateCapitalRequest` | `PASS_LOCAL_NO_FUNDS` |
| 6 | `tradingCreateProviderMandate` | `PASS_LOCAL_NO_FUNDS` |
| 7 | `tradingListCompatibleMandates` | `PASS_LOCAL_NO_FUNDS` |
| 8 | `tradingCreateMatchProposal` | `PASS_LOCAL_NO_FUNDS` |
| 9 | `tradingAcceptMatchAsProvider` | `PASS_LOCAL_NO_FUNDS` |
| 10 | `tradingAcceptMatchAsSubject` | `PASS_LOCAL_NO_FUNDS` |
| 11 | `tradingCreateFacility` | `PASS_LOCAL_NO_FUNDS` |
| 12 | `tradingContributeSubjectCollateral` | `PASS_LOCAL_NO_FUNDS` |
| 13 | `tradingRecordProviderFunding` | `PASS_LOCAL_NO_FUNDS` |
| 14 | `tradingActivateFacility` | `PASS_LOCAL_NO_FUNDS` |
| 15 | `tradingSubmitOrderIntent` | `PASS_LOCAL_NO_FUNDS` |
| 16 | `tradingCancelOrderIntent` | `PASS_LOCAL_NO_FUNDS` |
| 17 | `tradingReadFacilityState` | `PASS_LOCAL_NO_FUNDS` |
| 18 | `tradingEvaluateRisk` | `PASS_LOCAL_NO_FUNDS` |
| 19 | `tradingPauseNewRisk` | `PASS_LOCAL_NO_FUNDS` |
| 20 | `tradingFlattenFacility` | `PASS_LOCAL_NO_FUNDS` |
| 21 | `tradingRequestClose` | `PASS_LOCAL_NO_FUNDS` |
| 22 | `tradingRunSettlement` | `PASS_LOCAL_NO_FUNDS` |
| 23 | `tradingReadSettlement` | `PASS_LOCAL_NO_FUNDS` |
| 24 | `tradingIssuePerformanceProof` | `PASS_LOCAL_NO_FUNDS` |
| 25 | `tradingReadFacilityEvidence` | `PASS_LOCAL_NO_FUNDS` |

## Wallet acceptance matrix

Detailed prior evidence is retained in
`docs/codex/audits/WALLET-003/wallet-acceptance-matrix.md` and
`docs/codex/audits/WALLET-003/live-testnet-e2e-evidence.md`.

| ID | Result | Evidence and limit |
| --- | --- | --- |
| W-01 | `PASS` | Account requests remain explicit user actions and rejection-safe. |
| W-02 | `PASS` | Add/switch parameters are fixed to approved Testnets and server-owned profiles. |
| W-03 | `PASS` | Zero/one/multiple EIP-6963 Providers and legacy fallback are tested. |
| W-04 | `PASS` | No Provider is selected or replaced implicitly. |
| W-05 | `PASS` | Provider metadata is bounded, text-only, and safe-scheme restricted. |
| W-06 | `PASS` | SIWE challenge is server-generated, one-use, expiring, and exactly bound. |
| W-07 | `PASS` | SIWE is verified server-side. |
| W-08 | `PASS` | Unprovisioned wallets cannot create privileged sessions. |
| W-09 | `PASS` | `accountsChanged` invalidates host session and authority. |
| W-10 | `PASS` | `chainChanged` invalidates host session and authority. |
| W-11 | `PASS` | Provider removal/replacement/disconnect invalidates authority. |
| W-12 | `PASS` | Invalidation network failure quarantines tabs and retries idempotently. |
| W-13 | `PASS` | Cross-tab invalidation is enforced. |
| W-14 | `PASS` | Fresh authentication is required after context change. |
| W-15 | `PASS` | EOA proofs reject malformed, high-s, and replayed signatures. |
| W-16 | `PASS_REAL_TESTNET` | Base Sepolia ERC-1271 EIP-191/EIP-712 evidence passed with chain/finality/timeout/size bounds. |
| W-17 | `PASS_SPECIFIED_DISABLED` | Approved WalletConnect package and same lifecycle pass local tests; real QR/mobile-device E2E remains disabled and was not claimed. |
| W-18 | `PASS` | Memory-only connector storage; no key, seed, raw reusable signature, bearer session secret, or credential was recorded. |
| W-19 | `PASS_REAL_TESTNET` | Founder-confirmed Base Sepolia EOA E2E evidence exists. |
| W-20 | `PASS_REAL_TESTNET` | Founder-confirmed Base Sepolia ERC-1271 E2E evidence exists. |
| W-21 | `PASS` | Logout/revoke/invalidation is idempotent, audited, and non-enumerating. |

## Security acceptance matrix

| ID | Result | Evidence and limit |
| --- | --- | --- |
| S-01 | `PASS` | Deny-by-default operation and object authorization; 71-operation catalog. |
| S-02 | `PASS` | Forced RLS, cross-Tenant negatives, and role posture passed in PostgreSQL 17.10. |
| S-03 | `PASS` | Idempotency, races, replay, crash rollback, process restart, and durable recovery passed. |
| S-04 | `PASS_LOCAL_NO_FUNDS` | Balanced synthetic Ledger and exact reconciliation passed; no real economic state exists. |
| S-05 | `PASS` | Event, Evidence, projection, outbox, and command atomicity passed. |
| S-06 | `PASS` | Resource, byte, count, time, rate, concurrency, queue, and cost ceilings passed. |
| S-07 | `PASS` | No raw PII, secret, key, or reusable signature in release evidence. |
| S-08 | `PASS` | Wallet Provider-context invalidation and cross-tab quarantine passed. |
| S-09 | `PASS` | ERC-1271 RPC/network/package review and fixed WalletConnect package evidence exist. |
| S-10 | `PASS_REAL_TESTNET` | Current Testnet `/info` read used a fixed origin, path, POST method, query allowlist, bounded response, and no signer. |
| S-11 | `UNVERIFIED` | Current account returned `user`, but zero subaccounts and no Founder-controlled master/subaccount pair were verified. |
| S-12 | `PASS_SPECIFIED_DISABLED` | API Wallet/private-key isolation is implemented and tested; no real API Wallet or key exists. |
| S-13 | `PASS` | Typed Exchange action allowlist and dangerous-action denylist pass local/security tests. |
| S-14 | `PASS_LOCAL_NO_FUNDS` | Durable atomic nonce and unknown-outcome models pass PostgreSQL restart/replay tests; no live API Wallet nonce was used. |
| S-15 | `PASS` | Stale/unknown risk state is monotonic and fails closed to `REDUCE_ONLY`. |
| S-16 | `PASS` | Risk Guardian has no withdrawal, transfer, approval, or authority-expansion operation. |
| S-17 | `UNVERIFIED` | Physical PostgreSQL dump/restore and signer-loss simulation passed; rotation/destruction of a real Testnet signer was not performed because no signer exists. |
| S-18 | `WAIVED_BY_FOUNDER` | Checked-in AI review has 0 open P0 and 0 open P1. Founder stated colleagues reviewed with no issue and ordered evidence collection skipped. No independently attributable report/attestation was supplied, so this remains `UNVERIFIED`. |
| S-19 | `PASS` | Exact candidate identity is content-addressed and launch policy remains locked. |
| S-20 | `PASS_SPECIFIED_DISABLED` | Real-value default is locked and REALVALUE-001 remains human-only. |

## Testnet E2E matrix

| Flow | Result | Evidence and limit |
| --- | --- | --- |
| Base Sepolia EOA EIP-191 | `PASS_REAL_TESTNET` | WALLET-003 live evidence; Founder-confirmed wallet operation. |
| Base Sepolia Agent EIP-712 | `PASS_REAL_TESTNET` | WALLET-003 live evidence. |
| Base Sepolia ERC-1271 EIP-191/EIP-712 | `PASS_REAL_TESTNET` | Minimal approved test contract and bounded proof evidence. |
| X Layer portability | `PASS_LOCAL_NO_FUNDS` | Shared chain adapter/schema conformance; not an authentication-authorizing live proof. |
| Hyperliquid Testnet Info reachability | `PASS_REAL_TESTNET` | Current `/info` snapshot, role `user`, read-only, no credentials, no signer, no write. |
| Hyperliquid master/subaccount binding | `UNVERIFIED` | Current `subaccounts=0`; no qualified Founder-controlled pair. |
| Non-empty history / positions / fills | `UNVERIFIED` | Current counts are all zero and freshness is explicitly `stale`. |
| Testnet signed order and fill | `UNVERIFIED` | No API Wallet or signed Exchange write exists. |
| Testnet reduce-only / flatten | `UNVERIFIED` | Local durable protective path passes; no real Exchange E2E. |
| Testnet Facility funding / close / settlement | `UNVERIFIED` | Local synthetic path and PostgreSQL recovery pass; no real Testnet value lifecycle. |
| Mainnet / real funds / withdrawal / external transfer | `PASS_SPECIFIED_DISABLED` | Prohibited and absent. |

## Human approval matrix

| Approval class | RELEASE-001 state |
| --- | --- |
| Wallet/mobile connector and dependency | Prior bounded Testnet/package approval exists; no production connector unlock. |
| ERC-1271 RPC/network/contract | Prior bounded Base Sepolia approval/evidence exists; no production contract authority. |
| Passport/report privacy | Prior versioned Founder approval retained; no raw PII in this release. |
| Hyperliquid outbound Testnet read | Prior TC-201 approval exists and current read-only test passed. |
| Hyperliquid Testnet account/write/signer | `UNVERIFIED` and locked; no new approval inferred. |
| Capital, custody, pricing, loss, real asset, production chain | Not approved and not enabled. |
| Independent external review evidence | `WAIVED_BY_FOUNDER` for RELEASE-001 evaluation only; not a `PASS`. |
| Launch-policy unlock / real value | Not approved; unchanged and locked. |
| RELEASE-001 final verdict | `PENDING_FOUNDER_VERDICT`. |

## P0/P1 posture

- Registered open P0: `0`
- Registered open P1: `0`
- Registered open P2: `1`
  (`TC403-REV-P2-002 runtime_alert_provenance_not_composed`)
- Independent externally attributable report: `UNVERIFIED / WAIVED_BY_FOUNDER`
- Machine launch decision: always blocked

