# IPO.ONE Tenant, Identity, and Authorization Decision Pack v0.1

Status: SEC-D01 through SEC-D09 approved on 2026-07-13 for local non-funds
implementation only. No production permission is granted by this document;
the Human IdP and break-glass ownership remain deployment gates.

Date: 2026-07-12

## 1. Decision Objective

Approve one non-funds, closed-pilot identity and authorization model that can
serve Human operators and Agent/Provider workloads without confusing:

- application authentication;
- tenant and object authorization;
- Principal-to-Agent Mandate authority;
- wallet/account-binding proof;
- provider attestations; or
- future custody/funds permissions.

These remain independent controls. Passing one never implies passing another.

## 2. Recommended Decision Set

### SEC-D01: Tenant Root and Ownership

**Recommendation:** `Organization` is the tenant root. Every Principal,
Subject, account binding, Mandate, Provider connection, SpendPolicy, Obligation,
Lockbox, Ledger account/transaction, RiskDecision, Evidence projection, API
credential, and operator membership has one immutable `tenant_id`.

- One Principal belongs to exactly one tenant in the closed pilot.
- A Human identity may hold memberships in several tenants, but every request
  selects exactly one active tenant from server-side membership state.
- Tenant identity is derived from the authenticated session/token, never from a
  request body, path, header supplied by the client, wallet address, or plugin.
- Cross-tenant access is denied by default. The only exceptions are explicit,
  versioned, purpose-bound, expiring `AccessGrant` objects for provider delivery,
  scoped audit, or platform reconciliation.
- Cross-tenant grants never authorize funds, credit-limit increases, Mandate
  creation, unfreeze, or credential management.

### SEC-D02: Human Authentication

**Recommendation:** provider-neutral OpenID Connect Authorization Code flow
with PKCE through a server-side Backend for Frontend (BFF).

- IPO.ONE stores no Human password.
- Browser access token/refresh token material remains server-side; the browser
  receives only a `Secure`, `HttpOnly`, host-only, SameSite session cookie.
- Exact redirect URIs, issuer pinning, `state`, `nonce`, PKCE, short session
  lifetime, CSRF protection, and session rotation are mandatory.
- Risk, Admin, credential, approval, and break-glass roles require
  phishing-resistant MFA (WebAuthn/passkey or hardware security key).
- Privileged actions require recent authentication, with a default maximum
  authentication age of 15 minutes.
- The first pilot may use any reviewed OIDC provider that supports organization
  membership, phishing-resistant MFA policy, signed key rotation, audit export,
  SCIM or equivalent deprovisioning, and regional/legal requirements. Vendor
  choice is a deployment approval, not a protocol dependency.

### SEC-D03: Agent, Provider, and Worker Authentication

**Recommendation:** OAuth 2.0 machine clients with short-lived,
audience-restricted, sender-constrained access tokens.

- Agent clients use asymmetric client authentication and DPoP-bound access
  tokens where supported.
- Provider and platform workers use `private_key_jwt` or mTLS; shared client
  secrets are not an approved steady-state mechanism.
- Access token maximum lifetime is 5 minutes. Tokens include unique `jti` and
  are rejected outside issuer, audience, time, tenant, actor, and capability
  scope.
- Long-lived API keys are disabled by default. A time-bounded bootstrap key may
  be approved only for a design partner that cannot support asymmetric OAuth;
  it is shown once, stored only as a keyed hash, expires within 30 days, has one
  tenant and capability set, and must be rotated into asymmetric auth.
- Credential creation, rotation, and revocation are evented. Revocation is
  checked at the authorization boundary for high-impact mutations even if the
  token has not expired.
- Provider webhook authentication is a separate PROVIDER-001 decision and does
  not reuse an Agent access token.

### SEC-D04: Token and Session Claims

**Recommendation:** authorization accepts a closed claim schema:

```text
iss sub aud exp iat nbf jti
tenant_id actor_type client_id
roles capabilities policy_version
auth_time acr amr
```

- Unknown issuers, algorithms, audiences, critical headers, or claim versions
  fail closed.
- The server maps external `sub` to an internal Actor record. External roles or
  group names are never used directly as protocol capabilities.
- Wallet addresses, Subject IDs, Principal IDs, and Mandate IDs are not actor
  authentication claims.

### SEC-D05: Authorization Model

**Recommendation:** deny-by-default capability authorization plus mandatory
object ownership and live policy checks.

Each request must pass, in order:

1. route and method contract;
2. authentication and credential status;
3. active tenant membership/client binding;
4. actor-type and capability policy;
5. object `tenant_id` ownership or explicit `AccessGrant`;
6. resource state and live Mandate/SpendPolicy/risk/cap checks;
7. reason, idempotency, and dual-control requirements; and
8. immutable allow/deny audit recording.

Roles are bundles for administration only. Runtime enforcement uses explicit
capabilities with a versioned policy registry.

| Actor/role | Allowed pilot actions | Explicitly denied |
| --- | --- | --- |
| Tenant Owner | Membership, developer clients, tenant settings, read summaries | Spend execution, unilateral risk override, evidence mutation |
| Developer | Create/manage own Agent Subjects and draft Mandates; read own integration state | Tenant membership, provider activation, risk/admin actions |
| Agent Runtime | Read self; request credit/spend/capture/repay only within active Mandate | Human/admin UI, arbitrary recipient, tenant switching, credential creation |
| Risk Operator | Read tenant risk; freeze/reduce; propose cap/limit changes with reason | Single-party increase/unfreeze, credential/provider management |
| Operations Operator | Rail/provider health, reconciliation, pause/freeze, replay planning | Credit approval, limit increase, Evidence/ledger mutation |
| Auditor | Time-bounded read of Evidence, decisions, and audit exports | Every mutation and secret/PII access |
| Provider Service | Read/acknowledge only assigned provider intents and signed webhook state | Subject portfolio, other providers, policy/admin actions |
| System Worker | One named background capability and tenant/service scope | Interactive login, wildcard capability, break-glass |

### SEC-D06: Database Tenant Enforcement

**Recommendation:** application authorization is primary; PostgreSQL Row-Level
Security (RLS) is mandatory defense in depth for tenant-owned tables.

- Add non-null `tenant_id` and tenant-aware foreign keys/unique constraints.
- The application database role is not the table owner, superuser, or
  `BYPASSRLS`; tenant tables use `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- Every command opens a transaction, validates the Actor/Tenant context, then
  sets transaction-local `app.tenant_id`, `app.actor_id`, and policy version.
  Context must disappear at commit/rollback; pooled session state is never used.
- `USING` and `WITH CHECK` policies both require the active tenant.
- Reconciliation, migration, backup, and incident workers use separate roles
  and do not share application credentials.
- Foreign-key/unique errors are mapped to generic non-enumerating errors because
  PostgreSQL referential checks can bypass RLS for integrity.
- Negative tests substitute every tenant-owned object ID across two tenants and
  assert zero data, timing, and error-detail disclosure beyond the stable API
  contract.

### SEC-D07: Dual Control and Break Glass

**Recommendation:** immediate protective reductions are single-operator;
privilege or exposure increases require two distinct approved actors.

Single authorized actor with reason:

- freeze Subject, Mandate, CreditLine, Lockbox, Provider, Rail, or tenant;
- reduce limits/caps;
- revoke credentials or AccessGrants; and
- stop workers or outbound provider delivery.

Two distinct actors, no self-approval, 30-minute approval expiry:

- unfreeze after stop-loss, security, reconciliation, or default trigger;
- increase tenant/subject/provider/chain/asset cap or credit limit;
- activate a production Provider/Rail/chain/custody integration;
- issue or recover Tenant Owner/Risk/Admin credentials;
- rotate trusted issuer, signing, webhook, or settlement keys;
- approve a cross-tenant grant with non-public financial state; and
- execute projection repair in a production environment.

Break glass:

- two hardware-key custodians, with no shared credential;
- maximum 30-minute elevation, one incident ID, one tenant/scope;
- default capabilities are read, freeze, revoke, and export Evidence only;
- no cap increase, unfreeze, funds movement, history mutation, or raw PII;
- immediate out-of-band notification to Security/Founder/CTO;
- session recording/audit export and review within 24 hours; and
- automatic expiry with no refresh.

### SEC-D08: Rate, Resource, and Enumeration Controls

**Recommended closed-pilot defaults** (subject to load evidence):

| Scope | Default |
| --- | --- |
| Unauthenticated discovery/health | 30 requests/minute/IP plus edge policy |
| Human/Agent reads | 600/minute/actor, 3,000/minute/tenant |
| General mutations | 120/minute/actor, 600/minute/tenant |
| Credit/spend/capture/repay | 30/minute/Agent and mandatory idempotency |
| Credential/login/recovery | 10 attempts/10 minutes/account and network |
| Admin/risk mutations | 30/minute/actor; no automatic retry |
| Reconciliation/export | 6/minute/tenant with queue, size, and time bounds |

Limits also apply to concurrent commands, body/event/projection bytes, open
obligations, providers, credentials, AccessGrants, and export rows. A limit
response never confirms whether a cross-tenant resource exists.

### SEC-D09: Audit, Retention, and Privacy

Every allow and deny decision records:

```text
event_id occurred_at request_id correlation_id
tenant_id actor_id actor_type client_id token_jti_hash
action resource_type resource_id authorization_decision
policy_version reason_code approval_ids source_network_ref_hash
```

- No access token, cookie, private key, signature, authorization code, raw IP,
  raw wallet proof, KYC payload, or PII enters application logs/Evidence.
- Security audit and protocol Evidence are append-only and access-controlled.
- Recommended pre-legal pilot default: 400 days searchable security audit plus
  encrypted archive; protocol obligation/Evidence retention is seven years;
  raw PII remains outside IPO.ONE and follows the licensed provider/originator
  contract. Final retention and deletion rules require pilot-jurisdiction legal
  approval before launch.

## 3. Human Approval Fields

Implementation must not start until all fields are recorded:

| Decision | Required approval |
| --- | --- |
| SEC-D01 tenant model | Approve / revise |
| SEC-D02 Human OIDC+BFF and phishing-resistant privileged MFA | Approve / revise; name reviewed IdP before deployment |
| SEC-D03 workload OAuth, DPoP/private-key/mTLS profile | Approve / revise |
| SEC-D05 role/capability and object authorization matrix | Approve / revise |
| SEC-D06 PostgreSQL RLS defense in depth | Approve / revise |
| SEC-D07 dual-control and break-glass rules | Approve / revise; name custody/review owners before deployment |
| SEC-D08 pilot limits | Approve / revise |
| SEC-D09 retention | Approve / revise; name pilot jurisdiction and legal owner |

Suggested approval record:

```text
I approve IPO.ONE SECURITY-001 decision pack v0.1 (SEC-D01 through SEC-D09)
for local non-funds implementation only. Human IdP vendor remains a deployment
gate. Pilot jurisdiction: [value]. Legal retention owner: [value].
Break-glass custodians/review owner remain a deployment gate.
```

Recorded on 2026-07-13 for local non-funds implementation:

```text
SEC-D01 through SEC-D09: approved
Pilot jurisdiction: United States
Legal retention owner: IPO Consulting
Human IdP vendor: deployment gate
Break-glass custodians/review owner: deployment gate
```

The bounded approval and explicit no-go scope are maintained in
`IPO_ONE_SECURITY_001_APPROVAL_2026-07-13.md`.

## 4. Implementation Sequence After Approval

1. `TENANT-001`: Tenant/Actor/Membership/AccessGrant schema, tenant backfill,
   RLS, database roles, and two-tenant negative tests.
2. `AUTHN-001`: provider-neutral issuer/token verifier, BFF session contract,
   machine-client claims, revocation and test issuer.
3. `AUTHZ-001`: route capability registry, object ownership middleware, reason
   and audit decision envelope.
4. `DATA-003`: compose the durable core repository behind the authenticated
   tenant command gateway; keep public demo sessions isolated.
5. `APPROVAL-001`: dual-control proposals/approvals, expiry, no-self-approval,
   break-glass state machine and Evidence.
6. `ABUSE-001`: actor/tenant/operation quotas, concurrency and cost budgets,
   anti-enumeration tests.
7. Re-run threat model, independent penetration test, restore exercise, and
   closed-pilot launch gate.

## 5. Standards Calibration

- IETF OAuth 2.0 Security Best Current Practice, RFC 9700:
  https://www.rfc-editor.org/info/rfc9700/
- NIST SP 800-63-4 and SP 800-63B authenticator guidance:
  https://pages.nist.gov/800-63-4/sp800-63.html
  https://pages.nist.gov/800-63-4/sp800-63b/authenticators/
- OpenID Foundation FAPI 2.0 Security Profile Final:
  https://openid.net/specs/fapi-security-profile-2_0-final.html
- PostgreSQL Row Security Policies and transaction-local `SET`:
  https://www.postgresql.org/docs/17/ddl-rowsecurity.html
  https://www.postgresql.org/docs/current/sql-set.html
