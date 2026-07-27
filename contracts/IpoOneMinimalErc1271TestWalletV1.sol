// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPO.ONE Minimal ERC-1271 Test Wallet V1
/// @notice Testnet-only signature verifier for WALLET-003 acceptance. This
///         contract cannot receive, transfer, approve, custody, call, lend,
///         borrow, upgrade, or administer any asset or IPO.ONE authority.
contract IpoOneMinimalErc1271TestWalletV1 {
    bytes4 public constant ERC1271_MAGIC_VALUE = 0x1626ba7e;
    bytes4 public constant INVALID_SIGNATURE = 0xffffffff;
    uint64 public constant MAX_LIFETIME_SECONDS = 7 days;

    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable owner;
    uint64 public immutable expiresAt;

    error InvalidConfiguration();
    error NativeValueRejected();

    constructor(address owner_, uint64 expiresAt_) {
        if (
            owner_ == address(0) ||
            expiresAt_ <= block.timestamp ||
            expiresAt_ > block.timestamp + MAX_LIFETIME_SECONDS
        ) revert InvalidConfiguration();
        owner = owner_;
        expiresAt = expiresAt_;
    }

    /// @notice Implements the ERC-1271 bytes32 signature-validation surface.
    ///         Only a canonical 65-byte low-s ECDSA signature from `owner`
    ///         is accepted, and only before this test instance expires.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        if (block.timestamp > expiresAt || signature.length != 65) {
            return INVALID_SIGNATURE;
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (
            uint256(r) == 0 ||
            uint256(s) == 0 ||
            uint256(s) > SECP256K1_HALF_ORDER ||
            (v != 27 && v != 28)
        ) {
            return INVALID_SIGNATURE;
        }
        return ecrecover(hash, v, r, s) == owner
            ? ERC1271_MAGIC_VALUE
            : INVALID_SIGNATURE;
    }

    receive() external payable {
        revert NativeValueRejected();
    }

    fallback() external payable {
        revert NativeValueRejected();
    }
}
