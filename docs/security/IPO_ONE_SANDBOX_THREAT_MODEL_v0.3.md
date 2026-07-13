# IPO.ONE Public Sandbox Threat Model v0.3

Version: v0.3
Date: 2026-07-12
Status: Repository, container, and local non-funds tenant-RLS controls
implemented; authenticated durable composition and hosted edge remain separate
security and operations decisions

## Scope and Security Claim

This model covers the repository's no-real-funds Node.js public sandbox, static
control plane, OpenAPI contract, JavaScript SDK, in-memory demo state, sandbox
Rail adapter, and optional PostgreSQL event-runtime tests.

The claim is deliberately bounded: the sandbox is hardened and adversarially
tested for its declared demo use. It is not claimed to be invulnerable, formally
verified, independently penetration-tested, production multi-tenant, or safe
for real funds, credentials, KYC/PII, legal agreements, or financial decisions.

## Protected Assets

| Asset | Required property |
| --- | --- |
| Demo visitor state | One unknown sandbox session must not read or mutate another session's process-local state. |
| Protocol invariants | Mandate, spend policy, amount, Rail, ledger, Evidence, and repayment checks must fail closed. |
| Service availability | One request or one retained session must not consume unbounded memory, CPU, sockets, headers, body bytes, or event history. |
| Browser integrity | API-controlled values must not execute script or escape the intended DOM and resource policy. |
| Error boundary | Public failures must not expose stack traces, filesystem paths, secrets, SQL details, or raw internal errors. |
| Repository and CI | Dependencies must be locked, CI permissions minimal, and third-party actions pinned immutably. |
| Public origin | Internet traffic must traverse the approved HTTPS edge and cannot select an arbitrary application Host. |
| Optional durable tenant state | One tenant cannot read, mutate, reference, or block another tenant's command and protocol state. |

There are intentionally no production secrets, private keys, raw KYC records,
custodied assets, or real payment credentials in the supported sandbox surface.

## Trust Boundaries

```text
Untrusted browser / Agent client
  -> proposed HTTPS load balancer and Cloud Armor
  -> load-balancer-only Cloud Run origin
  -> strict Host/HTTPS Node HTTP boundary
  -> per-session serialized demo controller
  -> domain services and fail-closed policy checks
  -> in-memory event, Evidence, Ledger, and sandbox Rail state

Optional isolated test database
  <- branded transaction-local Tenant Security Context
  <- non-owner application role + forced PostgreSQL RLS
  <- parameterized repository and checksum-locked migrations

GitHub contributor input
  -> read-only, SHA-pinned quality workflow
  -> digest-pinned, non-root, read-only-smoked container
```

Remote plugin manifests are data only. The current runtime loads no plugin
code, calls no KYC/KYP/provider/payment endpoint, and moves no production funds.

## Attacker Model

Assume an anonymous attacker can:

- send arbitrary HTTP methods, request targets, headers, encodings, JSON, path
  parameters, request IDs, and sandbox session IDs;
- issue concurrent and repeated requests, intentionally abandon bodies, and
  attempt resource exhaustion;
- know or share a sandbox session ID and mutate that demo partition;
- inspect all public source, schemas, OpenAPI operations, and client code;
- trigger every public demo workflow and synthetic learning cycle.

Do not assume the attacker can read the host filesystem, alter deployed source,
access a database not exposed by the application, or bypass the hosting edge.
Those are deployment concerns and must be assessed separately.

## Control Matrix

| Threat | Current control | Automated evidence |
| --- | --- | --- |
| Cross-session state overwrite | 128-entry high-entropy partition map, 30-minute TTL, no implicit shared default, serialized operations | Two-client isolation test and live smoke |
| Session race / partial mutation | Promise queue serializes all API operations within one session | Concurrent-safe controller path plus protocol tests |
| Unbounded retained history | 32-mutation session budget; reset clears state and budget | Mutation exhaustion returns `429`; reset recovery test |
| Request/body memory exhaustion | 64 KiB byte limit, 2,048-character target, JSON depth/node/string limits, 78-digit amount limit | Oversized, deep, malformed, and wide-number attack tests |
| Connection and slow-request exhaustion | 10s header, 15s request, 20s socket, 5s keep-alive timeouts; 100 headers; 100 requests/socket; 256 connections | Source assertions and live adversarial suite |
| Request flood / expensive read abuse | 600 requests/process/minute, 64 active requests, cached vertical-slice result | Source assertions; hosted edge limit remains mandatory |
| Request smuggling ambiguity | Strict Node parser, 16 KiB header cap, conflicting transfer/content length rejection, malformed-client handler | Raw malformed HTTP test |
| Method/content confusion | Explicit method allowlists, JSON and structured-suffix JSON only, compressed body rejection | `405` and `415` attack tests |
| Mass assignment / prototype pollution | Per-operation field allowlists, JSON object root, prohibited prototype keys | Unknown field and pollution-key tests |
| Path traversal / Host manipulation | Exact Host allowlist, origin-form target enforcement, canonical relative-path containment | byte-level hostile Host, ambiguous target, and encoded traversal tests |
| Origin bypass / downgrade | Production requires trusted HTTPS proxy proof and HSTS; proposed Cloud Run ingress is load-balancer-only with default URL disabled | production child-process tests for 421, 426, HSTS, and release headers; cloud control pending |
| Reflected header injection | Bounded safe request/session patterns; unsafe values replaced with UUIDs | hostile identifier test |
| Browser injection / clickjacking | text-safe DOM rendering, same-origin CSP, frame denial, MIME protection, no third-party runtime assets | static UI assertions and browser regression |
| Error information disclosure | RFC 9457 Problem Details, stable codes, generic unexpected-error detail | unit and live malformed-input tests |
| SQL injection / replay corruption | Parameterized values, serializable transaction, optimistic stream version, idempotency hash, outbox/inbox constraints | PostgreSQL rollback, concurrency, replay, lease, and restart suite |
| Durable cross-tenant access or key collision | Immutable `tenant_id`, tenant-aware foreign keys and runtime identities, non-owner role verification, transaction-local context, `ENABLE` + `FORCE RLS`, `USING`/`WITH CHECK`, and write guards | Two-tenant least-privilege read/write/FK/key-reuse matrix, pooled context cleanup, and full catalog coverage assertion |
| Supply-chain substitution | `pnpm-lock.yaml`, frozen install, production audit, minimal workflow permissions, full-SHA actions | CI workflow assertions and `pnpm audit --prod` |
| Container privilege/write abuse | Signed digest-pinned shell-free distroless runtime, UID/GID 65532, no package manager, read-only/no-capability/no-new-privileges CI invocation | deployment static gate and production container smoke |
| Application log data leakage | Fixed route categories; no body, query, sandbox session, raw IP, stack, or unexpected message fields | source review and bounded structured logger |

The matrix is aligned to the OWASP API Security Top 10, especially API4
Unrestricted Resource Consumption, API6 Sensitive Business Flows, API8
Security Misconfiguration, and API10 Unsafe Consumption of APIs.

## Residual Risks and No-Go Boundaries

The following are known and intentional blockers, not hidden launch claims:

1. A sandbox session ID is not a secret or credential. Anyone who knows it can
   inspect and alter that demo state. No private or valuable data may enter it.
2. In-process limits are defense in depth, not distributed DDoS protection.
   The proposed edge is documented but not deployed; hosted release still
   requires verified TLS, Cloud Armor, quotas, monitoring, rollback, and an
   incident owner.
3. The public sandbox has no AuthN, RBAC, authenticated durable command gateway,
   dual control, or break-glass mechanism. The optional PostgreSQL foundation
   now enforces Tenant Security Context and RLS, but it is not reachable from
   the anonymous public API and is not a production identity claim.
4. Most demo state is in memory and is lost on restart. Only the optional Rail
   repository has PostgreSQL recovery evidence.
5. Wallet binding signatures are demo fixtures. No production key proof,
   nonce store, rotation, revocation, or credential lifecycle is implemented.
6. Dependency audit detects published advisories; it is not proof that a
   dependency or the platform contains no unknown vulnerability.
7. No independent penetration test, formal verification, smart-contract audit,
   cloud configuration review, or production infrastructure review has occurred.

Any real-value, private multi-tenant, regulated, or externally integrated use
is prohibited until the remaining SECURITY-001 deployment owners, identity
provider, authenticated gateway, and production launch gates are approved.

## Verification Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run demo
pnpm audit --prod
```

The live browser and SDK smoke additionally run against `pnpm run dev`. The CI
workflow repeats every command on the exact pushed commit with PostgreSQL 17.

## References

- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP API4: Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [OWASP API8: Security Misconfiguration](https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/)
- [Node.js HTTP server timeout guidance](https://nodejs.org/api/http.html#serverrequesttimeout)
- [GitHub Actions SHA pinning](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
