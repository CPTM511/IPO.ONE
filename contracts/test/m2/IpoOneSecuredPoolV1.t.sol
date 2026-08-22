// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IpoOneSecuredPoolV1} from "../../src/m2/IpoOneSecuredPoolV1.sol";
import {M2MockERC20} from "./mocks/M2MockERC20.sol";
import {M2MockPriceOracle} from "./mocks/M2MockPriceOracle.sol";

contract IpoOneSecuredPoolV1Test is Test {
    uint256 private constant USDC = 1e6;
    uint256 private constant WETH = 1e18;
    uint256 private constant PRICE = 2_000e18;
    uint256 private constant MARKET_CAP = 1_000_000 * USDC;
    uint256 private constant BORROWER_CAP = 100_000 * USDC;

    address private constant LP = address(0x1001);
    address private constant BORROWER = address(0x1002);
    address private constant SECOND_LP = address(0x1003);
    address private constant GUARDIAN = address(0xA11CE);
    address private constant RECOVERY = address(0xB0B);

    M2MockERC20 private debt;
    M2MockERC20 private collateral;
    M2MockPriceOracle private oracle;
    IpoOneSecuredPoolV1 private pool;

    function setUp() public {
        vm.warp(1_800_000_000);
        debt = new M2MockERC20("Test USDC", "tUSDC", 6);
        collateral = new M2MockERC20("Wrapped Ether", "WETH", 18);
        oracle = new M2MockPriceOracle();
        oracle.setObservation(PRICE, uint64(block.timestamp), true);
        pool = _deploy(debt, collateral, oracle);

        debt.mint(LP, 1_000_000 * USDC);
        debt.mint(SECOND_LP, 1_000_000 * USDC);
        debt.mint(BORROWER, 100_000 * USDC);
        collateral.mint(BORROWER, 100 * WETH);
        _approve(LP, pool, debt, collateral);
        _approve(SECOND_LP, pool, debt, collateral);
        _approve(BORROWER, pool, debt, collateral);
    }

    function testConstructorBindsOneImmutableMarket() public view {
        assertEq(pool.marketChainId(), block.chainid);
        assertEq(address(pool.debtAsset()), address(debt));
        assertEq(address(pool.collateralAsset()), address(collateral));
        assertEq(address(pool.priceOracle()), address(oracle));
        assertEq(pool.marketDebtCapAssets(), MARKET_CAP);
        assertEq(pool.borrowerDebtCapAssets(), BORROWER_CAP);
        assertEq(pool.loanToValueBps(), 7_500);
        assertEq(pool.pauseGuardian(), GUARDIAN);
        assertEq(pool.recoveryAuthority(), RECOVERY);
        assertEq(
            pool.marketId(), keccak256(abi.encode("ipo_one_secured_pool_v1", block.chainid, debt, collateral, oracle))
        );
    }

    function testConstructorRejectsInvalidOrOverlappingConfiguration() public {
        IpoOneSecuredPoolV1.MarketConfiguration memory configuration = _configuration(debt, collateral, oracle);
        configuration.expectedChainId = block.chainid + 1;
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidConfiguration.selector);
        new IpoOneSecuredPoolV1(configuration);

        configuration = _configuration(debt, collateral, oracle);
        configuration.recoveryAuthority = GUARDIAN;
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidConfiguration.selector);
        new IpoOneSecuredPoolV1(configuration);

        configuration = _configuration(debt, collateral, oracle);
        configuration.borrowerDebtCapAssets = MARKET_CAP + 1;
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidConfiguration.selector);
        new IpoOneSecuredPoolV1(configuration);

        configuration = _configuration(debt, collateral, oracle);
        configuration.loanToValueBps = 10_000;
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidConfiguration.selector);
        new IpoOneSecuredPoolV1(configuration);

        configuration = _configuration(debt, collateral, oracle);
        configuration.debtAsset = address(0xDEAD);
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidConfiguration.selector);
        new IpoOneSecuredPoolV1(configuration);

        M2MockERC20 wrongDecimals = new M2MockERC20("Wrong", "WRONG", 18);
        configuration = _configuration(debt, collateral, oracle);
        configuration.debtAsset = address(wrongDecimals);
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidConfiguration.selector);
        new IpoOneSecuredPoolV1(configuration);
    }

    function testSupplyWithdrawAndExactTerminalRedemption() public {
        vm.startPrank(LP);
        uint256 shares = pool.supply(500_000 * USDC);
        assertEq(shares, 500_000 * USDC);
        assertEq(pool.withdraw(100_000 * USDC), 100_000 * USDC);
        assertEq(pool.redeemAll(), 400_000 * USDC);
        vm.stopPrank();

        assertEq(pool.cashAssets(), 0);
        assertEq(pool.totalSupplyShares(), 0);
        assertEq(pool.supplySharesOf(LP), 0);
        assertEq(pool.lpClaimAssets(), 0);
        assertEq(debt.balanceOf(address(pool)), 0);
    }

    function testDirectDonationCannotChangeInternalClaimsOrExtractFromLaterSupplier() public {
        vm.prank(LP);
        pool.supply(1 * USDC);
        vm.prank(LP);
        assertTrue(debt.transfer(address(pool), 500_000 * USDC));

        assertEq(pool.cashAssets(), 1 * USDC);
        assertEq(pool.lpClaimAssets(), 1 * USDC);
        assertEq(pool.supplyClaimAssets(LP), 1 * USDC);

        vm.prank(SECOND_LP);
        pool.supply(100 * USDC);
        assertEq(pool.supplyClaimAssets(LP), 1 * USDC);
        assertEq(pool.supplyClaimAssets(SECOND_LP), 100 * USDC);
        assertEq(debt.balanceOf(address(pool)), 500_101 * USDC);
    }

    function testCollateralBorrowRepayAndReleaseFollowReferenceAccounting() public {
        vm.prank(LP);
        pool.supply(500_000 * USDC);
        vm.startPrank(BORROWER);
        pool.addCollateral(10 * WETH);
        uint256 debtShares = pool.borrow(14_000 * USDC);
        assertEq(debtShares, 14_000 * USDC);
        assertEq(pool.debtQuoteAssets(BORROWER), 14_000 * USDC);

        (uint256 price, uint256 collateralValue, uint256 capacity, uint256 debtAssets, uint256 healthWad) =
            pool.health(BORROWER);
        assertEq(price, PRICE);
        assertEq(collateralValue, 20_000 * USDC);
        assertEq(capacity, 15_000 * USDC);
        assertEq(debtAssets, 14_000 * USDC);
        assertEq(healthWad, uint256(15_000e18) / 14_000);

        pool.repay(7_000 * USDC);
        pool.releaseCollateral(5 * WETH);
        assertEq(pool.debtQuoteAssets(BORROWER), 7_000 * USDC);
        assertEq(pool.collateralAssetsOf(BORROWER), 5 * WETH);
        pool.repay(7_000 * USDC);
        pool.releaseCollateral(5 * WETH);
        vm.stopPrank();

        assertEq(pool.grossDebtAssets(), 0);
        assertEq(pool.totalDebtShares(), 0);
        assertEq(pool.collateralAssetsOf(BORROWER), 0);
        assertEq(pool.cashAssets(), 500_000 * USDC);
    }

    function testBorrowRejectsCapacityMarketBorrowerAndCashLimitsAtomically() public {
        vm.prank(LP);
        pool.supply(20_000 * USDC);
        vm.prank(BORROWER);
        pool.addCollateral(100 * WETH);

        uint256 cashBefore = pool.cashAssets();
        uint256 borrowerBalanceBefore = debt.balanceOf(BORROWER);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.ActionUnavailable.selector);
        pool.borrow(20_001 * USDC);
        assertEq(pool.cashAssets(), cashBefore);
        assertEq(pool.grossDebtAssets(), 0);
        assertEq(debt.balanceOf(BORROWER), borrowerBalanceBefore);

        vm.prank(BORROWER);
        pool.borrow(20_000 * USDC);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.ActionUnavailable.selector);
        pool.borrow(1);
    }

    function testPauseNarrowsOutflowWhileProtectiveInflowsRemainOpen() public {
        vm.prank(LP);
        pool.supply(500_000 * USDC);
        vm.startPrank(BORROWER);
        pool.addCollateral(10 * WETH);
        pool.borrow(10_000 * USDC);
        vm.stopPrank();

        vm.prank(GUARDIAN);
        pool.pauseNewRisk();

        vm.prank(LP);
        vm.expectRevert(IpoOneSecuredPoolV1.NewRiskPaused.selector);
        pool.withdraw(1 * USDC);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.NewRiskPaused.selector);
        pool.borrow(1 * USDC);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.NewRiskPaused.selector);
        pool.releaseCollateral(1);

        vm.prank(SECOND_LP);
        pool.supply(1 * USDC);
        vm.startPrank(BORROWER);
        pool.addCollateral(1 * WETH);
        pool.repay(1 * USDC);
        vm.stopPrank();

        vm.prank(GUARDIAN);
        vm.expectRevert(IpoOneSecuredPoolV1.Unauthorized.selector);
        pool.resumeNewRisk();
        vm.prank(RECOVERY);
        pool.resumeNewRisk();
        assertFalse(pool.newRiskPaused());
    }

    function testInvalidOracleBlocksBorrowAndReleaseButNotRepayOrAddCollateral() public {
        vm.prank(LP);
        pool.supply(500_000 * USDC);
        vm.startPrank(BORROWER);
        pool.addCollateral(10 * WETH);
        pool.borrow(10_000 * USDC);
        vm.stopPrank();

        oracle.setObservation(PRICE, uint64(block.timestamp - 3_601), true);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidOracleObservation.selector);
        pool.borrow(1);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidOracleObservation.selector);
        pool.releaseCollateral(1);

        vm.startPrank(BORROWER);
        pool.repay(1 * USDC);
        pool.addCollateral(1 * WETH);
        vm.stopPrank();

        oracle.setObservation(PRICE, uint64(block.timestamp + 61), true);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidOracleObservation.selector);
        pool.borrow(1);
        oracle.setObservation(0, uint64(block.timestamp), true);
        vm.prank(BORROWER);
        vm.expectRevert(IpoOneSecuredPoolV1.InvalidOracleObservation.selector);
        pool.borrow(1);
    }

    function testFeeTokenAndReentrantCallbackRevertAllState() public {
        M2MockERC20 feeDebt = new M2MockERC20("Fee", "FEE", 6);
        IpoOneSecuredPoolV1 feePool = _deploy(feeDebt, collateral, oracle);
        feeDebt.mint(LP, 1_000 * USDC);
        vm.prank(LP);
        feeDebt.approve(address(feePool), type(uint256).max);
        feeDebt.setFeeBps(100);
        vm.prank(LP);
        vm.expectRevert(IpoOneSecuredPoolV1.ExactTokenTransferRequired.selector);
        feePool.supply(100 * USDC);
        assertEq(feePool.cashAssets(), 0);
        assertEq(feeDebt.balanceOf(address(feePool)), 0);

        feeDebt.setFeeBps(0);
        vm.prank(LP);
        feePool.supply(100 * USDC);
        feeDebt.setFeeBps(100);
        vm.prank(LP);
        vm.expectRevert(IpoOneSecuredPoolV1.ExactTokenTransferRequired.selector);
        feePool.withdraw(1 * USDC);
        assertEq(feePool.cashAssets(), 100 * USDC);
        assertEq(feeDebt.balanceOf(address(feePool)), 100 * USDC);

        debt.setTransferFromCallback(address(pool), abi.encodeCall(pool.supply, (1)));
        vm.prank(LP);
        vm.expectRevert();
        pool.supply(100 * USDC);
        assertEq(pool.cashAssets(), 0);
        assertEq(debt.balanceOf(address(pool)), 0);
    }

    function testUnauthorizedControlsAndNativeValueFailClosed() public {
        vm.prank(LP);
        vm.expectRevert(IpoOneSecuredPoolV1.Unauthorized.selector);
        pool.pauseNewRisk();
        vm.prank(RECOVERY);
        vm.expectRevert(IpoOneSecuredPoolV1.ActionUnavailable.selector);
        pool.resumeNewRisk();

        (bool success, bytes memory result) = address(pool).call{value: 1}("");
        assertFalse(success);
        assertEq(result, abi.encodeWithSelector(IpoOneSecuredPoolV1.NativeValueRejected.selector));
    }

    function testFuzzSupplyWithdrawConservesExactAccounting(uint96 rawAmount, uint96 rawWithdrawal) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000 * USDC);
        uint256 withdrawal = bound(uint256(rawWithdrawal), 1, amount);
        debt.mint(LP, amount);
        vm.startPrank(LP);
        pool.supply(amount);
        uint256 burned = pool.withdraw(withdrawal);
        vm.stopPrank();

        assertEq(burned, withdrawal);
        assertEq(pool.cashAssets(), amount - withdrawal);
        assertEq(pool.totalSupplyShares(), amount - withdrawal);
        assertEq(pool.lpClaimAssets(), amount - withdrawal);
    }

    function testFuzzBorrowAndExactRepayRemainSecured(uint96 rawCollateral, uint96 rawBorrow) public {
        uint256 collateralAmount = bound(uint256(rawCollateral), 1e12, 100 * WETH);
        uint256 capacity = (collateralAmount * 2_000 * USDC * 7_500) / (WETH * 10_000);
        vm.assume(capacity > 0);
        uint256 amount = bound(uint256(rawBorrow), 1, capacity < BORROWER_CAP ? capacity : BORROWER_CAP);
        vm.prank(LP);
        pool.supply(MARKET_CAP);
        vm.startPrank(BORROWER);
        pool.addCollateral(collateralAmount);
        pool.borrow(amount);
        pool.repay(amount);
        vm.stopPrank();

        assertEq(pool.debtQuoteAssets(BORROWER), 0);
        assertEq(pool.grossDebtAssets(), 0);
        assertEq(pool.totalDebtShares(), 0);
        assertEq(pool.cashAssets(), MARKET_CAP);
    }

    function _deploy(M2MockERC20 debt_, M2MockERC20 collateral_, M2MockPriceOracle oracle_)
        private
        returns (IpoOneSecuredPoolV1)
    {
        return new IpoOneSecuredPoolV1(_configuration(debt_, collateral_, oracle_));
    }

    function _configuration(M2MockERC20 debt_, M2MockERC20 collateral_, M2MockPriceOracle oracle_)
        private
        view
        returns (IpoOneSecuredPoolV1.MarketConfiguration memory)
    {
        return IpoOneSecuredPoolV1.MarketConfiguration({
            expectedChainId: block.chainid,
            debtAsset: address(debt_),
            collateralAsset: address(collateral_),
            priceOracle: address(oracle_),
            marketDebtCapAssets: MARKET_CAP,
            borrowerDebtCapAssets: BORROWER_CAP,
            loanToValueBps: 7_500,
            pauseGuardian: GUARDIAN,
            recoveryAuthority: RECOVERY
        });
    }

    function _approve(address account, IpoOneSecuredPoolV1 pool_, M2MockERC20 debt_, M2MockERC20 collateral_) private {
        vm.startPrank(account);
        debt_.approve(address(pool_), type(uint256).max);
        collateral_.approve(address(pool_), type(uint256).max);
        vm.stopPrank();
    }
}
