# WEB-020: Principal Agent-authority entry recovery

Status: Implemented, locally verified, and sealed in LOCAL-RC-002

## Context

The shared Human/Agent Credit screen rendered the complete Agent authority form
inside the Borrower workspace. The browser enabled several controls whenever
the Tenant catalog was connected, even though account-proof challenge and
binding operations require the separate Principal Controller workspace.
Clicking `Create signing request` from the Borrower workspace therefore reached
the correct fail-closed server denial and left the user unable to continue.

The second transition was also unclear: `Refresh binding` is a read-only check.
After a Principal creates the one-use EIP-712 request, the registered Agent Host
must submit proof outside the browser before a binding can exist.

## Scope

- Keep Agent authority operations hidden and disabled until both the host
  workspace and authenticated server workspace identify the Principal
  Controller.
- Present Borrower users with a clear local Principal-workspace continuation
  link instead of unusable controls.
- Add a defensive browser preflight before every Agent authority mutation.
- Explain the one-use proof handoff and exact local Agent Host command.
- Preserve automatic read-only polling and the explicit binding refresh.

## Non-goals

- No new Borrower, Principal, Agent, or Tenant capability.
- No change to authorization policy, API operations, schemas, database,
  migrations, Mandate semantics, or Agent credential lifecycle.
- No browser signing, private-key access, automatic proof creation, or
  automatic Mandate activation.
- No real funds, mainnet, deployment, or production permission.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`

## Acceptance criteria

- [x] Borrower workspace never presents executable Principal authority controls.
- [x] Local Borrower workspace links to the adjacent Principal workspace without
      adding a secret, actor ID, resource ID, or credential to the URL.
- [x] The form becomes available only when `controller` host identity and
      `principal_controller` authenticated workspace truth both match.
- [x] DOM manipulation cannot invoke an Agent authority operation from a
      non-Principal workspace.
- [x] An open challenge tells the Principal to move the downloaded request
      inside the repository and run
      `pnpm run local:agent:prove -- <repository-local-challenge.json>` from the
      repository root.
- [x] The browser continues to receive no Agent private key or raw signature.
- [x] After Agent Host submission, polling or `Refresh binding` loads the
      verified binding and allows the existing draft-Mandate step.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
node --test apps/web/test/*.test.js
pnpm run check:web-bundle
pnpm run local:acceptance
pnpm run check
git diff --check
```

## Security checklist

- [x] Principal-only capability enforcement remains unchanged and fail-closed.
- [x] Borrower permissions are not widened.
- [x] Agent proof remains one-use, short-lived, and Agent Host controlled.
- [x] No private key, raw signature, credential, PII, or sensitive identifier is
      rendered or placed in navigation.
- [x] Missing or denied server resources remain non-enumerating.
- [x] No chain write, funds movement, contract, risk, signer, or deployment
      authority is introduced.

## Verification result

- `node --test apps/web/test/*.test.js`: 101/101 passed.
- `pnpm test`: 667/667 passed.
- `pnpm run check:web-bundle`: passed.
- `pnpm run local:acceptance`: passed against the rebuilt PostgreSQL 17 local
  stack, including the durable Agent proof loopback and four wallet-gated
  workspaces.
- `pnpm run check` reaches the immutable local-RC source check and stops because
  the prior sealed RC intentionally hashes the pre-WEB-020 Web bundle. The old
  sealed manifest was not rewritten; a new local RC must be sealed separately.
