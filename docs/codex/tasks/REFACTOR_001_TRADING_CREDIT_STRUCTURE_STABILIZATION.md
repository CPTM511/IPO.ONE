# REFACTOR-001 — Trading Credit structure stabilization

## Context

RISK-003A introduced the first chain-verifiable Trading Credit learning loop.
Its domain implementation was intentionally completed as one vertical slice,
but the resulting module combined policy, Evidence, assessment, proof,
outcome, and challenger responsibilities in one file.

Before adding real-scenario integrations, the implementation needs an internal
module boundary that is easier to review and extend without changing current
behavior or expanding product authority.

## Scope

- Preserve `packages/domain/src/trading-credit-learning.js` as the existing
  compatibility entry point.
- Split its internals into contracts, shared validation, profile, policy,
  supplemental Evidence, assessment, proof binding, outcomes, and challenger
  modules.
- Preserve the exact public export surface, deterministic hashes, schemas,
  validation errors, and safety flags.
- Reuse parsed timestamps and single-pass counters in assessment and
  challenger hot paths.
- Add compatibility, deterministic-output, and performance-regression tests.

## Non-goals

- No API, OpenAPI, schema meaning, database migration, contract, event, or
  Tenant protocol change.
- No policy threshold, factor weight, eligibility, capacity, limit, outcome,
  or challenger recommendation change.
- No new funds movement, signing, deployment, production authority, or
  external dependency.
- No real Human lending or automatic model promotion.

## Likely files

- `packages/domain/src/trading-credit-learning.js`
- `packages/domain/src/trading-credit-learning/*.js`
- `packages/domain/test/trading-credit-learning.test.js`
- `docs/codex/tasks/REFACTOR_001_TRADING_CREDIT_STRUCTURE_STABILIZATION.md`

## Acceptance criteria

1. The compatibility entry point exposes exactly the same 15 named exports.
2. Existing deterministic policy, supplemental Evidence, assessment, feature,
   Evidence-root, and credit-state hashes remain byte-for-byte identical.
3. All existing Trading Credit behavior, validation, schema, and safety tests
   remain green.
4. One hundred deterministic assessments complete within a generous
   2,000-millisecond regression budget under the pinned Node runtime.
5. No API operation, migration pair, smart contract, deployment configuration,
   schema contract, or policy value changes.
6. Full repository checks pass under Node 24.18.0 and pnpm 11.1.3.

## Test commands

```bash
npx -y node@24.18.0 --test packages/domain/test/trading-credit-learning.test.js
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

## Security checklist

- [x] Unknown, stale, mismatched, or non-finalized Evidence still fails closed.
- [x] Deterministic proof and decision hashes are unchanged.
- [x] All assessment, proof, outcome, and challenger authority flags are
      unchanged.
- [x] No secrets, credentials, raw addresses, PII, or raw transactions are
      added.
- [x] No funds, signing, registry publication, or production path is added.
- [x] No dependency or runtime compatibility range is changed.
