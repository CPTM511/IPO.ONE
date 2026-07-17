# PILOT-001 Private Product Composition — Audit

## Outcome

IPO.ONE now has an executable PostgreSQL-backed private no-funds product rather
than only isolated hosts and protocol tests. `pnpm run pilot:start` migrates and
provisions the database, verifies a non-owner `NOBYPASSRLS` application role,
and launches three role-separated loopback workspaces over one shared Tenant
Gateway.

## Delivered surfaces

- Human Borrower: Subject, scoped Consent, automatic no-PII synthetic identity
  Evidence, deterministic Decision/Offer, exact acceptance, shared Obligation,
  signed non-withdrawable execution, repayment, servicing, and Evidence.
- Principal Controller: Agent Subject creation and the existing CAIP-10 proof,
  bounded Mandate, activation, and copy-safe MCP handoff workflow.
- Agent Runtime: local stdio MCP over the same durable Gateway. The Host now
  verifies the database Subject-to-Actor binding instead of incorrectly
  requiring Actor ID and Subject ID to be identical.
- Risk Operations: exact Risk portfolio and read-only PII-free servicing queue
  with recent phishing-resistant authentication enforcement.

## Security properties

- Listeners are fixed to `127.0.0.1`; remote/public private transport remains
  disabled.
- Browser bootstrap uses one keyed HttpOnly, Secure, SameSite session plus CSRF;
  credentials and Authentication Context never enter HTML or JavaScript.
- Borrower, Controller, Agent, and Risk identities have distinct Memberships
  and capability sets.
- The local identity Provider emits only hash-linked synthetic Evidence with
  the exact Decision and Offer-acceptance purposes; it accepts no raw PII.
- Real funds, withdrawals, production identity, mainnet signing, and remote MCP
  remain disabled.

## Verification evidence

- Full repository gate: `pnpm run check` — **310/310 tests passed**, 46 schemas,
  21 OpenAPI operations, 23 migration pairs, and 34 private operations aligned.
- Real PostgreSQL 17 smoke: clean database migration, role provisioning, forced
  RLS runtime assertion, shutdown/restart, and durable reload all passed.
- Real browser Human path passed from an empty database:
  Subject → Consent + synthetic identity → approved Decision/Offer → accepted
  Obligation → signed sandbox execution → full repayment → reload restored
  `Fully Repaid` from server state.
- Real browser Principal path created an Agent Subject bound to
  `actor_agent_pilot_alpha`. The later IDENTITY-002 verification completed the
  full account-proof, Mandate, MCP, Offer, Obligation, execution, full repayment,
  owned-state, and Evidence path against the same PostgreSQL runtime.
- Real browser Risk path loaded `servicing_queue_local_private_pilot` under the
  Risk identity and returned an authorized empty adverse queue.

## Remaining production gates

This is a usable private no-funds commercialization candidate, not authorization
for real lending. Production Human IdP/KYC/privacy, legal loan contracts,
capital/custody, real collection rails, Provider SLA/KYP, named servicing and
risk owners, protected deployment, incident ownership, and independent security
review remain separate launch gates.
