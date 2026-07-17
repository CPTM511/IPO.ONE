# IPO.ONE testnet contracts

`IpoOneSandboxEvidenceEmitterV1.sol` is the only CHAIN-001B contract. It emits
four opaque hashes and a bounded sequence on Base Sepolia or X Layer Testnet.
It cannot receive native value, hold or transfer a token, call another
contract, mutate an IPO.ONE Obligation, upgrade, transfer ownership, or run
after its one-day maximum lifetime. The deployer can only emit up to four
events, irreversibly pause, or permanently retire it.

The deployment runner compiles this source with the pinned `solc` dependency,
requires an externally provisioned ephemeral testnet key file, sends only
zero-value transactions, retires the instance, verifies the retired state, and
then destroys the key file. Mainnet chain IDs are rejected before signing.
