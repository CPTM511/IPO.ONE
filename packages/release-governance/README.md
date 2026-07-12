# Release Governance

This package validates versioned IPO.ONE launch evidence against an explicit
release profile. It is deliberately fail-closed: missing, stale, duplicated,
placeholder, capability-escalating, or policy-locked evidence cannot pass.

Passing validation is necessary but never sufficient to deploy. The evidence
manifest references approvals held by external systems of record; it does not
grant cloud, DNS, tenant, fund, KYC/KYP, or production permissions itself.

Current policy permits evidence validation for the no-real-funds public
sandbox only. Closed private pilots and controlled Agent credit remain locked
until their named product, security, legal, risk, provider, funds, and
operations gates are implemented and approved.
