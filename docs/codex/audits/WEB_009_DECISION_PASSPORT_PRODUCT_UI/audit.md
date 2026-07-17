# WEB-009 Decision Passport product UI audit

Date: 2026-07-17
Result: passed locally
Boundary: authenticated loopback Human pilot, fixed synthetic no-funds fixture

## Outcome

The Human Offer review now presents the authoritative
`risk_decision_passport.v1` before acceptance. Human-readable reasons, canonical
reason codes, policy and feature-set versions, trusted evaluation time, five
finalized source Evidence records, aggregate versions, finality, and compact
proof hashes are rendered from the same validated Decision returned to Agent
workflows. No UI-only score or parallel decision state was added.

Offer acknowledgement fails closed until the passport passes the closed
presentation validator. Missing reasons, source-role drift, duplicated or
non-final Evidence, hash/policy drift, unsafe time, or authority flags prevent a
verified presentation and keep acceptance disabled.

## Browser evidence

The in-app browser exercised the real same-origin fixture path at 1440x1100 and
390x844:

1. create Human Subject;
2. create scoped Consent;
3. request and evaluate Credit Intent;
4. inspect six ordered reasons and five finalized Evidence sources;
5. expand the proof and copy the exact Decision Passport;
6. acknowledge the exact Offer;
7. accept it into the shared sandbox Obligation.

Observed final state: `Approved · verified`, six reason rows, five source rows,
`Obligation created`, and no browser warning/error diagnostics. Clipboard
inspection returned a 3,611-byte closed object with
`schemaVersion=risk_decision_passport.v1`, five `sourceEvidence` records,
`sandboxOnly=true`, `nonAuthorizing=true`, and
`productionAuthority=false`; no credential, session, CSRF, secret, token, or
funds-authority field was present.

Desktop and mobile both reported `scrollWidth === innerWidth`. The 390px card
and proof remained within 268px/266px bounded product surfaces. One P2 was
found and fixed during comparison: the four-column mobile Evidence table
truncated source meaning. It now becomes labelled source/version/finality/proof
groups, preserving the complete source names and compact dual hashes without
horizontal overflow.

## Visual comparison

Primary reference:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`

Secondary graphite reference:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`

Implementation and comparison artifacts:

- `artifacts/product-design-audit/2026-07-17-decision-passport/desktop-passport-collapsed-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/desktop-passport-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/mobile-passport-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/mobile-proof-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/comparison-full.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/comparison-focused.png`

The same-input comparison confirms the selected product hierarchy: graphite
workspace and Offer rail, white decision surface, restrained lavender state
language, green verified pill, compact finance-style metrics, strong row
alignment, and an explicit action adjacent to the exact Offer. IPO.ONE retains
its own Evidence/Obligation semantics and uses the existing icon sprite; it
does not copy Aave brand assets or token-market content.

## Security and regression evidence

- DOM construction uses `textContent`, created elements, native `details`, and
  bounded attributes; no API-controlled HTML interpolation was added.
- The new static module is explicitly allowlisted by the authenticated web
  asset host and covered by transport conformance.
- `node --check` passed for both presentation and application modules.
- `pnpm run check`: 293/293 passed; 46 schemas, 23 migration pairs, 32 private
  operations, and all checked launch/security/operations policies passed.
- `pnpm run test:security`: 21/21 passed.
- `pnpm run test:transport`: 35/35 passed.
- `git diff --check`: passed.

This increment adds no route, operation, MCP tool, SDK permission, risk policy,
rate, limit, KYC/PII source, production authority, deployment, or real funds.
