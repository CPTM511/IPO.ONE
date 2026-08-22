# ADR-M2-004: Contract toolchain and upgradeability

Status: Accepted; license and dependency admission completed 2026-08-22

## Current state

The repository compiles four small Solidity 0.8.30 contracts with the exact
`solc@0.8.30` package and retains their Node integration tests. M2A-002 now adds
the exact Foundry, forge-std and OpenZeppelin toolchain, a minimal Solidity
unit/fuzz admission harness, and CI verification. Existing contracts remain
deliberately non-custodial and are not a sufficient pool base.

## Decision

Retain the pinned Solidity compiler `0.8.30` and current Node/viem integration
tests. Add, only in separately approved `M2A-002`:

| Component | Exact proposed pin | Admission rule |
| --- | --- | --- |
| Foundry | `@foundry-rs/forge@1.7.1` stable toolchain | exact npm and platform-package integrity, denied lifecycle script, plus release SHA-256/Sigstore evidence |
| forge-std | `v1.16.1` / `620536fa5277db4e3fd46772d5cbc1ea0696fb43` | exact commit archive plus pnpm integrity; test-only |
| OpenZeppelin Contracts | `@openzeppelin/contracts@5.6.1` | exact pnpm lock integrity; import only reviewed modules |
| Solidity | `0.8.30` | exact npm and native compiler checksums, pragma and bytecode metadata settings |

These were re-verified as official non-prerelease releases on 2026-08-22. The
exact source commits, package integrities, Foundry archive checksums, Sigstore
bundle references, licenses, and allowed OpenZeppelin imports are recorded in
`contracts/toolchain-manifest.v1.json`.

Review sources: [OpenZeppelin Contracts releases](https://github.com/OpenZeppelin/openzeppelin-contracts/releases),
[OpenZeppelin release-channel guidance](https://github.com/OpenZeppelin/openzeppelin-contracts),
[Foundry releases](https://github.com/foundry-rs/foundry/releases),
[Foundry release verification](https://github.com/foundry-rs/foundry/security),
and [forge-std releases](https://github.com/foundry-rs/forge-std/releases).

OpenZeppelin use is intentionally narrow: `SafeERC20`, `Math.mulDiv`,
`ReentrancyGuard` and, if the accepted contract split needs it, `Pausable` or a
minimal reviewed access primitive. Do not copy library source, use a floating
branch or inherit unrelated token/governance/vault machinery.

The first pool is non-proxy and versioned. Immutable asset, oracle, market and
core accounting parameters are constructor-bound. A defect is handled by pause,
risk-reducing recovery, reconciliation and a new versioned deployment, not by
an opaque logic upgrade. No factory is added.

## Test structure

```text
contracts/src/m2/        pool contracts and narrow interfaces
contracts/test/m2/       unit, fuzz, invariant and adversarial harnesses
contracts/script/m2/     deterministic dry-run scripts only until L3 approval
foundry.toml              pinned compiler/EVM/optimizer/fuzz/invariant settings
```

Node tests remain responsible for ABI compatibility, adapter integration,
event normalization and end-to-end application behavior. Foundry owns contract
unit/fuzz/invariant testing. Both must compile the same source and compare
recorded ABI/bytecode hashes.

## Supply-chain and license impact

- OpenZeppelin Contracts is MIT-licensed; Foundry/forge-std are MIT or
  Apache-2.0 licensed. Their notices and transitive artifacts must be captured.
- IPO.ONE source is now covered by the Founder-approved root MIT License and
  DCO 1.1 contribution policy. Dependency licenses remain separately recorded.
- CI must verify exact tool versions, lock integrity, release provenance, no
  floating git references and reproducible ABI/bytecode.
- New dependencies require named human approval under the Engineering Standard
  (`docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.0.md:293-301`).

## Novelty, risk and mitigation

- Novel element: stateful Solidity fuzz/invariant infrastructure.
- Risk: tool/version drift and imported-code attack surface.
- Mitigation: exact pins, checksum/provenance, minimal imports, lock review and
  reproducible compiler output.
- Simpler safe alternative: continue Node + `solc` only. Rejected because it
  cannot provide the required stateful invariant assurance for a public pool,
  but retained for adapter integration.

## Alternatives rejected

- Proxy upgradeability: privileged mutable logic and storage-layout risk are
  unnecessary for one testnet market.
- Floating Foundry nightly or OpenZeppelin `master`: irreproducible and outside
  release assurance.
- Aave fork: imports a much larger protocol/governance surface and licensing
  review than the bounded market requires.
- Custom ERC-20 transfer/math/reentrancy libraries: avoidable security risk.

Permission/funds/deployment impact: **none**. Dependency admission adds build
and test tooling only and grants no contract implementation, deployment, signer,
oracle, risk-parameter, transaction, or funds authority.
