# ADR WEB-027K1 — Explicit local synthetic Human activation

Status: Accepted for the exact isolated local candidate/proof only, Founder approval of WEB-027K (“批准”, 2026-09-06); implementation 2026-09-07.

## Context and scope

Existing Human Subjects remain pending after Subject / Consent / synthetic reference creation. Execution AccountBinding correctly requires an active Subject. Add an explicit, visible review-and-confirm transition using the existing versioned Tenant Command Gateway and the same Subject aggregate, not a parallel identity model.

The closed operation `pilotActivateSandboxHumanSubject` requires `subject.activate.sandbox.self`, the exact Human borrower role, current owner binding, pending synthetic Subject, current updatedAt, active Human-self Principal, unexpired scoped Consent, current approved local synthetic identity reference bound to that Consent/hash, and no adverse Obligation/frozen CreditLine. Subject and Principal locks, serializable Gateway transaction, event version and durable idempotency apply. Active/suspended/closed/unknown states fail; the operation cannot unfreeze a profile.

Only the reviewed local flag and exact candidate/proof database may execute it. Migration 0079 retains the production and previous local provisioning sets and adds the Human-only capability for the named `web027k` local generation. Startup rotates valid ordinary credentials and invalidates old sessions/enrollments; Risk/Capital capabilities are unchanged. A missing/revoked/expired enrollment is never re-created by rotation.

## Interfaces and acceptance

Human: visible “Activate sandbox profile”, native modal with explicit consequence, cancel and confirm, server re-read after completion/refresh. HTTP/SDK: closed `tenant_protocol.v1` operation and new unique response schema. Agent's equivalent activation remains the existing versioned account challenge/proof API/MCP; this Human-self capability never grants an Agent authority over Human identity.

Accept through visible clicks on fresh and existing pending profiles, then wallet binding/discovery/read/revoke. Verify stale state, expiration, wrong owner/tenant/reference/provider, forbidden state, duplicate operation, refresh, logout/login and process restart. Unit security cases supplement actual candidate PostgreSQL/browser evidence; neither replaces it.

## Non-goals, migration and rollback

No real KYC, credit grant, funds, production, network Provider, chain write, risk-policy change, auto-activation or authority on wallet login. Original 8895–8898 service/database remains unchanged. No external dependency.

Migration 0079 updates only the guarded provisioning function. Rollback disables the operation/grants, revokes newly issued credentials and retains immutable authentication/domain events. Keep Subject active facts; never falsify an active-to-pending historical rollback. Source rollback must use a compatible generation or retain fail-closed login, not resurrect the old credentials.

Validation: `check:tenant-protocol`, `typecheck`, `check:schemas`, `check:migrations`, `test:transport`, `test:security`, handler/local profile tests, dedicated PostgreSQL suite, candidate browser acceptance. Final status remains `BLOCKED — NOT COMPLETE` until evidence and WEB-027's remaining feature matrix pass.
