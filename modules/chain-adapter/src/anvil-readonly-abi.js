import { parseAbi } from "viem";

// ABI fragments derived from Acronym Foundation's ISC-licensed contracts.
// Copyright (c) 2024, Acronym Foundation. See ANVIL_001_READONLY_EVIDENCE.md
// for the full upstream permission notice. No SDK code is included.
export const ANVIL_SOURCE_REVISION = "ced9166b130ad2bbe901070a7a50421090e06eb2";
export const ANVIL_ABI_VERSION = "anvil.loc.3.0.0.readonly.v1";
export const ANVIL_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export const ANVIL_READ_ABI = parseAbi([
  "function getLOC(uint96 id) view returns ((uint96 collateralId, address creator, address beneficiary, uint32 expirationTimestamp, uint16 collateralFactorBasisPoints, uint16 liquidatorIncentiveBasisPoints, address collateralContract, address collateralTokenAddress, uint256 collateralTokenAmount, uint256 claimableCollateral, address creditedTokenAddress, uint256 creditedTokenAmount))"
]);

export const ANVIL_EVENT_ABI = parseAbi([
  "event LOCCreatedV3(address indexed creator, address indexed beneficiary, bytes tag, address collateralContractAddress, address collateralTokenAddress, uint256 collateralTokenAmount, uint256 claimableCollateral, uint32 expirationTimestamp, address creditedTokenAddress, uint256 creditedTokenAmount, uint96 id, uint96 collateralId)",
  "event LOCCanceled(uint96 indexed id)",
  "event LOCExtended(uint96 indexed id, uint32 oldExpirationTimestamp, uint32 newExpirationTimestamp)",
  "event LOCConverted(uint96 indexed id, address indexed initiator, address indexed liquidator, uint256 liquidationAmount, uint256 liquidationFeeAmount, uint256 creditedTokenAmountReceived)",
  "event LOCPartiallyLiquidated(uint96 indexed id, address indexed initiator, address indexed liquidator, uint256 liquidationAmount, uint256 liquidationFeeAmount, uint256 creditedTokenAmountReceived)",
  "event LOCRedeemed(uint96 indexed id, address indexed destinationAddress, uint256 creditedTokenAmount, uint256 collateralTokenAmountUsed, uint256 claimableCollateralUsed)",
  "event LOCCollateralModified(uint96 indexed id, uint256 oldCollateralAmount, uint256 newCollateralAmount, uint256 newClaimableCollateral)"
]);
