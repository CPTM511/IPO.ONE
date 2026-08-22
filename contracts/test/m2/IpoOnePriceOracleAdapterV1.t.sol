// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IpoOnePriceOracleAdapterV1} from "../../src/m2/IpoOnePriceOracleAdapterV1.sol";
import {IIpoOnePriceOracleV1} from "../../src/m2/interfaces/IIpoOnePriceOracleV1.sol";
import {M2MockPriceFeed} from "./mocks/M2MockPriceFeed.sol";

contract IpoOnePriceOracleAdapterV1Test is Test {
    address private constant WETH = address(0xC011A7E);
    bytes32 private constant SOURCE = keccak256("deterministic_m2_fixture.v1");

    M2MockPriceFeed private feed;
    IpoOnePriceOracleAdapterV1 private adapter;

    function setUp() public {
        vm.warp(1_800_000_000);
        feed = new M2MockPriceFeed(8);
        feed.setRound(7, 2_000e8, block.timestamp, 7);
        adapter = new IpoOnePriceOracleAdapterV1(block.chainid, WETH, address(feed), SOURCE, 8);
    }

    function testNormalizesAndClosesEveryObservationBinding() public view {
        IIpoOnePriceOracleV1.PriceObservation memory observation = adapter.latestPrice();
        assertEq(observation.priceUsdWad, 2_000e18);
        assertEq(observation.observedAt, block.timestamp);
        assertEq(observation.roundId, 7);
        assertEq(observation.sourceId, SOURCE);
        assertEq(observation.asset, WETH);
        assertEq(observation.marketChainId, block.chainid);
        assertTrue(observation.complete);
        assertEq(adapter.feedDecimals(), 8);
        assertEq(adapter.normalizationFactor(), 1e10);
    }

    function testInvalidNumericRoundAndTimeInputsRemainExplicitlyIncomplete() public {
        feed.setRound(8, 0, block.timestamp, 8);
        assertFalse(adapter.latestPrice().complete);
        feed.setRound(9, -1, block.timestamp, 9);
        assertFalse(adapter.latestPrice().complete);
        feed.setRound(10, 2_000e8, block.timestamp, 9);
        assertFalse(adapter.latestPrice().complete);
        feed.setRound(11, 2_000e8, block.timestamp - 3_601, 11);
        assertFalse(adapter.latestPrice().complete);
        feed.setRound(12, 2_000e8, block.timestamp + 61, 12);
        assertFalse(adapter.latestPrice().complete);
        feed.setRound(0, 2_000e8, block.timestamp, 0);
        assertFalse(adapter.latestPrice().complete);
    }

    function testConstructorRejectsWrongChainDecimalsAndEmptyBindings() public {
        vm.expectRevert(IpoOnePriceOracleAdapterV1.InvalidConfiguration.selector);
        new IpoOnePriceOracleAdapterV1(block.chainid + 1, WETH, address(feed), SOURCE, 8);
        vm.expectRevert(IpoOnePriceOracleAdapterV1.InvalidConfiguration.selector);
        new IpoOnePriceOracleAdapterV1(block.chainid, WETH, address(feed), SOURCE, 18);
        vm.expectRevert(IpoOnePriceOracleAdapterV1.InvalidConfiguration.selector);
        new IpoOnePriceOracleAdapterV1(block.chainid, address(0), address(feed), SOURCE, 8);
        vm.expectRevert(IpoOnePriceOracleAdapterV1.InvalidConfiguration.selector);
        new IpoOnePriceOracleAdapterV1(block.chainid, WETH, address(feed), bytes32(0), 8);
    }

    function testFuzzNormalizationIsExactForAdmittedPositiveAnswers(uint128 rawAnswer) public {
        uint256 answer = bound(uint256(rawAnswer), 1, type(uint128).max);
        feed.setRound(8, int256(answer), block.timestamp, 8);
        IIpoOnePriceOracleV1.PriceObservation memory observation = adapter.latestPrice();
        assertTrue(observation.complete);
        assertEq(observation.priceUsdWad, answer * 1e10);
    }
}
