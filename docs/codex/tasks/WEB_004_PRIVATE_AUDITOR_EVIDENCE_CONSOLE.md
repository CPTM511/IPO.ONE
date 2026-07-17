# WEB-004: Private Auditor Obligation Evidence Console

Status: Completed locally and verified on 2026-07-16. This task composes the already-approved
`EVIDENCE-001A` Auditor query into the authenticated Human Host. It does not
grant Human borrowers or Agents any Evidence capability.

## Context

`EVIDENCE-001A` provides an authenticated, cursor-paginated
`pilotReadEvidence` query over immutable Obligation Evidence. The product shell
still exposes only the process-local public demo feed, so an authorized Auditor
cannot use the durable query from a Human-friendly product surface. Product
Charter v1.1 requires Human UI and machine interfaces to remain co-equal over
the same shared protocol truth.

## Scope

1. Add an Aave-inspired, IPO.ONE-native Obligation Evidence workspace to the
   private Tenant Host Evidence view.
2. Query one exact `evidence` resource through `pilotReadEvidence`, using only
   the BFF-issued same-origin CSRF bootstrap and the existing server-side
   Auditor `evidence.read` authorization decision.
3. Render bounded summary fields, source finality, aggregate versions,
   timestamps, hashes, cursor pagination, loading, empty, denied, and failure
   states without rendering payloads or authorization inputs.

## Non-Goals

- No `evidence.read.owned`, Human borrower timeline, Agent SDK/MCP Evidence
  tool, public API, export, subscription, or notification.
- No browser-side role claim, Tenant/actor/grant selector, raw Evidence payload,
  payload reference, PII, credential, or production-funds control.
- No new route, dependency, image asset, production deployment, or permission.

## Likely Files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `apps/tenant-api/test/support/auditor-evidence-visual-preview.mjs`
- `design-qa.md`

## Acceptance Criteria

- [x] The console is hidden on the public shell and available only when a valid
  private Host CSRF bootstrap is present.
- [x] Query requests use the exact `evidence` resource and omit idempotency for
  the read-only `pilotReadEvidence` operation.
- [x] Limits stay within `1..50`; cursors are returned by and passed back to the
  server without client interpretation.
- [x] API-controlled text is rendered with safe DOM APIs and the console never
  exposes an Evidence payload or caller-supplied authority context.
- [x] Denied and unavailable resources share one non-enumerating UI message.
- [x] Desktop and 390px primary query/pagination states pass browser and visual
  QA with no horizontal overflow or console errors.

## Test Commands

```sh
pnpm --filter @ipo-one/web test
pnpm run test:transport
pnpm run check
pnpm run test:security
git diff --check
```

## Security Checklist

- [x] Server authorization remains authoritative and recent-MFA enforcement is
  unchanged.
- [x] The browser cannot submit Tenant, actor, role, capability, grant, or
  authentication context fields.
- [x] Resource identifiers and page size are locally bounded before transport.
- [x] Error copy does not reveal whether the Obligation or Evidence resource
  exists.
- [x] No real funds, arbitrary withdrawal, or production permission is added.

## Local Verification Evidence

- Runtime contract: Node `v24.18.0` selected by `.nvmrc` / `.node-version`;
  pnpm `11.1.3`.
- `pnpm run check`: 242/242 tests passed; 28 Tenant operations, 34 schemas,
  and 48 abuse-control classifications remained closed.
- `pnpm run test:transport`: 22/22 passed.
- `pnpm run test:security`: 21/21 passed.
- Browser: desktop query, cursor pagination, exact hash copy, 390x844 stacked
  rows, non-enumerating denial, and public-shell hiding passed with zero
  warning/error console entries and zero page-level horizontal overflow.
- `git diff --check`: passed.
