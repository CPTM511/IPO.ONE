# IDENTITY-002 — Agent account bootstrap without Mandate circularity

## Context

The Principal can create an Agent Subject and an EIP-712 CAIP-10 challenge, but
the UI tells the Agent to submit proof through MCP before a Mandate exists while
the MCP Host requires a draft or active Mandate handoff. This makes the intended
order unusable even though lower-level operations exist.

## Scope

- Provision one stable local test-chain Agent account from the private pilot
  secret without printing or exposing its private key.
- Add a closed local Agent proof command that accepts the downloaded challenge,
  reconstructs and verifies the IPO.ONE EIP-712 typed data, signs it, and submits
  it through the Agent Tenant client.
- Add a Human-friendly challenge download action and exact operator guidance.
- Keep the normal draft/active Mandate MCP handoff unchanged after identity
  activation.
- Verify the complete Principal → Agent identity → Mandate → MCP lifecycle.

## Non-goals

- Mainnet keys, wallets, custody, remote signing, or production identity.
- Passing private keys, signatures, Authentication Context, or credentials in
  browser data, CLI arguments, stdout, or handoff manifests.
- Expanding Agent economic authority before Principal Mandate activation.

## Likely files

- `apps/private-pilot/src/private-pilot-agent-account.js`
- `apps/private-pilot/src/agent-account-proof.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `package.json`
- `README.md`

## Acceptance criteria

1. `pilot:start` prints only the stable public test-chain Agent account.
2. The Principal downloads a credential-free one-use challenge.
3. `pilot:agent:prove` reconstructs the approved typed data and refuses account,
   chain, hash, expiry, or shape drift before signing.
4. The CLI submits proof as the bound Agent Actor and prints no signature or
   private key.
5. The Principal can refresh an active binding, create and activate a bounded
   Mandate, then run Agent MCP without circular prerequisites.

## Test command

```bash
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check
```

## Security checklist

- [x] Local/test-chain only.
- [x] Private key remains derived inside the Host and never leaves memory.
- [x] Challenge is closed, one-use, unexpired, and hash-verified before signing.
- [x] Agent Subject binding is revalidated by the durable Gateway.
- [x] No real funds, withdrawals, remote MCP, or production authority.
