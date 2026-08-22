// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIpoOnePriceOracleV1} from "./interfaces/IIpoOnePriceOracleV1.sol";

/// @notice Native, non-proxy accounting core for one immutable M2 secured market.
/// @dev M2A-003 is local/no-funds only. Interest, liquidation and live-oracle admission are deferred.
contract IpoOneSecuredPoolV1 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    uint256 public constant DEBT_ASSET_SCALE = 1e6;
    uint256 public constant COLLATERAL_ASSET_SCALE = 1e18;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant COLLATERAL_VALUE_DENOMINATOR = 1e30;
    uint256 public constant MAX_ORACLE_AGE_SECONDS = 3_600;
    uint256 public constant MAX_ORACLE_FUTURE_SKEW_SECONDS = 60;

    struct MarketConfiguration {
        uint256 expectedChainId;
        address debtAsset;
        address collateralAsset;
        address priceOracle;
        uint256 marketDebtCapAssets;
        uint256 borrowerDebtCapAssets;
        uint16 loanToValueBps;
        address pauseGuardian;
        address recoveryAuthority;
    }

    struct AccountPosition {
        uint256 supplyShares;
        uint256 collateralAssets;
        uint256 debtShares;
        uint256 supplyClaimAssets;
        uint256 debtQuoteAssets;
    }

    bytes32 public immutable marketId;
    uint256 public immutable marketChainId;
    IERC20 public immutable debtAsset;
    IERC20 public immutable collateralAsset;
    IIpoOnePriceOracleV1 public immutable priceOracle;
    uint256 public immutable marketDebtCapAssets;
    uint256 public immutable borrowerDebtCapAssets;
    uint16 public immutable loanToValueBps;
    address public immutable pauseGuardian;
    address public immutable recoveryAuthority;

    uint256 public cashAssets;
    uint256 public grossDebtAssets;
    uint256 public reservesAssets;
    uint256 public totalSupplyShares;
    uint256 public totalDebtShares;
    bool public newRiskPaused;

    mapping(address account => uint256 shares) public supplySharesOf;
    mapping(address account => uint256 assets) public collateralAssetsOf;
    mapping(address account => uint256 shares) public debtSharesOf;

    event MarketInitialized(
        bytes32 indexed marketId,
        uint256 indexed chainId,
        address indexed debtAsset,
        address collateralAsset,
        address priceOracle,
        uint256 marketDebtCapAssets,
        uint256 borrowerDebtCapAssets,
        uint16 loanToValueBps,
        address pauseGuardian,
        address recoveryAuthority
    );
    event AssetsSupplied(
        bytes32 indexed marketId,
        address indexed account,
        uint256 assets,
        uint256 shares,
        uint256 cashAfter,
        uint256 totalSupplySharesAfter
    );
    event AssetsWithdrawn(
        bytes32 indexed marketId,
        address indexed account,
        uint256 assets,
        uint256 shares,
        uint256 cashAfter,
        uint256 totalSupplySharesAfter
    );
    event CollateralAdded(bytes32 indexed marketId, address indexed account, uint256 assets, uint256 collateralAfter);
    event CollateralReleased(
        bytes32 indexed marketId, address indexed account, uint256 assets, uint256 collateralAfter
    );
    event AssetsBorrowed(
        bytes32 indexed marketId,
        address indexed account,
        uint256 assets,
        uint256 debtShares,
        uint256 debtAfter,
        uint256 cashAfter
    );
    event AssetsRepaid(
        bytes32 indexed marketId,
        address indexed account,
        uint256 assetsTransferred,
        uint256 debtReducedAssets,
        uint256 debtSharesBurned,
        uint256 reserveDustAssets,
        uint256 debtAfter,
        uint256 cashAfter
    );
    event NewRiskPauseChanged(bytes32 indexed marketId, bool paused, address indexed actor);

    error InvalidConfiguration();
    error InvalidAmount();
    error ActionUnavailable();
    error Unauthorized();
    error NewRiskPaused();
    error InvalidOracleObservation();
    error ExactTokenTransferRequired();
    error NativeValueRejected();

    modifier onlyPauseGuardian() {
        if (msg.sender != pauseGuardian) revert Unauthorized();
        _;
    }

    modifier onlyRecoveryAuthority() {
        if (msg.sender != recoveryAuthority) revert Unauthorized();
        _;
    }

    modifier whenNewRiskActive() {
        if (newRiskPaused) revert NewRiskPaused();
        _;
    }

    constructor(MarketConfiguration memory configuration) {
        if (
            configuration.expectedChainId != block.chainid || configuration.debtAsset == address(0)
                || configuration.collateralAsset == address(0) || configuration.priceOracle == address(0)
                || configuration.debtAsset == configuration.collateralAsset || configuration.debtAsset.code.length == 0
                || configuration.collateralAsset.code.length == 0 || configuration.priceOracle.code.length == 0
                || !_hasExpectedDecimals(configuration.debtAsset, 6)
                || !_hasExpectedDecimals(configuration.collateralAsset, 18) || configuration.marketDebtCapAssets == 0
                || configuration.borrowerDebtCapAssets == 0
                || configuration.borrowerDebtCapAssets > configuration.marketDebtCapAssets
                || configuration.loanToValueBps == 0 || configuration.loanToValueBps >= BPS
                || configuration.pauseGuardian == address(0) || configuration.recoveryAuthority == address(0)
                || configuration.pauseGuardian == configuration.recoveryAuthority
                || configuration.pauseGuardian == configuration.debtAsset
                || configuration.pauseGuardian == configuration.collateralAsset
                || configuration.pauseGuardian == configuration.priceOracle
                || configuration.recoveryAuthority == configuration.debtAsset
                || configuration.recoveryAuthority == configuration.collateralAsset
                || configuration.recoveryAuthority == configuration.priceOracle
        ) revert InvalidConfiguration();

        marketChainId = configuration.expectedChainId;
        debtAsset = IERC20(configuration.debtAsset);
        collateralAsset = IERC20(configuration.collateralAsset);
        priceOracle = IIpoOnePriceOracleV1(configuration.priceOracle);
        marketDebtCapAssets = configuration.marketDebtCapAssets;
        borrowerDebtCapAssets = configuration.borrowerDebtCapAssets;
        loanToValueBps = configuration.loanToValueBps;
        pauseGuardian = configuration.pauseGuardian;
        recoveryAuthority = configuration.recoveryAuthority;
        marketId = keccak256(
            abi.encode(
                "ipo_one_secured_pool_v1",
                configuration.expectedChainId,
                configuration.debtAsset,
                configuration.collateralAsset,
                configuration.priceOracle
            )
        );

        emit MarketInitialized(
            marketId,
            configuration.expectedChainId,
            configuration.debtAsset,
            configuration.collateralAsset,
            configuration.priceOracle,
            configuration.marketDebtCapAssets,
            configuration.borrowerDebtCapAssets,
            configuration.loanToValueBps,
            configuration.pauseGuardian,
            configuration.recoveryAuthority
        );
    }

    function lpClaimAssets() public view returns (uint256) {
        return cashAssets + grossDebtAssets - reservesAssets;
    }

    function supplyClaimAssets(address account) public view returns (uint256) {
        uint256 shares = supplySharesOf[account];
        if (shares == 0) return 0;
        if (shares == totalSupplyShares) return lpClaimAssets();
        return Math.mulDiv(shares, lpClaimAssets(), totalSupplyShares);
    }

    function debtQuoteAssets(address account) public view returns (uint256) {
        uint256 shares = debtSharesOf[account];
        if (shares == 0) return 0;
        if (shares == totalDebtShares) return grossDebtAssets;
        return Math.mulDiv(shares, grossDebtAssets, totalDebtShares, Math.Rounding.Ceil);
    }

    function position(address account) external view returns (AccountPosition memory) {
        return AccountPosition({
            supplyShares: supplySharesOf[account],
            collateralAssets: collateralAssetsOf[account],
            debtShares: debtSharesOf[account],
            supplyClaimAssets: supplyClaimAssets(account),
            debtQuoteAssets: debtQuoteAssets(account)
        });
    }

    function health(address account)
        external
        view
        returns (
            uint256 priceUsdWad,
            uint256 collateralValueAssets,
            uint256 borrowCapacityAssets,
            uint256 debtAssets,
            uint256 capacityRatioWad
        )
    {
        priceUsdWad = _currentPrice();
        collateralValueAssets = _collateralValue(collateralAssetsOf[account], priceUsdWad);
        borrowCapacityAssets = Math.mulDiv(collateralValueAssets, loanToValueBps, BPS);
        debtAssets = debtQuoteAssets(account);
        capacityRatioWad = debtAssets == 0 ? type(uint256).max : Math.mulDiv(borrowCapacityAssets, WAD, debtAssets);
    }

    function pauseNewRisk() external onlyPauseGuardian {
        if (newRiskPaused) revert ActionUnavailable();
        newRiskPaused = true;
        emit NewRiskPauseChanged(marketId, true, msg.sender);
    }

    function resumeNewRisk() external onlyRecoveryAuthority {
        if (!newRiskPaused) revert ActionUnavailable();
        newRiskPaused = false;
        emit NewRiskPauseChanged(marketId, false, msg.sender);
    }

    function supply(uint256 amountAssets) external nonReentrant returns (uint256 sharesMinted) {
        if (amountAssets == 0) revert InvalidAmount();
        uint256 claimBefore = lpClaimAssets();
        sharesMinted = totalSupplyShares == 0 ? amountAssets : Math.mulDiv(amountAssets, totalSupplyShares, claimBefore);
        if (sharesMinted == 0) revert ActionUnavailable();

        _pullExact(debtAsset, msg.sender, amountAssets);
        cashAssets += amountAssets;
        totalSupplyShares += sharesMinted;
        supplySharesOf[msg.sender] += sharesMinted;
        emit AssetsSupplied(marketId, msg.sender, amountAssets, sharesMinted, cashAssets, totalSupplyShares);
    }

    function withdraw(uint256 amountAssets) external nonReentrant whenNewRiskActive returns (uint256 sharesBurned) {
        if (amountAssets == 0) revert InvalidAmount();
        if (amountAssets > cashAssets || totalSupplyShares == 0) revert ActionUnavailable();
        uint256 claimAssets = lpClaimAssets();
        sharesBurned = Math.mulDiv(amountAssets, totalSupplyShares, claimAssets, Math.Rounding.Ceil);
        if (sharesBurned == 0 || sharesBurned > supplySharesOf[msg.sender]) revert ActionUnavailable();

        cashAssets -= amountAssets;
        totalSupplyShares -= sharesBurned;
        supplySharesOf[msg.sender] -= sharesBurned;
        _pushExact(debtAsset, msg.sender, amountAssets);
        emit AssetsWithdrawn(marketId, msg.sender, amountAssets, sharesBurned, cashAssets, totalSupplyShares);
    }

    function redeemAll() external nonReentrant whenNewRiskActive returns (uint256 amountAssets) {
        uint256 sharesBurned = supplySharesOf[msg.sender];
        if (sharesBurned == 0) revert ActionUnavailable();
        amountAssets = sharesBurned == totalSupplyShares
            ? lpClaimAssets()
            : Math.mulDiv(sharesBurned, lpClaimAssets(), totalSupplyShares);
        if (amountAssets == 0 || amountAssets > cashAssets) revert ActionUnavailable();

        cashAssets -= amountAssets;
        totalSupplyShares -= sharesBurned;
        supplySharesOf[msg.sender] = 0;
        _pushExact(debtAsset, msg.sender, amountAssets);
        emit AssetsWithdrawn(marketId, msg.sender, amountAssets, sharesBurned, cashAssets, totalSupplyShares);
    }

    function addCollateral(uint256 amountAssets) external nonReentrant {
        if (amountAssets == 0) revert InvalidAmount();
        _pullExact(collateralAsset, msg.sender, amountAssets);
        collateralAssetsOf[msg.sender] += amountAssets;
        emit CollateralAdded(marketId, msg.sender, amountAssets, collateralAssetsOf[msg.sender]);
    }

    function releaseCollateral(uint256 amountAssets) external nonReentrant whenNewRiskActive {
        if (amountAssets == 0 || amountAssets > collateralAssetsOf[msg.sender]) revert InvalidAmount();
        uint256 remainingCollateral = collateralAssetsOf[msg.sender] - amountAssets;
        uint256 capacity = Math.mulDiv(_collateralValue(remainingCollateral, _currentPrice()), loanToValueBps, BPS);
        if (debtQuoteAssets(msg.sender) > capacity) revert ActionUnavailable();

        collateralAssetsOf[msg.sender] = remainingCollateral;
        _pushExact(collateralAsset, msg.sender, amountAssets);
        emit CollateralReleased(marketId, msg.sender, amountAssets, remainingCollateral);
    }

    function borrow(uint256 amountAssets) external nonReentrant whenNewRiskActive returns (uint256 debtSharesMinted) {
        if (amountAssets == 0) revert InvalidAmount();
        if (amountAssets > cashAssets) revert ActionUnavailable();
        uint256 debtBefore = debtQuoteAssets(msg.sender);
        if (grossDebtAssets + amountAssets > marketDebtCapAssets) revert ActionUnavailable();
        if (debtBefore + amountAssets > borrowerDebtCapAssets) revert ActionUnavailable();
        uint256 capacity =
            Math.mulDiv(_collateralValue(collateralAssetsOf[msg.sender], _currentPrice()), loanToValueBps, BPS);
        if (debtBefore + amountAssets > capacity) revert ActionUnavailable();

        debtSharesMinted = totalDebtShares == 0
            ? amountAssets
            : Math.mulDiv(amountAssets, totalDebtShares, grossDebtAssets, Math.Rounding.Ceil);
        cashAssets -= amountAssets;
        grossDebtAssets += amountAssets;
        totalDebtShares += debtSharesMinted;
        debtSharesOf[msg.sender] += debtSharesMinted;
        _pushExact(debtAsset, msg.sender, amountAssets);
        emit AssetsBorrowed(
            marketId, msg.sender, amountAssets, debtSharesMinted, debtQuoteAssets(msg.sender), cashAssets
        );
    }

    function repay(uint256 amountAssets)
        external
        nonReentrant
        returns (uint256 debtSharesBurned, uint256 debtReducedAssets, uint256 reserveDustAssets)
    {
        if (amountAssets == 0) revert InvalidAmount();
        uint256 quotedDebtAssets = debtQuoteAssets(msg.sender);
        if (quotedDebtAssets == 0 || amountAssets > quotedDebtAssets) revert ActionUnavailable();

        if (amountAssets == quotedDebtAssets) {
            debtSharesBurned = debtSharesOf[msg.sender];
            debtReducedAssets = amountAssets;
        } else {
            debtSharesBurned = Math.mulDiv(amountAssets, totalDebtShares, grossDebtAssets);
            if (debtSharesBurned == 0) revert ActionUnavailable();
            debtReducedAssets = Math.mulDiv(debtSharesBurned, grossDebtAssets, totalDebtShares, Math.Rounding.Ceil);
        }
        reserveDustAssets = amountAssets - debtReducedAssets;

        _pullExact(debtAsset, msg.sender, amountAssets);
        cashAssets += amountAssets;
        grossDebtAssets -= debtReducedAssets;
        reservesAssets += reserveDustAssets;
        totalDebtShares -= debtSharesBurned;
        debtSharesOf[msg.sender] -= debtSharesBurned;
        emit AssetsRepaid(
            marketId,
            msg.sender,
            amountAssets,
            debtReducedAssets,
            debtSharesBurned,
            reserveDustAssets,
            debtQuoteAssets(msg.sender),
            cashAssets
        );
    }

    function _currentPrice() internal view returns (uint256 priceUsdWad) {
        uint64 observedAt;
        bool valid;
        (priceUsdWad, observedAt, valid) = priceOracle.latestPrice();
        if (
            !valid || priceUsdWad == 0 || uint256(observedAt) > block.timestamp + MAX_ORACLE_FUTURE_SKEW_SECONDS
                || (block.timestamp > observedAt && block.timestamp - uint256(observedAt) > MAX_ORACLE_AGE_SECONDS)
        ) revert InvalidOracleObservation();
    }

    function _collateralValue(uint256 amountAssets, uint256 priceUsdWad) internal pure returns (uint256) {
        return Math.mulDiv(amountAssets, priceUsdWad, COLLATERAL_VALUE_DENOMINATOR);
    }

    function _hasExpectedDecimals(address token, uint8 expectedDecimals) private view returns (bool) {
        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSignature("decimals()"));
        return success && result.length >= 32 && abi.decode(result, (uint256)) == expectedDecimals;
    }

    function _pullExact(IERC20 token, address from, uint256 amountAssets) internal {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amountAssets);
        uint256 balanceAfter = token.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != amountAssets) {
            revert ExactTokenTransferRequired();
        }
    }

    function _pushExact(IERC20 token, address to, uint256 amountAssets) internal {
        uint256 poolBalanceBefore = token.balanceOf(address(this));
        uint256 recipientBalanceBefore = token.balanceOf(to);
        token.safeTransfer(to, amountAssets);
        uint256 poolBalanceAfter = token.balanceOf(address(this));
        uint256 recipientBalanceAfter = token.balanceOf(to);
        if (
            poolBalanceBefore < poolBalanceAfter || poolBalanceBefore - poolBalanceAfter != amountAssets
                || recipientBalanceAfter < recipientBalanceBefore
                || recipientBalanceAfter - recipientBalanceBefore != amountAssets
        ) revert ExactTokenTransferRequired();
    }

    receive() external payable {
        revert NativeValueRejected();
    }

    fallback() external payable {
        revert NativeValueRejected();
    }
}
