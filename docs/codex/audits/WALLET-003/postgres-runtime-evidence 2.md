# WALLET-003 temporary PostgreSQL evidence

Date: 2026-07-23  
Owner approval: IPO.ONE Founder  
Approved location: `/private/tmp` only  
Status: `BLOCKED_ENVIRONMENT`

Homebrew PostgreSQL 17.10 was already installed. Installing another server
would have added system state without solving the sandbox restriction.

The isolated target was:

```text
/private/tmp/ipo-one-wallet003-pg.zSAXgk/data
```

No Homebrew service, system cluster, existing database, or user data was
touched.

`initdb` first failed inside the sandbox because PostgreSQL bootstrap could not
create the required shared-memory segment. After the Founder explicitly
approved an isolated `/private/tmp` cluster, the required elevated command was
retried. It was rejected before execution because the approval infrastructure
reported an unsupported internal review model.

After the Founder renewed approval with `批准所有的内容，开始继续下一步`,
the same isolated `initdb` target was retried with elevation. The approval
infrastructure returned the same unsupported-model error before `initdb`
executed.

No indirect start, alternate service, container, remote database, or permission
bypass was attempted. Therefore:

- the WALLET-002 durable restart test remains written but unexecuted;
- WALLET-003 introduced no new migration;
- in-memory and mock-RPC tests may pass, but PostgreSQL restart evidence remains
  `UNVERIFIED`.
