# IPO.ONE SDK

Zero-runtime-dependency client for the current public Agent Lockbox MVP API.
The package is deliberately private and alpha until AuthN, tenant isolation,
durable HTTP command idempotency, compatibility policy, and production hosting
are approved and implemented.

The client never retries mutating requests automatically. Callers can supply a
stable request ID for correlation, an abort signal, and explicit headers. API
errors are exposed as structured `IpoOneApiError` instances.

Each client also generates one high-entropy sandbox session ID so independent
public-demo clients do not overwrite each other's process-local state. It may
be supplied explicitly for deterministic tests. This partition is not
authentication, tenant identity, or authorization.

```js
import { IpoOneClient } from "@ipo-one/sdk";

const client = new IpoOneClient({ baseUrl: "http://127.0.0.1:3000" });
const current = await client.getDemoState();
const state = await client.createAgent({ displayName: "Revenue Agent" });
```

This SDK does not move real funds and does not contain wallet keys, signing,
custody, KYC, or provider credentials.
