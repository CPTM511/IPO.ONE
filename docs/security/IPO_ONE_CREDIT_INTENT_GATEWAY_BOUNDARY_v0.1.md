# IPO.ONE Credit Intent Gateway Boundary v0.1

Status: Approved local no-real-funds boundary, 2026-07-15.

## Permitted

- An authenticated Human Borrower may submit one sandbox Credit Intent through
  an exact owned Human Subject and active scoped Consent.
- An authenticated Agent Runtime may submit the same Intent shape through an
  exact owned Agent Subject and scoped draft Mandate.
- Either owner may read only its exact Credit Intent application view.
- The server may return bounded hashes, terms, status, timestamps, request
  correlation, and explicit sandbox flags.

## Prohibited

- Public or unauthenticated access, Developer inheritance, broad Tenant reads,
  object enumeration, production identity, real funds, custody, withdrawal,
  Offer acceptance, Obligation creation, execution, Provider spend, settlement,
  or chain submission.
- Caller-supplied Tenant, Actor, Principal, authority type, decision, score,
  Offer, destination, production flag, raw PII/KYC, credential, signature, or
  private key.

## Enforcement

- Authority comes only from trusted Authentication Context plus durable
  membership and exact owner bindings.
- Closed request/result schemas, idempotency, payload hashing, persistent rate
  and capacity controls, and non-enumerating denial apply before commit.
- Subject, Principal, authority, adverse Obligation, frozen CreditLine, and
  duplicate Intent state are locked and revalidated in the same serializable
  transaction as Event, projection, audit, and replay records.
- Credit Intent identity and terms are immutable in PostgreSQL; RLS and Tenant
  context are forced on the projection table.
- The catalog advertises `fundsAuthority = false`, local in-process transport
  only, and keeps production, authenticated HTTP, MCP/A2A, and Mandate
  activation disabled.
