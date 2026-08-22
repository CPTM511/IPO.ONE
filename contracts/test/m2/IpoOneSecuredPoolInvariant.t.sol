// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {IpoOneSecuredPoolV1} from "../../src/m2/IpoOneSecuredPoolV1.sol";
import {M2MockERC20} from "./mocks/M2MockERC20.sol";
import {M2MockPriceOracle} from "./mocks/M2MockPriceOracle.sol";

contract M2SecuredPoolHandler is Test {
    uint256 private constant USDC = 1e6;
    uint256 private constant WETH = 1e18;

    IpoOneSecuredPoolV1 public immutable pool;
    M2MockERC20 public immutable debt;
    M2MockERC20 public immutable collateral;
    address public immutable guardian;
    address public immutable recovery;
    address[3] private actors;

    constructor(
        IpoOneSecuredPoolV1 pool_,
        M2MockERC20 debt_,
        M2MockERC20 collateral_,
        address guardian_,
        address recovery_
    ) {
        pool = pool_;
        debt = debt_;
        collateral = collateral_;
        guardian = guardian_;
        recovery = recovery_;
        actors = [address(0x2001), address(0x2002), address(0x2003)];
        for (uint256 index = 0; index < actors.length; index++) {
            debt.mint(actors[index], 2_000_000 * USDC);
            collateral.mint(actors[index], 1_000 * WETH);
            vm.startPrank(actors[index]);
            debt.approve(address(pool_), type(uint256).max);
            collateral.approve(address(pool_), type(uint256).max);
            vm.stopPrank();
        }
    }

    function actor(uint256 index) external view returns (address) {
        return actors[index];
    }

    function supply(uint256 actorSeed, uint96 rawAmount) external {
        address account = _actor(actorSeed);
        uint256 available = debt.balanceOf(account);
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(account);
        pool.supply(amount);
    }

    function withdraw(uint256 actorSeed, uint96 rawAmount) external {
        if (pool.newRiskPaused()) return;
        address account = _actor(actorSeed);
        uint256 claim = pool.supplyClaimAssets(account);
        uint256 available = claim < pool.cashAssets() ? claim : pool.cashAssets();
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(account);
        pool.withdraw(amount);
    }

    function addCollateral(uint256 actorSeed, uint96 rawAmount) external {
        address account = _actor(actorSeed);
        uint256 available = collateral.balanceOf(account);
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(account);
        pool.addCollateral(amount);
    }

    function releaseCollateral(uint256 actorSeed, uint96 rawAmount) external {
        if (pool.newRiskPaused()) return;
        address account = _actor(actorSeed);
        if (pool.debtQuoteAssets(account) != 0) return;
        uint256 available = pool.collateralAssetsOf(account);
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(account);
        pool.releaseCollateral(amount);
    }

    function borrow(uint256 actorSeed, uint96 rawAmount) external {
        if (pool.newRiskPaused()) return;
        address account = _actor(actorSeed);
        (,, uint256 capacity, uint256 accountDebt,) = pool.health(account);
        uint256 capacityRemaining = capacity > accountDebt ? capacity - accountDebt : 0;
        uint256 borrowerCapRemaining =
            pool.borrowerDebtCapAssets() > accountDebt ? pool.borrowerDebtCapAssets() - accountDebt : 0;
        uint256 marketCapRemaining = pool.marketDebtCapAssets() > pool.grossDebtAssets()
            ? pool.marketDebtCapAssets() - pool.grossDebtAssets()
            : 0;
        uint256 available = _min(capacityRemaining, borrowerCapRemaining);
        available = _min(available, marketCapRemaining);
        available = _min(available, pool.cashAssets());
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(account);
        pool.borrow(amount);
    }

    function repay(uint256 actorSeed, uint96 rawAmount) external {
        address account = _actor(actorSeed);
        uint256 quote = pool.debtQuoteAssets(account);
        uint256 available = _min(quote, debt.balanceOf(account));
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        vm.prank(account);
        pool.repay(amount);
    }

    function pauseOrResume(bool pauseRequested) external {
        if (pauseRequested && !pool.newRiskPaused()) {
            vm.prank(guardian);
            pool.pauseNewRisk();
        } else if (!pauseRequested && pool.newRiskPaused()) {
            vm.prank(recovery);
            pool.resumeNewRisk();
        }
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    function _min(uint256 left, uint256 right) private pure returns (uint256) {
        return left < right ? left : right;
    }
}

contract IpoOneSecuredPoolInvariantTest is StdInvariant, Test {
    uint256 private constant USDC = 1e6;
    address private constant GUARDIAN = address(0xA11CE);
    address private constant RECOVERY = address(0xB0B);

    M2MockERC20 private debt;
    M2MockERC20 private collateral;
    M2MockPriceOracle private oracle;
    IpoOneSecuredPoolV1 private pool;
    M2SecuredPoolHandler private handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        debt = new M2MockERC20("Test USDC", "tUSDC", 6);
        collateral = new M2MockERC20("Wrapped Ether", "WETH", 18);
        oracle = new M2MockPriceOracle();
        oracle.setObservation(2_000e18, uint64(block.timestamp), true);
        pool = new IpoOneSecuredPoolV1(
            IpoOneSecuredPoolV1.MarketConfiguration({
                expectedChainId: block.chainid,
                debtAsset: address(debt),
                collateralAsset: address(collateral),
                priceOracle: address(oracle),
                marketDebtCapAssets: 1_000_000 * USDC,
                borrowerDebtCapAssets: 100_000 * USDC,
                loanToValueBps: 7_500,
                pauseGuardian: GUARDIAN,
                recoveryAuthority: RECOVERY
            })
        );
        handler = new M2SecuredPoolHandler(pool, debt, collateral, GUARDIAN, RECOVERY);
        targetContract(address(handler));
    }

    function invariantAggregateSharesAndCustodyReconcile() public view {
        uint256 aggregateSupplyShares;
        uint256 aggregateDebtShares;
        uint256 aggregateCollateral;
        for (uint256 index = 0; index < 3; index++) {
            address account = handler.actor(index);
            aggregateSupplyShares += pool.supplySharesOf(account);
            aggregateDebtShares += pool.debtSharesOf(account);
            aggregateCollateral += pool.collateralAssetsOf(account);
        }
        assertEq(aggregateSupplyShares, pool.totalSupplyShares());
        assertEq(aggregateDebtShares, pool.totalDebtShares());
        assertEq(aggregateCollateral, collateral.balanceOf(address(pool)));
        assertGe(debt.balanceOf(address(pool)), pool.cashAssets());
    }

    function invariantClaimsDebtAndCapsRemainSolvent() public view {
        assertEq(pool.lpClaimAssets(), pool.cashAssets() + pool.grossDebtAssets() - pool.reservesAssets());
        assertLe(pool.grossDebtAssets(), pool.marketDebtCapAssets());
        uint256 aggregateClaims;
        for (uint256 index = 0; index < 3; index++) {
            address account = handler.actor(index);
            aggregateClaims += pool.supplyClaimAssets(account);
            uint256 debtAssets = pool.debtQuoteAssets(account);
            assertLe(debtAssets, pool.borrowerDebtCapAssets());
            (,, uint256 capacity,,) = pool.health(account);
            assertLe(debtAssets, capacity);
        }
        assertLe(aggregateClaims, pool.lpClaimAssets());
    }
}
