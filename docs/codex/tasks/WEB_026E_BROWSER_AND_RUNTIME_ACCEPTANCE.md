# WEB-026E — Verify the full candidate and maintain a usable review runtime

Status: BLOCKED — NOT COMPLETE; UI/browser evidence recorded, actual runtime review required.
Parent: WEB_026_PRODUCT_EXPERIENCE_DIRECTIVE_v1.0.md. Authority: Founder-approved Alignment v1.0.

## Context and baseline

Current functional source 9636ec2; selected visual source d94b78e. See parent for exact invariants and current local authentication findings. Current source supersedes historical task completion claims.

## Scope

Verify the full candidate and maintain a usable review runtime. Execute only this issue's changes while active; preserve the existing shared kernel and visible role-allowed capabilities.

## Non-goals and permission boundary

No new authentication/role policy, provider, dependency, financial behavior, schema, funds, signer, external credentials or cloud deployment. UI hooks may compose existing state and handlers but cannot fabricate success. Local candidate/test processes are authorized; real account authentication remains the user's deliberate action.

## Likely files

apps/web/test/e2e; scripts/start-web026-review.mjs; output/playwright/web-026; this task evidence

## Given / When / Then acceptance

- Given the exact candidate and known host type, when positive, denied, recovery and responsive paths are exercised, then evidence identifies code and runtime versions, preserves persistence and authority boundaries, and supplies a verified clickable experience. Missing real authentication/deployment remains explicitly blocked.
- Given denied, stale, unknown or unavailable state, when the user attempts to continue, then the interface explains the actual recovery condition without granting authority or presenting success.
- Given refresh, theme/viewport changes or navigation, then legitimate existing state, input and accessible controls survive according to their existing protocol contract.

## Exact test commands

```sh
pnpm run lint
pnpm run check:web-bundle
pnpm run check:whitepaper
node --test apps/web/test/*.test.js
pnpm run test:browser:click-path
git diff --check
```

Use the existing repository tooling. Baseline discrepancies are evidence, not permission to delete assertions. Any new behavioral defect receives targeted regression protection.

## Security checklist

- Existing authenticated server, Tenant/object authorization, CSRF/Origin and idempotency preserved.
- No secrets or raw identity data copied to artifacts; fixture identity always disclosed.
- Displayed terms and results originate from existing authorized state, never animation timers.
- Navigation cannot mutate economic or authority state; protected buttons retain explicit effect labels.

## Migration impact and rollback

No migration or database reset. Revert this increment's files/commit. Stop only its own local review hosts; preserve previous runtime and PostgreSQL data. Any necessary approved local UI refresh records both source identities and exact reversal.

## Dependencies and evidence

Depends on the prior WEB-026 issue. Record source SHA, host type, visible click path, outcome, command result and actual screenshot/interaction evidence under output/playwright/web-026. Document CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED separately. Runtime or deployed acceptance is not proven by fixture success.

## Completion evidence

25 browser tests passed (24 workspace checks plus the public ten-state/Whitepaper journey); 203 web unit tests and 91 transport/static security tests passed. Bundle, lint and current 48-section/43-page Whitepaper checks passed. Role/theme/viewport evidence is under `output/playwright/web-026`.

Actual runtime integration is BLOCKED — NOT COMPLETE. Read-only verification found the existing local process predates its mounted backend source, and its database is at migration 0069. Restarting current mounted code would apply 0070–0073, including identity/permission changes, and could create synthetic-provider material. This exceeds the UI-only runtime boundary. No local service was stopped or changed.

The proposed runtime review is fully scoped in `WEB_026F_LOCAL_RUNTIME_RECONCILIATION_REVIEW.md`. `node scripts/web026-local-candidate.mjs audit` is read-only; all mutation modes are blocked. Authentication, durable recovery, actual deployed-SHA and Founder verification remain unproven. Independent labeled fixture review remains reachable on 4191–4195; it is not evidence of actual account login.
