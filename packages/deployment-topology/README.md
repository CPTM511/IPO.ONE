# Deployment topology contract

This package validates the provider-neutral `DEPLOY-001` closed-pilot topology.
It is release-governance code only. It creates no cloud resource, listener,
credential, signer, contract, or fund path.

The contract deliberately fixes the no-real-funds authority and minimum
architecture shape while leaving the managed PostgreSQL and OCI runtime vendors
behind later human approval.

`DEPLOY-001B` adds a dated provider recommendation. Its pending contract is
also fail-closed: it may describe the recommended vendor combination, but it
cannot approve billing, install an integration, provision a resource, write a
secret, mutate DNS, open remote access, activate the worker, or launch.

`LOCAL-STACK-001` validates the executable L0 counterpart: rootless Lima,
digest-pinned PostgreSQL 17, three loopback workspaces, and a separate unsigned
synthetic worker. It cannot broaden local execution into remote, cloud,
testnet-write, signer, Human-credit, or real-funds authority.
