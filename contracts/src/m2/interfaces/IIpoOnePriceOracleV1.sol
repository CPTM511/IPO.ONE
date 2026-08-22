// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Closed read-only boundary for one M2 collateral-price source.
interface IIpoOnePriceOracleV1 {
    struct PriceObservation {
        uint256 priceUsdWad;
        uint64 observedAt;
        uint80 roundId;
        bytes32 sourceId;
        address asset;
        uint256 marketChainId;
        bool complete;
    }

    function latestPrice() external view returns (PriceObservation memory observation);
}
