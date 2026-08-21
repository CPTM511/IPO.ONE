# ADR-M2-004: Contract toolchain and upgradeability

Status: Proposed; dependency approval required before implementation

## Current state

The repository compiles four small Solidity 0.8.30 contracts with
`solc@0.8.30` and tests them through Node (`package.json:131-141`,
`contracts/README.md:1-37`). There is no `foundry.toml`, OpenZeppelin dependency,
Solidity fuzz harness or invariant runner. Existing contracts are deliberately
non-custodial and are not a sufficient pool base.

## Decision

Retain the pinned Solidity compiler `0.8.30` and current Node/viem integration
tests. Add, only in separately approved `M2A-002`:

| Component | Exact proposed pin | Admission rule |
| --- | --- | --- |
| Foundry | `v1.7.1` stable toolchain | pin release and platform archive SHA-256/Sigstore evidence in a toolchain manifest |
| forge-std | `v1.16.1` tag | pin exact commit in dependency manifest; test-only |
| OpenZeppelin Contracts | `@openzeppelin/contracts@5.6.1` | exact pnpm lock integrity; import only reviewed modules |
| Solidity | `0.8.30` | exact pragma and bytecode metadata settings |

These were the official latest stable releases observed during the 2026-08-22
Phase 0 review; the admission issue must re-verify release status, tag/commit,
license, checksum and security advisories before changing files. No dependency
is installed by this ADR.

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
- The IPO.ONE repository currently has no root license. Dependency license does
  not decide the license of IPO.ONE source.
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

Permission/funds/deployment impact: **none**. This ADR changes no dependency,
contract or build file and grants no deployment, signer or funds authority.
