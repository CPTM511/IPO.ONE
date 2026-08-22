// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IIpoOnePriceOracleV1} from "../../../src/m2/interfaces/IIpoOnePriceOracleV1.sol";

contract M2MockPriceOracle is IIpoOnePriceOracleV1 {
    uint256 public priceUsdWad;
    uint64 public observedAt;
    bool public valid;

    function setObservation(uint256 priceUsdWad_, uint64 observedAt_, bool valid_) external {
        priceUsdWad = priceUsdWad_;
        observedAt = observedAt_;
        valid = valid_;
    }

    function latestPrice() external view returns (uint256, uint64, bool) {
        return (priceUsdWad, observedAt, valid);
    }
}
