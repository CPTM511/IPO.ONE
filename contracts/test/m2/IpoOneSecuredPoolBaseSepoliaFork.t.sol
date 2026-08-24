// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IpoOnePriceOracleAdapterV1} from "../../src/m2/IpoOnePriceOracleAdapterV1.sol";
import {IpoOneSecuredPoolV1} from "../../src/m2/IpoOneSecuredPoolV1.sol";
import {IIpoOnePriceOracleV1} from "../../src/m2/interfaces/IIpoOnePriceOracleV1.sol";

interface IM2ForkTokenView {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Read-only Base Sepolia fork compatibility; never a live risk-parameter approval.
contract IpoOneSecuredPoolBaseSepoliaForkTest is Test {
    uint256 private constant BASE_SEPOLIA = 84_532;
    address private constant WETH = 0x4200000000000000000000000000000000000006;
    address private constant TEST_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address private constant ETH_USD_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;
    address private constant EXPECTED_ADAPTER = 0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19;
    address private constant PAUSE_GUARDIAN = 0x8a1E62C539B802c8a204382442cA7a8caC31f19E;
    address private constant RECOVERY_AUTHORITY = 0x730766ff23D3c4366f3314c8895330fC589AA546;
    address private constant FIXTURE_GUARDIAN = address(0xA11CE);
    address private constant FIXTURE_RECOVERY = address(0xB0B);
    bytes32 private constant SOURCE_ID = keccak256("chainlink_base_sepolia_eth_usd.v1");
    bytes32 private constant EXACT_ADAPTER_RUNTIME_HASH =
        0x1e6df0c6c6e5f479e2b0bb8fa4f7856b99dbbec171fe3159b3a2539b9ac17d80;
    bytes32 private constant EXACT_POOL_RUNTIME_HASH =
        0xd65ee592be35018f33af1e2a538ead22f15e1bb577e84583645cb76bf768a198;

    function testBaseSepoliaDependenciesAdmitOneFixtureOnlyDryRun() public {
        vm.skip(block.chainid != BASE_SEPOLIA, "requires an explicit Base Sepolia fork URL");

        assertGt(WETH.code.length, 0);
        assertGt(TEST_USDC.code.length, 0);
        assertGt(ETH_USD_FEED.code.length, 0);
        assertEq(IM2ForkTokenView(WETH).decimals(), 18);
        assertEq(IM2ForkTokenView(TEST_USDC).decimals(), 6);

        IpoOnePriceOracleAdapterV1 adapter =
            new IpoOnePriceOracleAdapterV1(BASE_SEPOLIA, WETH, ETH_USD_FEED, SOURCE_ID, 8);
        IIpoOnePriceOracleV1.PriceObservation memory observation = adapter.latestPrice();
        assertTrue(observation.complete);
        assertGt(observation.priceUsdWad, 0);
        assertEq(observation.asset, WETH);
        assertEq(observation.marketChainId, BASE_SEPOLIA);
        assertEq(observation.sourceId, SOURCE_ID);

        // Compatibility fixtures only. The exact L3 decision must independently approve every value and role.
        IpoOneSecuredPoolV1.MarketConfiguration memory configuration = IpoOneSecuredPoolV1.MarketConfiguration({
            expectedChainId: BASE_SEPOLIA,
            debtAsset: TEST_USDC,
            collateralAsset: WETH,
            priceOracle: address(adapter),
            marketDebtCapAssets: 1_000 * 1e6,
            borrowerDebtCapAssets: 100 * 1e6,
            loanToValueBps: 5_000,
            pauseGuardian: FIXTURE_GUARDIAN,
            recoveryAuthority: FIXTURE_RECOVERY
        });
        IpoOneSecuredPoolV1 pool = new IpoOneSecuredPoolV1(configuration);

        assertEq(pool.marketChainId(), BASE_SEPOLIA);
        assertEq(address(pool.debtAsset()), TEST_USDC);
        assertEq(address(pool.collateralAsset()), WETH);
        assertEq(address(pool.priceOracle()), address(adapter));
        assertEq(pool.oracleSourceId(), SOURCE_ID);
        assertEq(pool.marketDebtCapAssets(), 1_000 * 1e6);
        assertEq(pool.borrowerDebtCapAssets(), 100 * 1e6);
        assertEq(pool.loanToValueBps(), 5_000);
        assertEq(pool.pauseGuardian(), FIXTURE_GUARDIAN);
        assertEq(pool.recoveryAuthority(), FIXTURE_RECOVERY);
        assertEq(IM2ForkTokenView(TEST_USDC).balanceOf(address(pool)), 0);
        assertEq(IM2ForkTokenView(WETH).balanceOf(address(pool)), 0);
    }

    function testExactM2A008RuntimeBytecodeHashes() public {
        vm.skip(block.chainid != BASE_SEPOLIA, "requires an explicit Base Sepolia fork URL");

        IpoOnePriceOracleAdapterV1 adapter =
            new IpoOnePriceOracleAdapterV1(BASE_SEPOLIA, WETH, ETH_USD_FEED, SOURCE_ID, 8);
        vm.etch(EXPECTED_ADAPTER, address(adapter).code);

        IpoOneSecuredPoolV1.MarketConfiguration memory configuration = IpoOneSecuredPoolV1.MarketConfiguration({
            expectedChainId: BASE_SEPOLIA,
            debtAsset: TEST_USDC,
            collateralAsset: WETH,
            priceOracle: EXPECTED_ADAPTER,
            marketDebtCapAssets: 1_000 * 1e6,
            borrowerDebtCapAssets: 100 * 1e6,
            loanToValueBps: 5_000,
            pauseGuardian: PAUSE_GUARDIAN,
            recoveryAuthority: RECOVERY_AUTHORITY
        });
        IpoOneSecuredPoolV1 pool = new IpoOneSecuredPoolV1(configuration);

        assertEq(keccak256(EXPECTED_ADAPTER.code), EXACT_ADAPTER_RUNTIME_HASH);
        assertEq(keccak256(address(pool).code), EXACT_POOL_RUNTIME_HASH);
    }
}
