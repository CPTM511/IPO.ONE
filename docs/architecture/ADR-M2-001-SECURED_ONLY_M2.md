# ADR-M2-001: Secured-only M2

Status: Accepted for bounded M2 architecture; runtime remains gated

## Context

The predecessor Constitution v1.2 permitted one shared kernel and purpose-bound Facilities but
prohibits public LP/vaults and real-value Human lending. The proposed M2
direction intentionally introduces one bounded public testnet secured Facility.
A secured/unsecured hybrid would multiply accounting, risk and recovery states
before either path has relevant repayment Evidence.

## Decision

M2 has exactly one active new risk mode: overcollateralized secured credit.
Existing unsecured/synthetic capabilities remain preserved at their current
no-funds authority and cannot be activated for real value by M2.

The secured pool is an adapter-connected Capital Facility domain. Human and
Agent entry modes continue to use the same Subject, Principal, Consent/Mandate,
Offer, Obligation, Ledger, Evidence, Credit State and reconciliation kernel
required by `REQ-CORE-001` and ADR-034.

No policy may blend collateral value with an unsecured limit, automatically
reduce collateral based on Credit State, or fall back to unsecured exposure
after collateral deficiency. Stale, unknown or unreconciled state denies new
risk.

## Novelty, risk and mitigation

- Novel element: on-chain collateral becomes a capital-facility truth domain.
- Risk: a second credit kernel or silent unsecured residual could emerge.
- Mitigation: adapter-only integration, one canonical Obligation, explicit bad
  debt state, invariant tests, and no unsecured fallback.
- Simpler safe alternative: retain the current no-funds product and defer M2;
  this remains the rollback posture until an exact release profile is separately activated.

## Alternatives rejected

- Hybrid secured/unsecured Facility: rejected due to ambiguous authorization,
  loss allocation and recovery.
- Unsecured real-value M2: rejected by current evidence and governance.
- Separate secured-product kernel: rejected because it forks economic truth.
- Agent-first pool launch: rejected; the Human pool lifecycle must prove the
  capital facility before delegated venue composition.

## Consequences

Every M2 issue and interface must state `secured_only`, one market and no
unsecured fallback. Existing synthetic unsecured demonstrations are not M2
liquidity and may not be represented as pool capacity.

Permission/funds/deployment impact: **none in this ADR**. Acceptance would
approve architecture only. Contract installation, risk fixtures, testnet
accounts, signers, assets, deployment and any real value remain separate gates.
