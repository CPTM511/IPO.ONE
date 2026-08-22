// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IIpoOnePriceOracleV1} from "../../../src/m2/interfaces/IIpoOnePriceOracleV1.sol";

contract M2MockPriceOracle is IIpoOnePriceOracleV1 {
    PriceObservation private observation;

    constructor(uint256 marketChainId_, address asset_) {
        observation.marketChainId = marketChainId_;
        observation.asset = asset_;
        observation.sourceId = keccak256("deterministic_m2_fixture.v1");
    }

    function setObservation(uint256 priceUsdWad_, uint64 observedAt_, bool complete_) external {
        observation.priceUsdWad = priceUsdWad_;
        observation.observedAt = observedAt_;
        observation.roundId++;
        observation.complete = complete_;
    }

    function setClosedObservation(PriceObservation calldata observation_) external {
        observation = observation_;
    }

    function latestPrice() external view returns (PriceObservation memory) {
        return observation;
    }
}
