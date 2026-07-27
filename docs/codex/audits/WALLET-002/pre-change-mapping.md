# WALLET-002 pre-change mapping

Date: 2026-07-23  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Browser

- `accountsChanged` and `chainChanged` update browser display state only.
- There is no `disconnect` listener.
- Explicit Provider replacement clears displayed address/network state but does
  not contact the server.
- Protected Human UI requests do not have a wallet-context quarantine check.
- There is no cross-tab wallet-authority invalidation message.
- A SIWE request is one-use server-side, but the browser has no context epoch
  that abandons a challenge when the selected Provider changes mid-flow.

## Human BFF and route

- `POST /auth/v1/logout` requires exact Origin and CSRF, then revokes the
  current host session and clears both host-only cookies.
- The route authenticates and revokes in two separate calls. After the first
  successful revoke, a retry cannot authenticate the now-terminal session.
- Logout has no explicit idempotency key or replay response contract.
- There is no wallet-context invalidation route.

## Session and credential truth

- In-memory and PostgreSQL session stores already use opaque keyed handle and
  CSRF hashes.
- PostgreSQL sessions survive restart, are Tenant/RLS scoped, and transition
  append-only to `rotated`, `revoked`, or `expired`.
- Session revocation already emits one credential-free
  `session_revoked` authentication Event.
- Every protected Human request resolves the current session again. A durable
  terminal session therefore blocks every tab and every later AuthZ decision.
- Credential rotation, Actor/Tenant/Membership changes, and stale policy
  already fail closed independently of wallet lifecycle events.

## Proof lifecycle

- SIWE challenges are server-generated, address/chain/domain/URI bound,
  encrypted at rest, short-lived, and consumed once.
- Agent account-binding challenges are a separate durable Principal/Agent
  authority workflow. Browser Provider selection must not silently mutate or
  revoke that canonical binding.
- WALLET-002 must invalidate the browser host session and abandon any in-flight
  browser use of a pre-change SIWE challenge. It must not invent automatic
  reauthentication or a second account-binding authority model.

## Required transition

1. A material wallet context event locally quarantines protected browser work
   before any asynchronous invalidation call.
2. All same-origin tabs receive the quarantine signal.
3. The BFF validates Origin, CSRF, session, reason, and an opaque idempotency
   key in one session-store operation.
4. PostgreSQL records the terminal session, idempotency reference, and one
   existing `session_revoked` Event atomically.
5. Exact retries, including after process restart, return the same bounded
   invalidation result without another Event.
6. Network or server failure leaves the browser quarantined and requires fresh
   user-initiated SIWE before protected work can resume.
