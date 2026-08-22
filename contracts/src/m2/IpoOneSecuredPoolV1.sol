// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIpoOnePriceOracleV1} from "./interfaces/IIpoOnePriceOracleV1.sol";
import {SecuredPoolMathV1} from "./libraries/SecuredPoolMathV1.sol";

/// @notice Native, non-proxy accounting and liquidation core for one immutable M2 secured market.
/// @dev M2A-004 remains local/no-funds. Its fixture policy is not a live feed or commercial approval.
contract IpoOneSecuredPoolV1 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    uint256 public constant MAX_ORACLE_AGE_SECONDS = 3_600;
    uint256 public constant MAX_ORACLE_FUTURE_SKEW_SECONDS = 60;
    uint256 public constant MAX_ORACLE_DEVIATION_BPS = 2_000;
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8_000;
    uint256 public constant CLOSE_FACTOR_BPS = 5_000;
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;
    uint256 public constant MAX_ACCRUAL_CHUNK_SECONDS = 7 days;
    uint256 public constant MAX_ACCRUAL_CHUNKS_PER_CALL = 32;

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
        uint256 performingDebtAssets;
        uint256 badDebtAssets;
        uint256 totalOutstandingDebtAssets;
    }

    struct PoolAccounting {
        uint256 cashAssets;
        uint256 grossDebtAssets;
        uint256 performingDebtAssets;
        uint256 reservesAssets;
        uint256 badDebtAssets;
        uint256 lpClaimAssets;
        uint256 utilizationBps;
        uint256 borrowAprBps;
        uint256 supplyAprBps;
    }

    bytes32 public immutable marketId;
    uint256 public immutable marketChainId;
    IERC20 public immutable debtAsset;
    IERC20 public immutable collateralAsset;
    IIpoOnePriceOracleV1 public immutable priceOracle;
    bytes32 public immutable oracleSourceId;
    uint256 public immutable marketDebtCapAssets;
    uint256 public immutable borrowerDebtCapAssets;
    uint16 public immutable loanToValueBps;
    address public immutable pauseGuardian;
    address public immutable recoveryAuthority;

    uint256 public cashAssets;
    uint256 public grossDebtAssets;
    uint256 public reservesAssets;
    uint256 public badDebtAssets;
    uint256 public totalSupplyShares;
    uint256 public totalDebtShares;
    uint256 public lastAccruedAt;
    uint256 public acceptedPriceUsdWad;
    uint64 public acceptedOracleObservedAt;
    uint80 public acceptedOracleRoundId;
    bool public oracleDeviationHalted;
    bool public newRiskPaused;

    mapping(address account => uint256 shares) public supplySharesOf;
    mapping(address account => uint256 assets) public collateralAssetsOf;
    mapping(address account => uint256 shares) public debtSharesOf;
    mapping(address account => uint256 assets) public badDebtAssetsOf;

    event MarketInitialized(
        bytes32 indexed marketId,
        uint256 indexed chainId,
        address indexed debtAsset,
        address collateralAsset,
        address priceOracle,
        bytes32 oracleSourceId,
        uint256 marketDebtCapAssets,
        uint256 borrowerDebtCapAssets,
        uint16 loanToValueBps,
        uint16 liquidationThresholdBps,
        address pauseGuardian,
        address recoveryAuthority
    );
    event OracleObservationAccepted(
        bytes32 indexed marketId,
        bytes32 indexed sourceId,
        uint80 indexed roundId,
        uint256 priceUsdWad,
        uint64 observedAt
    );
    event OracleDeviationHaltChanged(
        bytes32 indexed marketId,
        bool halted,
        uint256 previousPriceUsdWad,
        uint256 candidatePriceUsdWad,
        address indexed actor
    );
    event InterestAccrued(
        bytes32 indexed marketId,
        uint256 fromTimestamp,
        uint256 toTimestamp,
        uint256 chunks,
        uint256 interestAssets,
        uint256 reserveAssets
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
        address indexed payer,
        uint256 assetsTransferred,
        uint256 debtReducedAssets,
        uint256 debtSharesBurned,
        uint256 reserveDustAssets,
        uint256 debtAfter,
        uint256 cashAfter
    );
    event PositionLiquidated(
        bytes32 indexed marketId,
        address indexed borrower,
        address indexed liquidator,
        uint256 repaidAssets,
        uint256 collateralSeizedAssets,
        uint256 badDebtRecognizedAssets
    );
    event BadDebtRecovered(
        bytes32 indexed marketId,
        address indexed account,
        address indexed payer,
        uint256 recoveredAssets,
        uint256 accountBadDebtAfter,
        uint256 marketBadDebtAfter
    );
    event NewRiskPauseChanged(bytes32 indexed marketId, bool paused, address indexed actor);

    error InvalidConfiguration();
    error InvalidAmount();
    error ActionUnavailable();
    error Unauthorized();
    error NewRiskPaused();
    error InvalidOracleObservation();
    error OracleDeviationExceeded();
    error OracleDeviationHalted();
    error AccrualCatchUpRequired();
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
                || configuration.loanToValueBps == 0 || configuration.loanToValueBps >= LIQUIDATION_THRESHOLD_BPS
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
        lastAccruedAt = block.timestamp;

        IIpoOnePriceOracleV1.PriceObservation memory observation = priceOracle.latestPrice();
        _validateObservationBinding(observation, bytes32(0));
        oracleSourceId = observation.sourceId;
        _storeAcceptedObservation(observation);

        emit MarketInitialized(
            marketId,
            configuration.expectedChainId,
            configuration.debtAsset,
            configuration.collateralAsset,
            configuration.priceOracle,
            observation.sourceId,
            configuration.marketDebtCapAssets,
            configuration.borrowerDebtCapAssets,
            configuration.loanToValueBps,
            uint16(LIQUIDATION_THRESHOLD_BPS),
            configuration.pauseGuardian,
            configuration.recoveryAuthority
        );
    }

    function performingDebtAssets() public view returns (uint256) {
        return grossDebtAssets - badDebtAssets;
    }

    function lpClaimAssets() public view returns (uint256) {
        return cashAssets + grossDebtAssets - reservesAssets - badDebtAssets;
    }

    function accounting() external view returns (PoolAccounting memory) {
        uint256 performing = performingDebtAssets();
        return PoolAccounting({
            cashAssets: cashAssets,
            grossDebtAssets: grossDebtAssets,
            performingDebtAssets: performing,
            reservesAssets: reservesAssets,
            badDebtAssets: badDebtAssets,
            lpClaimAssets: lpClaimAssets(),
            utilizationBps: SecuredPoolMathV1.utilizationBps(cashAssets, performing),
            borrowAprBps: SecuredPoolMathV1.borrowAprBps(cashAssets, performing),
            supplyAprBps: SecuredPoolMathV1.supplyAprBps(cashAssets, performing)
        });
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
        uint256 performing = performingDebtAssets();
        if (shares == totalDebtShares) return performing;
        return Math.mulDiv(shares, performing, totalDebtShares, Math.Rounding.Ceil);
    }

    function position(address account) external view returns (AccountPosition memory) {
        uint256 performing = debtQuoteAssets(account);
        uint256 badDebt = badDebtAssetsOf[account];
        return AccountPosition({
            supplyShares: supplySharesOf[account],
            collateralAssets: collateralAssetsOf[account],
            debtShares: debtSharesOf[account],
            supplyClaimAssets: supplyClaimAssets(account),
            performingDebtAssets: performing,
            badDebtAssets: badDebt,
            totalOutstandingDebtAssets: performing + badDebt
        });
    }

    function health(address account)
        external
        view
        returns (
            uint256 priceUsdWad,
            uint256 collateralValueAssets,
            uint256 borrowCapacityAssets,
            uint256 liquidationThresholdAssets,
            uint256 debtAssets,
            uint256 healthFactorWad,
            bool liquidatable
        )
    {
        priceUsdWad = _previewCurrentPrice();
        collateralValueAssets = SecuredPoolMathV1.collateralValueAssets(collateralAssetsOf[account], priceUsdWad);
        borrowCapacityAssets = Math.mulDiv(collateralValueAssets, loanToValueBps, BPS);
        liquidationThresholdAssets = Math.mulDiv(collateralValueAssets, LIQUIDATION_THRESHOLD_BPS, BPS);
        debtAssets = debtQuoteAssets(account) + badDebtAssetsOf[account];
        healthFactorWad = debtAssets == 0 ? type(uint256).max : Math.mulDiv(liquidationThresholdAssets, WAD, debtAssets);
        liquidatable = debtSharesOf[account] > 0 && debtAssets > liquidationThresholdAssets;
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

    function syncOracle() external returns (bool accepted) {
        if (oracleDeviationHalted) revert OracleDeviationHalted();
        IIpoOnePriceOracleV1.PriceObservation memory observation = _readValidObservation();
        _validateObservationSequence(observation);
        if (_deviationExceeded(observation.priceUsdWad)) {
            oracleDeviationHalted = true;
            emit OracleDeviationHaltChanged(marketId, true, acceptedPriceUsdWad, observation.priceUsdWad, msg.sender);
            return false;
        }
        _storeAcceptedObservation(observation);
        return true;
    }

    function recoverOracleDeviation() external onlyRecoveryAuthority {
        if (!oracleDeviationHalted) revert ActionUnavailable();
        IIpoOnePriceOracleV1.PriceObservation memory observation = _readValidObservation();
        _validateObservationSequence(observation);
        uint256 previousPrice = acceptedPriceUsdWad;
        _storeAcceptedObservation(observation);
        oracleDeviationHalted = false;
        emit OracleDeviationHaltChanged(marketId, false, previousPrice, observation.priceUsdWad, msg.sender);
    }

    function accrueInterest()
        external
        returns (uint256 interestAssets, uint256 reserveAssets, uint256 chunks, bool caughtUp)
    {
        (interestAssets, reserveAssets, chunks) = _accrue(MAX_ACCRUAL_CHUNKS_PER_CALL);
        caughtUp = lastAccruedAt == block.timestamp;
    }

    function supply(uint256 amountAssets) external nonReentrant returns (uint256 sharesMinted) {
        if (amountAssets == 0) revert InvalidAmount();
        _accrueToCurrent();
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
        _accrueToCurrent();
        if (amountAssets > cashAssets || totalSupplyShares == 0) revert ActionUnavailable();
        sharesBurned = Math.mulDiv(amountAssets, totalSupplyShares, lpClaimAssets(), Math.Rounding.Ceil);
        if (sharesBurned == 0 || sharesBurned > supplySharesOf[msg.sender]) revert ActionUnavailable();

        cashAssets -= amountAssets;
        totalSupplyShares -= sharesBurned;
        supplySharesOf[msg.sender] -= sharesBurned;
        _pushExact(debtAsset, msg.sender, amountAssets);
        emit AssetsWithdrawn(marketId, msg.sender, amountAssets, sharesBurned, cashAssets, totalSupplyShares);
    }

    function redeemAll() external nonReentrant whenNewRiskActive returns (uint256 amountAssets) {
        _accrueToCurrent();
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
        _accrueToCurrent();
        _pullExact(collateralAsset, msg.sender, amountAssets);
        collateralAssetsOf[msg.sender] += amountAssets;
        emit CollateralAdded(marketId, msg.sender, amountAssets, collateralAssetsOf[msg.sender]);
    }

    function releaseCollateral(uint256 amountAssets) external nonReentrant whenNewRiskActive {
        if (amountAssets == 0 || amountAssets > collateralAssetsOf[msg.sender]) revert InvalidAmount();
        _accrueToCurrent();
        uint256 price = _refreshCurrentPrice();
        uint256 remainingCollateral = collateralAssetsOf[msg.sender] - amountAssets;
        uint256 capacity =
            Math.mulDiv(SecuredPoolMathV1.collateralValueAssets(remainingCollateral, price), loanToValueBps, BPS);
        if (debtQuoteAssets(msg.sender) + badDebtAssetsOf[msg.sender] > capacity) revert ActionUnavailable();

        collateralAssetsOf[msg.sender] = remainingCollateral;
        _pushExact(collateralAsset, msg.sender, amountAssets);
        emit CollateralReleased(marketId, msg.sender, amountAssets, remainingCollateral);
    }

    function borrow(uint256 amountAssets) external nonReentrant whenNewRiskActive returns (uint256 debtSharesMinted) {
        if (amountAssets == 0) revert InvalidAmount();
        _accrueToCurrent();
        if (badDebtAssetsOf[msg.sender] != 0 || amountAssets > cashAssets) revert ActionUnavailable();
        uint256 price = _refreshCurrentPrice();
        uint256 debtBefore = debtQuoteAssets(msg.sender);
        if (grossDebtAssets + amountAssets > marketDebtCapAssets) revert ActionUnavailable();
        if (debtBefore + amountAssets > borrowerDebtCapAssets) revert ActionUnavailable();
        uint256 capacity = Math.mulDiv(
            SecuredPoolMathV1.collateralValueAssets(collateralAssetsOf[msg.sender], price), loanToValueBps, BPS
        );
        if (debtBefore + amountAssets > capacity) revert ActionUnavailable();

        uint256 performingBefore = performingDebtAssets();
        debtSharesMinted = totalDebtShares == 0
            ? amountAssets
            : Math.mulDiv(amountAssets, totalDebtShares, performingBefore, Math.Rounding.Ceil);
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
        _accrueToCurrent();
        uint256 recognizedBadDebt = badDebtAssetsOf[msg.sender];
        if (recognizedBadDebt != 0) {
            if (debtSharesOf[msg.sender] != 0 || amountAssets > recognizedBadDebt) revert ActionUnavailable();
            _pullExact(debtAsset, msg.sender, amountAssets);
            cashAssets += amountAssets;
            grossDebtAssets -= amountAssets;
            badDebtAssets -= amountAssets;
            badDebtAssetsOf[msg.sender] -= amountAssets;
            emit BadDebtRecovered(
                marketId, msg.sender, msg.sender, amountAssets, badDebtAssetsOf[msg.sender], badDebtAssets
            );
            return (0, amountAssets, 0);
        }

        _pullExact(debtAsset, msg.sender, amountAssets);
        (debtSharesBurned, debtReducedAssets, reserveDustAssets) = _applyPerformingRepayment(msg.sender, amountAssets);
        emit AssetsRepaid(
            marketId,
            msg.sender,
            msg.sender,
            amountAssets,
            debtReducedAssets,
            debtSharesBurned,
            reserveDustAssets,
            debtQuoteAssets(msg.sender),
            cashAssets
        );
    }

    function liquidate(address borrower, uint256 repayAmountAssets, uint256 minCollateralOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 collateralSeizedAssets, uint256 badDebtRecognizedAssets)
    {
        if (borrower == address(0) || borrower == msg.sender || repayAmountAssets == 0 || block.timestamp > deadline) {
            revert InvalidAmount();
        }
        _accrueToCurrent();
        uint256 price = _refreshCurrentPrice();
        collateralSeizedAssets = _quoteLiquidation(borrower, repayAmountAssets, price);
        if (collateralSeizedAssets < minCollateralOut) revert ActionUnavailable();
        badDebtRecognizedAssets = _settleLiquidation(borrower, repayAmountAssets, collateralSeizedAssets);

        emit PositionLiquidated(
            marketId, borrower, msg.sender, repayAmountAssets, collateralSeizedAssets, badDebtRecognizedAssets
        );
    }

    function _quoteLiquidation(address borrower, uint256 repayAmountAssets, uint256 price)
        internal
        view
        returns (uint256 collateralSeizedAssets)
    {
        uint256 accountDebt = debtQuoteAssets(borrower);
        uint256 collateralValue = SecuredPoolMathV1.collateralValueAssets(collateralAssetsOf[borrower], price);
        uint256 liquidationThreshold = Math.mulDiv(collateralValue, LIQUIDATION_THRESHOLD_BPS, BPS);
        if (accountDebt == 0 || accountDebt <= liquidationThreshold) revert ActionUnavailable();

        uint256 closeLimit = Math.mulDiv(accountDebt, CLOSE_FACTOR_BPS, BPS);
        uint256 collateralCoverageLimit =
            Math.mulDiv(collateralValue, BPS, BPS + LIQUIDATION_BONUS_BPS, Math.Rounding.Ceil);
        uint256 repaymentLimit = Math.min(accountDebt, Math.min(closeLimit, collateralCoverageLimit));
        if (repayAmountAssets > repaymentLimit) revert ActionUnavailable();

        uint256 seizeValue = Math.mulDiv(repayAmountAssets, BPS + LIQUIDATION_BONUS_BPS, BPS, Math.Rounding.Ceil);
        collateralSeizedAssets =
            Math.min(collateralAssetsOf[borrower], SecuredPoolMathV1.collateralRequiredForValue(seizeValue, price));
        if (collateralSeizedAssets == 0) revert ActionUnavailable();
    }

    function _settleLiquidation(address borrower, uint256 repayAmountAssets, uint256 collateralSeizedAssets)
        internal
        returns (uint256 badDebtRecognizedAssets)
    {
        _pullExact(debtAsset, msg.sender, repayAmountAssets);
        (uint256 sharesBurned, uint256 debtReduced, uint256 reserveDust) =
            _applyPerformingRepayment(borrower, repayAmountAssets);
        collateralAssetsOf[borrower] -= collateralSeizedAssets;
        if (collateralAssetsOf[borrower] == 0 && debtSharesOf[borrower] != 0) {
            badDebtRecognizedAssets = _recognizeBadDebt(borrower);
        }
        _pushExact(collateralAsset, msg.sender, collateralSeizedAssets);

        emit AssetsRepaid(
            marketId,
            borrower,
            msg.sender,
            repayAmountAssets,
            debtReduced,
            sharesBurned,
            reserveDust,
            debtQuoteAssets(borrower),
            cashAssets
        );
    }

    function _applyPerformingRepayment(address account, uint256 amountAssets)
        internal
        returns (uint256 sharesBurned, uint256 debtReducedAssets, uint256 reserveDustAssets)
    {
        uint256 quotedDebt = debtQuoteAssets(account);
        if (quotedDebt == 0 || amountAssets > quotedDebt) revert ActionUnavailable();
        uint256 performing = performingDebtAssets();
        if (amountAssets == quotedDebt) {
            sharesBurned = debtSharesOf[account];
            debtReducedAssets = amountAssets;
        } else {
            sharesBurned = Math.mulDiv(amountAssets, totalDebtShares, performing);
            if (sharesBurned == 0) revert ActionUnavailable();
            debtReducedAssets = Math.mulDiv(sharesBurned, performing, totalDebtShares, Math.Rounding.Ceil);
        }
        reserveDustAssets = amountAssets - debtReducedAssets;
        cashAssets += amountAssets;
        grossDebtAssets -= debtReducedAssets;
        reservesAssets += reserveDustAssets;
        totalDebtShares -= sharesBurned;
        debtSharesOf[account] -= sharesBurned;
    }

    function _recognizeBadDebt(address account) internal returns (uint256 recognizedAssets) {
        recognizedAssets = debtQuoteAssets(account);
        if (recognizedAssets == 0 || collateralAssetsOf[account] != 0) revert ActionUnavailable();
        totalDebtShares -= debtSharesOf[account];
        debtSharesOf[account] = 0;
        badDebtAssets += recognizedAssets;
        badDebtAssetsOf[account] += recognizedAssets;
    }

    function _accrueToCurrent() internal {
        _accrue(MAX_ACCRUAL_CHUNKS_PER_CALL);
        if (lastAccruedAt != block.timestamp) revert AccrualCatchUpRequired();
    }

    function _accrue(uint256 maxChunks)
        internal
        returns (uint256 interestAssets, uint256 reserveAssets, uint256 chunks)
    {
        if (block.timestamp < lastAccruedAt) {
            revert ActionUnavailable();
        }
        uint256 fromTimestamp = lastAccruedAt;
        uint256 performing = performingDebtAssets();
        if (performing == 0) {
            lastAccruedAt = block.timestamp;
        } else {
            while (lastAccruedAt < block.timestamp && chunks < maxChunks) {
                uint256 elapsed = Math.min(block.timestamp - lastAccruedAt, MAX_ACCRUAL_CHUNK_SECONDS);
                uint256 apr = SecuredPoolMathV1.borrowAprBps(cashAssets, performing);
                (uint256 chunkInterest, uint256 chunkReserve) =
                    SecuredPoolMathV1.interestAtRate(performing, apr, elapsed);
                grossDebtAssets += chunkInterest;
                reservesAssets += chunkReserve;
                interestAssets += chunkInterest;
                reserveAssets += chunkReserve;
                performing += chunkInterest;
                lastAccruedAt += elapsed;
                chunks++;
            }
        }
        if (lastAccruedAt != fromTimestamp) {
            emit InterestAccrued(marketId, fromTimestamp, lastAccruedAt, chunks, interestAssets, reserveAssets);
        }
    }

    function _refreshCurrentPrice() internal returns (uint256 priceUsdWad) {
        if (oracleDeviationHalted) revert OracleDeviationHalted();
        IIpoOnePriceOracleV1.PriceObservation memory observation = _readValidObservation();
        _validateObservationSequence(observation);
        if (_deviationExceeded(observation.priceUsdWad)) revert OracleDeviationExceeded();
        if (
            observation.observedAt != acceptedOracleObservedAt || observation.roundId != acceptedOracleRoundId
                || observation.priceUsdWad != acceptedPriceUsdWad
        ) _storeAcceptedObservation(observation);
        return observation.priceUsdWad;
    }

    function _previewCurrentPrice() internal view returns (uint256 priceUsdWad) {
        if (oracleDeviationHalted) revert OracleDeviationHalted();
        IIpoOnePriceOracleV1.PriceObservation memory observation = _readValidObservation();
        _validateObservationSequence(observation);
        if (_deviationExceeded(observation.priceUsdWad)) revert OracleDeviationExceeded();
        return observation.priceUsdWad;
    }

    function _readValidObservation() internal view returns (IIpoOnePriceOracleV1.PriceObservation memory observation) {
        observation = priceOracle.latestPrice();
        _validateObservationBinding(observation, oracleSourceId);
    }

    function _validateObservationBinding(
        IIpoOnePriceOracleV1.PriceObservation memory observation,
        bytes32 expectedSourceId
    ) internal view {
        if (
            !observation.complete || observation.priceUsdWad == 0 || observation.observedAt == 0
                || observation.roundId == 0 || observation.sourceId == bytes32(0)
                || (expectedSourceId != bytes32(0) && observation.sourceId != expectedSourceId)
                || observation.asset != address(collateralAsset) || observation.marketChainId != marketChainId
                || uint256(observation.observedAt) > block.timestamp + MAX_ORACLE_FUTURE_SKEW_SECONDS
                || (block.timestamp > observation.observedAt
                    && block.timestamp - uint256(observation.observedAt) > MAX_ORACLE_AGE_SECONDS)
        ) revert InvalidOracleObservation();
    }

    function _validateObservationSequence(IIpoOnePriceOracleV1.PriceObservation memory observation) internal view {
        if (
            observation.observedAt < acceptedOracleObservedAt || observation.roundId < acceptedOracleRoundId
                || (observation.observedAt == acceptedOracleObservedAt
                    && (observation.roundId != acceptedOracleRoundId || observation.priceUsdWad != acceptedPriceUsdWad))
                || (observation.roundId == acceptedOracleRoundId
                    && (observation.observedAt != acceptedOracleObservedAt
                        || observation.priceUsdWad != acceptedPriceUsdWad))
        ) revert InvalidOracleObservation();
    }

    function _deviationExceeded(uint256 candidatePriceUsdWad) internal view returns (bool) {
        uint256 difference = candidatePriceUsdWad > acceptedPriceUsdWad
            ? candidatePriceUsdWad - acceptedPriceUsdWad
            : acceptedPriceUsdWad - candidatePriceUsdWad;
        return Math.mulDiv(difference, BPS, acceptedPriceUsdWad, Math.Rounding.Ceil) > MAX_ORACLE_DEVIATION_BPS;
    }

    function _storeAcceptedObservation(IIpoOnePriceOracleV1.PriceObservation memory observation) internal {
        acceptedPriceUsdWad = observation.priceUsdWad;
        acceptedOracleObservedAt = observation.observedAt;
        acceptedOracleRoundId = observation.roundId;
        emit OracleObservationAccepted(
            marketId, observation.sourceId, observation.roundId, observation.priceUsdWad, observation.observedAt
        );
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
