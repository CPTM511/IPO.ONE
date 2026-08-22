// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Closed read-only boundary for the M2 secured-pool price source.
/// @dev A live source and its validation semantics are deliberately deferred to M2A-004.
interface IIpoOnePriceOracleV1 {
    function latestPrice() external view returns (uint256 priceUsdWad, uint64 observedAt, bool valid);
}
