// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IIpoOnePriceFeedV1} from "./interfaces/IIpoOnePriceFeedV1.sol";
import {IIpoOnePriceOracleV1} from "./interfaces/IIpoOnePriceOracleV1.sol";

/// @notice Immutable read-only adapter for one reviewed M2 feed binding.
/// @dev No live feed is selected or authorized by this local/no-funds implementation.
contract IpoOnePriceOracleAdapterV1 is IIpoOnePriceOracleV1 {
    uint256 public constant WAD = 1e18;
    uint256 public constant MAX_ORACLE_AGE_SECONDS = 3_600;
    uint256 public constant MAX_ORACLE_FUTURE_SKEW_SECONDS = 60;

    uint256 public immutable marketChainId;
    address public immutable asset;
    IIpoOnePriceFeedV1 public immutable feed;
    bytes32 public immutable sourceId;
    uint8 public immutable feedDecimals;
    uint256 public immutable normalizationFactor;

    error InvalidConfiguration();

    constructor(uint256 expectedChainId, address asset_, address feed_, bytes32 sourceId_, uint8 expectedFeedDecimals) {
        if (
            expectedChainId != block.chainid || asset_ == address(0) || feed_ == address(0) || feed_.code.length == 0
                || sourceId_ == bytes32(0) || expectedFeedDecimals > 18
        ) revert InvalidConfiguration();
        (bool success, bytes memory result) = feed_.staticcall(abi.encodeCall(IIpoOnePriceFeedV1.decimals, ()));
        if (!success || result.length < 32 || abi.decode(result, (uint256)) != expectedFeedDecimals) {
            revert InvalidConfiguration();
        }

        marketChainId = expectedChainId;
        asset = asset_;
        feed = IIpoOnePriceFeedV1(feed_);
        sourceId = sourceId_;
        feedDecimals = expectedFeedDecimals;
        normalizationFactor = 10 ** (18 - expectedFeedDecimals);
    }

    function latestPrice() external view returns (PriceObservation memory observation) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
        bool numericValid = answer > 0 && uint256(answer) <= type(uint256).max / normalizationFactor;
        bool timeValid = updatedAt <= type(uint64).max && updatedAt <= block.timestamp + MAX_ORACLE_FUTURE_SKEW_SECONDS
            && !(block.timestamp > updatedAt && block.timestamp - updatedAt > MAX_ORACLE_AGE_SECONDS);
        bool complete = numericValid && roundId > 0 && answeredInRound >= roundId && updatedAt > 0 && timeValid;
        observation = PriceObservation({
            priceUsdWad: numericValid ? uint256(answer) * normalizationFactor : 0,
            observedAt: updatedAt <= type(uint64).max ? uint64(updatedAt) : 0,
            roundId: roundId,
            sourceId: sourceId,
            asset: asset,
            marketChainId: marketChainId,
            complete: complete
        });
    }
}
