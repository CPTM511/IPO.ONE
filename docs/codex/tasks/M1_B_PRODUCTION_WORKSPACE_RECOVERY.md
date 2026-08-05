# M1-B Production Workspace Recovery

## Context

The Vercel primary sandbox serves a production-neutral web shell whose
`ipo-one-workspace-name` value is empty. An authenticated Principal Controller
session was valid, but the browser skipped server workspace recovery, exposed a
Human mutation to the wrong role, and left the Agent authority entry disabled.

## Scope

- Recover authenticated workspace truth on the production-neutral primary host.
- Derive Human and Principal access from the recovered server workspace kind.
- Keep Human mutations fail-closed for a Principal Controller session.
- Route Agent authority setup into its visible Human Principal control surface.
- Make the Agent Console's initial authority action operable.
- Add regression coverage for the production-neutral host.

## Non-goals

- Do not widen Principal Controller capabilities.
- Do not provision or invent a Human Borrower wallet credential.
- Do not change fees, signers, withdrawals, transfers, chains, credit policy, or
  real-funds posture.
- Do not modify the protected Capital Network or Risk browser-host WIP files.
- Do not create an RC branch or release tag.

## Likely files

- `apps/web/src/app.js`
- `apps/web/src/principal-workspace-access.js`
- `apps/web/test/principal-workspace-access.test.js`
- `apps/web/test/static-ui.test.js`

## Acceptance criteria

1. An empty production host recovers authenticated `principal_controller` or
   `human_borrower` server truth.
2. A Principal Controller cannot invoke Human Subject creation from the UI.
3. The Agent Console initial `Set up Agent authority` action is enabled after
   Principal recovery.
4. Opening Agent authority from the Agent Workspace switches to the Human
   Principal control surface, expands the disclosure, and exposes the
   `Create Agent Subject` control.
5. The deployed Vercel sandbox is verified with real mouse clicks in the
   authenticated Founder Chrome session.
6. Authorization audit and PostgreSQL projections confirm the observed result.

## Test commands

```sh
node --test apps/web/test/principal-workspace-access.test.js apps/web/test/static-ui.test.js
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:transport
```

## Security checklist

- Server workspace kind remains authoritative.
- Browser mode never widens an authenticated role.
- Human and Agent mutations remain capability-enforced by the backend.
- No secret, private key, signer, or wallet credential is added to source.
- No real-funds or external venue-write operation is introduced.

## Permission boundary

Authorized work is limited to the deployable no-funds M1-B Sandbox and its
existing Vercel primary/risk projects. Human Borrower identity provisioning
requires a separate Founder-supplied invitation and wallet decision.

## Migration impact

None. No schema or data migration is required.

## Rollback plan

Re-point the Vercel aliases to the previously recorded deployment and revert
only this bounded ordinary closure commit. Database state is not migrated by
this change.

## Completion evidence

- Exact commit and tree hashes.
- Complete automated test output.
- Vercel deployment IDs and readiness output.
- Mouse-click screenshots and route/control observations.
- Authorization audit events and PostgreSQL projection counts.

## Browser-discovered regression

The first production mouse run proved that keeping Agent interaction mode while
opening the Principal authority disclosure left the disclosure under the hidden
`request-credit-human` container. The bounded correction restores the explicit
Human Principal mode before opening the already authorized disclosure. This
changes presentation only; authenticated server workspace truth remains the
authorization source.
