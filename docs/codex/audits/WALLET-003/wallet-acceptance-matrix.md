# WALLET-003 wallet acceptance matrix

Date: 2026-07-24  
Overall status: `VERIFIED_APPROVED_TESTNET_SCOPE`

`PASS` means current local automated evidence exists. It does not mean
production approval. `BLOCKED` rows name the missing external or human gate.

| ID | Requirement | Status | Current evidence or blocker |
| --- | --- | --- | --- |
| W-01 | Account request is user initiated and rejection safe | PASS | WALLET-001 browser flow/tests |
| W-02 | Exact approved chain switch/add | PASS | Fixed 84532/1952 browser configuration |
| W-03 | EIP-6963 zero/one/multiple discovery | PASS | `wallet-provider-registry.test.js` |
| W-04 | Provider never silently changes | PASS | Explicit selection and removal tests |
| W-05 | Metadata bounded/safely rendered | PASS | Closed metadata/data-image tests |
| W-06 | Server one-use bounded SIWE challenge | PASS | Human wallet BFF/store tests |
| W-07 | Server-side SIWE verification | PASS | Explicit EOA/ERC-1271 result contract |
| W-08 | Unprovisioned wallet cannot create session | PASS | Human wallet BFF rejection test |
| W-09 | `accountsChanged` invalidates authority | PASS | WALLET-002 plus mobile lifecycle test |
| W-10 | `chainChanged` invalidates authority | PASS | WALLET-002 lifecycle tests |
| W-11 | replacement/disconnect invalidates authority | PASS | WALLET-002 registry/lifecycle tests |
| W-12 | invalidation network failure fails closed | PASS | quarantine/retry tests |
| W-13 | cross-tab invalidation enforced | PASS | BroadcastChannel lifecycle tests |
| W-14 | fresh authentication required | PASS | context epoch/session quarantine tests |
| W-15 | EOA rejects malformed/high-s/replay | PASS | EIP-712 low-s and one-use challenge tests |
| W-16 | ERC-1271 chain/finality/timeout/size bounded | PASS_REAL_TESTNET | Dedicated fixed RPC adapter and fail-closed tests; the deployed Base Sepolia contract passed revalidated `safe`-block EIP-191 and EIP-712 ERC-1271 calls |
| W-17 | approved mobile/QR uses same lifecycle | PASS_DISABLED_BOUNDARY | Exact `2.23.10` package, integrity, graph, real storage hook, deterministic same-origin bundle, license copy, exact approved Origin/Relay, shared invalidation lifecycle, and closed CSP are reviewed. The owner-managed Project and any real mobile/QR E2E remain outside repository evidence, so runtime enablement and release stay `SPECIFIED_DISABLED` |
| W-18 | no key/seed/raw signature/session secret persisted | PASS | Redacted results, bounded memory store, post-proof logout, and stopped loopback server retain no private key, raw signature, or reusable session |
| W-19 | real Testnet EOA E2E | PASS_REAL_TESTNET | The approved Base Sepolia EOA completed a real one-use EIP-191 challenge, authenticated protected read, and idempotent logout without persisting raw signature or session material |
| W-20 | real Testnet ERC-1271 E2E | PASS_REAL_TESTNET | Founder-operated zero-value deployment is verified `safe`; exact instance bytecode matched. Real contract-wallet EIP-191 and Agent EIP-712 both returned the eligible ERC-1271 verification methods. Focused tests pass 47/47 and the full gate passes 378/378 |
| W-21 | logout/revoke idempotent/audited/non-enumerating | PASS | WALLET-002 server invalidation evidence |

Local PostgreSQL persistence/restart, loopback transport, all 21 acceptance
rows, and the approved real Testnet wallet scope pass. This does not enable the
mobile/QR connector and is not a production, mainnet, funds, or release-ready
claim.
