# Authorization

This module owns two related but separate boundaries:

- delegated `Mandate` state constraining a Subject's providers, categories,
  assets, time, amount, nonce, revocation, and utilization; and
- the SECURITY-001 tenant authorization contract shared by Human, Agent,
  Provider, auditor, risk, operations, and system-worker callers.

The tenant boundary is deny-by-default. It combines a versioned operation
registry, explicit capability intersection, active Membership and client
binding, Actor/Tenant object ownership, exact purpose-bound AccessGrants, live
Mandate/SpendPolicy/risk checks, recent privileged MFA, reason and idempotency
requirements, dual-control verification, short-lived branded decisions, TOCTOU
revalidation, and append-only allow/deny audit.

Public sandbox operations are classified separately and cannot be treated as
authenticated tenant authority. Outward object denials use one non-enumerating
contract. Audit adapter failure fails closed, including asynchronous failures.

The current directories, live-state adapter, and audit store are bounded
in-memory reference implementations for local non-funds validation. DATA-003
must provide durable repositories and transactional command composition;
APPROVAL-001 and ABUSE-001 must provide durable dual control and resource
controls. No current code enables production permissions, real funds, KYC/KYP,
Provider execution, or authenticated public deployment.
