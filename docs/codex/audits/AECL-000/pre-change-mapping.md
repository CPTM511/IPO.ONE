# AECL-000 Pre-change Mapping and Exact Gap Matrix

Captured on: 2026-08-07

Repository baseline:

- branch: `codex/m1-b-deployable-sandbox`;
- commit: `dfba8d7ec6390ec79df6df21886bcf3525702e69`;
- delivery mode: `L0_LOCAL_NO_FUNDS`;
- controlling Founder proposal SHA-256:
  `f044b094f83b7f3b7a4ab3264a6863fc9e565cfa39b1fb39d070d67269f34a18`;
- no runtime authority enters AECL-000.

Status vocabulary:

- `ALREADY_IMPLEMENTED`: the current repository has an executable local or
  explicitly named live-read boundary that substantially satisfies this exact
  requirement at its claimed maturity;
- `PARTIALLY_IMPLEMENTED`: a reusable implementation exists, but the complete
  AECL requirement, parity, persistence, or safety gate does not;
- `ABSENT`: no repository-owned implementation of the requirement was found;
- `CONFLICTS`: current executable behavior or contract contradicts a mandatory
  AECL rule and must be removed, narrowed, or placed behind the new boundary.

The labels report current code fact, not product approval or production
readiness.

## Exact capability matrix

| Area | Status | Current code evidence | Exact remaining gap or conflict | First owning issue |
| --- | --- | --- | --- | --- |
| Shared Human/Agent economic Kernel | `ALREADY_IMPLEMENTED` | Product Constitution `REQ-CORE-001`; ADR-009; shared Mandate, Offer, Obligation, Ledger, Event and Evidence modules | AECL must consume this authority and must not fork it | AECL-000 invariant |
| Subject / Principal separation | `ALREADY_IMPLEMENTED` | shared domain and durable Tenant Gateway projections; ADR-022 | No new identity object is permitted in AECL | AECL-000 invariant |
| CAIP-2 chain identity | `ALREADY_IMPLEMENTED` | `modules/chain-adapter/src/chain-profiles.js` admits only `eip155:84532` and `eip155:1952` | Connector capability results and prepared executions must reuse the same registry | EVM-WALLET-001 |
| CAIP-10 account normalization | `ALREADY_IMPLEMENTED` | `normalizeEvmCaip10` in `modules/chain-adapter/src/evm-account-proof-adapter.js` | AECL connector and grant contracts must reuse it without wallet-brand fields | EVM-WALLET-001 |
| EIP-6963 discovery | `ALREADY_IMPLEMENTED` | `createWalletProviderRegistry` discovers multiple providers, rejects malformed announcements, requires explicit selection, and includes a deterministic conformance suite | Move behind the connector SPI without changing non-authorizing selection semantics | EVM-WALLET-001 |
| WalletConnect remote/mobile path | `ALREADY_IMPLEMENTED` | `createMobileWalletConnector`, memory-only storage, exact package/version/origin and fixed two-Testnet profile; provider registry conformance | Expose through the same normalized connector descriptor/capability contract as injected providers | EVM-WALLET-001 |
| Generic EIP-1193 request boundary | `PARTIALLY_IMPLEMENTED` | WalletConnect has a closed request facade; injected providers are selected generically but `apps/web/src/app.js` still calls their raw `request` method | One connector SPI must normalize requests, results, events, errors, and prepared submission for both injected and remote paths | EVM-WALLET-001 |
| Wallet connector SPI lifecycle | `PARTIALLY_IMPLEMENTED` | provider registry plus WalletConnect `connect`, `disconnect`, `request`, and event listeners | No common `descriptor/getAccounts/getChain/getCapabilities/signTypedData/submitPreparedExecution` contract exists | EVM-WALLET-001 |
| EIP-712 EOA proof | `ALREADY_IMPLEMENTED` | `EvmAccountProofAdapter`; one-use typed Agent AccountBinding challenge; durable Tenant handlers | Receipt must name the signature type consistently across all transports | SIG-003 |
| ERC-1271 verification core | `ALREADY_IMPLEMENTED` | `EvmWalletSignatureVerifier` performs bounded code detection, EOA or contract verification, safe-block revalidation, provider failover, and hash-only receipt | Upper API/MCP parity remains incomplete and no AECL execution-signature receipt uses it yet | SIG-003 |
| ERC-1271 through Tenant Protocol | `PARTIALLY_IMPLEMENTED` | Tenant schema and handler accept 65–4096 byte hex signatures; private-pilot composition injects the ERC-1271 verifier | Type declarations do not identify signature type and Agent MCP still rejects non-65-byte signatures | SIG-003 |
| ERC-1271 through Agent MCP | `CONFLICTS` | `apps/agent-mcp/src/agent-mcp-adapter.js` uses `^0x[0-9a-fA-F]{130}$` for `ipo_one_submit_account_proof` | Remove the EOA-length assumption while retaining closed byte/size bounds and fail-closed unsupported-type errors | SIG-003 |
| ERC-6492 counterfactual verification | `ABSENT` | No source, schema, receipt enum, or test outside the supplied proposal references ERC-6492/counterfactual verification | Add bounded verification and negative conformance without retaining raw signatures | SIG-003 |
| Signature-type receipt | `PARTIALLY_IMPLEMENTED` | `wallet_signature_verification.v1` distinguishes EOA and ERC-1271 EIP-191/EIP-712 | Add counterfactual type, exact upper-surface parity, and one stable execution-facing signature classification | SIG-003 |
| Capability negotiation | `ABSENT` | No repository-owned `wallet_getCapabilities`, EIP-5792, normalized wallet capability schema, or provider capability probe | Add closed result with unknown-as-non-permissive semantics | EVM-WALLET-001 |
| Single / batch / atomic call discovery | `ABSENT` | No repository-owned EIP-5792 call capability contract | Capability may be reported only when positively proven; no call fallback is implied | EVM-WALLET-001 |
| Delegation and account-abstraction discovery | `ABSENT` | No repository-owned ERC-7715, ERC-7710, EIP-7702, ERC-4337, or vendor-native normalized result | Add vocabulary as discovery only; no permission activation | EVM-WALLET-001 |
| Account/chain/provider change invalidation | `PARTIALLY_IMPLEMENTED` | `createWalletAuthorityLifecycle` invalidates Human sessions and quarantines on provider/account/chain/disconnect changes | No prepared execution exists to invalidate, and no durable grant/session epoch is checked | EVM-WALLET-001 then EXEC-001 |
| Enabled-chain policy separate from EVM compatibility | `ALREADY_IMPLEMENTED` | chain profiles reject all but the two ratified Testnets and mark both synthetic-only/not production approved | AECL must depend on this registry instead of deriving enablement from wallet support | AECL-000 invariant |
| Delegated Agentic Wallet SPI | `ABSENT` | No vendor-neutral provider descriptor, grant lifecycle, preflight, submit, read, or human-step-up port exists | Build SPI and conformance harness before any vendor adapter | AGENTWALLET-001 |
| Unsafe permission fallback prohibition | `PARTIALLY_IMPLEMENTED` | current wallet selection and closed transports fail unknown methods; no delegated permission flow exists | Formal capability mismatch and explicit alternative-path result are absent | EVM-WALLET-001 / AGENTWALLET-001 |
| `DelegatedWalletGrant` | `ABSENT` | No domain object, schema, projection, migration, command, or Evidence binding exists | Add a Tenant-scoped projection that cannot exist or remain active without current canonical authority | EXEC-001 |
| `ExecutionTargetPolicy` | `ABSENT` | Provider allowlisting and chain profiles constrain provider/chain but no exact EVM target, code, proxy, selector, spender, allowance, or venue-action policy exists | Add versioned closed execution target policy; it is not credit authority | EXEC-001 |
| `TransactionPreflightReceipt` | `ABSENT` | No exact payload/effects/snapshot/risk-check receipt or expiry contract exists | Add immutable hash-bound receipt and query path | EXEC-002 |
| `WalletExecutionReceipt` | `ABSENT` | settlement, chain finality, Provider, and Hyperliquid simulation receipts exist separately | Add one normalized execution receipt referencing existing Ledger, Obligation, finality and Evidence truth | EXEC-002 / EXEC-003 |
| Four-state execution decision | `ABSENT` | authorization has allow/deny and Hyperliquid simulation has conservative terminal states, but no AECL `ALLOW/STEP_UP/DENY/QUARANTINE` contract exists | Create a separate execution decision; do not overload AuthZ allow | EXEC-002 |
| Pending-exposure reservation | `PARTIALLY_IMPLEMENTED` | SpendPolicy/Mandate reservation and chain caps exist; Hyperliquid simulation has durable nonce and unknown-state controls | No atomic grant/target/limit reservation covers prepared wallet or venue execution | EXEC-001 |
| Mandatory exact transaction simulation | `ABSENT` | Evidence-anchor preparation constructs exact calldata, but no simulator, simulated-effects extraction, or signing gate exists | No wallet/venue submit may pass without a fresh compatible preflight at real-value maturity | EXEC-002 |
| Expected/simulated/actual effects comparison | `ABSENT` | Existing finality and settlement reconciliation compare domain-specific facts only | Add native, token, allowance and venue exposure effect hashes plus quarantine on divergence | EXEC-002 |
| Contract code/proxy/function policy | `ABSENT` | ERC-1271 reads code only to select signature verification; no execution target code-hash or proxy-implementation gate exists | Add exact target snapshot and drift quarantine | EXEC-002 |
| Raw transaction prohibition at connector surface | `CONFLICTS` | `createMobileWalletConnector` exposes `eth_sendTransaction` for any caller-supplied target and non-empty zero-value calldata on the two Testnets | Replace with `submitPreparedExecution`; connector must not accept LLM/browser-authored arbitrary calldata | EVM-WALLET-001 / EXEC-002 |
| Existing Evidence-anchor browser submission | `PARTIALLY_IMPLEMENTED` | server prepares one transaction and browser checks chain/from/to/value/data/hash list before `eth_sendTransaction` | It has no durable AECL preflight receipt, code/proxy snapshot, simulation, effects comparison, or generic submit boundary; it cannot be claimed AECL-conformant | EXEC-002 migration decision |
| Zero-native-value approval safety | `CONFLICTS` | current mobile connector describes a zero-value calldata scope as the entire transaction boundary and does not classify selector/allowance effects | Value zero must not imply non-financial; approval/delegatecall/upgrade/unknown selectors require deny or explicit step-up policy | EVM-WALLET-001 / EXEC-002 |
| Root/workload/session signer separation | `PARTIALLY_IMPLEMENTED` | ADR-018 separates authentication; current Agent workload proof has no asset signing authority; Hyperliquid simulated signer is isolated | There is no formal delegated wallet/venue session grant, session epoch, or external permission receipt | EXEC-001 |
| Wallet operation family in Tenant Protocol | `ABSENT` | the catalog has credit, Evidence, Provider, and Trading Capital operations, but none of the nine required `wallet*` operations | Add through the existing authenticated Gateway only | EXEC-003 |
| Venue operation family in Tenant Protocol | `ABSENT` | current Trading Capital operations do not expose the proposed delegate/binding/prepare/submit/read family | Map without duplicating existing Trading Facility business logic | EXEC-003 / HYPERLIQUID-002 |
| OpenAPI / SDK / MCP business parity foundation | `ALREADY_IMPLEMENTED` | ADR-025/031; closed Tenant Protocol; typed SDK; local MCP adapters; conformance checks | New AECL operations must extend this one protocol and cannot be UI- or MCP-only | EXEC-003 |
| Closed versioned adapter result schemas | `PARTIALLY_IMPLEMENTED` | chain, signature, Provider, Tenant Protocol, Evidence, Hyperliquid Info and simulation results are closed and versioned | No common AECL SPI descriptors, capability result, grant receipt, preflight, or execution result exists | EVM-WALLET-001 onward |
| Global and scoped kill switches | `PARTIALLY_IMPLEMENTED` | Subject freeze, Provider/risk controls, wallet session quarantine, and Hyperliquid simulation kill-switch behavior exist | No `globalExecutionPause`, wallet-adapter pause, chain pause, or grant revoke boundary exists | EXEC-001 with permission review |
| Idempotency and unknown-submission safety | `PARTIALLY_IMPLEMENTED` | Tenant Gateway replay is durable; Hyperliquid simulation consumes nonce and never blindly retries `UNKNOWN` | Wallet executions do not yet have submission identity, durable unknown state, or read-before-retry reconciliation | EXEC-002 |
| Canonical Evidence reuse | `ALREADY_IMPLEMENTED` | `evidence_event.v2`, append-only Event/Evidence/outbox/reconciliation and Evidence Anchor Registry exist | AECL receipts must reference this model rather than create a second Evidence store | AECL-000 invariant |
| Complete execution Evidence binding | `PARTIALLY_IMPLEMENTED` | current Evidence can bind aggregate, actor, correlation, payload hash, finality and Obligation; domain-specific chain and venue receipts exist | No single record binds authorization, grant, target policy, preflight, exact payload, human approval, external permission and actual effects | EXEC-002 |
| Signer-free Hyperliquid Info Adapter | `ALREADY_IMPLEMENTED` | `modules/hyperliquid-info` uses the fixed Testnet Info endpoint, master/subaccount identity, closed reads, freshness, hash-only Evidence, and no signer | Reuse as Venue Adapter read plane | HYPERLIQUID-002 |
| HyperCore protected writer model | `PARTIALLY_IMPLEMENTED` | `modules/hyperliquid-execution` is offline, simulation-only, typed, nonce-safe, kill-switch bounded, no network, no key, and no live signer | Normalize behind Venue SPI; live delegate provisioning, official signing, network submit and approved Testnet authority remain absent and gated | HYPERLIQUID-002 |
| Hyperliquid master/API-wallet identity separation | `ALREADY_IMPLEMENTED` | ADR-035, Hyperliquid Info, and simulation boundaries preserve account query address separately from signer reference | Future delegate lifecycle must retain it and reject address reuse | HYPERLIQUID-002 invariant |
| Hyperliquid delegate provision/revoke/rotate | `ABSENT` | No `approveAgent` call, API-wallet provisioning, revocation, deregistration, expiry, or fresh-address rotation runtime exists | Requires separate Testnet signer/custody/action approval before implementation or activation | HYPERLIQUID-002 gated slice |
| HyperCore live order/cancel/modify | `ABSENT` | only offline simulation exists; its README explicitly rejects live transport and key material | Testnet-first work remains blocked on named review and security evidence | HYPERLIQUID-002 gated slice |
| HyperCore withdrawal/transfer denial | `ALREADY_IMPLEMENTED` | ADR-035 and simulation policy deny withdrawals, transfers, account administration, unknown actions, and mainnet | Must remain a hard default in Venue target policy | AECL-000 invariant |
| HyperEVM chain profile | `ABSENT` | enabled chain registry contains only Base Sepolia and X Layer Testnet; no HyperEVM profile exists | Architecture may be generic, but enabling HyperEVM requires a separate chain/profile review | HYPERLIQUID-EVM-001 |
| Wallet/adapter conformance matrix | `PARTIALLY_IMPLEMENTED` | EIP-6963, WalletConnect, chain, EIP-712 and ERC-1271 have focused suites | No shared injected/remote connector SPI suite, capability downgrade suite, ERC-6492 suite, or prepared-execution invalidation suite exists | EVM-WALLET-001 / SIG-003 |
| Target-safety acceptance matrix | `ABSENT` | no unknown selector, code drift, proxy drift, unlimited approval, allowance delta, or stale simulation suite exists | Add all mandatory negative cases before submission is implemented | EXEC-002 |
| Grant revocation acceptance matrix | `PARTIALLY_IMPLEMENTED` | Mandate revocation, Subject freeze and wallet session invalidation tests exist | Grant expiry/revoke/sessionEpoch/external-permission revoke/adapter pause cases await formal grant | EXEC-001 / EXEC-002 |
| Vendor-neutral canonical objects | `ALREADY_IMPLEMENTED` | current Mandate, SpendPolicy, CreditLine, Offer, Obligation and Ledger semantics contain no wallet-vendor ontology | Provider names may exist only in descriptors/configuration/adapters | AECL-000 invariant |
| Vendor adapters | `ABSENT` | no MetaMask Agent Wallet, OKX Agentic Wallet, Base advanced-permission, Circle Agent Wallet, or similar AECL adapter exists | Must follow the provider SPI and its conformance harness, one reviewed adapter per issue | Phase 3+ |

## Baseline corrections to the supplied proposal

The supplied proposal describes the baseline as if Hyperliquid were only
read-only and wallet signature length assumptions were universal. The current
repository has moved further in two important ways:

1. ERC-1271 verification is implemented and composed into private-pilot Human
   and Agent boundaries, while only the Agent MCP tool schema still assumes a
   65-byte EOA signature. Therefore universal signature work is partial, not
   absent.
2. Hyperliquid has a substantial offline, simulation-only execution, funding,
   risk, reconciliation, settlement, and operability model. It still has no
   live Exchange transport, API wallet, approved signer, or Testnet write
   authority. Therefore the Venue execution model is partial, not live.

These corrections do not broaden authority. The architecture must preserve the
newer safe simulation work and accurately label it.

## Highest-priority conflict closures

1. Remove generic raw `eth_sendTransaction` from the WalletConnect facade and
   replace it with exact prepared-execution submission.
2. Remove the Agent MCP 65-byte-only signature assumption while retaining
   closed size/type checks.
3. Stop representing `value = 0` as sufficient transaction safety; selectors,
   target/code/proxy identity, allowance and asset effects must be evaluated.
4. Prevent the existing Evidence-anchor wallet path from being treated as
   AECL-conformant until it has the mandatory preflight/receipt boundary.

No conflict is changed in AECL-000; each is frozen into a named follow-up.
