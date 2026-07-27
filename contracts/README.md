# IPO.ONE testnet contracts

`IpoOneCreditAuthorizationRegistryV1.sol` is the active Base Sepolia MVP
contract. It publishes a versioned, privacy-preserving projection of an
accepted off-chain credit authorization and its latest CreditState/Obligation
proof. It is non-custodial, non-upgradeable, rejects native value, performs no
external calls, and cannot expand the accepted Offer. PostgreSQL remains
canonical.

`IpoOneSandboxEvidenceEmitterV1.sol` remains the CHAIN-001B diagnostic contract. It emits
four opaque hashes and a bounded sequence on Base Sepolia or X Layer Testnet.
It cannot receive native value, hold or transfer a token, call another
contract, mutate an IPO.ONE Obligation, upgrade, transfer ownership, or run
after its one-day maximum lifetime. The deployer can only emit up to four
events, irreversibly pause, or permanently retire it.

The deployment runner compiles this source with the pinned `solc` dependency,
requires an externally provisioned ephemeral testnet key file, sends only
zero-value transactions, retires the instance, verifies the retired state, and
then destroys the key file. Mainnet chain IDs are rejected before signing.

`IpoOneMinimalErc1271TestWalletV1.sol` is a WALLET-003 review artifact with one
Founder-approved, expiring Base Sepolia acceptance instance at
`0x0a635DcC3D3F9a742B2236f270Fb010585858068`. It can only validate a
canonical low-s owner signature through `isValidSignature(bytes32,bytes)` for
at most seven days. It rejects native value and has no execution, transfer,
approval, custody, upgrade, or administration function. The recorded Testnet
deployment and proofs do not authorize another deployment, signer, key,
mainnet action, production funds, or release.
