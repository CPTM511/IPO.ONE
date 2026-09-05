# WEB-026E — Verify the full candidate and maintain a usable review runtime

Status: ACTIVE — browser regression and local service integration.
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

Local conformance hosts: 24/24 browser tests passed, including 48 role/viewport/theme screenshots and strict mobile header/overflow checks. UI unit suite 203/203, transport/static security suite 91/91, bundle integrity and current Whitepaper checks passed. Public illustrative lifecycle follow-up pending.

Actual local backend is `ipo-one-pilot008a-review`, serving 8895–8898 from clean source `4bdbabb7ac3782ce80e4c4b7df4f8f8abc5d8d90`, image `sha256:0f9df36d5330e63b308129eb1b79a8a31d3208e4934ed3841b64d96db7d38a44`. Its pre-existing container healthcheck is unhealthy despite all four HTTP/auth discovery endpoints responding. A separate `ipo-one-web026-review` container will preserve the exact backend/configuration and overlay only committed frontend resources plus the fixed static-asset allowlist. Original container remains for rollback; PostgreSQL and credentials are untouched.

Use `node scripts/web026-local-candidate.mjs prepare`, then `start`; `rollback` stops only this candidate and restarts the original. Source identities and non-sensitive runtime evidence live under the main worktree `output/playwright/web-026-runtime`. Authenticated durable acceptance and cloud/deployed verification remain pending. No product-complete claim.
