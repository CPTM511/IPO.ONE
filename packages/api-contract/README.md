# API Contract Package

Defines the transport-level request correlation and RFC 9457-compatible
Problem Details surface for IPO.ONE HTTP APIs. It contains no authentication,
authorization, tenant, billing, or fund-movement behavior.

Unknown server failures are deliberately redacted. Domain errors retain stable
machine codes and client-actionable descriptions without exposing stacks,
database errors, filesystem paths, or secrets.
