// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal immutable input boundary used by the local M2 oracle adapter.
interface IIpoOnePriceFeedV1 {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
