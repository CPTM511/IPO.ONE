# WEB-024: Public README and Founding Edition II whitepaper

Status: Implemented and locally verified; production deployment pending

## Context

IPO.ONE has a Founder-supplied public README and Founding Edition II whitepaper
in Markdown, PDF, and archival DOCX forms. The product site currently presents
the canonical public thesis but has no first-class `/whitepaper` route and the
repository root still points at the earlier public narrative.

## Scope

- Replace the root README with the supplied public canonical README.
- Publish the supplied Markdown as `docs/WHITEPAPER.md` without changing its
  doctrine or activation boundaries.
- Publish the supplied PDF as a stable, downloadable public asset.
- Add a responsive, selectable-text `/whitepaper` reading experience with
  anchored navigation, reading progress, diagrams, tables, references, and
  explicit links back to the product, developer contract, security policy, and
  canonical repository.
- Add a visible Whitepaper entry to the signed-out product surface.
- Add canonical, Open Graph, and Twitter metadata to public entry pages.
- Verify source integrity, route behavior, PDF delivery, links, responsive
  layout, and unchanged Human/Agent product behavior.

## Non-goals

- No change to protocol semantics, state machines, Ledger, servicing, Evidence,
  authorization, risk, limits, pricing, or Tenant data.
- No real funds, lending, custody, signing, withdrawal, external execution,
  Provider activation, KYC, mainnet, or production financial authority.
- No rewrite of historical release, audit, security, or Evidence records.
- No project license is inferred or added.
- The DOCX remains a supplied archival source and is not served by the product.

## Likely files

- `README.md`
- `docs/WHITEPAPER.md`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/whitepaper.html`
- `apps/web/src/whitepaper.css`
- `apps/web/src/whitepaper.js`
- `apps/web/src/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_II.pdf`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/test/production-tenant-host.test.mjs`
- `scripts/generate-whitepaper.mjs`

## Acceptance criteria

- [x] Supplied Markdown and PDF bytes match their repository copies; the README
      differs only by adding its required public `/whitepaper` experience link.
- [x] `/whitepaper` is reachable without authentication and contains the full
      Founding Edition II narrative as selectable text.
- [x] Desktop navigation, mobile section selector, anchor links, and reading
      progress work without inline script or third-party runtime dependencies.
- [x] All Mermaid source diagrams have an accessible visual representation.
- [x] PDF `GET` and `HEAD` return the exact supplied asset with the correct
      content type and a working visible download control.
- [x] Home and whitepaper metadata truthfully describe the no-funds deployed
      foundation and do not imply real-value activation.
- [x] The homepage exposes Whitepaper, Developer, Security, and product links.
- [x] Existing Human and Agent routes and controls remain unchanged.
- [ ] Focused tests, repository tests, link checks, and real-browser desktop and
      mobile verification pass against the exact release candidate.

## Test commands

```sh
node scripts/generate-whitepaper.mjs --check
node --check apps/web/src/whitepaper.js
node --test apps/web/test/*.test.js apps/tenant-api/test/*.test.mjs
pnpm run check:web-bundle
pnpm test
git diff --check
```

## Security checklist

- [x] Public assets contain no credentials, private keys, raw signatures, raw
      KYC/PII, Tenant records, or private policy.
- [x] Public page scripts remain self-hosted and compatible with the existing
      restrictive Content Security Policy.
- [x] Static routing cannot escape the explicit asset allowlist.
- [x] Whitepaper copy retains the deterministic-authority, privacy,
      reconciliation, and activation boundaries.
- [x] No authenticated operation or production financial permission changes.

## Permission boundary

The Founder supplied and requested publication of these exact narrative assets
and authorized the associated repository, merge, deployment, and production
verification workflow. This issue grants presentation and static-route changes
only. It grants no real-value, capital, custody, signer, KYC, risk, or external
execution authority.

## Migration impact

None. No schema, data, dependency, protocol, environment-variable, or durable
state migration is introduced.

## Rollback plan

Revert the focused merge commit and promote the previous known-good deployment.
Because the change is static presentation and an explicit route allowlist only,
rollback requires no data migration or state repair.

## Completion Evidence

- Canonical generator: current with 60 anchored sections and 12 self-hosted
  accessible protocol diagrams.
- Focused web and transport tests: 31/31 passed.
- Repository regression suite: 1,098/1,098 passed.
- Source lint, boundary lint, contract typecheck, web bundle integrity, and
  `git diff --check`: passed.
- Local route checks: `/`, `/whitepaper`, `/whitepaper/`, HTML, CSS, JS, and the
  exact PDF returned 200.
- Real Chromium desktop and 390 x 844 mobile review: meaningful content,
  working homepage-to-whitepaper navigation, working mobile section selection,
  60-entry desktop TOC, 12 diagrams, reading progress, and zero horizontal
  overflow. CI, exact deployment, and public production acceptance remain to
  be recorded in the PR/release workflow.
