# WEB-021: Local workspace role-switch recovery

Status: Implemented, locally verified, and sealed in LOCAL-RC-002

## Context

The local Borrower and Principal workspaces use different ports on the same
`127.0.0.1` host. Secure host-only cookies are scoped by host, not port, so a
Borrower session created on port 8787 is also presented when the user opens the
Principal workspace on port 8788. Authentication remains valid, but the
server-derived role is still `human_borrower`, so Principal-only Agent Subject
and Mandate operations correctly fail closed.

WEB-020 hid those operations but did not provide a way to replace the
cross-port Borrower session. The user therefore saw `Signed in` and
`Principal workspace required` with no usable next action.

## Scope

- Detect a mismatch between the current local workspace and the authenticated
  `workspaceKind` before hydrating any role-specific resource.
- Fail the product workspace closed and show one explicit role-switch action.
- Sign out the current role before navigating from Borrower to Principal.
- Preserve discovered wallet Providers while clearing the selected wallet,
  account, network, private state, and host session.
- Require a fresh wallet signature on the target workspace.

## Non-goals

- No merged multi-role session and no automatic role escalation.
- No permission, capability, API, schema, database, migration, or Credential
  change.
- No browser access to private keys, raw signatures, Agent credentials, or
  sensitive identifiers.
- No funds, chain write, mainnet, deployment, or production change.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`

## Acceptance criteria

- [x] A Borrower session opened on the Principal port is identified as a role
      mismatch, not as a usable Principal workspace.
- [x] Role-specific resources are not hydrated after a mismatch.
- [x] The user receives a visible `Switch to Principal session` action.
- [x] Switching revokes the current host session, clears wallet selection and
      private state, and requires a fresh wallet signature.
- [x] Discovered wallet Providers remain selectable after explicit sign-out.
- [x] A correct Principal session can create or recover an Agent Subject and
      continue through the existing one-use Agent Host proof flow.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
node --test apps/web/test/*.test.js
pnpm run check:web-bundle
pnpm run local:up
pnpm run local:acceptance
pnpm test
git diff --check
```

## Security checklist

- [x] Authentication does not imply or widen authorization.
- [x] Cross-port role mismatch fails closed before resource hydration.
- [x] Role switching is explicit and requires reauthentication.
- [x] Wallet Provider discovery metadata remains non-authorizing.
- [x] No credential, private key, signature, PII, or sensitive resource ID is
      added to URLs or persistent browser state.
- [x] No funds, external execution, chain write, signer, contract, risk, or
      deployment authority is introduced.

## Verification

- `node --check apps/web/src/app.js`: passed.
- `node --test apps/web/test/*.test.js`: 102 passed.
- `pnpm run check:web-bundle`: passed with 818 unique IDs.
- `pnpm test`: 668 passed.
- `pnpm run local:up`: 8787-8790 healthy after image rebuild.
- `pnpm run local:acceptance`: passed with PostgreSQL 17, 48 migrations,
  wallet-gated workspaces, durable Agent proof loopback, reconciliation, and
  complete Evidence-anchor coverage.
- The rebuilt 8787 and 8788 bundles contain the role-mismatch recovery marker
  and the Principal-session switch control.
- Browser smoke check: the rebuilt Principal entry at
  `http://127.0.0.1:8788/#human` loads without falling back to the previous
  stale bundle.

The sealed release-candidate hash set is intentionally not rewritten by this
task. Resealing remains a separate human-approved repository action.
