# WEB-026C — Complete the presentation of Human and Principal/Agent tasks

Status: Implemented; integrated browser acceptance follows in WEB-026E.
Parent: WEB_026_PRODUCT_EXPERIENCE_DIRECTIVE_v1.0.md. Authority: Founder-approved Alignment v1.0.

## Context and baseline

Current functional source 9636ec2; selected visual source d94b78e. See parent for exact invariants and current local authentication findings. Current source supersedes historical task completion claims.

## Scope

Complete the presentation of Human and Principal/Agent tasks. Execute only this issue's changes while active; preserve the existing shared kernel and visible role-allowed capabilities.

## Non-goals and permission boundary

No new authentication/role policy, provider, dependency, financial behavior, schema, funds, signer, external credentials or cloud deployment. UI hooks may compose existing state and handlers but cannot fabricate success. Local candidate/test processes are authorized; real account authentication remains the user's deliberate action.

## Likely files

apps/web/src/{app.js,index.html,workspace-experience.js,workspace-experience.css}; focused Human/Agent presentation modules

## Given / When / Then acceptance

- Given a server-derived Human or Agent state, when the user opens the workspace, then one current task and an accurate summary lead to existing authorized handlers, exact terms, observable pending/error/result and queryable Evidence without duplicated controls.
- Given denied, stale, unknown or unavailable state, when the user attempts to continue, then the interface explains the actual recovery condition without granting authority or presenting success.
- Given refresh, theme/viewport changes or navigation, then legitimate existing state, input and accessible controls survive according to their existing protocol contract.

## Exact test commands

```sh
node --test apps/web/test/*.test.js
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

Human next action and selected-plan summary now share one task layout. Existing Agent lifecycle buttons lead the page and retain their guarded handlers. Corrected double sidebar spacing and nested-help focus. Web tests: 203/203 pass. Browser role/negative tests remain pending; no product-complete claim.

WEB-026D is now active. The small app.js growth is limited to explicit presentation hooks and opening native detail ancestors; no domain or authority rules were added.
