# WEB-026B — Make entry, authentication state and role navigation coherent

Status: Implemented; browser acceptance pending.
Parent: WEB_026_PRODUCT_EXPERIENCE_DIRECTIVE_v1.0.md. Authority: Founder-approved Alignment v1.0.

## Context and baseline

Current functional source 9636ec2; selected visual source d94b78e. See parent for exact invariants and current local authentication findings. Current source supersedes historical task completion claims.

## Scope

Make entry, authentication state and role navigation coherent. Execute only this issue's changes while active; preserve the existing shared kernel and visible role-allowed capabilities.

## Non-goals and permission boundary

No new authentication/role policy, provider, dependency, financial behavior, schema, funds, signer, external credentials or cloud deployment. UI hooks may compose existing state and handlers but cannot fabricate success. Local candidate/test processes are authorized; real account authentication remains the user's deliberate action.

## Likely files

apps/web/src/{index.html,app.js,workspace-surface-access.js,workspace-experience.js,workspace-experience.css}; apps/web/test/workspace-surface-access.test.js

## Given / When / Then acceptance

- Given signed-out or authenticated server truth, when a visible entry/navigation control is used, then authentication remains genuine, legal destination survives, task-first navigation preserves all allowed routes, and unavailable login offers legible recovery.
- Given denied, stale, unknown or unavailable state, when the user attempts to continue, then the interface explains the actual recovery condition without granting authority or presenting success.
- Given refresh, theme/viewport changes or navigation, then legitimate existing state, input and accessible controls survive according to their existing protocol contract.

## Exact test commands

```sh
node --test apps/web/test/workspace-navigation.test.js apps/web/test/workspace-surface-access.test.js apps/web/test/authentication-availability-presentation.test.js
pnpm run test:browser:click-path
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

Pending current execution. No product-complete claim.

Navigation/auth presentation regression: 19/19 pass. Four old placement/default expectations changed to the Founder-approved task destinations; allowed view sets and cross-role denial remain unchanged. WEB-026C active; browser evidence follows in E.
