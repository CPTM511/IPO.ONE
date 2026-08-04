---
name: Codex MVP Task
about: Scoped engineering issue for IPO.ONE Codex work
title: "MVP-XXX: "
labels: ["codex", "mvp"]
assignees: []
---

## Status

- Status: Draft / Ready / In progress / Completed locally / Blocked by review
- Baseline commit:
- Product phase and delivery level:

## Context

Reference the relevant guidance section, standard rule, prior Issue, or ADR.

## Scope

- 

## Non-Goals

- No real human lending.
- No unrestricted withdrawals.
- No production deployment or fund movement.
- No token, DAO, or public LP feature.

## Likely Files

- 

## Acceptance Criteria

- [ ] 

## Test Commands

```sh
pnpm run check
```

## Security Checklist

- [ ] Protocol IDs, state machines, or enums changed intentionally and documented.
- [ ] Spend Policy cannot be bypassed.
- [ ] Active obligations are repaid before surplus release.
- [ ] Events/audit logs are added for state changes.
- [ ] No raw PII/KYC/private keys/secrets are introduced.
- [ ] No production fund movement is added.

## Permission Boundary

- State exactly which roles, capabilities, contracts, risk controls,
  deployments, credentials, signers, data classes, or funds paths are
  unchanged.
- Name the separate human review required for any permission expansion.

## Data and Migration Impact

- No migration, or list the additive migration and rollback/rebuild behavior.
- Browser or process-local state does not replace authenticated server truth.

## Rollback Plan

- Describe the code/configuration rollback and any durable-state compatibility
  requirement.

## Required Evidence

- Targeted test output:
- Aggregate gate output:
- Browser/API/PostgreSQL evidence:
- Remaining risks and follow-up issues:

## Dependency and Sequencing Notes

- Required predecessor Issues:
- Later Issues that must not be implemented opportunistically:
- Named human review required before this Issue can start or expand:

## Completion Evidence

Complete only after every acceptance criterion and relevant gate passes.

- Completed date:
- Exact commands and counts:
- Browser or machine-facing workflow result:
- Security and permission review result:
- Release status: designed / implemented / locally verified / testnet verified /
  hosted / real-value active
