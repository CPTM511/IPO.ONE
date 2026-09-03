# WHITEPAPER-FOUNDING-EDITION-III — Performance → Credit → Capital Canonicalization

Status: `LOCAL VERIFIED — PREVIEW, MERGE AND PRODUCTION PENDING`

Date: 2026-09-03

Baseline: `737ef537aed118b9f8299077c86ea1d7b2a1e391`

## Context

The Founder directed a canonical strategic rewrite and production publication
of the IPO.ONE whitepaper as **Founding Edition III**. The public edition must
make `Performance → Evidence → Credit → Capital` the principal economic thesis,
remain Agent-first without forking the Human/Agent kernel, and distinguish
current deployed truth from architecture, Testnet Evidence and long-term
protocol direction.

The production product inspected at task start still serves Founding Edition II
and release `c4cc81f09f1c7aeb78871373d29ed581e428daca`. `origin/main` is
`737ef537aed118b9f8299077c86ea1d7b2a1e391` and contains Product Constitution
v1.6 plus the merged M3 L2 implementation, but the M3 task has no completed
hosted Evidence in the repository. Edition III must not describe that merge as
deployed product truth.

## Scope

- Rewrite `docs/WHITEPAPER.md` as the sole canonical Edition III source.
- Position IPO.ONE as **The Credit Layer for the Agentic Economy** with the
  value proposition **Turn verified Agent performance into capital**.
- Treat Domain Performance Evidence as a semantic use of the accepted Evidence
  model, not a second protocol object or source of truth.
- Present Trading Capital and Metered Machine-Service Credit as reference
  Facility profiles over one shared kernel; preserve broader examples as
  Protocol Horizon only.
- Upgrade deterministic HTML generation, diagrams, navigation, accessibility,
  metadata and the Edition III PDF/export path.
- Verify generated-source parity, desktop/mobile interaction, keyboard use,
  download integrity, metadata, overflow and links.
- Red-team product claims, merge through the normal repository workflow,
  publish the exact merged SHA, and verify `https://ipo.one/whitepaper`.

## Non-goals

- No Product Constitution, runtime schema, financial policy, risk limit,
  Obligation, Ledger, Evidence, Credit State or authorization change.
- No mainnet, real funds, custody, withdrawal, external Provider activation,
  Venue write, signer, KYC processing, public real-value pool, token or model
  promotion.
- No claim of users, partners, volume, revenue, returns, credit performance,
  regulatory approval or production real-value finance.
- No independent whitepaper text fork outside the generated HTML and PDF.

## Files likely to change

- `docs/WHITEPAPER.md`
- `scripts/generate-whitepaper.mjs`
- `apps/web/src/whitepaper.html`
- `apps/web/src/whitepaper.css`
- `apps/web/src/whitepaper.js`
- `apps/web/src/whitepaper/IPO_ONE_Whitepaper_Founding_Edition_III.pdf`
- whitepaper-focused tests and this task Evidence record
- stale whitepaper references in `README.md` or public routing only if required

## Acceptance criteria

1. A sophisticated reader can distinguish credit from payment, identity,
   reputation, capital provision and execution venues.
2. The document establishes one Obligation kernel, one evolving Credit State,
   Domain Performance context and Facility-specific underwriting without a
   universal Agent score.
3. Current Foundation, Product Evolution and Protocol Horizon are explicit and
   match Constitution v1.6, accepted ADRs, current repository Evidence and the
   deployed production SHA inspected at publication.
4. Seven required diagrams are useful, deterministic, keyboard accessible and
   text-equivalent on mobile and without JavaScript.
5. Sticky desktop TOC, mobile selector, deep links, current-section state,
   reading progress, shortcuts and back-to-top work through visible controls.
6. Edition III metadata and PDF are synchronized from the canonical source;
   no stale current-edition Edition II label, filename, date or page count
   remains outside intentional archive history.
7. The exact merged SHA is published at `https://ipo.one/whitepaper` and is
   verified on desktop and mobile.

## Test commands

```text
pnpm build:whitepaper
pnpm check:whitepaper
node --test apps/web/test/whitepaper*.test.js
pnpm run check:web-bundle
pnpm run lint
git diff --check
```

Run other affected checks discovered from the implementation and complete
real-browser desktop/mobile acceptance against local and deployed URLs.

## Security and permission checklist

- [x] Every current-state claim is backed by current repository or deployed
      Evidence and identifies its exact maturity boundary.
- [x] Domain Performance Evidence introduces no new authority or public raw
      behavioral history.
- [x] No raw KYC/PII, credential, key, signature, private policy or private
      transaction history enters public/onchain copy or assets.
- [x] Models remain non-authorizing; Capital Providers retain Offer economics.
- [x] Testnet, sandbox, implementation, hosting and real value are not conflated.
- [x] Static whitepaper publication changes no financial runtime permission.

## Permission boundary

The 2026-09-03 Founder instruction explicitly authorizes this exact canonical
whitepaper iteration, repository/PR workflow and production publication at
`https://ipo.one/whitepaper`. It does not authorize any financial-runtime,
data-access, credential, signer, capital, custody, Provider, Venue, mainnet or
real-value change.

## Migration impact

None. The task changes canonical documentation and public static whitepaper
assets only. No database, schema, contract or protocol migration is allowed.

## Rollback plan

Revert or redeploy the prior known-good public release if Edition III routing,
assets, accessibility or content integrity fail. Keep the canonical source,
generated HTML and PDF from one exact release together; never roll back one
format independently. No economic data rollback is involved.

## Completion Evidence

Local release-candidate Evidence as of 2026-09-03:

- Canonical source, generated HTML and export manifest are SHA-256 bound.
- The PDF is a deterministic 43-page A4 export; its CreationDate and ModDate are
  normalized to the publication date and two consecutive builds produce the
  same digest.
- `pnpm check:whitepaper`, the 26-test public static UI group, the 91-test
  transport group, 1,266 repository tests, the M2 toolchain admission check and
  Foundry build/tests pass.
- Local PostgreSQL integration tests were not run because this workspace has no
  `DATABASE_URL`; the release CI must supply the authoritative result.
- Real-browser acceptance passed at 1440×1000 and 390×844: visible reading
  shortcuts, mobile section selection, diagram pointer and Enter-key operation,
  back-to-top, zero horizontal overflow and zero console errors.
- Rendered PDF inspection covered cover, status, normal body, longest diagrams
  and final references. Three defects found during acceptance were fixed and
  regression-checked: printed web-only controls, diagram arrow hit interception
  and a clipped back-to-top target.
- Claim red-team review found no unauthorized mainnet, real-value, custody,
  Provider, Venue, model-authority, partnership, user, revenue or return claim.

Final source commit, PR, merged SHA, CI result, production deployment ID, live
HTTP/metadata/PDF checks and deployed desktop/mobile Evidence remain pending.
The final verdict must use the repository completion vocabulary.
