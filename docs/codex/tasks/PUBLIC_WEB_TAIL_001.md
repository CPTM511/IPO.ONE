# PUBLIC-WEB-TAIL-001 — Retire stale service workers and publish crawler policy

Status: `LOCAL VERIFIED — REVIEW AND DEPLOYMENT PENDING`

Date: 2026-09-03

Baseline: `1177f2afccda10878146e9e7afbfe5adde2fa0b9`

## Context and current baseline

The final Founding Edition III production release is healthy and its scheduled
no-funds Cron completed with reconciliation passed. A read-only production-log
review still found repeated `404` responses for `/sw.js` from browsers carrying
a historical service-worker registration and `404` responses for
`/robots.txt`. The current product intentionally has no active offline cache or
service-worker feature, so a retirement worker is preferable to leaving stale
registrations polling a missing resource. The public site also needs a minimal,
explicit crawler policy that keeps authenticated and operational routes out of
the discoverable surface without representing `robots.txt` as a security
control.

## Scope

- Serve a root-scoped retirement service worker that installs, activates and
  unregisters itself without intercepting requests or retaining cache state.
- Serve a minimal `robots.txt` that allows public pages and asks crawlers not to
  index authentication, Tenant, current operational API or legacy `/v1/`
  routes.
- Add transport and static-source regression coverage for both assets,
  including `GET` and `HEAD` behavior.
- Update the Founding Edition III completion Evidence to record the observed
  final-release Cron success and removal of the one-shot operation variable.
- Verify the two assets and unchanged whitepaper experience locally and, after
  normal review, against the exact deployed SHA.

## Non-goals

- No active offline/PWA cache, fetch interception, push notification or
  background synchronization.
- No authentication, authorization, Session, Tenant, Credential, Cron,
  database, schema, Ledger, Obligation, Evidence or financial-runtime change.
- No environment-variable, production secret, Provider, signer, custody,
  mainnet, real-value, funds or deployment-profile change.
- No sitemap, analytics, search-console integration or broader SEO rewrite.
- `robots.txt` is advisory only and is not an access-control boundary.

## Likely files

- `apps/web/src/sw.js`
- `apps/web/src/robots.txt`
- `apps/api/src/server.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `security/test/server-security.test.mjs`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `apps/web/test/static-ui.test.js`
- `docs/codex/tasks/WHITEPAPER_FOUNDING_EDITION_III.md`
- this task record

## Given / When / Then acceptance criteria

1. Given a browser with a stale root service-worker registration, when it
   requests `/sw.js`, then the server returns JavaScript that claims no fetch
   events, waits for activation and unregisters the registration.
2. Given an ordinary `GET` or `HEAD` request for `/sw.js`, when the static asset
   handler serves it, then the response is `200`, uses a JavaScript content
   type and retains the runtime's standard cache/security headers.
3. Given a crawler request for `/robots.txt`, when the asset is read, then the
   response is `200 text/plain`, allows `/` and disallows `/auth/`, `/tenant/`,
   `/api/` and legacy `/v1/`; no rule claims to authorize or protect a route.
4. Given a `HEAD` request for either asset, when it completes, then the body is
   empty and the content length matches the corresponding `GET` representation.
5. Given the final production release, when Cron Evidence is recorded, then the
   task document distinguishes the predecessor failure from the current
   `1177f2af...` HTTP 200 result with `reconciliationStatus: passed` and
   `realFundsEnabled: false`.
6. Given the changed release, when repository and browser gates run, then the
   whitepaper and public product navigation retain their existing behavior and
   no console error or horizontal overflow is introduced.

## Exact test commands

```text
node --test apps/web/test/static-ui.test.js
node --test apps/tenant-api/test/transport-conformance.test.mjs
node --test security/test/server-security.test.mjs
pnpm check:whitepaper
pnpm check
git diff --check
```

Production acceptance additionally checks `/sw.js`, `/robots.txt`,
`/whitepaper`, `/readyz`, deployment metadata and current release logs, then
uses visible browser controls on the exact deployed SHA.

## Security checklist

- [x] Retirement worker contains no fetch handler, cache write, network call,
      credential access, telemetry or product mutation.
- [x] Robots policy is documented as advisory, not authorization.
- [x] Standard CSP, frame, MIME, referrer, permissions and runtime-specific
      cache-control headers are reused by the existing static asset boundaries.
- [x] No raw PII, Credential, key, signature, internal identifier or private
      runtime configuration enters either public asset.
- [x] No Human/Agent kernel, policy or financial state changes.

## Permission boundary

Founder direction authorizes inspection and repair of remaining product-close
items. This issue is limited to static public assets, regression tests and
truthful Evidence. It does not authorize environment-variable mutation,
Credential lifecycle actions, Cron execution, production permission changes,
funds movement or real value.

## Data and migration impact

None. No database, schema, protocol, contract, Event, Evidence or durable
business state is changed. Existing browser service-worker registration state
is retired by the browser after activation of the static retirement worker.

## Rollback plan

Revert the asset routes and two static files together. If the retirement worker
causes an unexpected browser regression, restore the preceding production
deployment. No data rollback is required.

## Required Evidence

- Targeted static and transport tests.
- Legacy public-sandbox HTTP security regression.
- Full repository Quality Gate on the exact review commit.
- HTTP status, content type and content checks for both new assets.
- Production metadata and `/readyz` bound to the exact merged SHA.
- Current Cron/log scan without 5xx or failed events.
- Desktop and mobile visible-control browser smoke for the public experience.

## Dependencies and sequencing

This issue depends on the merged Founding Edition III release and does not
depend on M2 or real-value work. It must merge through the normal PR workflow
before any production deployment. The one-shot M3 operation variable must
remain absent; this issue neither recreates nor edits it.

## Completion Evidence

Local Evidence on 2026-09-03:

- `node --test apps/web/test/static-ui.test.js`: `26/26` passed.
- `node --test apps/tenant-api/test/transport-conformance.test.mjs`: `9/9`
  passed.
- `node --test security/test/server-security.test.mjs`: `9/9` passed.
- `pnpm check:whitepaper`: Founding Edition III HTML remained current with 48
  anchors and 7 diagrams; the PDF remained current at 43 pages and 1,088,673
  bytes.
- `pnpm check` passed runtime, lint, contract types, 147 Schema contracts, 21
  OpenAPI operations, 73 migration pairs, Tenant protocol, product
  traceability, 35 security tests and 91 transport/SDK tests before stopping at
  the expected local environment boundary: `DATABASE_URL is required for
  PostgreSQL integration tests.` This is not a changed-code test failure; the
  exact review commit still requires the repository CI PostgreSQL gate.
- Loopback `GET` and `HEAD` requests returned `200` with correct MIME and length
  for `/sw.js` and `/robots.txt`; the robots body includes all four protected
  crawler prefixes.
- A real Chromium session registered `/sw.js` at the root scope and observed
  zero remaining registrations after activation. The visible whitepaper CTA
  and product-home link worked, desktop and 390 x 844 layouts had zero
  horizontal overflow, and the console had zero errors or warnings.

Normal review, CI, merged-SHA deployment and production verification remain
pending.
