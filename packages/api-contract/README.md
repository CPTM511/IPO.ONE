# API Contract Package

Defines the transport-level request correlation and RFC 9457-compatible
Problem Details surface for IPO.ONE HTTP APIs. It contains no authentication,
authorization, tenant, billing, or fund-movement behavior.

Unknown server failures are deliberately redacted. Domain errors retain stable
machine codes and client-actionable descriptions without exposing stacks,
database errors, filesystem paths, or secrets. Approved admission errors may
add only the closed `manual`, `short`, or `long` retry class; configured limits,
Tenant utilization, object existence, and infrastructure topology are never
serialized.
