# SEO-001 — public sitemap and current availability

Started: 2026-10-12. Local verification completed: 2026-10-13 UTC.
Status: locally verified, unpublished candidate; not deployed or user-verified.

## Context and scope

The parent verified that live main
`bbd7ba2276b2ed295a72c2a2f965c191a62de391` already serves crawlable homepage
and whitepaper content, canonical metadata and a working brand-search presence.
The missing sitemap returns 404 and robots has no Sitemap declaration. The
rendered homepage's example-card label is too small to explain current availability
beside the value proposition. Do not claim all SEO is missing or rebuild the site.

Work only in `/workspace/IPO.ONE-seo-20261012`, branch
`codex/public-seo-disclosure-20261012`, from that live main baseline. The prepared
diagnostic branch at `c0b1ca164a22cc927929a69d1640cdf6449be323`, its patch and
Library evidence remain unchanged. No push, PR, merge, deployment, credentials,
denied Actions request retry, new dependency or spending is authorized.

Add a static UTF-8 XML sitemap with only `https://ipo.one/` and
`https://ipo.one/whitepaper`, register its GET/HEAD path in the existing public
asset handler and add its absolute URL to robots.txt. Keep current disallows.
Omit aliases, query/hash variants, private/auth/API routes, assets and invented
last-modified dates. Add an English visible current-availability paragraph below
the landing proposition and in the existing fallback public hero.

## Authority and accurate wording

Product Constitution v1.6, DEC-PUBLIC-BETA-001 and
DEC-METERED-RESOURCE-CREDIT-001 retain the Human/Agent shared kernel and existing
Vercel/Neon architecture. `deploy/launch-policy.v1.json` keeps real funds and
external Provider execution disabled. The current production capability source
in `apps/tenant-api/src/production-tenant-host.js` reports real-value activation,
real funds and production execution submission disabled, and permits only
synthetic or redacted data. Its synthetic Provider resource is not external
execution. The disclosure describes these current restrictions without changing
the product proposition, permissions, financial capabilities or chain claims.

## Files, acceptance and security

Likely files: `apps/web/src/sitemap.xml`, `robots.txt`, `index.html`, scoped CSS,
`apps/tenant-api/src/tenant-web-assets.js`, production-host and static-UI tests,
the existing server-security robots expectation, and one focused browser
regression spec.

Given an anonymous public request, GET and HEAD for sitemap/robots must return
200, the correct MIME type and length, with no session bootstrap, cookies,
authentication or Gateway command. The sitemap must be well-formed XML with
exactly the two canonical public URLs; request headers/query values cannot
introduce Tenant or other URLs. Its declaration and HTML canonical links must
agree. Private, auth, API, workspace, preview and redirect aliases stay excluded.

Given the public landing at desktop/mobile widths and Light/Dark appearance,
the availability paragraph must be visible next to the proposition before its
actions, readable without clipping or overlap, and consistent with the actual
capability document. Existing login, whitepaper links and theme controls remain
operable. No raw IDs, secrets, analytics or financial mutation are introduced.

## Verification and evidence

Run affected production-host/transport/static-UI regressions, focused rendered
public tests, `pnpm check:runtime`, `pnpm lint`, `pnpm typecheck` and
`pnpm check:web-bundle`. Validate sitemap XML and URL exclusions. Preserve exact
commands, results, source SHA and synthetic review URL in an external handoff.
Use already installed Node/pnpm/Chromium and locked dependencies only.

PostgreSQL, chain, full aggregate, remote CI and deployed identity acceptance
are not part of this static public increment. The earlier unrelated 60-second
event-runtime timeout remains unresolved and must not be claimed fixed or
rerun merely to fill time. Record any check that fails or is not run separately.
Search Console impressions/clicks and ranking outcomes are unverified; no
Search Console access or sitemap submission is authorized.

No schema/data migration or dependency change. Rollback is reverting this
isolated local commit; no hosted state changed. Leave an unpublished reviewable
candidate and the loopback synthetic preview available. Product verdict remains
`BLOCKED — NOT COMPLETE` until separately authorized publication/deployment
and deployed acceptance exist.

## Local completion evidence

The runtime change is limited to the existing static route map, sitemap, robots
declaration and two public-hero paragraphs with scoped 14px theme-aware styling.
Existing titles, canonical metadata, product proposition, authentication,
capability output, financial flags, Vercel configuration and SQL are unchanged.
The existing bundle builder recursively copies the web source, so the sitemap
requires no additional build rule or dependency.

| Stage | Result |
| --- | --- |
| Public SEO, production-host and static-UI regressions | PASS: 47 tests |
| Existing transport and server-security checks | PASS: 19 tests |
| Rendered public availability and XML regression | PASS: 5 tests; desktop/mobile, Light/Dark, reload, visible access and whitepaper navigation |
| Runtime contract | PASS: Node 26.5.0 and pnpm 11.11.0 |
| UI baseline, source and boundary lint | PASS: current Precision Terminal, 932 parsed modules and unchanged boundaries |
| Contract typecheck | PASS: 3 package surfaces and 76 value exports |
| Web bundle integrity | PASS: 48 authored modules and 1,135 unique static IDs |
| XML parser, canonical allowlist, source syntax and diff whitespace | PASS |
| PostgreSQL/full Quality Gate, remote CI, deployment, real identity and Search Console measurement | NOT RUN |

Failed attempts remain preserved separately: initial workspace dependency
resolution lacked the already-installed package-level links; reusing matching
locked dependencies resolved that setup issue without installation. The new
public regressions then reproduced two sitemap 404s and the missing disclosure
before implementation. One existing security assertion expected the old robots
bytes; its updated expectation retains every disallow. Two browser attempts
targeted existing hidden desktop navigation at mobile width; the final tests
use visible Open IPO.ONE and whitepaper controls, without changing navigation.
No timeout or assertion was relaxed. Final small test-literal corrections were
syntax-checked after the full lint invocation.

The unrelated historical event-runtime 60-second PostgreSQL timeout remains
unresolved and was not rerun here. Local test success does not close that gate.
No denied Actions request was retried, and no remote publication occurred.

Cloud-only synthetic review: `http://127.0.0.1:42935/`. Its fixture serves this
source tree and remains signed out initially; it is not deployed acceptance or
real-user identity evidence. Final SHA, source hashes, exact patch, commands,
accepted and failed logs are in the external SEO handoff manifest to avoid a
self-referential commit identifier. The protected diagnostic commit and its
existing Library bytes remain unchanged.

This supplies a canonical discovery hint and clearer current-availability
information; it does not promise indexing, rankings, AI citation or traffic
growth. Next gate: separately approved publication/deployment, then verify live
GET/HEAD, robots declaration and rendered disclosure at the deployed SHA. Use
authorized Search Console data later to assess discovery, impressions and clicks.
