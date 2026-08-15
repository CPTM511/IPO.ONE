# TC-403 independent security review handoff

Status: `READY_TO_COMMISSION`; review `NOT_PERFORMED`

Commissioning owner: `ipo_one_founder`

Independent reviewer: unassigned

## Independence rule

The reviewer must be organizationally separate from the commissioning owner
and must not be Codex or the author approving its own implementation. A review
report must identify reviewer, exact source commit/worktree artifact set,
scope, method, date, findings, retest status, limitations, and report hash.

This handoff does not appoint a reviewer, share source, create a contract,
authorize a penetration test against any hosted system, or grant credentials,
accounts, private data, signer material, Exchange access, mainnet, production,
or funds authority.

## Required source scope

- ADR-034 through ADR-037.
- Trading Capital threat model.
- TC-301 through TC-403 modules, schemas, migrations, tests, and audit records.
- Canonical Facility, Obligation, Ledger, Event, Evidence, Tenant/RLS,
  AuthZ/admission/approval boundaries.
- Hyperliquid Info/read identity boundary, writer allowlist, signer isolation,
  nonce lifecycle, unknown-outcome recovery, Risk Guardian, funding, close,
  settlement, and Performance Evidence.
- TC-403 policy, disaster-recovery script, runbook, capacity bounds, and
  release gate.

## Required adversarial cases

1. Cross-Tenant Facility/account/settlement confusion.
2. Caller-supplied raw or unknown Exchange action.
3. Withdrawal, transfer, vault, builder-fee, API-wallet, leverage, or
   account-mode escalation.
4. API-wallet address used as account-read identity.
5. Nonce collision, clock drift, crash, reserved/submitted restart, pruning,
   address reuse, and timeout retry.
6. Partial fill, duplicate observation, cancel race, and unknown result.
7. Stale, incomplete, malformed, identity-mismatched, reordered, or missing
   venue data.
8. Risk-state downgrade without fresh reconciled Evidence and approval.
9. Signer loss, signer/custody/guardian authority collapse, key exfiltration,
   and unauthorized rotation/revocation.
10. Facility/Obligation/Ledger drift, second-kernel creation, fee on principal
    or unrealized PnL, synthetic receivable, or hidden Provider shortfall.
11. Event/Evidence/Ledger mutation, restore mismatch, backup exposure, replay,
    and projection repair abuse.
12. Alert suppression, alert flood, SLO boundary, oversized assurance input,
    finding overflow, and self-review bypass.
13. PII, secret, raw address, raw response, signature, credential, or database
    detail leakage in logs, artifacts, Evidence, errors, and drill output.
14. Mainnet, production, deployment, payout, withdrawal, transfer, or real-fund
    authority smuggled through a Testnet flag or review result.

## Required outputs

- Stable finding IDs and P0/P1/P2/P3 severity.
- Reproduction evidence with sensitive values removed.
- Clear fixed/unfixed/accepted-launch-blocker status.
- Retest evidence for every resolved P0/P1.
- Explicit statement of open P0/P1 count.
- Scope limitations and excluded live systems.
- SHA-256 report hash.

## Acceptance gate

TC-403 may be presented for Founder acceptance only when:

- every required local failure and restore drill passes;
- no open P0/P1 finding remains, or release is explicitly blocked;
- the independent review status is `PASSED`;
- the reviewer differs from `ipo_one_founder`;
- the report hash and reviewed timestamp are supplied; and
- the repository gate still reports every production, mainnet, signer,
  API-wallet, Exchange-write, payout, deployment, and real-funds authority as
  false.

Until then, TC-403 remains `IMPLEMENTED_UNVERIFIED`,
`BLOCKED_INDEPENDENT_REVIEW`, and RELEASE-001 remains blocked.
