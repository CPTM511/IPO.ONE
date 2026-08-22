// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Pure M2A-004 fixture-policy math. Values are local/no-funds parameters, not commercial terms.
library SecuredPoolMathV1 {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;
    uint256 internal constant KINK_BPS = 8_000;
    uint256 internal constant BASE_BORROW_APR_BPS = 200;
    uint256 internal constant SLOPE_1_BPS = 800;
    uint256 internal constant SLOPE_2_BPS = 6_000;
    uint256 internal constant RESERVE_FACTOR_BPS = 1_000;

    function utilizationBps(uint256 cashAssets, uint256 performingDebtAssets) internal pure returns (uint256) {
        uint256 grossAssets = cashAssets + performingDebtAssets;
        return grossAssets == 0 ? 0 : Math.mulDiv(performingDebtAssets, BPS, grossAssets);
    }

    function borrowAprBps(uint256 cashAssets, uint256 performingDebtAssets) internal pure returns (uint256) {
        uint256 utilization = utilizationBps(cashAssets, performingDebtAssets);
        if (utilization <= KINK_BPS) {
            return BASE_BORROW_APR_BPS + Math.mulDiv(SLOPE_1_BPS, utilization, KINK_BPS);
        }
        return BASE_BORROW_APR_BPS + SLOPE_1_BPS + Math.mulDiv(SLOPE_2_BPS, utilization - KINK_BPS, BPS - KINK_BPS);
    }

    function supplyAprBps(uint256 cashAssets, uint256 performingDebtAssets) internal pure returns (uint256) {
        uint256 grossSupplyApr = Math.mulDiv(
            borrowAprBps(cashAssets, performingDebtAssets), utilizationBps(cashAssets, performingDebtAssets), BPS
        );
        return Math.mulDiv(grossSupplyApr, BPS - RESERVE_FACTOR_BPS, BPS);
    }

    function interestAtRate(uint256 debtAssets, uint256 aprBps, uint256 elapsedSeconds)
        internal
        pure
        returns (uint256 interestAssets, uint256 reserveAssets)
    {
        interestAssets = Math.mulDiv(debtAssets, aprBps * elapsedSeconds, SECONDS_PER_YEAR * BPS, Math.Rounding.Ceil);
        reserveAssets = Math.mulDiv(interestAssets, RESERVE_FACTOR_BPS, BPS);
    }

    function collateralValueAssets(uint256 collateralAssets, uint256 priceUsdWad) internal pure returns (uint256) {
        return Math.mulDiv(collateralAssets, priceUsdWad, 1e30);
    }

    function collateralRequiredForValue(uint256 valueAssets, uint256 priceUsdWad) internal pure returns (uint256) {
        return Math.mulDiv(valueAssets, 1e30, priceUsdWad, Math.Rounding.Ceil);
    }
}
