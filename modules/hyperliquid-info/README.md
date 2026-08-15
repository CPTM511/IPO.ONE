# Hyperliquid Testnet Info Adapter

`HyperliquidTestnetInfoAdapter` is the TC-201 signer-free read plane and the
TC-202 read-only Evidence source.

Its network authority is fixed in source:

- `POST https://api.hyperliquid-testnet.xyz/info`
- `userRole` as the mandatory first request; `agent`, `vault`, `missing`, and
  role mismatches fail closed before any account-data query
- `clearinghouseState`
- `frontendOpenOrders`
- `userFillsByTime`
- `subAccounts` for a master account only

The adapter accepts typed server-side snapshot, master/subaccount relationship,
and bounded fill-history requests. It does not accept a URL, path, HTTP method,
raw Hyperliquid query type, arbitrary body, headers, credentials, API-wallet
address role, proxy, Exchange action, or signing material.

Responses are byte-bounded, shape-checked, normalized, hashed, freshness
classified, cached briefly, and protected by timeout, retry, request-budget,
and circuit-breaker limits. The normalized snapshot contains address hashes,
not raw addresses, and has no authorization or funds authority.

TC-202 adds a separate EIP-712 master-ownership verifier and integrates the
adapter through the authorized Tenant Gateway. The binding challenge is
one-use, fixed to Hyperliquid Testnet (`eip155:998`), and binds hashed master
and subaccount addresses. The relationship is independently read from both
`userRole` and `subAccounts` before any history import.

Only response hashes, event-manifest hashes, aggregate metrics, data-quality
gaps, and current-account reconciliation are durable. Raw signatures, raw
addresses, and raw fill events are discarded. Rebinding immediately
invalidates prior active Evidence authority. The result remains partial,
point-in-time, read-only Evidence: it cannot approve capital, set a limit or
price, create an API wallet, submit an Exchange action, move funds, or confer
production authority.
