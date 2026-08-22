# Third-party notices

IPO.ONE source is licensed under the root MIT License. Dependencies retain their
own licenses. No dependency license changes the license or operational authority
of IPO.ONE source.

## M2 contract toolchain

| Component | Exact source | License | Use |
| --- | --- | --- | --- |
| Foundry Forge | `@foundry-rs/forge@1.7.1` from `foundry-rs/foundry` `v1.7.1` | MIT OR Apache-2.0 | build/test tool only; lifecycle script denied |
| forge-std | `foundry-rs/forge-std` commit `620536fa5277db4e3fd46772d5cbc1ea0696fb43` (`v1.16.1`) | MIT OR Apache-2.0 | test-only Solidity library |
| OpenZeppelin Contracts | `@openzeppelin/contracts@5.6.1`, tag commit `5fd1781b1454fd1ef8e722282f86f9293cacf256` | MIT | narrow reviewed Solidity imports |
| solc-js | `solc@0.8.30` | MIT | exact Solidity compiler package |

The complete pins, package integrities, release artifact checksums, and
provenance links are in `contracts/toolchain-manifest.v1.json`. Dependency
license texts are available in their installed packages and upstream source
repositories. IPO.ONE does not copy Aave or another lending protocol source.
