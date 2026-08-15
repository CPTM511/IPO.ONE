# ADR-035: Hyperliquid Adapter, Signer, Custody, Action, and Nonce Boundary

Status: Accepted by IPO.ONE Founder under TC-000; architecture only; no runtime authority

Date: 2026-07-24

Decision owner: IPO.ONE Founder

Accepted at: 2026-07-25T00:32:32.792Z

## Context

Hyperliquid exposes a signer-free Info endpoint and a signed Exchange endpoint.
Its API wallets sign on behalf of a master account or subaccount, while account
queries must use the actual account address. Nonces are signer-scoped, bounded
by time, and vulnerable to unsafe reuse if an API wallet is deregistered and
its nonce state is pruned.

The Exchange endpoint also exposes transfers, withdrawal, API-wallet approval,
builder-fee approval, leverage, margin, vault, and other actions that are
outside the proposed Trading Capital execution authority.

Official references used for this proposal:

- [Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)

## Accepted Architecture Decision

### Separate read and write planes

The Hyperliquid Info Adapter is a signer-free, read-only process. It accepts a
closed internal query, uses the approved environment endpoint, queries the
actual master/subaccount address, validates a closed response, records source
and observation time, and emits normalized Evidence. It has no Exchange client,
API wallet, signing code, or access to signing material.

The protected writer is a separate process and deployment identity. It accepts
only a closed, server-created `OrderIntent` or protective risk command. It
cannot accept a raw Hyperliquid action, destination address, arbitrary JSON,
private key, or caller-selected account.

The strategy, browser, Human Trader, Agent Operator, general application
runtime, logs, fixtures, reports, analytics, and Evidence store never receive
API-wallet private material.

### Signer and custody separation

The following authorities remain structurally separate:

- **Capital/withdrawal authority:** controls funding and withdrawal outside the
  Trading Capital writer; no runtime path is proposed here.
- **Execution signer:** can sign only the future typed Testnet trading
  allowlist for exactly one Facility/environment/account binding.
- **Risk Guardian:** can stop new risk and, after a separate approval, sign only
  cancel and server-proven reduce-only/flatten protection.

No single Trading Capital process may possess all three authorities. Signing
material must be non-exportable or held behind an approved isolated signer
service. Exact HSM/MPC/custodian technology is not selected by this ADR.

### Closed action policy

For a future separately approved protected-Testnet gate, the maximum proposed
execution allowlist is:

- `order` from a server-created, risk-evaluated intent;
- `cancel` or `cancelByCloid` bound to the same Facility;
- `modify` bound to an existing Facility order; and
- `order` with server-proven `reduceOnly=true` for flattening.

This list is a design ceiling, not current permission. Every action must pass
Tenant, Facility, account, environment, asset, product, direction, size,
price/slippage, exposure, leverage, concentration, staleness, risk-state, and
idempotency checks before signing.

The writer explicitly denies:

- `withdraw3`, `usdSend`, `spotSend`, `sendAsset`, `usdClassTransfer`,
  `vaultTransfer`, `approveAgent`, and `approveBuilderFee`;
- leverage, isolated-margin, account-mode, staking, delegation, reserve-weight,
  vault, TWAP, deployer, validator, reward, abstraction, or agent-configuration
  actions;
- caller-supplied raw actions and every unknown or newly introduced action; and
- all mainnet and unapproved endpoint/account/environment combinations.

The deny policy is fail-closed and precedes signing. The system has no generic
Exchange passthrough.

### Durable nonce and outcome protocol

Each Facility trading process/environment receives a fresh, dedicated API
wallet. A signer address is never reused after deregistration, expiry, loss of
registration funding, compromise, or retirement.

Nonce allocation is a durable atomic state machine:

`AVAILABLE -> RESERVED -> SUBMITTED -> CONFIRMED | REJECTED | UNKNOWN`

- reservation and idempotency bind nonce, signer, Facility, action hash, and
  environment before network submission;
- allocation uses a durable atomic counter that can advance to trusted current
  Unix milliseconds while remaining unique for the signer;
- the allocator validates the official acceptable time window at submission;
- a nonce is never reissued, including after timeout, crash, or uncertain
  response;
- `UNKNOWN` blocks retries that could add risk and triggers read-side
  reconciliation by client order ID/order status/account state;
- restart recovery resumes from the durable record, not process memory; and
- clock drift, nonce collision, ambiguous HTTP response, signer pruning, and
  missing reconciliation Evidence fail closed.

Exact batching, rate-limit, expiry, clock, and retry values remain unapproved.

## Owner and Rationale

The IPO.ONE Founder owns the boundary because it controls signing, custody, and
external effects. The rationale is least authority: read-only access cannot
become a signer, execution cannot become withdrawal, and an uncertain external
effect cannot be repeated as though it failed.

## Alternatives Considered

- **Signer in browser or strategy process:** rejected due to export, injection,
  and arbitrary-action risk.
- **One master key for custody, execution, and protection:** rejected because a
  single compromise becomes total fund authority.
- **Generic signed-action endpoint plus denylist:** rejected because new action
  types could become implicitly allowed.
- **Use API-wallet address for account reads:** rejected because Hyperliquid
  documents that it can return empty account data.
- **Timestamp nonce in process memory:** rejected because parallelism and
  restart can cause collisions or replay ambiguity.
- **Retry on timeout:** rejected because an accepted external action may have
  produced an unknown response.
- **Reuse deregistered API-wallet address:** rejected because pruned nonce state
  can permit replay of previously signed actions.

## Rollback

Before acceptance, removal has no runtime effect. After any future integration,
rollback disables writer admission, stops new risk, revokes or retires the
dedicated API wallet through a separately authorized custody process, blocks
address reuse, reconciles all `SUBMITTED` and `UNKNOWN` records through the
read-only plane, preserves Evidence, and leaves withdrawal/capital authority
untouched. Rollback does not resend an uncertain action.

## Explicitly Unapproved Decisions

- any credential generation, import, storage, signing, dashboard, API call,
  endpoint connection, or Hyperliquid account binding;
- any API-wallet approval/revocation transaction;
- any Testnet or mainnet write;
- the signer vendor, HSM/MPC/custodian, custody operator, credential custodian,
  rotation schedule, or incident contact;
- accounts, subaccounts, vaults, endpoints, products, assets, order types,
  numeric limits, batching, expiry, retry, or rate-limit values;
- leverage/margin/account-mode actions, transfers, withdrawals, fee approvals,
  or any operation outside the closed future allowlist; and
- automatic activation of the proposed writer after ADR acceptance.

## Consequences

The boundary prevents a read-only milestone from smuggling in signing power and
provides deterministic recovery for nonce and unknown-result failures. It also
requires more isolated services, durable state, and operational review before
the first protected Testnet write.
