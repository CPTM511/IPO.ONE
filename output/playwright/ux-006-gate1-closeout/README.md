# UX-006 Gate 1 closeout browser evidence

Date: 2026-08-13 (Asia/Shanghai)
Environment: isolated synthetic QA hosts, current working-tree Web assets
Funds/deployment: no real funds, no chain write, no deployment

## Result

- Human completed lifecycle restored without internal-ID inputs. Completed
  execution is a status, not a disabled button; protocol operation names and
  exact references are collapsed under Developer/Technical details. Visible
  disabled controls: 0; horizontal overflow: 0; console errors/warnings: 0.
- Principal/Agent browser completed the local application, exact Principal
  activation, and sandbox runtime lifecycle through two goal-level browser
  actions. Final state was Fully Repaid with one enabled `Review Agent
  obligations` action and no terminal/download requirement. Console errors and
  warnings: 0.
- Capital Partner issued one exact synthetic Offer and withdrew it before
  acceptance. Audit: 4 reads, 2 deliberate mutations; `realFundsEnabled=false`;
  console errors/warnings: 0.
- Risk selected one authorized adverse queue case, chose `risk_limit_breach`,
  acknowledged the protective effect, and issued one exact freeze. Audit: 7
  reads, 1 deliberate protective mutation; `subjectFrozen=true`; no funds;
  console errors/warnings: 0. Queue rows and completion copy do not expose the
  exact Subject or Obligation reference in the normal view.

## Final screenshots

- `human-completed-state-final.png`
- `capital-partner-author-withdraw-final.png`
- `risk-protective-freeze-final.png`

The Agent lifecycle screenshot and exact browser result remain in the existing
current-candidate browser artifacts produced during this closeout. These are
fixture-backed operability proofs, not production or hosted-pilot claims.
